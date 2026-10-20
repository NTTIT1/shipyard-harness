#!/usr/bin/env python3
"""Shipyard → OpenHands SDK runner (runs INSIDE the sandbox container; see bin/openhands-step.sh).

Reads the task from /shipyard-run/task.md and the project's AI-team rules from
/shipyard-run/rules.md, lets an OpenHands agent (terminal + file editor + task tracker,
no browser) work in /workspace (= the lane clone), and writes /shipyard-run/result.json:

  {"status": "finished|stuck|error|max_iterations", "final": "...", "iterations": n,
   "tokens": {"in": .., "out": .., "cacheRead": .., "cacheWrite": ..}, "usd": ..}

The LLM is reached through the harness LiteLLM gateway (LLM_BASE_URL, LLM_API_KEY = gateway key,
LLM_MODEL = gateway alias such as "anthropic/claude-sonnet-5-5"). Exit: 0 finished · 3 stuck or
out of iterations · 1 error.
"""
import json
import os
import pathlib
import sys
import traceback

RUN = pathlib.Path(os.environ.get("SHIPYARD_RUN_DIR", "/shipyard-run"))
WORKSPACE = os.environ.get("SHIPYARD_WORKSPACE", "/workspace")


def write_result(**kw):
    (RUN / "result.json").write_text(json.dumps(kw, ensure_ascii=False, indent=2))


def main() -> int:
    from openhands.sdk import LLM, Agent, AgentContext, Conversation
    from openhands.sdk.context.condenser import LLMSummarizingCondenser
    from openhands.sdk.conversation.response_utils import get_agent_final_response
    from openhands.tools.preset.default import get_default_tools

    task = (RUN / "task.md").read_text(encoding="utf-8")
    rules_file = RUN / "rules.md"
    rules = rules_file.read_text(encoding="utf-8").strip() if rules_file.is_file() else ""
    max_iter = int(os.environ.get("OH_MAX_ITERATIONS", "120"))

    llm = LLM(
        usage_id="agent",
        # litellm_proxy/<alias>: the gateway decides the real provider (Claude via Anthropic API).
        model=f"litellm_proxy/{os.environ['LLM_MODEL']}",
        base_url=os.environ["LLM_BASE_URL"],
        api_key=os.environ["LLM_API_KEY"],
        num_retries=int(os.environ.get("OH_LLM_RETRIES", "4")),
    )
    context = AgentContext(
        # Approved project rules are binding, exactly as for the Claude roles (bin/team_rules.py).
        system_message_suffix=rules or None,
        load_public_skills=False,   # no network fetch of community skills inside the sandbox
        load_user_skills=False,
        load_project_skills=False,  # rules already come from the approved integration branch
    )
    agent = Agent(
        llm=llm,
        tools=get_default_tools(enable_browser=False),
        agent_context=context,
        condenser=LLMSummarizingCondenser(llm=llm.model_copy(update={"usage_id": "condenser"}),
                                          max_size=80, keep_first=4),
    )
    conversation = Conversation(
        agent=agent,
        workspace=WORKSPACE,
        persistence_dir=str(RUN / "conversation"),
        max_iteration_per_run=max_iter,
        stuck_detection=True,
        visualizer=None,
    )
    conversation.send_message(task)
    conversation.run()

    state = conversation.state
    status = getattr(state.execution_status, "value", str(state.execution_status))
    final = get_agent_final_response(state.events) or ""
    metrics = conversation.conversation_stats.get_combined_metrics()
    usage = metrics.accumulated_token_usage
    iterations = sum(1 for e in state.events if type(e).__name__ == "ActionEvent")
    if status not in ("finished", "stuck", "error"):
        status = "max_iterations"   # run() returned without the agent calling finish
    write_result(
        status=status, final=final[:4000], iterations=iterations,
        tokens={
            "in": getattr(usage, "prompt_tokens", 0) or 0,
            "out": getattr(usage, "completion_tokens", 0) or 0,
            "cacheRead": getattr(usage, "cache_read_tokens", 0) or 0,
            "cacheWrite": getattr(usage, "cache_write_tokens", 0) or 0,
        },
        usd=round(float(metrics.accumulated_cost or 0), 6),
    )
    conversation.close()
    return 0 if status == "finished" else 3


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # report, never hang the lane
        traceback.print_exc()
        write_result(status="error", final=f"{type(e).__name__}: {e}"[:2000], iterations=0,
                     tokens={"in": 0, "out": 0, "cacheRead": 0, "cacheWrite": 0}, usd=0)
        sys.exit(1)

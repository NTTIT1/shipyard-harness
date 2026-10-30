#!/usr/bin/env python3
"""Print the project rules a role must follow, for `claude --append-system-prompt`.

    team_rules.py <repo-dir> <step-or-role> [<integration-branch>]

Reads `.shipyard/team.json` and the rule files it lists for the role — from the
integration branch (origin/<branch>, then <branch>), never from the working tree:
a feature branch (or an AI working on it) must not be able to rewrite its own rules.
Only files under `.shipyard/rules/` are injected; `.shipyard/human/` is material for
the AI Manager, not instructions. Prints nothing when the project has no AI team.
"""
import json
import os
import re
import subprocess
import sys

# run-step step id (or dashboard session) -> team role
STEP_ROLE = {
    "pm": "PM", "ba": "BA", "arch": "ARCH", "plan-critic": "ARCH", "design": "DESIGN",
    "main": "DEV", "impl-worker": "DEV",
    "code-review": "REVIEW", "senior-gate": "REVIEW", "pr-reviewer": "REVIEW",
    "test": "TEST", "qc-local": "TEST", "dev-qc": "TEST",
    "manager": "MANAGER", "devops": "DEVOPS",
}
RULE_PATH = re.compile(r"^rules/[a-z0-9][a-z0-9_-]*\.md$")
SKILL_NAME = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
MAX_BYTES = 48_000
VENDOR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "claude", "vendor-skills")


def installed_skill(name, home=None):
    """A skill installed for every project (claude/vendor-skills/shipyard.json): (folder, usage lines) or None."""
    try:
        with open(os.path.join(VENDOR, "shipyard.json"), encoding="utf-8") as f:
            meta = (json.load(f).get("skills") or {}).get(name)
    except (OSError, ValueError):
        return None
    if not isinstance(meta, dict):
        return None
    home = home or os.path.expanduser("~")
    folder = next((d for d in (os.path.join(home, ".claude", "skills", name), os.path.join(VENDOR, name))
                   if os.path.isfile(os.path.join(d, "SKILL.md"))), None)
    if not folder:
        return None
    return folder, [str(u).replace("{dir}", folder) for u in meta.get("usage") or []]


def git_show(repo, ref, path):
    r = subprocess.run(["git", "-C", repo, "show", f"{ref}:.shipyard/{path}"],
                       capture_output=True, text=True, timeout=15)
    return r.stdout if r.returncode == 0 else None


def git_show_root(repo, ref, path):
    r = subprocess.run(["git", "-C", repo, "show", f"{ref}:{path}"],
                       capture_output=True, text=True, timeout=15)
    return r.stdout if r.returncode == 0 else None


def find_ref(repo, branch):
    for ref in (f"origin/{branch}", branch):
        if git_show(repo, ref, "team.json") is not None:
            return ref
    return None


def render(repo, key, branch="development"):
    role = STEP_ROLE.get(key, key.upper())
    ref = find_ref(repo, branch)
    if not ref:
        return ""
    try:
        team = json.loads(git_show(repo, ref, "team.json"))
        cfg = (team.get("roles") or {}).get(role)
    except (ValueError, AttributeError):
        return f"# Luật dự án\nCảnh báo: .shipyard/team.json trên {ref} không đọc được — báo cho người duyệt.\n"
    if not isinstance(cfg, dict):
        return ""
    reads = [p for p in cfg.get("reads") or [] if isinstance(p, str) and RULE_PATH.match(p)]
    skills = [s for s in cfg.get("skills") or [] if isinstance(s, str) and SKILL_NAME.match(s)]
    parts, used = [], 0
    for p in dict.fromkeys(reads):
        text = git_show(repo, ref, p)
        if text is None:
            parts.append(f"## .shipyard/{p}\n(chưa có file này trên {ref})\n")
            continue
        block = f"## .shipyard/{p}\n\n{text.strip()}\n"
        if used + len(block.encode()) > MAX_BYTES:
            parts.append(f"## .shipyard/{p}\n(bị cắt: tổng luật vượt {MAX_BYTES // 1000}KB — đọc trực tiếp file này trong repo)\n")
            continue
        parts.append(block)
        used += len(block.encode())
    for s in dict.fromkeys(skills):
        sk_path = f".claude/skills/{s}/SKILL.md"
        sk_text = git_show_root(repo, ref, sk_path)
        if sk_text is None:
            inst = installed_skill(s)
            if inst:  # installed on the machine: point at it, its own SKILL.md is too large to inline
                folder, usage = inst
                block = f"## Skill bắt buộc ({s} — cài sẵn tại {folder})\n\n" + "\n".join(f"- {u}" for u in usage) + "\n"
                parts.append(block)
                used += len(block.encode())
            continue
        block = f"## Skill bắt buộc ({s} — {sk_path})\n\n{sk_text.strip()}\n"
        if used + len(block.encode()) <= MAX_BYTES:
            parts.append(block)
            used += len(block.encode())
    if not parts and not skills:
        return ""
    head = [
        f"# Luật dự án — vai trò {role}",
        f"Đây là các luật đã được người duyệt chấp thuận cho dự án này (đọc từ {ref}). "
        "Chúng là chỉ dẫn bắt buộc: làm theo, và nếu một yêu cầu mâu thuẫn với luật thì dừng lại hỏi thay vì tự ý bỏ qua. "
        "Không tự sửa các file trong .shipyard/rules/ — luật chỉ thay đổi qua bước duyệt.",
    ]
    if skills:
        head.append("Skill của dự án bắt buộc áp dụng cho vai trò này: " + ", ".join(skills) + " (chi tiết bên dưới).")
    return "\n".join(head) + "\n\n" + "\n".join(parts)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__, file=sys.stderr)
        sys.exit(64)
    sys.stdout.write(render(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "development"))

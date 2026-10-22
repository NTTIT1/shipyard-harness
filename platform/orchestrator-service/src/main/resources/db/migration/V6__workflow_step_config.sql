-- Per-step settings of a project's workflow (model, retries, timeout, budget, condition, on-failure,
-- required inputs), frozen into each run; and whether a submitted step reported a failed check.
ALTER TABLE gate_policies ADD COLUMN config JSONB;
ALTER TABLE runs ADD COLUMN step_config JSONB;
ALTER TABLE run_steps ADD COLUMN reported_failure BOOLEAN NOT NULL DEFAULT FALSE;

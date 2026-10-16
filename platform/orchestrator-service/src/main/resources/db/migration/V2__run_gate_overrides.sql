-- Per-feature gate choices made at assignment time (step -> REQUIRED|AUTO); they win over the project policy.
ALTER TABLE runs ADD COLUMN gate_overrides JSONB;

-- Configurable feature workflow: each project orders its steps and may leave some out (mode SKIP);
-- a run freezes the order it was created with.
ALTER TABLE gate_policies ADD COLUMN position INT;
ALTER TABLE runs ADD COLUMN workflow JSONB;

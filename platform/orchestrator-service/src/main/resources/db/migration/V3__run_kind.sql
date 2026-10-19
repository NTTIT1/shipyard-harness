-- SETUP runs carry the single MANAGER step (project AI-team rules); everything else is a FEATURE run.
ALTER TABLE runs ADD COLUMN kind VARCHAR(20) NOT NULL DEFAULT 'FEATURE';
CREATE INDEX idx_runs_project_kind ON runs (project_id, kind);

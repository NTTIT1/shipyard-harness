-- What happens after the code is done, per project (PR base, who merges, deploy wait, QC on the test
-- environment, ticket), frozen into each run like the step settings. No row = the lane profile decides.
CREATE TABLE delivery_policies (
    project_id VARCHAR(64) PRIMARY KEY,
    config     JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE runs ADD COLUMN delivery_config JSONB;

CREATE TABLE runs (
    id           VARCHAR(40) PRIMARY KEY,
    project_id   VARCHAR(40)  NOT NULL,
    lane_ref     VARCHAR(120) NOT NULL,
    title        VARCHAR(200) NOT NULL,
    description  TEXT         NOT NULL,
    current_step VARCHAR(20),
    status       VARCHAR(20)  NOT NULL,
    has_ui       BOOLEAN,
    created_by   VARCHAR(40)  NOT NULL,
    version      BIGINT       NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_runs_project ON runs (project_id, created_at DESC);

CREATE TABLE run_steps (
    run_id           VARCHAR(40) NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
    step             VARCHAR(20) NOT NULL,
    status           VARCHAR(20) NOT NULL,
    current_revision INT         NOT NULL DEFAULT 0,
    skip_reason      VARCHAR(200),
    pending_feedback TEXT,
    pending_edits    JSONB,
    PRIMARY KEY (run_id, step)
);

CREATE TABLE step_revisions (
    id                 VARCHAR(40) PRIMARY KEY,
    run_id             VARCHAR(40) NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
    step               VARCHAR(20) NOT NULL,
    revision_no        INT         NOT NULL,
    summary            TEXT        NOT NULL,
    documents          JSONB       NOT NULL,
    images             JSONB       NOT NULL,
    meta               JSONB       NOT NULL,
    context_used       JSONB       NOT NULL,
    approved_documents JSONB,
    submitted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (run_id, step, revision_no)
);

CREATE TABLE approval_requests (
    id               VARCHAR(40) PRIMARY KEY,
    run_id           VARCHAR(40) NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
    step             VARCHAR(20) NOT NULL,
    revision_id      VARCHAR(40) NOT NULL REFERENCES step_revisions (id) ON DELETE CASCADE,
    project_id       VARCHAR(40) NOT NULL,
    required_role    VARCHAR(20) NOT NULL,
    status           VARCHAR(20) NOT NULL,
    decided_by       VARCHAR(40),
    decided_as_role  VARCHAR(20),
    feedback_text    TEXT,
    edited_documents JSONB,
    send_back_to     VARCHAR(20),
    has_ui_override  BOOLEAN,
    decided_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    version          BIGINT      NOT NULL DEFAULT 0
);
CREATE INDEX idx_approvals_pending ON approval_requests (project_id) WHERE status = 'PENDING';
CREATE INDEX idx_approvals_run ON approval_requests (run_id);

CREATE TABLE gate_policies (
    project_id VARCHAR(40) NOT NULL,
    step       VARCHAR(20) NOT NULL,
    mode       VARCHAR(20) NOT NULL,
    PRIMARY KEY (project_id, step)
);

CREATE TABLE outbox_events (
    id              BIGSERIAL PRIMARY KEY,
    event_id        VARCHAR(40) NOT NULL UNIQUE,
    type            VARCHAR(40) NOT NULL,
    payload         JSONB       NOT NULL,
    attempts        INT         NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at         TIMESTAMPTZ,
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_outbox_due ON outbox_events (next_attempt_at) WHERE sent_at IS NULL;

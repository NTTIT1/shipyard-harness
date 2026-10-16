CREATE EXTENSION IF NOT EXISTS vector;

-- Outbox delivery is at-least-once; an eventId is applied once.
CREATE TABLE processed_events (
    event_id     VARCHAR(40) PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memory_items (
    id            VARCHAR(40) PRIMARY KEY,
    project_id    VARCHAR(40)  NOT NULL,
    kind          VARCHAR(20)  NOT NULL,
    run_id        VARCHAR(40),
    step          VARCHAR(20),
    title         VARCHAR(300) NOT NULL,
    content       TEXT         NOT NULL,
    source_ref    VARCHAR(300),
    superseded_by VARCHAR(40),
    disabled      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_items_project ON memory_items (project_id, kind);
CREATE INDEX idx_items_source ON memory_items (project_id, source_ref) WHERE superseded_by IS NULL;

CREATE TABLE memory_chunks (
    id              BIGSERIAL PRIMARY KEY,
    item_id         VARCHAR(40) NOT NULL REFERENCES memory_items (id) ON DELETE CASCADE,
    project_id      VARCHAR(40) NOT NULL,
    chunk_no        INT         NOT NULL,
    text            TEXT        NOT NULL,
    tsv             TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', text)) STORED,
    embedding       VECTOR(1024),
    embedding_model VARCHAR(60),
    embed_status    VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    attempts        INT         NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error      TEXT
);
CREATE INDEX idx_chunks_embedding ON memory_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_chunks_tsv ON memory_chunks USING gin (tsv);
CREATE INDEX idx_chunks_pending ON memory_chunks (next_attempt_at) WHERE embed_status = 'PENDING';
CREATE INDEX idx_chunks_item ON memory_chunks (item_id);

CREATE TABLE memory_entities (
    id         BIGSERIAL PRIMARY KEY,
    project_id VARCHAR(40)  NOT NULL,
    type       VARCHAR(20)  NOT NULL,
    key        VARCHAR(300) NOT NULL,
    name       VARCHAR(300) NOT NULL,
    UNIQUE (project_id, type, key)
);

CREATE TABLE memory_edges (
    id             BIGSERIAL PRIMARY KEY,
    project_id     VARCHAR(40) NOT NULL,
    from_id        BIGINT      NOT NULL REFERENCES memory_entities (id) ON DELETE CASCADE,
    to_id          BIGINT      NOT NULL REFERENCES memory_entities (id) ON DELETE CASCADE,
    type           VARCHAR(20) NOT NULL,
    source_item_id VARCHAR(40) NOT NULL REFERENCES memory_items (id) ON DELETE CASCADE,
    UNIQUE (from_id, to_id, type, source_item_id)
);
CREATE INDEX idx_edges_from ON memory_edges (from_id);
CREATE INDEX idx_edges_to ON memory_edges (to_id);
CREATE INDEX idx_edges_source ON memory_edges (source_item_id);

-- Outbox events can arrive out of order (per-event backoff): keep the revision so an
-- older approval delivered late never supersedes a newer one.
ALTER TABLE memory_items ADD COLUMN revision_no INT;

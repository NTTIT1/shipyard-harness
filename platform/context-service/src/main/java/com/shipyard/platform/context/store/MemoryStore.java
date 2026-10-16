package com.shipyard.platform.context.store;

import com.shipyard.platform.context.embedding.Vectors;
import com.shipyard.platform.context.text.Chunker;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.*;

/** All SQL of the memory store. Every read is scoped to one project and skips disabled/superseded items. */
@Repository
public class MemoryStore {
    private final JdbcClient db;

    public MemoryStore(JdbcClient db) { this.db = db; }

    public record NewItem(String projectId, String kind, String runId, String step, String title, String content, String sourceRef,
                          Integer revisionNo) {
        public NewItem(String projectId, String kind, String runId, String step, String title, String content, String sourceRef) {
            this(projectId, kind, runId, step, title, content, sourceRef, null);
        }
    }

    public record ItemRow(String id, String projectId, String kind, String runId, String step, String title, String content,
                          String sourceRef, String supersededBy, boolean disabled, Instant createdAt) {}

    public record ChunkHit(long chunkId, String itemId, String text, String kind, String title, String runId, String step, double score) {}

    public record PendingChunk(long id, String text) {}

    public record Neighbor(String edgeType, String direction, String entityType, String entityKey, String entityName,
                           String sourceItemId, String sourceTitle) {}

    private static final String ITEM_COLS = "i.id, i.project_id, i.kind, i.run_id, i.step, i.title, i.content, i.source_ref, i.superseded_by, i.disabled, i.created_at";
    private static final RowMapper<ItemRow> ITEM = (rs, n) -> new ItemRow(rs.getString(1), rs.getString(2), rs.getString(3),
            rs.getString(4), rs.getString(5), rs.getString(6), rs.getString(7), rs.getString(8), rs.getString(9),
            rs.getBoolean(10), rs.getTimestamp(11).toInstant());
    private static final RowMapper<ChunkHit> HIT = (rs, n) -> new ChunkHit(rs.getLong(1), rs.getString(2), rs.getString(3),
            rs.getString(4), rs.getString(5), rs.getString(6), rs.getString(7), rs.getDouble(8));
    private static final String ACTIVE_CHUNKS = " from memory_chunks c join memory_items i on i.id = c.item_id"
            + " where i.project_id = :p and not i.disabled and i.superseded_by is null";

    // ---- ingest ----

    /** True the first time an eventId is seen. */
    public boolean markProcessed(String eventId) {
        return db.sql("insert into processed_events (event_id) values (:id) on conflict do nothing").param("id", eventId).update() == 1;
    }

    /**
     * Inserts an item; an older active item with the same sourceRef becomes superseded by it —
     * unless that one has a higher revision (a late, out-of-order delivery): then the new row
     * is stored already superseded.
     */
    public String insertItem(NewItem n) {
        String id = "mem_" + UUID.randomUUID().toString().replace("-", "").substring(0, 20);
        String newerId = null;
        if (n.sourceRef() != null && n.revisionNo() != null) {
            newerId = db.sql("select id from memory_items where project_id = :p and source_ref = :ref and superseded_by is null"
                            + " and revision_no is not null and revision_no > :rev order by revision_no desc limit 1")
                    .param("p", n.projectId()).param("ref", n.sourceRef()).param("rev", n.revisionNo())
                    .query(String.class).optional().orElse(null);
        }
        db.sql("""
                insert into memory_items (id, project_id, kind, run_id, step, title, content, source_ref, revision_no, superseded_by)
                values (:id, :p, :k, :r, :s, :t, :c, :ref, :rev, :sup)""")
                .param("id", id).param("p", n.projectId()).param("k", n.kind()).param("r", n.runId())
                .param("s", n.step()).param("t", truncate(n.title(), 300)).param("c", n.content())
                .param("ref", n.sourceRef()).param("rev", n.revisionNo(), java.sql.Types.INTEGER)
                .param("sup", newerId, java.sql.Types.VARCHAR).update();
        if (n.sourceRef() != null && newerId == null) {
            db.sql("update memory_items set superseded_by = :id where project_id = :p and source_ref = :ref and superseded_by is null and id <> :id")
                    .param("id", id).param("p", n.projectId()).param("ref", n.sourceRef()).update();
        }
        return id;
    }

    public void insertChunks(String itemId, String projectId, List<Chunker.Chunk> chunks) {
        for (Chunker.Chunk c : chunks) {
            db.sql("insert into memory_chunks (item_id, project_id, chunk_no, text) values (:i, :p, :n, :t)")
                    .param("i", itemId).param("p", projectId).param("n", c.no()).param("t", c.text()).update();
        }
    }

    public long upsertEntity(String projectId, String type, String key, String name) {
        return db.sql("""
                insert into memory_entities (project_id, type, key, name) values (:p, :t, :k, :n)
                on conflict (project_id, type, key) do update set name = excluded.name returning id""")
                .param("p", projectId).param("t", type).param("k", truncate(key, 300)).param("n", truncate(name, 300))
                .query(Long.class).single();
    }

    public void insertEdge(String projectId, long fromId, long toId, String type, String sourceItemId) {
        db.sql("insert into memory_edges (project_id, from_id, to_id, type, source_item_id) values (:p, :f, :t, :ty, :s) on conflict do nothing")
                .param("p", projectId).param("f", fromId).param("t", toId).param("ty", type).param("s", sourceItemId).update();
    }

    // ---- embedding worker ----

    public List<PendingChunk> duePending(int limit) {
        return db.sql("select id, text from memory_chunks where embed_status = 'PENDING' and next_attempt_at <= now() order by id limit :l")
                .param("l", limit).query((rs, n) -> new PendingChunk(rs.getLong(1), rs.getString(2))).list();
    }

    public void saveEmbedding(long chunkId, float[] vector, String model) {
        db.sql("update memory_chunks set embedding = cast(:v as vector), embed_status = 'EMBEDDED', embedding_model = :m, last_error = null where id = :id")
                .param("v", Vectors.literal(vector)).param("m", model).param("id", chunkId).update();
    }

    /** Reschedules a chunk; countAttempt=false for a down backend (doesn't burn retries). FAILED after maxAttempts. */
    public void embedFailed(long chunkId, String error, boolean countAttempt, int retryInSeconds, int maxAttempts) {
        db.sql("""
                update memory_chunks set last_error = :e, attempts = attempts + :inc,
                    next_attempt_at = now() + make_interval(secs => :sec),
                    embed_status = case when attempts + :inc >= :max then 'FAILED' else 'PENDING' end
                where id = :id""")
                .param("e", truncate(error, 1000)).param("inc", countAttempt ? 1 : 0).param("sec", (double) retryInSeconds)
                .param("max", maxAttempts).param("id", chunkId).update();
    }

    // ---- search ----

    /**
     * HNSW + WHERE filters: without iterative scan pgvector takes the first ef_search (40) neighbours
     * across ALL projects and filters afterwards — a small project or a rare kind comes back empty.
     */
    @org.springframework.transaction.annotation.Transactional
    public List<ChunkHit> vectorSearch(String projectId, float[] q, Collection<String> kinds, String step, String excludeRunId,
                                       double minScore, int limit) {
        Map<String, Object> params = new HashMap<>(Map.of("p", projectId, "q", Vectors.literal(q), "l", limit, "min", minScore));
        StringBuilder sql = new StringBuilder("select c.id, c.item_id, c.text, i.kind, i.title, i.run_id, i.step,"
                + " 1 - (c.embedding <=> cast(:q as vector)) as score").append(ACTIVE_CHUNKS)
                .append(" and c.embed_status = 'EMBEDDED' and 1 - (c.embedding <=> cast(:q as vector)) > :min");
        filters(sql, params, kinds, step, excludeRunId);
        sql.append(" order by c.embedding <=> cast(:q as vector) limit :l");
        db.sql("SET LOCAL hnsw.iterative_scan = relaxed_order").update();
        db.sql("SET LOCAL hnsw.ef_search = 200").update();
        return db.sql(sql.toString()).params(params).query(HIT).list();
    }

    public List<ChunkHit> keywordSearch(String projectId, String tsquery, Collection<String> kinds, String step, String excludeRunId, int limit) {
        Map<String, Object> params = new HashMap<>(Map.of("p", projectId, "tq", tsquery, "l", limit));
        StringBuilder sql = new StringBuilder("select c.id, c.item_id, c.text, i.kind, i.title, i.run_id, i.step,"
                + " ts_rank(c.tsv, to_tsquery('simple', :tq)) as score").append(ACTIVE_CHUNKS)
                .append(" and c.tsv @@ to_tsquery('simple', :tq)");
        filters(sql, params, kinds, step, excludeRunId);
        sql.append(" order by score desc limit :l");
        return db.sql(sql.toString()).params(params).query(HIT).list();
    }

    // ---- graph ----

    /** Non-FEATURE entities whose key (≥ 3 chars) appears in the text. */
    public Set<Long> entitiesMentioned(String projectId, String text) {
        return new HashSet<>(db.sql("select id from memory_entities where project_id = :p and type <> 'FEATURE'"
                        + " and length(key) >= 3 and position(key in lower(:t)) > 0")
                .param("p", projectId).param("t", text == null ? "" : text).query(Long.class).list());
    }

    /** Non-FEATURE entities on edges sourced by these items. */
    public Set<Long> entitiesOfItems(Collection<String> itemIds) {
        if (itemIds.isEmpty()) return Set.of();
        return new HashSet<>(db.sql("select e.id from memory_entities e join memory_edges g on g.from_id = e.id or g.to_id = e.id"
                        + " where g.source_item_id in (:ids) and e.type <> 'FEATURE'")
                .param("ids", itemIds).query(Long.class).list());
    }

    /** Active items that sourced an edge touching these entities, plus the feature summaries of those runs. */
    public List<ItemRow> relatedItems(String projectId, Set<Long> entityIds, Collection<String> excludeItemIds,
                                      Collection<String> kinds, String excludeRunId, int limit) {
        if (entityIds.isEmpty()) return List.of();
        Map<String, Object> params = new HashMap<>(Map.of("p", projectId, "e", entityIds, "l", limit));
        StringBuilder sql = new StringBuilder("select ").append(ITEM_COLS).append(" from memory_items i where i.project_id = :p"
                + " and not i.disabled and i.superseded_by is null and ("
                + " i.id in (select source_item_id from memory_edges where from_id in (:e) or to_id in (:e))"
                + " or (i.kind = 'FEATURE_SUMMARY' and i.run_id in (select m.run_id from memory_items m"
                + "     join memory_edges g on g.source_item_id = m.id where g.from_id in (:e) or g.to_id in (:e))))");
        if (!excludeItemIds.isEmpty()) {
            sql.append(" and i.id not in (:x)");
            params.put("x", excludeItemIds);
        }
        filters(sql, params, kinds, null, excludeRunId);
        sql.append(" order by i.created_at desc limit :l");
        return db.sql(sql.toString()).params(params).query(ITEM).list();
    }

    public List<Neighbor> neighbors(String projectId, String type, String key) {
        return db.sql("""
                with me as (select id from memory_entities where project_id = :p and type = :t and key = :k)
                select g.type, 'out', e.type, e.key, e.name, g.source_item_id, i.title
                  from memory_edges g join memory_entities e on e.id = g.to_id join memory_items i on i.id = g.source_item_id
                 where g.from_id in (select id from me) and i.superseded_by is null and not i.disabled
                union all
                select g.type, 'in', e.type, e.key, e.name, g.source_item_id, i.title
                  from memory_edges g join memory_entities e on e.id = g.from_id join memory_items i on i.id = g.source_item_id
                 where g.to_id in (select id from me) and i.superseded_by is null and not i.disabled""")
                .param("p", projectId).param("t", type).param("k", key.trim().toLowerCase(Locale.ROOT))
                .query((rs, n) -> new Neighbor(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4),
                        rs.getString(5), rs.getString(6), rs.getString(7))).list();
    }

    // ---- items (user API / MCP) ----

    public Optional<ItemRow> item(String projectId, String id) {
        return db.sql("select " + ITEM_COLS + " from memory_items i where i.id = :id and i.project_id = :p")
                .param("id", id).param("p", projectId).query(ITEM).optional();
    }

    public List<ItemRow> listItems(String projectId, String q, String kind, int limit) {
        Map<String, Object> params = new HashMap<>(Map.of("p", projectId, "l", limit));
        StringBuilder sql = new StringBuilder("select ").append(ITEM_COLS).append(" from memory_items i where i.project_id = :p and i.superseded_by is null");
        if (q != null && !q.isBlank()) {
            sql.append(" and (i.title ilike :q or i.content ilike :q)");
            params.put("q", "%" + q.trim() + "%");
        }
        if (kind != null && !kind.isBlank()) {
            sql.append(" and i.kind = :k");
            params.put("k", kind.trim().toUpperCase(Locale.ROOT));
        }
        sql.append(" order by i.created_at desc limit :l");
        return db.sql(sql.toString()).params(params).query(ITEM).list();
    }

    public int setDisabled(String projectId, String itemId, boolean disabled) {
        return db.sql("update memory_items set disabled = :d where id = :id and project_id = :p")
                .param("d", disabled).param("id", itemId).param("p", projectId).update();
    }

    /** Marks every chunk of the project for re-embedding (after an embedding model change). */
    public int reembed(String projectId) {
        return db.sql("update memory_chunks set embedding = null, embedding_model = null, embed_status = 'PENDING',"
                        + " attempts = 0, next_attempt_at = now(), last_error = null where project_id = :p")
                .param("p", projectId).update();
    }

    private static void filters(StringBuilder sql, Map<String, Object> params, Collection<String> kinds, String step, String excludeRunId) {
        if (kinds != null && !kinds.isEmpty()) {
            sql.append(" and i.kind in (:kinds)");
            params.put("kinds", kinds);
        }
        if (step != null && !step.isBlank()) {
            sql.append(" and i.step = :step");
            params.put("step", step);
        }
        if (excludeRunId != null && !excludeRunId.isBlank()) {
            sql.append(" and (i.run_id is null or i.run_id <> :ex)");
            params.put("ex", excludeRunId);
        }
    }

    private static String truncate(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }

    /** Deleted project: drop all of its memory (edges/chunks first). Returns rows removed per table. */
    @org.springframework.transaction.annotation.Transactional
    public java.util.Map<String, Integer> purgeProject(String projectId) {
        java.util.Map<String, Integer> n = new java.util.LinkedHashMap<>();
        for (String t : new String[]{"memory_edges", "memory_chunks", "memory_entities", "memory_items"}) {
            n.put(t, db.sql("DELETE FROM " + t + " WHERE project_id = ?").param(projectId).update());
        }
        return n;
    }
}

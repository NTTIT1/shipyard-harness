package com.shipyard.platform.context.service;

import com.shipyard.platform.common.exception.BadRequestException;
import com.shipyard.platform.context.store.MemoryStore;
import com.shipyard.platform.context.store.MemoryStore.NewItem;
import com.shipyard.platform.context.text.Chunker;
import com.shipyard.platform.context.text.EditDiff;
import com.shipyard.platform.context.text.EntitiesParser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.regex.Pattern;

/** Turns orchestrator outbox events into memory items, chunks and graph edges (spec §5.3). Idempotent per eventId. */
@Service
public class IngestService {
    private static final Logger log = LoggerFactory.getLogger(IngestService.class);
    private static final Set<String> TYPES = Set.of("STEP_APPROVED", "HUMAN_FEEDBACK", "FEATURE_DONE");
    private static final Pattern DECISIONS = Pattern.compile("quyết định|decision", Pattern.CASE_INSENSITIVE);

    private final MemoryStore store;

    public IngestService(MemoryStore store) { this.store = store; }

    /** @return false when this eventId was already applied */
    @Transactional
    public boolean ingest(String eventId, String type, Map<String, Object> payload) {
        if (eventId == null || eventId.isBlank()) throw new BadRequestException("eventId is required");
        if (!TYPES.contains(type)) throw new BadRequestException("Unknown event type: " + type);
        Map<String, Object> p = payload == null ? Map.of() : payload;
        String projectId = str(p, "projectId");
        if (projectId == null) throw new BadRequestException("payload.projectId is required");
        if (!store.markProcessed(eventId)) return false;
        switch (type) {
            case "STEP_APPROVED" -> stepApproved(projectId, p);
            case "HUMAN_FEEDBACK" -> humanFeedback(projectId, p);
            default -> featureDone(projectId, p);
        }
        return true;
    }

    @SuppressWarnings("unchecked")
    private void stepApproved(String projectId, Map<String, Object> p) {
        String runId = str(p, "runId"), title = Objects.requireNonNullElse(str(p, "runTitle"), runId), step = str(p, "step");
        Map<String, String> docs = new TreeMap<>((Map<String, String>) p.getOrDefault("documents", Map.of()));
        Integer revisionNo = p.get("revisionNo") instanceof Number num ? num.intValue() : null;
        String graphSource = null;
        for (Map.Entry<String, String> d : docs.entrySet()) {
            if (d.getKey().equals("entities.json") || d.getValue() == null || d.getValue().isBlank()) continue;
            String id = add(new NewItem(projectId, "ARTIFACT", runId, step, title + " — " + step + " — " + d.getKey(),
                    d.getValue(), runId + "/" + step + "/" + d.getKey(), revisionNo));
            if (graphSource == null || d.getKey().equals("plan.md")) graphSource = id;
            if (d.getKey().equals("plan.md")) {
                String decisions = Chunker.section(d.getValue(), DECISIONS);
                if (decisions != null) {
                    add(new NewItem(projectId, "DECISION", runId, step, "Quyết định kiến trúc — " + title, decisions, runId + "/" + step + "/decisions", revisionNo));
                }
            }
        }
        String entities = docs.get("entities.json");
        if ("ARCH".equals(step) && entities != null && graphSource != null) {
            EntitiesParser.Graph g = EntitiesParser.parse(entities, runId, title);
            Map<String, Long> ids = new HashMap<>();
            for (EntitiesParser.Entity e : g.entities()) ids.put(e.type() + ":" + e.key(), store.upsertEntity(projectId, e.type(), e.key(), e.name()));
            for (EntitiesParser.Relation r : g.relations()) {
                store.insertEdge(projectId, ids.get(r.fromType() + ":" + r.fromKey()), ids.get(r.toType() + ":" + r.toKey()), r.type(), graphSource);
            }
            if (!g.warnings().isEmpty()) log.warn("entities.json of {} ({}): {}", runId, projectId, g.warnings());
        }
    }

    @SuppressWarnings("unchecked")
    private void humanFeedback(String projectId, Map<String, Object> p) {
        String runId = str(p, "runId"), title = Objects.requireNonNullElse(str(p, "runTitle"), runId), step = str(p, "step");
        String role = Objects.requireNonNullElse(str(p, "decidedAsRole"), "reviewer");
        String feedback = str(p, "feedback");
        if (feedback != null && !feedback.isBlank()) {
            add(new NewItem(projectId, "FEEDBACK", runId, step, "Góp ý của " + role + " — " + step + " — " + title,
                    "Bước " + step + " (bản " + p.getOrDefault("revisionNo", "?") + "), quyết định " + p.getOrDefault("action", "") + ":\n\n" + feedback.trim(),
                    null));
        }
        for (Map<String, Object> e : (List<Map<String, Object>>) p.getOrDefault("edits", List.of())) {
            String file = String.valueOf(e.get("file"));
            add(new NewItem(projectId, "HUMAN_EDIT", runId, step, role + " sửa " + file + " — " + step + " — " + title,
                    EditDiff.summarize(str(e, "aiText"), str(e, "humanText"), feedback), null));
        }
    }

    private void featureDone(String projectId, Map<String, Object> p) {
        String runId = str(p, "runId"), title = Objects.requireNonNullElse(str(p, "title"), runId);
        String summary = Objects.requireNonNullElse(str(p, "summary"), "");
        add(new NewItem(projectId, "FEATURE_SUMMARY", runId, null, "Tính năng: " + title,
                "Tính năng: " + title + "\n\n" + summary, runId + "/summary"));
    }

    private String add(NewItem item) {
        String id = store.insertItem(item);
        store.insertChunks(id, item.projectId(), Chunker.chunk(item.title(), item.content()));
        return id;
    }

    private static String str(Map<String, Object> m, String k) {
        Object v = m.get(k);
        return v == null ? null : String.valueOf(v);
    }
}

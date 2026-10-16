package com.shipyard.platform.context;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class IngestIT extends ContextIT {
    static final String P = "proj_a";

    ResponseEntity<Map> send(String eventId, String type, Map<String, Object> payload) {
        return internal(HttpMethod.POST, "/internal/v1/memory/events", Map.of("eventId", eventId, "type", type, "payload", payload));
    }

    static Map<String, Object> approved(String runId, String title, String step, Map<String, String> docs) {
        return Map.of("projectId", P, "runId", runId, "runTitle", title, "step", step,
                "revisionId", "rev_x", "revisionNo", 1, "documents", docs);
    }

    long count(String sql, Object... args) {
        var q = db.sql(sql);
        for (Object a : args) q = q.param(a);
        return q.query(Long.class).single();
    }

    @Test
    void stepApprovedStoresOneArtifactPerDocumentWithPendingChunks() {
        ResponseEntity<Map> r = send("evt_1", "STEP_APPROVED", approved("run_a", "Đăng xuất", "PM", Map.of("spec.md", "# Spec\n\nAC-1 người dùng đăng xuất")));
        assertThat(r.getStatusCode().value()).isEqualTo(200);
        assertThat(((Map) data(r)).get("processed")).isEqualTo(true);
        assertThat(db.sql("select title from memory_items where kind = 'ARTIFACT'").query(String.class).list())
                .containsExactly("Đăng xuất — PM — spec.md");
        assertThat(count("select count(*) from memory_chunks where embed_status = 'PENDING'")).isEqualTo(1);
    }

    @Test
    void duplicateEventIdIsIgnored() {
        send("evt_1", "STEP_APPROVED", approved("run_a", "T", "PM", Map.of("spec.md", "x")));
        ResponseEntity<Map> again = send("evt_1", "STEP_APPROVED", approved("run_a", "T", "PM", Map.of("spec.md", "x")));
        assertThat(((Map) data(again)).get("processed")).isEqualTo(false);
        assertThat(count("select count(*) from memory_items")).isEqualTo(1);
    }

    @Test
    void reapprovalSupersedesThePreviousVersion() {
        send("evt_1", "STEP_APPROVED", approved("run_a", "T", "PM", Map.of("spec.md", "v1")));
        send("evt_2", "STEP_APPROVED", approved("run_a", "T", "PM", Map.of("spec.md", "v2")));
        assertThat(db.sql("select content from memory_items where superseded_by is null").query(String.class).list()).containsExactly("v2");
        assertThat(count("select count(*) from memory_items where superseded_by is not null")).isEqualTo(1);
    }

    @Test
    void archDecisionsAndEntitiesBecomeGraph() {
        send("evt_1", "STEP_APPROVED", approved("run_a", "Đặt hàng", "ARCH", Map.of(
                "plan.md", "# Plan\n## Quyết định\n- Dùng JWT cookie\n## Khác\nx",
                "tasks.md", "- [ ] t",
                "entities.json", "{\"entities\":[{\"type\":\"TABLE\",\"key\":\"orders\",\"name\":\"Đơn hàng\"}],"
                        + "\"relations\":[{\"from\":\"FEATURE:this\",\"to\":\"TABLE:orders\",\"type\":\"TOUCHES\"}]}")));
        assertThat(db.sql("select content from memory_items where kind = 'DECISION'").query(String.class).single())
                .contains("Dùng JWT cookie").doesNotContain("Khác");
        assertThat(count("select count(*) from memory_items where title like '%entities.json%'")).isZero();
        assertThat(db.sql("select type || ':' || key from memory_entities order by id").query(String.class).list())
                .containsExactly("FEATURE:run_a", "TABLE:orders");
        String planId = db.sql("select id from memory_items where title like '%plan.md'").query(String.class).single();
        assertThat(db.sql("select source_item_id from memory_edges").query(String.class).single()).isEqualTo(planId);
    }

    @Test
    void humanFeedbackBecomesLessons() {
        send("evt_1", "HUMAN_FEEDBACK", Map.of("projectId", P, "runId", "run_a", "runTitle", "Đăng xuất", "step", "PM",
                "revisionNo", 1, "action", "REQUEST_CHANGES", "feedback", "Thiếu AC phiên hết hạn", "decidedAsRole", "PM",
                "edits", List.of(Map.of("file", "spec.md", "aiText", "AC-1\nAC-2 cũ", "humanText", "AC-1\nAC-2 hết hạn phiên"))));
        assertThat(db.sql("select content from memory_items where kind = 'FEEDBACK'").query(String.class).single())
                .contains("Thiếu AC phiên hết hạn").contains("REQUEST_CHANGES");
        assertThat(db.sql("select content from memory_items where kind = 'HUMAN_EDIT'").query(String.class).single())
                .contains("- AC-2 cũ").contains("+ AC-2 hết hạn phiên");
    }

    @Test
    void featureDoneBecomesSummary() {
        send("evt_1", "FEATURE_DONE", Map.of("projectId", P, "runId", "run_a", "title", "Đăng xuất", "summary", "Đã merge PR #12"));
        assertThat(db.sql("select content from memory_items where kind = 'FEATURE_SUMMARY'").query(String.class).single())
                .contains("Đăng xuất").contains("Đã merge PR #12");
    }

    @Test
    void unknownTypeIs400AndNotMarkedProcessed() {
        assertThat(send("evt_9", "NOPE", Map.of("projectId", P)).getStatusCode().value()).isEqualTo(400);
        assertThat(send("evt_9", "STEP_APPROVED", Map.of("runId", "r")).getStatusCode().value()).isEqualTo(400);
        assertThat(((Map) data(send("evt_9", "FEATURE_DONE", Map.of("projectId", P, "runId", "r", "title", "t", "summary", "s"))))
                .get("processed")).isEqualTo(true);
    }

    @Test
    void eventsNeedServiceToken() {
        assertThat(rest.exchange("/internal/v1/memory/events", HttpMethod.GET, new HttpEntity<>(new HttpHeaders()), Map.class)
                .getStatusCode().value()).isEqualTo(401);
    }
}

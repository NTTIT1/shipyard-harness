package com.shipyard.platform.context;

import com.shipyard.platform.context.service.EmbeddingWorker;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;

class SearchIT extends ContextIT {
    @Autowired EmbeddingWorker worker;
    int evt = 0;

    void approve(String project, String runId, String title, String step, Map<String, String> docs) {
        internal(HttpMethod.POST, "/internal/v1/memory/events", Map.of("eventId", "evt_" + (++evt), "type", "STEP_APPROVED",
                "payload", Map.of("projectId", project, "runId", runId, "runTitle", title, "step", step,
                        "revisionId", "r", "revisionNo", 1, "documents", docs)));
    }

    void feedback(String runId, String text) {
        internal(HttpMethod.POST, "/internal/v1/memory/events", Map.of("eventId", "evt_" + (++evt), "type", "HUMAN_FEEDBACK",
                "payload", Map.of("projectId", "proj_a", "runId", runId, "runTitle", "T", "step", "PM", "revisionNo", 1,
                        "action", "REQUEST_CHANGES", "feedback", text, "decidedAsRole", "PM", "edits", List.of())));
    }

    void summary(String runId, String title, String text) {
        internal(HttpMethod.POST, "/internal/v1/memory/events", Map.of("eventId", "evt_" + (++evt), "type", "FEATURE_DONE",
                "payload", Map.of("projectId", "proj_a", "runId", runId, "title", title, "summary", text)));
    }

    void embedAll() { while (worker.runOnce() > 0) { } }

    Map<String, Object> search(String project, String q, List<String> kinds) {
        Map<String, Object> body = new HashMap<>(Map.of("projectId", project, "query", q, "k", 8));
        if (kinds != null) body.put("kinds", kinds);
        return data(internal(HttpMethod.POST, "/internal/v1/memory/search", body));
    }

    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> hits(Map<String, Object> r) { return (List<Map<String, Object>>) r.get("hits"); }

    @Test
    void findsTheRelevantDocumentFirst() {
        approve("proj_a", "run_a", "Đăng xuất", "PM", Map.of("spec.md", "Người dùng đăng xuất khỏi hệ thống an toàn"));
        approve("proj_a", "run_b", "Báo cáo", "PM", Map.of("spec.md", "Xuất báo cáo doanh thu ra excel"));
        embedAll();
        Map<String, Object> r = search("proj_a", "đăng xuất hệ thống", null);
        assertThat(r.get("degraded")).isEqualTo(false);
        assertThat(hits(r).get(0).get("runId")).isEqualTo("run_a");
        assertThat(hits(r).get(0).get("via")).isEqualTo("hybrid");
    }

    @Test
    void lessonsOutrankPlainArtifactsForEqualMatch() {
        approve("proj_a", "run_a", "Danh sách", "PM", Map.of("spec.md", "danh sách cần phân trang"));
        feedback("run_a", "danh sách cần phân trang");
        embedAll();
        assertThat(hits(search("proj_a", "danh sách phân trang", null)).get(0).get("kind")).isEqualTo("FEEDBACK");
    }

    @Test
    void projectsAreIsolated() {
        approve("proj_b", "run_x", "Bí mật", "PM", Map.of("spec.md", "đăng xuất bí mật của dự án khác"));
        embedAll();
        assertThat(hits(search("proj_a", "đăng xuất bí mật", null))).isEmpty();
    }

    @Test
    void disabledAndSupersededAreExcluded() {
        approve("proj_a", "run_a", "T", "PM", Map.of("spec.md", "phiên bản cũ giỏ hàng"));
        approve("proj_a", "run_a", "T", "PM", Map.of("spec.md", "phiên bản mới giỏ hàng"));
        embedAll();
        assertThat(hits(search("proj_a", "giỏ hàng", null))).extracting(h -> (String) h.get("text"))
                .allSatisfy(t -> assertThat(t).contains("mới"));
        db.sql("update memory_items set disabled = true").update();
        assertThat(hits(search("proj_a", "giỏ hàng", null))).isEmpty();
    }

    @Test
    void degradedModeStillAnswersByKeyword() {
        approve("proj_a", "run_a", "T", "PM", Map.of("spec.md", "thanh toán qua ví điện tử"));
        provider.down = true;
        Map<String, Object> r = search("proj_a", "thanh toán", null);
        assertThat(r.get("degraded")).isEqualTo(true);
        assertThat(hits(r)).singleElement().satisfies(h -> assertThat(h.get("via")).isEqualTo("keyword"));
    }

    @Test
    void graphExpansionBringsInOtherFeaturesTouchingTheSameTable() {
        String entities = "{\"entities\":[{\"type\":\"TABLE\",\"key\":\"orders\"}],"
                + "\"relations\":[{\"from\":\"FEATURE:this\",\"to\":\"TABLE:orders\",\"type\":\"TOUCHES\"}]}";
        approve("proj_a", "run_old", "Thanh toán", "ARCH", Map.of("plan.md", "# Plan\nkế hoạch thanh toán", "tasks.md", "t", "entities.json", entities));
        summary("run_old", "Thanh toán", "Đã có cổng thanh toán VNPay");
        approve("proj_a", "run_new", "Đổi trả", "ARCH", Map.of("plan.md", "# Plan\nđổi trả hàng", "tasks.md", "t", "entities.json", entities));
        embedAll();
        Map<String, Object> r = search("proj_a", "sửa bảng orders", List.of("FEATURE_SUMMARY"));
        assertThat(hits(r)).anySatisfy(h -> {
            assertThat(h.get("title")).isEqualTo("Tính năng: Thanh toán");
            assertThat(h.get("via")).isEqualTo("graph");
        });
    }

    @Test
    void relatedAndItemEndpoints() {
        String entities = "{\"relations\":[{\"from\":\"FEATURE:this\",\"to\":\"TABLE:orders\",\"type\":\"TOUCHES\"}]}";
        approve("proj_a", "run_a", "A", "ARCH", Map.of("plan.md", "p", "tasks.md", "t", "entities.json", entities));
        List<Map<String, Object>> ns = data(internal(HttpMethod.GET, "/internal/v1/memory/related?projectId=proj_a&entity=TABLE:Orders", null));
        assertThat(ns).singleElement().satisfies(n -> {
            assertThat(n.get("direction")).isEqualTo("in");
            assertThat(n.get("entityKey")).isEqualTo("run_a");
        });
        String id = db.sql("select id from memory_items limit 1").query(String.class).single();
        assertThat(internal(HttpMethod.GET, "/internal/v1/memory/items/" + id + "?projectId=proj_a", null).getStatusCode().value()).isEqualTo(200);
        assertThat(internal(HttpMethod.GET, "/internal/v1/memory/items/" + id + "?projectId=proj_b", null).getStatusCode().value()).isEqualTo(404);
        assertThat(internal(HttpMethod.GET, "/internal/v1/memory/related?projectId=proj_a&entity=orders", null).getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void searchValidatesInput() {
        assertThat(internal(HttpMethod.POST, "/internal/v1/memory/search", Map.of("query", "x")).getStatusCode().value()).isEqualTo(400);
        assertThat(hits(search("proj_a", "!!! :* &", null))).isEmpty();
    }

    @Test
    void misconfiguredModelDegradesInsteadOf500() {
        approve("proj_a", "run_a", "T", "PM", Map.of("spec.md", "thanh toán qua ví điện tử"));
        provider.broken = true;
        var r = internal(HttpMethod.POST, "/internal/v1/memory/search", Map.of("projectId", "proj_a", "query", "thanh toán"));
        assertThat(r.getStatusCode().value()).isEqualTo(200);
        assertThat(((Map) data(r)).get("degraded")).isEqualTo(true);
    }

    @Test
    void lateOlderRevisionNeverReplacesANewerOne() {
        Map<String, Object> base = Map.of("projectId", "proj_a", "runId", "run_a", "runTitle", "T", "step", "ARCH", "revisionId", "r");
        Map<String, Object> v2 = new HashMap<>(base); v2.put("revisionNo", 2); v2.put("documents", Map.of("plan.md", "kế hoạch bản hai"));
        Map<String, Object> v1 = new HashMap<>(base); v1.put("revisionNo", 1); v1.put("documents", Map.of("plan.md", "kế hoạch bản một"));
        internal(HttpMethod.POST, "/internal/v1/memory/events", Map.of("eventId", "evt_v2", "type", "STEP_APPROVED", "payload", v2));
        internal(HttpMethod.POST, "/internal/v1/memory/events", Map.of("eventId", "evt_v1", "type", "STEP_APPROVED", "payload", v1));
        assertThat(db.sql("select content from memory_items where superseded_by is null and kind = 'ARTIFACT'").query(String.class).list())
                .containsExactly("kế hoạch bản hai");
    }

    @Autowired org.springframework.transaction.support.TransactionTemplate tx;
    @Autowired com.shipyard.platform.context.store.MemoryStore store;

    @Test
    void filteredVectorSearchStillFindsASmallProjectThroughTheHnswIndex() {
        // 300 near-identical chunks in another project crowd the index's first ef_search candidates.
        for (int i = 0; i < 300; i++) {
            approve("proj_big", "run_" + i, "Big", "PM", Map.of("spec.md", "đăng xuất hệ thống bản " + i));
        }
        approve("proj_small", "run_s", "Small", "PM", Map.of("spec.md", "đăng xuất ứng dụng"));
        embedAll();
        db.sql("ANALYZE memory_chunks").update();
        float[] q = provider.embed("Big đăng xuất hệ thống bản");
        var hits = tx.execute(s -> {
            db.sql("SET LOCAL enable_seqscan = off").update();
            db.sql("SET LOCAL enable_sort = off").update();
            return store.vectorSearch("proj_small", q, java.util.List.of(), null, null, 0.05, 30);
        });
        assertThat(hits).hasSize(1);
    }
}

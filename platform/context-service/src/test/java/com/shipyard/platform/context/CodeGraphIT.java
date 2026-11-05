package com.shipyard.platform.context;

import com.shipyard.platform.context.service.EmbeddingWorker;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;

/** Feedback item 7: the code & document map in the project memory. */
class CodeGraphIT extends ContextIT {
    @Autowired EmbeddingWorker worker;

    @org.junit.jupiter.api.BeforeEach
    void members() { directory.grant("proj_a", "usr_ba", "BA"); }

    Map<String, Object> map(String project, List<Map<String, Object>> docs, List<Map<String, Object>> extraNodes) {
        List<Map<String, Object>> nodes = new ArrayList<>(List.of(
                Map.of("id", "MODULE:leaveservice", "type", "MODULE", "key", "leaveservice", "name", "LeaveService"),
                Map.of("id", "API:post /api/leaves", "type", "API", "key", "post /api/leaves", "name", "POST /api/leaves"),
                Map.of("id", "TABLE:leave_requests", "type", "TABLE", "key", "leave_requests", "name", "leave_requests"),
                Map.of("id", "DOC:docs/nghi-phep.md", "type", "DOC", "key", "docs/nghi-phep.md", "name", "Quy trình nghỉ phép")));
        nodes.addAll(extraNodes);
        List<Map<String, Object>> edges = List.of(
                Map.of("from", "MODULE:leaveservice", "to", "API:post /api/leaves", "type", "IMPLEMENTS"),
                Map.of("from", "MODULE:leaveservice", "to", "TABLE:leave_requests", "type", "TOUCHES"),
                Map.of("from", "DOC:docs/nghi-phep.md", "to", "MODULE:leaveservice", "type", "MENTIONS"),
                Map.of("from", "MODULE:leaveservice", "to", "MODULE:nope", "type", "DEPENDS_ON"),
                Map.of("from", "MODULE:leaveservice", "to", "API:post /api/leaves", "type", "DROP_TABLE"));
        return data(internal(HttpMethod.POST, "/internal/v1/projects/" + project + "/code-graph", Map.of(
                "source", "development@abc1234", "title", "HRM", "report", "# Bản đồ\n- LeaveService: 3 quan hệ",
                "nodes", nodes, "edges", edges, "docs", docs)));
    }

    static List<Map<String, Object>> doc(String text) {
        return List.of(Map.of("path", "docs/nghi-phep.md", "content", text));
    }

    @Test
    @SuppressWarnings("unchecked")
    void storesTheMapAndFindsTheDocumentThroughTheCodeItNames() {
        Map<String, Object> r = map("proj_a", doc("# Quy trình nghỉ phép\nNhân viên gửi đơn, quản lý duyệt trong 2 ngày."), List.of());
        assertThat(r).containsEntry("nodes", 4).containsEntry("edges", 3).containsEntry("docs", 1);

        // A step about the table finds the document through the graph, though the document never says "leave_requests".
        while (worker.runOnce() > 0) { }
        Map<String, Object> s = data(internal(HttpMethod.POST, "/internal/v1/memory/search",
                Map.of("projectId", "proj_a", "query", "thêm cột lý do vào leave_requests", "k", 8)));
        List<Map<String, Object>> hits = (List<Map<String, Object>>) s.get("hits");
        assertThat(hits).anySatisfy(h -> assertThat(h.get("kind")).isEqualTo("DOC"));

        Map<String, Object> g = data(user("usr_ba", null, HttpMethod.GET, "/api/v1/projects/proj_a/memory/graph?type=module", null));
        assertThat((List<Map<String, Object>>) g.get("nodes")).extracting(n -> n.get("name")).containsExactly("LeaveService");
        assertThat((Map<String, Object>) g.get("counts")).containsEntry("DOC", 1).containsEntry("TABLE", 1);
        List<Map<String, Object>> rel = data(user("usr_ba", null, HttpMethod.GET,
                "/api/v1/projects/proj_a/memory/graph/related?type=MODULE&key=leaveservice", null));
        assertThat(rel).extracting(n -> n.get("edgeType")).contains("IMPLEMENTS", "TOUCHES", "MENTIONS");
        assertThat(user("usr_x", null, HttpMethod.GET, "/api/v1/projects/proj_a/memory/graph", null).getStatusCode().value()).isEqualTo(404);
    }

    @Test
    @SuppressWarnings("unchecked")
    void aNewMapReplacesTheOldOneAndDropsWhatNoLongerExists() {
        map("proj_a", doc("bản cũ"), List.of(Map.of("id", "MODULE:oldthing", "type", "MODULE", "key", "oldthing", "name", "OldThing")));
        Map<String, Object> r = map("proj_a", doc("bản mới"), List.of());
        assertThat(((Number) r.get("replaced")).intValue()).isEqualTo(2); // the map + the document
        List<Map<String, Object>> docs = data(user("usr_ba", null, HttpMethod.GET, "/api/v1/projects/proj_a/memory?kind=DOC", null));
        assertThat(docs).hasSize(1);
        assertThat(docs.get(0).get("content")).isEqualTo("bản mới");
        List<Map<String, Object>> all = data(user("usr_ba", null, HttpMethod.GET, "/api/v1/projects/proj_a/memory", null));
        assertThat(all).as("the plain list leaves the repo's documents to the map screen").isEmpty();
        Map<String, Object> g = data(user("usr_ba", null, HttpMethod.GET, "/api/v1/projects/proj_a/memory/graph?q=oldthing", null));
        assertThat((List<?>) g.get("nodes")).isEmpty();
    }

    @Test
    void refusesAMapThatIsTooLarge() {
        List<Map<String, Object>> many = new ArrayList<>();
        for (int i = 0; i < 601; i++) many.add(Map.of("path", "d" + i + ".md", "content", "x"));
        assertThat(internal(HttpMethod.POST, "/internal/v1/projects/proj_a/code-graph", Map.of("docs", many)).getStatusCode().value()).isEqualTo(400);
    }
}

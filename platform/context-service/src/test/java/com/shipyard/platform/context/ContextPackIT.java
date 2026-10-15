package com.shipyard.platform.context;

import com.shipyard.platform.context.service.EmbeddingWorker;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ContextPackIT extends ContextIT {
    @Autowired EmbeddingWorker worker;
    int evt = 0;

    void event(String type, Map<String, Object> payload) {
        internal(HttpMethod.POST, "/internal/v1/memory/events", Map.of("eventId", "evt_" + (++evt), "type", type, "payload", payload));
    }

    void seedHistory() {
        event("HUMAN_FEEDBACK", Map.of("projectId", "proj_a", "runId", "run_old", "runTitle", "Đơn hàng", "step", "BA", "revisionNo", 1,
                "action", "REQUEST_CHANGES", "feedback", "Danh sách luôn phải có phân trang 20 dòng", "decidedAsRole", "BA", "edits", List.of()));
        event("FEATURE_DONE", Map.of("projectId", "proj_a", "runId", "run_old", "title", "Danh sách đơn hàng",
                "summary", "Danh sách đơn hàng có phân trang và lọc theo ngày"));
        event("FEATURE_DONE", Map.of("projectId", "proj_a", "runId", "run_new", "title", "Danh sách khách hàng",
                "summary", "bản nháp của chính run này"));
        while (worker.runOnce() > 0) { }
    }

    Map<String, Object> pack(String step) {
        return data(internal(HttpMethod.POST, "/internal/v1/context-pack", Map.of(
                "projectId", "proj_a", "runId", "run_new", "runTitle", "Danh sách khách hàng", "step", step,
                "query", "danh sách khách hàng phân trang",
                "priorApproved", Map.of("PM", Map.of("spec.md", "# Spec danh sách khách hàng\nAC-1 xem danh sách")))));
    }

    @Test
    void packHasPriorApprovedLessonsAndRelatedHistory() {
        seedHistory();
        Map<String, Object> p = pack("BA");
        String md = (String) p.get("markdown");
        assertThat(md).contains("# Context pack — BA").contains("not instructions")
                .contains("### PM — spec.md").contains("AC-1 xem danh sách")
                .contains("Danh sách luôn phải có phân trang 20 dòng")
                .contains("Danh sách đơn hàng có phân trang");
        assertThat(md.indexOf("## 2.")).isLessThan(md.indexOf("phân trang 20 dòng"));
        assertThat((List<?>) p.get("items")).isNotEmpty();
        assertThat(p.get("degraded")).isEqualTo(false);
    }

    @Test
    void relatedHistoryExcludesTheCurrentRun() {
        seedHistory();
        String md = (String) pack("BA").get("markdown");
        String related = md.substring(md.indexOf("## 3."));
        assertThat(related).doesNotContain("bản nháp của chính run này");
    }

    @Test
    void degradedPackStillCarriesPriorApprovedDocuments() {
        provider.down = true;
        Map<String, Object> p = pack("ARCH");
        assertThat(p.get("degraded")).isEqualTo(true);
        assertThat((String) p.get("markdown")).contains("AC-1 xem danh sách").contains("⚠");
    }

    @Test
    void firstStepSaysNothingApprovedYet() {
        Map<String, Object> p = data(internal(HttpMethod.POST, "/internal/v1/context-pack", Map.of(
                "projectId", "proj_a", "runId", "run_new", "runTitle", "X", "step", "PM", "priorApproved", Map.of())));
        assertThat((String) p.get("markdown")).contains("None yet");
    }
}

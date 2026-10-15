package com.shipyard.platform.orchestrator;

import com.shipyard.platform.orchestrator.domain.GateMode;
import com.shipyard.platform.orchestrator.domain.Step;
import com.shipyard.platform.orchestrator.entity.GatePolicy;
import com.shipyard.platform.orchestrator.repository.GatePolicyRepository;
import com.shipyard.platform.orchestrator.repository.OutboxEventRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;

class InternalRunApiIT extends OrchestratorIT {
    @Autowired GatePolicyRepository policies;
    @Autowired OutboxEventRepository outbox;

    static final String PROJECT = "proj_test";

    String createRun() {
        ResponseEntity<Map> r = internal(HttpMethod.POST, "/internal/v1/runs", Map.of(
                "projectId", PROJECT, "laneRef", "host:lane1", "title", "Đăng xuất",
                "description", "Thêm nút đăng xuất", "createdBy", "usr_owner"));
        assertThat(r.getStatusCode().value()).isEqualTo(200);
        return (String) ((Map) data(r)).get("id");
    }

    /** A valid submission payload for each step. */
    static Map<String, Object> payload(Step step, Boolean hasUi) {
        Map<String, Object> p = new HashMap<>();
        p.put("summary", step + " done");
        p.put("images", List.of());
        p.put("meta", Map.of());
        p.put("contextUsed", List.of());
        switch (step) {
            case PM -> p.put("documents", Map.of("spec.md", "# Spec\nAC-1"));
            case BA -> p.put("documents", Map.of("ba.md", "# BA"));
            case ARCH -> { p.put("documents", Map.of("plan.md", "# Plan", "tasks.md", "- [ ] t", "entities.json", "{\"entities\":[]}")); p.put("hasUi", hasUi); }
            case DESIGN -> { p.put("documents", Map.of("design.md", "# Design")); p.put("images", List.of(Map.of("path", "/proof/1/x/design/01.png", "caption", "list"))); }
            case DEV -> { p.put("documents", Map.of()); p.put("meta", Map.of("branch", "feat/logout")); }
            case TEST -> { p.put("documents", Map.of("qc-plan.md", "# QC")); p.put("images", List.of(Map.of("path", "/proof/1/x/qc/01.png", "caption", "ok"))); }
        }
        return p;
    }

    ResponseEntity<Map> submit(String runId, Step step, Boolean hasUi) {
        return internal(HttpMethod.POST, "/internal/v1/runs/" + runId + "/steps/" + step + "/submit", payload(step, hasUi));
    }

    Map<String, Object> next(String runId) {
        return data(internal(HttpMethod.GET, "/internal/v1/runs/" + runId + "/next", null));
    }

    void allAuto() {
        for (Step s : Step.values()) policies.save(new GatePolicy(PROJECT, s, GateMode.AUTO));
    }

    @Test
    void createdRunStartsWithPmWork() {
        Map<String, Object> n = next(createRun());
        assertThat(n.get("mode")).isEqualTo("WORK");
        assertThat(n.get("step")).isEqualTo("PM");
        assertThat(n.get("revision")).isEqualTo(1);
    }

    @Test
    void internalApiRequiresServiceToken() {
        HttpHeaders h = new HttpHeaders();
        assertThat(rest.exchange("/internal/v1/runs/x/next", HttpMethod.GET, new HttpEntity<>(h), Map.class)
                .getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void submitValidatesArtifactsAndWaitsForReview() {
        String id = createRun();
        ResponseEntity<Map> bad = internal(HttpMethod.POST, "/internal/v1/runs/" + id + "/steps/PM/submit",
                Map.of("summary", "s", "documents", Map.of()));
        assertThat(bad.getStatusCode().value()).isEqualTo(400);
        assertThat((String) bad.getBody().get("message")).contains("spec.md");

        ResponseEntity<Map> ok = submit(id, Step.PM, null);
        assertThat(ok.getStatusCode().value()).isEqualTo(200);
        assertThat(((Map) data(ok)).get("autoApproved")).isEqualTo(false);
        assertThat(next(id).get("mode")).isEqualTo("WAIT");
    }

    @Test
    void submittingTheWrongStepIsAConflict() {
        String id = createRun();
        assertThat(submit(id, Step.BA, null).getStatusCode().value()).isEqualTo(409);
    }

    @Test
    void stepPathIsCaseInsensitiveAndValidated() {
        String id = createRun();
        assertThat(internal(HttpMethod.POST, "/internal/v1/runs/" + id + "/steps/pm/submit", payload(Step.PM, null))
                .getStatusCode().value()).isEqualTo(200);
        assertThat(internal(HttpMethod.POST, "/internal/v1/runs/" + id + "/steps/xyz/submit", payload(Step.PM, null))
                .getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void autoGatesRunToReleaseSkippingDesignAndFeedPriorApproved() {
        allAuto();
        String id = createRun();
        assertThat(((Map) data(submit(id, Step.PM, null))).get("autoApproved")).isEqualTo(true);
        Map<String, Object> n = next(id);
        assertThat(n.get("step")).isEqualTo("BA");
        assertThat(((Map<String, Map<String, String>>) n.get("priorApproved")).get("PM")).containsEntry("spec.md", "# Spec\nAC-1");

        submit(id, Step.BA, null);
        submit(id, Step.ARCH, false);
        assertThat(next(id).get("step")).isEqualTo("DEV");
        submit(id, Step.DEV, null);
        submit(id, Step.TEST, null);
        assertThat(next(id).get("mode")).isEqualTo("RELEASE");
        assertThat(outbox.findByTypeOrderByIdAsc("STEP_APPROVED")).hasSize(5);
        assertThat(outbox.findByTypeOrderByIdAsc("HUMAN_FEEDBACK")).isEmpty();
    }

    @Test
    void releaseThenReopenDev() {
        allAuto();
        String id = createRun();
        submit(id, Step.PM, null); submit(id, Step.BA, null); submit(id, Step.ARCH, false);
        submit(id, Step.DEV, null); submit(id, Step.TEST, null);

        assertThat(internal(HttpMethod.POST, "/internal/v1/runs/" + id + "/release", Map.of("summary", "Đã merge PR #12"))
                .getStatusCode().value()).isEqualTo(200);
        assertThat(next(id).get("mode")).isEqualTo("DONE");
        assertThat(outbox.findByTypeOrderByIdAsc("FEATURE_DONE")).singleElement()
                .satisfies(e -> assertThat(e.payload).containsEntry("summary", "Đã merge PR #12"));

        Map<String, Object> reopened = data(internal(HttpMethod.POST, "/internal/v1/runs/" + id + "/reopen",
                Map.of("reason", "dev-QC: lỗi 500")));
        assertThat(reopened.get("mode")).isEqualTo("REVISE");
        assertThat(reopened.get("step")).isEqualTo("DEV");
        assertThat((String) reopened.get("feedback")).contains("lỗi 500");
        assertThat(reopened.get("revision")).isEqualTo(2);
    }

    @Test
    void unknownRunIs404() {
        assertThat(internal(HttpMethod.GET, "/internal/v1/runs/run_nope/next", null).getStatusCode().value()).isEqualTo(404);
    }
}

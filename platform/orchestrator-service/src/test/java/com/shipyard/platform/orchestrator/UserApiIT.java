package com.shipyard.platform.orchestrator;

import com.shipyard.platform.orchestrator.domain.Step;
import com.shipyard.platform.orchestrator.repository.OutboxEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class UserApiIT extends OrchestratorIT {
    @Autowired OutboxEventRepository outbox;

    static final String P = "proj_test";
    String runId;

    @BeforeEach
    void seed() {
        directory.grant(P, "usr_owner", "OWNER");
        directory.grant(P, "usr_ba", "BA");
        directory.grant(P, "usr_dev", "DEVELOPER");
        ResponseEntity<Map> r = internal(HttpMethod.POST, "/internal/v1/runs", Map.of(
                "projectId", P, "laneRef", "host:lane2", "title", "Đăng xuất", "description", "", "createdBy", "usr_owner"));
        runId = (String) ((Map) data(r)).get("id");
        submit(Step.PM);
    }

    void submit(Step s) {
        Map<String, Object> p = new HashMap<>(InternalRunApiIT.payload(s, false));
        assertThat(internal(HttpMethod.POST, "/internal/v1/runs/" + runId + "/steps/" + s + "/submit", p)
                .getStatusCode().value()).isEqualTo(200);
    }

    List<Map<String, Object>> inbox(String user) {
        return data(user(user, HttpMethod.GET, "/api/v1/approvals/inbox", null));
    }

    String pendingApprovalId(String user) {
        return (String) inbox(user).get(0).get("approvalId");
    }

    ResponseEntity<Map> decide(String user, String approvalId, Map<String, Object> body) {
        return user(user, HttpMethod.POST, "/api/v1/approvals/" + approvalId + "/decision", body);
    }

    Map<String, Object> next() {
        return data(internal(HttpMethod.GET, "/internal/v1/runs/" + runId + "/next", null));
    }

    @Test
    void inboxShowsOnlyGatesIMayDecide() {
        // Nobody holds PM → the owner sees it as fallback; BA and DEV do not.
        assertThat(inbox("usr_owner")).singleElement().satisfies(i -> {
            assertThat(i.get("step")).isEqualTo("PM");
            assertThat(i.get("decideAs")).isEqualTo("OWNER_FALLBACK");
            assertThat(i.get("runTitle")).isEqualTo("Đăng xuất");
        });
        assertThat(inbox("usr_ba")).isEmpty();

        decide("usr_owner", pendingApprovalId("usr_owner"), Map.of("action", "APPROVE"));
        submit(Step.BA);
        assertThat(inbox("usr_ba")).singleElement().satisfies(i -> assertThat(i.get("decideAs")).isEqualTo("BA"));
        assertThat(inbox("usr_owner")).isEmpty(); // BA is held by someone → no fallback
    }

    @Test
    void outsidersGet404Everywhere() {
        String apr = pendingApprovalId("usr_owner");
        assertThat(user("usr_x", HttpMethod.GET, "/api/v1/runs/" + runId, null).getStatusCode().value()).isEqualTo(404);
        assertThat(decide("usr_x", apr, Map.of("action", "APPROVE")).getStatusCode().value()).isEqualTo(404);
        assertThat(user("usr_x", HttpMethod.GET, "/api/v1/projects/" + P + "/runs", null).getStatusCode().value()).isEqualTo(404);
    }

    @Test
    void wrongRoleMemberGets403() {
        assertThat(decide("usr_dev", pendingApprovalId("usr_owner"), Map.of("action", "APPROVE")).getStatusCode().value()).isEqualTo(403);
    }

    @Test
    void missingUserHeaderIs401() {
        assertThat(rest.getForEntity("/api/v1/approvals/inbox", Map.class).getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void requestChangesWithEditsDrivesReviseAndRecordsLesson() {
        ResponseEntity<Map> r = decide("usr_owner", pendingApprovalId("usr_owner"), Map.of(
                "action", "REQUEST_CHANGES", "feedback", "Thiếu AC cho phiên hết hạn",
                "editedDocuments", Map.of("spec.md", "# Spec\nAC-1\nAC-2 hết hạn phiên")));
        assertThat(r.getStatusCode().value()).isEqualTo(200);
        assertThat(((Map) data(r)).get("laneRef")).isEqualTo("host:lane2");
        assertThat(((Map) data(r)).get("mode")).isEqualTo("REVISE");

        Map<String, Object> n = next();
        assertThat(n.get("feedback")).isEqualTo("Thiếu AC cho phiên hết hạn");
        assertThat((Map<String, String>) n.get("editedDocuments")).containsEntry("spec.md", "# Spec\nAC-1\nAC-2 hết hạn phiên");
        assertThat(outbox.findByTypeOrderByIdAsc("HUMAN_FEEDBACK")).singleElement().satisfies(e -> {
            List<Map<String, String>> edits = (List<Map<String, String>>) e.payload.get("edits");
            assertThat(edits.get(0)).containsEntry("aiText", "# Spec\nAC-1").containsEntry("humanText", "# Spec\nAC-1\nAC-2 hết hạn phiên");
            assertThat(e.payload).containsEntry("decidedAsRole", "OWNER_FALLBACK");
        });
    }

    @Test
    void requestChangesWithoutFeedbackIs400() {
        assertThat(decide("usr_owner", pendingApprovalId("usr_owner"), Map.of("action", "REQUEST_CHANGES"))
                .getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void editUnknownDocumentIs400() {
        assertThat(decide("usr_owner", pendingApprovalId("usr_owner"), Map.of(
                "action", "APPROVE", "editedDocuments", Map.of("../secrets.env", "x"))).getStatusCode().value()).isEqualTo(400);
        assertThat(next().get("mode")).isEqualTo("WAIT");
    }

    @Test
    void secondDecisionIs409() {
        String apr = pendingApprovalId("usr_owner");
        assertThat(decide("usr_owner", apr, Map.of("action", "APPROVE")).getStatusCode().value()).isEqualTo(200);
        assertThat(decide("usr_owner", apr, Map.of("action", "APPROVE")).getStatusCode().value()).isEqualTo(409);
        assertThat(next().get("step")).isEqualTo("BA");
    }

    @Test
    void approveWithEditsMakesHumanVersionCanonical() {
        decide("usr_owner", pendingApprovalId("usr_owner"), Map.of(
                "action", "APPROVE", "editedDocuments", Map.of("spec.md", "# Bản người sửa")));
        assertThat(((Map<String, Map<String, String>>) next().get("priorApproved")).get("PM")).containsEntry("spec.md", "# Bản người sửa");
        assertThat(outbox.findByTypeOrderByIdAsc("STEP_APPROVED")).singleElement()
                .satisfies(e -> assertThat((Map<String, String>) e.payload.get("documents")).containsEntry("spec.md", "# Bản người sửa"));
        assertThat(outbox.findByTypeOrderByIdAsc("HUMAN_FEEDBACK")).hasSize(1);
    }

    @Test
    void sendBackFromBaToPm() {
        decide("usr_owner", pendingApprovalId("usr_owner"), Map.of("action", "APPROVE"));
        submit(Step.BA);
        assertThat(decide("usr_ba", pendingApprovalId("usr_ba"), Map.of(
                "action", "SEND_BACK", "sendBackTo", "PM", "feedback", "Mục tiêu chưa rõ")).getStatusCode().value()).isEqualTo(200);
        Map<String, Object> n = next();
        assertThat(n.get("step")).isEqualTo("PM");
        assertThat(n.get("mode")).isEqualTo("REVISE");
        assertThat(n.get("revision")).isEqualTo(2);
        Map<String, Object> view = data(user("usr_ba", HttpMethod.GET, "/api/v1/runs/" + runId, null));
        assertThat((List<Map<String, Object>>) view.get("steps")).anySatisfy(s -> {
            assertThat(s.get("step")).isEqualTo("BA");
            assertThat(s.get("status")).isEqualTo("PENDING");
        });
    }

    @Test
    void revisionDetailShowsDocumentsToMembers() {
        Map<String, Object> view = data(user("usr_ba", HttpMethod.GET, "/api/v1/runs/" + runId, null));
        String revId = (String) ((List<Map<String, Object>>) view.get("revisions")).get(0).get("id");
        Map<String, Object> detail = data(user("usr_ba", HttpMethod.GET, "/api/v1/runs/" + runId + "/revisions/" + revId, null));
        assertThat((Map<String, String>) detail.get("documents")).containsKey("spec.md");
        assertThat(detail.get("requiredRole")).isEqualTo("PM");
    }

    @Test
    void cancelStopsTheRun() {
        decide("usr_owner", pendingApprovalId("usr_owner"), Map.of("action", "CANCEL"));
        assertThat(next().get("mode")).isEqualTo("CANCELLED");
    }

    @Test
    void gatePolicyOnlyOwnerOrMaintainerMayChange() {
        Map<String, String> policy = data(user("usr_ba", HttpMethod.GET, "/api/v1/projects/" + P + "/gate-policy", null));
        assertThat(policy).hasSize(6).containsEntry("BA", "REQUIRED").doesNotContainKey("MANAGER");
        assertThat(user("usr_owner", HttpMethod.PUT, "/api/v1/projects/" + P + "/gate-policy", Map.of("MANAGER", "AUTO"))
                .getStatusCode().value()).isEqualTo(400);
        assertThat(user("usr_ba", HttpMethod.PUT, "/api/v1/projects/" + P + "/gate-policy", Map.of("BA", "AUTO"))
                .getStatusCode().value()).isEqualTo(403);
        assertThat(user("usr_owner", HttpMethod.PUT, "/api/v1/projects/" + P + "/gate-policy", Map.of("BA", "AUTO"))
                .getStatusCode().value()).isEqualTo(200);
        assertThat((Map<String, String>) data(user("usr_ba", HttpMethod.GET, "/api/v1/projects/" + P + "/gate-policy", null)))
                .containsEntry("BA", "AUTO");
        assertThat(user("usr_owner", HttpMethod.PUT, "/api/v1/projects/" + P + "/gate-policy", Map.of("BA", "MAYBE"))
                .getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void projectWorkflowReordersAndLeavesStepsOutForNewRuns() {
        String url = "/api/v1/projects/" + P + "/workflow";
        List<Map<String, Object>> wf = data(user("usr_ba", HttpMethod.GET, url, null));
        assertThat(wf).extracting(m -> m.get("step")).containsExactly("PM", "BA", "ARCH", "DESIGN", "DEV", "TEST");
        List<Map<String, String>> body = List.of(
                Map.of("step", "ARCH", "mode", "REQUIRED"), Map.of("step", "PM", "mode", "AUTO"),
                Map.of("step", "BA", "mode", "SKIP"), Map.of("step", "DESIGN", "mode", "SKIP"),
                Map.of("step", "DEV", "mode", "REQUIRED"), Map.of("step", "TEST", "mode", "REQUIRED"));
        assertThat(user("usr_ba", HttpMethod.PUT, url, body).getStatusCode().value()).isEqualTo(403);
        assertThat(user("usr_owner", HttpMethod.PUT, url, body).getStatusCode().value()).isEqualTo(200);
        wf = data(user("usr_ba", HttpMethod.GET, url, null));
        assertThat(wf).extracting(m -> m.get("step")).containsExactly("ARCH", "PM", "BA", "DESIGN", "DEV", "TEST");
        assertThat(wf.get(2)).containsEntry("mode", "SKIP");
        // the legacy gate-policy API keeps the order
        user("usr_owner", HttpMethod.PUT, "/api/v1/projects/" + P + "/gate-policy", Map.of("TEST", "AUTO"));
        wf = data(user("usr_ba", HttpMethod.GET, url, null));
        assertThat(wf.get(0)).containsEntry("step", "ARCH");
        assertThat(wf.get(5)).containsEntry("mode", "AUTO");

        ResponseEntity<Map> r = internal(HttpMethod.POST, "/internal/v1/runs", Map.of(
                "projectId", P, "laneRef", "host:lane3", "title", "Kho", "description", "", "createdBy", "usr_owner"));
        Map<String, Object> run = data(r);
        assertThat(run.get("currentStep")).isEqualTo("ARCH");
        assertThat((List<String>) run.get("workflow")).containsExactly("ARCH", "PM", "BA", "DESIGN", "DEV", "TEST");
        Map<String, Object> view = data(user("usr_ba", HttpMethod.GET, "/api/v1/runs/" + run.get("id"), null));
        List<Map<String, Object>> steps = (List<Map<String, Object>>) view.get("steps");
        assertThat(steps).extracting(m -> m.get("step")).containsExactly("ARCH", "PM", "BA", "DESIGN", "DEV", "TEST");
        assertThat(steps.get(2)).containsEntry("status", "SKIPPED").containsEntry("skipReason", "workflow");

        // a feature (lane) may still bring back a left-out step, or leave another one out
        r = internal(HttpMethod.POST, "/internal/v1/runs", Map.of("projectId", P, "laneRef", "host:lane4", "title", "K2",
                "description", "", "createdBy", "usr_owner", "gateOverrides", Map.of("BA", "REQUIRED", "ARCH", "SKIP")));
        assertThat(((Map<String, Object>) data(r)).get("currentStep")).isEqualTo("PM");
        assertThat(internal(HttpMethod.POST, "/internal/v1/runs", Map.of("projectId", P, "laneRef", "host:lane5", "title", "K3",
                "description", "", "createdBy", "usr_owner", "gateOverrides", Map.of("DEV", "SKIP"))).getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void workflowRejectsBadOrdersAndSkippingDev() {
        String url = "/api/v1/projects/" + P + "/workflow";
        List<Map<String, String>> devLast = List.of(
                Map.of("step", "PM", "mode", "REQUIRED"), Map.of("step", "BA", "mode", "REQUIRED"),
                Map.of("step", "ARCH", "mode", "REQUIRED"), Map.of("step", "DESIGN", "mode", "REQUIRED"),
                Map.of("step", "TEST", "mode", "REQUIRED"), Map.of("step", "DEV", "mode", "REQUIRED"));
        assertThat(user("usr_owner", HttpMethod.PUT, url, devLast).getStatusCode().value()).isEqualTo(400);
        assertThat(user("usr_owner", HttpMethod.PUT, "/api/v1/projects/" + P + "/gate-policy", Map.of("DEV", "SKIP"))
                .getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void stepConfigIsSavedFrozenIntoRunsAndHandedToTheLane() {
        String url = "/api/v1/projects/" + P + "/workflow";
        List<Map<String, Object>> body = new java.util.ArrayList<>();
        for (String st : List.of("PM", "BA", "ARCH", "DESIGN", "DEV", "TEST")) {
            Map<String, Object> w = new HashMap<>(Map.of("step", st, "mode", "REQUIRED"));
            if (st.equals("ARCH")) w.put("config", Map.of("model", "claude:claude-opus-5-5", "timeoutMinutes", 45, "requiredInputs", List.of("spec.md")));
            if (st.equals("TEST")) w.put("config", Map.of("condition", "PREV_PASSED", "onFailure", "FAIL_RUN", "budgetVnd", 300000));
            body.add(w);
        }
        assertThat(user("usr_owner", HttpMethod.PUT, url, body).getStatusCode().value()).isEqualTo(200);
        List<Map<String, Object>> wf = data(user("usr_ba", HttpMethod.GET, url, null));
        assertThat((Map<String, Object>) wf.get(2).get("config")).containsEntry("timeoutMinutes", 45);

        ResponseEntity<Map> r = internal(HttpMethod.POST, "/internal/v1/runs", Map.of(
                "projectId", P, "laneRef", "host:lane7", "title", "Cấu hình", "description", "", "createdBy", "usr_owner"));
        String id = (String) ((Map) data(r)).get("id");
        Map<String, Object> next = data(internal(HttpMethod.GET, "/internal/v1/runs/" + id + "/next", null));
        Map<String, Map<String, Object>> cfg = (Map<String, Map<String, Object>>) next.get("stepConfig");
        assertThat(cfg.get("TEST")).containsEntry("onFailure", "FAIL_RUN");

        // the project changes its workflow later: the running feature keeps its snapshot
        body.get(5).put("config", Map.of("onFailure", "RETRY"));
        user("usr_owner", HttpMethod.PUT, url, body);
        next = data(internal(HttpMethod.GET, "/internal/v1/runs/" + id + "/next", null));
        assertThat(((Map<String, Map<String, Object>>) next.get("stepConfig")).get("TEST")).containsEntry("onFailure", "FAIL_RUN");

        body.get(2).put("config", Map.of("requiredInputs", List.of("../../etc/passwd")));
        assertThat(user("usr_owner", HttpMethod.PUT, url, body).getStatusCode().value()).isEqualTo(400);

        assertThat(internal(HttpMethod.POST, "/internal/v1/runs/" + id + "/fail", Map.of("reason", "hết ngân sách")).getStatusCode().value()).isEqualTo(200);
        assertThat(((Map<String, Object>) data(internal(HttpMethod.GET, "/internal/v1/runs/" + id + "/next", null))).get("mode")).isEqualTo("CANCELLED");
    }
}

package com.shipyard.platform.orchestrator;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** SETUP runs (AI Manager → project rules) and the guard they put on feature runs. */
class SetupRunIT extends OrchestratorIT {

    ResponseEntity<Map> create(String project, String kind) {
        Map<String, Object> body = new java.util.HashMap<>(Map.of("projectId", project, "laneRef", "host:setup",
                "title", "Luật dự án", "createdBy", "usr_owner"));
        if (kind != null) body.put("kind", kind);
        return internal(HttpMethod.POST, "/internal/v1/runs", body);
    }

    Map<String, Object> next(String runId) {
        return data(internal(HttpMethod.GET, "/internal/v1/runs/" + runId + "/next", null));
    }

    ResponseEntity<Map> submitRules(String runId, Map<String, String> docs) {
        return internal(HttpMethod.POST, "/internal/v1/runs/" + runId + "/steps/MANAGER/submit",
                Map.of("summary", "Bộ luật đầu tiên", "documents", docs, "images", List.of(), "meta", Map.of(), "contextUsed", List.of()));
    }

    @Test
    void projectsWithoutSetupRunsAreUnaffected() {
        assertThat(create("proj_legacy", null).getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void setupRunStartsWithManagerAndBlocksFeaturesUntilDone() {
        String p = "proj_setup1";
        ResponseEntity<Map> r = create(p, "SETUP");
        assertThat(r.getStatusCode().value()).isEqualTo(200);
        Map<String, Object> run = data(r);
        assertThat(run).containsEntry("kind", "SETUP").containsEntry("currentStep", "MANAGER");
        String id = (String) run.get("id");
        assertThat(next(id)).containsEntry("mode", "WORK").containsEntry("step", "MANAGER");

        ResponseEntity<Map> blocked = create(p, null);
        assertThat(blocked.getStatusCode().value()).isEqualTo(409);
        assertThat((String) blocked.getBody().get("message")).contains("not approved");
        assertThat(create(p, "SETUP").getStatusCode().value()).isEqualTo(409); // one open setup at a time

        ResponseEntity<Map> bad = submitRules(id, Map.of("project.md", "# Luật"));
        assertThat(bad.getStatusCode().value()).isEqualTo(400);
        assertThat((String) bad.getBody().get("message")).contains("team.json");
        assertThat(submitRules(id, Map.of("project.md", "# Luật", "team.json", "{}")).getStatusCode().value()).isEqualTo(200);
        assertThat(next(id).get("mode")).isEqualTo("WAIT");

        // The project's TECH_LEAD/OWNER approves through the user API; here the gate is set to AUTO via the release path.
        jdbc.update("update run_steps set status='APPROVED' where run_id=?", id);
        jdbc.update("update runs set status='RELEASING', current_step=null where id=?", id);
        assertThat(internal(HttpMethod.POST, "/internal/v1/runs/" + id + "/release", Map.of("summary", "committed")).getStatusCode().value()).isEqualTo(200);

        ResponseEntity<Map> feature = create(p, null);
        assertThat(feature.getStatusCode().value()).isEqualTo(200);
        assertThat((Map<String, Object>) data(feature)).containsEntry("kind", "FEATURE").containsEntry("currentStep", "PM");
        assertThat(create(p, "SETUP").getStatusCode().value()).isEqualTo(200); // rules can be redrafted later
    }

    @Test
    void unknownKindIs400() {
        assertThat(create("proj_x", "deploy").getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void managerCanNeverBeAutoApproved() {
        Map<String, Object> body = new java.util.HashMap<>(Map.of("projectId", "proj_auto", "laneRef", "host:setup",
                "title", "Luật", "createdBy", "usr_owner", "kind", "SETUP", "gateOverrides", Map.of("MANAGER", "AUTO")));
        assertThat(internal(HttpMethod.POST, "/internal/v1/runs", body).getStatusCode().value()).isEqualTo(400);
        jdbc.update("insert into gate_policies(project_id, step, mode) values ('proj_auto', 'MANAGER', 'AUTO')");
        String id = (String) ((Map) data(create("proj_auto", "SETUP"))).get("id");
        Map<String, Object> r = data(submitRules(id, Map.of("project.md", "# L", "team.json", "{}")));
        assertThat(r.get("autoApproved")).isEqualTo(false);
    }
}

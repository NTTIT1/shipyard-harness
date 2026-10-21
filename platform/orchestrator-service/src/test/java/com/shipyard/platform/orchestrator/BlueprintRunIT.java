package com.shipyard.platform.orchestrator;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** BLUEPRINT runs: the architecture of a new project, approved by a human before it is scaffolded. */
class BlueprintRunIT extends OrchestratorIT {

    ResponseEntity<Map> create(String project, String kind, Map<String, String> gates) {
        Map<String, Object> body = new HashMap<>(Map.of("projectId", project, "laneRef", "host:blueprint:x",
                "title", "Kiến trúc dự án", "createdBy", "usr_owner"));
        if (kind != null) body.put("kind", kind);
        if (gates != null) body.put("gateOverrides", gates);
        return internal(HttpMethod.POST, "/internal/v1/runs", body);
    }

    ResponseEntity<Map> submit(String runId, Map<String, String> docs) {
        return internal(HttpMethod.POST, "/internal/v1/runs/" + runId + "/steps/BLUEPRINT/submit",
                Map.of("summary", "Kiến trúc đầu tiên", "documents", docs, "images", List.of(), "meta", Map.of(), "contextUsed", List.of()));
    }

    @Test
    void blueprintIsOneHumanStepAndBlocksFeaturesUntilReleased() {
        String p = "proj_bp1";
        Map<String, Object> run = data(create(p, "BLUEPRINT", null));
        assertThat(run).containsEntry("kind", "BLUEPRINT").containsEntry("currentStep", "BLUEPRINT");
        String id = (String) run.get("id");

        assertThat(create(p, null, null).getStatusCode().value()).isEqualTo(409);
        assertThat(create(p, "BLUEPRINT", null).getStatusCode().value()).isEqualTo(409);

        ResponseEntity<Map> bad = submit(id, Map.of("notes.md", "x"));
        assertThat(bad.getStatusCode().value()).isEqualTo(400);
        assertThat((String) bad.getBody().get("message")).contains("architecture.md");
        jdbc.update("insert into gate_policies(project_id, step, mode) values (?, 'BLUEPRINT', 'AUTO')", p);
        Map<String, Object> s = data(submit(id, Map.of("architecture.md", "# Kiến trúc")));
        assertThat(s.get("autoApproved")).as("never auto-approved, whatever the policy says").isEqualTo(false);

        jdbc.update("update run_steps set status='APPROVED' where run_id=?", id);
        jdbc.update("update runs set status='RELEASING', current_step=null where id=?", id);
        assertThat(create(p, null, null).getStatusCode().value()).as("still blocked until scaffolded").isEqualTo(409);
        assertThat(internal(HttpMethod.POST, "/internal/v1/runs/" + id + "/release", Map.of("summary", "scaffolded")).getStatusCode().value()).isEqualTo(200);
        assertThat(create(p, null, null).getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void blueprintCannotBeSetToAuto() {
        assertThat(create("proj_bp2", "BLUEPRINT", Map.of("BLUEPRINT", "AUTO")).getStatusCode().value()).isEqualTo(400);
        assertThat(create("proj_bp2", "blueprint", null).getStatusCode().value()).isEqualTo(200);
    }
}

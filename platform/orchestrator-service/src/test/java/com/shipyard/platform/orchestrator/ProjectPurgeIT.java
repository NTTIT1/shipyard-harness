package com.shipyard.platform.orchestrator;

import com.shipyard.platform.orchestrator.domain.GateMode;
import com.shipyard.platform.orchestrator.domain.Step;
import com.shipyard.platform.orchestrator.entity.GatePolicy;
import com.shipyard.platform.orchestrator.repository.GatePolicyRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Deleting a project purges its runs, steps, revisions, approvals, gate policy and pending outbox events. */
class ProjectPurgeIT extends OrchestratorIT {

    @Autowired GatePolicyRepository policies;

    String run(String project) {
        ResponseEntity<Map> r = internal(HttpMethod.POST, "/internal/v1/runs", Map.of(
                "projectId", project, "laneRef", "host:lane1", "title", "T", "description", "", "createdBy", "usr_owner"));
        String id = (String) ((Map) data(r)).get("id");
        internal(HttpMethod.GET, "/internal/v1/runs/" + id + "/next", null);
        internal(HttpMethod.POST, "/internal/v1/runs/" + id + "/steps/PM/submit", Map.of(
                "summary", "s", "documents", Map.of("spec.md", "# S"), "images", List.of(), "meta", Map.of(), "contextUsed", List.of()));
        return id;
    }

    long count(String table, String where, Object arg) {
        return jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE " + where, Long.class, arg);
    }

    @Test
    void purgesOnlyTheGivenProject() {
        String dead = run("proj_dead"), alive = run("proj_alive");
        policies.save(new GatePolicy("proj_dead", Step.PM, GateMode.AUTO));
        policies.save(new GatePolicy("proj_alive", Step.PM, GateMode.AUTO));
        jdbc.update("INSERT INTO outbox_events(event_id, type, payload) VALUES ('e1', 'STEP_APPROVED', '{\"projectId\":\"proj_dead\"}'::jsonb)");

        ResponseEntity<Map> r = internal(HttpMethod.DELETE, "/internal/v1/projects/proj_dead", null);
        assertThat(r.getStatusCode().value()).isEqualTo(200);
        assertThat((Map<String, Integer>) data(r)).containsEntry("runs", 1);

        assertThat(count("runs", "id = ?", dead)).isZero();
        assertThat(count("run_steps", "run_id = ?", dead)).isZero();
        assertThat(count("step_revisions", "run_id = ?", dead)).isZero();
        assertThat(count("approval_requests", "project_id = ?", "proj_dead")).isZero();
        assertThat(count("gate_policies", "project_id = ?", "proj_dead")).isZero();
        assertThat(count("outbox_events", "payload->>'projectId' = ?", "proj_dead")).isZero();

        assertThat(count("runs", "id = ?", alive)).isEqualTo(1);
        assertThat(count("step_revisions", "run_id = ?", alive)).isPositive();
        assertThat(count("gate_policies", "project_id = ?", "proj_alive")).isEqualTo(1);
    }

    @Test
    void unknownProjectIsANoOpAndTheTokenIsRequired() {
        assertThat(internal(HttpMethod.DELETE, "/internal/v1/projects/proj_none", null).getStatusCode().value()).isEqualTo(200);
        assertThat(rest.exchange("/internal/v1/projects/proj_none", HttpMethod.GET,
                new HttpEntity<>(new HttpHeaders()), Map.class).getStatusCode().value()).isEqualTo(401);
    }
}

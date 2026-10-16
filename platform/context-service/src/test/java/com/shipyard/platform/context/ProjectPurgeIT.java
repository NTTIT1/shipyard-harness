package com.shipyard.platform.context;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Deleting a project removes its memory (items, chunks, entities, edges) and nothing else. */
class ProjectPurgeIT extends ContextIT {

    void approve(String project, String eventId) {
        internal(HttpMethod.POST, "/internal/v1/memory/events", Map.of("eventId", eventId, "type", "STEP_APPROVED",
                "payload", Map.of("projectId", project, "runId", "run_" + project, "runTitle", "T", "step", "ARCH",
                        "revisionId", "rev_" + project, "revisionNo", 1,
                        "documents", Map.of("plan.md", "# Plan", "entities.json",
                                "{\"entities\":[{\"type\":\"API\",\"name\":\"POST /logout\"}],\"relations\":[{\"from\":\"FEATURE:this\",\"to\":\"API:POST /logout\",\"type\":\"TOUCHES\"}]}"))));
    }

    long count(String table, String project) {
        return db.sql("select count(*) from " + table + " where project_id = ?").param(project).query(Long.class).single();
    }

    @Test
    void purgesOneProjectsMemory() {
        approve("proj_dead", "e1");
        approve("proj_alive", "e2");
        assertThat(count("memory_items", "proj_dead")).isPositive();

        ResponseEntity<Map> r = internal(HttpMethod.DELETE, "/internal/v1/projects/proj_dead/memory", null);
        assertThat(r.getStatusCode().value()).isEqualTo(200);
        for (String t : new String[]{"memory_items", "memory_chunks", "memory_entities", "memory_edges"}) {
            assertThat(count(t, "proj_dead")).as(t).isZero();
        }
        assertThat(count("memory_items", "proj_alive")).isPositive();
        assertThat(count("memory_chunks", "proj_alive")).isPositive();
    }
}

package com.shipyard.platform.orchestrator.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;

/** Removes everything the orchestrator holds for a deleted project (called by project-service). */
@Service
public class ProjectPurge {

    private final JdbcTemplate jdbc;

    public ProjectPurge(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public Map<String, Integer> purge(String projectId) {
        Map<String, Integer> n = new LinkedHashMap<>();
        String runs = "SELECT id FROM runs WHERE project_id = ?";
        n.put("outboxEvents", jdbc.update("DELETE FROM outbox_events WHERE payload->>'projectId' = ? OR payload->>'runId' IN (" + runs + ")",
                projectId, projectId));
        n.put("approvals", jdbc.update("DELETE FROM approval_requests WHERE project_id = ? OR run_id IN (" + runs + ")", projectId, projectId));
        n.put("revisions", jdbc.update("DELETE FROM step_revisions WHERE run_id IN (" + runs + ")", projectId));
        n.put("steps", jdbc.update("DELETE FROM run_steps WHERE run_id IN (" + runs + ")", projectId));
        n.put("runs", jdbc.update("DELETE FROM runs WHERE project_id = ?", projectId));
        n.put("gatePolicies", jdbc.update("DELETE FROM gate_policies WHERE project_id = ?", projectId));
        n.put("deliveryPolicies", jdbc.update("DELETE FROM delivery_policies WHERE project_id = ?", projectId));
        return n;
    }
}

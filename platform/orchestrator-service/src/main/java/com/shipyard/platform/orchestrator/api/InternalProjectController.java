package com.shipyard.platform.orchestrator.api;

import com.shipyard.platform.common.directory.ProjectDirectory;
import com.shipyard.platform.common.dto.ApiResponse;
import com.shipyard.platform.orchestrator.service.ProjectPurge;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** project-service → orchestrator when a project is deleted (guarded by ServiceTokenFilter). */
@RestController
@RequestMapping("/internal/v1/projects")
public class InternalProjectController {

    private final ProjectPurge purge;
    private final ProjectDirectory directory;

    public InternalProjectController(ProjectPurge purge, ProjectDirectory directory) {
        this.purge = purge;
        this.directory = directory;
    }

    @DeleteMapping("/{projectId}")
    public ApiResponse<Map<String, Integer>> delete(@PathVariable String projectId) {
        Map<String, Integer> removed = purge.purge(projectId);
        directory.evict(projectId, null);
        return ApiResponse.ok(removed);
    }
}

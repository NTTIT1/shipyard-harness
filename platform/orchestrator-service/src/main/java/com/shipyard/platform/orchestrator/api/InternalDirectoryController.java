package com.shipyard.platform.orchestrator.api;

import com.shipyard.platform.common.dto.ApiResponse;
import com.shipyard.platform.common.exception.BadRequestException;
import com.shipyard.platform.common.directory.ProjectDirectory;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** project-service calls this after a membership change so new roles apply immediately, not after the cache TTL. */
@RestController
@RequestMapping("/internal/v1/directory")
public class InternalDirectoryController {
    private final ProjectDirectory directory;

    public InternalDirectoryController(ProjectDirectory directory) { this.directory = directory; }

    public record EvictRequest(String projectId, String userId) {}

    @PostMapping("/evict")
    public ApiResponse<Void> evict(@RequestBody EvictRequest req) {
        if (req.projectId() == null || req.projectId().isBlank()) throw new BadRequestException("projectId is required");
        directory.evict(req.projectId(), req.userId() == null || req.userId().isBlank() ? null : req.userId());
        return ApiResponse.ok(null);
    }
}

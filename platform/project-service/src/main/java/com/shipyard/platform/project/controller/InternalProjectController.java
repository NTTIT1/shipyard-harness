package com.shipyard.platform.project.controller;

import com.shipyard.platform.common.dto.ApiResponse;
import com.shipyard.platform.project.dto.MembershipDto;
import com.shipyard.platform.project.service.ProjectService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** Harness/service-only membership queries (guarded by ServiceTokenFilter, not routed by the gateway). */
@RestController
@RequestMapping("/internal/v1")
public class InternalProjectController {

    private final ProjectService projectService;

    public InternalProjectController(ProjectService projectService) {
        this.projectService = projectService;
    }

    @GetMapping("/projects/{projectId}/members/{userId}/roles")
    public ApiResponse<List<String>> roles(@PathVariable String projectId, @PathVariable String userId) {
        return ApiResponse.ok(projectService.rolesOf(projectId, userId));
    }

    @GetMapping("/projects/{projectId}/role-holders")
    public ApiResponse<Map<String, Long>> roleHolders(@PathVariable String projectId) {
        return ApiResponse.ok(projectService.roleHolders(projectId));
    }

    @GetMapping("/users/{userId}/memberships")
    public ApiResponse<List<MembershipDto>> memberships(@PathVariable String userId) {
        return ApiResponse.ok(projectService.membershipsOf(userId));
    }
}

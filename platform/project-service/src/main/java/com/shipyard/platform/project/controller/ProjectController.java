package com.shipyard.platform.project.controller;

import com.shipyard.platform.common.dto.ApiResponse;
import com.shipyard.platform.common.dto.ProjectDto;
import com.shipyard.platform.common.security.SecurityConstants;
import com.shipyard.platform.project.dto.CreateProjectRequest;
import com.shipyard.platform.project.dto.MemberRequest;
import com.shipyard.platform.project.service.ProjectService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/projects")
public class ProjectController {

    private final ProjectService projectService;

    public ProjectController(ProjectService projectService) {
        this.projectService = projectService;
    }

    @PostMapping
    public ResponseEntity<ApiResponse<ProjectDto>> createProject(
            @RequestHeader(SecurityConstants.HEADER_USER_ID) String userId,
            @Valid @RequestBody CreateProjectRequest request) {
        ProjectDto created = projectService.createProject(userId, request);
        return ResponseEntity.ok(ApiResponse.ok("Project created successfully", created));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<ProjectDto>>> listProjects(
            @RequestHeader(SecurityConstants.HEADER_USER_ID) String userId) {
        List<ProjectDto> list = projectService.listUserProjects(userId);
        return ResponseEntity.ok(ApiResponse.ok(list));
    }

    @GetMapping("/{projectIdOrSlug}")
    public ResponseEntity<ApiResponse<ProjectDto>> getProject(
            @RequestHeader(SecurityConstants.HEADER_USER_ID) String userId,
            @PathVariable String projectIdOrSlug) {
        ProjectDto project = projectService.getProject(userId, projectIdOrSlug);
        return ResponseEntity.ok(ApiResponse.ok(project));
    }

    @PostMapping("/{projectId}/members")
    public ResponseEntity<ApiResponse<String>> addMember(
            @RequestHeader(SecurityConstants.HEADER_USER_ID) String userId,
            @PathVariable String projectId,
            @Valid @RequestBody MemberRequest request) {
        projectService.addOrUpdateMember(userId, projectId, request.getUserId(), request.getRole());
        return ResponseEntity.ok(ApiResponse.ok("Member added/updated successfully", "OK"));
    }

    @DeleteMapping("/{projectId}/members/{targetUserId}")
    public ResponseEntity<ApiResponse<String>> removeMember(
            @RequestHeader(SecurityConstants.HEADER_USER_ID) String userId,
            @PathVariable String projectId,
            @PathVariable String targetUserId) {
        projectService.removeMember(userId, projectId, targetUserId);
        return ResponseEntity.ok(ApiResponse.ok("Member removed successfully", "OK"));
    }

    @GetMapping("/{projectId}/check-permission")
    public ResponseEntity<ApiResponse<Map<String, Object>>> checkPermission(
            @RequestHeader(SecurityConstants.HEADER_USER_ID) String userId,
            @PathVariable String projectId,
            @RequestParam String action) {
        boolean allowed = projectService.checkUserPermission(userId, projectId, action);
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "userId", userId,
                "projectId", projectId,
                "action", action,
                "allowed", allowed
        )));
    }
}

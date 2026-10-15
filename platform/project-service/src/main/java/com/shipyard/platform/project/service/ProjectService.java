package com.shipyard.platform.project.service;

import com.shipyard.platform.common.dto.ProjectDto;
import com.shipyard.platform.common.enums.ProjectRole;
import com.shipyard.platform.common.exception.BusinessException;
import com.shipyard.platform.common.exception.ForbiddenException;
import com.shipyard.platform.common.exception.ResourceNotFoundException;
import com.shipyard.platform.project.dto.CreateProjectRequest;
import com.shipyard.platform.project.entity.Project;
import com.shipyard.platform.project.entity.ProjectMember;
import com.shipyard.platform.project.repository.ProjectMemberRepository;
import com.shipyard.platform.project.repository.ProjectRepository;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final StringRedisTemplate redisTemplate;

    public ProjectService(ProjectRepository projectRepository,
                          ProjectMemberRepository projectMemberRepository,
                          StringRedisTemplate redisTemplate) {
        this.projectRepository = projectRepository;
        this.projectMemberRepository = projectMemberRepository;
        this.redisTemplate = redisTemplate;
    }

    @Transactional
    public ProjectDto createProject(String currentUserId, CreateProjectRequest request) {
        if (projectRepository.existsBySlug(request.getSlug())) {
            throw new BusinessException("Project slug already exists: " + request.getSlug());
        }

        String projectId = "proj_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        Project project = new Project(
                projectId,
                request.getSlug(),
                request.getName(),
                request.getRepoUrl(),
                request.getDefaultBranch()
        );
        project.setFigmaFileKey(request.getFigmaFileKey());
        projectRepository.save(project);

        // Creator becomes OWNER
        ProjectMember owner = new ProjectMember(projectId, currentUserId, ProjectRole.OWNER);
        projectMemberRepository.save(owner);

        // Invalidate cache
        clearPermissionCache(currentUserId, projectId);

        ProjectDto dto = toDto(project);
        dto.setCurrentUserRole(ProjectRole.OWNER.name());
        return dto;
    }

    public ProjectDto getProject(String currentUserId, String projectIdOrSlug) {
        Project project = findProjectByIdOrSlug(projectIdOrSlug);
        ProjectMember member = projectMemberRepository.findByIdProjectIdAndIdUserId(project.getId(), currentUserId)
                .orElseThrow(() -> new ResourceNotFoundException("Project not found")); // 404 for security

        ProjectDto dto = toDto(project);
        dto.setCurrentUserRole(member.getRole().name());
        return dto;
    }

    public List<ProjectDto> listUserProjects(String currentUserId) {
        List<ProjectMember> memberships = projectMemberRepository.findByIdUserId(currentUserId);
        return memberships.stream().map(m -> {
            Optional<Project> pOpt = projectRepository.findById(m.getId().getProjectId());
            if (pOpt.isPresent()) {
                ProjectDto dto = toDto(pOpt.get());
                dto.setCurrentUserRole(m.getRole().name());
                return dto;
            }
            return null;
        }).filter(java.util.Objects::nonNull).collect(Collectors.toList());
    }

    @Transactional
    public void addOrUpdateMember(String currentUserId, String projectId, String targetUserId, ProjectRole role) {
        requirePermission(currentUserId, projectId, "member:manage");

        ProjectMember member = projectMemberRepository.findByIdProjectIdAndIdUserId(projectId, targetUserId)
                .orElse(new ProjectMember(projectId, targetUserId, role));
        member.setRole(role);
        projectMemberRepository.save(member);

        clearPermissionCache(targetUserId, projectId);
    }

    @Transactional
    public void removeMember(String currentUserId, String projectId, String targetUserId) {
        requirePermission(currentUserId, projectId, "member:manage");
        projectMemberRepository.deleteByIdProjectIdAndIdUserId(projectId, targetUserId);
        clearPermissionCache(targetUserId, projectId);
    }

    public boolean checkUserPermission(String userId, String projectId, String action) {
        String cacheKey = "perm:" + userId + ":" + projectId + ":" + action;
        String cached = redisTemplate.opsForValue().get(cacheKey);
        if (cached != null) {
            return "ALLOW".equals(cached);
        }

        Optional<ProjectMember> memberOpt = projectMemberRepository.findByIdProjectIdAndIdUserId(projectId, userId);
        boolean allowed = memberOpt.map(m -> m.getRole().hasPermission(action)).orElse(false);

        redisTemplate.opsForValue().set(cacheKey, allowed ? "ALLOW" : "DENY", Duration.ofSeconds(60));
        return allowed;
    }

    public void requirePermission(String userId, String projectId, String action) {
        if (!checkUserPermission(userId, projectId, action)) {
            throw new ForbiddenException("Forbidden: missing permission " + action);
        }
    }

    private void clearPermissionCache(String userId, String projectId) {
        try {
            java.util.Set<String> keys = redisTemplate.keys("perm:" + userId + ":" + projectId + ":*");
            if (keys != null && !keys.isEmpty()) {
                redisTemplate.delete(keys);
            }
        } catch (Exception ignored) {}
    }

    private Project findProjectByIdOrSlug(String idOrSlug) {
        return projectRepository.findById(idOrSlug)
                .or(() -> projectRepository.findBySlug(idOrSlug))
                .orElseThrow(() -> new ResourceNotFoundException("Project not found"));
    }

    private ProjectDto toDto(Project project) {
        ProjectDto dto = new ProjectDto();
        dto.setId(project.getId());
        dto.setSlug(project.getSlug());
        dto.setName(project.getName());
        dto.setRepoUrl(project.getRepoUrl());
        dto.setDefaultBranch(project.getDefaultBranch());
        dto.setFigmaFileKey(project.getFigmaFileKey());
        dto.setMonthlyBudgetUsd(project.getMonthlyBudgetUsd());
        dto.setStatus(project.getStatus());
        dto.setCreatedAt(project.getCreatedAt());
        return dto;
    }
}

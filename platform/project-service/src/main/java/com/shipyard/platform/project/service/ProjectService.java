package com.shipyard.platform.project.service;

import com.shipyard.platform.common.dto.ProjectDto;
import com.shipyard.platform.common.enums.ProjectRole;
import com.shipyard.platform.common.exception.BusinessException;
import com.shipyard.platform.common.exception.ConflictException;
import com.shipyard.platform.common.exception.ForbiddenException;
import com.shipyard.platform.common.exception.ResourceNotFoundException;
import com.shipyard.platform.project.dto.CreateProjectRequest;
import com.shipyard.platform.project.dto.MembershipDto;
import com.shipyard.platform.project.entity.Project;
import com.shipyard.platform.project.event.MembershipChanged;
import com.shipyard.platform.project.entity.ProjectMember;
import com.shipyard.platform.project.repository.ProjectMemberRepository;
import com.shipyard.platform.project.repository.ProjectRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final StringRedisTemplate redisTemplate;
    private final ApplicationEventPublisher events;

    public ProjectService(ProjectRepository projectRepository,
                          ProjectMemberRepository projectMemberRepository,
                          StringRedisTemplate redisTemplate,
                          ApplicationEventPublisher events) {
        this.projectRepository = projectRepository;
        this.projectMemberRepository = projectMemberRepository;
        this.redisTemplate = redisTemplate;
        this.events = events;
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
        events.publishEvent(new MembershipChanged(projectId, currentUserId));

        ProjectDto dto = toDto(project);
        dto.setCurrentUserRole(ProjectRole.OWNER.name());
        return dto;
    }

    public ProjectDto getProject(String currentUserId, String projectIdOrSlug) {
        Project project = findProjectByIdOrSlug(projectIdOrSlug);
        List<String> roles = rolesOf(project.getId(), currentUserId);
        if (roles.isEmpty()) throw new ResourceNotFoundException("Project not found"); // 404 for security
        ProjectDto dto = toDto(project);
        dto.setCurrentUserRole(roles.get(0));
        dto.setCurrentUserRoles(roles);
        return dto;
    }

    public List<ProjectDto> listUserProjects(String currentUserId) {
        List<ProjectDto> out = new ArrayList<>();
        for (MembershipDto m : membershipsOf(currentUserId)) {
            projectRepository.findById(m.projectId()).ifPresent(p -> {
                ProjectDto dto = toDto(p);
                dto.setCurrentUserRole(m.roles().get(0));
                dto.setCurrentUserRoles(m.roles());
                out.add(dto);
            });
        }
        return out;
    }

    /** Replaces the target user's role set in the project. */
    @Transactional
    public void setMemberRoles(String currentUserId, String projectId, String targetUserId, Set<ProjectRole> roles) {
        requirePermission(currentUserId, projectId, "member:manage");
        boolean wasOwner = rolesOf(projectId, targetUserId).contains(ProjectRole.OWNER.name());
        if (wasOwner && !roles.contains(ProjectRole.OWNER) && ownerCount(projectId) <= 1) {
            throw new ConflictException("A project must keep at least one OWNER");
        }
        projectMemberRepository.deleteByIdProjectIdAndIdUserId(projectId, targetUserId);
        projectMemberRepository.flush();
        for (ProjectRole r : roles) projectMemberRepository.save(new ProjectMember(projectId, targetUserId, r));
        clearPermissionCache(targetUserId, projectId);
        events.publishEvent(new MembershipChanged(projectId, targetUserId));
    }

    @Transactional
    public void removeMember(String currentUserId, String projectId, String targetUserId) {
        requirePermission(currentUserId, projectId, "member:manage");
        if (rolesOf(projectId, targetUserId).contains(ProjectRole.OWNER.name()) && ownerCount(projectId) <= 1) {
            throw new ConflictException("A project must keep at least one OWNER");
        }
        projectMemberRepository.deleteByIdProjectIdAndIdUserId(projectId, targetUserId);
        clearPermissionCache(targetUserId, projectId);
        events.publishEvent(new MembershipChanged(projectId, targetUserId));
    }

    public boolean checkUserPermission(String userId, String projectId, String action) {
        String cacheKey = "perm:" + userId + ":" + projectId + ":" + action;
        String cached = redisTemplate.opsForValue().get(cacheKey);
        if (cached != null) {
            return "ALLOW".equals(cached);
        }
        boolean allowed = projectMemberRepository.findByIdProjectIdAndIdUserId(projectId, userId).stream()
                .anyMatch(m -> m.getRole().hasPermission(action));
        redisTemplate.opsForValue().set(cacheKey, allowed ? "ALLOW" : "DENY", Duration.ofSeconds(60));
        return allowed;
    }

    /** Roles in enum order (OWNER first), empty when not a member. */
    public List<String> rolesOf(String projectId, String userId) {
        return projectMemberRepository.findByIdProjectIdAndIdUserId(projectId, userId).stream()
                .map(ProjectMember::getRole).sorted().map(Enum::name).toList();
    }

    public Map<String, Long> roleHolders(String projectId) {
        return projectMemberRepository.findByIdProjectId(projectId).stream()
                .collect(Collectors.groupingBy(m -> m.getRole().name(), TreeMap::new, Collectors.counting()));
    }

    public List<MembershipDto> membershipsOf(String userId) {
        Map<String, List<String>> byProject = new LinkedHashMap<>();
        projectMemberRepository.findByIdUserId(userId).stream()
                .sorted(Comparator.comparing(ProjectMember::getRole))
                .forEach(m -> byProject.computeIfAbsent(m.getId().getProjectId(), k -> new ArrayList<>()).add(m.getRole().name()));
        return byProject.entrySet().stream().map(e -> new MembershipDto(e.getKey(), e.getValue())).toList();
    }

    private long ownerCount(String projectId) {
        return projectMemberRepository.findByIdProjectId(projectId).stream()
                .filter(m -> m.getRole() == ProjectRole.OWNER).count();
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

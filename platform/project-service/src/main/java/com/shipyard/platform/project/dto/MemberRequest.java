package com.shipyard.platform.project.dto;

import com.shipyard.platform.common.enums.ProjectRole;
import com.shipyard.platform.common.exception.BadRequestException;
import jakarta.validation.constraints.NotBlank;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

public class MemberRequest {
    @NotBlank(message = "User ID is required")
    private String userId;

    /** Legacy single role; ignored when {@code roles} is given. */
    private ProjectRole role;

    private List<ProjectRole> roles;

    public MemberRequest() {}

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public ProjectRole getRole() { return role; }
    public void setRole(ProjectRole role) { this.role = role; }

    public List<ProjectRole> getRoles() { return roles; }
    public void setRoles(List<ProjectRole> roles) { this.roles = roles; }

    public Set<ProjectRole> effectiveRoles() {
        if (roles != null && !roles.isEmpty()) return EnumSet.copyOf(roles);
        if (role != null) return EnumSet.of(role);
        throw new BadRequestException("roles: at least one role is required");
    }
}

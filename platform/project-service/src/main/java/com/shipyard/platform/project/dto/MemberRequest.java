package com.shipyard.platform.project.dto;

import com.shipyard.platform.common.enums.ProjectRole;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class MemberRequest {
    @NotBlank(message = "User ID is required")
    private String userId;

    @NotNull(message = "Role is required")
    private ProjectRole role;

    public MemberRequest() {}

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public ProjectRole getRole() { return role; }
    public void setRole(ProjectRole role) { this.role = role; }
}

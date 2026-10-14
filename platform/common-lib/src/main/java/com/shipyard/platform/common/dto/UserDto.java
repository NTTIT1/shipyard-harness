package com.shipyard.platform.common.dto;

import com.shipyard.platform.common.enums.SystemRole;
import java.time.Instant;

public class UserDto {
    private String id;
    private String email;
    private String fullName;
    private SystemRole systemRole;
    private String status;
    private Instant createdAt;

    public UserDto() {}

    public UserDto(String id, String email, String fullName, SystemRole systemRole, String status, Instant createdAt) {
        this.id = id;
        this.email = email;
        this.fullName = fullName;
        this.systemRole = systemRole;
        this.status = status;
        this.createdAt = createdAt;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }

    public SystemRole getSystemRole() { return systemRole; }
    public void setSystemRole(SystemRole systemRole) { this.systemRole = systemRole; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}

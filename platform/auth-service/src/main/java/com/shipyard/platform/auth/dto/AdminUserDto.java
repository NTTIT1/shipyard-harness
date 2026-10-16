package com.shipyard.platform.auth.dto;

import com.shipyard.platform.common.enums.SystemRole;

import java.time.Instant;

/** Full user row as the admin screen sees it (never the password hash). */
public record AdminUserDto(String id, String email, String fullName, SystemRole systemRole, String status,
                           Instant lockedUntil, Instant createdAt) {
}

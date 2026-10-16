package com.shipyard.platform.auth.dto;

import jakarta.validation.constraints.Size;

/** Partial update: null fields are left unchanged. */
public record UpdateUserRequest(@Size(min = 1, max = 120) String fullName, String systemRole, String status) {
}

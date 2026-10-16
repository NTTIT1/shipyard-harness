package com.shipyard.platform.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateUserRequest(
        @NotBlank(message = "Email is required") @Email(message = "Email must be valid") String email,
        @NotBlank(message = "Password is required") @Size(min = 8, max = 128, message = "Password must be 8-128 characters") String password,
        @NotBlank(message = "Full name is required") @Size(max = 120) String fullName,
        String systemRole) {
}

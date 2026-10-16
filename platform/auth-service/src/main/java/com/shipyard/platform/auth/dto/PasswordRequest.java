package com.shipyard.platform.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PasswordRequest(
        @NotBlank(message = "Password is required") @Size(min = 8, max = 128, message = "Password must be 8-128 characters") String password) {
}

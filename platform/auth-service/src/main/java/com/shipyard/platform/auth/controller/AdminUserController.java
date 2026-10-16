package com.shipyard.platform.auth.controller;

import com.shipyard.platform.auth.dto.AdminUserDto;
import com.shipyard.platform.auth.dto.ChangePasswordRequest;
import com.shipyard.platform.auth.dto.CreateUserRequest;
import com.shipyard.platform.auth.dto.PasswordRequest;
import com.shipyard.platform.auth.dto.UpdateUserRequest;
import com.shipyard.platform.auth.service.UserAdminService;
import com.shipyard.platform.common.dto.ApiResponse;
import com.shipyard.platform.common.security.SecurityConstants;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Account administration (SYS_ADMIN only) and the caller's own password change. */
@RestController
@RequestMapping("/api/v1/auth")
public class AdminUserController {

    private final UserAdminService service;

    public AdminUserController(UserAdminService service) {
        this.service = service;
    }

    @GetMapping("/admin/users")
    public ResponseEntity<ApiResponse<List<AdminUserDto>>> list(
            @RequestHeader(value = SecurityConstants.HEADER_USER_ID, required = false) String actor) {
        return ResponseEntity.ok(ApiResponse.ok(service.list(actor)));
    }

    @PostMapping("/admin/users")
    public ResponseEntity<ApiResponse<AdminUserDto>> create(
            @RequestHeader(value = SecurityConstants.HEADER_USER_ID, required = false) String actor,
            @Valid @RequestBody CreateUserRequest body) {
        return ResponseEntity.ok(ApiResponse.ok("User created", service.create(actor, body)));
    }

    @PatchMapping("/admin/users/{userId}")
    public ResponseEntity<ApiResponse<AdminUserDto>> update(
            @RequestHeader(value = SecurityConstants.HEADER_USER_ID, required = false) String actor,
            @PathVariable String userId, @Valid @RequestBody UpdateUserRequest body) {
        return ResponseEntity.ok(ApiResponse.ok("User updated", service.update(actor, userId, body)));
    }

    @PostMapping("/admin/users/{userId}/password")
    public ResponseEntity<ApiResponse<Void>> resetPassword(
            @RequestHeader(value = SecurityConstants.HEADER_USER_ID, required = false) String actor,
            @PathVariable String userId, @Valid @RequestBody PasswordRequest body) {
        service.resetPassword(actor, userId, body.password());
        return ResponseEntity.ok(ApiResponse.ok("Password reset", null));
    }

    @PostMapping("/me/password")
    public ResponseEntity<ApiResponse<Void>> changeOwnPassword(
            @RequestHeader(value = SecurityConstants.HEADER_USER_ID, required = false) String actor,
            @Valid @RequestBody ChangePasswordRequest body) {
        service.changeOwnPassword(actor, body.currentPassword(), body.newPassword());
        return ResponseEntity.ok(ApiResponse.ok("Password changed", null));
    }
}

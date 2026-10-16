package com.shipyard.platform.auth.controller;

import com.shipyard.platform.auth.dto.AuthResponse;
import com.shipyard.platform.auth.dto.LoginRequest;
import com.shipyard.platform.auth.dto.RegisterRequest;
import com.shipyard.platform.auth.service.AuthService;
import com.shipyard.platform.common.dto.ApiResponse;
import com.shipyard.platform.common.dto.UserDto;
import com.shipyard.platform.common.security.SecurityConstants;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<AuthResponse>> register(@Valid @RequestBody RegisterRequest request) {
        AuthResponse response = authService.register(request);
        return ResponseEntity.ok(ApiResponse.ok("User registered successfully", response));
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(@Valid @RequestBody LoginRequest request) {
        AuthResponse response = authService.login(request);
        return ResponseEntity.ok(ApiResponse.ok("Login successful", response));
    }

    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<AuthResponse>> refresh(@RequestBody Map<String, String> request) {
        String refreshToken = request.get("refreshToken");
        AuthResponse response = authService.refreshToken(refreshToken);
        return ResponseEntity.ok(ApiResponse.ok("Token refreshed", response));
    }

    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(@RequestBody(required = false) Map<String, String> request) {
        authService.logout(request != null ? request.get("refreshToken") : null);
        return ResponseEntity.ok(ApiResponse.ok("Logged out", null));
    }

    /** Public profiles of the given users (member lists). Requires a signed-in caller (gateway sets X-User-Id). */
    @GetMapping("/users")
    public ResponseEntity<ApiResponse<java.util.List<UserDto>>> users(
            @RequestHeader(SecurityConstants.HEADER_USER_ID) String userId, @RequestParam java.util.List<String> ids) {
        return ResponseEntity.ok(ApiResponse.ok(authService.findUsers(ids)));
    }

    /** Exact (case-insensitive) e-mail lookup, used to add a member. */
    @GetMapping("/users/lookup")
    public ResponseEntity<ApiResponse<UserDto>> lookup(
            @RequestHeader(SecurityConstants.HEADER_USER_ID) String userId, @RequestParam String email) {
        return ResponseEntity.ok(ApiResponse.ok(authService.lookupByEmail(email)));
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserDto>> getCurrentUser(
            @RequestHeader(value = SecurityConstants.HEADER_USER_ID, required = false) String userId) {
        if (userId == null || userId.isBlank()) {
            return ResponseEntity.status(401).body(ApiResponse.error("Unauthorized"));
        }
        UserDto profile = authService.getUserProfile(userId);
        return ResponseEntity.ok(ApiResponse.ok(profile));
    }
}

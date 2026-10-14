package com.shipyard.platform.common.security;

public final class SecurityConstants {
    private SecurityConstants() {}

    public static final String HEADER_USER_ID = "X-User-Id";
    public static final String HEADER_USER_EMAIL = "X-User-Email";
    public static final String HEADER_USER_ROLE = "X-User-Role";
    public static final String AUTHORIZATION_HEADER = "Authorization";
    public static final String BEARER_PREFIX = "Bearer ";

    // Standard 256-bit secret for local development/staging
    public static final String DEFAULT_JWT_SECRET = "shipyard-super-secret-key-that-is-at-least-256-bits-long-for-hmac-sha256";
    public static final long ACCESS_TOKEN_VALIDITY_SECONDS = 15 * 60; // 15 mins
    public static final long REFRESH_TOKEN_VALIDITY_SECONDS = 7 * 24 * 60 * 60; // 7 days
}

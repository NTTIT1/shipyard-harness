package com.shipyard.platform.common.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Guards /internal/** (harness ↔ service calls) with a shared secret header. Those paths are
 * never routed by the api-gateway, so user JWTs never reach them. A blank configured token
 * rejects everything (fail closed).
 */
public class ServiceTokenFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Service-Token";

    private final byte[] expected;

    public ServiceTokenFilter(String token) {
        this.expected = token == null ? new byte[0] : token.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // servletPath is decoded and normalized by the container, unlike getRequestURI().
        return !request.getServletPath().startsWith("/internal/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String given = request.getHeader(HEADER);
        if (expected.length == 0 || given == null
                || !MessageDigest.isEqual(expected, given.getBytes(StandardCharsets.UTF_8))) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter().write("{\"success\":false,\"message\":\"Invalid service token\",\"data\":null}");
            return;
        }
        chain.doFilter(request, response);
    }
}

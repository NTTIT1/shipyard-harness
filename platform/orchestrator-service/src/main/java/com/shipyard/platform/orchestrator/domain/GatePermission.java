package com.shipyard.platform.orchestrator.domain;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Who may decide a gate (spec §3.5): the role holder, else OWNER when nobody holds the role. */
public final class GatePermission {
    private GatePermission() {}

    public static final String OWNER_FALLBACK = "OWNER_FALLBACK";

    public static Optional<String> decideAs(List<String> userRoles, Map<String, Long> holders, String requiredRole) {
        if (userRoles.contains(requiredRole)) return Optional.of(requiredRole);
        if (userRoles.contains("OWNER") && holders.getOrDefault(requiredRole, 0L) == 0L) return Optional.of(OWNER_FALLBACK);
        return Optional.empty();
    }
}

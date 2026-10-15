package com.shipyard.platform.orchestrator;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** In-memory stand-in for project-service membership. */
public class FakeProjectDirectory {
    private final Map<String, Map<String, List<String>>> grants = new ConcurrentHashMap<>(); // project → user → roles

    public void reset() { grants.clear(); }

    public void grant(String projectId, String userId, String... roles) {
        grants.computeIfAbsent(projectId, k -> new ConcurrentHashMap<>()).put(userId, List.of(roles));
    }

    public List<String> rolesOf(String projectId, String userId) {
        return grants.getOrDefault(projectId, Map.of()).getOrDefault(userId, List.of());
    }

    public Map<String, Long> roleHolders(String projectId) {
        Map<String, Long> out = new TreeMap<>();
        grants.getOrDefault(projectId, Map.of()).values().forEach(rs -> rs.forEach(r -> out.merge(r, 1L, Long::sum)));
        return out;
    }
}

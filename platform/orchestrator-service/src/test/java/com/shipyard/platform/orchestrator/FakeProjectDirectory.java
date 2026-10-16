package com.shipyard.platform.orchestrator;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** In-memory stand-in for project-service membership. */
public class FakeProjectDirectory implements com.shipyard.platform.orchestrator.directory.ProjectDirectory {
    private final Map<String, Map<String, List<String>>> grants = new ConcurrentHashMap<>(); // project → user → roles

    /** "projectId|userId" of every evict call, for assertions. */
    public final List<String> evictions = new java.util.concurrent.CopyOnWriteArrayList<>();

    public void reset() { grants.clear(); evictions.clear(); }

    @Override
    public void evict(String projectId, String userId) { evictions.add(projectId + "|" + userId); }

    public void grant(String projectId, String userId, String... roles) {
        grants.computeIfAbsent(projectId, k -> new ConcurrentHashMap<>()).put(userId, List.of(roles));
    }

    @Override
    public List<String> rolesOf(String projectId, String userId) {
        return grants.getOrDefault(projectId, Map.of()).getOrDefault(userId, List.of());
    }

    @Override
    public Map<String, Long> roleHolders(String projectId) {
        Map<String, Long> out = new TreeMap<>();
        grants.getOrDefault(projectId, Map.of()).values().forEach(rs -> rs.forEach(r -> out.merge(r, 1L, Long::sum)));
        return out;
    }

    @Override
    public List<Membership> membershipsOf(String userId) {
        List<Membership> out = new ArrayList<>();
        grants.forEach((project, users) -> {
            List<String> roles = users.get(userId);
            if (roles != null) out.add(new Membership(project, roles));
        });
        return out;
    }
}

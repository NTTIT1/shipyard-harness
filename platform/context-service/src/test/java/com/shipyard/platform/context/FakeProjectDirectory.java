package com.shipyard.platform.context;

import com.shipyard.platform.common.directory.ProjectDirectory;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** In-memory stand-in for project-service membership. */
public class FakeProjectDirectory implements ProjectDirectory {
    private final Map<String, Map<String, List<String>>> grants = new ConcurrentHashMap<>();

    public void reset() { grants.clear(); }

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
        grants.forEach((p, users) -> { if (users.containsKey(userId)) out.add(new Membership(p, users.get(userId))); });
        return out;
    }
}

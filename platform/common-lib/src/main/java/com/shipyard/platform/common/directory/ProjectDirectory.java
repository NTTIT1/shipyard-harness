package com.shipyard.platform.common.directory;

import java.util.List;
import java.util.Map;

/** Project membership as seen by the orchestrator (backed by project-service). */
public interface ProjectDirectory {
    /** Roles of the user in the project; empty = not a member. */
    List<String> rolesOf(String projectId, String userId);

    /** Role → number of distinct members holding it. */
    Map<String, Long> roleHolders(String projectId);

    List<Membership> membershipsOf(String userId);

    /**
     * Drops cached membership for a project/user after project-service changed it.
     * A null userId means every user of the project.
     */
    default void evict(String projectId, String userId) {}

    record Membership(String projectId, List<String> roles) {}
}

package com.shipyard.platform.project.event;

/** A user's roles in a project changed (granted, replaced or removed). */
public record MembershipChanged(String projectId, String userId) {}

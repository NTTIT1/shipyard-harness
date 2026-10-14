package com.shipyard.platform.common.enums;

import java.util.Set;

public enum ProjectRole {
    OWNER(Set.of(
            "project:view", "project:update_config", "member:manage",
            "lane:create_own", "lane:view_all", "lane:manage_any",
            "run:trigger_own", "gate:approve_spec", "gate:approve_design",
            "gate:approve_senior_pr", "gate:approve_budget", "llm:manage_keys"
    )),
    MAINTAINER(Set.of(
            "project:view", "project:update_config",
            "lane:create_own", "lane:view_all", "lane:manage_any",
            "run:trigger_own", "gate:approve_spec", "gate:approve_design",
            "gate:approve_senior_pr"
    )),
    DEVELOPER(Set.of(
            "project:view", "lane:create_own", "lane:view_all",
            "run:trigger_own"
    )),
    DESIGNER(Set.of(
            "project:view", "lane:view_all", "gate:approve_design"
    )),
    VIEWER(Set.of(
            "project:view", "lane:view_all"
    ));

    private final Set<String> permissions;

    ProjectRole(Set<String> permissions) {
        this.permissions = permissions;
    }

    public Set<String> getPermissions() {
        return permissions;
    }

    public boolean hasPermission(String permission) {
        return permissions.contains(permission);
    }
}

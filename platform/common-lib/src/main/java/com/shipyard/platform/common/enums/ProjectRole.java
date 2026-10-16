package com.shipyard.platform.common.enums;

import java.util.Set;

public enum ProjectRole {
    OWNER(Set.of(
            "project:view", "project:update_config", "project:delete", "member:manage",
            "lane:create_own", "lane:view_all", "lane:manage_any",
            "run:trigger_own", "gate:approve_spec", "gate:approve_design",
            "gate:approve_senior_pr", "gate:approve_budget", "llm:manage_keys",
            "gate:approve_pm", "gate:approve_ba", "gate:approve_arch",
            "gate:approve_dev", "gate:approve_test"
    )),
    MAINTAINER(Set.of(
            "project:view", "project:update_config",
            "lane:create_own", "lane:view_all", "lane:manage_any",
            "run:trigger_own", "gate:approve_spec", "gate:approve_design",
            "gate:approve_senior_pr"
    )),
    DEVELOPER(Set.of(
            "project:view", "lane:create_own", "lane:view_all",
            "run:trigger_own", "gate:approve_dev"
    )),
    DESIGNER(Set.of(
            "project:view", "lane:view_all", "gate:approve_design"
    )),
    VIEWER(Set.of(
            "project:view", "lane:view_all"
    )),
    PM(Set.of(
            "project:view", "lane:view_all", "run:trigger_own", "gate:approve_pm"
    )),
    BA(Set.of(
            "project:view", "lane:view_all", "gate:approve_ba"
    )),
    TECH_LEAD(Set.of(
            "project:view", "lane:view_all", "lane:create_own", "run:trigger_own", "gate:approve_arch"
    )),
    TESTER(Set.of(
            "project:view", "lane:view_all", "gate:approve_test"
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

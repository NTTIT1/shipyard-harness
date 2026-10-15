package com.shipyard.platform.common.enums;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ProjectRoleTest {
    @Test
    void newRolesCanViewAndApproveTheirGate() {
        assertThat(ProjectRole.PM.hasPermission("gate:approve_pm")).isTrue();
        assertThat(ProjectRole.BA.hasPermission("gate:approve_ba")).isTrue();
        assertThat(ProjectRole.TECH_LEAD.hasPermission("gate:approve_arch")).isTrue();
        assertThat(ProjectRole.TESTER.hasPermission("gate:approve_test")).isTrue();
        assertThat(ProjectRole.DEVELOPER.hasPermission("gate:approve_dev")).isTrue();
        for (ProjectRole r : ProjectRole.values()) assertThat(r.hasPermission("project:view")).isTrue();
    }

    @Test
    void ownerHoldsEveryGatePermission() {
        for (String g : new String[]{"pm", "ba", "arch", "design", "dev", "test"})
            assertThat(ProjectRole.OWNER.hasPermission("gate:approve_" + g)).isTrue();
    }
}

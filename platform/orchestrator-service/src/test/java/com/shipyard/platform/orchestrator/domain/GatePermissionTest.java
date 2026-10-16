package com.shipyard.platform.orchestrator.domain;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class GatePermissionTest {
    @Test
    void holderOfTheRoleDecidesAsThatRole() {
        assertThat(GatePermission.decideAs(List.of("BA"), Map.of("BA", 1L), "BA")).contains("BA");
    }

    @Test
    void ownerDecidesOnlyWhenNobodyHoldsTheRole() {
        assertThat(GatePermission.decideAs(List.of("OWNER"), Map.of("OWNER", 1L), "BA")).contains("OWNER_FALLBACK");
        assertThat(GatePermission.decideAs(List.of("OWNER"), Map.of("OWNER", 1L, "BA", 1L), "BA")).isEmpty();
    }

    @Test
    void ownerWhoAlsoHoldsTheRoleDecidesDirectly() {
        assertThat(GatePermission.decideAs(List.of("OWNER", "PM"), Map.of("OWNER", 1L, "PM", 1L), "PM")).contains("PM");
    }

    @Test
    void otherMembersCannotDecide() {
        assertThat(GatePermission.decideAs(List.of("DEVELOPER", "MAINTAINER"), Map.of(), "TESTER")).isEmpty();
        assertThat(GatePermission.decideAs(List.of(), Map.of(), "PM")).isEmpty();
    }
}

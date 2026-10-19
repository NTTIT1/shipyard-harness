package com.shipyard.platform.orchestrator.domain;

import com.shipyard.platform.common.exception.BadRequestException;

import java.util.EnumSet;
import java.util.Locale;
import java.util.Set;

/** FEATURE runs walk PM → TEST; a SETUP run has the single MANAGER step (project rules). */
public enum RunKind {
    FEATURE, SETUP;

    public Set<Step> steps() {
        return this == SETUP ? EnumSet.of(Step.MANAGER) : EnumSet.complementOf(EnumSet.of(Step.MANAGER));
    }

    public static RunKind parse(String raw) {
        if (raw == null || raw.isBlank()) return FEATURE;
        try {
            return RunKind.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Unknown run kind: " + raw);
        }
    }
}

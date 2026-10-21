package com.shipyard.platform.orchestrator.domain;

import com.shipyard.platform.common.exception.BadRequestException;

import java.util.EnumSet;
import java.util.Locale;
import java.util.Set;

/**
 * FEATURE runs walk PM → TEST; a SETUP run has the single MANAGER step (project rules); a BLUEPRINT
 * run has the single BLUEPRINT step (architecture approved before the project is scaffolded).
 */
public enum RunKind {
    FEATURE, SETUP, BLUEPRINT;

    public Set<Step> steps() {
        return switch (this) {
            case SETUP -> EnumSet.of(Step.MANAGER);
            case BLUEPRINT -> EnumSet.of(Step.BLUEPRINT);
            case FEATURE -> EnumSet.of(Step.PM, Step.BA, Step.ARCH, Step.DESIGN, Step.DEV, Step.TEST);
        };
    }

    /** Steps that always need a human: they are the whole point of their run. */
    public static boolean alwaysHuman(Step step) { return step == Step.MANAGER || step == Step.BLUEPRINT; }

    public static RunKind parse(String raw) {
        if (raw == null || raw.isBlank()) return FEATURE;
        try {
            return RunKind.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Unknown run kind: " + raw);
        }
    }
}

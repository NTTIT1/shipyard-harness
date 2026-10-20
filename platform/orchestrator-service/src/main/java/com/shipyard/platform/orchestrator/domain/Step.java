package com.shipyard.platform.orchestrator.domain;

import com.shipyard.platform.common.exception.BadRequestException;

import java.util.Locale;

/**
 * Pipeline steps in order; each is approved by one human project role. MANAGER (the project's
 * AI-team rules) is the only step of a SETUP run and never part of a FEATURE run.
 */
public enum Step {
    PM("PM"), BA("BA"), ARCH("TECH_LEAD"), DESIGN("DESIGNER"), DEV("DEVELOPER"), TEST("TESTER"),
    MANAGER("TECH_LEAD");

    private final String requiredRole;

    Step(String requiredRole) { this.requiredRole = requiredRole; }

    public String requiredRole() { return requiredRole; }

    /** Case-insensitive parse for path variables / JSON; unknown → 400. */
    public static Step parse(String raw) {
        try {
            return Step.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (RuntimeException e) {
            throw new BadRequestException("Unknown step: " + raw);
        }
    }
}

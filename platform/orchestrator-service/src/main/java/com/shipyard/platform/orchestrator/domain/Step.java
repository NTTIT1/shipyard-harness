package com.shipyard.platform.orchestrator.domain;

import com.shipyard.platform.common.exception.BadRequestException;

import java.util.Locale;

/**
 * Pipeline steps in order; each is approved by one human project role. TESTCASE writes the test cases
 * (qc-plan.md) from the approved documents so a tester reviews them before any code is tested. SECURITY reviews the code DEV
 * wrote (secrets, vulnerable dependencies, static analysis, an OWASP review of the diff) before TEST. MANAGER (the project's
 * AI-team rules) is the only step of a SETUP run, BLUEPRINT (the architecture of a project that does
 * not exist yet) the only step of a BLUEPRINT run; neither is ever part of a FEATURE run.
 */
public enum Step {
    PM("PM"), BA("BA"), ARCH("TECH_LEAD"), DESIGN("DESIGNER"), TESTCASE("TESTER"), DEV("DEVELOPER"), SECURITY("TECH_LEAD"), TEST("TESTER"),
    MANAGER("TECH_LEAD"), BLUEPRINT("TECH_LEAD");

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

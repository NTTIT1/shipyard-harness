package com.shipyard.platform.orchestrator.domain;

import java.util.Map;

/** A human (or AUTO) verdict on the step currently awaiting review. */
public record Decision(DecisionAction action, String feedback, Map<String, String> edits, Step sendBackTo, Boolean hasUi) {}

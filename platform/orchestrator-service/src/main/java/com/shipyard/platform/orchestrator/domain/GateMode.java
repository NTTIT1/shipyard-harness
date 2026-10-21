package com.shipyard.platform.orchestrator.domain;

/** REQUIRED = a human approves; AUTO = approved on submit; SKIP = the step is left out of the workflow. */
public enum GateMode { REQUIRED, AUTO, SKIP }

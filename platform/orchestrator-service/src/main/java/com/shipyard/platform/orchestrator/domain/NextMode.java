package com.shipyard.platform.orchestrator.domain;

/** What the harness should do next for a run (GET /internal/v1/runs/{id}/next). */
public enum NextMode { WORK, REVISE, WAIT, RELEASE, DONE, CANCELLED }

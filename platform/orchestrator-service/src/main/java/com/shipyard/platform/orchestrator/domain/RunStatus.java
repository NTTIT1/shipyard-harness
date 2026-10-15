package com.shipyard.platform.orchestrator.domain;

/** RELEASING = every gate passed; the harness runs the PR/merge/post-merge-QC tail. */
public enum RunStatus { RUNNING, WAITING_REVIEW, RELEASING, DONE, CANCELLED }

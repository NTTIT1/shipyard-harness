package com.shipyard.platform.orchestrator.repository;

import com.shipyard.platform.orchestrator.entity.RunStep;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RunStepRepository extends JpaRepository<RunStep, RunStep.Key> {
    List<RunStep> findByRunId(String runId);
}

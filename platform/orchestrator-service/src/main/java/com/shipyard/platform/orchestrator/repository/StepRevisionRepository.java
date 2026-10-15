package com.shipyard.platform.orchestrator.repository;

import com.shipyard.platform.orchestrator.domain.Step;
import com.shipyard.platform.orchestrator.entity.StepRevision;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface StepRevisionRepository extends JpaRepository<StepRevision, String> {
    List<StepRevision> findByRunIdOrderBySubmittedAtAsc(String runId);
    Optional<StepRevision> findFirstByRunIdAndStepAndApprovedDocumentsIsNotNullOrderByRevisionNoDesc(String runId, Step step);
}

package com.shipyard.platform.orchestrator.repository;

import com.shipyard.platform.orchestrator.domain.ApprovalStatus;
import com.shipyard.platform.orchestrator.entity.ApprovalRequest;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ApprovalRequestRepository extends JpaRepository<ApprovalRequest, String> {
    List<ApprovalRequest> findByStatusAndProjectIdInOrderByCreatedAtAsc(ApprovalStatus status, Collection<String> projectIds);
    List<ApprovalRequest> findByRunIdOrderByCreatedAtAsc(String runId);
    Optional<ApprovalRequest> findByRevisionId(String revisionId);
}

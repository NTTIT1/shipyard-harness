package com.shipyard.platform.orchestrator.repository;

import com.shipyard.platform.orchestrator.entity.Run;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface RunRepository extends JpaRepository<Run, String> {
    List<Run> findByProjectIdOrderByCreatedAtDesc(String projectId);

    List<Run> findByProjectIdAndKind(String projectId, com.shipyard.platform.orchestrator.domain.RunKind kind);

    /** Row lock: every state change on a run is serialized (duplicate submits/decisions get a clean 409). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Run r where r.id = :id")
    Optional<Run> lockById(@Param("id") String id);
}

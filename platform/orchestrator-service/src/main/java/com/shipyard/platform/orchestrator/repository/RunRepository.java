package com.shipyard.platform.orchestrator.repository;

import com.shipyard.platform.orchestrator.entity.Run;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RunRepository extends JpaRepository<Run, String> {
    List<Run> findByProjectIdOrderByCreatedAtDesc(String projectId);
}

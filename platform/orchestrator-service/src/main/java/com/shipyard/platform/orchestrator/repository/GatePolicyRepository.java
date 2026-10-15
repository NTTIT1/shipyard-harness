package com.shipyard.platform.orchestrator.repository;

import com.shipyard.platform.orchestrator.entity.GatePolicy;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface GatePolicyRepository extends JpaRepository<GatePolicy, GatePolicy.Key> {
    List<GatePolicy> findByProjectId(String projectId);
}

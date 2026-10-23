package com.shipyard.platform.orchestrator.repository;

import com.shipyard.platform.orchestrator.entity.DeliveryPolicy;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DeliveryPolicyRepository extends JpaRepository<DeliveryPolicy, String> {}

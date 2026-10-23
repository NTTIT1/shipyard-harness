package com.shipyard.platform.orchestrator.entity;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.Map;

/** A project's after-the-code settings (DeliveryConfig); one row per project. */
@Entity
@Table(name = "delivery_policies")
public class DeliveryPolicy {
    @Id public String projectId;
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON) public Map<String, Object> config;
    public Instant updatedAt;

    public DeliveryPolicy() {}

    public DeliveryPolicy(String projectId) { this.projectId = projectId; }
}

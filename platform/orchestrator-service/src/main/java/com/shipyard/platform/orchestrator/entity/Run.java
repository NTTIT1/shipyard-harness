package com.shipyard.platform.orchestrator.entity;

import com.shipyard.platform.orchestrator.domain.RunStatus;
import com.shipyard.platform.orchestrator.domain.Step;
import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "runs")
public class Run {
    @Id public String id;
    public String projectId;
    public String laneRef;
    public String title;
    public String description;
    @Enumerated(EnumType.STRING) public Step currentStep;
    @Enumerated(EnumType.STRING) public RunStatus status;
    public Boolean hasUi;
    @Enumerated(EnumType.STRING) public com.shipyard.platform.orchestrator.domain.RunKind kind = com.shipyard.platform.orchestrator.domain.RunKind.FEATURE;
    public String createdBy;
    /** Step name -> REQUIRED|AUTO chosen for this feature; wins over the project gate policy. */
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON) public java.util.Map<String, String> gateOverrides;
    /** Step order frozen at creation (feature runs); steps left out are SKIPPED with reason "workflow". */
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON) public java.util.List<String> workflow;
    @Version public long version;
    public Instant createdAt = Instant.now();
    public Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() { updatedAt = Instant.now(); }
}

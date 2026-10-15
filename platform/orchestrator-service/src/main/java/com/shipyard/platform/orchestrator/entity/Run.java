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
    public String createdBy;
    @Version public long version;
    public Instant createdAt = Instant.now();
    public Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() { updatedAt = Instant.now(); }
}

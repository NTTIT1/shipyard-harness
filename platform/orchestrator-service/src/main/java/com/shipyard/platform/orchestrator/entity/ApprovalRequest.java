package com.shipyard.platform.orchestrator.entity;

import com.shipyard.platform.orchestrator.domain.ApprovalStatus;
import com.shipyard.platform.orchestrator.domain.Step;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;

@Entity
@Table(name = "approval_requests")
public class ApprovalRequest {
    @Id public String id;
    public String runId;
    @Enumerated(EnumType.STRING) public Step step;
    public String revisionId;
    public String projectId;
    public String requiredRole;
    @Enumerated(EnumType.STRING) public ApprovalStatus status = ApprovalStatus.PENDING;
    public String decidedBy;
    public String decidedAsRole;
    public String feedbackText;
    @JdbcTypeCode(SqlTypes.JSON) public Map<String, String> editedDocuments;
    @Enumerated(EnumType.STRING) public Step sendBackTo;
    public Boolean hasUiOverride;
    public Instant decidedAt;
    public Instant createdAt = Instant.now();
    @Version public long version;
}

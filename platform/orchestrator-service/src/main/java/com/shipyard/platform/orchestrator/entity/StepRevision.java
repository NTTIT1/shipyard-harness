package com.shipyard.platform.orchestrator.entity;

import com.shipyard.platform.orchestrator.domain.Step;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Entity
@Table(name = "step_revisions")
public class StepRevision {
    @Id public String id;
    public String runId;
    @Enumerated(EnumType.STRING) public Step step;
    public int revisionNo;
    public String summary;
    @JdbcTypeCode(SqlTypes.JSON) public Map<String, String> documents;
    @JdbcTypeCode(SqlTypes.JSON) public List<Map<String, String>> images;
    @JdbcTypeCode(SqlTypes.JSON) public Map<String, Object> meta;
    @JdbcTypeCode(SqlTypes.JSON) public List<Map<String, Object>> contextUsed;
    /** documents overlaid with the approver's edits; set only when approved. */
    @JdbcTypeCode(SqlTypes.JSON) public Map<String, String> approvedDocuments;
    public Instant submittedAt = Instant.now();
}

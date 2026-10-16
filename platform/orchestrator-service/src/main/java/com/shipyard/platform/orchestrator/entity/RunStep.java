package com.shipyard.platform.orchestrator.entity;

import com.shipyard.platform.orchestrator.domain.Step;
import com.shipyard.platform.orchestrator.domain.StepStatus;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.io.Serializable;
import java.util.Map;
import java.util.Objects;

@Entity
@Table(name = "run_steps")
@IdClass(RunStep.Key.class)
public class RunStep {
    @Id public String runId;
    @Id @Enumerated(EnumType.STRING) public Step step;
    @Enumerated(EnumType.STRING) public StepStatus status = StepStatus.PENDING;
    /** Number of the last submitted revision (0 = never submitted). */
    public int currentRevision;
    public String skipReason;
    /** Feedback the AI must address on its next submission (cleared on submit). */
    public String pendingFeedback;
    /** Human-edited documents to use as the base of the next submission (cleared on submit). */
    @JdbcTypeCode(SqlTypes.JSON) public Map<String, String> pendingEdits;

    public RunStep() {}

    public RunStep(String runId, Step step) {
        this.runId = runId;
        this.step = step;
    }

    public static class Key implements Serializable {
        public String runId;
        public Step step;

        public Key() {}

        public Key(String runId, Step step) { this.runId = runId; this.step = step; }

        @Override
        public boolean equals(Object o) {
            return o instanceof Key k && Objects.equals(runId, k.runId) && step == k.step;
        }

        @Override
        public int hashCode() { return Objects.hash(runId, step); }
    }
}

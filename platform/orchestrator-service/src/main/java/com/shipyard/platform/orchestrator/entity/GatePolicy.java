package com.shipyard.platform.orchestrator.entity;

import com.shipyard.platform.orchestrator.domain.GateMode;
import com.shipyard.platform.orchestrator.domain.Step;
import jakarta.persistence.*;

import java.io.Serializable;
import java.util.Objects;

@Entity
@Table(name = "gate_policies")
@IdClass(GatePolicy.Key.class)
public class GatePolicy {
    @Id public String projectId;
    @Id @Enumerated(EnumType.STRING) public Step step;
    @Enumerated(EnumType.STRING) public GateMode mode;

    public GatePolicy() {}

    public GatePolicy(String projectId, Step step, GateMode mode) {
        this.projectId = projectId;
        this.step = step;
        this.mode = mode;
    }

    public static class Key implements Serializable {
        public String projectId;
        public Step step;

        public Key() {}

        public Key(String projectId, Step step) { this.projectId = projectId; this.step = step; }

        @Override
        public boolean equals(Object o) {
            return o instanceof Key k && Objects.equals(projectId, k.projectId) && step == k.step;
        }

        @Override
        public int hashCode() { return Objects.hash(projectId, step); }
    }
}

package com.shipyard.platform.project.entity;

import com.shipyard.platform.common.enums.ProjectRole;
import jakarta.persistence.*;
import java.time.Instant;

/** One row per (project, user, role) — a member holding several roles has several rows. */
@Entity
@Table(name = "project_members")
public class ProjectMember {

    @EmbeddedId
    private ProjectMemberId id;

    @Column(nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public ProjectMember() {}

    public ProjectMember(String projectId, String userId, ProjectRole role) {
        this.id = new ProjectMemberId(projectId, userId, role);
        this.createdAt = Instant.now();
    }

    public ProjectMemberId getId() { return id; }
    public void setId(ProjectMemberId id) { this.id = id; }

    public ProjectRole getRole() { return id.getRole(); }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}

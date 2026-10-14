package com.shipyard.platform.lane.entity;

import com.shipyard.platform.common.enums.LaneStatus;
import com.shipyard.platform.common.enums.LaneType;
import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "lanes")
public class Lane {

    @Id
    private String id;

    @Column(nullable = false, length = 36)
    private String projectId;

    @Column(nullable = false, length = 36)
    private String ownerId;

    @Column(nullable = false, unique = true)
    private Integer slotNumber;

    @Column(nullable = false, length = 100)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private LaneType type = LaneType.FEATURE;

    @Column(nullable = false, length = 255)
    private String gitBranch;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private LaneStatus status = LaneStatus.PROVISIONING;

    @Column(nullable = false, length = 100)
    private String databaseName;

    @Column(nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(nullable = false)
    private Instant lastActiveAt = Instant.now();

    public Lane() {}

    public Lane(String id, String projectId, String ownerId, Integer slotNumber, String name, LaneType type, String gitBranch, String databaseName) {
        this.id = id;
        this.projectId = projectId;
        this.ownerId = ownerId;
        this.slotNumber = slotNumber;
        this.name = name;
        this.type = type != null ? type : LaneType.FEATURE;
        this.gitBranch = gitBranch;
        this.databaseName = databaseName;
        this.status = LaneStatus.PROVISIONING;
        this.createdAt = Instant.now();
        this.lastActiveAt = Instant.now();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getProjectId() { return projectId; }
    public void setProjectId(String projectId) { this.projectId = projectId; }

    public String getOwnerId() { return ownerId; }
    public void setOwnerId(String ownerId) { this.ownerId = ownerId; }

    public Integer getSlotNumber() { return slotNumber; }
    public void setSlotNumber(Integer slotNumber) { this.slotNumber = slotNumber; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public LaneType getType() { return type; }
    public void setType(LaneType type) { this.type = type; }

    public String getGitBranch() { return gitBranch; }
    public void setGitBranch(String gitBranch) { this.gitBranch = gitBranch; }

    public LaneStatus getStatus() { return status; }
    public void setStatus(LaneStatus status) { this.status = status; }

    public String getDatabaseName() { return databaseName; }
    public void setDatabaseName(String databaseName) { this.databaseName = databaseName; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getLastActiveAt() { return lastActiveAt; }
    public void setLastActiveAt(Instant lastActiveAt) { this.lastActiveAt = lastActiveAt; }
}

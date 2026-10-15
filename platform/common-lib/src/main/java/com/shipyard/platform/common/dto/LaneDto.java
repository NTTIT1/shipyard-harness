package com.shipyard.platform.common.dto;

import com.shipyard.platform.common.enums.LaneStatus;
import com.shipyard.platform.common.enums.LaneType;
import java.time.Instant;

public class LaneDto {
    private String id;
    private String projectId;
    private String ownerId;
    private Integer slotNumber;
    private Integer basePort;
    private String name;
    private LaneType type;
    private String gitBranch;
    private LaneStatus status;
    private String databaseName;
    private Instant createdAt;
    private Instant lastActiveAt;

    public LaneDto() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getProjectId() { return projectId; }
    public void setProjectId(String projectId) { this.projectId = projectId; }

    public String getOwnerId() { return ownerId; }
    public void setOwnerId(String ownerId) { this.ownerId = ownerId; }

    public Integer getSlotNumber() { return slotNumber; }
    public void setSlotNumber(Integer slotNumber) { this.slotNumber = slotNumber; }

    public Integer getBasePort() { return basePort; }
    public void setBasePort(Integer basePort) { this.basePort = basePort; }

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

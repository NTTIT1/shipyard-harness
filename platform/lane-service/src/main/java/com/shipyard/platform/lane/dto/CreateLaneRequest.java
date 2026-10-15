package com.shipyard.platform.lane.dto;

import com.shipyard.platform.common.enums.LaneType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class CreateLaneRequest {

    @NotBlank(message = "Name is required")
    private String name;

    private LaneType type = LaneType.FEATURE;

    @NotBlank(message = "Git branch is required")
    private String gitBranch;

    public CreateLaneRequest() {}

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public LaneType getType() { return type; }
    public void setType(LaneType type) { this.type = type; }

    public String getGitBranch() { return gitBranch; }
    public void setGitBranch(String gitBranch) { this.gitBranch = gitBranch; }
}

package com.shipyard.platform.project.dto;

import java.util.List;

public record MembershipDto(String projectId, List<String> roles) {}

package com.shipyard.platform.project.dto;

import java.util.List;

public record MemberDto(String userId, List<String> roles) {}

package com.shipyard.platform.lane.controller;

import com.shipyard.platform.common.dto.ApiResponse;
import com.shipyard.platform.common.dto.LaneDto;
import com.shipyard.platform.common.security.SecurityConstants;
import com.shipyard.platform.lane.dto.CreateLaneRequest;
import com.shipyard.platform.lane.service.LaneService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1")
public class LaneController {

    private final LaneService laneService;

    public LaneController(LaneService laneService) {
        this.laneService = laneService;
    }

    @PostMapping("/projects/{projectId}/lanes")
    public ResponseEntity<ApiResponse<LaneDto>> createLane(
            @RequestHeader(SecurityConstants.HEADER_USER_ID) String userId,
            @PathVariable String projectId,
            @Valid @RequestBody CreateLaneRequest request) {
        LaneDto lane = laneService.createLane(userId, projectId, request);
        return ResponseEntity.ok(ApiResponse.ok("Lane provisioned successfully", lane));
    }

    @GetMapping("/projects/{projectId}/lanes")
    public ResponseEntity<ApiResponse<List<LaneDto>>> listLanes(
            @PathVariable String projectId) {
        List<LaneDto> lanes = laneService.listLanesByProject(projectId);
        return ResponseEntity.ok(ApiResponse.ok(lanes));
    }

    @GetMapping("/lanes/{laneId}")
    public ResponseEntity<ApiResponse<LaneDto>> getLane(
            @PathVariable String laneId) {
        LaneDto lane = laneService.getLaneById(laneId);
        return ResponseEntity.ok(ApiResponse.ok(lane));
    }

    @DeleteMapping("/lanes/{laneId}")
    public ResponseEntity<ApiResponse<String>> terminateLane(
            @PathVariable String laneId) {
        laneService.terminateLane(laneId);
        return ResponseEntity.ok(ApiResponse.ok("Lane terminated and slot released", "OK"));
    }
}

package com.shipyard.platform.lane.service;

import com.shipyard.platform.common.dto.LaneDto;
import com.shipyard.platform.common.enums.LaneStatus;
import com.shipyard.platform.common.exception.ResourceNotFoundException;
import com.shipyard.platform.lane.dto.CreateLaneRequest;
import com.shipyard.platform.lane.entity.Lane;
import com.shipyard.platform.lane.entity.SlotAllocation;
import com.shipyard.platform.lane.repository.LaneRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class LaneService {

    private final LaneRepository laneRepository;
    private final SlotAllocatorService slotAllocatorService;

    public LaneService(LaneRepository laneRepository, SlotAllocatorService slotAllocatorService) {
        this.laneRepository = laneRepository;
        this.slotAllocatorService = slotAllocatorService;
    }

    @Transactional
    public LaneDto createLane(String currentUserId, String projectId, CreateLaneRequest request) {
        String laneId = "lane_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        SlotAllocation slot = slotAllocatorService.acquireSlot(laneId);

        String dbName = "shipyard_" + projectId.replace("proj_", "").replace("-", "_") + "_s" + slot.getSlotNumber();

        Lane lane = new Lane(
                laneId,
                projectId,
                currentUserId,
                slot.getSlotNumber(),
                request.getName(),
                request.getType(),
                request.getGitBranch(),
                dbName
        );

        laneRepository.save(lane);
        return toDto(lane, slot.getBasePort());
    }

    public List<LaneDto> listLanesByProject(String projectId) {
        return laneRepository.findByProjectId(projectId).stream()
                .filter(lane -> lane.getStatus() != LaneStatus.TERMINATED)
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    public LaneDto getLaneById(String laneId) {
        Lane lane = laneRepository.findById(laneId)
                .orElseThrow(() -> new ResourceNotFoundException("Lane not found: " + laneId));
        return toDto(lane);
    }

    @Transactional
    public void terminateLane(String laneId) {
        Lane lane = laneRepository.findById(laneId)
                .orElseThrow(() -> new ResourceNotFoundException("Lane not found: " + laneId));

        slotAllocatorService.releaseSlot(lane.getSlotNumber());
        lane.setStatus(LaneStatus.TERMINATED);
        lane.setLastActiveAt(Instant.now());
        laneRepository.save(lane);
    }

    private LaneDto toDto(Lane lane) {
        int basePort = 20000 + (lane.getSlotNumber() * 20);
        return toDto(lane, basePort);
    }

    private LaneDto toDto(Lane lane, int basePort) {
        LaneDto dto = new LaneDto();
        dto.setId(lane.getId());
        dto.setProjectId(lane.getProjectId());
        dto.setOwnerId(lane.getOwnerId());
        dto.setSlotNumber(lane.getSlotNumber());
        dto.setBasePort(basePort);
        dto.setName(lane.getName());
        dto.setType(lane.getType());
        dto.setGitBranch(lane.getGitBranch());
        dto.setStatus(lane.getStatus());
        dto.setDatabaseName(lane.getDatabaseName());
        dto.setCreatedAt(lane.getCreatedAt());
        dto.setLastActiveAt(lane.getLastActiveAt());
        return dto;
    }
}

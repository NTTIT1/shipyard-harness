package com.shipyard.platform.lane.service;

import com.shipyard.platform.lane.entity.SlotAllocation;
import com.shipyard.platform.lane.repository.SlotAllocationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

@Service
public class SlotAllocatorService {

    private final SlotAllocationRepository slotAllocationRepository;

    public SlotAllocatorService(SlotAllocationRepository slotAllocationRepository) {
        this.slotAllocationRepository = slotAllocationRepository;
    }

    @Transactional
    public SlotAllocation acquireSlot(String laneId) {
        Optional<SlotAllocation> freeSlotOpt = slotAllocationRepository.findFirstFreeSlot();
        SlotAllocation slot;

        if (freeSlotOpt.isPresent()) {
            slot = freeSlotOpt.get();
        } else {
            int nextSlotNum = slotAllocationRepository.findMaxSlotNumber().orElse(0) + 1;
            slot = new SlotAllocation(nextSlotNum);
        }

        slot.setAllocated(true);
        slot.setAllocatedToLaneId(laneId);
        slot.setAllocatedAt(Instant.now());

        return slotAllocationRepository.save(slot);
    }

    @Transactional
    public void releaseSlot(int slotNumber) {
        slotAllocationRepository.findById(slotNumber).ifPresent(slot -> {
            slot.setAllocated(false);
            slot.setAllocatedToLaneId(null);
            slot.setAllocatedAt(null);
            slotAllocationRepository.save(slot);
        });
    }
}

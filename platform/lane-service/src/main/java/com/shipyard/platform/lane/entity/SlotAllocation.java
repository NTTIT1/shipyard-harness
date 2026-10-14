package com.shipyard.platform.lane.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "slot_allocation")
public class SlotAllocation {

    @Id
    private Integer slotNumber;

    @Column(nullable = false)
    private boolean isAllocated = false;

    private String allocatedToLaneId;

    private Instant allocatedAt;

    @Column(nullable = false)
    private Integer basePort;

    public SlotAllocation() {}

    public SlotAllocation(Integer slotNumber) {
        this.slotNumber = slotNumber;
        this.isAllocated = false;
        this.basePort = 20000 + (slotNumber * 20);
    }

    public Integer getSlotNumber() { return slotNumber; }
    public void setSlotNumber(Integer slotNumber) {
        this.slotNumber = slotNumber;
        this.basePort = 20000 + (slotNumber * 20);
    }

    public boolean isAllocated() { return isAllocated; }
    public void setAllocated(boolean allocated) { isAllocated = allocated; }

    public String getAllocatedToLaneId() { return allocatedToLaneId; }
    public void setAllocatedToLaneId(String allocatedToLaneId) { this.allocatedToLaneId = allocatedToLaneId; }

    public Instant getAllocatedAt() { return allocatedAt; }
    public void setAllocatedAt(Instant allocatedAt) { this.allocatedAt = allocatedAt; }

    public Integer getBasePort() { return basePort; }
    public void setBasePort(Integer basePort) { this.basePort = basePort; }
}

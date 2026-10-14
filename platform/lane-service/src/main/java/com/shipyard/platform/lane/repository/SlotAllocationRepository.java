package com.shipyard.platform.lane.repository;

import com.shipyard.platform.lane.entity.SlotAllocation;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface SlotAllocationRepository extends JpaRepository<SlotAllocation, Integer> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM SlotAllocation s WHERE s.isAllocated = false ORDER BY s.slotNumber ASC LIMIT 1")
    Optional<SlotAllocation> findFirstFreeSlot();

    @Query("SELECT MAX(s.slotNumber) FROM SlotAllocation s")
    Optional<Integer> findMaxSlotNumber();
}

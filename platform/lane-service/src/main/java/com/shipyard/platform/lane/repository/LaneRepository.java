package com.shipyard.platform.lane.repository;

import com.shipyard.platform.lane.entity.Lane;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface LaneRepository extends JpaRepository<Lane, String> {
    List<Lane> findByProjectId(String projectId);
    List<Lane> findByProjectIdAndOwnerId(String projectId, String ownerId);
}

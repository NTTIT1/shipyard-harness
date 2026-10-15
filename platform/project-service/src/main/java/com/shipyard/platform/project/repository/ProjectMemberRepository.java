package com.shipyard.platform.project.repository;

import com.shipyard.platform.project.entity.ProjectMember;
import com.shipyard.platform.project.entity.ProjectMemberId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProjectMemberRepository extends JpaRepository<ProjectMember, ProjectMemberId> {
    List<ProjectMember> findByIdProjectId(String projectId);
    List<ProjectMember> findByIdUserId(String userId);
    Optional<ProjectMember> findByIdProjectIdAndIdUserId(String projectId, String userId);
    void deleteByIdProjectIdAndIdUserId(String projectId, String userId);
}

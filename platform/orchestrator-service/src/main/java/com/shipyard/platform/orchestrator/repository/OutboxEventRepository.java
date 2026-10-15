package com.shipyard.platform.orchestrator.repository;

import com.shipyard.platform.orchestrator.entity.OutboxEvent;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface OutboxEventRepository extends JpaRepository<OutboxEvent, Long> {
    @Query("select e from OutboxEvent e where e.sentAt is null and e.nextAttemptAt <= :now order by e.id")
    List<OutboxEvent> findDue(@Param("now") Instant now, Pageable page);

    List<OutboxEvent> findByTypeOrderByIdAsc(String type);
}

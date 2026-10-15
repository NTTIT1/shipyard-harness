package com.shipyard.platform.orchestrator.service;

import com.shipyard.platform.orchestrator.domain.Ids;
import com.shipyard.platform.orchestrator.entity.OutboxEvent;
import com.shipyard.platform.orchestrator.repository.OutboxEventRepository;
import org.springframework.stereotype.Component;

import java.util.Map;

/** Writes events in the caller's transaction; OutboxPublisher delivers them later. */
@Component
public class OutboxWriter {
    private final OutboxEventRepository repo;

    public OutboxWriter(OutboxEventRepository repo) { this.repo = repo; }

    public void enqueue(String type, Map<String, Object> payload) {
        OutboxEvent e = new OutboxEvent();
        e.eventId = Ids.newId("evt");
        e.type = type;
        e.payload = payload;
        repo.save(e);
    }
}

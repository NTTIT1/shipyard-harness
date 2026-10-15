package com.shipyard.platform.orchestrator.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;

@Entity
@Table(name = "outbox_events")
public class OutboxEvent {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    public String eventId;
    public String type;
    @JdbcTypeCode(SqlTypes.JSON) public Map<String, Object> payload;
    public int attempts;
    public Instant nextAttemptAt = Instant.now();
    public Instant sentAt;
    public String lastError;
    public Instant createdAt = Instant.now();
}

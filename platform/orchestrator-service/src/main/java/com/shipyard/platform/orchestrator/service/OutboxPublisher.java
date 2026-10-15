package com.shipyard.platform.orchestrator.service;

import com.shipyard.platform.common.web.ServiceTokenFilter;
import com.shipyard.platform.orchestrator.entity.OutboxEvent;
import com.shipyard.platform.orchestrator.repository.OutboxEventRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Delivers outbox events to context-service. Approvals never wait on memory: a failed delivery
 * is retried with exponential backoff (5 s doubling, capped at 1 h). No context URL → stay pending.
 */
@Component
public class OutboxPublisher {
    private static final Logger log = LoggerFactory.getLogger(OutboxPublisher.class);
    private static final Duration BASE = Duration.ofSeconds(5);
    private static final Duration MAX = Duration.ofHours(1);

    private final OutboxEventRepository repo;
    private final RestClient http;
    private final boolean enabled;

    public OutboxPublisher(OutboxEventRepository repo, RestClient.Builder builder,
                           @Value("${shipyard.context-service-url:}") String contextUrl,
                           @Value("${shipyard.service-token}") String token) {
        this.repo = repo;
        this.enabled = contextUrl != null && !contextUrl.isBlank();
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000);
        factory.setReadTimeout(10000);
        this.http = builder.baseUrl(enabled ? contextUrl : "http://disabled.invalid").requestFactory(factory)
                .defaultHeader(ServiceTokenFilter.HEADER, token).build();
    }

    @Scheduled(fixedDelayString = "${shipyard.outbox.interval-ms:5000}", initialDelayString = "${shipyard.outbox.interval-ms:5000}")
    public void scheduled() {
        publishDue();
    }

    /** Sends every due event once; returns how many were delivered. */
    public int publishDue() {
        if (!enabled) return 0;
        int sent = 0;
        for (OutboxEvent e : repo.findDue(Instant.now(), PageRequest.of(0, 20))) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("eventId", e.eventId);
            body.put("type", e.type);
            body.put("payload", e.payload);
            try {
                http.post().uri("/internal/v1/memory/events").contentType(MediaType.APPLICATION_JSON)
                        .body(body).retrieve().toBodilessEntity();
                e.sentAt = Instant.now();
                e.lastError = null;
                sent++;
            } catch (RuntimeException ex) {
                e.attempts++;
                long factor = 1L << Math.min(e.attempts - 1, 20);
                Duration wait = BASE.multipliedBy(factor);
                e.nextAttemptAt = Instant.now().plus(wait.compareTo(MAX) > 0 ? MAX : wait);
                e.lastError = ex.getMessage();
                log.warn("outbox {} ({}) delivery failed, attempt {}: {}", e.eventId, e.type, e.attempts, ex.getMessage());
            }
            repo.save(e);
        }
        return sent;
    }
}

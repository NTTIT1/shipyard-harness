package com.shipyard.platform.orchestrator;

import com.shipyard.platform.orchestrator.entity.OutboxEvent;
import com.shipyard.platform.orchestrator.repository.OutboxEventRepository;
import com.shipyard.platform.orchestrator.service.OutboxPublisher;
import com.shipyard.platform.orchestrator.service.OutboxWriter;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.client.RestClient;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

class OutboxPublisherIT extends OrchestratorIT {
    @Autowired OutboxWriter writer;
    @Autowired OutboxEventRepository repo;
    HttpServer server;

    @AfterEach
    void stop() { if (server != null) server.stop(0); }

    @Test
    void retriesWithBackoffThenDelivers() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        List<String> bodies = new CopyOnWriteArrayList<>();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/internal/v1/memory/events", ex -> {
            bodies.add(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)
                    + "|" + ex.getRequestHeaders().getFirst("X-Service-Token"));
            int status = calls.incrementAndGet() == 1 ? 500 : 200;
            ex.sendResponseHeaders(status, -1);
            ex.close();
        });
        server.start();
        OutboxPublisher publisher = new OutboxPublisher(repo, RestClient.builder(),
                "http://127.0.0.1:" + server.getAddress().getPort(), "test-token");

        writer.enqueue("STEP_APPROVED", Map.of("projectId", "proj_1", "step", "PM"));

        assertThat(publisher.publishDue()).isZero();
        OutboxEvent e = repo.findAll().get(0);
        assertThat(e.attempts).isEqualTo(1);
        assertThat(e.lastError).contains("500");
        assertThat(e.nextAttemptAt).isAfter(Instant.now().plusSeconds(3));

        assertThat(publisher.publishDue()).isZero(); // not due yet
        e.nextAttemptAt = Instant.now().minusSeconds(1);
        repo.save(e);
        assertThat(publisher.publishDue()).isEqualTo(1);
        assertThat(repo.findAll().get(0).sentAt).isNotNull();
        assertThat(bodies.get(1)).contains("\"type\":\"STEP_APPROVED\"").contains("\"eventId\":\"evt_").endsWith("|test-token");
    }

    @Test
    void noContextUrlLeavesEventsPending() {
        OutboxPublisher publisher = new OutboxPublisher(repo, RestClient.builder(), "", "test-token");
        writer.enqueue("FEATURE_DONE", Map.of("projectId", "proj_1"));
        assertThat(publisher.publishDue()).isZero();
        assertThat(repo.findAll().get(0).attempts).isZero();
    }
}

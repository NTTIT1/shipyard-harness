package com.shipyard.platform.orchestrator;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.util.Map;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "shipyard.service-token=test-token",
        "shipyard.outbox.interval-ms=3600000",
        "shipyard.context-service-url="
})
@Import(OrchestratorIT.Fakes.class)
public abstract class OrchestratorIT {

    static final PostgreSQLContainer PG = new PostgreSQLContainer("postgres:16-alpine");
    static { PG.start(); }

    @DynamicPropertySource
    static void db(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", PG::getJdbcUrl);
        r.add("spring.datasource.username", PG::getUsername);
        r.add("spring.datasource.password", PG::getPassword);
    }

    @TestConfiguration
    static class Fakes {
        @Bean @Primary FakeProjectDirectory fakeProjectDirectory() { return new FakeProjectDirectory(); }
    }

    @Autowired protected TestRestTemplate rest;
    @Autowired protected FakeProjectDirectory directory;
    @Autowired protected JdbcTemplate jdbc;

    @BeforeEach
    void cleanDb() {
        jdbc.execute("TRUNCATE runs, run_steps, step_revisions, approval_requests, gate_policies, outbox_events CASCADE");
        directory.reset();
    }

    /** Harness call (service token). */
    protected ResponseEntity<Map> internal(HttpMethod m, String path, Object body) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        h.set("X-Service-Token", "test-token");
        return rest.exchange(path, m, new HttpEntity<>(body, h), Map.class);
    }

    /** Human call as forwarded by the gateway (X-User-Id). */
    protected ResponseEntity<Map> user(String userId, HttpMethod m, String path, Object body) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        h.set("X-User-Id", userId);
        return rest.exchange(path, m, new HttpEntity<>(body, h), Map.class);
    }

    @SuppressWarnings("unchecked")
    protected static <T> T data(ResponseEntity<Map> r) {
        return (T) r.getBody().get("data");
    }
}

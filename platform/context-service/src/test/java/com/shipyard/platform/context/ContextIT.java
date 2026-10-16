package com.shipyard.platform.context;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.util.Map;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "shipyard.service-token=test-token",
        "shipyard.embedding.worker-interval-ms=3600000"
})
@Import(ContextIT.Fakes.class)
public abstract class ContextIT {

    static final PostgreSQLContainer PG = new PostgreSQLContainer(
            DockerImageName.parse("pgvector/pgvector:pg16").asCompatibleSubstituteFor("postgres"));
    static { PG.start(); }

    @DynamicPropertySource
    static void db(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", PG::getJdbcUrl);
        r.add("spring.datasource.username", PG::getUsername);
        r.add("spring.datasource.password", PG::getPassword);
    }

    @TestConfiguration
    static class Fakes {
        @Bean @Primary HashingEmbeddingProvider hashingEmbeddingProvider() { return new HashingEmbeddingProvider(); }
        @Bean @Primary FakeProjectDirectory fakeProjectDirectory() { return new FakeProjectDirectory(); }
    }

    @Autowired protected TestRestTemplate rest;
    @Autowired protected HashingEmbeddingProvider provider;
    @Autowired protected FakeProjectDirectory directory;
    @Autowired protected JdbcClient db;

    @BeforeEach
    void cleanDb() {
        db.sql("TRUNCATE processed_events, memory_items, memory_chunks, memory_entities, memory_edges RESTART IDENTITY CASCADE").update();
        provider.down = false;
        provider.broken = false;
        directory.reset();
    }

    protected ResponseEntity<Map> internal(HttpMethod m, String path, Object body) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        h.set("X-Service-Token", "test-token");
        return rest.exchange(path, m, new HttpEntity<>(body, h), Map.class);
    }

    protected ResponseEntity<Map> user(String userId, String sysRole, HttpMethod m, String path, Object body) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        h.set("X-User-Id", userId);
        if (sysRole != null) h.set("X-User-Role", sysRole);
        return rest.exchange(path, m, new HttpEntity<>(body, h), Map.class);
    }

    @SuppressWarnings("unchecked")
    protected static <T> T data(ResponseEntity<Map> r) { return (T) r.getBody().get("data"); }
}

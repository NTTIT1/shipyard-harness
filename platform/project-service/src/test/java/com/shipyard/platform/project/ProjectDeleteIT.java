package com.shipyard.platform.project;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

/** Owner deletes a project: downstream data is purged first, then the project and its members. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "shipyard.service-token=test-token")
class ProjectDeleteIT {

    static final PostgreSQLContainer PG = new PostgreSQLContainer("postgres:16-alpine");
    static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);
    /** Fake orchestrator + context-service: record DELETE calls; FAIL toggles a 500 from context. */
    static final List<String> CALLS = new CopyOnWriteArrayList<>();
    static volatile boolean FAIL = false;
    static final HttpServer DOWN;
    static {
        PG.start(); REDIS.start();
        try { DOWN = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0); } catch (IOException e) { throw new UncheckedIOException(e); }
        DOWN.createContext("/", ex -> {
            CALLS.add(ex.getRequestMethod() + " " + ex.getRequestURI().getPath() + "|" + ex.getRequestHeaders().getFirst("X-Service-Token"));
            boolean fail = FAIL && ex.getRequestURI().getPath().endsWith("/memory");
            byte[] body = "{\"success\":true,\"data\":{}}".getBytes();
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(fail ? 500 : 200, body.length);
            ex.getResponseBody().write(body);
            ex.close();
        });
        DOWN.start();
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", PG::getJdbcUrl);
        r.add("spring.datasource.username", PG::getUsername);
        r.add("spring.datasource.password", PG::getPassword);
        r.add("spring.data.redis.host", REDIS::getHost);
        r.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
        String url = "http://127.0.0.1:" + DOWN.getAddress().getPort();
        r.add("shipyard.orchestrator-url", () -> url);
        r.add("shipyard.context-url", () -> url);
    }

    @Autowired TestRestTemplate rest;

    @BeforeEach
    void reset() {
        CALLS.clear(); FAIL = false;
        rest.getRestTemplate().setRequestFactory(new JdkClientHttpRequestFactory());
    }

    ResponseEntity<Map> call(HttpMethod m, String path, String userId, Object body) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (userId != null) h.set("X-User-Id", userId);
        return rest.exchange(path, m, new HttpEntity<>(body, h), Map.class);
    }

    String[] project(String owner) {
        String slug = "p" + UUID.randomUUID().toString().substring(0, 8);
        Map d = (Map) call(HttpMethod.POST, "/api/v1/projects", owner, Map.of("slug", slug, "name", "P", "repoUrl", "https://e.com/r.git")).getBody().get("data");
        return new String[]{(String) d.get("id"), slug};
    }

    @Test
    void ownerDeletesAfterTypingTheSlug() {
        String[] p = project("usr_owner");
        call(HttpMethod.POST, "/api/v1/projects/" + p[0] + "/members", "usr_owner", Map.of("userId", "usr_pm", "roles", List.of("PM")));
        CALLS.clear();

        assertThat(call(HttpMethod.DELETE, "/api/v1/projects/" + p[0] + "?confirm=wrong", "usr_owner", null).getStatusCode().value()).isEqualTo(400);
        assertThat(CALLS).isEmpty();

        assertThat(call(HttpMethod.DELETE, "/api/v1/projects/" + p[0] + "?confirm=" + p[1], "usr_owner", null).getStatusCode().value()).isEqualTo(200);
        assertThat(CALLS).containsExactly(
                "DELETE /internal/v1/projects/" + p[0] + "|test-token",
                "DELETE /internal/v1/projects/" + p[0] + "/memory|test-token");
        assertThat(call(HttpMethod.GET, "/api/v1/projects/" + p[0], "usr_owner", null).getStatusCode().value()).isEqualTo(404);
        List<Map> mine = (List<Map>) call(HttpMethod.GET, "/api/v1/projects", "usr_pm", null).getBody().get("data");
        assertThat(mine).noneMatch(x -> p[0].equals(x.get("id")));
    }

    @Test
    void onlyOwnersMayDelete() {
        String[] p = project("usr_owner");
        call(HttpMethod.POST, "/api/v1/projects/" + p[0] + "/members", "usr_owner", Map.of("userId", "usr_m", "roles", List.of("MAINTAINER")));
        assertThat(call(HttpMethod.DELETE, "/api/v1/projects/" + p[0] + "?confirm=" + p[1], "usr_m", null).getStatusCode().value()).isEqualTo(403);
        assertThat(call(HttpMethod.DELETE, "/api/v1/projects/" + p[0] + "?confirm=" + p[1], "usr_stranger", null).getStatusCode().value()).isEqualTo(404);
        assertThat(call(HttpMethod.GET, "/api/v1/projects/" + p[0], "usr_owner", null).getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void aFailedPurgeKeepsTheProjectSoItCanBeRetried() {
        String[] p = project("usr_owner");
        FAIL = true;
        assertThat(call(HttpMethod.DELETE, "/api/v1/projects/" + p[0] + "?confirm=" + p[1], "usr_owner", null).getStatusCode().value()).isEqualTo(503);
        assertThat(call(HttpMethod.GET, "/api/v1/projects/" + p[0], "usr_owner", null).getStatusCode().value()).isEqualTo(200);
        FAIL = false;
        assertThat(call(HttpMethod.DELETE, "/api/v1/projects/" + p[0] + "?confirm=" + p[1], "usr_owner", null).getStatusCode().value()).isEqualTo(200);
    }
}

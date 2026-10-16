package com.shipyard.platform.common.directory;

import com.shipyard.platform.common.exception.UpstreamUnavailableException;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.net.InetSocketAddress;
import java.time.Duration;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HttpProjectDirectoryTest {
    HttpServer server;

    @AfterEach
    void stop() { if (server != null) server.stop(0); }

    private String serve(String body, AtomicInteger hits, AtomicReference<String> token) throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", ex -> {
            hits.incrementAndGet();
            token.set(ex.getRequestHeaders().getFirst("X-Service-Token"));
            byte[] b = body.getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(200, b.length);
            ex.getResponseBody().write(b);
            ex.close();
        });
        server.start();
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @Test
    void sendsTokenParsesEnvelopeAndCaches() throws Exception {
        AtomicInteger hits = new AtomicInteger();
        AtomicReference<String> token = new AtomicReference<>();
        String url = serve("{\"success\":true,\"message\":\"Success\",\"data\":[\"PM\",\"BA\"],\"timestamp\":\"2026-10-15T00:00:00Z\"}", hits, token);
        HttpProjectDirectory dir = new HttpProjectDirectory(RestClient.builder(), url, "tok", Duration.ofSeconds(60));
        assertThat(dir.rolesOf("proj_1", "usr_1")).containsExactly("PM", "BA");
        assertThat(dir.rolesOf("proj_1", "usr_1")).containsExactly("PM", "BA");
        assertThat(hits.get()).isEqualTo(1);
        assertThat(token.get()).isEqualTo("tok");
    }

    @Test
    void serverDownRaisesUpstreamUnavailable() {
        HttpProjectDirectory dir = new HttpProjectDirectory(RestClient.builder(), "http://127.0.0.1:9", "tok", Duration.ofSeconds(60));
        assertThatThrownBy(() -> dir.roleHolders("proj_1"))
                .isInstanceOf(UpstreamUnavailableException.class).hasMessageContaining("project-service");
    }

    @Test
    void evictForcesRefetchForThatProjectAndUser() throws Exception {
        AtomicInteger hits = new AtomicInteger();
        String url = serve("{\"success\":true,\"data\":[\"PM\"]}", hits, new AtomicReference<>());
        HttpProjectDirectory dir = new HttpProjectDirectory(RestClient.builder(), url, "tok", Duration.ofSeconds(60));
        dir.rolesOf("proj_1", "usr_1");
        dir.rolesOf("proj_2", "usr_1");
        dir.evict("proj_1", "usr_1");
        dir.rolesOf("proj_1", "usr_1");
        dir.rolesOf("proj_2", "usr_1");
        assertThat(hits.get()).isEqualTo(3);
    }

    @Test
    void zeroTtlMeansEveryCallHitsProjectService() throws Exception {
        AtomicInteger hits = new AtomicInteger();
        String url = serve("{\"success\":true,\"data\":[\"PM\"]}", hits, new AtomicReference<>());
        HttpProjectDirectory dir = new HttpProjectDirectory(RestClient.builder(), url, "tok", Duration.ZERO);
        dir.rolesOf("proj_1", "usr_1");
        dir.rolesOf("proj_1", "usr_1");
        assertThat(hits.get()).isEqualTo(2);
    }
}

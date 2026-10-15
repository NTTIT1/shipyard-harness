package com.shipyard.platform.project;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CopyOnWriteArrayList;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "shipyard.service-token=test-token")
class ProjectMembersIT {

    static final PostgreSQLContainer PG = new PostgreSQLContainer("postgres:16-alpine");
    static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);
    /** Fake orchestrator: records every cache-evict notification body. */
    static final List<String> EVICTS = new CopyOnWriteArrayList<>();
    static final HttpServer ORCH;
    static {
        PG.start(); REDIS.start();
        try {
            ORCH = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) { throw new UncheckedIOException(e); }
        ORCH.createContext("/internal/v1/directory/evict", ex -> {
            EVICTS.add(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)
                    + "|" + ex.getRequestHeaders().getFirst("X-Service-Token"));
            ex.sendResponseHeaders(200, -1);
            ex.close();
        });
        ORCH.start();
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", PG::getJdbcUrl);
        r.add("spring.datasource.username", PG::getUsername);
        r.add("spring.datasource.password", PG::getPassword);
        r.add("spring.data.redis.host", REDIS::getHost);
        r.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
        r.add("shipyard.orchestrator-url", () -> "http://127.0.0.1:" + ORCH.getAddress().getPort());
    }

    @Autowired TestRestTemplate rest;

    private ResponseEntity<Map> call(HttpMethod m, String path, String userId, boolean token, Object body) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (userId != null) h.set("X-User-Id", userId);
        if (token) h.set("X-Service-Token", "test-token");
        return rest.exchange(path, m, new HttpEntity<>(body, h), Map.class);
    }

    private String newProject(String owner) {
        String slug = "p" + UUID.randomUUID().toString().substring(0, 8);
        ResponseEntity<Map> r = call(HttpMethod.POST, "/api/v1/projects", owner, false,
                Map.of("slug", slug, "name", "P", "repoUrl", "https://example.com/r.git"));
        assertThat(r.getStatusCode().value()).isEqualTo(200);
        return (String) ((Map) r.getBody().get("data")).get("id");
    }

    @Test
    void ownerGrantsSeveralRolesAndInternalApiReportsThem() {
        String pid = newProject("usr_owner");
        assertThat(call(HttpMethod.POST, "/api/v1/projects/" + pid + "/members", "usr_owner", false,
                Map.of("userId", "usr_ann", "roles", List.of("PM", "BA"))).getStatusCode().value()).isEqualTo(200);

        Map roles = call(HttpMethod.GET, "/internal/v1/projects/" + pid + "/members/usr_ann/roles", null, true, null).getBody();
        assertThat((List<String>) roles.get("data")).containsExactlyInAnyOrder("PM", "BA");

        Map holders = call(HttpMethod.GET, "/internal/v1/projects/" + pid + "/role-holders", null, true, null).getBody();
        assertThat((Map<String, Integer>) holders.get("data")).containsEntry("PM", 1).containsEntry("BA", 1).containsEntry("OWNER", 1);

        Map ms = call(HttpMethod.GET, "/internal/v1/users/" + "usr_ann" + "/memberships", null, true, null).getBody();
        assertThat((List<Map>) ms.get("data")).anySatisfy(m -> {
            assertThat(m.get("projectId")).isEqualTo(pid);
            assertThat((List<String>) m.get("roles")).containsExactlyInAnyOrder("PM", "BA");
        });
    }

    @Test
    void regrantReplacesTheRoleSet() {
        String pid = newProject("usr_owner");
        call(HttpMethod.POST, "/api/v1/projects/" + pid + "/members", "usr_owner", false, Map.of("userId", "usr_bob", "roles", List.of("PM", "BA")));
        call(HttpMethod.POST, "/api/v1/projects/" + pid + "/members", "usr_owner", false, Map.of("userId", "usr_bob", "role", "TESTER"));
        Map roles = call(HttpMethod.GET, "/internal/v1/projects/" + pid + "/members/usr_bob/roles", null, true, null).getBody();
        assertThat((List<String>) roles.get("data")).containsExactly("TESTER");
    }

    @Test
    void cannotRemoveTheLastOwner() {
        String pid = newProject("usr_owner");
        assertThat(call(HttpMethod.POST, "/api/v1/projects/" + pid + "/members", "usr_owner", false,
                Map.of("userId", "usr_owner", "roles", List.of("PM"))).getStatusCode().value()).isEqualTo(409);
        assertThat(call(HttpMethod.DELETE, "/api/v1/projects/" + pid + "/members/usr_owner", "usr_owner", false, null)
                .getStatusCode().value()).isEqualTo(409);
    }

    @Test
    void internalApiNeedsTokenAndOutsidersSee404() {
        String pid = newProject("usr_owner");
        assertThat(call(HttpMethod.GET, "/internal/v1/projects/" + pid + "/role-holders", null, false, null)
                .getStatusCode().value()).isEqualTo(401);
        assertThat(call(HttpMethod.GET, "/api/v1/projects/" + pid, "usr_stranger", false, null)
                .getStatusCode().value()).isEqualTo(404);
        Map roles = call(HttpMethod.GET, "/internal/v1/projects/" + pid + "/members/usr_stranger/roles", null, true, null).getBody();
        assertThat((List<?>) roles.get("data")).isEmpty();
    }

    @Test
    void roleChangesNotifyTheOrchestratorToDropItsCache() {
        String pid = newProject("usr_owner");
        assertThat(EVICTS).anySatisfy(e -> assertThat(e).contains(pid).contains("usr_owner").endsWith("|test-token"));
        EVICTS.clear();
        call(HttpMethod.POST, "/api/v1/projects/" + pid + "/members", "usr_owner", false,
                Map.of("userId", "usr_cat", "roles", List.of("BA")));
        assertThat(EVICTS).singleElement().satisfies(e -> assertThat(e).contains(pid).contains("\"userId\":\"usr_cat\""));
        EVICTS.clear();
        call(HttpMethod.DELETE, "/api/v1/projects/" + pid + "/members/usr_cat", "usr_owner", false, null);
        assertThat(EVICTS).singleElement().satisfies(e -> assertThat(e).contains("usr_cat"));
    }

    @Test
    void rejectedRoleChangeSendsNoNotification() {
        String pid = newProject("usr_owner");
        EVICTS.clear();
        call(HttpMethod.POST, "/api/v1/projects/" + pid + "/members", "usr_owner", false,
                Map.of("userId", "usr_owner", "roles", List.of("PM")));
        assertThat(EVICTS).isEmpty();
    }
}

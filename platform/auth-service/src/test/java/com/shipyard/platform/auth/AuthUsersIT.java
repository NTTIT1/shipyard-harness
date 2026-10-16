package com.shipyard.platform.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthUsersIT {
    static final PostgreSQLContainer PG = new PostgreSQLContainer("postgres:16-alpine");
    static { PG.start(); }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", PG::getJdbcUrl);
        r.add("spring.datasource.username", PG::getUsername);
        r.add("spring.datasource.password", PG::getPassword);
    }

    @Autowired TestRestTemplate rest;

    String register(String email) {
        Map body = rest.postForObject("/api/v1/auth/register",
                Map.of("email", email, "password", "secret12", "fullName", "Người " + email), Map.class);
        return (String) ((Map) ((Map) body.get("data")).get("user")).get("id");
    }

    ResponseEntity<Map> get(String path, String userId) {
        HttpHeaders h = new HttpHeaders();
        if (userId != null) h.set("X-User-Id", userId);
        return rest.exchange(path, HttpMethod.GET, new HttpEntity<>(h), Map.class);
    }

    @Test
    void usersByIdsReturnsPublicProfiles() {
        String a = register("a" + UUID.randomUUID() + "@x.io"), b = register("b" + UUID.randomUUID() + "@x.io");
        List<Map> users = (List<Map>) get("/api/v1/auth/users?ids=" + a + "," + b + ",usr_none", a).getBody().get("data");
        assertThat(users).extracting(u -> u.get("id")).containsExactlyInAnyOrder(a, b);
        assertThat(users.get(0)).containsKeys("email", "fullName").doesNotContainKey("passwordHash");
    }

    @Test
    void lookupByEmailIsCaseInsensitive() {
        String email = "c" + UUID.randomUUID() + "@x.io";
        String id = register(email);
        Map u = (Map) get("/api/v1/auth/users/lookup?email=" + email.toUpperCase(), id).getBody().get("data");
        assertThat(u.get("id")).isEqualTo(id);
    }

    @Test
    void lookupUnknownEmailIs404() {
        String me = register("d" + UUID.randomUUID() + "@x.io");
        assertThat(get("/api/v1/auth/users/lookup?email=nobody@x.io", me).getStatusCode().value()).isEqualTo(404);
    }

    @Test
    void anonymousCallsAre401() {
        assertThat(get("/api/v1/auth/users?ids=x", null).getStatusCode().value()).isEqualTo(401);
    }
}

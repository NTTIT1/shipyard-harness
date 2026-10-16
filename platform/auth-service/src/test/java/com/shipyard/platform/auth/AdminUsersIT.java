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

/** Admin user management; self-registration is OFF by default. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminUsersIT {
    static final PostgreSQLContainer PG = new PostgreSQLContainer("postgres:16-alpine");
    static { PG.start(); }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", PG::getJdbcUrl);
        r.add("spring.datasource.username", PG::getUsername);
        r.add("spring.datasource.password", PG::getPassword);
        r.add("shipyard.admin.email", () -> "root@x.io");
        r.add("shipyard.admin.password", () -> "rootpass1");
    }

    @Autowired TestRestTemplate rest;

    @org.junit.jupiter.api.BeforeEach
    void jdkClient() { // HttpURLConnection can't send PATCH nor read 401 bodies
        rest.getRestTemplate().setRequestFactory(new org.springframework.http.client.JdkClientHttpRequestFactory());
    }

    ResponseEntity<Map> call(HttpMethod m, String path, String userId, Object body) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (userId != null) h.set("X-User-Id", userId);
        return rest.exchange(path, m, new HttpEntity<>(body, h), Map.class);
    }

    ResponseEntity<Map> login(String email, String pw) {
        return call(HttpMethod.POST, "/api/v1/auth/login", null, Map.of("email", email, "password", pw));
    }

    String adminId() {
        return (String) ((Map) ((Map) login("root@x.io", "rootpass1").getBody().get("data")).get("user")).get("id");
    }

    Map create(String admin, String email, String role) {
        ResponseEntity<Map> r = call(HttpMethod.POST, "/api/v1/auth/admin/users", admin,
                Map.of("email", email, "password", "secret12", "fullName", "Người " + email, "systemRole", role));
        assertThat(r.getStatusCode().value()).as(String.valueOf(r.getBody())).isEqualTo(200);
        return (Map) r.getBody().get("data");
    }

    String mail() { return "u" + UUID.randomUUID() + "@x.io"; }

    @Test
    void selfRegistrationIsClosedByDefault() {
        ResponseEntity<Map> r = call(HttpMethod.POST, "/api/v1/auth/register", null,
                Map.of("email", mail(), "password", "secret12", "fullName", "X"));
        assertThat(r.getStatusCode().value()).isEqualTo(403);
    }

    @Test
    void adminCreatesListsAndTheUserCanLogIn() {
        String admin = adminId(), email = mail();
        Map u = create(admin, email, "USER");
        assertThat(u).containsEntry("email", email).containsEntry("status", "ACTIVE").doesNotContainKey("passwordHash");
        List<Map> all = (List<Map>) call(HttpMethod.GET, "/api/v1/auth/admin/users", admin, null).getBody().get("data");
        assertThat(all).extracting(x -> x.get("email")).contains(email, "root@x.io");
        assertThat(login(email, "secret12").getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void duplicateEmailIsRejectedCaseInsensitively() {
        String admin = adminId(), email = mail();
        create(admin, email, "USER");
        ResponseEntity<Map> r = call(HttpMethod.POST, "/api/v1/auth/admin/users", admin,
                Map.of("email", email.toUpperCase(), "password", "secret12", "fullName", "Y"));
        assertThat(r.getStatusCode().value()).isEqualTo(409);
    }

    @Test
    void nonAdminsAreForbiddenAndAnonymousIs401() {
        String admin = adminId(), email = mail();
        String plain = (String) create(admin, email, "USER").get("id");
        assertThat(call(HttpMethod.GET, "/api/v1/auth/admin/users", plain, null).getStatusCode().value()).isEqualTo(403);
        assertThat(call(HttpMethod.POST, "/api/v1/auth/admin/users", plain,
                Map.of("email", mail(), "password", "secret12", "fullName", "Z")).getStatusCode().value()).isEqualTo(403);
        assertThat(call(HttpMethod.GET, "/api/v1/auth/admin/users", null, null).getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void disablingBlocksLoginAndRefreshAndEnablingRestores() {
        String admin = adminId(), email = mail();
        String id = (String) create(admin, email, "USER").get("id");
        String rt = (String) ((Map) login(email, "secret12").getBody().get("data")).get("refreshToken");
        Map d = (Map) call(HttpMethod.PATCH, "/api/v1/auth/admin/users/" + id, admin, Map.of("status", "DISABLED")).getBody().get("data");
        assertThat(d).containsEntry("status", "DISABLED");
        assertThat(login(email, "secret12").getStatusCode().value()).isEqualTo(401);
        assertThat(call(HttpMethod.POST, "/api/v1/auth/refresh", null, Map.of("refreshToken", rt)).getStatusCode().value()).isEqualTo(401);
        call(HttpMethod.PATCH, "/api/v1/auth/admin/users/" + id, admin, Map.of("status", "ACTIVE"));
        assertThat(login(email, "secret12").getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void adminCannotDisableOrDemoteThemselves() {
        String admin = adminId();
        assertThat(call(HttpMethod.PATCH, "/api/v1/auth/admin/users/" + admin, admin, Map.of("status", "DISABLED"))
                .getStatusCode().value()).isEqualTo(400);
        assertThat(call(HttpMethod.PATCH, "/api/v1/auth/admin/users/" + admin, admin, Map.of("systemRole", "USER"))
                .getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void promotedAdminGainsAccessAndInvalidValuesAre400() {
        String admin = adminId();
        String id = (String) create(admin, mail(), "USER").get("id");
        call(HttpMethod.PATCH, "/api/v1/auth/admin/users/" + id, admin, Map.of("systemRole", "SYS_ADMIN", "fullName", "Trưởng nhóm"));
        ResponseEntity<Map> list = call(HttpMethod.GET, "/api/v1/auth/admin/users", id, null);
        assertThat(list.getStatusCode().value()).isEqualTo(200);
        assertThat(call(HttpMethod.PATCH, "/api/v1/auth/admin/users/" + id, admin, Map.of("status", "WHATEVER"))
                .getStatusCode().value()).isEqualTo(400);
        assertThat(call(HttpMethod.PATCH, "/api/v1/auth/admin/users/usr_nope", admin, Map.of("status", "ACTIVE"))
                .getStatusCode().value()).isEqualTo(404);
    }

    @Test
    void resetPasswordUnlocksAndRevokesSessions() {
        String admin = adminId(), email = mail();
        String id = (String) create(admin, email, "USER").get("id");
        String rt = (String) ((Map) login(email, "secret12").getBody().get("data")).get("refreshToken");
        for (int i = 0; i < 5; i++) login(email, "wrong-pass");
        assertThat(login(email, "secret12").getStatusCode().value()).isEqualTo(401); // locked
        assertThat(call(HttpMethod.POST, "/api/v1/auth/admin/users/" + id + "/password", admin, Map.of("password", "short"))
                .getStatusCode().value()).isEqualTo(400);
        assertThat(call(HttpMethod.POST, "/api/v1/auth/admin/users/" + id + "/password", admin, Map.of("password", "newpass99"))
                .getStatusCode().value()).isEqualTo(200);
        assertThat(login(email, "newpass99").getStatusCode().value()).isEqualTo(200);
        assertThat(call(HttpMethod.POST, "/api/v1/auth/refresh", null, Map.of("refreshToken", rt)).getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void usersChangeTheirOwnPasswordWithTheCurrentOne() {
        String admin = adminId(), email = mail();
        String id = (String) create(admin, email, "USER").get("id");
        assertThat(call(HttpMethod.POST, "/api/v1/auth/me/password", id,
                Map.of("currentPassword", "nope-nope", "newPassword", "brandnew1")).getStatusCode().value()).isEqualTo(400);
        assertThat(call(HttpMethod.POST, "/api/v1/auth/me/password", id,
                Map.of("currentPassword", "secret12", "newPassword", "brandnew1")).getStatusCode().value()).isEqualTo(200);
        assertThat(login(email, "brandnew1").getStatusCode().value()).isEqualTo(200);
        assertThat(call(HttpMethod.POST, "/api/v1/auth/me/password", null,
                Map.of("currentPassword", "x", "newPassword", "yyyyyyyy")).getStatusCode().value()).isEqualTo(401);
    }
}

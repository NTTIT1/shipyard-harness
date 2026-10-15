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

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** An install created before multi-role (old PK + Hibernate's 5-role CHECK) must accept the new roles after V2. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"shipyard.service-token=test-token", "shipyard.orchestrator-url="})
class LegacySchemaMigrationIT {

    static final PostgreSQLContainer PG = new PostgreSQLContainer("postgres:16-alpine");
    static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);

    static {
        PG.start();
        REDIS.start();
        // Exactly what the pre-branch jar (Hibernate 6.5, ddl-auto=update) created.
        try (Connection c = DriverManager.getConnection(PG.getJdbcUrl(), PG.getUsername(), PG.getPassword());
             Statement s = c.createStatement()) {
            s.execute("""
                    CREATE TABLE projects (id varchar(36) PRIMARY KEY, slug varchar(50) UNIQUE NOT NULL, name varchar(100) NOT NULL,
                        repo_url varchar(500) NOT NULL, default_branch varchar(100) NOT NULL, figma_file_key varchar(100),
                        design_system_config jsonb, monthly_budget_usd numeric(10,2) NOT NULL, status varchar(20) NOT NULL,
                        created_at timestamp(6) with time zone NOT NULL)""");
            s.execute("""
                    CREATE TABLE project_members (project_id varchar(255) NOT NULL, user_id varchar(255) NOT NULL,
                        role varchar(30) NOT NULL CHECK (role IN ('OWNER','MAINTAINER','DEVELOPER','DESIGNER','VIEWER')),
                        created_at timestamp(6) with time zone NOT NULL, PRIMARY KEY (project_id, user_id))""");
            s.execute("INSERT INTO projects VALUES ('proj_old','old','Old','https://e/r.git','development',null,null,100,'ACTIVE',now())");
            s.execute("INSERT INTO project_members VALUES ('proj_old','usr_owner','OWNER',now())");
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", PG::getJdbcUrl);
        r.add("spring.datasource.username", PG::getUsername);
        r.add("spring.datasource.password", PG::getPassword);
        r.add("spring.data.redis.host", REDIS::getHost);
        r.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
    }

    @Autowired TestRestTemplate rest;

    @Test
    void newRolesCanBeGrantedAndOldRowsSurvive() {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        h.set("X-User-Id", "usr_owner");
        ResponseEntity<Map> r = rest.exchange("/api/v1/projects/proj_old/members", HttpMethod.POST,
                new HttpEntity<>(Map.of("userId", "usr_ann", "roles", List.of("PM", "TESTER")), h), Map.class);
        assertThat(r.getStatusCode().value()).isEqualTo(200);

        HttpHeaders t = new HttpHeaders();
        t.set("X-Service-Token", "test-token");
        Map holders = rest.exchange("/internal/v1/projects/proj_old/role-holders", HttpMethod.GET,
                new HttpEntity<>(t), Map.class).getBody();
        assertThat((Map<String, Integer>) holders.get("data"))
                .containsEntry("OWNER", 1).containsEntry("PM", 1).containsEntry("TESTER", 1);
    }
}

package com.shipyard.platform.orchestrator;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class DirectoryEvictIT extends OrchestratorIT {

    @Test
    void evictDropsTheProjectUserEntry() {
        assertThat(internal(HttpMethod.POST, "/internal/v1/directory/evict",
                Map.of("projectId", "proj_1", "userId", "usr_1")).getStatusCode().value()).isEqualTo(200);
        assertThat(directory.evictions).containsExactly("proj_1|usr_1");
    }

    @Test
    void evictWithoutUserMeansWholeProject() {
        Map<String, Object> body = new HashMap<>();
        body.put("projectId", "proj_1");
        internal(HttpMethod.POST, "/internal/v1/directory/evict", body);
        assertThat(directory.evictions).containsExactly("proj_1|null");
    }

    @Test
    void evictNeedsProjectIdAndServiceToken() {
        assertThat(internal(HttpMethod.POST, "/internal/v1/directory/evict", Map.of("userId", "usr_1"))
                .getStatusCode().value()).isEqualTo(400);
        // GET probe: the token filter runs before routing (JDK HttpURLConnection can't read a 401 on POST).
        assertThat(rest.exchange("/internal/v1/directory/evict", HttpMethod.GET,
                new HttpEntity<>(new HttpHeaders()), Map.class).getStatusCode().value()).isEqualTo(401);
        assertThat(directory.evictions).isEmpty();
    }
}

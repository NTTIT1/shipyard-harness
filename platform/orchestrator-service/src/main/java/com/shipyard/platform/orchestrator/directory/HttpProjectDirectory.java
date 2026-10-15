package com.shipyard.platform.orchestrator.directory;

import com.shipyard.platform.common.dto.ApiResponse;
import com.shipyard.platform.common.exception.UpstreamUnavailableException;
import com.shipyard.platform.common.web.ServiceTokenFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/** Reads membership from project-service /internal/v1 (60 s cache, spec §3.5). */
@Component
public class HttpProjectDirectory implements ProjectDirectory {

    private static final Duration TTL = Duration.ofSeconds(60);

    private final RestClient http;
    private final TtlCache<String, List<String>> roles = new TtlCache<>(TTL, System::currentTimeMillis);
    private final TtlCache<String, Map<String, Long>> holders = new TtlCache<>(TTL, System::currentTimeMillis);
    private final TtlCache<String, List<Membership>> memberships = new TtlCache<>(TTL, System::currentTimeMillis);

    public HttpProjectDirectory(RestClient.Builder builder,
                                @Value("${shipyard.project-service-url}") String baseUrl,
                                @Value("${shipyard.service-token}") String token) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000);
        factory.setReadTimeout(5000);
        this.http = builder.baseUrl(baseUrl).requestFactory(factory)
                .defaultHeader(ServiceTokenFilter.HEADER, token).build();
    }

    @Override
    public List<String> rolesOf(String projectId, String userId) {
        return roles.get(projectId + "|" + userId, k -> fetch("/internal/v1/projects/{p}/members/{u}/roles",
                new ParameterizedTypeReference<ApiResponse<List<String>>>() {}, projectId, userId));
    }

    @Override
    public Map<String, Long> roleHolders(String projectId) {
        return holders.get(projectId, k -> fetch("/internal/v1/projects/{p}/role-holders",
                new ParameterizedTypeReference<ApiResponse<Map<String, Long>>>() {}, projectId));
    }

    @Override
    public List<Membership> membershipsOf(String userId) {
        return memberships.get(userId, k -> fetch("/internal/v1/users/{u}/memberships",
                new ParameterizedTypeReference<ApiResponse<List<Membership>>>() {}, userId));
    }

    @Override
    public void evict(String projectId, String userId) {
        roles.invalidateIf(k -> userId == null ? k.startsWith(projectId + "|") : k.equals(projectId + "|" + userId));
        holders.invalidateIf(k -> k.equals(projectId));
        if (userId == null) memberships.invalidateIf(k -> true);
        else memberships.invalidateIf(k -> k.equals(userId));
    }

    private <T> T fetch(String uri, ParameterizedTypeReference<ApiResponse<T>> type, Object... vars) {
        ApiResponse<T> body;
        try {
            body = http.get().uri(uri, vars).retrieve().body(type);
        } catch (RestClientException e) {
            throw new UpstreamUnavailableException("project-service unavailable: " + e.getMessage());
        }
        if (body == null || body.getData() == null) {
            throw new UpstreamUnavailableException("project-service returned no data for " + uri);
        }
        return body.getData();
    }
}

package com.shipyard.platform.project.event;

import com.shipyard.platform.common.exception.UpstreamUnavailableException;
import com.shipyard.platform.common.web.ServiceTokenFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Before a project row is deleted, the services that hold its data drop it: orchestrator (runs,
 * approvals, gate policy, pending events) then context-service (memory). Any failure aborts the
 * delete (503) so it can simply be retried; both purges are idempotent.
 */
@Component
public class ProjectPurgeClient {

    private final RestClient orchestrator;
    private final RestClient context;

    public ProjectPurgeClient(RestClient.Builder builder,
                              @Value("${shipyard.orchestrator-url:}") String orchestratorUrl,
                              @Value("${shipyard.context-url:}") String contextUrl,
                              @Value("${shipyard.service-token}") String token) {
        this.orchestrator = client(builder.clone(), orchestratorUrl, token);
        this.context = client(builder.clone(), contextUrl, token);
    }

    private static RestClient client(RestClient.Builder b, String url, String token) {
        if (url == null || url.isBlank()) return null;
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(3000);
        f.setReadTimeout(30000);
        return b.baseUrl(url).requestFactory(f).defaultHeader(ServiceTokenFilter.HEADER, token).build();
    }

    public void purge(String projectId) {
        call(orchestrator, "/internal/v1/projects/{p}", projectId, "orchestrator-service");
        call(context, "/internal/v1/projects/{p}/memory", projectId, "context-service");
    }

    private static void call(RestClient http, String uri, String projectId, String name) {
        if (http == null) return;
        try {
            http.delete().uri(uri, projectId).retrieve().toBodilessEntity();
        } catch (RestClientException e) {
            throw new UpstreamUnavailableException(name + " could not purge the project: " + e.getMessage());
        }
    }
}

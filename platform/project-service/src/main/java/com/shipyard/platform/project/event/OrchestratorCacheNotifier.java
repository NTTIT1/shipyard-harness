package com.shipyard.platform.project.event;

import com.shipyard.platform.common.web.ServiceTokenFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.client.RestClient;

/**
 * Tells orchestrator-service to drop its cached roles once a membership change is committed,
 * so a new role can approve gates immediately. Best effort: on failure the orchestrator's
 * 60 s cache TTL still converges.
 */
@Component
public class OrchestratorCacheNotifier {
    private static final Logger log = LoggerFactory.getLogger(OrchestratorCacheNotifier.class);

    private final RestClient http;
    private final boolean enabled;

    public OrchestratorCacheNotifier(RestClient.Builder builder,
                                     @Value("${shipyard.orchestrator-url:}") String orchestratorUrl,
                                     @Value("${shipyard.service-token}") String token) {
        this.enabled = orchestratorUrl != null && !orchestratorUrl.isBlank();
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(2000);
        this.http = builder.baseUrl(enabled ? orchestratorUrl : "http://disabled.invalid").requestFactory(factory)
                .defaultHeader(ServiceTokenFilter.HEADER, token).build();
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onMembershipChanged(MembershipChanged e) {
        if (!enabled) return;
        try {
            http.post().uri("/internal/v1/directory/evict").contentType(MediaType.APPLICATION_JSON)
                    .body(e).retrieve().toBodilessEntity();
        } catch (RuntimeException ex) {
            log.warn("orchestrator cache evict failed for {}/{}: {}", e.projectId(), e.userId(), ex.getMessage());
        }
    }
}

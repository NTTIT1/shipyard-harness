package com.shipyard.platform.context.service;

import com.shipyard.platform.context.embedding.EmbeddingProvider;
import com.shipyard.platform.context.embedding.EmbeddingUnavailableException;
import com.shipyard.platform.context.store.MemoryStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Embeds pending chunks in the background so ingest (and approvals) never wait on the model. */
@Component
public class EmbeddingWorker {
    private static final Logger log = LoggerFactory.getLogger(EmbeddingWorker.class);
    private static final int BATCH = 16;
    private static final int MAX_ATTEMPTS = 10;

    private final MemoryStore store;
    private final EmbeddingProvider provider;

    public EmbeddingWorker(MemoryStore store, EmbeddingProvider provider) {
        this.store = store;
        this.provider = provider;
    }

    @Scheduled(fixedDelayString = "${shipyard.embedding.worker-interval-ms:2000}",
            initialDelayString = "${shipyard.embedding.worker-interval-ms:2000}")
    public void scheduled() {
        runOnce();
    }

    public int runOnce() {
        int done = 0;
        for (MemoryStore.PendingChunk c : store.duePending(BATCH)) {
            try {
                store.saveEmbedding(c.id(), provider.embed(c.text()), provider.model());
                done++;
            } catch (EmbeddingUnavailableException e) {
                store.embedFailed(c.id(), e.getMessage(), false, 30, MAX_ATTEMPTS);
                log.warn("embedding backend unavailable, retrying later: {}", e.getMessage());
                return done;
            } catch (RuntimeException e) {
                store.embedFailed(c.id(), e.getMessage(), true, 60, MAX_ATTEMPTS);
                log.warn("embedding chunk {} failed: {}", c.id(), e.getMessage());
            }
        }
        return done;
    }
}

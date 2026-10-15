package com.shipyard.platform.context;

import com.shipyard.platform.context.embedding.EmbeddingProvider;
import com.shipyard.platform.context.service.EmbeddingWorker;
import com.shipyard.platform.context.store.MemoryStore;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class EmbeddingWorkerIT extends ContextIT {
    @Autowired EmbeddingWorker worker;
    @Autowired MemoryStore store;

    void seed() {
        internal(HttpMethod.POST, "/internal/v1/memory/events", Map.of("eventId", "evt_1", "type", "FEATURE_DONE",
                "payload", Map.of("projectId", "proj_a", "runId", "run_a", "title", "Đăng xuất", "summary", "xong")));
    }

    @Test
    void pendingChunksGetEmbedded() {
        seed();
        assertThat(worker.runOnce()).isEqualTo(1);
        assertThat(db.sql("select embed_status || '|' || embedding_model from memory_chunks").query(String.class).single())
                .isEqualTo("EMBEDDED|test:hashing");
        assertThat(worker.runOnce()).isZero();
    }

    @Test
    void providerDownLeavesChunksPendingWithoutBurningAttempts() {
        seed();
        provider.down = true;
        assertThat(worker.runOnce()).isZero();
        assertThat(db.sql("select embed_status || '|' || attempts from memory_chunks").query(String.class).single()).isEqualTo("PENDING|0");
        assertThat(db.sql("select last_error from memory_chunks").query(String.class).single()).contains("down");
    }

    @Test
    void nonAvailabilityErrorsCountAttempts() {
        seed();
        long id = db.sql("select id from memory_chunks").query(Long.class).single();
        EmbeddingWorker broken = new EmbeddingWorker(store, new EmbeddingProvider() {
            public String model() { return "bad"; }
            public float[] embed(String t) { throw new IllegalStateException("Model x returns 768 dimensions"); }
        });
        assertThat(broken.runOnce()).isZero();
        assertThat(db.sql("select embed_status || '|' || attempts from memory_chunks").query(String.class).single()).isEqualTo("PENDING|1");
        db.sql("update memory_chunks set attempts = 9, next_attempt_at = now() where id = :id").param("id", id).update();
        broken.runOnce();
        assertThat(db.sql("select embed_status from memory_chunks").query(String.class).single()).isEqualTo("FAILED");
        assertThat(db.sql("select embedding is null from memory_chunks").query(Boolean.class).single()).isTrue();
    }
}

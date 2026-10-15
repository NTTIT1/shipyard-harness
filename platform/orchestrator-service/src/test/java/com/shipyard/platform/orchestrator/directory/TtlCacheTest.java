package com.shipyard.platform.orchestrator.directory;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

class TtlCacheTest {
    @Test
    void reloadsOnlyAfterExpiry() {
        AtomicLong now = new AtomicLong(0);
        AtomicInteger loads = new AtomicInteger();
        TtlCache<String, Integer> cache = new TtlCache<>(Duration.ofSeconds(60), now::get);
        assertThat(cache.get("k", k -> loads.incrementAndGet())).isEqualTo(1);
        now.set(59_999);
        assertThat(cache.get("k", k -> loads.incrementAndGet())).isEqualTo(1);
        now.set(60_000);
        assertThat(cache.get("k", k -> loads.incrementAndGet())).isEqualTo(2);
    }
}

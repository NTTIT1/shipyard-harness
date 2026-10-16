package com.shipyard.platform.common.directory;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import java.util.function.LongSupplier;
import java.util.function.Predicate;

/** Minimal time-boxed memo; stale entries are reloaded on read. */
public final class TtlCache<K, V> {
    private record Entry<V>(V value, long expiresAt) {}

    private final Map<K, Entry<V>> entries = new ConcurrentHashMap<>();
    private final long ttlMillis;
    private final LongSupplier clockMillis;

    public TtlCache(Duration ttl, LongSupplier clockMillis) {
        this.ttlMillis = ttl.toMillis();
        this.clockMillis = clockMillis;
    }

    public V get(K key, Function<K, V> loader) {
        long now = clockMillis.getAsLong();
        Entry<V> e = entries.get(key);
        if (e != null && e.expiresAt() > now) return e.value();
        V value = loader.apply(key);
        entries.put(key, new Entry<>(value, now + ttlMillis));
        return value;
    }

    public void invalidateIf(Predicate<K> keyMatches) {
        entries.keySet().removeIf(keyMatches);
    }
}

package com.shipyard.platform.context;

import com.shipyard.platform.context.embedding.EmbeddingProvider;
import com.shipyard.platform.context.embedding.EmbeddingUnavailableException;

import java.util.Locale;

/** Deterministic bag-of-words embedding: texts sharing words are similar; disjoint texts score 0. */
public class HashingEmbeddingProvider implements EmbeddingProvider {
    public volatile boolean down;
    /** Simulates a misconfigured model (e.g. 768 dims): a non-availability error. */
    public volatile boolean broken;

    @Override
    public String model() { return "test:hashing"; }

    @Override
    public float[] embed(String text) {
        if (down) throw new EmbeddingUnavailableException("test: provider down");
        if (broken) throw new IllegalStateException("Model x returns 768 dimensions; the schema expects 1024");
        float[] v = new float[DIMENSIONS];
        for (String t : text.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+")) {
            if (t.length() > 1) v[Math.floorMod(t.hashCode(), DIMENSIONS)] += 1f;
        }
        double n = 0;
        for (float x : v) n += x * x;
        if (n == 0) { v[0] = 1f; return v; }
        n = Math.sqrt(n);
        for (int i = 0; i < v.length; i++) v[i] /= (float) n;
        return v;
    }
}

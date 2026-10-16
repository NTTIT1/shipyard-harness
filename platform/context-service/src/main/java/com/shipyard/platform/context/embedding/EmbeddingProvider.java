package com.shipyard.platform.context.embedding;

/** Turns text into a fixed-size vector. Implementations must return exactly DIMENSIONS floats. */
public interface EmbeddingProvider {
    int DIMENSIONS = 1024;

    /** Identifier stored with each vector, e.g. "ollama:bge-m3". */
    String model();

    /** @throws EmbeddingUnavailableException when the backend cannot be reached (retry later) */
    float[] embed(String text);
}

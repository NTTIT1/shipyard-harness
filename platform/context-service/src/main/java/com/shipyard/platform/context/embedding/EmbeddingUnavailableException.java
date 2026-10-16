package com.shipyard.platform.context.embedding;

/** The embedding backend is down or unreachable — callers degrade or retry later. */
public class EmbeddingUnavailableException extends RuntimeException {
    public EmbeddingUnavailableException(String message) { super(message); }
}

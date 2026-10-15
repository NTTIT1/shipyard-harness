package com.shipyard.platform.common.exception;

/** A platform service this one depends on did not answer (mapped to 503). */
public class UpstreamUnavailableException extends RuntimeException {
    public UpstreamUnavailableException(String message) { super(message); }
}

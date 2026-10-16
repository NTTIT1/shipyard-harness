package com.shipyard.platform.common.exception;

public class BadRequestException extends RuntimeException {
    public BadRequestException(String message) { super(message); }
}

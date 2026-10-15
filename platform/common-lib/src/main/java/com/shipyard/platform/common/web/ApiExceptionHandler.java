package com.shipyard.platform.common.web;

import com.shipyard.platform.common.dto.ApiResponse;
import com.shipyard.platform.common.exception.*;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.stream.Collectors;

/** Shared exception → status mapping. Services opt in with @Import(ApiExceptionHandler.class). */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static ResponseEntity<ApiResponse<Void>> of(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(ApiResponse.error(message));
    }

    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<ApiResponse<Void>> badRequest(BadRequestException e) { return of(HttpStatus.BAD_REQUEST, e.getMessage()); }

    @ExceptionHandler(UnauthorizedException.class)
    public ResponseEntity<ApiResponse<Void>> unauthorized(UnauthorizedException e) { return of(HttpStatus.UNAUTHORIZED, e.getMessage()); }

    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<ApiResponse<Void>> missingHeader(MissingRequestHeaderException e) {
        return of(HttpStatus.UNAUTHORIZED, "Missing request header: " + e.getHeaderName());
    }

    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<ApiResponse<Void>> forbidden(ForbiddenException e) { return of(HttpStatus.FORBIDDEN, e.getMessage()); }

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiResponse<Void>> notFound(ResourceNotFoundException e) { return of(HttpStatus.NOT_FOUND, e.getMessage()); }

    @ExceptionHandler({BusinessException.class, ConflictException.class})
    public ResponseEntity<ApiResponse<Void>> conflict(RuntimeException e) { return of(HttpStatus.CONFLICT, e.getMessage()); }

    @ExceptionHandler(UpstreamUnavailableException.class)
    public ResponseEntity<ApiResponse<Void>> upstream(UpstreamUnavailableException e) { return of(HttpStatus.SERVICE_UNAVAILABLE, e.getMessage()); }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> invalid(MethodArgumentNotValidException e) {
        return of(HttpStatus.BAD_REQUEST, e.getBindingResult().getFieldErrors().stream()
                .map(f -> f.getField() + ": " + f.getDefaultMessage()).collect(Collectors.joining("; ")));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> unreadable(HttpMessageNotReadableException e) {
        return of(HttpStatus.BAD_REQUEST, "Malformed request body");
    }
}

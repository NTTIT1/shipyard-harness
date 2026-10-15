package com.shipyard.platform.orchestrator.api;

import com.shipyard.platform.common.dto.ApiResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Two concurrent decisions on the same gate: the loser gets 409, state advances once. */
@RestControllerAdvice
public class OrchestratorExceptionHandler {
    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<ApiResponse<Void>> concurrent(ObjectOptimisticLockingFailureException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiResponse.error("Concurrent update — reload and try again"));
    }
}

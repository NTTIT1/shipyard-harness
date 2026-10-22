package com.shipyard.platform.orchestrator.api;

import com.shipyard.platform.common.dto.ApiResponse;
import com.shipyard.platform.orchestrator.api.Dtos.*;
import com.shipyard.platform.orchestrator.domain.Step;
import com.shipyard.platform.orchestrator.service.RunCommands;
import com.shipyard.platform.orchestrator.service.RunQueries;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

/** Harness-facing API (spec §4.3); guarded by ServiceTokenFilter. */
@RestController
@RequestMapping("/internal/v1/runs")
public class InternalRunController {
    private final RunCommands commands;
    private final RunQueries queries;

    public InternalRunController(RunCommands commands, RunQueries queries) {
        this.commands = commands;
        this.queries = queries;
    }

    @PostMapping
    public ApiResponse<RunSummary> create(@Valid @RequestBody CreateRunRequest req) {
        return ApiResponse.ok(commands.createRun(req));
    }

    @GetMapping("/{runId}/next")
    public ApiResponse<NextAction> next(@PathVariable String runId) {
        return ApiResponse.ok(queries.next(runId));
    }

    @PostMapping("/{runId}/steps/{step}/submit")
    public ApiResponse<SubmitResult> submit(@PathVariable String runId, @PathVariable String step,
                                            @RequestBody SubmitRequest req) {
        return ApiResponse.ok(commands.submit(runId, Step.parse(step), req));
    }

    @PostMapping("/{runId}/reopen")
    public ApiResponse<NextAction> reopen(@PathVariable String runId, @RequestBody ReasonRequest req) {
        return ApiResponse.ok(commands.reopen(runId, req.reason()));
    }

    @PostMapping("/{runId}/fail")
    public ApiResponse<RunSummary> fail(@PathVariable String runId, @RequestBody ReasonRequest req) {
        return ApiResponse.ok(commands.fail(runId, req.reason()));
    }

    @PostMapping("/{runId}/release")
    public ApiResponse<RunSummary> release(@PathVariable String runId, @RequestBody ReleaseRequest req) {
        return ApiResponse.ok(commands.release(runId, req.summary()));
    }
}

package com.shipyard.platform.orchestrator.api;

import com.shipyard.platform.common.dto.ApiResponse;
import com.shipyard.platform.common.security.SecurityConstants;
import com.shipyard.platform.orchestrator.api.Dtos.*;
import com.shipyard.platform.orchestrator.service.HumanService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** Human API behind the gateway (spec §4.2); X-User-Id is set by the gateway from the JWT. */
@RestController
@RequestMapping("/api/v1")
public class UserRunController {
    private final HumanService human;

    public UserRunController(HumanService human) { this.human = human; }

    @GetMapping("/approvals/inbox")
    public ApiResponse<List<InboxItem>> inbox(@RequestHeader(SecurityConstants.HEADER_USER_ID) String userId) {
        return ApiResponse.ok(human.inbox(userId));
    }

    @PostMapping("/approvals/{approvalId}/decision")
    public ApiResponse<DecisionResult> decide(@RequestHeader(SecurityConstants.HEADER_USER_ID) String userId,
                                              @PathVariable String approvalId, @Valid @RequestBody DecisionRequest req) {
        return ApiResponse.ok(human.decide(userId, approvalId, req));
    }

    @GetMapping("/runs/{runId}")
    public ApiResponse<RunView> run(@RequestHeader(SecurityConstants.HEADER_USER_ID) String userId, @PathVariable String runId) {
        return ApiResponse.ok(human.runView(userId, runId));
    }

    @GetMapping("/runs/{runId}/revisions/{revisionId}")
    public ApiResponse<RevisionDetail> revision(@RequestHeader(SecurityConstants.HEADER_USER_ID) String userId,
                                                @PathVariable String runId, @PathVariable String revisionId) {
        return ApiResponse.ok(human.revision(userId, runId, revisionId));
    }

    @GetMapping("/projects/{projectId}/gate-policy")
    public ApiResponse<Map<String, String>> gatePolicy(@RequestHeader(SecurityConstants.HEADER_USER_ID) String userId,
                                                       @PathVariable String projectId) {
        return ApiResponse.ok(human.gatePolicy(userId, projectId));
    }

    @PutMapping("/projects/{projectId}/gate-policy")
    public ApiResponse<Map<String, String>> updateGatePolicy(@RequestHeader(SecurityConstants.HEADER_USER_ID) String userId,
                                                             @PathVariable String projectId,
                                                             @RequestBody Map<String, String> body) {
        return ApiResponse.ok(human.updateGatePolicy(userId, projectId, body));
    }

    @GetMapping("/projects/{projectId}/runs")
    public ApiResponse<List<RunSummary>> runs(@RequestHeader(SecurityConstants.HEADER_USER_ID) String userId,
                                              @PathVariable String projectId) {
        return ApiResponse.ok(human.projectRuns(userId, projectId));
    }
}

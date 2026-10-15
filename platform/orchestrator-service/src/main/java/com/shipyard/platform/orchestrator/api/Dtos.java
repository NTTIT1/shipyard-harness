package com.shipyard.platform.orchestrator.api;

import jakarta.validation.constraints.NotBlank;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Request/response shapes of the orchestrator APIs. */
public final class Dtos {
    private Dtos() {}

    public record CreateRunRequest(@NotBlank String projectId, @NotBlank String laneRef, @NotBlank String title,
                                   String description, @NotBlank String createdBy, Map<String, String> gateOverrides) {}

    public record RunSummary(String id, String projectId, String laneRef, String title, String status,
                             String currentStep, Boolean hasUi, String createdBy, Map<String, String> gateOverrides,
                             Instant createdAt, Instant updatedAt) {}

    public record ImageRef(String path, String caption) {}

    public record SubmitRequest(String summary, Map<String, String> documents, List<ImageRef> images,
                                Map<String, Object> meta, List<Map<String, Object>> contextUsed, Boolean hasUi) {}

    public record SubmitResult(String revisionId, int revisionNo, String approvalId, boolean autoApproved) {}

    public record NextAction(String mode, String step, int revision, String feedback,
                             Map<String, String> editedDocuments, Map<String, Map<String, String>> priorApproved) {}

    public record ReasonRequest(String reason) {}

    public record ReleaseRequest(String summary) {}

    public record DecisionRequest(@NotBlank String action, String feedback, Map<String, String> editedDocuments,
                                  String sendBackTo, Boolean hasUi) {}

    public record DecisionResult(String runId, String laneRef, String mode, String step) {}

    public record StepView(String step, String status, int currentRevision, String skipReason) {}

    public record RevisionSummary(String id, String step, int revisionNo, String summary, Instant submittedAt,
                                  String approvalId, String approvalStatus, String decidedBy, String decidedAsRole,
                                  String feedback, Instant decidedAt) {}

    public record RunView(RunSummary run, List<StepView> steps, List<RevisionSummary> revisions) {}

    public record RevisionDetail(RevisionSummary revision, Map<String, String> documents,
                                 Map<String, String> approvedDocuments, Map<String, String> editedDocuments,
                                 List<Map<String, String>> images, Map<String, Object> meta,
                                 List<Map<String, Object>> contextUsed, String requiredRole) {}

    public record InboxItem(String approvalId, String runId, String projectId, String runTitle, String step,
                            int revisionNo, String requiredRole, String decideAs, Instant waitingSince) {}
}

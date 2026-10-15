package com.shipyard.platform.orchestrator.service;

import com.shipyard.platform.common.exception.BadRequestException;
import com.shipyard.platform.common.exception.ForbiddenException;
import com.shipyard.platform.common.exception.ResourceNotFoundException;
import com.shipyard.platform.orchestrator.api.Dtos.*;
import com.shipyard.platform.orchestrator.directory.ProjectDirectory;
import com.shipyard.platform.orchestrator.domain.*;
import com.shipyard.platform.orchestrator.entity.*;
import com.shipyard.platform.orchestrator.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Human-facing reads and decisions; every entry point checks project membership (404) and role (403). */
@Service
@Transactional
public class HumanService {
    private final ProjectDirectory directory;
    private final RunRepository runs;
    private final StepRevisionRepository revisions;
    private final ApprovalRequestRepository approvals;
    private final GatePolicyRepository policies;
    private final RunCommands commands;
    private final RunQueries queries;

    public HumanService(ProjectDirectory directory, RunRepository runs, StepRevisionRepository revisions,
                        ApprovalRequestRepository approvals, GatePolicyRepository policies,
                        RunCommands commands, RunQueries queries) {
        this.directory = directory;
        this.runs = runs;
        this.revisions = revisions;
        this.approvals = approvals;
        this.policies = policies;
        this.commands = commands;
        this.queries = queries;
    }

    @Transactional(readOnly = true)
    public List<InboxItem> inbox(String userId) {
        Map<String, List<String>> rolesByProject = directory.membershipsOf(userId).stream()
                .collect(Collectors.toMap(ProjectDirectory.Membership::projectId, ProjectDirectory.Membership::roles));
        if (rolesByProject.isEmpty()) return List.of();
        List<ApprovalRequest> pending = approvals.findByStatusAndProjectIdInOrderByCreatedAtAsc(
                ApprovalStatus.PENDING, rolesByProject.keySet());
        Map<String, Run> runById = runs.findAllById(pending.stream().map(a -> a.runId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(r -> r.id, Function.identity()));
        Map<String, Map<String, Long>> holders = new HashMap<>();
        List<InboxItem> out = new ArrayList<>();
        for (ApprovalRequest a : pending) {
            Map<String, Long> h = holders.computeIfAbsent(a.projectId, directory::roleHolders);
            Optional<String> as = GatePermission.decideAs(rolesByProject.get(a.projectId), h, a.requiredRole);
            if (as.isEmpty()) continue;
            Run run = runById.get(a.runId);
            int revNo = revisions.findById(a.revisionId).map(r -> r.revisionNo).orElse(0);
            out.add(new InboxItem(a.id, a.runId, a.projectId, run == null ? "" : run.title, a.step.name(),
                    revNo, a.requiredRole, as.get(), a.createdAt));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public RunView runView(String userId, String runId) {
        Run run = memberRun(userId, runId);
        List<StepView> steps = queries.loadSteps(runId).values().stream()
                .map(s -> new StepView(s.step.name(), s.status.name(), s.currentRevision, s.skipReason)).toList();
        Map<String, ApprovalRequest> byRevision = approvals.findByRunIdOrderByCreatedAtAsc(runId).stream()
                .collect(Collectors.toMap(a -> a.revisionId, Function.identity()));
        List<RevisionSummary> revs = revisions.findByRunIdOrderBySubmittedAtAsc(runId).stream()
                .map(r -> summary(r, byRevision.get(r.id))).toList();
        return new RunView(RunQueries.summary(run), steps, revs);
    }

    @Transactional(readOnly = true)
    public RevisionDetail revision(String userId, String runId, String revisionId) {
        memberRun(userId, runId);
        StepRevision r = revisions.findById(revisionId).filter(x -> x.runId.equals(runId))
                .orElseThrow(() -> new ResourceNotFoundException("Revision not found"));
        ApprovalRequest a = approvals.findByRevisionId(r.id).orElse(null);
        return new RevisionDetail(summary(r, a), r.documents, r.approvedDocuments,
                a == null ? null : a.editedDocuments, r.images, r.meta, r.contextUsed, r.step.requiredRole());
    }

    public DecisionResult decide(String userId, String approvalId, DecisionRequest req) {
        ApprovalRequest a = approvals.findById(approvalId).orElseThrow(() -> new ResourceNotFoundException("Approval not found"));
        List<String> roles = directory.rolesOf(a.projectId, userId);
        if (roles.isEmpty()) throw new ResourceNotFoundException("Approval not found");
        String as = GatePermission.decideAs(roles, directory.roleHolders(a.projectId), a.requiredRole)
                .orElseThrow(() -> new ForbiddenException("Gate " + a.step + " needs role " + a.requiredRole));
        DecisionAction action;
        try {
            action = DecisionAction.valueOf(req.action().trim().toUpperCase(Locale.ROOT));
        } catch (RuntimeException e) {
            throw new BadRequestException("Unknown action: " + req.action());
        }
        Step sendBackTo = req.sendBackTo() == null || req.sendBackTo().isBlank() ? null : Step.parse(req.sendBackTo());
        Run run = queries.loadRun(a.runId);
        Map<Step, RunStep> steps = queries.loadSteps(a.runId);
        StepRevision rev = revisions.findById(a.revisionId).orElseThrow();
        commands.applyDecision(run, steps, a, rev,
                new Decision(action, req.feedback(), req.editedDocuments(), sendBackTo, req.hasUi()), userId, as);
        NextMode mode = Workflow.mode(run, steps);
        return new DecisionResult(run.id, run.laneRef, mode.name(), run.currentStep == null ? null : run.currentStep.name());
    }

    @Transactional(readOnly = true)
    public Map<String, String> gatePolicy(String userId, String projectId) {
        requireMember(projectId, userId);
        Map<String, String> out = new LinkedHashMap<>();
        for (Step s : Step.values()) out.put(s.name(), GateMode.REQUIRED.name());
        policies.findByProjectId(projectId).forEach(p -> out.put(p.step.name(), p.mode.name()));
        return out;
    }

    public Map<String, String> updateGatePolicy(String userId, String projectId, Map<String, String> body) {
        List<String> roles = requireMember(projectId, userId);
        if (!roles.contains("OWNER") && !roles.contains("MAINTAINER")) {
            throw new ForbiddenException("Only OWNER or MAINTAINER can change gate policy");
        }
        List<GatePolicy> parsed = new ArrayList<>();
        for (Map.Entry<String, String> e : body.entrySet()) {
            GateMode mode;
            try {
                mode = GateMode.valueOf(e.getValue().trim().toUpperCase(Locale.ROOT));
            } catch (RuntimeException ex) {
                throw new BadRequestException("Unknown gate mode: " + e.getValue());
            }
            parsed.add(new GatePolicy(projectId, Step.parse(e.getKey()), mode));
        }
        policies.saveAll(parsed);
        policies.flush();
        return gatePolicy(userId, projectId);
    }

    @Transactional(readOnly = true)
    public List<RunSummary> projectRuns(String userId, String projectId) {
        requireMember(projectId, userId);
        return runs.findByProjectIdOrderByCreatedAtDesc(projectId).stream().map(RunQueries::summary).toList();
    }

    private Run memberRun(String userId, String runId) {
        Run run = runs.findById(runId).orElseThrow(() -> new ResourceNotFoundException("Run not found"));
        if (directory.rolesOf(run.projectId, userId).isEmpty()) throw new ResourceNotFoundException("Run not found");
        return run;
    }

    private List<String> requireMember(String projectId, String userId) {
        List<String> roles = directory.rolesOf(projectId, userId);
        if (roles.isEmpty()) throw new ResourceNotFoundException("Project not found");
        return roles;
    }

    private static RevisionSummary summary(StepRevision r, ApprovalRequest a) {
        return new RevisionSummary(r.id, r.step.name(), r.revisionNo, r.summary, r.submittedAt,
                a == null ? null : a.id, a == null ? null : a.status.name(), a == null ? null : a.decidedBy,
                a == null ? null : a.decidedAsRole, a == null ? null : a.feedbackText, a == null ? null : a.decidedAt);
    }
}

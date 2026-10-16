package com.shipyard.platform.orchestrator.service;

import com.shipyard.platform.common.exception.BadRequestException;
import com.shipyard.platform.common.exception.ConflictException;
import com.shipyard.platform.orchestrator.api.Dtos.*;
import com.shipyard.platform.orchestrator.domain.*;
import com.shipyard.platform.orchestrator.entity.*;
import com.shipyard.platform.orchestrator.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

@Service
@Transactional
public class RunCommands {
    public static final String AUTO = "AUTO";

    private final RunRepository runs;
    private final RunStepRepository steps;
    private final StepRevisionRepository revisions;
    private final ApprovalRequestRepository approvals;
    private final GatePolicyRepository policies;
    private final OutboxWriter outbox;
    private final RunQueries queries;

    public RunCommands(RunRepository runs, RunStepRepository steps, StepRevisionRepository revisions,
                       ApprovalRequestRepository approvals, GatePolicyRepository policies,
                       OutboxWriter outbox, RunQueries queries) {
        this.runs = runs;
        this.steps = steps;
        this.revisions = revisions;
        this.approvals = approvals;
        this.policies = policies;
        this.outbox = outbox;
        this.queries = queries;
    }

    public RunSummary createRun(CreateRunRequest req) {
        Run run = new Run();
        run.id = Ids.newId("run");
        run.projectId = req.projectId();
        run.laneRef = req.laneRef();
        run.title = req.title();
        run.description = req.description() == null ? "" : req.description();
        run.createdBy = req.createdBy();
        EnumMap<Step, RunStep> st = Workflow.newSteps(run.id);
        Workflow.start(run, st);
        runs.save(run);
        steps.saveAll(st.values());
        return RunQueries.summary(run);
    }

    public SubmitResult submit(String runId, Step step, SubmitRequest req) {
        Run run = queries.lockRun(runId);
        EnumMap<Step, RunStep> st = queries.loadSteps(runId);
        List<ImageRef> images = req.images() == null ? List.of() : req.images();
        StepRequirements.validateSubmission(step, req.summary(), req.documents(), images.size(), req.meta(), req.hasUi());
        if (step == Step.ARCH) run.hasUi = req.hasUi();
        int revisionNo = Workflow.submit(run, st, step);

        StepRevision rev = new StepRevision();
        rev.id = Ids.newId("rev");
        rev.runId = runId;
        rev.step = step;
        rev.revisionNo = revisionNo;
        rev.summary = req.summary().trim();
        rev.documents = req.documents() == null ? Map.of() : req.documents();
        rev.images = images.stream().map(i -> Map.of("path", i.path(), "caption", i.caption() == null ? "" : i.caption())).toList();
        rev.meta = req.meta() == null ? Map.of() : req.meta();
        rev.contextUsed = req.contextUsed() == null ? List.of() : req.contextUsed();
        // Assigned ids make save() a merge: keep the managed copy so later changes persist.
        rev = revisions.save(rev);

        ApprovalRequest a = new ApprovalRequest();
        a.id = Ids.newId("apr");
        a.runId = runId;
        a.step = step;
        a.revisionId = rev.id;
        a.projectId = run.projectId;
        a.requiredRole = step.requiredRole();
        a = approvals.save(a);

        boolean auto = policies.findById(new GatePolicy.Key(run.projectId, step))
                .map(p -> p.mode == GateMode.AUTO).orElse(false);
        if (auto) {
            applyDecision(run, st, a, rev, new Decision(DecisionAction.APPROVE, null, null, null, null), AUTO, AUTO);
        }
        return new SubmitResult(rev.id, revisionNo, a.id, auto);
    }

    /**
     * Applies a verdict to a PENDING approval: validates edits against the revision, moves the
     * workflow, records the verdict, and enqueues memory events (spec §4.4).
     */
    public void applyDecision(Run run, Map<Step, RunStep> st, ApprovalRequest a, StepRevision rev,
                              Decision d, String decidedBy, String decidedAsRole) {
        if (a.status != ApprovalStatus.PENDING) throw new ConflictException("Approval already decided");
        Map<String, String> edits = d.edits() == null ? Map.of() : d.edits();
        if (!edits.isEmpty()) {
            if (d.action() != DecisionAction.APPROVE && d.action() != DecisionAction.REQUEST_CHANGES) {
                throw new BadRequestException("editedDocuments are only allowed with APPROVE or REQUEST_CHANGES");
            }
            for (String f : edits.keySet()) {
                if (!rev.documents.containsKey(f)) throw new BadRequestException("Unknown document: " + f);
            }
            StepRequirements.checkSize(edits);
        }

        Workflow.decide(run, st, a.step, d);

        a.status = switch (d.action()) {
            case APPROVE -> ApprovalStatus.APPROVED;
            case REQUEST_CHANGES -> ApprovalStatus.CHANGES_REQUESTED;
            case SEND_BACK -> ApprovalStatus.SENT_BACK;
            case CANCEL -> ApprovalStatus.CANCELLED;
        };
        a.decidedBy = decidedBy;
        a.decidedAsRole = decidedAsRole;
        a.feedbackText = d.feedback();
        a.editedDocuments = edits.isEmpty() ? null : edits;
        a.sendBackTo = d.sendBackTo();
        a.hasUiOverride = d.hasUi();
        a.decidedAt = Instant.now();

        if (d.action() == DecisionAction.APPROVE) {
            Map<String, String> approved = new LinkedHashMap<>(rev.documents);
            approved.putAll(edits);
            rev.approvedDocuments = approved;
            Map<String, Object> p = base(run, a.step);
            p.put("revisionId", rev.id);
            p.put("revisionNo", rev.revisionNo);
            p.put("documents", approved);
            outbox.enqueue("STEP_APPROVED", p);
        }
        boolean human = !AUTO.equals(decidedBy);
        boolean feedbackWorthy = d.action() == DecisionAction.REQUEST_CHANGES || d.action() == DecisionAction.SEND_BACK
                || (d.action() == DecisionAction.APPROVE && !edits.isEmpty());
        if (human && feedbackWorthy) {
            Map<String, Object> p = base(run, a.step);
            p.put("revisionNo", rev.revisionNo);
            p.put("action", d.action().name());
            p.put("feedback", d.feedback() == null ? "" : d.feedback());
            p.put("decidedAsRole", decidedAsRole);
            List<Map<String, String>> diffs = new ArrayList<>();
            edits.forEach((f, human2) -> diffs.add(Map.of("file", f, "aiText", rev.documents.get(f), "humanText", human2)));
            p.put("edits", diffs);
            outbox.enqueue("HUMAN_FEEDBACK", p);
        }
    }

    public NextAction reopen(String runId, String reason) {
        Run run = queries.lockRun(runId);
        Workflow.reopenDev(run, queries.loadSteps(runId), reason);
        runs.flush();
        steps.flush();
        return queries.next(runId);
    }

    public RunSummary release(String runId, String summary) {
        Run run = queries.lockRun(runId);
        Workflow.release(run);
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("projectId", run.projectId);
        p.put("runId", run.id);
        p.put("title", run.title);
        p.put("summary", summary == null ? "" : summary);
        outbox.enqueue("FEATURE_DONE", p);
        return RunQueries.summary(run);
    }

    private static Map<String, Object> base(Run run, Step step) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("projectId", run.projectId);
        p.put("runId", run.id);
        p.put("runTitle", run.title);
        p.put("step", step.name());
        return p;
    }
}

package com.shipyard.platform.orchestrator.domain;

import com.shipyard.platform.common.exception.BadRequestException;
import com.shipyard.platform.common.exception.ConflictException;
import com.shipyard.platform.orchestrator.entity.Run;
import com.shipyard.platform.orchestrator.entity.RunStep;

import java.util.EnumMap;
import java.util.Map;

/**
 * The role pipeline's state machine. Pure: mutates the given entities only, no I/O,
 * so every transition is unit-tested without a database (spec §3).
 */
public final class Workflow {
    private Workflow() {}

    public static EnumMap<Step, RunStep> newSteps(String runId) {
        return newSteps(runId, RunKind.FEATURE);
    }

    public static EnumMap<Step, RunStep> newSteps(String runId, RunKind kind) {
        EnumMap<Step, RunStep> steps = new EnumMap<>(Step.class);
        for (Step s : kind.steps()) steps.put(s, new RunStep(runId, s));
        return steps;
    }

    /** Activates the run's first step (PM for a feature, MANAGER for a setup run). */
    public static void start(Run run, Map<Step, RunStep> steps) {
        run.status = RunStatus.RUNNING;
        activate(run, steps, steps.keySet().iterator().next());
    }

    /** Marks the active step as submitted; returns the new revision number. */
    public static int submit(Run run, Map<Step, RunStep> steps, Step step) {
        requireOpen(run);
        RunStep s = steps.get(step);
        if (s.status != StepStatus.AI_WORKING) {
            throw new ConflictException("Step " + step + " is " + s.status + ", not AI_WORKING");
        }
        s.status = StepStatus.AWAITING_REVIEW;
        s.currentRevision++;
        s.pendingFeedback = null;
        s.pendingEdits = null;
        run.status = RunStatus.WAITING_REVIEW;
        return s.currentRevision;
    }

    public static void decide(Run run, Map<Step, RunStep> steps, Step step, Decision d) {
        requireOpen(run);
        RunStep s = steps.get(step);
        if (s.status != StepStatus.AWAITING_REVIEW) {
            throw new ConflictException("Step " + step + " is not awaiting review");
        }
        switch (d.action()) {
            case APPROVE -> {
                s.status = StepStatus.APPROVED;
                if (step == Step.ARCH && d.hasUi() != null) run.hasUi = d.hasUi();
                activateNext(run, steps, step);
            }
            case REQUEST_CHANGES -> {
                requireFeedback(d);
                s.status = StepStatus.AI_WORKING;
                s.pendingFeedback = d.feedback().trim();
                s.pendingEdits = d.edits() == null || d.edits().isEmpty() ? null : d.edits();
                run.status = RunStatus.RUNNING;
            }
            case SEND_BACK -> sendBack(run, steps, step, d);
            case CANCEL -> {
                run.status = RunStatus.CANCELLED;
                run.currentStep = null;
            }
        }
    }

    /** Moves {@code step} to AI_WORKING; DEV is refused until every gate before it is satisfied. */
    public static void activate(Run run, Map<Step, RunStep> steps, Step step) {
        if (step == Step.DEV) {
            for (Step before : new Step[]{Step.PM, Step.BA, Step.ARCH}) {
                if (steps.get(before).status != StepStatus.APPROVED) {
                    throw new ConflictException("DEV cannot start: " + before + " is not approved");
                }
            }
            RunStep design = steps.get(Step.DESIGN);
            boolean designOk = design.status == StepStatus.APPROVED
                    || (design.status == StepStatus.SKIPPED && Boolean.FALSE.equals(run.hasUi));
            if (!designOk) throw new ConflictException("DEV cannot start: DESIGN is not approved");
        }
        steps.get(step).status = StepStatus.AI_WORKING;
        run.currentStep = step;
        run.status = RunStatus.RUNNING;
    }

    /** Post-merge QC failed: reopen DEV (then TEST again) with the failure as feedback. */
    public static void reopenDev(Run run, Map<Step, RunStep> steps, String reason) {
        if (run.status != RunStatus.RELEASING && run.status != RunStatus.DONE) {
            throw new ConflictException("Only a released run can be reopened (status " + run.status + ")");
        }
        RunStep dev = steps.get(Step.DEV);
        dev.status = StepStatus.AI_WORKING;
        dev.pendingFeedback = "Post-merge QC failed: " + (reason == null ? "" : reason.trim());
        steps.get(Step.TEST).status = StepStatus.PENDING;
        run.currentStep = Step.DEV;
        run.status = RunStatus.RUNNING;
    }

    public static void release(Run run) {
        if (run.status != RunStatus.RELEASING) {
            throw new ConflictException("Run is " + run.status + ", not RELEASING");
        }
        run.status = RunStatus.DONE;
    }

    public static NextMode mode(Run run, Map<Step, RunStep> steps) {
        switch (run.status) {
            case CANCELLED: return NextMode.CANCELLED;
            case DONE: return NextMode.DONE;
            case RELEASING: return NextMode.RELEASE;
            default: break;
        }
        RunStep active = steps.get(run.currentStep);
        if (active.status == StepStatus.AWAITING_REVIEW) return NextMode.WAIT;
        boolean revise = active.pendingFeedback != null || (active.pendingEdits != null && !active.pendingEdits.isEmpty());
        return revise ? NextMode.REVISE : NextMode.WORK;
    }

    private static void activateNext(Run run, Map<Step, RunStep> steps, Step after) {
        for (Step s : steps.keySet()) {
            if (s.ordinal() <= after.ordinal()) continue;
            if (s == Step.DESIGN && Boolean.FALSE.equals(run.hasUi)) {
                steps.get(s).status = StepStatus.SKIPPED;
                steps.get(s).skipReason = "has_ui=false";
                continue;
            }
            activate(run, steps, s);
            return;
        }
        run.currentStep = null;
        run.status = RunStatus.RELEASING;
    }

    private static void sendBack(Run run, Map<Step, RunStep> steps, Step from, Decision d) {
        Step target = d.sendBackTo();
        if (target != null && !steps.containsKey(target)) throw new BadRequestException("Step " + target + " is not part of this run");
        if (target == null || target.ordinal() >= from.ordinal()) {
            throw new BadRequestException("sendBackTo must be a step before " + from);
        }
        if (steps.get(target).status == StepStatus.SKIPPED) {
            throw new BadRequestException("Cannot send back to skipped step " + target);
        }
        if (d.edits() != null && !d.edits().isEmpty()) {
            throw new BadRequestException("Edits cannot accompany SEND_BACK");
        }
        requireFeedback(d);
        for (Step s : steps.keySet()) {
            if (s.ordinal() > target.ordinal() && s.ordinal() <= from.ordinal()) {
                RunStep rs = steps.get(s);
                rs.status = StepStatus.PENDING;
                rs.skipReason = null;
                rs.pendingFeedback = null;
                rs.pendingEdits = null;
            }
        }
        RunStep t = steps.get(target);
        t.status = StepStatus.AI_WORKING;
        t.pendingFeedback = "Returned from " + from + ": " + d.feedback().trim();
        t.pendingEdits = null;
        run.currentStep = target;
        run.status = RunStatus.RUNNING;
    }

    private static void requireFeedback(Decision d) {
        if (d.feedback() == null || d.feedback().isBlank()) {
            throw new BadRequestException("feedback is required for " + d.action());
        }
    }

    private static void requireOpen(Run run) {
        if (run.status == RunStatus.CANCELLED || run.status == RunStatus.DONE || run.status == RunStatus.RELEASING) {
            throw new ConflictException("Run is " + run.status);
        }
    }
}

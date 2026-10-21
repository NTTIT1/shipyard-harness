package com.shipyard.platform.orchestrator.domain;

import com.shipyard.platform.common.exception.BadRequestException;
import com.shipyard.platform.common.exception.ConflictException;
import com.shipyard.platform.orchestrator.entity.Run;
import com.shipyard.platform.orchestrator.entity.RunStep;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

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

    /** skipReason of a step the project's (or this feature's) workflow left out; it stays skipped for the whole run. */
    public static final String SKIP_WORKFLOW = "workflow";

    /** Steps that hand documents to DEV; they may be reordered among themselves but always come before DEV. */
    private static final Set<Step> BEFORE_DEV = EnumSet.of(Step.PM, Step.BA, Step.ARCH, Step.DESIGN);

    /**
     * Freezes a feature run's workflow: the step order and the steps left out. DEV is the one step that
     * can never be left out (a run without code has nothing to release).
     */
    public static void plan(Run run, Map<Step, RunStep> steps, List<Step> order, Set<Step> skipped) {
        validateOrder(order);
        if (skipped.contains(Step.DEV)) throw new BadRequestException("DEV cannot be skipped");
        run.workflow = order.stream().map(Step::name).toList();
        for (Step s : skipped) {
            RunStep rs = steps.get(s);
            if (rs == null) continue;
            rs.status = StepStatus.SKIPPED;
            rs.skipReason = SKIP_WORKFLOW;
        }
    }

    /**
     * A feature workflow lists every feature step once; PM/BA/ARCH/DESIGN in any order, then DEV, then TEST.
     */
    public static void validateOrder(List<Step> order) {
        Set<Step> all = RunKind.FEATURE.steps();
        if (order == null || order.size() != all.size() || !EnumSet.copyOf(order).equals(all)) {
            throw new BadRequestException("Workflow must list each of " + all + " exactly once");
        }
        int dev = order.indexOf(Step.DEV);
        for (Step s : BEFORE_DEV) {
            if (order.indexOf(s) > dev) throw new BadRequestException(s + " must come before DEV");
        }
        if (order.indexOf(Step.TEST) < dev) throw new BadRequestException("TEST must come after DEV");
    }

    /** The run's step order: the frozen workflow, else (old runs, SETUP) the natural step order. */
    public static List<Step> order(Run run, Map<Step, RunStep> steps) {
        if (run.workflow == null || run.workflow.isEmpty()) return new ArrayList<>(new EnumMap<>(steps).keySet());
        List<Step> out = new ArrayList<>();
        for (String name : run.workflow) {
            Step s = Step.parse(name);
            if (steps.containsKey(s)) out.add(s);
        }
        for (Step s : steps.keySet()) if (!out.contains(s)) out.add(s);
        return out;
    }

    /** Activates the run's first step that is not left out (PM by default, MANAGER for a setup run). */
    public static void start(Run run, Map<Step, RunStep> steps) {
        run.status = RunStatus.RUNNING;
        for (Step s : order(run, steps)) {
            if (steps.get(s).status == StepStatus.SKIPPED) continue;
            activate(run, steps, s);
            return;
        }
        throw new BadRequestException("Workflow has no step to run");
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

    /**
     * Moves {@code step} to AI_WORKING; DEV is refused until every step before it in the workflow is
     * approved (or left out by the workflow / skipped for has_ui=false).
     */
    public static void activate(Run run, Map<Step, RunStep> steps, Step step) {
        if (step == Step.DEV) {
            for (Step before : order(run, steps)) {
                if (before == Step.DEV) break;
                RunStep b = steps.get(before);
                boolean ok = b.status == StepStatus.APPROVED
                        || (b.status == StepStatus.SKIPPED && (SKIP_WORKFLOW.equals(b.skipReason)
                            || (before == Step.DESIGN && Boolean.FALSE.equals(run.hasUi))));
                if (!ok) throw new ConflictException("DEV cannot start: " + before + " is not approved");
            }
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
        if (!leftOut(steps.get(Step.TEST))) steps.get(Step.TEST).status = StepStatus.PENDING;
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

    private static boolean leftOut(RunStep s) {
        return s.status == StepStatus.SKIPPED && SKIP_WORKFLOW.equals(s.skipReason);
    }

    private static void activateNext(Run run, Map<Step, RunStep> steps, Step after) {
        List<Step> order = order(run, steps);
        for (Step s : order.subList(order.indexOf(after) + 1, order.size())) {
            if (leftOut(steps.get(s))) continue;
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
        List<Step> order = order(run, steps);
        if (target == null || order.indexOf(target) >= order.indexOf(from)) {
            throw new BadRequestException("sendBackTo must be a step before " + from);
        }
        if (steps.get(target).status == StepStatus.SKIPPED) {
            throw new BadRequestException("Cannot send back to skipped step " + target);
        }
        if (d.edits() != null && !d.edits().isEmpty()) {
            throw new BadRequestException("Edits cannot accompany SEND_BACK");
        }
        requireFeedback(d);
        for (Step s : order.subList(order.indexOf(target) + 1, order.indexOf(from) + 1)) {
            RunStep rs = steps.get(s);
            if (leftOut(rs)) continue;
            rs.status = StepStatus.PENDING;
            rs.skipReason = null;
            rs.pendingFeedback = null;
            rs.pendingEdits = null;
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

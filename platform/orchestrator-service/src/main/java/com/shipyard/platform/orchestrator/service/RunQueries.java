package com.shipyard.platform.orchestrator.service;

import com.shipyard.platform.common.exception.ResourceNotFoundException;
import com.shipyard.platform.orchestrator.api.Dtos.NextAction;
import com.shipyard.platform.orchestrator.api.Dtos.RunSummary;
import com.shipyard.platform.orchestrator.domain.*;
import com.shipyard.platform.orchestrator.entity.Run;
import com.shipyard.platform.orchestrator.entity.RunStep;
import com.shipyard.platform.orchestrator.repository.RunRepository;
import com.shipyard.platform.orchestrator.repository.RunStepRepository;
import com.shipyard.platform.orchestrator.repository.StepRevisionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@Transactional(readOnly = true)
public class RunQueries {
    private final RunRepository runs;
    private final RunStepRepository steps;
    private final StepRevisionRepository revisions;

    public RunQueries(RunRepository runs, RunStepRepository steps, StepRevisionRepository revisions) {
        this.runs = runs;
        this.steps = steps;
        this.revisions = revisions;
    }

    public Run loadRun(String runId) {
        return runs.findById(runId).orElseThrow(() -> new ResourceNotFoundException("Run not found"));
    }

    /** Loads the run with a row lock; call inside the transaction that changes it. */
    public Run lockRun(String runId) {
        return runs.lockById(runId).orElseThrow(() -> new ResourceNotFoundException("Run not found"));
    }

    public EnumMap<Step, RunStep> loadSteps(String runId) {
        EnumMap<Step, RunStep> map = new EnumMap<>(Step.class);
        for (RunStep s : steps.findByRunId(runId)) map.put(s.step, s);
        return map;
    }

    public NextAction next(String runId) {
        Run run = loadRun(runId);
        EnumMap<Step, RunStep> st = loadSteps(runId);
        NextMode mode = Workflow.mode(run, st);
        Map<String, Map<String, String>> prior = new LinkedHashMap<>();
        for (RunStep s : st.values()) {
            if (s.status != StepStatus.APPROVED) continue;
            revisions.findFirstByRunIdAndStepAndApprovedDocumentsIsNotNullOrderByRevisionNoDesc(runId, s.step)
                    .ifPresent(r -> prior.put(s.step.name(), r.approvedDocuments));
        }
        if (run.currentStep == null) {
            return new NextAction(mode.name(), null, 0, null, null, prior, run.stepConfig == null ? Map.of() : run.stepConfig);
        }
        RunStep active = st.get(run.currentStep);
        int revision = mode == NextMode.WAIT ? active.currentRevision : active.currentRevision + 1;
        return new NextAction(mode.name(), run.currentStep.name(), revision,
                active.pendingFeedback, active.pendingEdits, prior, run.stepConfig == null ? Map.of() : run.stepConfig);
    }

    public static RunSummary summary(Run r) {
        return new RunSummary(r.id, r.projectId, r.laneRef, r.title, r.status.name(),
                r.currentStep == null ? null : r.currentStep.name(), r.hasUi, r.createdBy,
                r.gateOverrides == null ? Map.of() : r.gateOverrides, r.createdAt, r.updatedAt,
                (r.kind == null ? com.shipyard.platform.orchestrator.domain.RunKind.FEATURE : r.kind).name(),
                r.workflow == null ? List.of() : r.workflow);
    }
}

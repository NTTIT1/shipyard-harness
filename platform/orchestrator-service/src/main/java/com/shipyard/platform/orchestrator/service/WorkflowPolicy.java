package com.shipyard.platform.orchestrator.service;

import com.shipyard.platform.common.exception.BadRequestException;
import com.shipyard.platform.orchestrator.api.Dtos.WorkflowStep;
import com.shipyard.platform.orchestrator.domain.GateMode;
import com.shipyard.platform.orchestrator.domain.RunKind;
import com.shipyard.platform.orchestrator.domain.Step;
import com.shipyard.platform.orchestrator.domain.Workflow;
import com.shipyard.platform.orchestrator.entity.GatePolicy;
import com.shipyard.platform.orchestrator.repository.GatePolicyRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * A project's feature workflow: the order of the steps and, per step, REQUIRED / AUTO / SKIP.
 * Stored in gate_policies (mode + position); a project with no rows runs every step in the natural
 * order with a human approval each time.
 */
@Service
@Transactional
public class WorkflowPolicy {
    private final GatePolicyRepository policies;

    public WorkflowPolicy(GatePolicyRepository policies) { this.policies = policies; }

    @Transactional(readOnly = true)
    public List<WorkflowStep> of(String projectId) {
        Map<Step, GatePolicy> rows = new EnumMap<>(Step.class);
        policies.findByProjectId(projectId).forEach(p -> rows.put(p.step, p));
        List<Step> order = new ArrayList<>(RunKind.FEATURE.steps());
        order.sort(Comparator.comparingInt(s -> rows.containsKey(s) && rows.get(s).position != null
                ? rows.get(s).position : s.ordinal()));
        List<WorkflowStep> out = new ArrayList<>();
        for (Step s : order) {
            GatePolicy p = rows.get(s);
            out.add(new WorkflowStep(s.name(), (p == null || p.mode == null ? GateMode.REQUIRED : p.mode).name()));
        }
        return out;
    }

    /** Replaces the whole workflow (every feature step, in order). */
    public List<WorkflowStep> save(String projectId, List<WorkflowStep> body) {
        if (body == null) throw new BadRequestException("workflow is required");
        List<Step> order = new ArrayList<>();
        Map<Step, GateMode> modes = new EnumMap<>(Step.class);
        for (WorkflowStep w : body) {
            Step s = Step.parse(w.step() == null ? "" : w.step());
            order.add(s);
            modes.put(s, parseMode(s, w.mode()));
        }
        Workflow.validateOrder(order);
        Map<Step, GatePolicy> rows = new EnumMap<>(Step.class);
        policies.findByProjectId(projectId).forEach(p -> rows.put(p.step, p));
        List<GatePolicy> out = new ArrayList<>();
        for (int i = 0; i < order.size(); i++) {
            Step s = order.get(i);
            GatePolicy p = rows.getOrDefault(s, new GatePolicy(projectId, s, GateMode.REQUIRED));
            p.mode = modes.get(s);
            p.position = i;
            out.add(p);
        }
        policies.saveAll(out);
        policies.flush();
        return of(projectId);
    }

    /** Sets only the modes of the given steps (legacy gate-policy API); order is kept. */
    public void setModes(String projectId, Map<String, String> body) {
        Map<Step, GatePolicy> rows = new EnumMap<>(Step.class);
        policies.findByProjectId(projectId).forEach(p -> rows.put(p.step, p));
        List<GatePolicy> out = new ArrayList<>();
        for (Map.Entry<String, String> e : body.entrySet()) {
            Step s = Step.parse(e.getKey());
            GatePolicy p = rows.getOrDefault(s, new GatePolicy(projectId, s, GateMode.REQUIRED));
            p.mode = parseMode(s, e.getValue());
            out.add(p);
        }
        policies.saveAll(out);
        policies.flush();
    }

    static GateMode parseMode(Step step, String raw) {
        if (RunKind.alwaysHuman(step)) throw new BadRequestException("Project rules (MANAGER) and architecture (BLUEPRINT) always need a human approval");
        GateMode mode;
        try {
            mode = GateMode.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (RuntimeException ex) {
            throw new BadRequestException("Unknown gate mode: " + raw);
        }
        if (mode == GateMode.SKIP && step == Step.DEV) throw new BadRequestException("DEV cannot be skipped");
        return mode;
    }
}

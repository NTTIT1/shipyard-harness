package com.shipyard.platform.orchestrator.service;

import com.shipyard.platform.common.exception.BadRequestException;
import com.shipyard.platform.orchestrator.api.Dtos.WorkflowStep;
import com.shipyard.platform.orchestrator.domain.GateMode;
import com.shipyard.platform.orchestrator.domain.RunKind;
import com.shipyard.platform.orchestrator.domain.Step;
import com.shipyard.platform.orchestrator.domain.Workflow;
import com.shipyard.platform.orchestrator.domain.StepConfig;
import com.shipyard.platform.orchestrator.entity.GatePolicy;
import com.shipyard.platform.orchestrator.repository.GatePolicyRepository;
import com.shipyard.platform.orchestrator.repository.DeliveryPolicyRepository;
import com.shipyard.platform.orchestrator.domain.DeliveryConfig;
import com.shipyard.platform.orchestrator.entity.DeliveryPolicy;
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
    private final DeliveryPolicyRepository deliveries;

    public WorkflowPolicy(GatePolicyRepository policies, DeliveryPolicyRepository deliveries) {
        this.policies = policies;
        this.deliveries = deliveries;
    }

    /** What happens after the code is done (DeliveryConfig); empty = as the lane profile says. */
    @Transactional(readOnly = true)
    public Map<String, Object> delivery(String projectId) {
        return deliveries.findById(projectId).map(d -> d.config == null ? Map.<String, Object>of() : new LinkedHashMap<>(d.config))
                .orElseGet(LinkedHashMap::new);
    }

    /** Saves the project's delivery settings; an empty body goes back to the lane profile's. */
    public Map<String, Object> saveDelivery(String projectId, Map<String, Object> body) {
        Map<String, Object> cfg = DeliveryConfig.normalize(body);
        if (cfg.isEmpty()) {
            deliveries.deleteById(projectId);
            return Map.of();
        }
        DeliveryPolicy d = deliveries.findById(projectId).orElseGet(() -> new DeliveryPolicy(projectId));
        d.config = cfg;
        d.updatedAt = java.time.Instant.now();
        deliveries.save(d);
        return cfg;
    }

    @Transactional(readOnly = true)
    public List<WorkflowStep> of(String projectId) {
        Map<Step, GatePolicy> rows = new EnumMap<>(Step.class);
        policies.findByProjectId(projectId).forEach(p -> rows.put(p.step, p));
        Set<Step> all = RunKind.FEATURE.steps();
        List<Step> order;
        if (rows.keySet().stream().noneMatch(all::contains)) {
            order = new ArrayList<>(all);
        } else {
            // The saved order; steps added since then go to their place (SECURITY after DEV, TESTCASE before it).
            order = new ArrayList<>(rows.keySet().stream().filter(all::contains)
                    .sorted(Comparator.comparingInt(s -> rows.get(s).position != null ? rows.get(s).position : s.ordinal()))
                    .toList());
            order = new ArrayList<>(Workflow.withNewSteps(order));
            for (Step s : all) if (!order.contains(s)) order.add(s);
        }
        List<WorkflowStep> out = new ArrayList<>();
        for (Step s : order) {
            GatePolicy p = rows.get(s);
            String defRole = s == Step.DESIGN ? "PM" : s.requiredRole();
            String role = (p != null && p.approverRole != null && !p.approverRole.isBlank()) ? p.approverRole : defRole;
            String approverId = p != null ? p.approverId : null;
            GateMode mode = p != null && p.mode != null ? p.mode : defaultMode(s, rows.get(Step.TEST) == null ? null : rows.get(Step.TEST).mode);
            out.add(new WorkflowStep(s.name(), mode.name(), role, approverId,
                    p == null || p.config == null ? Map.of() : p.config));
        }
        return out;
    }

    /**
     * The mode of a step the project never saved: test cases follow how the project treats testing
     * (an all-automatic workflow does not suddenly stop for a person), everything else needs a person.
     */
    static GateMode defaultMode(Step s, GateMode testMode) {
        if (s == Step.TESTCASE && testMode != null) return testMode;
        return GateMode.REQUIRED;
    }

    /** Replaces the whole workflow (every feature step, in order). */
    public List<WorkflowStep> save(String projectId, List<WorkflowStep> body) {
        if (body == null) throw new BadRequestException("workflow is required");
        List<Step> order = new ArrayList<>();
        Map<Step, GateMode> modes = new EnumMap<>(Step.class);
        Map<Step, WorkflowStep> bodyMap = new EnumMap<>(Step.class);
        for (WorkflowStep w : body) {
            Step s = Step.parse(w.step() == null ? "" : w.step());
            order.add(s);
            modes.put(s, parseMode(s, w.mode()));
            bodyMap.put(s, w);
        }
        order = Workflow.withNewSteps(order);
        Workflow.validateOrder(order);
        Map<Step, GatePolicy> rows = new EnumMap<>(Step.class);
        policies.findByProjectId(projectId).forEach(p -> rows.put(p.step, p));
        List<GatePolicy> out = new ArrayList<>();
        for (int i = 0; i < order.size(); i++) {
            Step s = order.get(i);
            GatePolicy p = rows.getOrDefault(s, new GatePolicy(projectId, s, GateMode.REQUIRED));
            // A step the client did not send (SECURITY/TESTCASE from an older client) keeps its mode, else its default.
            if (modes.containsKey(s)) p.mode = modes.get(s);
            else if (p.mode == null || !rows.containsKey(s)) p.mode = defaultMode(s, modes.get(Step.TEST));
            p.position = i;
            WorkflowStep stepBody = bodyMap.get(s);
            if (stepBody != null) {
                p.approverRole = stepBody.approverRole();
                p.approverId = stepBody.approverId();
                p.config = StepConfig.normalize(s, stepBody.config());
            }
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

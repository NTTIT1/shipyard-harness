package com.shipyard.platform.orchestrator.domain;

import com.shipyard.platform.common.exception.BadRequestException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Per-step settings a project picks for its workflow, frozen into each run and enforced by the lane
 * harness (run-step.sh): the AI model, how many times a failed AI run is retried, its wall-clock limit,
 * a VND budget, when the step runs, what happens when it fails, and the files it must read.
 * Unknown keys are dropped; every value is bounded so nothing free-form reaches a command line.
 */
public final class StepConfig {
    private StepConfig() {}

    public static final Set<String> CONDITIONS = Set.of("ALWAYS", "HAS_UI", "PREV_PASSED");
    public static final Set<String> ON_FAILURE = Set.of("ESCALATE_HUMAN", "RETRY", "FAIL_RUN");
    private static final Pattern MODEL = Pattern.compile("^[a-z0-9_-]{1,40}:[A-Za-z0-9._/:-]{1,120}$");
    private static final Pattern INPUT = Pattern.compile("^[A-Za-z0-9._/@-]{1,200}$");

    public static Map<String, Object> normalize(Step step, Map<String, Object> in) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (in == null) return out;
        Object model = in.get("model");
        if (model instanceof String m && !m.isBlank()) {
            if (!MODEL.matcher(m.trim()).matches()) throw bad(step, "model must look like provider:model");
            out.put("model", m.trim());
        }
        putInt(out, in, step, "maxRetries", 0, 5);
        putInt(out, in, step, "timeoutMinutes", 1, 480);
        putInt(out, in, step, "budgetVnd", 0, 1_000_000_000);
        Object cond = in.get("condition");
        if (cond instanceof String c && !c.isBlank()) {
            if (!CONDITIONS.contains(c)) throw bad(step, "condition must be one of " + CONDITIONS);
            if (step == Step.DEV && !c.equals("ALWAYS")) throw bad(step, "DEV always runs");
            out.put("condition", c);
        }
        Object fail = in.get("onFailure");
        if (fail instanceof String f && !f.isBlank()) {
            if (!ON_FAILURE.contains(f)) throw bad(step, "onFailure must be one of " + ON_FAILURE);
            out.put("onFailure", f);
        }
        Object inputs = in.get("requiredInputs");
        if (inputs instanceof List<?> l) {
            List<String> files = new ArrayList<>();
            for (Object o : l) {
                String s = String.valueOf(o).trim();
                if (s.isEmpty()) continue;
                if (!INPUT.matcher(s).matches() || s.contains("..") || s.startsWith("/")) {
                    throw bad(step, "requiredInputs: '" + s + "' must be a relative path inside the lane");
                }
                if (!files.contains(s)) files.add(s);
            }
            if (files.size() > 20) throw bad(step, "at most 20 required inputs");
            if (!files.isEmpty()) out.put("requiredInputs", files);
        }
        return out;
    }

    private static void putInt(Map<String, Object> out, Map<String, Object> in, Step step, String key, int min, int max) {
        Object v = in.get(key);
        if (v == null || (v instanceof String s && s.isBlank())) return;
        long n;
        try { n = v instanceof Number num ? num.longValue() : Long.parseLong(String.valueOf(v).trim()); }
        catch (NumberFormatException e) { throw bad(step, key + " must be a number"); }
        if (n < min || n > max) throw bad(step, key + " must be between " + min + " and " + max);
        out.put(key, (int) n);
    }

    private static BadRequestException bad(Step step, String msg) {
        return new BadRequestException(step + ": " + msg);
    }
}

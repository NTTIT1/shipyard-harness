package com.shipyard.platform.orchestrator.domain;

import com.shipyard.platform.common.exception.BadRequestException;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * A project's lane pipeline after the code is written — the default for every lane of the project
 * (a lane may override it locally), frozen into each run and followed by the lane (ship-feature,
 * through bin/lane-env.sh): which checks run before the PR (CI gate, e2e, AI code review, local browser
 * QC, senior GO/NO-GO), whether a PR is opened and against which branch, whether a human or the lane
 * merges it once everything is green, whether to wait for a deploy status, whether to browser-QC the
 * test environment and what to do when that fails, and whether to file a ticket.
 * An empty config means "as the lane profile says" (integrations.env). Values are bounded; unknown
 * keys are dropped.
 */
public final class DeliveryConfig {
    private DeliveryConfig() {}

    public static final Set<String> MERGE = Set.of("HUMAN", "AUTO");
    public static final Set<String> MERGE_METHOD = Set.of("SQUASH", "MERGE", "REBASE");
    public static final Set<String> QC_ON_FAIL = Set.of("FIX_PR", "HUMAN");
    /** Checks before the PR; each on unless switched off. */
    public static final java.util.List<String> CHECKS = java.util.List.of("ciGate", "e2e", "codeReview", "qcLocal", "seniorGate");
    private static final Pattern BRANCH = Pattern.compile("^[A-Za-z0-9._/-]{1,100}$");
    private static final Pattern CONTEXT = Pattern.compile("^[A-Za-z0-9 ._:/()-]{1,100}$");
    private static final Pattern URL = Pattern.compile("^https?://[^\\s'\"`<>\\\\]{1,300}$");

    public static Map<String, Object> normalize(Map<String, Object> in) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (in == null || in.isEmpty()) return out;
        for (String c : CHECKS) out.put(c, !in.containsKey(c) || bool(in, c));
        boolean pr = !in.containsKey("openPr") || bool(in, "openPr");
        out.put("openPr", pr);
        // Without a PR the lane may merge into the integration branch itself, on this machine only
        // (local demo: the next feature builds on it and the app runs with everything so far).
        if (!pr) out.put("localMerge", bool(in, "localMerge"));
        String base = str(in, "prBase");
        if (!base.isEmpty()) {
            if (!BRANCH.matcher(base).matches() || base.startsWith("-") || base.contains("..")) throw bad("prBase must be a branch name");
            out.put("prBase", base);
        }
        String merge = str(in, "merge");
        out.put("merge", merge.isEmpty() || !pr ? "HUMAN" : oneOf("merge", merge, MERGE));
        if ("AUTO".equals(out.get("merge"))) {
            String m = str(in, "mergeMethod");
            out.put("mergeMethod", m.isEmpty() ? "SQUASH" : oneOf("mergeMethod", m, MERGE_METHOD));
        }
        // Waiting for a deploy and QC-ing the test environment follow a merge: only with a PR.
        boolean wait = pr && bool(in, "deployWait");
        out.put("deployWait", wait);
        if (wait) {
            String ctx = str(in, "deployContext");
            if (!CONTEXT.matcher(ctx).matches()) throw bad("deployContext: the CI status to wait for, e.g. deploy-dev");
            out.put("deployContext", ctx);
            out.put("deployTimeoutMinutes", intIn(in, "deployTimeoutMinutes", 1, 240, 30));
        }
        boolean qc = pr && bool(in, "testQc");
        out.put("testQc", qc);
        if (qc) {
            String url = str(in, "testUrl");
            if (!URL.matcher(url).matches()) throw bad("testUrl: the test environment address, http(s)://…");
            out.put("testUrl", url);
            String f = str(in, "testQcOnFail");
            out.put("testQcOnFail", f.isEmpty() ? "FIX_PR" : oneOf("testQcOnFail", f, QC_ON_FAIL));
        }
        out.put("ticket", bool(in, "ticket"));
        return out;
    }

    private static String str(Map<String, Object> in, String k) {
        Object v = in.get(k);
        return v == null ? "" : String.valueOf(v).trim();
    }

    private static boolean bool(Map<String, Object> in, String k) {
        Object v = in.get(k);
        return v instanceof Boolean b ? b : "true".equalsIgnoreCase(String.valueOf(v));
    }

    private static int intIn(Map<String, Object> in, String k, int lo, int hi, int dflt) {
        Object v = in.get(k);
        if (v == null || String.valueOf(v).isBlank()) return dflt;
        try {
            long n = Math.round(Double.parseDouble(String.valueOf(v)));
            return (int) Math.max(lo, Math.min(hi, n));
        } catch (NumberFormatException e) {
            throw bad(k + " must be a number");
        }
    }

    private static String oneOf(String k, String v, Set<String> allowed) {
        if (!allowed.contains(v)) throw bad(k + " must be one of " + allowed);
        return v;
    }

    private static BadRequestException bad(String msg) { return new BadRequestException("delivery: " + msg); }
}

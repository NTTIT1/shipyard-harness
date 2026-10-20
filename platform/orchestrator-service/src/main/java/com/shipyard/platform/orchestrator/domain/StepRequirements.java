package com.shipyard.platform.orchestrator.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shipyard.platform.common.exception.BadRequestException;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** What each step must hand in before it can be reviewed (spec §3.1, §4.3). */
public final class StepRequirements {
    private StepRequirements() {}

    public static final long MAX_DOCUMENT_BYTES = 1_000_000;
    private static final ObjectMapper JSON = new ObjectMapper();

    private static final Map<Step, List<String>> REQUIRED_DOCS = Map.of(
            Step.PM, List.of("spec.md"),
            Step.BA, List.of("ba.md"),
            Step.ARCH, List.of("plan.md", "tasks.md", "entities.json"),
            Step.DESIGN, List.of("design.md"),
            Step.DEV, List.of(),
            Step.TEST, List.of("qc-plan.md"),
            Step.MANAGER, List.of("project.md", "team.json"));

    public static void validateSubmission(Step step, String summary, Map<String, String> documents,
                                          int imageCount, Map<String, Object> meta, Boolean hasUi) {
        List<String> problems = new ArrayList<>();
        if (summary == null || summary.isBlank()) problems.add("summary");
        Map<String, String> docs = documents == null ? Map.of() : documents;
        for (String f : REQUIRED_DOCS.get(step)) {
            if (docs.get(f) == null || docs.get(f).isBlank()) problems.add(f);
        }
        if ((step == Step.DESIGN || step == Step.TEST) && imageCount < 1) problems.add("at least one image");
        if (step == Step.DEV && (meta == null || !(meta.get("branch") instanceof String b) || b.isBlank())) {
            problems.add("meta.branch");
        }
        if (step == Step.ARCH) {
            if (hasUi == null) problems.add("hasUi");
            String entities = docs.get("entities.json");
            if (entities != null && !entities.isBlank() && !isJsonObject(entities)) problems.add("entities.json (must be a JSON object)");
        }
        if (!problems.isEmpty()) {
            throw new BadRequestException("Missing/invalid for " + step + ": " + String.join(", ", problems));
        }
        checkSize(docs);
    }

    public static void checkSize(Map<String, String> documents) {
        if (documents == null) return;
        long bytes = 0;
        for (Map.Entry<String, String> e : documents.entrySet()) {
            bytes += e.getKey().getBytes(StandardCharsets.UTF_8).length;
            bytes += e.getValue() == null ? 0 : e.getValue().getBytes(StandardCharsets.UTF_8).length;
        }
        if (bytes > MAX_DOCUMENT_BYTES) {
            throw new BadRequestException("Documents total " + bytes + " bytes, limit is " + MAX_DOCUMENT_BYTES);
        }
    }

    private static boolean isJsonObject(String raw) {
        try {
            JsonNode n = JSON.readTree(raw);
            return n != null && n.isObject();
        } catch (Exception e) {
            return false;
        }
    }
}

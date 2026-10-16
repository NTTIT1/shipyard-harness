package com.shipyard.platform.context.api;

import java.util.List;
import java.util.Map;

public final class Dtos {
    private Dtos() {}

    public record EventRequest(String eventId, String type, Map<String, Object> payload) {}

    public record EventResult(boolean processed) {}

    public record SearchRequest(String projectId, String query, List<String> kinds, String step, Integer k, String excludeRunId) {}

    public record Hit(String itemId, long chunkId, String kind, String title, String text, double score, String via,
                      String runId, String step) {}

    public record SearchResult(List<Hit> hits, boolean degraded) {}

    public record PackRequest(String projectId, String runId, String runTitle, String step, String query,
                              Map<String, Map<String, String>> priorApproved) {}

    public record PackItem(String itemId, String kind, String title, double score, String via) {}

    public record Pack(String markdown, List<PackItem> items, boolean degraded) {}

    public record DisableRequest(Boolean disabled) {}
}

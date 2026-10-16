package com.shipyard.platform.context.text;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.*;

/**
 * Reads the architect's entities.json into graph entities/relations (spec §5.2, §5.3).
 * Format: {"entities":[{type,key,name}], "relations":[{from:"TYPE:key", to:"TYPE:key", type}]};
 * "FEATURE:this" is the current run. Invalid parts are skipped with a warning — never fatal.
 */
public final class EntitiesParser {
    private EntitiesParser() {}

    public static final Set<String> ENTITY_TYPES = Set.of("FEATURE", "AC", "API", "TABLE", "SCREEN", "COMPONENT");
    public static final Set<String> EDGE_TYPES = Set.of("TOUCHES", "CALLS", "IMPLEMENTS", "SHOWS", "DEPENDS_ON");
    private static final ObjectMapper JSON = new ObjectMapper();

    public record Entity(String type, String key, String name) {}

    public record Relation(String fromType, String fromKey, String toType, String toKey, String type) {}

    public record Graph(List<Entity> entities, List<Relation> relations, List<String> warnings) {}

    public static Graph parse(String json, String runId, String runTitle) {
        Map<String, Entity> entities = new LinkedHashMap<>();
        List<Relation> relations = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        Entity feature = new Entity("FEATURE", norm(runId), runTitle == null ? runId : runTitle);
        entities.put("FEATURE:" + feature.key(), feature);

        JsonNode root;
        try {
            root = JSON.readTree(json);
        } catch (Exception e) {
            warnings.add("entities.json is not valid JSON: " + e.getMessage());
            return new Graph(new ArrayList<>(entities.values()), relations, warnings);
        }
        if (root == null || !root.isObject()) {
            warnings.add("entities.json is not a JSON object");
            return new Graph(new ArrayList<>(entities.values()), relations, warnings);
        }
        for (JsonNode n : root.path("entities")) {
            String type = n.path("type").asText("").trim().toUpperCase(Locale.ROOT);
            String key = norm(n.path("key").asText(""));
            if (!ENTITY_TYPES.contains(type) || key.isEmpty()) {
                warnings.add("skipped entity " + n);
                continue;
            }
            String name = n.path("name").asText("").trim();
            entities.put(type + ":" + key, new Entity(type, key, name.isEmpty() ? n.path("key").asText().trim() : name));
        }
        for (JsonNode n : root.path("relations")) {
            String[] from = endpoint(n.path("from").asText(""), feature.key());
            String[] to = endpoint(n.path("to").asText(""), feature.key());
            String type = n.path("type").asText("").trim().toUpperCase(Locale.ROOT);
            if (from == null || to == null || !EDGE_TYPES.contains(type)) {
                warnings.add("skipped relation " + n);
                continue;
            }
            for (String[] ep : List.of(from, to)) {
                entities.putIfAbsent(ep[0] + ":" + ep[1], new Entity(ep[0], ep[1], ep[1]));
            }
            relations.add(new Relation(from[0], from[1], to[0], to[1], type));
        }
        return new Graph(new ArrayList<>(entities.values()), relations, warnings);
    }

    /** "TYPE:key" → {TYPE, key}; null when malformed or of unknown type. */
    private static String[] endpoint(String raw, String featureKey) {
        int i = raw.indexOf(':');
        if (i <= 0) return null;
        String type = raw.substring(0, i).trim().toUpperCase(Locale.ROOT);
        String key = norm(raw.substring(i + 1));
        if (type.equals("FEATURE") && key.equals("this")) key = featureKey;
        if (!ENTITY_TYPES.contains(type) || key.isEmpty()) return null;
        return new String[]{type, key};
    }

    private static String norm(String key) {
        return key == null ? "" : key.trim().toLowerCase(Locale.ROOT);
    }
}

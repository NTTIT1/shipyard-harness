package com.shipyard.platform.context.text;

import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

/** Builds a safe to_tsquery('simple', …) OR-query: only letters/digits survive, so no tsquery syntax can leak in. */
public final class Tsq {
    private Tsq() {}

    private static final int MAX_TOKENS = 12;

    public static String build(String query) {
        if (query == null) return null;
        Set<String> tokens = new LinkedHashSet<>();
        for (String t : query.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+")) {
            if (t.length() >= 2) tokens.add(t);
            if (tokens.size() == MAX_TOKENS) break;
        }
        return tokens.isEmpty() ? null : String.join(" | ", tokens);
    }
}

package com.shipyard.platform.context.text;

import java.util.*;

/** Reciprocal rank fusion (k = 60) with per-id multiplicative boosts. */
public final class Fusion {
    private Fusion() {}

    private static final int K = 60;

    public static LinkedHashMap<String, Double> rrf(List<List<String>> rankings, Map<String, Double> boosts) {
        Map<String, Double> score = new HashMap<>();
        for (List<String> ranking : rankings) {
            for (int i = 0; i < ranking.size(); i++) score.merge(ranking.get(i), 1.0 / (K + i + 1), Double::sum);
        }
        score.replaceAll((id, s) -> s * boosts.getOrDefault(id, 1.0));
        LinkedHashMap<String, Double> out = new LinkedHashMap<>();
        score.entrySet().stream().sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                .forEach(e -> out.put(e.getKey(), e.getValue()));
        return out;
    }
}

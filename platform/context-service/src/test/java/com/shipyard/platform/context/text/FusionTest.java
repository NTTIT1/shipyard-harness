package com.shipyard.platform.context.text;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class FusionTest {
    @Test
    void itemsInBothListsRankFirstAndBoostsApply() {
        var fused = Fusion.rrf(List.of(List.of("a", "b", "c"), List.of("c", "a")), Map.of());
        assertThat(fused.keySet()).containsExactly("a", "c", "b");
        var boosted = Fusion.rrf(List.of(List.of("a", "b")), Map.of("b", 1.5));
        assertThat(boosted.keySet()).containsExactly("b", "a");
    }
}

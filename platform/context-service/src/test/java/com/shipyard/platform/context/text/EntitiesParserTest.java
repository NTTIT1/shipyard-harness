package com.shipyard.platform.context.text;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class EntitiesParserTest {
    @Test
    void parsesEntitiesRelationsAndTheRunFeature() {
        String json = """
                {"entities":[{"type":"TABLE","key":"Orders","name":"Bảng đơn hàng"},{"type":"API","key":"POST /orders","name":"Tạo đơn"}],
                 "relations":[{"from":"FEATURE:this","to":"TABLE:orders","type":"TOUCHES"},
                              {"from":"API:post /orders","to":"TABLE:orders","type":"TOUCHES"}]}""";
        EntitiesParser.Graph g = EntitiesParser.parse(json, "run_a", "Đặt hàng");
        assertThat(g.entities()).contains(new EntitiesParser.Entity("FEATURE", "run_a", "Đặt hàng"),
                new EntitiesParser.Entity("TABLE", "orders", "Bảng đơn hàng"));
        assertThat(g.relations()).contains(new EntitiesParser.Relation("FEATURE", "run_a", "TABLE", "orders", "TOUCHES"),
                new EntitiesParser.Relation("API", "post /orders", "TABLE", "orders", "TOUCHES"));
        assertThat(g.warnings()).isEmpty();
    }

    @Test
    void skipsInvalidEntriesWithWarnings() {
        String json = """
                {"entities":[{"type":"PLANET","key":"x"},{"type":"TABLE"},{"type":"SCREEN","key":"Login"}],
                 "relations":[{"from":"SCREEN:login","to":"API:get /me","type":"CALLS"},
                              {"from":"SCREEN:login","to":"TABLE:users","type":"LOVES"},
                              {"from":"nonsense","to":"TABLE:users","type":"TOUCHES"}]}""";
        EntitiesParser.Graph g = EntitiesParser.parse(json, "run_b", "Login");
        assertThat(g.entities()).extracting(EntitiesParser.Entity::type).containsExactlyInAnyOrder("FEATURE", "SCREEN", "API");
        assertThat(g.relations()).singleElement().satisfies(r -> assertThat(r.toKey()).isEqualTo("get /me"));
        assertThat(g.warnings()).hasSize(4);
    }

    @Test
    void malformedJsonKeepsOnlyTheFeature() {
        EntitiesParser.Graph g = EntitiesParser.parse("{not json", "run_c", "X");
        assertThat(g.entities()).singleElement().satisfies(e -> assertThat(e.type()).isEqualTo("FEATURE"));
        assertThat(g.warnings()).singleElement().satisfies(w -> assertThat(w).contains("JSON"));
    }
}

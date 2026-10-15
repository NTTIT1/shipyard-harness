package com.shipyard.platform.context;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class UserMemoryIT extends ContextIT {
    String itemId;

    @BeforeEach
    void seed() {
        directory.grant("proj_a", "usr_owner", "OWNER");
        directory.grant("proj_a", "usr_ba", "BA");
        internal(HttpMethod.POST, "/internal/v1/memory/events", Map.of("eventId", "evt_1", "type", "FEATURE_DONE",
                "payload", Map.of("projectId", "proj_a", "runId", "run_a", "title", "Đăng xuất", "summary", "xong")));
        itemId = db.sql("select id from memory_items").query(String.class).single();
    }

    @Test
    void listRequiresMembership() {
        assertThat(user("usr_x", null, HttpMethod.GET, "/api/v1/projects/proj_a/memory", null).getStatusCode().value()).isEqualTo(404);
        List<Map<String, Object>> items = data(user("usr_ba", null, HttpMethod.GET, "/api/v1/projects/proj_a/memory?q=đăng&kind=feature_summary", null));
        assertThat(items).singleElement().satisfies(i -> assertThat(i.get("title")).isEqualTo("Tính năng: Đăng xuất"));
    }

    @Test
    void onlyOwnerOrMaintainerCanDisable() {
        String path = "/api/v1/projects/proj_a/memory/" + itemId;
        assertThat(user("usr_ba", null, HttpMethod.PATCH, path, Map.of("disabled", true)).getStatusCode().value()).isEqualTo(403);
        Map<String, Object> r = data(user("usr_owner", null, HttpMethod.PATCH, path, Map.of("disabled", true)));
        assertThat(r.get("disabled")).isEqualTo(true);
        assertThat(user("usr_owner", null, HttpMethod.PATCH, "/api/v1/projects/proj_a/memory/mem_nope", Map.of("disabled", true))
                .getStatusCode().value()).isEqualTo(404);
        assertThat(user("usr_owner", null, HttpMethod.PATCH, path, Map.of()).getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void reembedIsSysAdminOnly() {
        db.sql("update memory_chunks set embed_status = 'EMBEDDED'").update();
        assertThat(user("usr_owner", "USER", HttpMethod.POST, "/api/v1/projects/proj_a/memory/reembed", null).getStatusCode().value()).isEqualTo(403);
        Map<String, Object> r = data(user("usr_admin", "SYS_ADMIN", HttpMethod.POST, "/api/v1/projects/proj_a/memory/reembed", null));
        assertThat(r.get("chunks")).isEqualTo(1);
        assertThat(db.sql("select embed_status from memory_chunks").query(String.class).single()).isEqualTo("PENDING");
    }
}

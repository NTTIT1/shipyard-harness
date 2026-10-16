package com.shipyard.platform.orchestrator;

import com.shipyard.platform.orchestrator.domain.Step;
import com.shipyard.platform.orchestrator.repository.OutboxEventRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;

/** Simultaneous duplicate requests: exactly one wins, the other gets 409, state advances once. */
class ConcurrencyIT extends OrchestratorIT {
    @Autowired OutboxEventRepository outbox;

    static final String P = "proj_c";
    static final int ROUNDS = 10;

    private List<Integer> race(Supplier<ResponseEntity<Map>> call) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch go = new CountDownLatch(1);
        try {
            List<Future<Integer>> fs = new ArrayList<>();
            for (int i = 0; i < 2; i++) fs.add(pool.submit(() -> { go.await(); return call.get().getStatusCode().value(); }));
            go.countDown();
            List<Integer> codes = new ArrayList<>();
            for (Future<Integer> f : fs) codes.add(f.get(30, TimeUnit.SECONDS));
            codes.sort(null);
            return codes;
        } finally {
            pool.shutdownNow();
        }
    }

    private String newRun() {
        return (String) ((Map) data(internal(HttpMethod.POST, "/internal/v1/runs", Map.of(
                "projectId", P, "laneRef", "h:lane1", "title", "t", "description", "", "createdBy", "usr_owner")))).get("id");
    }

    @Test
    void duplicateSubmitsYieldOne200AndOne409() throws Exception {
        for (int round = 0; round < ROUNDS; round++) {
            String run = newRun();
            List<Integer> codes = race(() -> internal(HttpMethod.POST, "/internal/v1/runs/" + run + "/steps/PM/submit",
                    InternalRunApiIT.payload(Step.PM, null)));
            assertThat(codes).as("round " + round).containsExactly(200, 409);
            Integer revisions = jdbc.queryForObject("select count(*) from step_revisions where run_id = ?", Integer.class, run);
            assertThat(revisions).isEqualTo(1);
        }
    }

    @Test
    void simultaneousApprovalsAdvanceTheRunOnce() throws Exception {
        directory.grant(P, "usr_owner", "OWNER");
        for (int round = 0; round < ROUNDS; round++) {
            String run = newRun();
            String apr = (String) ((Map) data(internal(HttpMethod.POST, "/internal/v1/runs/" + run + "/steps/PM/submit",
                    InternalRunApiIT.payload(Step.PM, null)))).get("approvalId");
            List<Integer> codes = race(() -> user("usr_owner", HttpMethod.POST, "/api/v1/approvals/" + apr + "/decision",
                    Map.of("action", "APPROVE")));
            assertThat(codes).as("round " + round).containsExactly(200, 409);
            Map<String, Object> next = data(internal(HttpMethod.GET, "/internal/v1/runs/" + run + "/next", null));
            assertThat(next.get("step")).isEqualTo("BA");
        }
        assertThat(outbox.findByTypeOrderByIdAsc("STEP_APPROVED")).hasSize(ROUNDS);
    }
}

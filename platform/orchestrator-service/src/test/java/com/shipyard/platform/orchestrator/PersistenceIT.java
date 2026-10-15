package com.shipyard.platform.orchestrator;

import com.shipyard.platform.orchestrator.domain.*;
import com.shipyard.platform.orchestrator.entity.*;
import com.shipyard.platform.orchestrator.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class PersistenceIT extends OrchestratorIT {
    @Autowired RunRepository runs;
    @Autowired RunStepRepository steps;
    @Autowired StepRevisionRepository revisions;

    @Test
    void entitiesRoundTripIncludingJsonColumns() {
        Run run = new Run();
        run.id = Ids.newId("run"); run.projectId = "proj_1"; run.laneRef = "host:lane1";
        run.title = "Đăng nhập"; run.description = "d"; run.status = RunStatus.RUNNING;
        run.currentStep = Step.PM; run.createdBy = "usr_1";
        runs.save(run);

        RunStep s = new RunStep(run.id, Step.PM);
        s.pendingEdits = Map.of("spec.md", "# Bản sửa");
        steps.save(s);

        StepRevision rev = new StepRevision();
        rev.id = Ids.newId("rev"); rev.runId = run.id; rev.step = Step.PM; rev.revisionNo = 1; rev.summary = "s";
        rev.documents = Map.of("spec.md", "# Tiếng Việt"); rev.images = List.of(Map.of("path", "/proof/x.png", "caption", ""));
        rev.meta = Map.of("k", 1); rev.contextUsed = List.of();
        revisions.save(rev);

        assertThat(steps.findByRunId(run.id).get(0).pendingEdits).containsEntry("spec.md", "# Bản sửa");
        assertThat(revisions.findById(rev.id).orElseThrow().documents).containsEntry("spec.md", "# Tiếng Việt");
        assertThat(runs.findById(run.id).orElseThrow().title).isEqualTo("Đăng nhập");
    }
}

package com.shipyard.platform.orchestrator.domain;

import com.shipyard.platform.common.exception.BadRequestException;
import com.shipyard.platform.common.exception.ConflictException;
import com.shipyard.platform.orchestrator.entity.Run;
import com.shipyard.platform.orchestrator.entity.RunStep;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.shipyard.platform.orchestrator.domain.Step.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WorkflowTest {
    Run run;
    Map<Step, RunStep> steps;

    static Decision approve() { return new Decision(DecisionAction.APPROVE, null, null, null, null); }

    @BeforeEach
    void setUp() {
        run = new Run();
        run.id = "run_1";
        steps = Workflow.newSteps(run.id);
        Workflow.start(run, steps);
    }

    /** Submit + approve the active step; ARCH submissions set hasUi first. */
    void pass(Step s, Boolean hasUi) {
        if (s == ARCH) run.hasUi = hasUi;
        Workflow.submit(run, steps, s);
        Workflow.decide(run, steps, s, approve());
    }

    @Test
    void startActivatesPm() {
        assertThat(steps.get(PM).status).isEqualTo(StepStatus.AI_WORKING);
        assertThat(run.currentStep).isEqualTo(PM);
        assertThat(run.status).isEqualTo(RunStatus.RUNNING);
        assertThat(Workflow.mode(run, steps)).isEqualTo(NextMode.WORK);
    }

    @Test
    void submitWaitsForReviewAndCountsRevisions() {
        assertThat(Workflow.submit(run, steps, PM)).isEqualTo(1);
        assertThat(run.status).isEqualTo(RunStatus.WAITING_REVIEW);
        assertThat(Workflow.mode(run, steps)).isEqualTo(NextMode.WAIT);
    }

    @Test
    void submittingANonActiveStepIsAConflict() {
        assertThatThrownBy(() -> Workflow.submit(run, steps, BA)).isInstanceOf(ConflictException.class);
        Workflow.submit(run, steps, PM);
        assertThatThrownBy(() -> Workflow.submit(run, steps, PM)).isInstanceOf(ConflictException.class);
    }

    @Test
    void happyPathWithUiGoesThroughDesignThenRelease() {
        pass(PM, null); pass(BA, null); pass(ARCH, true);
        assertThat(run.currentStep).isEqualTo(DESIGN);
        pass(DESIGN, null); pass(DEV, null); pass(TEST, null);
        assertThat(run.status).isEqualTo(RunStatus.RELEASING);
        assertThat(run.currentStep).isNull();
        assertThat(Workflow.mode(run, steps)).isEqualTo(NextMode.RELEASE);
        Workflow.release(run);
        assertThat(Workflow.mode(run, steps)).isEqualTo(NextMode.DONE);
    }

    @Test
    void noUiSkipsDesign() {
        pass(PM, null); pass(BA, null); pass(ARCH, false);
        assertThat(steps.get(DESIGN).status).isEqualTo(StepStatus.SKIPPED);
        assertThat(steps.get(DESIGN).skipReason).isEqualTo("has_ui=false");
        assertThat(run.currentStep).isEqualTo(DEV);
    }

    @Test
    void archReviewerCanOverrideHasUi() {
        pass(PM, null); pass(BA, null);
        run.hasUi = false;
        Workflow.submit(run, steps, ARCH);
        Workflow.decide(run, steps, ARCH, new Decision(DecisionAction.APPROVE, null, null, null, true));
        assertThat(run.hasUi).isTrue();
        assertThat(run.currentStep).isEqualTo(DESIGN);
    }

    @Test
    void devCannotStartBeforeDesignIsApproved() {
        pass(PM, null); pass(BA, null); pass(ARCH, true);
        assertThatThrownBy(() -> Workflow.activate(run, steps, DEV))
                .isInstanceOf(ConflictException.class).hasMessageContaining("DESIGN");
    }

    @Test
    void requestChangesNeedsFeedbackAndYieldsRevise() {
        Workflow.submit(run, steps, PM);
        assertThatThrownBy(() -> Workflow.decide(run, steps, PM, new Decision(DecisionAction.REQUEST_CHANGES, " ", null, null, null)))
                .isInstanceOf(BadRequestException.class);
        Workflow.decide(run, steps, PM, new Decision(DecisionAction.REQUEST_CHANGES, "Thêm AC đăng xuất", Map.of("spec.md", "x"), null, null));
        assertThat(steps.get(PM).status).isEqualTo(StepStatus.AI_WORKING);
        assertThat(steps.get(PM).pendingFeedback).isEqualTo("Thêm AC đăng xuất");
        assertThat(steps.get(PM).pendingEdits).containsEntry("spec.md", "x");
        assertThat(Workflow.mode(run, steps)).isEqualTo(NextMode.REVISE);
        assertThat(Workflow.submit(run, steps, PM)).isEqualTo(2);
        assertThat(steps.get(PM).pendingFeedback).isNull();
        assertThat(steps.get(PM).pendingEdits).isNull();
    }

    @Test
    void sendBackReopensTargetAndResetsEverythingAfterIt() {
        pass(PM, null); pass(BA, null); pass(ARCH, false); pass(DEV, null);
        Workflow.submit(run, steps, TEST);
        Workflow.decide(run, steps, TEST, new Decision(DecisionAction.SEND_BACK, "AC-3 sai nghiệp vụ", null, BA, null));
        assertThat(steps.get(BA).status).isEqualTo(StepStatus.AI_WORKING);
        assertThat(steps.get(BA).pendingFeedback).contains("TEST").contains("AC-3 sai nghiệp vụ");
        for (Step s : new Step[]{ARCH, DESIGN, DEV, TEST}) {
            assertThat(steps.get(s).status).as(s.name()).isEqualTo(StepStatus.PENDING);
            assertThat(steps.get(s).skipReason).isNull();
        }
        assertThat(steps.get(PM).status).isEqualTo(StepStatus.APPROVED);
        assertThat(run.currentStep).isEqualTo(BA);
        assertThat(run.status).isEqualTo(RunStatus.RUNNING);
    }

    @Test
    void sendBackValidation() {
        pass(PM, null); pass(BA, null); pass(ARCH, false); pass(DEV, null);
        Workflow.submit(run, steps, TEST);
        assertThatThrownBy(() -> Workflow.decide(run, steps, TEST, new Decision(DecisionAction.SEND_BACK, "x", null, TEST, null)))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> Workflow.decide(run, steps, TEST, new Decision(DecisionAction.SEND_BACK, "x", null, DESIGN, null)))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("skipped");
        assertThatThrownBy(() -> Workflow.decide(run, steps, TEST, new Decision(DecisionAction.SEND_BACK, "x", Map.of("a", "b"), PM, null)))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> Workflow.decide(run, steps, TEST, new Decision(DecisionAction.SEND_BACK, "", null, PM, null)))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void decidingAStepThatIsNotAwaitingReviewIsAConflict() {
        assertThatThrownBy(() -> Workflow.decide(run, steps, PM, approve())).isInstanceOf(ConflictException.class);
    }

    @Test
    void cancelEndsTheRun() {
        Workflow.submit(run, steps, PM);
        Workflow.decide(run, steps, PM, new Decision(DecisionAction.CANCEL, null, null, null, null));
        assertThat(run.status).isEqualTo(RunStatus.CANCELLED);
        assertThat(Workflow.mode(run, steps)).isEqualTo(NextMode.CANCELLED);
        assertThatThrownBy(() -> Workflow.submit(run, steps, PM)).isInstanceOf(ConflictException.class);
    }

    @Test
    void reopenDevAfterReleaseOrDone() {
        assertThatThrownBy(() -> Workflow.reopenDev(run, steps, "x")).isInstanceOf(ConflictException.class);
        pass(PM, null); pass(BA, null); pass(ARCH, false); pass(DEV, null); pass(TEST, null);
        Workflow.release(run);
        Workflow.reopenDev(run, steps, "dev-QC: nút Lưu lỗi 500");
        assertThat(run.currentStep).isEqualTo(DEV);
        assertThat(run.status).isEqualTo(RunStatus.RUNNING);
        assertThat(steps.get(DEV).pendingFeedback).contains("nút Lưu lỗi 500");
        assertThat(steps.get(TEST).status).isEqualTo(StepStatus.PENDING);
        assertThat(Workflow.mode(run, steps)).isEqualTo(NextMode.REVISE);
    }

    @Test
    void releaseOnlyFromReleasing() {
        assertThatThrownBy(() -> Workflow.release(run)).isInstanceOf(ConflictException.class);
    }

    @Test
    void featureRunsNeverContainManager() {
        assertThat(steps).doesNotContainKey(MANAGER);
        assertThat(steps.keySet()).containsExactly(PM, BA, ARCH, DESIGN, DEV, TEST);
    }

    @Test
    void setupRunIsTheSingleManagerStepThenReleases() {
        Run setup = new Run();
        setup.id = "run_s";
        Map<Step, RunStep> st = Workflow.newSteps(setup.id, RunKind.SETUP);
        assertThat(st.keySet()).containsExactly(MANAGER);
        Workflow.start(setup, st);
        assertThat(setup.currentStep).isEqualTo(MANAGER);
        Workflow.submit(setup, st, MANAGER);
        Workflow.decide(setup, st, MANAGER, new Decision(DecisionAction.REQUEST_CHANGES, "thêm luật đặt tên bảng", null, null, null));
        assertThat(Workflow.mode(setup, st)).isEqualTo(NextMode.REVISE);
        Workflow.submit(setup, st, MANAGER);
        Workflow.decide(setup, st, MANAGER, approve());
        assertThat(setup.status).isEqualTo(RunStatus.RELEASING);
        assertThat(Workflow.mode(setup, st)).isEqualTo(NextMode.RELEASE);
    }

    @Test
    void cannotSendBackToAStepOutsideTheRun() {
        Run setup = new Run();
        setup.id = "run_s2";
        Map<Step, RunStep> st = Workflow.newSteps(setup.id, RunKind.SETUP);
        Workflow.start(setup, st);
        Workflow.submit(setup, st, MANAGER);
        assertThatThrownBy(() -> Workflow.decide(setup, st, MANAGER, new Decision(DecisionAction.SEND_BACK, "x", null, PM, null)))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void runKindParsesAndRejectsUnknown() {
        assertThat(RunKind.parse(null)).isEqualTo(RunKind.FEATURE);
        assertThat(RunKind.parse("setup")).isEqualTo(RunKind.SETUP);
        assertThatThrownBy(() -> RunKind.parse("deploy")).isInstanceOf(BadRequestException.class);
    }

    /** A fresh feature run with a custom workflow (order + left-out steps). */
    Map<Step, RunStep> custom(Run r, List<Step> order, Set<Step> skipped) {
        r.id = "run_c";
        Map<Step, RunStep> st = Workflow.newSteps(r.id);
        Workflow.plan(r, st, order, skipped);
        Workflow.start(r, st);
        return st;
    }

    @Test
    void workflowCanLeaveStepsOutAndStillGuardsDev() {
        Run r = new Run();
        Map<Step, RunStep> st = custom(r, List.of(PM, BA, ARCH, DESIGN, DEV, TEST), Set.of(PM, BA, DESIGN));
        assertThat(r.currentStep).isEqualTo(ARCH);
        assertThat(st.get(PM).status).isEqualTo(StepStatus.SKIPPED);
        assertThat(st.get(PM).skipReason).isEqualTo(Workflow.SKIP_WORKFLOW);
        r.hasUi = true;
        Workflow.submit(r, st, ARCH);
        Workflow.decide(r, st, ARCH, approve());
        assertThat(r.currentStep).as("DESIGN left out even though has_ui=true").isEqualTo(DEV);
        Workflow.submit(r, st, DEV);
        Workflow.decide(r, st, DEV, approve());
        assertThat(r.currentStep).isEqualTo(TEST);
    }

    @Test
    void devWaitsForArchitectureApprovalWhateverTheOrder() {
        Run r = new Run();
        Map<Step, RunStep> st = custom(r, List.of(ARCH, DESIGN, PM, BA, DEV, TEST), Set.of(BA, TEST));
        assertThat(r.currentStep).isEqualTo(ARCH);
        assertThatThrownBy(() -> Workflow.activate(r, st, DEV)).isInstanceOf(ConflictException.class).hasMessageContaining("ARCH");
        r.hasUi = false;
        Workflow.submit(r, st, ARCH);
        Workflow.decide(r, st, ARCH, approve());
        assertThat(st.get(DESIGN).skipReason).isEqualTo("has_ui=false");
        assertThat(r.currentStep).isEqualTo(PM);
        Workflow.submit(r, st, PM);
        Workflow.decide(r, st, PM, approve());
        assertThat(r.currentStep).isEqualTo(DEV);
        Workflow.submit(r, st, DEV);
        Workflow.decide(r, st, DEV, approve());
        assertThat(r.status).as("TEST left out → release right after DEV").isEqualTo(RunStatus.RELEASING);
    }

    @Test
    void sendBackFollowsTheWorkflowOrderAndKeepsLeftOutSteps() {
        Run r = new Run();
        Map<Step, RunStep> st = custom(r, List.of(ARCH, PM, BA, DESIGN, DEV, TEST), Set.of(BA));
        r.hasUi = false;
        for (Step s : new Step[]{ARCH, PM, DEV}) { Workflow.submit(r, st, s); Workflow.decide(r, st, s, approve()); }
        Workflow.submit(r, st, TEST);
        assertThatThrownBy(() -> Workflow.decide(r, st, TEST, new Decision(DecisionAction.SEND_BACK, "x", null, BA, null)))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("skipped");
        Workflow.decide(r, st, TEST, new Decision(DecisionAction.SEND_BACK, "sai kiến trúc", null, ARCH, null));
        assertThat(r.currentStep).isEqualTo(ARCH);
        assertThat(st.get(PM).status).isEqualTo(StepStatus.PENDING);
        assertThat(st.get(BA).status).isEqualTo(StepStatus.SKIPPED);
        assertThat(st.get(BA).skipReason).isEqualTo(Workflow.SKIP_WORKFLOW);
    }

    @Test
    void workflowValidation() {
        Run r = new Run();
        assertThatThrownBy(() -> custom(r, List.of(PM, BA, ARCH, DESIGN, DEV, TEST), Set.of(DEV)))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("DEV");
        assertThatThrownBy(() -> Workflow.validateOrder(List.of(PM, BA, ARCH, DEV, DESIGN, TEST)))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("DESIGN must come before DEV");
        assertThatThrownBy(() -> Workflow.validateOrder(List.of(PM, BA, ARCH, DESIGN, TEST, DEV)))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("TEST");
        assertThatThrownBy(() -> Workflow.validateOrder(List.of(PM, BA, ARCH, DEV, TEST)))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> Workflow.validateOrder(List.of(PM, PM, ARCH, DESIGN, DEV, TEST)))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void reopenKeepsALeftOutTestSkipped() {
        Run r = new Run();
        Map<Step, RunStep> st = custom(r, List.of(PM, BA, ARCH, DESIGN, DEV, TEST), Set.of(PM, BA, ARCH, DESIGN, TEST));
        assertThat(r.currentStep).isEqualTo(DEV);
        Workflow.submit(r, st, DEV);
        Workflow.decide(r, st, DEV, approve());
        Workflow.reopenDev(r, st, "lỗi");
        assertThat(st.get(TEST).status).isEqualTo(StepStatus.SKIPPED);
    }
}

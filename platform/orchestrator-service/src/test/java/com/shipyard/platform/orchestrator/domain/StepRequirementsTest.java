package com.shipyard.platform.orchestrator.domain;

import com.shipyard.platform.common.exception.BadRequestException;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StepRequirementsTest {

    @Test
    void reportsEveryMissingArtifact() {
        assertThatThrownBy(() -> StepRequirements.validateSubmission(Step.ARCH, "s", Map.of("plan.md", "x"), 0, Map.of(), true))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("tasks.md").hasMessageContaining("entities.json");
    }

    @Test
    void archNeedsHasUiAndJsonObjectEntities() {
        Map<String, String> docs = Map.of("plan.md", "p", "tasks.md", "t", "entities.json", "{\"entities\":[]}");
        assertThatThrownBy(() -> StepRequirements.validateSubmission(Step.ARCH, "s", docs, 0, Map.of(), null))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("hasUi");
        Map<String, String> bad = Map.of("plan.md", "p", "tasks.md", "t", "entities.json", "[1,");
        assertThatThrownBy(() -> StepRequirements.validateSubmission(Step.ARCH, "s", bad, 0, Map.of(), true))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("entities.json");
        assertThatCode(() -> StepRequirements.validateSubmission(Step.ARCH, "s", docs, 0, Map.of(), false)).doesNotThrowAnyException();
    }

    @Test
    void designAndTestNeedImagesDevNeedsBranch() {
        assertThatThrownBy(() -> StepRequirements.validateSubmission(Step.DESIGN, "s", Map.of("design.md", "d"), 0, Map.of(), null))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("image");
        assertThatThrownBy(() -> StepRequirements.validateSubmission(Step.DEV, "s", Map.of(), 0, Map.of(), null))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("branch");
        assertThatCode(() -> StepRequirements.validateSubmission(Step.TEST, "s", Map.of("qc-plan.md", "q"), 2, Map.of(), null))
                .doesNotThrowAnyException();
    }

    @Test
    void summaryIsRequired() {
        assertThatThrownBy(() -> StepRequirements.validateSubmission(Step.PM, " ", Map.of("spec.md", "x"), 0, Map.of(), null))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("summary");
    }

    @Test
    void sizeIsMeasuredInUtf8Bytes() {
        String vietnamese = "ệ".repeat(400_000); // 400k chars, 1.2 MB in UTF-8
        assertThatThrownBy(() -> StepRequirements.checkSize(Map.of("spec.md", vietnamese)))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("1000000");
        assertThatCode(() -> StepRequirements.checkSize(Map.of("spec.md", "ệ".repeat(300_000)))).doesNotThrowAnyException();
    }
}

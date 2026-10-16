package com.shipyard.platform.context.text;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class EditDiffTest {
    @Test
    void keepsOnlyChangedLinesAndTheFeedback() {
        String s = EditDiff.summarize("# Spec\nAC-1 đăng xuất\nAC-2 cũ", "# Spec\nAC-1 đăng xuất\nAC-2 hết hạn phiên", "Thiếu AC phiên");
        assertThat(s).contains("- AC-2 cũ").contains("+ AC-2 hết hạn phiên").contains("Góp ý: Thiếu AC phiên")
                .doesNotContain("AC-1");
    }

    @Test
    void identicalTextsSayNoContentChange() {
        assertThat(EditDiff.summarize("a\nb", "a\nb", null)).contains("Không có thay đổi nội dung");
    }

    @Test
    void outputIsCapped() {
        assertThat(EditDiff.summarize("x\n".repeat(10), "y".repeat(10_000), "")).hasSizeLessThanOrEqualTo(4000);
    }
}

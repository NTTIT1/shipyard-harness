package com.shipyard.platform.context.text;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

class ChunkerTest {
    @Test
    void shortDocIsOneChunkPrefixedWithTitle() {
        List<Chunker.Chunk> cs = Chunker.chunk("Đăng xuất — PM — spec.md", "# Spec\n\nAC-1 người dùng đăng xuất");
        assertThat(cs).singleElement().satisfies(c -> {
            assertThat(c.no()).isZero();
            assertThat(c.text()).startsWith("Đăng xuất — PM — spec.md").contains("AC-1 người dùng đăng xuất");
        });
    }

    @Test
    void largeDocsSplitAtHeadingsWithHeadingPath() {
        String a = "## Luồng A\n" + "a ".repeat(1200);
        String b = "## Luồng B\n" + "b ".repeat(1200);
        List<Chunker.Chunk> cs = Chunker.chunk("T", "# BA\n" + a + "\n" + b);
        assertThat(cs).hasSize(2);
        assertThat(cs.get(0).text()).startsWith("T › BA › Luồng A");
        assertThat(cs.get(1).text()).startsWith("T › BA › Luồng B");
        assertThat(cs).allSatisfy(c -> assertThat(c.text().length()).isLessThanOrEqualTo(Chunker.MAX_CHARS + 200));
    }

    @Test
    void oversizedSectionIsHardSplitWithOverlap() {
        StringBuilder body = new StringBuilder("## Dài\n");
        for (int i = 0; i < 2000; i++) body.append("w").append(i).append(' ');
        List<Chunker.Chunk> cs = Chunker.chunk("T", body.toString());
        assertThat(cs.size()).isGreaterThan(1);
        String tailOfFirst = cs.get(0).text().substring(cs.get(0).text().length() - 50);
        assertThat(cs.get(1).text()).contains(tailOfFirst.trim().split(" ")[1]);
    }

    @Test
    void emptyDocStillYieldsTheTitle() {
        assertThat(Chunker.chunk("Chỉ tiêu đề", "  \n ")).singleElement()
                .satisfies(c -> assertThat(c.text()).isEqualTo("Chỉ tiêu đề"));
    }

    @Test
    void sectionExtractsUntilTheNextHeadingOfSameLevel() {
        String md = "# Plan\n## Bối cảnh\nx\n## Quyết định\n- Dùng JWT cookie\n### Lý do\nan toàn\n## Rủi ro\ny";
        String s = Chunker.section(md, Pattern.compile("quyết định|decision", Pattern.CASE_INSENSITIVE));
        assertThat(s).contains("Dùng JWT cookie").contains("an toàn").doesNotContain("Rủi ro").doesNotContain("Bối cảnh");
        assertThat(Chunker.section("# x\nno", Pattern.compile("quyết định"))).isNull();
    }
}

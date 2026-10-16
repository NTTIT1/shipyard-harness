package com.shipyard.platform.context.text;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TsqTest {
    @Test
    void sanitizedOrQuery() {
        assertThat(Tsq.build("Đăng xuất & phân-trang!")).isEqualTo("đăng | xuất | phân | trang");
    }

    @Test
    void operatorsAndPunctuationNeverLeakIntoTheQuery() {
        assertThat(Tsq.build("a & b | !c :* 'x' 🙂 ab")).isEqualTo("ab");
        assertThat(Tsq.build("!!! ' :* ")).isNull();
        assertThat(Tsq.build(null)).isNull();
    }

    @Test
    void duplicatesRemovedAndCapped() {
        assertThat(Tsq.build("xx xx yy")).isEqualTo("xx | yy");
        assertThat(Tsq.build("t1 t2 t3 t4 t5 t6 t7 t8 t9 t10 t11 t12 t13 t14").split(" \\| ")).hasSize(12);
    }
}

package com.shipyard.platform.context;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SchemaIT extends ContextIT {
    @Test
    void vectorExtensionAndTablesExist() {
        assertThat(db.sql("select extversion from pg_extension where extname = 'vector'").query(String.class).optional()).isPresent();
        assertThat(db.sql("select count(*) from memory_chunks").query(Long.class).single()).isZero();
    }
}

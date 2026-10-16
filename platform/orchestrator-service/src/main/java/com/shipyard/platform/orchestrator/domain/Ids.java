package com.shipyard.platform.orchestrator.domain;

import java.util.UUID;

public final class Ids {
    private Ids() {}

    public static String newId(String prefix) {
        return prefix + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 20);
    }
}

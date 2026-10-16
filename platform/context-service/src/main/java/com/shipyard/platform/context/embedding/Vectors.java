package com.shipyard.platform.context.embedding;

public final class Vectors {
    private Vectors() {}

    /** pgvector text form, used with CAST(:v AS vector). */
    public static String literal(float[] v) {
        StringBuilder sb = new StringBuilder(v.length * 10).append('[');
        for (int i = 0; i < v.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(v[i]);
        }
        return sb.append(']').toString();
    }
}

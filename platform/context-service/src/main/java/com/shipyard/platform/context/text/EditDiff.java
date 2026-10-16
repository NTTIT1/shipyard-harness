package com.shipyard.platform.context.text;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/** Compact "what the AI wrote vs what the human changed it to" for HUMAN_EDIT lessons. */
public final class EditDiff {
    private EditDiff() {}

    private static final int MAX = 4000;

    public static String summarize(String aiText, String humanText, String feedback) {
        List<String> ai = lines(aiText);
        List<String> human = lines(humanText);
        Set<String> aiSet = new LinkedHashSet<>(ai);
        Set<String> humanSet = new LinkedHashSet<>(human);
        List<String> removed = ai.stream().filter(l -> !humanSet.contains(l)).distinct().toList();
        List<String> added = human.stream().filter(l -> !aiSet.contains(l)).distinct().toList();
        StringBuilder sb = new StringBuilder();
        if (removed.isEmpty() && added.isEmpty()) {
            sb.append("Không có thay đổi nội dung (chỉ định dạng).");
        } else {
            sb.append("AI viết:\n").append(removed.stream().map(l -> "- " + l).collect(Collectors.joining("\n")));
            sb.append("\n\nNgười sửa thành:\n").append(added.stream().map(l -> "+ " + l).collect(Collectors.joining("\n")));
        }
        if (feedback != null && !feedback.isBlank()) sb.append("\n\nGóp ý: ").append(feedback.trim());
        return sb.length() <= MAX ? sb.toString() : sb.substring(0, MAX - 1) + "…";
    }

    private static List<String> lines(String s) {
        if (s == null) return List.of();
        return Arrays.stream(s.split("\n")).map(String::trim).filter(l -> !l.isEmpty()).toList();
    }
}

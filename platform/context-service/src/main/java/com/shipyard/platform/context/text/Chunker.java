package com.shipyard.platform.context.text;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Splits markdown into retrieval chunks at headings (spec §5.3: ~800 tokens, 100-token overlap). */
public final class Chunker {
    private Chunker() {}

    public static final int MAX_CHARS = 3200;
    public static final int OVERLAP_CHARS = 400;
    private static final Pattern HEADING = Pattern.compile("^(#{1,6})\\s+(.*)$");

    public record Chunk(int no, String text) {}

    private record Section(String path, String text) {}

    public static List<Chunk> chunk(String title, String markdown) {
        List<Section> sections = sections(markdown == null ? "" : markdown);
        List<Chunk> out = new ArrayList<>();
        StringBuilder buf = new StringBuilder();
        String bufPath = null;
        boolean bufHasBody = false;
        for (Section s : sections) {
            if (s.text().isBlank()) continue;
            if (s.text().length() > MAX_CHARS) {
                flush(out, title, bufPath, buf);
                bufPath = null;
                bufHasBody = false;
                for (String piece : hardSplit(s.text())) add(out, title, s.path(), piece);
                continue;
            }
            if (buf.length() > 0 && buf.length() + 1 + s.text().length() > MAX_CHARS) {
                flush(out, title, bufPath, buf);
                bufPath = null;
                bufHasBody = false;
            }
            // A chunk is labelled with the first section that has real content, not a bare parent heading.
            if (bufPath == null || !bufHasBody) bufPath = s.path();
            if (buf.length() > 0) buf.append('\n');
            buf.append(s.text());
            bufHasBody |= hasBody(s.text());
        }
        flush(out, title, bufPath, buf);
        if (out.isEmpty()) out.add(new Chunk(0, title));
        return out;
    }

    /** The body of the first heading matching {@code headingMatcher}, up to the next heading of the same or higher level. */
    public static String section(String markdown, Pattern headingMatcher) {
        String[] lines = markdown.split("\n", -1);
        int level = -1;
        StringBuilder sb = null;
        for (String line : lines) {
            Matcher m = HEADING.matcher(line);
            if (sb == null) {
                if (m.matches() && headingMatcher.matcher(m.group(2)).find()) {
                    level = m.group(1).length();
                    sb = new StringBuilder(line).append('\n');
                }
                continue;
            }
            if (m.matches() && m.group(1).length() <= level) break;
            sb.append(line).append('\n');
        }
        return sb == null ? null : sb.toString().trim();
    }

    private static List<Section> sections(String md) {
        List<Section> out = new ArrayList<>();
        String[] path = new String[7];
        StringBuilder cur = new StringBuilder();
        String curPath = "";
        for (String line : md.split("\n", -1)) {
            Matcher m = HEADING.matcher(line);
            if (m.matches()) {
                out.add(new Section(curPath, cur.toString().trim()));
                cur.setLength(0);
                int level = m.group(1).length();
                path[level] = m.group(2).trim();
                for (int i = level + 1; i < path.length; i++) path[i] = null;
                List<String> parts = new ArrayList<>();
                for (int i = 1; i <= level; i++) if (path[i] != null) parts.add(path[i]);
                curPath = String.join(" › ", parts);
            }
            cur.append(line).append('\n');
        }
        out.add(new Section(curPath, cur.toString().trim()));
        return out;
    }

    private static boolean hasBody(String text) {
        for (String line : text.split("\n")) if (!line.isBlank() && !HEADING.matcher(line).matches()) return true;
        return false;
    }

    private static List<String> hardSplit(String text) {
        List<String> pieces = new ArrayList<>();
        int start = 0;
        while (start < text.length()) {
            int end = Math.min(text.length(), start + MAX_CHARS);
            if (end < text.length()) {
                int para = text.lastIndexOf("\n\n", end);
                int space = text.lastIndexOf(' ', end);
                int cut = para > start + MAX_CHARS / 2 ? para : (space > start + MAX_CHARS / 2 ? space : end);
                end = cut;
            }
            pieces.add(text.substring(start, end).trim());
            if (end >= text.length()) break;
            start = Math.max(end - OVERLAP_CHARS, start + 1);
        }
        return pieces;
    }

    private static void flush(List<Chunk> out, String title, String path, StringBuilder buf) {
        if (buf.length() == 0) return;
        add(out, title, path, buf.toString());
        buf.setLength(0);
    }

    private static void add(List<Chunk> out, String title, String path, String text) {
        String prefix = path == null || path.isBlank() ? title : title + " › " + path;
        out.add(new Chunk(out.size(), prefix + "\n" + text));
    }
}

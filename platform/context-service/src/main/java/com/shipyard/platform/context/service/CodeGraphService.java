package com.shipyard.platform.context.service;

import com.shipyard.platform.common.exception.BadRequestException;
import com.shipyard.platform.context.store.MemoryStore;
import com.shipyard.platform.context.store.MemoryStore.NewItem;
import com.shipyard.platform.context.text.Chunker;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * The map of a project's code and documents (bin/code-graph.py, sent by the dashboard): replaces the
 * previous map in one transaction. Documents become searchable items (kind DOC), the overview a CODE_MAP
 * item, and modules / APIs / tables / screens / documents graph entities, so the graph branch of the
 * hybrid search finds the documents that talk about what a step touches.
 */
@Service
public class CodeGraphService {
    public static final String SOURCE = "code-graph/";
    public static final Set<String> NODE_TYPES = Set.of("MODULE", "API", "TABLE", "SCREEN", "DOC", "COMPONENT");
    public static final Set<String> EDGE_TYPES = Set.of("DEPENDS_ON", "IMPLEMENTS", "TOUCHES", "MENTIONS", "LINKS", "SHOWS", "CALLS");
    /** Entities only the map creates: dropped when no edge uses them any more. */
    private static final Set<String> OWN_TYPES = Set.of("MODULE", "DOC");
    static final int MAX_NODES = 20_000, MAX_EDGES = 80_000, MAX_DOCS = 600, MAX_DOC = 60_000, MAX_REPORT = 200_000;

    public record Node(String id, String type, String key, String name) {}

    public record Edge(String from, String to, String type) {}

    public record Doc(String path, String content) {}

    public record Request(String source, String title, String report, List<Node> nodes, List<Edge> edges, List<Doc> docs) {}

    private final MemoryStore store;

    public CodeGraphService(MemoryStore store) { this.store = store; }

    @Transactional
    public Map<String, Integer> replace(String projectId, Request req) {
        if (projectId == null || projectId.isBlank()) throw new BadRequestException("projectId is required");
        List<Node> nodes = req.nodes() == null ? List.of() : req.nodes();
        List<Edge> edges = req.edges() == null ? List.of() : req.edges();
        List<Doc> docs = req.docs() == null ? List.of() : req.docs();
        if (nodes.size() > MAX_NODES || edges.size() > MAX_EDGES || docs.size() > MAX_DOCS) {
            throw new BadRequestException("Map too large: at most " + MAX_NODES + " nodes, " + MAX_EDGES + " edges, " + MAX_DOCS + " documents");
        }
        String title = req.title() == null || req.title().isBlank() ? "dự án" : req.title().trim();
        String source = req.source() == null ? "" : req.source().trim();
        int removed = store.deleteBySourcePrefix(projectId, SOURCE);

        String report = req.report() == null || req.report().isBlank() ? "# Bản đồ mã nguồn & tài liệu — " + title : req.report();
        if (report.length() > MAX_REPORT) report = report.substring(0, MAX_REPORT);
        String mapItem = add(new NewItem(projectId, "CODE_MAP", null, null, "Bản đồ mã nguồn & tài liệu — " + title
                + (source.isEmpty() ? "" : " (" + source + ")"), report, SOURCE + "map"));

        Map<String, String> docItem = new HashMap<>();
        for (Doc d : docs) {
            if (d == null || d.path() == null || d.path().isBlank() || d.content() == null || d.content().isBlank()) continue;
            String path = d.path().trim();
            String content = d.content().length() > MAX_DOC ? d.content().substring(0, MAX_DOC) : d.content();
            docItem.put(path.toLowerCase(Locale.ROOT), add(new NewItem(projectId, "DOC", null, null, "Tài liệu: " + path, content, SOURCE + "doc/" + path)));
        }

        Map<String, Long> ids = new HashMap<>();
        Map<String, Node> byId = new HashMap<>();
        for (Node n : nodes) {
            String type = n == null || n.type() == null ? "" : n.type().trim().toUpperCase(Locale.ROOT);
            String key = n == null || n.key() == null ? "" : n.key().trim().toLowerCase(Locale.ROOT);
            if (!NODE_TYPES.contains(type) || key.isEmpty() || n.id() == null) continue;
            ids.put(n.id(), store.upsertEntity(projectId, type, key, n.name() == null || n.name().isBlank() ? key : n.name().trim()));
            byId.put(n.id(), new Node(n.id(), type, key, n.name()));
        }
        int added = 0;
        for (Edge e : edges) {
            if (e == null || e.type() == null) continue;
            String type = e.type().trim().toUpperCase(Locale.ROOT);
            Long from = ids.get(e.from()), to = ids.get(e.to());
            if (from == null || to == null || from.equals(to) || !EDGE_TYPES.contains(type)) continue;
            // What a document says about the code is found through that document; the code's own structure through the map.
            Node f = byId.get(e.from());
            String src = "DOC".equals(f.type()) ? docItem.getOrDefault(f.key(), mapItem) : mapItem;
            store.insertEdge(projectId, from, to, type, src);
            added++;
        }
        int pruned = store.pruneEntities(projectId, OWN_TYPES);
        return Map.of("nodes", ids.size(), "edges", added, "docs", docItem.size(), "replaced", removed, "pruned", pruned);
    }

    private String add(NewItem item) {
        String id = store.insertItem(item);
        store.insertChunks(id, item.projectId(), Chunker.chunk(item.title(), item.content()));
        return id;
    }
}

package com.shipyard.platform.context.service;

import com.shipyard.platform.common.exception.BadRequestException;
import com.shipyard.platform.context.api.Dtos.Hit;
import com.shipyard.platform.context.api.Dtos.SearchRequest;
import com.shipyard.platform.context.api.Dtos.SearchResult;
import com.shipyard.platform.context.embedding.EmbeddingProvider;
import com.shipyard.platform.context.embedding.EmbeddingUnavailableException;
import com.shipyard.platform.context.store.MemoryStore;
import com.shipyard.platform.context.store.MemoryStore.ChunkHit;
import com.shipyard.platform.context.text.Fusion;
import com.shipyard.platform.context.text.Tsq;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;

/** Hybrid retrieval (spec §5.4): vector + keyword → RRF (lessons ×1.5) → one hit per item → +≤4 graph neighbours. */
@Service
public class SearchService {
    private static final Logger log = LoggerFactory.getLogger(SearchService.class);
    private static final int CANDIDATES = 30;
    private static final double MIN_VECTOR_SCORE = 0.05;
    private static final int GRAPH_EXTRA = 4;
    private static final Set<String> LESSONS = Set.of("FEEDBACK", "HUMAN_EDIT");

    private final MemoryStore store;
    private final EmbeddingProvider provider;

    public SearchService(MemoryStore store, EmbeddingProvider provider) {
        this.store = store;
        this.provider = provider;
    }

    public SearchResult search(SearchRequest req) {
        if (req.projectId() == null || req.projectId().isBlank()) throw new BadRequestException("projectId is required");
        String query = req.query() == null ? "" : req.query();
        int k = req.k() == null ? 8 : Math.max(1, Math.min(50, req.k()));
        List<String> kinds = req.kinds() == null ? List.of() : req.kinds();

        boolean degraded = false;
        List<ChunkHit> vector = List.of();
        if (!query.isBlank()) {
            try {
                vector = store.vectorSearch(req.projectId(), provider.embed(query), kinds, req.step(), req.excludeRunId(), MIN_VECTOR_SCORE, CANDIDATES);
            } catch (EmbeddingUnavailableException e) {
                degraded = true;
            } catch (RuntimeException e) {
                // Misconfigured model (wrong dimension, odd reply): degrade, never fail the caller (spec §8).
                log.error("query embedding failed, searching without vectors: {}", e.getMessage());
                degraded = true;
            }
        }
        String tsq = Tsq.build(query);
        List<ChunkHit> keyword = tsq == null ? List.of()
                : store.keywordSearch(req.projectId(), tsq, kinds, req.step(), req.excludeRunId(), CANDIDATES);

        Map<String, ChunkHit> byChunk = new HashMap<>();
        Map<String, Double> boosts = new HashMap<>();
        List<String> vIds = new ArrayList<>(), kIds = new ArrayList<>();
        for (ChunkHit h : vector) { String id = String.valueOf(h.chunkId()); vIds.add(id); byChunk.put(id, h); }
        for (ChunkHit h : keyword) { String id = String.valueOf(h.chunkId()); kIds.add(id); byChunk.putIfAbsent(id, h); }
        byChunk.forEach((id, h) -> { if (LESSONS.contains(h.kind())) boosts.put(id, 1.5); });

        List<Hit> hits = new ArrayList<>();
        Set<String> seenItems = new LinkedHashSet<>();
        Set<String> vSet = new HashSet<>(vIds), kSet = new HashSet<>(kIds);
        for (Map.Entry<String, Double> e : Fusion.rrf(List.of(vIds, kIds), boosts).entrySet()) {
            ChunkHit h = byChunk.get(e.getKey());
            if (!seenItems.add(h.itemId())) continue;
            String via = vSet.contains(e.getKey()) ? (kSet.contains(e.getKey()) ? "hybrid" : "vector") : "keyword";
            hits.add(new Hit(h.itemId(), h.chunkId(), h.kind(), h.title(), h.text(), e.getValue(), via, h.runId(), h.step()));
            if (hits.size() == k) break;
        }

        Set<Long> entities = new HashSet<>(store.entitiesMentioned(req.projectId(), query));
        entities.addAll(store.entitiesOfItems(seenItems));
        double floor = hits.isEmpty() ? 0.001 : hits.get(hits.size() - 1).score() * 0.5;
        for (MemoryStore.ItemRow i : store.relatedItems(req.projectId(), entities, seenItems, kinds, req.excludeRunId(), GRAPH_EXTRA)) {
            String text = i.content().length() > 600 ? i.content().substring(0, 600) + "…" : i.content();
            hits.add(new Hit(i.id(), 0, i.kind(), i.title(), text, floor, "graph", i.runId(), i.step()));
        }
        return new SearchResult(hits, degraded);
    }
}

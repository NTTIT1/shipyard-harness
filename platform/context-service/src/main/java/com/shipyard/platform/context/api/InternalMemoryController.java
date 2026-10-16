package com.shipyard.platform.context.api;

import com.shipyard.platform.common.dto.ApiResponse;
import com.shipyard.platform.common.exception.BadRequestException;
import com.shipyard.platform.common.exception.ResourceNotFoundException;
import com.shipyard.platform.context.api.Dtos.*;
import com.shipyard.platform.context.service.ContextPackService;
import com.shipyard.platform.context.service.IngestService;
import com.shipyard.platform.context.service.SearchService;
import com.shipyard.platform.context.store.MemoryStore;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Locale;

/** Service-to-service API (ServiceTokenFilter). */
@RestController
@RequestMapping("/internal/v1")
public class InternalMemoryController {
    private final IngestService ingest;
    private final SearchService search;
    private final MemoryStore store;
    private final ContextPackService packs;

    public InternalMemoryController(IngestService ingest, SearchService search, MemoryStore store, ContextPackService packs) {
        this.ingest = ingest;
        this.search = search;
        this.store = store;
        this.packs = packs;
    }

    /** project-service → here when a project is deleted. */
    @org.springframework.web.bind.annotation.DeleteMapping("/projects/{projectId}/memory")
    public ApiResponse<java.util.Map<String, Integer>> purge(@org.springframework.web.bind.annotation.PathVariable String projectId) {
        return ApiResponse.ok(store.purgeProject(projectId));
    }

    @PostMapping("/memory/events")
    public ApiResponse<EventResult> event(@RequestBody EventRequest req) {
        return ApiResponse.ok(new EventResult(ingest.ingest(req.eventId(), req.type(), req.payload())));
    }

    @PostMapping("/memory/search")
    public ApiResponse<SearchResult> search(@RequestBody SearchRequest req) {
        return ApiResponse.ok(search.search(req));
    }

    @GetMapping("/memory/items/{itemId}")
    public ApiResponse<MemoryStore.ItemRow> item(@PathVariable String itemId, @RequestParam String projectId) {
        return ApiResponse.ok(store.item(projectId, itemId).orElseThrow(() -> new ResourceNotFoundException("Memory item not found")));
    }

    @GetMapping("/memory/related")
    public ApiResponse<List<MemoryStore.Neighbor>> related(@RequestParam String projectId, @RequestParam String entity) {
        int i = entity.indexOf(':');
        if (i <= 0 || i == entity.length() - 1) throw new BadRequestException("entity must be TYPE:key");
        return ApiResponse.ok(store.neighbors(projectId, entity.substring(0, i).trim().toUpperCase(Locale.ROOT), entity.substring(i + 1)));
    }

    @PostMapping("/context-pack")
    public ApiResponse<Pack> pack(@RequestBody PackRequest req) {
        return ApiResponse.ok(packs.build(req));
    }
}

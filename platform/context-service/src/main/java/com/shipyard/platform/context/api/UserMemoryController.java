package com.shipyard.platform.context.api;

import com.shipyard.platform.common.directory.ProjectDirectory;
import com.shipyard.platform.common.dto.ApiResponse;
import com.shipyard.platform.common.exception.BadRequestException;
import com.shipyard.platform.common.exception.ForbiddenException;
import com.shipyard.platform.common.exception.ResourceNotFoundException;
import com.shipyard.platform.common.security.SecurityConstants;
import com.shipyard.platform.context.api.Dtos.DisableRequest;
import com.shipyard.platform.context.store.MemoryStore;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** Human memory browser (spec §5.6). Non-members get 404; only OWNER/MAINTAINER may disable items. */
@RestController
@RequestMapping("/api/v1/projects/{projectId}/memory")
public class UserMemoryController {
    private final MemoryStore store;
    private final ProjectDirectory directory;

    public UserMemoryController(MemoryStore store, ProjectDirectory directory) {
        this.store = store;
        this.directory = directory;
    }

    @GetMapping
    public ApiResponse<List<MemoryStore.ItemRow>> list(@RequestHeader(SecurityConstants.HEADER_USER_ID) String userId,
                                                       @PathVariable String projectId,
                                                       @RequestParam(required = false) String q,
                                                       @RequestParam(required = false) String kind,
                                                       @RequestParam(defaultValue = "50") int limit) {
        requireMember(projectId, userId);
        return ApiResponse.ok(store.listItems(projectId, q, kind, Math.max(1, Math.min(200, limit))));
    }

    /** The code & document map: best-connected entities (filter by type / text) and the edges among them. */
    @GetMapping("/graph")
    public ApiResponse<Map<String, Object>> graph(@RequestHeader(SecurityConstants.HEADER_USER_ID) String userId,
                                                  @PathVariable String projectId,
                                                  @RequestParam(required = false) String q,
                                                  @RequestParam(required = false) String type,
                                                  @RequestParam(defaultValue = "60") int limit) {
        requireMember(projectId, userId);
        List<MemoryStore.GraphNode> nodes = store.graphNodes(projectId, q, type == null ? null : type.trim().toUpperCase(java.util.Locale.ROOT),
                Math.max(1, Math.min(300, limit)));
        List<MemoryStore.GraphEdge> edges = store.graphEdges(projectId, nodes.stream().map(MemoryStore.GraphNode::id).toList());
        return ApiResponse.ok(Map.of("counts", store.graphCounts(projectId), "nodes", nodes, "edges", edges));
    }

    /** Everything one entity is connected to, with the item (document, plan, map) each link comes from. */
    @GetMapping("/graph/related")
    public ApiResponse<List<MemoryStore.Neighbor>> related(@RequestHeader(SecurityConstants.HEADER_USER_ID) String userId,
                                                          @PathVariable String projectId,
                                                          @RequestParam String type, @RequestParam String key) {
        requireMember(projectId, userId);
        return ApiResponse.ok(store.neighbors(projectId, type.trim().toUpperCase(java.util.Locale.ROOT), key));
    }

    @PatchMapping("/{itemId}")
    public ApiResponse<MemoryStore.ItemRow> setDisabled(@RequestHeader(SecurityConstants.HEADER_USER_ID) String userId,
                                                        @PathVariable String projectId, @PathVariable String itemId,
                                                        @RequestBody DisableRequest req) {
        List<String> roles = requireMember(projectId, userId);
        if (!roles.contains("OWNER") && !roles.contains("MAINTAINER")) throw new ForbiddenException("Only OWNER or MAINTAINER can change memory");
        if (req.disabled() == null) throw new BadRequestException("disabled is required");
        if (store.setDisabled(projectId, itemId, req.disabled()) == 0) throw new ResourceNotFoundException("Memory item not found");
        return ApiResponse.ok(store.item(projectId, itemId).orElseThrow());
    }

    @PostMapping("/reembed")
    public ApiResponse<Map<String, Integer>> reembed(@RequestHeader(value = SecurityConstants.HEADER_USER_ROLE, required = false) String sysRole,
                                                     @PathVariable String projectId) {
        if (!"SYS_ADMIN".equals(sysRole)) throw new ForbiddenException("SYS_ADMIN only");
        return ApiResponse.ok(Map.of("chunks", store.reembed(projectId)));
    }

    private List<String> requireMember(String projectId, String userId) {
        List<String> roles = directory.rolesOf(projectId, userId);
        if (roles.isEmpty()) throw new ResourceNotFoundException("Project not found");
        return roles;
    }
}

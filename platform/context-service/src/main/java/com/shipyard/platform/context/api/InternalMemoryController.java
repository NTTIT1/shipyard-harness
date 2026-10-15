package com.shipyard.platform.context.api;

import com.shipyard.platform.common.dto.ApiResponse;
import com.shipyard.platform.context.api.Dtos.*;
import com.shipyard.platform.context.service.IngestService;
import org.springframework.web.bind.annotation.*;

/** Service-to-service API (ServiceTokenFilter). */
@RestController
@RequestMapping("/internal/v1")
public class InternalMemoryController {
    private final IngestService ingest;

    public InternalMemoryController(IngestService ingest) {
        this.ingest = ingest;
    }

    @PostMapping("/memory/events")
    public ApiResponse<EventResult> event(@RequestBody EventRequest req) {
        return ApiResponse.ok(new EventResult(ingest.ingest(req.eventId(), req.type(), req.payload())));
    }
}

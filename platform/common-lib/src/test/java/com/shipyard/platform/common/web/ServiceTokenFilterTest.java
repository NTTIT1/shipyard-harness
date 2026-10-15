package com.shipyard.platform.common.web;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

class ServiceTokenFilterTest {

    private MockHttpServletResponse run(ServiceTokenFilter f, String path, String token) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", path);
        req.setServletPath(path);
        if (token != null) req.addHeader(ServiceTokenFilter.HEADER, token);
        MockHttpServletResponse res = new MockHttpServletResponse();
        f.doFilter(req, res, new MockFilterChain());
        return res;
    }

    @Test
    void internalPathNeedsMatchingToken() throws Exception {
        ServiceTokenFilter f = new ServiceTokenFilter("s3cret");
        assertThat(run(f, "/internal/v1/x", null).getStatus()).isEqualTo(401);
        assertThat(run(f, "/internal/v1/x", "wrong").getStatus()).isEqualTo(401);
        assertThat(run(f, "/internal/v1/x", "s3cret").getStatus()).isEqualTo(200);
    }

    @Test
    void publicPathsAreUntouched() throws Exception {
        assertThat(run(new ServiceTokenFilter("s3cret"), "/api/v1/projects", null).getStatus()).isEqualTo(200);
    }

    @Test
    void blankConfiguredTokenFailsClosed() throws Exception {
        assertThat(run(new ServiceTokenFilter(""), "/internal/v1/x", "").getStatus()).isEqualTo(401);
    }
}

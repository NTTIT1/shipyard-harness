package com.shipyard.platform.context.embedding;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OllamaEmbeddingProviderTest {
    HttpServer server;

    @AfterEach
    void stop() { if (server != null) server.stop(0); }

    private String serveVector(int dims, AtomicReference<String> body) throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/embed", ex -> {
            body.set(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            String vec = String.join(",", Collections.nCopies(dims, "0.5"));
            byte[] b = ("{\"model\":\"bge-m3\",\"embeddings\":[[" + vec + "]]}").getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(200, b.length);
            ex.getResponseBody().write(b);
            ex.close();
        });
        server.start();
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @Test
    void sendsModelAndInputAndParsesTheVector() throws Exception {
        AtomicReference<String> body = new AtomicReference<>();
        OllamaEmbeddingProvider p = new OllamaEmbeddingProvider(RestClient.builder(), serveVector(1024, body), "bge-m3");
        float[] v = p.embed("đăng xuất");
        assertThat(v).hasSize(1024);
        assertThat(v[0]).isEqualTo(0.5f);
        assertThat(body.get()).contains("\"model\":\"bge-m3\"").contains("\"input\":\"đăng xuất\"");
        assertThat(p.model()).isEqualTo("ollama:bge-m3");
    }

    @Test
    void wrongDimensionIsAConfigurationError() throws Exception {
        OllamaEmbeddingProvider p = new OllamaEmbeddingProvider(RestClient.builder(), serveVector(768, new AtomicReference<>()), "nomic");
        assertThatThrownBy(() -> p.embed("x")).isInstanceOf(IllegalStateException.class).hasMessageContaining("768");
    }

    @Test
    void unreachableOllamaIsUnavailable() {
        OllamaEmbeddingProvider p = new OllamaEmbeddingProvider(RestClient.builder(), "http://127.0.0.1:9", "bge-m3");
        assertThatThrownBy(() -> p.embed("x")).isInstanceOf(EmbeddingUnavailableException.class);
    }

    @Test
    void vectorLiteralIsPgvectorText() {
        assertThat(Vectors.literal(new float[]{0.25f, -1f})).isEqualTo("[0.25,-1.0]");
    }
}

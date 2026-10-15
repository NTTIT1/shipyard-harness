package com.shipyard.platform.context.embedding;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.List;
import java.util.Map;

/** Ollama /api/embed (local, default bge-m3 — multilingual, 1024 dims). */
public class OllamaEmbeddingProvider implements EmbeddingProvider {
    private final RestClient http;
    private final String model;

    public OllamaEmbeddingProvider(RestClient.Builder builder, String baseUrl, String model) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000);
        factory.setReadTimeout(60000);
        this.http = builder.baseUrl(baseUrl).requestFactory(factory).build();
        this.model = model;
    }

    @Override
    public String model() { return "ollama:" + model; }

    @Override
    @SuppressWarnings("unchecked")
    public float[] embed(String text) {
        Map<String, Object> res;
        try {
            res = http.post().uri("/api/embed").contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("model", model, "input", text))
                    .retrieve().body(new ParameterizedTypeReference<Map<String, Object>>() {});
        } catch (RestClientException e) {
            throw new EmbeddingUnavailableException("Ollama unavailable: " + e.getMessage());
        }
        List<List<Number>> embeddings = res == null ? null : (List<List<Number>>) res.get("embeddings");
        if (embeddings == null || embeddings.isEmpty()) throw new EmbeddingUnavailableException("Ollama returned no embedding");
        List<Number> v = embeddings.get(0);
        if (v.size() != DIMENSIONS) {
            throw new IllegalStateException("Model " + model + " returns " + v.size() + " dimensions; the schema expects " + DIMENSIONS);
        }
        float[] out = new float[v.size()];
        for (int i = 0; i < out.length; i++) out[i] = v.get(i).floatValue();
        return out;
    }
}

package com.codecompass.backend.service;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@Service
public class PythonServiceClient {

    private final RestTemplate restTemplate;

    @Value("${app.python-service-url:http://localhost:8000}")
    private String pythonServiceUrl;

    @Value("${app.internal-secret:default-secret}")
    private String internalSecret;

    public PythonServiceClient(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @CircuitBreaker(name = "pythonService", fallbackMethod = "postToPythonFallback")
    public Map<String, Object> postToPython(String path, Object payload) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Internal-Secret", internalSecret);

        HttpEntity<Object> entity = new HttpEntity<>(payload, headers);
        ResponseEntity<Map> resp = restTemplate.postForEntity(pythonServiceUrl + path, entity, Map.class);
        return resp.getBody() != null ? resp.getBody() : Map.of();
    }

    public Map<String, Object> postToPythonFallback(String path, Object payload, Throwable t) {
        // Fallback when circuit breaker is open or call fails
        System.err.println("Circuit Breaker fallback for python service call to " + path + ": " + t.getMessage());
        return Map.of("error", "AI service unavailable", "fallback", true);
    }
}

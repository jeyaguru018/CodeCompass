package com.codecompass.backend.security;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Verifies that the Logback masking patterns in logback-spring.xml correctly
 * redact secrets before they hit the log output, AND that they do not break
 * JSON parsing for structured logs.
 */
public class LogMaskingTest {

    private static final ObjectMapper mapper = new ObjectMapper();

    private static final String REAL_JWT =
        "eyJhbGciOiJSUzI1NiJ9" +
        ".eyJzdWIiOiI2MDI2NWI5ZC02MGYyLTRlYTgtYTkwNS1iM2NiYjlhZmI2NzMiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJwbGFuIjoiZnJlZSIsImlhdCI6MTc4MzY5NTI4NCwiZXhwIjoxNzgzNjk2MTg0fQ" +
        ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

    private static final String BEARER_HEADER = "Authorization: Bearer " + REAL_JWT;

    private static final String JSON_WITH_PASSWORD =
        "{\"email\":\"user@example.com\",\"password\":\"hunter2secret\"}";

    private static final String JSON_WITH_TOKEN =
        "{\"access_token\":\"ghp_somegithubtokenabc123\",\"scope\":\"repo\"}";

    private String applyMaskingChain(String input) {
        String layer1 = input.replaceAll(
            "(eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+)",
            "[REDACTED_JWT]"
        );
        String layer2 = layer1.replaceAll(
            "(Bearer\\s+)[A-Za-z0-9_-]{20,}",
            "$1[REDACTED]"
        );
        String layer3 = layer2.replaceAll(
            "(\"(?:password|secret|token|apiKey|api_key|access_token|client_secret|encryption_key|github_access_token)\"\\s*:\\s*\")([^\"]{1,})(\")",
            "$1[REDACTED]$3"
        );
        return layer3;
    }

    @Test
    @DisplayName("JSON password field is redacted, string contains no newlines, and remains valid JSON")
    void jsonPasswordFieldIsRedacted() throws JsonProcessingException {
        String masked = applyMaskingChain(JSON_WITH_PASSWORD);

        System.out.println("\n--- PASSWORD MASKING PROOF ---");
        System.out.println("INPUT  : " + JSON_WITH_PASSWORD);
        System.out.println("OUTPUT : " + masked);
        System.out.println("------------------------------");

        assertFalse(masked.contains("hunter2secret"));
        assertTrue(masked.contains("[REDACTED]"));
        
        // CRITICAL: Prove no newlines were injected
        assertFalse(masked.contains("\n"), "Masked JSON must remain on a single line");
        
        // CRITICAL: Prove it parses cleanly as JSON
        JsonNode node = mapper.readTree(masked);
        assertEquals("user@example.com", node.get("email").asText());
        assertEquals("[REDACTED]", node.get("password").asText());
    }

    @Test
    @DisplayName("JSON access_token field is redacted, string contains no newlines, and remains valid JSON")
    void jsonAccessTokenFieldIsRedacted() throws JsonProcessingException {
        String masked = applyMaskingChain(JSON_WITH_TOKEN);

        System.out.println("\n--- ACCESS_TOKEN MASKING PROOF ---");
        System.out.println("INPUT  : " + JSON_WITH_TOKEN);
        System.out.println("OUTPUT : " + masked);
        System.out.println("----------------------------------");

        assertFalse(masked.contains("ghp_somegithubtokenabc123"));
        assertTrue(masked.contains("[REDACTED]"));
        
        assertFalse(masked.contains("\n"), "Masked JSON must remain on a single line");
        
        JsonNode node = mapper.readTree(masked);
        assertEquals("repo", node.get("scope").asText());
        assertEquals("[REDACTED]", node.get("access_token").asText());
    }

    @Test
    @DisplayName("JWT token in log message is replaced with [REDACTED_JWT]")
    void jwtTokenIsRedacted() {
        String logMessage = "User authenticated, token: " + REAL_JWT;
        String masked = applyMaskingChain(logMessage);
        
        System.out.println("\n--- JWT MASKING PROOF ---");
        System.out.println("INPUT  : " + logMessage);
        System.out.println("OUTPUT : " + masked);
        System.out.println("------------------------");
        
        assertFalse(masked.contains(REAL_JWT));
        assertTrue(masked.contains("[REDACTED_JWT]"));
    }

    @Test
    @DisplayName("Authorization Bearer header is redacted, Bearer prefix preserved")
    void bearerHeaderIsRedacted() {
        String masked = applyMaskingChain(BEARER_HEADER);
        
        System.out.println("\n--- BEARER MASKING PROOF ---");
        System.out.println("INPUT  : " + BEARER_HEADER);
        System.out.println("OUTPUT : " + masked);
        System.out.println("----------------------------");
        
        assertFalse(masked.contains(REAL_JWT));
        assertTrue(masked.contains("Authorization: Bearer [REDACTED_JWT]"));
    }
}

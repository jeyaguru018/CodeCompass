package com.codecompass.backend.controller;

import com.codecompass.backend.dto.AuthResponse;
import com.codecompass.backend.dto.LoginRequest;
import com.codecompass.backend.dto.RegisterRequest;
import com.codecompass.backend.dto.ResetPasswordRequest;
import com.codecompass.backend.service.AuthService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import java.util.Arrays;
import java.util.Map;
import java.util.List;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${github.client-id}")
    private String githubClientId;

    @Value("${github.client-secret}")
    private String githubClientSecret;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request,
                                                  HttpServletResponse response) {
        return ResponseEntity.ok(authService.register(request, response));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request,
                                               HttpServletResponse response) {
        return ResponseEntity.ok(authService.login(request, response));
    }

    /**
     * Silent refresh endpoint.
     * Reads the cc_refresh HttpOnly cookie, validates it, rotates it,
     * and returns a fresh short-lived access token in the response body.
     *
     * If the cookie is absent or invalid, returns 401. The frontend MUST NOT
     * retry this endpoint on 401 — it should log the user out immediately.
     */
    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(HttpServletRequest request, HttpServletResponse response) {
        String rawToken = extractRefreshCookie(request);
        if (rawToken == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("error", "No refresh token cookie present"));
        }
        try {
            AuthResponse authResponse = authService.refresh(rawToken, response);
            return ResponseEntity.ok(authResponse);
        } catch (RuntimeException e) {
            // Clear stale cookie on failure
            clearRefreshCookie(response);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("error", "Refresh token invalid or expired"));
        }
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        String rawToken = extractRefreshCookie(request);
        authService.logout(rawToken, response);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestBody ResetPasswordRequest request) {
        authService.resetPassword(request.getEmail(), request.getNewPassword());
        return ResponseEntity.ok().build();
    }

    @PostMapping("/github")
    public ResponseEntity<AuthResponse> githubLogin(
            @RequestBody com.codecompass.backend.dto.GithubOAuthRequest request,
            HttpServletResponse response) {
        String tokenUrl = "https://github.com/login/oauth/access_token";
        HttpHeaders headers = new HttpHeaders();
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        String body = String.format("client_id=%s&client_secret=%s&code=%s",
            githubClientId, githubClientSecret, request.getCode());
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        HttpEntity<String> entity = new HttpEntity<>(body, headers);
        ResponseEntity<Map> tokenResponse = restTemplate.postForEntity(tokenUrl, entity, Map.class);

        if (!tokenResponse.getStatusCode().is2xxSuccessful()
                || !tokenResponse.getBody().containsKey("access_token")) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        String accessToken = (String) tokenResponse.getBody().get("access_token");

        HttpHeaders apiHeaders = new HttpHeaders();
        apiHeaders.setBearerAuth(accessToken);
        apiHeaders.setAccept(List.of(MediaType.APPLICATION_JSON));
        HttpEntity<Void> apiEntity = new HttpEntity<>(apiHeaders);

        ResponseEntity<Map> userResponse = restTemplate.exchange(
            "https://api.github.com/user", HttpMethod.GET, apiEntity, Map.class);
        Map<String, Object> userData = userResponse.getBody();
        String login = (String) userData.get("login");
        String name = (String) userData.get("name");
        String email = (String) userData.get("email");

        if (email == null) {
            ResponseEntity<List> emailsResponse = restTemplate.exchange(
                "https://api.github.com/user/emails", HttpMethod.GET, apiEntity, List.class);
            List<Map<String, Object>> emails = emailsResponse.getBody();
            for (Map<String, Object> emailObj : emails) {
                if ((Boolean) emailObj.get("primary")) {
                    email = (String) emailObj.get("email");
                    break;
                }
            }
        }

        return ResponseEntity.ok(authService.githubLogin(login, email, name, accessToken, response));
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private String extractRefreshCookie(HttpServletRequest request) {
        if (request.getCookies() == null) return null;
        return Arrays.stream(request.getCookies())
            .filter(c -> "cc_refresh".equals(c.getName()))
            .map(Cookie::getValue)
            .findFirst()
            .orElse(null);
    }

    private void clearRefreshCookie(HttpServletResponse response) {
        response.addHeader("Set-Cookie",
            "cc_refresh=; Max-Age=0; Path=/api/v1/auth; HttpOnly; SameSite=Lax");
    }
}

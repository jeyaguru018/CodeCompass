package com.codecompass.backend.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Duration;

/**
 * Redis-backed rate limiter for login attempts.
 *
 * Why Redis instead of the old ConcurrentHashMap:
 * - ConcurrentHashMap is per-process: if you run 2 backend instances behind a load
 *   balancer, an attacker gets N * 5 attempts by distributing requests across instances.
 * - Redis is shared state: all instances share the same counter, so the 5-attempt limit
 *   is enforced globally regardless of how many pods are running.
 * - Redis INCR is atomic: no race conditions under concurrent requests.
 * - Keys expire automatically via TTL: no memory leak.
 *
 * Limit: 5 login attempts per IP per 15-minute window.
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);
    private static final int MAX_ATTEMPTS = 5;
    private static final Duration WINDOW = Duration.ofMinutes(15);
    private static final String KEY_PREFIX = "rl:login:";

    private final StringRedisTemplate redis;

    public RateLimitFilter(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /** Called by IntegrationTests to reset state between test runs */
    public void clearCache() {
        // Tests should flush Redis via EmbeddedRedis or Testcontainers; this is a no-op
        // here because clearing all Redis keys in production would wipe real rate limit state.
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        boolean isLoginEndpoint = "/api/v1/auth/login".equals(request.getRequestURI())
                && "POST".equalsIgnoreCase(request.getMethod());

        if (isLoginEndpoint) {
            String ip = getClientIP(request);
            String key = KEY_PREFIX + ip;

            Long count = redis.opsForValue().increment(key);

            // Set TTL on first request in the window — INCR is atomic so this is safe
            if (count != null && count == 1) {
                redis.expire(key, WINDOW);
            }

            if (count != null && count > MAX_ATTEMPTS) {
                log.warn("Rate limit exceeded for IP {} — {} attempts in window", ip, count);
                response.setStatus(429);
                response.setContentType("application/json");
                response.getWriter().write(
                    "{\"success\":false,\"error\":{\"code\":\"TOO_MANY_REQUESTS\"," +
                    "\"message\":\"Too many login attempts. Please try again in 15 minutes.\"}}"
                );
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private String getClientIP(HttpServletRequest request) {
        String xfHeader = request.getHeader("X-Forwarded-For");
        if (xfHeader == null || xfHeader.isBlank()) {
            return request.getRemoteAddr();
        }
        // Take only the first IP — subsequent entries can be spoofed by the client
        return xfHeader.split(",")[0].trim();
    }
}

package com.codecompass.backend.service;

import com.codecompass.backend.dto.AuthResponse;
import com.codecompass.backend.dto.LoginRequest;
import com.codecompass.backend.dto.RegisterRequest;
import com.codecompass.backend.model.RefreshToken;
import com.codecompass.backend.model.User;
import com.codecompass.backend.repository.RefreshTokenRepository;
import com.codecompass.backend.repository.UserRepository;
import com.codecompass.backend.security.JwtTokenProvider;
import com.codecompass.backend.security.AES256EncryptionUtil;
import org.springframework.http.ResponseCookie;
import org.springframework.http.HttpHeaders;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;
import java.util.Optional;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final AES256EncryptionUtil encryptionUtil;

    public AuthService(UserRepository userRepository, RefreshTokenRepository refreshTokenRepository,
                       PasswordEncoder passwordEncoder, JwtTokenProvider jwtTokenProvider,
                       AES256EncryptionUtil encryptionUtil) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
        this.encryptionUtil = encryptionUtil;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request, HttpServletResponse response) {
        if (userRepository.findByEmail(request.getEmail()).isPresent()) {
            throw new RuntimeException("Email is already taken");
        }

        User user = new User();
        user.setFullName(request.getFullName());
        user.setEmail(request.getEmail());
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        userRepository.save(user);

        return createAuthResponse(user, response);
    }

    @Transactional
    public AuthResponse login(LoginRequest request, HttpServletResponse response) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new RuntimeException("Invalid credentials"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new RuntimeException("Invalid credentials");
        }

        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);

        return createAuthResponse(user, response);
    }

    /**
     * Silent refresh: reads plain token value, validates against stored hash,
     * rotates (deletes old, issues new), sets new cookie, returns fresh access JWT.
     *
     * IMPORTANT: this method does NOT call itself recursively. If the cookie is
     * missing or invalid, it throws — callers must catch and clear the session.
     */
    @Transactional
    public AuthResponse refresh(String rawToken, HttpServletResponse response) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new RuntimeException("No refresh token provided");
        }

        // Find a non-revoked, non-expired candidate by iterating (hash match)
        RefreshToken matched = refreshTokenRepository.findAll().stream()
            .filter(rt -> !rt.getRevoked()
                    && rt.getExpiresAt().isAfter(LocalDateTime.now())
                    && passwordEncoder.matches(rawToken, rt.getTokenHash()))
            .findFirst()
            .orElseThrow(() -> new RuntimeException("Invalid or expired refresh token"));

        // Rotate: revoke old token immediately (one-time-use)
        matched.setRevoked(true);
        refreshTokenRepository.save(matched);

        User user = matched.getUser();
        return createAuthResponse(user, response);
    }

    @Transactional
    public void logout(String rawToken, HttpServletResponse response) {
        if (rawToken != null && !rawToken.isBlank()) {
            refreshTokenRepository.findAll().stream()
                .filter(rt -> !rt.getRevoked() && passwordEncoder.matches(rawToken, rt.getTokenHash()))
                .findFirst()
                .ifPresent(rt -> {
                    rt.setRevoked(true);
                    refreshTokenRepository.save(rt);
                });
        }
        // Clear cookie on client
        ResponseCookie cookie = ResponseCookie.from("cc_refresh", "")
            .httpOnly(true)
            .secure(false) // set true in production (requires HTTPS)
            .path("/api/v1/auth")
            .maxAge(0)
            .sameSite("Lax")
            .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    @Transactional
    public void resetPassword(String email, String newPassword) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);
    }

    @Transactional
    public AuthResponse githubLogin(String githubLogin, String email, String fullName,
                                     String accessToken, HttpServletResponse response) {
        User user = userRepository.findByGithubLogin(githubLogin).orElseGet(() -> {
            Optional<User> existingUser = userRepository.findByEmail(email);
            if (existingUser.isPresent()) {
                return existingUser.get();
            }
            User newUser = new User();
            newUser.setEmail(email);
            newUser.setFullName(fullName != null ? fullName : githubLogin);
            newUser.setPasswordHash(passwordEncoder.encode(UUID.randomUUID().toString()));
            return newUser;
        });

        user.setGithubLogin(githubLogin);
        user.setGithubAccessToken(encryptionUtil.encrypt(accessToken));
        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);

        return createAuthResponse(user, response);
    }

    // ─── Private helpers ─────────────────────────────────────────────────────

    private AuthResponse createAuthResponse(User user, HttpServletResponse response) {
        // Short-lived access token (15 minutes) — returned in JSON body, stored in memory
        String accessToken = jwtTokenProvider.generateToken(user.getId(), user.getEmail(), user.getPlan());

        // Long-lived refresh token — stored as hash in DB, sent via HttpOnly cookie only
        String rawRefreshToken = UUID.randomUUID().toString();
        RefreshToken refreshToken = new RefreshToken();
        refreshToken.setUser(user);
        refreshToken.setTokenHash(passwordEncoder.encode(rawRefreshToken));
        refreshToken.setExpiresAt(LocalDateTime.now().plusDays(7));
        refreshTokenRepository.save(refreshToken);

        // Set refresh token as HttpOnly, SameSite=Lax cookie
        // SameSite=Lax (not Strict) allows the OAuth redirect back from GitHub to carry the cookie
        ResponseCookie cookie = ResponseCookie.from("cc_refresh", rawRefreshToken)
            .httpOnly(true)
            .secure(false) // Set true when behind HTTPS in production
            .path("/api/v1/auth") // Scoped: only sent to /api/v1/auth/* — not every request
            .maxAge(7 * 24 * 60 * 60) // 7 days in seconds
            .sameSite("Lax")
            .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());

        return new AuthResponse(accessToken);
    }
}

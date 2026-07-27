package com.codecompass.backend;

import com.codecompass.backend.model.*;
import com.codecompass.backend.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests running against a real PostgreSQL Testcontainer.
 *
 * Tests verified:
 *   1. CASCADE DELETE — deleting a repository must wipe all 8 dependent tables
 *   2. RATE LIMITER   — the 6th login within 15 minutes must return 429
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "encryption.key=01234567890123456789012345678901",
    "github.client-id=test-client-id",
    "github.client-secret=test-client-secret",
    "spring.flyway.baseline-on-migrate=true"
})
@AutoConfigureMockMvc
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
public class IntegrationTests {

    static {
        try {
            java.security.KeyPairGenerator kpg = java.security.KeyPairGenerator.getInstance("RSA");
            kpg.initialize(2048);
            java.security.KeyPair kp = kpg.generateKeyPair();
            System.setProperty("jwt.private-key", Base64.getEncoder().encodeToString(kp.getPrivate().getEncoded()));
            System.setProperty("jwt.public-key", Base64.getEncoder().encodeToString(kp.getPublic().getEncoded()));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }


    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired UserRepository userRepository;
    @Autowired RepositoryRepository repositoryRepository;
    @Autowired RepoFileRepository repoFileRepository;
    @Autowired RepoFunctionRepository repoFunctionRepository;
    @Autowired DependencyEdgeRepository dependencyEdgeRepository;
    @Autowired OnboardingStepRepository onboardingStepRepository;
    @Autowired UserOnboardingProgressRepository progressRepository;
    @Autowired ChatSessionRepository chatSessionRepository;
    @Autowired ChatMessageRepository chatMessageRepository;
    @Autowired RefreshTokenRepository refreshTokenRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactionManager;
    @Autowired org.springframework.data.redis.core.StringRedisTemplate redisTemplate;
    @Autowired com.codecompass.backend.security.RateLimitFilter rateLimitFilter;

    @BeforeEach
    void cleanDb() {
        try {
            Objects.requireNonNull(redisTemplate.getConnectionFactory()).getConnection().serverCommands().flushDb();
        } catch (Exception e) {}
        try {
            rateLimitFilter.clearCache();
        } catch (Exception e) {}
        new org.springframework.transaction.support.TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            // Clean up any leftovers from previous test executions to avoid unique constraint violations
            userRepository.findByEmail("cascade-test@codecompass.dev").ifPresent(u -> {
                repositoryRepository.findByUserId(u.getId()).forEach(r -> {
                    chatSessionRepository.findByUserIdAndRepositoryIdOrderByLastMessageAtDesc(u.getId(), r.getId()).forEach(s -> {
                        chatMessageRepository.findBySessionIdOrderByCreatedAtAsc(s.getId()).forEach(chatMessageRepository::delete);
                        chatSessionRepository.delete(s);
                    });
                    onboardingStepRepository.findByRepositoryIdOrderByStepOrder(r.getId()).forEach(step -> {
                        progressRepository.deleteByStepId(step.getId());
                        onboardingStepRepository.delete(step);
                    });
                    dependencyEdgeRepository.deleteByRepositoryId(r.getId());
                    repoFunctionRepository.findByRepositoryId(r.getId()).forEach(repoFunctionRepository::delete);
                    repoFileRepository.findByRepositoryId(r.getId()).forEach(repoFileRepository::delete);
                    repositoryRepository.delete(r);
                });
                refreshTokenRepository.deleteByUserId(u.getId());
                userRepository.delete(u);
            });
            userRepository.findByEmail("ratelimit-test@codecompass.dev").ifPresent(u -> {
                refreshTokenRepository.deleteByUserId(u.getId());
                userRepository.delete(u);
            });
        });
    }

    // ─── Test 1: CASCADE DELETE ───────────────────────────────────────────────

    @Test
    @Order(1)
    @DisplayName("DELETE /api/v1/repos/{id} must wipe all 8 dependent tables")
    void cascadeDeleteWipesAllDependentTables() throws Exception {
        // ── Setup: create user + repo + one record in each of the 8 dependent tables ──

        User user = new User();
        user.setEmail("cascade-test@codecompass.dev");
        user.setFullName("Cascade Test");
        user.setPasswordHash(passwordEncoder.encode("password123"));
        userRepository.save(user);

        Repository repo = new Repository();
        repo.setUser(user);
        repo.setGithubUrl("https://github.com/test/cascade-repo");
        repo.setGithubOwner("test");
        repo.setGithubName("cascade-repo");
        repo.setStatus("COMPLETED");
        repositoryRepository.save(repo);

        // 1. RepoFile
        RepoFile file = new RepoFile();
        file.setRepository(repo);
        file.setFilePath("src/index.ts");
        file.setFileName("index.ts");
        file.setLanguage("TypeScript");
        repoFileRepository.save(file);


        // 2. RepoFunction
        RepoFunction func = new RepoFunction();
        func.setFile(file);
        func.setRepository(repo);
        func.setFunctionName("main");
        func.setStartLine(1);
        func.setEndLine(10);
        repoFunctionRepository.save(func);

        // 3. DependencyEdge
        DependencyEdge edge = new DependencyEdge();
        edge.setRepository(repo);
        edge.setSourceFile(file);
        edge.setImportStatement("import './utils'");
        edge.setIsExternal(true);
        dependencyEdgeRepository.save(edge);

        // 4. OnboardingStep
        OnboardingStep step = new OnboardingStep();
        step.setRepository(repo);
        step.setFile(file);
        step.setStepOrder(1);
        step.setReason("Start here");
        step.setEstimatedMinutes(5);
        onboardingStepRepository.save(step);

        // 5. UserOnboardingProgress
        UserOnboardingProgress progress = new UserOnboardingProgress();
        progress.setUser(user);
        progress.setStep(step);
        progress.setCompletedAt(LocalDateTime.now());
        progressRepository.save(progress);

        // 6. ChatSession
        ChatSession session = new ChatSession();
        session.setUser(user);
        session.setRepository(repo);
        session.setTitle("Test session");
        chatSessionRepository.save(session);

        // 7. ChatMessage
        ChatMessage message = new ChatMessage();
        message.setSession(session);
        message.setRole("user");
        message.setContent("How does this work?");
        chatMessageRepository.save(message);

        UUID repoId = repo.getId();
        UUID sessionId = session.getId();
        UUID stepId = step.getId();

        // ── Verify all records exist before deletion ──
        assertTrue(repoFileRepository.findByRepositoryId(repoId).size() > 0);
        assertTrue(repoFunctionRepository.findByRepositoryId(repoId).size() > 0);
        assertFalse(chatSessionRepository.findByUserIdAndRepositoryIdOrderByLastMessageAtDesc(user.getId(), repoId).isEmpty());
        assertFalse(chatMessageRepository.findBySessionIdOrderByCreatedAtAsc(sessionId).isEmpty());
        assertFalse(onboardingStepRepository.findByRepositoryIdOrderByStepOrder(repoId).isEmpty());
        assertTrue(progressRepository.findByUserIdAndStepId(user.getId(), stepId).isPresent());

        // ── Login to get a JWT ──
        String loginBody = objectMapper.writeValueAsString(Map.of(
            "email", "cascade-test@codecompass.dev",
            "password", "password123"
        ));
        MvcResult loginResult = mockMvc.perform(post("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(loginBody))
            .andExpect(status().isOk())
            .andReturn();

        Map<String, Object> loginResponse = objectMapper.readValue(
            loginResult.getResponse().getContentAsString(), Map.class);
        String jwt = (String) loginResponse.get("token");

        // ── Call DELETE /api/v1/repos/{id} ──
        mockMvc.perform(delete("/api/v1/repos/" + repoId)
                .header("Authorization", "Bearer " + jwt))
            .andExpect(status().isNoContent());

        // ── Assert ALL 8 dependent tables are now empty for this repo ──

        // 1. Repository itself
        assertFalse(repositoryRepository.findById(repoId).isPresent(),
            "Repository must be deleted");

        // 2. RepoFile
        assertEquals(0, repoFileRepository.findByRepositoryId(repoId).size(),
            "repo_files must be empty after cascade delete");

        // 3. RepoFunction
        assertEquals(0, repoFunctionRepository.findByRepositoryId(repoId).size(),
            "repo_functions must be empty after cascade delete");

        // 4. DependencyEdge  (query by repo ID via source file)
        assertEquals(0, dependencyEdgeRepository.findByRepositoryId(repoId).size(),
            "dependency_edges must be empty after cascade delete");

        // 5. OnboardingStep
        assertEquals(0, onboardingStepRepository.findByRepositoryIdOrderByStepOrder(repoId).size(),
            "onboarding_steps must be empty after cascade delete");

        // 6. UserOnboardingProgress
        assertFalse(progressRepository.findByUserIdAndStepId(user.getId(), stepId).isPresent(),
            "user_onboarding_progress must be empty after cascade delete");

        // 7. ChatSession
        assertEquals(0, chatSessionRepository.findByUserIdAndRepositoryIdOrderByLastMessageAtDesc(user.getId(), repoId).size(),
            "chat_sessions must be empty after cascade delete");

        // 8. ChatMessage (querying directly via session ID)
        assertEquals(0, chatMessageRepository.findBySessionIdOrderByCreatedAtAsc(sessionId).size(),
            "chat_messages must be empty after cascade delete");
    }

    // ─── Test 2: RATE LIMITER ─────────────────────────────────────────────────

    @Test
    @Order(2)
    @DisplayName("6th login attempt within 15 minutes must return HTTP 429")
    void rateLimiterRejectsExcessiveLoginAttempts() throws Exception {
        // Create a user so we have valid credentials to fire at
        User rateLimitUser = new User();
        rateLimitUser.setEmail("ratelimit-test@codecompass.dev");
        rateLimitUser.setFullName("Rate Limit Test");
        rateLimitUser.setPasswordHash(passwordEncoder.encode("CorrectPassword123"));
        userRepository.save(rateLimitUser);

        String loginBody = objectMapper.writeValueAsString(Map.of(
            "email", "ratelimit-test@codecompass.dev",
            "password", "CorrectPassword123"
        ));

        // Attempts 1–5: must succeed with 200
        for (int i = 1; i <= 5; i++) {
            mockMvc.perform(post("/api/v1/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(loginBody))
                .andExpect(status().isOk());
        }

        // Attempt 6: must be rejected with 429 Too Many Requests
        mockMvc.perform(post("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(loginBody))
            .andExpect(status().isTooManyRequests());
    }
    // ─── Test 3: BLANKET IDOR AUDIT ───────────────────────────────────────────

    @Test
    @Order(3)
    @DisplayName("Cross-user access to protected endpoints must return HTTP 403")
    void blanketIdorAuditRejectsCrossUserAccess() throws Exception {
        // Create user A and their repo
        User userA = new User();
        userA.setEmail("userA@codecompass.dev");
        userA.setPasswordHash(passwordEncoder.encode("passA"));
        userRepository.save(userA);

        Repository repoA = new Repository();
        repoA.setUser(userA);
        repoA.setGithubOwner("ownerA");
        repoA.setGithubName("repoA");
        repoA.setStatus("COMPLETED");
        repositoryRepository.save(repoA);
        UUID repoIdA = repoA.getId();

        // Create user B
        User userB = new User();
        userB.setEmail("userB@codecompass.dev");
        userB.setPasswordHash(passwordEncoder.encode("passB"));
        userRepository.save(userB);

        // Login as user B
        String loginBodyB = objectMapper.writeValueAsString(Map.of(
            "email", "userB@codecompass.dev",
            "password", "passB"
        ));
        MvcResult loginResultB = mockMvc.perform(post("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(loginBodyB))
            .andExpect(status().isOk())
            .andReturn();
        String jwtB = (String) objectMapper.readValue(loginResultB.getResponse().getContentAsString(), Map.class).get("token");

        // User B attempts to access User A's repo endpoints
        String[] endpointsToTest = {
            "/api/v1/repos/" + repoIdA + "/architecture",
            "/api/v1/repos/" + repoIdA + "/adr",
            "/api/v1/repos/" + repoIdA + "/reanalyze"
        };

        for (String endpoint : endpointsToTest) {
            mockMvc.perform(get(endpoint)
                    .header("Authorization", "Bearer " + jwtB))
                .andExpect(status().isForbidden());
        }

        // Test POST endpoint for Diff
        mockMvc.perform(post("/api/v1/diff/explain")
                .header("Authorization", "Bearer " + jwtB)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"repoId\":\"" + repoIdA + "\",\"diffText\":\"something\"}"))
            .andExpect(status().isForbidden());
    }
}

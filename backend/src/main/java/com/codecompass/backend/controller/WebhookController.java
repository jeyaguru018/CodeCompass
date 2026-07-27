package com.codecompass.backend.controller;

import com.codecompass.backend.model.Repository;
import com.codecompass.backend.repository.*;
import com.codecompass.backend.service.AnalysisService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.CacheManager;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/webhooks")
public class WebhookController {

    private final RepositoryRepository repositoryRepository;
    private final AnalysisService analysisService;
    private final RepoFileRepository repoFileRepository;
    private final RepoFunctionRepository repoFunctionRepository;
    private final DependencyEdgeRepository dependencyEdgeRepository;
    private final OnboardingStepRepository onboardingStepRepository;
    private final ChatSessionRepository chatSessionRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final UserOnboardingProgressRepository progressRepository;
    private final CacheManager cacheManager;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${app.webhook-secret:}")
    private String webhookSecret;

    public WebhookController(RepositoryRepository repositoryRepository,
                             AnalysisService analysisService,
                             RepoFileRepository repoFileRepository,
                             RepoFunctionRepository repoFunctionRepository,
                             DependencyEdgeRepository dependencyEdgeRepository,
                             OnboardingStepRepository onboardingStepRepository,
                             ChatSessionRepository chatSessionRepository,
                             ChatMessageRepository chatMessageRepository,
                             UserOnboardingProgressRepository progressRepository,
                             CacheManager cacheManager) {
        this.repositoryRepository = repositoryRepository;
        this.analysisService = analysisService;
        this.repoFileRepository = repoFileRepository;
        this.repoFunctionRepository = repoFunctionRepository;
        this.dependencyEdgeRepository = dependencyEdgeRepository;
        this.onboardingStepRepository = onboardingStepRepository;
        this.chatSessionRepository = chatSessionRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.progressRepository = progressRepository;
        this.cacheManager = cacheManager;
    }

    @PostMapping("/github")
    public ResponseEntity<?> handleGithubWebhook(
            @RequestHeader(value = "X-Hub-Signature-256", required = false) String signature,
            @RequestHeader(value = "X-GitHub-Event", required = false) String eventType,
            @RequestBody String payload) {

        if (webhookSecret == null || webhookSecret.isBlank()) {
            return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).body("Webhook secret not configured.");
        }

        if (signature == null || !verifySignature(payload, signature, webhookSecret)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Invalid signature.");
        }

        if (!"push".equals(eventType) && !"pull_request".equals(eventType)) {
            return ResponseEntity.ok("Event ignored.");
        }

        try {
            JsonNode root = objectMapper.readTree(payload);
            JsonNode repoNode = root.path("repository");
            if (repoNode.isMissingNode()) {
                return ResponseEntity.badRequest().body("No repository object in payload.");
            }

            String owner = repoNode.path("owner").path("login").asText();
            String name = repoNode.path("name").asText();

            List<Repository> repos = repositoryRepository.findByGithubOwnerAndGithubName(owner, name);
            if (repos.isEmpty()) {
                return ResponseEntity.ok("Repository not tracked by any user.");
            }

            for (Repository repo : repos) {
                reanalyzeRepo(repo);
            }

            return ResponseEntity.ok(Map.of("message", "Re-analysis triggered for " + repos.size() + " repositories."));

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Error processing webhook.");
        }
    }

    private void reanalyzeRepo(Repository repo) {
        UUID repoId = repo.getId();
        UUID userId = repo.getUser().getId();

        // Clear existing data (wipe)
        chatSessionRepository.findByUserIdAndRepositoryIdOrderByLastMessageAtDesc(userId, repoId)
            .forEach(s -> {
                chatMessageRepository.findBySessionIdOrderByCreatedAtAsc(s.getId())
                    .forEach(chatMessageRepository::delete);
                chatSessionRepository.delete(s);
            });

        onboardingStepRepository.findByRepositoryIdOrderByStepOrder(repoId)
            .forEach(step -> {
                progressRepository.deleteByStepId(step.getId());
                onboardingStepRepository.delete(step);
            });

        dependencyEdgeRepository.deleteByRepositoryId(repoId);
        repoFunctionRepository.findByRepositoryId(repoId).forEach(repoFunctionRepository::delete);
        repoFileRepository.findByRepositoryId(repoId).forEach(repoFileRepository::delete);

        // Reset repo state
        repo.setStatus("PENDING");
        repo.setAnalysisProgress(0);
        repo.setAnalysisStep("Webhook Triggered");
        repo.setAiSummary(null);
        repo.setFaissIndexData(null);
        repo.setFaissIndexId(null);
        repo.setFileCount(0);
        repo.setFunctionCount(0);
        repo.setHotspotCount(0);
        repo.setAnalyzedAt(null);
        repositoryRepository.save(repo);

        // Evict caches
        if (cacheManager != null) {
            var detailCache = cacheManager.getCache("repo-detail");
            if (detailCache != null) {
                detailCache.evict(repoId);
            }
            var listCache = cacheManager.getCache("repo-list");
            if (listCache != null) {
                listCache.evict(userId.toString());
            }
        }

        // Trigger async pipeline
        analysisService.processAnalysis(repoId, userId);
    }

    private boolean verifySignature(String payload, String signatureHeader, String secret) {
        try {
            String algorithm = "HmacSHA256";
            Mac mac = Mac.getInstance(algorithm);
            SecretKeySpec secretKey = new SecretKeySpec(secret.getBytes(), algorithm);
            mac.init(secretKey);
            byte[] hash = mac.doFinal(payload.getBytes());
            
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) {
                    hexString.append('0');
                }
                hexString.append(hex);
            }
            String expectedSignature = "sha256=" + hexString.toString();
            return expectedSignature.equals(signatureHeader);
        } catch (Exception e) {
            return false;
        }
    }
}

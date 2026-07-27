package com.codecompass.backend.controller;

import com.codecompass.backend.dto.AnalyzeRequest;
import com.codecompass.backend.model.Repository;
import com.codecompass.backend.repository.*;
import com.codecompass.backend.service.AnalysisService;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/repos")
@org.springframework.transaction.annotation.Transactional
public class RepositoryController {

    private final AnalysisService analysisService;
    private final RepositoryRepository repositoryRepository;
    private final RepoFileRepository repoFileRepository;
    private final RepoFunctionRepository repoFunctionRepository;
    private final DependencyEdgeRepository dependencyEdgeRepository;
    private final OnboardingStepRepository onboardingStepRepository;
    private final ChatSessionRepository chatSessionRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final UserOnboardingProgressRepository progressRepository;

    public RepositoryController(AnalysisService analysisService,
                                 RepositoryRepository repositoryRepository,
                                 RepoFileRepository repoFileRepository,
                                 RepoFunctionRepository repoFunctionRepository,
                                 DependencyEdgeRepository dependencyEdgeRepository,
                                 OnboardingStepRepository onboardingStepRepository,
                                 ChatSessionRepository chatSessionRepository,
                                 ChatMessageRepository chatMessageRepository,
                                 UserOnboardingProgressRepository progressRepository) {
        this.analysisService = analysisService;
        this.repositoryRepository = repositoryRepository;
        this.repoFileRepository = repoFileRepository;
        this.repoFunctionRepository = repoFunctionRepository;
        this.dependencyEdgeRepository = dependencyEdgeRepository;
        this.onboardingStepRepository = onboardingStepRepository;
        this.chatSessionRepository = chatSessionRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.progressRepository = progressRepository;
    }

    /** POST /api/v1/repos/analyze — create repo record and start async pipeline */
    @PostMapping("/analyze")
    @CacheEvict(value = "repo-list", key = "#authentication.name")
    public ResponseEntity<Map<String, Object>> analyzeRepository(
            @RequestBody AnalyzeRequest request, Authentication authentication) {
        UUID userId = UUID.fromString(authentication.getName());

        // Validate GitHub URL format
        String url = request.getGithubUrl();
        if (url == null || !url.matches("https://github\\.com/[^/]+/[^/]+(/.*)?")) {
            return ResponseEntity.badRequest().body(Map.of(
                "success", false,
                "error", Map.of("code", "INVALID_URL", "message", "URL must match https://github.com/{owner}/{repo}")));
        }

        Repository repo = analysisService.startAnalysis(userId, url.trim().replaceAll("/$", ""));
        analysisService.processAnalysis(repo.getId(), userId); // fires @Async

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("repoId", repo.getId());
        response.put("status", repo.getStatus());
        response.put("githubOwner", repo.getGithubOwner());
        response.put("githubName", repo.getGithubName());
        return ResponseEntity.accepted().body(response);
    }

    /** GET /api/v1/repos — list all repos for the authenticated user */
    @GetMapping
    @Cacheable(value = "repo-list", key = "#authentication.name")
    public ResponseEntity<List<Map<String, Object>>> getAllRepositories(Authentication authentication) {
        UUID userId = UUID.fromString(authentication.getName());
        List<Repository> repos = repositoryRepository.findByUserId(userId);

        List<Map<String, Object>> result = repos.stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.getId());
            m.put("githubOwner", r.getGithubOwner());
            m.put("githubName", r.getGithubName());
            m.put("githubUrl", r.getGithubUrl());
            m.put("description", r.getDescription());
            m.put("primaryLanguage", r.getPrimaryLanguage());
            m.put("status", r.getStatus());
            m.put("analysisProgress", r.getAnalysisProgress());
            m.put("analysisStep", r.getAnalysisStep());
            m.put("aiSummary", r.getAiSummary());
            m.put("fileCount", r.getFileCount());
            m.put("functionCount", r.getFunctionCount());
            m.put("hotspotCount", r.getHotspotCount());
            m.put("analyzedAt", r.getAnalyzedAt());
            m.put("createdAt", r.getCreatedAt());
            return m;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    /** GET /api/v1/repos/{id} — full repo metadata */
    @GetMapping("/{id}")
    @Cacheable(value = "repo-detail", key = "#id")
    public ResponseEntity<Repository> getRepository(@PathVariable UUID id, Authentication authentication) {
        Repository repo = repositoryRepository.findById(id).orElseThrow();
        if (!repo.getUser().getId().toString().equals(authentication.getName())) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(repo);
    }

    /**
     * GET /api/v1/repos/{id}/status — polling endpoint for analysis progress.
     * NOT cached intentionally — this is a live-polling endpoint; stale data here
     * would make the progress bar freeze on the frontend.
     */
    @GetMapping("/{id}/status")
    public ResponseEntity<Map<String, Object>> getRepositoryStatus(
            @PathVariable UUID id, Authentication authentication) {
        Repository repo = repositoryRepository.findById(id).orElseThrow();
        if (!repo.getUser().getId().toString().equals(authentication.getName())) {
            return ResponseEntity.status(403).build();
        }
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("status", repo.getStatus());
        status.put("analysisProgress", repo.getAnalysisProgress());
        status.put("analysisStep", repo.getAnalysisStep());
        status.put("currentStage", repo.getStatus());
        status.put("filesTotal", repo.getFileCount());
        status.put("filesParsed", repo.getFileCount());
        status.put("functionsFound", repo.getFunctionCount());
        status.put("dependenciesMapped", 0);
        return ResponseEntity.ok(status);
    }

    /**
     * POST /api/v1/repos/{id}/reanalyze — clear old data and restart pipeline.
     *
     * Cache eviction: BOTH repo-detail and repo-list are evicted here.
     * Without evicting repo-list, a re-analyzed repo could still show the old
     * analysis summary on the dashboard. Without evicting repo-detail, the old
     * graph/files could be served from Redis even though the DB was just wiped.
     */
    @PostMapping("/{id}/reanalyze")
    @Caching(evict = {
        @CacheEvict(value = "repo-detail", key = "#id"),
        @CacheEvict(value = "repo-list",   key = "#authentication.name")
    })
    public ResponseEntity<Map<String, Object>> reanalyzeRepository(
            @PathVariable UUID id, Authentication authentication) {
        Repository repo = repositoryRepository.findById(id).orElseThrow();
        if (!repo.getUser().getId().toString().equals(authentication.getName())) {
            return ResponseEntity.status(403).build();
        }

        UUID repoId = repo.getId();
        UUID userId = repo.getUser().getId();

        // Clear chat sessions & messages
        chatSessionRepository.findByUserIdAndRepositoryIdOrderByLastMessageAtDesc(userId, repoId)
            .forEach(s -> {
                chatMessageRepository.findBySessionIdOrderByCreatedAtAsc(s.getId())
                    .forEach(chatMessageRepository::delete);
                chatSessionRepository.delete(s);
            });

        // Clear onboarding
        onboardingStepRepository.findByRepositoryIdOrderByStepOrder(repoId)
            .forEach(step -> {
                progressRepository.deleteByStepId(step.getId());
                onboardingStepRepository.delete(step);
            });

        // Clear graph, functions, files
        dependencyEdgeRepository.deleteByRepositoryId(repoId);
        repoFunctionRepository.findByRepositoryId(repoId).forEach(repoFunctionRepository::delete);
        repoFileRepository.findByRepositoryId(repoId).forEach(repoFileRepository::delete);

        // Reset repo status
        repo.setStatus("PENDING");
        repo.setAnalysisProgress(0);
        repo.setAnalysisStep("Queued for re-analysis");
        repo.setAiSummary(null);
        repo.setFaissIndexData(null);
        repo.setFaissIndexId(null);
        repo.setFileCount(0);
        repo.setFunctionCount(0);
        repo.setHotspotCount(0);
        repo.setAnalyzedAt(null);
        repositoryRepository.save(repo);

        analysisService.processAnalysis(repoId, userId);

        return ResponseEntity.accepted().body(Map.of("repoId", repoId, "status", "PENDING"));
    }

    /**
     * DELETE /api/v1/repos/{id} — cascade delete everything.
     *
     * Cache eviction: BOTH repo-detail and repo-list are evicted here.
     * This is critical: without evicting repo-list, a deleted repo could still appear
     * on the dashboard ("I deleted this repo but it still shows in the graph").
     */
    @DeleteMapping("/{id}")
    @Caching(evict = {
        @CacheEvict(value = "repo-detail", key = "#id"),
        @CacheEvict(value = "repo-list",   key = "#authentication.name")
    })
    public ResponseEntity<Void> deleteRepository(@PathVariable UUID id, Authentication authentication) {
        Repository repo = repositoryRepository.findById(id).orElseThrow();
        if (!repo.getUser().getId().toString().equals(authentication.getName())) {
            return ResponseEntity.status(403).build();
        }

        UUID repoId = repo.getId();
        UUID userId = repo.getUser().getId();

        // Cascade in dependency order
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
        repositoryRepository.delete(repo);

        return ResponseEntity.noContent().build();
    }
}

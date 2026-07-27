package com.codecompass.backend.controller;

import com.codecompass.backend.model.*;
import com.codecompass.backend.repository.*;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Handles all workspace-level endpoints:
 *   GET  /api/v1/repos/{id}/overview
 *   GET  /api/v1/repos/{id}/files
 *   GET  /api/v1/repos/{id}/files/{fileId}
 *   GET  /api/v1/repos/{id}/files/{fileId}/content
 *   GET  /api/v1/repos/{id}/functions
 *   GET  /api/v1/repos/{id}/functions/{functionId}
 *   GET  /api/v1/repos/{id}/graph
 *   GET  /api/v1/repos/{id}/onboarding
 *   POST /api/v1/repos/{id}/onboarding/{stepId}/complete
 *   DELETE /api/v1/repos/{id}/onboarding/{stepId}/complete
 */
@RestController
@RequestMapping("/api/v1/repos/{repoId}")
public class WorkspaceController {

    private final RepositoryRepository repositoryRepository;
    private final RepoFileRepository repoFileRepository;
    private final RepoFunctionRepository repoFunctionRepository;
    private final DependencyEdgeRepository dependencyEdgeRepository;
    private final OnboardingStepRepository onboardingStepRepository;
    private final UserOnboardingProgressRepository progressRepository;
    private final UserRepository userRepository;

    public WorkspaceController(RepositoryRepository repositoryRepository,
                                RepoFileRepository repoFileRepository,
                                RepoFunctionRepository repoFunctionRepository,
                                DependencyEdgeRepository dependencyEdgeRepository,
                                OnboardingStepRepository onboardingStepRepository,
                                UserOnboardingProgressRepository progressRepository,
                                UserRepository userRepository) {
        this.repositoryRepository = repositoryRepository;
        this.repoFileRepository = repoFileRepository;
        this.repoFunctionRepository = repoFunctionRepository;
        this.dependencyEdgeRepository = dependencyEdgeRepository;
        this.onboardingStepRepository = onboardingStepRepository;
        this.progressRepository = progressRepository;
        this.userRepository = userRepository;
    }

    // ─── Helper: verify ownership ─────────────────────────────────────────────
    private Repository verifyOwner(UUID repoId, Authentication auth) {
        Repository repo = repositoryRepository.findById(repoId)
            .orElseThrow(() -> new NoSuchElementException("Repository not found"));
        if (!repo.getUser().getId().toString().equals(auth.getName())) {
            throw new SecurityException("Access denied");
        }
        return repo;
    }

    // ─── Overview ─────────────────────────────────────────────────────────────
    @GetMapping("/overview")
    public ResponseEntity<Map<String, Object>> getOverview(@PathVariable UUID repoId, Authentication auth) {
        Repository repo = verifyOwner(repoId, auth);
        UUID userId = UUID.fromString(auth.getName());

        long fileCount = repoFileRepository.countByRepositoryId(repoId);
        long funcCount = repoFunctionRepository.countByRepositoryId(repoId);
        long hotspotCount = repoFileRepository.countByRepositoryIdAndIsHotspotTrue(repoId);

        // Language breakdown from file languages
        List<RepoFile> files = repoFileRepository.findByRepositoryId(repoId);
        Map<String, Long> langMap = files.stream()
            .filter(f -> f.getLanguage() != null && !"Unknown".equals(f.getLanguage()) && !"Markdown".equals(f.getLanguage()))
            .collect(Collectors.groupingBy(RepoFile::getLanguage, Collectors.counting()));

        // Doc coverage: % of files with non-null ai_summary
        long withSummary = files.stream().filter(f -> f.getAiSummary() != null && !f.getAiSummary().isBlank()).count();
        int docCoverage = files.isEmpty() ? 0 : (int) Math.round((double) withSummary / files.size() * 100);

        // Onboarding progress
        List<OnboardingStep> steps = onboardingStepRepository.findByRepositoryIdOrderByStepOrder(repoId);
        List<UUID> stepIds = steps.stream().map(OnboardingStep::getId).collect(Collectors.toList());
        long completed = stepIds.isEmpty() ? 0 : progressRepository.countByUserIdAndStepIdIn(userId, stepIds);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", repo.getId());
        result.put("githubOwner", repo.getGithubOwner());
        result.put("githubName", repo.getGithubName());
        result.put("description", repo.getDescription());
        result.put("primaryLanguage", repo.getPrimaryLanguage());
        result.put("aiSummary", repo.getAiSummary());
        result.put("analyzedAt", repo.getAnalyzedAt());
        result.put("starCount", repo.getStarCount());
        result.put("forkCount", repo.getForkCount());
        result.put("fileCount", fileCount);
        result.put("functionCount", funcCount);
        result.put("hotspotCount", hotspotCount);
        result.put("documentationCoverage", docCoverage);
        result.put("languageBreakdown", langMap);
        result.put("onboardingTotal", steps.size());
        result.put("onboardingCompleted", completed);
        return ResponseEntity.ok(result);
    }

    // ─── Files (metadata only, no raw content) ────────────────────────────────
    @GetMapping("/files")
    public ResponseEntity<List<Map<String, Object>>> getFiles(@PathVariable UUID repoId, Authentication auth) {
        verifyOwner(repoId, auth);
        List<RepoFile> files = repoFileRepository.findByRepositoryIdOrderByFilePath(repoId);
        List<Map<String, Object>> result = files.stream().map(f -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", f.getId());
            m.put("filePath", f.getFilePath());
            m.put("fileName", f.getFileName());
            m.put("language", f.getLanguage());
            m.put("moduleType", f.getModuleType());
            m.put("complexityScore", f.getComplexityScore());
            m.put("hotspotScore", f.getHotspotScore());
            m.put("isHotspot", f.getIsHotspot());
            m.put("isEntryPoint", f.getIsEntryPoint());
            m.put("lineCount", f.getLineCount());
            m.put("sizeBytes", f.getSizeBytes());
            return m;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    // ─── Single file metadata + summary ──────────────────────────────────────
    @GetMapping("/files/{fileId}")
    public ResponseEntity<Map<String, Object>> getFile(@PathVariable UUID repoId,
                                                         @PathVariable UUID fileId,
                                                         Authentication auth) {
        verifyOwner(repoId, auth);
        RepoFile f = repoFileRepository.findById(fileId)
            .orElseThrow(() -> new NoSuchElementException("File not found"));
        if (!f.getRepository().getId().equals(repoId)) return ResponseEntity.status(403).build();

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", f.getId());
        m.put("filePath", f.getFilePath());
        m.put("fileName", f.getFileName());
        m.put("language", f.getLanguage());
        m.put("moduleType", f.getModuleType());
        m.put("complexityScore", f.getComplexityScore());
        m.put("churnScore", f.getChurnScore());
        m.put("hotspotScore", f.getHotspotScore());
        m.put("isHotspot", f.getIsHotspot());
        m.put("isEntryPoint", f.getIsEntryPoint());
        m.put("aiSummary", f.getAiSummary());
        m.put("lineCount", f.getLineCount());
        m.put("sizeBytes", f.getSizeBytes());
        m.put("lastCommitAt", f.getLastCommitAt());
        m.put("lastCommitMessage", f.getLastCommitMessage());
        return ResponseEntity.ok(m);
    }

    // ─── File content + functions for code viewer ─────────────────────────────
    @GetMapping("/files/{fileId}/content")
    public ResponseEntity<Map<String, Object>> getFileContent(@PathVariable UUID repoId,
                                                               @PathVariable UUID fileId,
                                                               Authentication auth) {
        verifyOwner(repoId, auth);
        RepoFile f = repoFileRepository.findById(fileId)
            .orElseThrow(() -> new NoSuchElementException("File not found"));
        if (!f.getRepository().getId().equals(repoId)) return ResponseEntity.status(403).build();

        List<RepoFunction> funcs = repoFunctionRepository.findByFileId(fileId);
        List<Map<String, Object>> funcList = funcs.stream().map(fn -> {
            Map<String, Object> fm = new LinkedHashMap<>();
            fm.put("id", fn.getId());
            fm.put("functionName", fn.getFunctionName());
            fm.put("className", fn.getClassName());
            fm.put("startLine", fn.getStartLine());
            fm.put("endLine", fn.getEndLine());
            fm.put("complexityScore", fn.getComplexityScore());
            fm.put("aiSummary", fn.getAiSummary());
            return fm;
        }).collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", f.getId());
        result.put("filePath", f.getFilePath());
        result.put("language", f.getLanguage());
        result.put("aiSummary", f.getAiSummary());
        result.put("complexityScore", f.getComplexityScore());
        result.put("hotspotScore", f.getHotspotScore());
        result.put("lastCommitAt", f.getLastCommitAt());
        result.put("lastCommitMessage", f.getLastCommitMessage());
        result.put("rawContent", f.getRawContent());
        result.put("functions", funcList);
        return ResponseEntity.ok(result);
    }

    // ─── Functions (list or by fileId filter) ─────────────────────────────────
    @GetMapping("/functions")
    public ResponseEntity<List<Map<String, Object>>> getFunctions(@PathVariable UUID repoId,
                                                                   @RequestParam(required = false) UUID fileId,
                                                                   Authentication auth) {
        verifyOwner(repoId, auth);
        List<RepoFunction> funcs = fileId != null
            ? repoFunctionRepository.findByRepositoryIdAndFileId(repoId, fileId)
            : repoFunctionRepository.findByRepositoryId(repoId);

        return ResponseEntity.ok(funcs.stream().map(fn -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", fn.getId());
            m.put("fileId", fn.getFile().getId());
            m.put("functionName", fn.getFunctionName());
            m.put("className", fn.getClassName());
            m.put("startLine", fn.getStartLine());
            m.put("endLine", fn.getEndLine());
            m.put("parameters", fn.getParameters());
            m.put("returnType", fn.getReturnType());
            m.put("complexityScore", fn.getComplexityScore());
            m.put("aiSummary", fn.getAiSummary());
            return m;
        }).collect(Collectors.toList()));
    }

    // ─── Single function ──────────────────────────────────────────────────────
    @GetMapping("/functions/{functionId}")
    public ResponseEntity<RepoFunction> getFunction(@PathVariable UUID repoId,
                                                      @PathVariable UUID functionId,
                                                      Authentication auth) {
        verifyOwner(repoId, auth);
        return ResponseEntity.ok(repoFunctionRepository.findById(functionId)
            .orElseThrow(() -> new NoSuchElementException("Function not found")));
    }

    // ─── Dependency Graph ─────────────────────────────────────────────────────
    @GetMapping("/graph")
    public ResponseEntity<Map<String, Object>> getGraph(@PathVariable UUID repoId, Authentication auth) {
        verifyOwner(repoId, auth);

        List<RepoFile> files = repoFileRepository.findByRepositoryId(repoId);
        List<DependencyEdge> edges = dependencyEdgeRepository.findByRepositoryId(repoId);

        // Build nodes
        List<Map<String, Object>> nodes = files.stream().map(f -> {
            Map<String, Object> n = new LinkedHashMap<>();
            n.put("id", f.getId());
            n.put("filePath", f.getFilePath());
            n.put("fileName", f.getFileName());
            n.put("moduleType", f.getModuleType());
            n.put("complexityScore", f.getComplexityScore());
            n.put("hotspotScore", f.getHotspotScore());
            n.put("isHotspot", f.getIsHotspot());
            n.put("isEntryPoint", f.getIsEntryPoint());
            n.put("language", f.getLanguage());
            n.put("aiSummary", f.getAiSummary());
            return n;
        }).collect(Collectors.toList());

        // Build edges (internal only for D3 graph)
        List<Map<String, Object>> edgeList = edges.stream()
            .filter(e -> !Boolean.TRUE.equals(e.getIsExternal()) && e.getTargetFile().getId() != null)
            .map(e -> {
                Map<String, Object> em = new LinkedHashMap<>();
                em.put("id", e.getId());
                em.put("source", e.getSourceFile().getId());
                em.put("target", e.getTargetFile().getId());
                em.put("importStatement", e.getImportStatement());
                return em;
            }).collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("nodes", nodes);
        result.put("edges", edgeList);
        return ResponseEntity.ok(result);
    }

    // ─── Onboarding ───────────────────────────────────────────────────────────
    @GetMapping("/onboarding")
    public ResponseEntity<List<Map<String, Object>>> getOnboarding(@PathVariable UUID repoId, Authentication auth) {
        verifyOwner(repoId, auth);
        UUID userId = UUID.fromString(auth.getName());

        List<OnboardingStep> steps = onboardingStepRepository.findByRepositoryIdOrderByStepOrder(repoId);
        List<Map<String, Object>> result = steps.stream().map(step -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", step.getId());
            m.put("stepOrder", step.getStepOrder());
            m.put("reason", step.getReason());
            m.put("estimatedMinutes", step.getEstimatedMinutes());
            m.put("isCompleted", progressRepository.existsByUserIdAndStepId(userId, step.getId()));

            // Join file info
            if (step.getFile().getId() != null) {
                repoFileRepository.findById(step.getFile().getId()).ifPresent(f -> {
                    m.put("fileId", f.getId());
                    m.put("filePath", f.getFilePath());
                    m.put("fileName", f.getFileName());
                    m.put("aiSummary", f.getAiSummary());
                });
            }
            return m;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    @PostMapping("/onboarding/{stepId}/complete")
    public ResponseEntity<Void> markStepComplete(@PathVariable UUID repoId,
                                                   @PathVariable UUID stepId,
                                                   Authentication auth) {
        verifyOwner(repoId, auth);
        UUID userId = UUID.fromString(auth.getName());

        if (!progressRepository.existsByUserIdAndStepId(userId, stepId)) {
            OnboardingStep step = onboardingStepRepository.findById(stepId)
                .orElseThrow(() -> new NoSuchElementException("Step not found"));
            UserOnboardingProgress progress = new UserOnboardingProgress();
            progress.setUser(userRepository.getReferenceById(userId));
            progress.setStep(onboardingStepRepository.getReferenceById(stepId));
            progressRepository.save(progress);
        }
        return ResponseEntity.status(201).build();
    }

    @DeleteMapping("/onboarding/{stepId}/complete")
    public ResponseEntity<Void> unmarkStepComplete(@PathVariable UUID repoId,
                                                     @PathVariable UUID stepId,
                                                     Authentication auth) {
        verifyOwner(repoId, auth);
        UUID userId = UUID.fromString(auth.getName());
        progressRepository.findByUserIdAndStepId(userId, stepId).ifPresent(progressRepository::delete);
        return ResponseEntity.noContent().build();
    }
}

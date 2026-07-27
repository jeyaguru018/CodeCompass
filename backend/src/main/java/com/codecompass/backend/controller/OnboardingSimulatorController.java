package com.codecompass.backend.controller;

import com.codecompass.backend.model.Repository;
import com.codecompass.backend.model.RepoFile;
import com.codecompass.backend.model.User;
import com.codecompass.backend.repository.RepositoryRepository;
import com.codecompass.backend.repository.UserRepository;
import com.codecompass.backend.repository.RepoFileRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import com.codecompass.backend.service.PythonServiceClient;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/onboarding")
public class OnboardingSimulatorController {

    private final RepositoryRepository repositoryRepository;
    private final RepoFileRepository repoFileRepository;
    private final UserRepository userRepository;
    private final PythonServiceClient pythonServiceClient;

    public OnboardingSimulatorController(RepositoryRepository repositoryRepository,
                                         RepoFileRepository repoFileRepository,
                                         UserRepository userRepository,
                                         PythonServiceClient pythonServiceClient) {
        this.repositoryRepository = repositoryRepository;
        this.repoFileRepository = repoFileRepository;
        this.userRepository = userRepository;
        this.pythonServiceClient = pythonServiceClient;
    }

    public static class SimulateRequest {
        public String role; // e.g., "Frontend Developer", "Security Auditor"
    }

    @PostMapping("/simulate/{repoId}")
    public ResponseEntity<?> simulateOnboarding(
            @PathVariable UUID repoId,
            @RequestBody SimulateRequest request,
            Authentication auth) {

        UUID userId = UUID.fromString(auth.getName());
        User currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));

        Repository repo = repositoryRepository.findById(repoId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Repository not found"));

        // IDOR CHECK
        if (!repo.getUser().getId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have access to this repository");
        }

        // Get top files by complexity
        List<RepoFile> files = repoFileRepository.findTop50ByRepositoryIdOrderByComplexityScoreDesc(repoId);
        
        List<Map<String, Object>> filePayloads = new ArrayList<>();
        for (RepoFile f : files) {
            Map<String, Object> tf = new HashMap<>();
            tf.put("file_id", f.getId().toString());
            tf.put("file_path", f.getFilePath());
            tf.put("is_entry_point", Boolean.TRUE.equals(f.getIsEntryPoint()));
            tf.put("complexity_score", f.getComplexityScore());
            filePayloads.add(tf);
        }

        Map<String, Object> payload = new HashMap<>();
        payload.put("repo_id", repo.getId().toString());
        payload.put("repo_summary", repo.getAiSummary() != null ? repo.getAiSummary() : "");
        payload.put("files", filePayloads);
        payload.put("role", request.role);

        try {
            Map<String, Object> response = pythonServiceClient.postToPython("/internal/simulate_onboarding", payload);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Error communicating with AI service: " + e.getMessage());
        }
    }
}

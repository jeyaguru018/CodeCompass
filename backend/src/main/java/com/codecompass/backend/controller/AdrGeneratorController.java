package com.codecompass.backend.controller;

import com.codecompass.backend.model.Repository;
import com.codecompass.backend.model.User;
import com.codecompass.backend.repository.RepositoryRepository;
import com.codecompass.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import com.codecompass.backend.service.PythonServiceClient;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/repos")
public class AdrGeneratorController {

    private final RepositoryRepository repositoryRepository;
    private final UserRepository userRepository;
    private final PythonServiceClient pythonServiceClient;

    public AdrGeneratorController(RepositoryRepository repositoryRepository,
                                  UserRepository userRepository,
                                  PythonServiceClient pythonServiceClient) {
        this.repositoryRepository = repositoryRepository;
        this.userRepository = userRepository;
        this.pythonServiceClient = pythonServiceClient;
    }

    @PostMapping("/{id}/adr")
    public ResponseEntity<?> generateAdr(
            @PathVariable UUID id,
            Authentication auth) {

        UUID userId = UUID.fromString(auth.getName());
        User currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));

        Repository repo = repositoryRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Repository not found"));

        // IDOR CHECK
        if (!repo.getUser().getId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have access to this repository");
        }

        Map<String, Object> payload = new HashMap<>();
        payload.put("repo_id", repo.getId().toString());
        payload.put("repo_summary", repo.getAiSummary() != null ? repo.getAiSummary() : "");

        try {
            Map<String, Object> response = pythonServiceClient.postToPython("/internal/generate_adr", payload);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Error communicating with AI service: " + e.getMessage());
        }
    }
}

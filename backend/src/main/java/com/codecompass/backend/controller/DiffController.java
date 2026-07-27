package com.codecompass.backend.controller;

import com.codecompass.backend.model.Repository;
import com.codecompass.backend.model.User;
import com.codecompass.backend.repository.RepositoryRepository;
import com.codecompass.backend.repository.UserRepository;
import com.codecompass.backend.security.AES256EncryptionUtil;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import com.codecompass.backend.service.PythonServiceClient;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/diff")
public class DiffController {

    private final RepositoryRepository repositoryRepository;
    private final UserRepository userRepository;
    private final RestTemplate restTemplate;
    private final AES256EncryptionUtil encryptionUtil;
    private final PythonServiceClient pythonServiceClient;

    @Value("${app.python-service-url:http://localhost:8000}")
    private String pythonServiceUrl;

    @Value("${app.internal-secret:default-secret}")
    private String internalSecret;

    public DiffController(RepositoryRepository repositoryRepository,
                          UserRepository userRepository,
                          RestTemplate restTemplate,
                          AES256EncryptionUtil encryptionUtil,
                          PythonServiceClient pythonServiceClient) {
        this.repositoryRepository = repositoryRepository;
        this.userRepository = userRepository;
        this.restTemplate = restTemplate;
        this.encryptionUtil = encryptionUtil;
        this.pythonServiceClient = pythonServiceClient;
    }

    public static class DiffExplainRequest {
        public UUID repoId;
        public String diffText; // Can be raw diff or commit SHA
    }

    @PostMapping("/explain")
    public ResponseEntity<?> explainDiff(
            @RequestBody DiffExplainRequest request,
            Authentication auth) {

        UUID userId = UUID.fromString(auth.getName());
        User currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));

        Repository repo = repositoryRepository.findById(request.repoId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Repository not found"));

        // IDOR CHECK
        if (!repo.getUser().getId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have access to this repository");
        }

        String diffContent = request.diffText;
        
        // If it's just a SHA, fetch it from GitHub
        if (diffContent != null && diffContent.matches("^[0-9a-f]{7,40}$")) {
            String token = null;
            if (currentUser.getGithubAccessToken() != null) {
                try {
                    token = encryptionUtil.decrypt(currentUser.getGithubAccessToken());
                } catch (Exception ignored) {}
            }
            HttpHeaders headers = new HttpHeaders();
            headers.setAccept(List.of(MediaType.valueOf("application/vnd.github.v3.diff")));
            if (token != null) {
                headers.setBearerAuth(token);
            }
            try {
                ResponseEntity<String> diffResp = restTemplate.exchange(
                        "https://api.github.com/repos/" + repo.getGithubOwner() + "/" + repo.getGithubName() + "/commits/" + diffContent,
                        HttpMethod.GET,
                        new HttpEntity<>(headers),
                        String.class
                );
                diffContent = diffResp.getBody();
            } catch (Exception e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not fetch diff for commit SHA: " + e.getMessage());
            }
        }

        if (diffContent == null || diffContent.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Diff text cannot be empty");
        }

        // Send to Python
        Map<String, Object> payload = new HashMap<>();
        payload.put("repo_id", request.repoId.toString());
        payload.put("diff_text", diffContent);

        try {
            Map<String, Object> response = pythonServiceClient.postToPython("/internal/diff_explain", payload);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Error communicating with AI service: " + e.getMessage());
        }
    }
}

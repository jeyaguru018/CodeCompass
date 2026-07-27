package com.codecompass.backend.controller;

import com.codecompass.backend.model.ChatSession;
import com.codecompass.backend.model.User;
import com.codecompass.backend.repository.ChatSessionRepository;
import com.codecompass.backend.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/chat")
public class ChatSharingController {

    private final ChatSessionRepository chatSessionRepository;
    private final UserRepository userRepository;

    public ChatSharingController(ChatSessionRepository chatSessionRepository, UserRepository userRepository) {
        this.chatSessionRepository = chatSessionRepository;
        this.userRepository = userRepository;
    }

    @PostMapping("/share/{sessionId}")
    public ResponseEntity<?> shareChatSession(
            @PathVariable UUID sessionId,
            Authentication auth) {

        UUID userId = UUID.fromString(auth.getName());
        User currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));

        ChatSession session = chatSessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Chat session not found"));

        // IDOR check: Verify the user owns the chat session via the repository
        if (!session.getRepository().getUser().getId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have permission to share this chat session");
        }

        if (session.getSharedToken() == null) {
            session.setSharedToken(UUID.randomUUID().toString().replace("-", ""));
        }
        session.setPublic(true);
        chatSessionRepository.save(session);

        return ResponseEntity.ok(Map.of(
                "shared_token", session.getSharedToken(),
                "is_public", true
        ));
    }
    
    @DeleteMapping("/share/{sessionId}")
    public ResponseEntity<?> unshareChatSession(
            @PathVariable UUID sessionId,
            Authentication auth) {

        UUID userId = UUID.fromString(auth.getName());
        User currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));

        ChatSession session = chatSessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Chat session not found"));

        // IDOR check
        if (!session.getRepository().getUser().getId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have permission to unshare this chat session");
        }

        session.setPublic(false);
        // We can either clear the token or leave it and just use isPublic to deny access. Clearing it prevents reuse.
        session.setSharedToken(null);
        chatSessionRepository.save(session);

        return ResponseEntity.ok(Map.of("is_public", false));
    }

    @GetMapping("/shared/{token}")
    public ResponseEntity<?> getSharedChatSession(@PathVariable String token) {
        ChatSession session = chatSessionRepository.findBySharedToken(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Shared chat session not found or invalid token"));

        if (!session.isPublic()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Shared chat session not found or invalid token");
        }

        return ResponseEntity.ok(Map.of(
            "id", session.getId(),
            "repository_name", session.getRepository().getGithubOwner() + "/" + session.getRepository().getGithubName(),
            "title", session.getTitle(),
            "messages", session.getMessages().stream().map(m -> Map.of(
                "id", m.getId(),
                "role", m.getRole(),
                "content", m.getContent(),
                "created_at", m.getCreatedAt(),
                "cited_file_ids", m.getCitedFileIds() != null ? m.getCitedFileIds() : java.util.List.of()
            )).toList()
        ));
    }
}

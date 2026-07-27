package com.codecompass.backend.controller;

import com.codecompass.backend.model.*;
import com.codecompass.backend.repository.*;
import com.codecompass.backend.service.RagService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Chat endpoints:
 *   GET    /api/v1/repos/{repoId}/chat/sessions
 *   POST   /api/v1/repos/{repoId}/chat/sessions
 *   GET    /api/v1/repos/{repoId}/chat/sessions/{sessionId}
 *   POST   /api/v1/repos/{repoId}/chat/sessions/{sessionId}/messages
 *   GET    /api/v1/repos/{repoId}/chat/stream  (SSE)
 *   DELETE /api/v1/repos/{repoId}/chat/sessions/{sessionId}
 */
@RestController
@RequestMapping("/api/v1/repos/{repoId}/chat")
public class ChatController {

    private final RepositoryRepository repositoryRepository;
    private final ChatSessionRepository chatSessionRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final UserRepository userRepository;
    private final RagService ragService;
    private final RepoFileRepository repoFileRepository;

    public ChatController(RepositoryRepository repositoryRepository,
                          ChatSessionRepository chatSessionRepository,
                          ChatMessageRepository chatMessageRepository,
                          UserRepository userRepository,
                          RagService ragService,
                          RepoFileRepository repoFileRepository) {
        this.repositoryRepository = repositoryRepository;
        this.chatSessionRepository = chatSessionRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.userRepository = userRepository;
        this.ragService = ragService;
        this.repoFileRepository = repoFileRepository;
    }

    // ─── Ownership check ──────────────────────────────────────────────────────
    private Repository verifyOwner(UUID repoId, Authentication auth) {
        Repository repo = repositoryRepository.findById(repoId)
            .orElseThrow(() -> new NoSuchElementException("Repository not found"));
        if (!repo.getUser().getId().toString().equals(auth.getName())) {
            throw new SecurityException("Access denied");
        }
        return repo;
    }

    // ─── List sessions ────────────────────────────────────────────────────────
    @GetMapping("/sessions")
    public ResponseEntity<List<Map<String, Object>>> getSessions(@PathVariable UUID repoId, Authentication auth) {
        verifyOwner(repoId, auth);
        UUID userId = UUID.fromString(auth.getName());

        List<ChatSession> sessions = chatSessionRepository
            .findByUserIdAndRepositoryIdOrderByLastMessageAtDesc(userId, repoId);

        List<Map<String, Object>> result = sessions.stream().map(s -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", s.getId());
            m.put("title", s.getTitle() != null ? s.getTitle() : "New conversation");
            m.put("createdAt", s.getCreatedAt());
            m.put("lastMessageAt", s.getLastMessageAt());
            return m;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    // ─── Create session ───────────────────────────────────────────────────────
    @PostMapping("/sessions")
    public ResponseEntity<Map<String, Object>> createSession(@PathVariable UUID repoId, Authentication auth) {
        Repository repo = verifyOwner(repoId, auth);
        UUID userId = UUID.fromString(auth.getName());
        User user = userRepository.findById(userId).orElseThrow();

        ChatSession session = new ChatSession();
        session.setUser(userRepository.getReferenceById(userId));
        session.setRepository(repositoryRepository.getReferenceById(repoId));
        chatSessionRepository.save(session);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", session.getId());
        result.put("createdAt", session.getCreatedAt());
        return ResponseEntity.status(201).body(result);
    }

    // ─── Get session messages ─────────────────────────────────────────────────
    @GetMapping("/sessions/{sessionId}")
    public ResponseEntity<Map<String, Object>> getSession(@PathVariable UUID repoId,
                                                           @PathVariable UUID sessionId,
                                                           Authentication auth) {
        verifyOwner(repoId, auth);
        UUID userId = UUID.fromString(auth.getName());

        ChatSession session = chatSessionRepository.findByIdAndUserId(sessionId, userId)
            .orElseThrow(() -> new NoSuchElementException("Session not found"));

        List<ChatMessage> messages = chatMessageRepository.findBySessionIdOrderByCreatedAtAsc(sessionId);
        List<Map<String, Object>> msgList = messages.stream().map(msg -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", msg.getId());
            m.put("role", msg.getRole());
            m.put("content", msg.getContent());
            m.put("citedFileIds", msg.getCitedFileIds());
            m.put("createdAt", msg.getCreatedAt());
            return m;
        }).collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", session.getId());
        result.put("title", session.getTitle());
        result.put("messages", msgList);
        return ResponseEntity.ok(result);
    }

    // ─── Send message (RAG pipeline + SSE streaming) ──────────────────────────
    @PostMapping(value = "/sessions/{sessionId}/messages", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter sendMessage(@PathVariable UUID repoId,
                                  @PathVariable UUID sessionId,
                                  @RequestBody Map<String, Object> body,
                                  Authentication auth) {
        verifyOwner(repoId, auth);
        UUID userId = UUID.fromString(auth.getName());

        ChatSession session = chatSessionRepository.findByIdAndUserId(sessionId, userId)
            .orElseThrow(() -> new NoSuchElementException("Session not found"));

        String content = (String) body.get("content");
        String contextFileId = (String) body.getOrDefault("contextFileId", null);
        String contextFunction = (String) body.getOrDefault("contextFunction", null);

        if (content == null || content.isBlank()) {
            throw new IllegalArgumentException("Message content cannot be empty");
        }

        // Persist user message
        ChatMessage userMsg = new ChatMessage();
        userMsg.setSession(chatSessionRepository.getReferenceById(sessionId));
        userMsg.setRole("user");
        userMsg.setContent(content);
        userMsg.setContextFile(contextFileId != null ? repoFileRepository.getReferenceById(UUID.fromString(contextFileId)) : null);
        userMsg.setContextFunction(contextFunction);
        chatMessageRepository.save(userMsg);

        // Auto-title session from first message
        if (session.getTitle() == null) {
            session.setTitle(content.length() > 60 ? content.substring(0, 60) + "…" : content);
            chatSessionRepository.save(session);
        }

        // Build SSE emitter — 3 min timeout for long AI responses
        SseEmitter emitter = new SseEmitter(180_000L);

        // Run the RAG pipeline asynchronously so the HTTP thread doesn't block
        ragService.streamAnswer(repoId, sessionId, userId, content, contextFileId, emitter);

        return emitter;
    }

    // ─── Delete session ───────────────────────────────────────────────────────
    @DeleteMapping("/sessions/{sessionId}")
    public ResponseEntity<Void> deleteSession(@PathVariable UUID repoId,
                                               @PathVariable UUID sessionId,
                                               Authentication auth) {
        verifyOwner(repoId, auth);
        UUID userId = UUID.fromString(auth.getName());
        chatSessionRepository.findByIdAndUserId(sessionId, userId).ifPresent(session -> {
            chatMessageRepository.findBySessionIdOrderByCreatedAtAsc(sessionId)
                .forEach(chatMessageRepository::delete);
            chatSessionRepository.delete(session);
        });
        return ResponseEntity.noContent().build();
    }
}

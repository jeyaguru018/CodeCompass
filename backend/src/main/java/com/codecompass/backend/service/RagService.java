package com.codecompass.backend.service;

import com.codecompass.backend.model.ChatMessage;
import com.codecompass.backend.model.Repository;
import com.codecompass.backend.model.RepoFile;
import com.codecompass.backend.repository.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Executes the full RAG pipeline per the spec (Section 4, TAB 3):
 *   1. Load conversation history (last 8 messages)
 *   2. Generate query embedding via Python /internal/embed-query
 *   3. FAISS similarity search via Python /internal/search
 *   4. Resolve chunk IDs → file content from Postgres
 *   5. Build augmented prompt
 *   6. Stream Gemini response back via SSE
 *   7. Persist AI message + update token usage
 */
@Service
public class RagService {

    private final RepositoryRepository repositoryRepository;
    private final RepoFileRepository repoFileRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final ChatSessionRepository chatSessionRepository;
    private final UserRepository userRepository;
    private final PythonServiceClient pythonServiceClient;

    public RagService(RepositoryRepository repositoryRepository,
                      RepoFileRepository repoFileRepository,
                      ChatMessageRepository chatMessageRepository,
                      ChatSessionRepository chatSessionRepository,
                      UserRepository userRepository,
                      PythonServiceClient pythonServiceClient) {
        this.repositoryRepository = repositoryRepository;
        this.repoFileRepository = repoFileRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.chatSessionRepository = chatSessionRepository;
        this.userRepository = userRepository;
        this.pythonServiceClient = pythonServiceClient;
    }

    @Async
    public void streamAnswer(UUID repoId, UUID sessionId, UUID userId,
                              String question, String contextFileId,
                              SseEmitter emitter) {
        StringBuilder fullResponse = new StringBuilder();
        List<UUID> citedFileIds = new ArrayList<>();

        try {
            Repository repo = repositoryRepository.findById(repoId).orElseThrow();

            // ── Step 1: Conversation history ─────────────────────────────────
            List<ChatMessage> history = chatMessageRepository
                .findTop8BySessionIdOrderByCreatedAtDesc(sessionId);
            Collections.reverse(history); // oldest first

            // ── Step 2 & 3: FAISS search via Python ──────────────────────────
            Map<String, Object> searchPayload = new HashMap<>();
            searchPayload.put("repo_id", repoId.toString());
            searchPayload.put("query", question);
            searchPayload.put("top_k", 8);

            Map<String, Object> searchResult = Map.of();
            try {
                searchResult = pythonServiceClient.postToPython("/internal/search", searchPayload);
            } catch (Exception ex) {
                // FAISS unavailable — proceed without context (degrade gracefully)
            }

            // ── Step 4: Resolve chunks → file content ─────────────────────────
            List<Map<String, Object>> retrievedChunks = new ArrayList<>();
            Object results = searchResult.get("results");
            if (results instanceof List) {
                Set<String> seenFileIds = new LinkedHashSet<>();
                for (Object item : (List<?>) results) {
                    if (item instanceof Map) {
                        Map<?, ?> r = (Map<?, ?>) item;
                        String fileId = (String) r.get("file_id");
                        if (fileId != null && seenFileIds.add(fileId)) {
                            repoFileRepository.findById(UUID.fromString(fileId)).ifPresent(f -> {
                                if (f.getRawContent() != null) {
                                    Map<String, Object> chunk = new HashMap<>();
                                    chunk.put("file_path", f.getFilePath());
                                    chunk.put("content", f.getRawContent().substring(0, Math.min(f.getRawContent().length(), 3000)));
                                    retrievedChunks.add(chunk);
                                    citedFileIds.add(f.getId());
                                }
                            });
                        }
                        if (retrievedChunks.size() >= 4) break;
                    }
                }
            }

            // Add contextFileId if provided
            if (contextFileId != null && !contextFileId.isBlank()) {
                try {
                    UUID cfId = UUID.fromString(contextFileId);
                    repoFileRepository.findById(cfId).ifPresent(f -> {
                        if (f.getRawContent() != null) {
                            Map<String, Object> chunk = new HashMap<>();
                            chunk.put("file_path", f.getFilePath());
                            chunk.put("content", f.getRawContent().substring(0, Math.min(f.getRawContent().length(), 4000)));
                            retrievedChunks.add(0, chunk); // prepend — higher priority
                            if (!citedFileIds.contains(cfId)) citedFileIds.add(0, cfId);
                        }
                    });
                } catch (Exception ignored) {}
            }

            // ── Step 5: Augmented prompt construction ─────────────────────────
            StringBuilder promptBuilder = new StringBuilder();
            promptBuilder.append("You are CodeCompass, an expert AI assistant answering questions about a specific codebase.\n");
            promptBuilder.append("Repository: ").append(repo.getGithubOwner()).append("/").append(repo.getGithubName()).append("\n");

            if (!retrievedChunks.isEmpty()) {
                promptBuilder.append("\n=== RELEVANT CODE CONTEXT ===\n");
                for (Map<String, Object> chunk : retrievedChunks) {
                    promptBuilder.append("\n--- File: ").append(chunk.get("file_path")).append(" ---\n");
                    promptBuilder.append(chunk.get("content")).append("\n");
                }
                promptBuilder.append("\n=== END CONTEXT ===\n");
            }

            if (!history.isEmpty()) {
                promptBuilder.append("\n=== CONVERSATION HISTORY ===\n");
                for (ChatMessage msg : history) {
                    promptBuilder.append(msg.getRole().toUpperCase()).append(": ").append(msg.getContent()).append("\n");
                }
            }

            promptBuilder.append("\nUSER: ").append(question).append("\nASSISTANT:");

            // ── Step 6: Stream via Python /internal/stream-chat ───────────────
            Map<String, Object> chatPayload = new HashMap<>();
            chatPayload.put("prompt", promptBuilder.toString());
            chatPayload.put("repo_id", repoId.toString());

            try {
                Map<String, Object> chatResp = pythonServiceClient.postToPython("/internal/chat", chatPayload);

                String aiText = "";
                if (chatResp != null && chatResp.containsKey("answer")) {
                    aiText = (String) chatResp.get("answer");
                }

                // Stream token-by-token simulation (in production use WebClient for real streaming)
                String[] words = aiText.split("(?<=\\s)");
                for (String word : words) {
                    fullResponse.append(word);
                    emitter.send(SseEmitter.event()
                        .name("token")
                        .data(word));
                    Thread.sleep(15); // simulate streaming cadence
                }

            } catch (Exception ex) {
                String fallback = "I encountered an error reaching the AI service. Please ensure the Python service is running. Error: " + ex.getMessage();
                fullResponse.append(fallback);
                emitter.send(SseEmitter.event().name("token").data(fallback));
            }

            // Send citation event
            if (!citedFileIds.isEmpty()) {
                List<String> citedIdStrings = citedFileIds.stream()
                    .map(UUID::toString).collect(Collectors.toList());
                emitter.send(SseEmitter.event()
                    .name("citations")
                    .data(String.join(",", citedIdStrings)));
            }

            emitter.send(SseEmitter.event().name("done").data("[DONE]"));
            emitter.complete();

            // ── Step 7: Persist AI message ────────────────────────────────────
            ChatMessage aiMsg = new ChatMessage();
            aiMsg.setSession(chatSessionRepository.getReferenceById(sessionId));
            aiMsg.setRole("assistant");
            aiMsg.setContent(fullResponse.toString());
            aiMsg.setCitedFileIds(citedFileIds);
            chatMessageRepository.save(aiMsg);

            // Update session last_message_at
            chatSessionRepository.findById(sessionId).ifPresent(s -> {
                s.setLastMessageAt(LocalDateTime.now());
                chatSessionRepository.save(s);
            });

        } catch (Exception e) {
            try {
                emitter.send(SseEmitter.event().name("error").data(e.getMessage()));
                emitter.complete();
            } catch (IOException ignored) {}
        }
    }

    @Async
    public void streamCrossRepoAnswer(List<UUID> repoIds, UUID userId,
                                      String question, SseEmitter emitter) {
        StringBuilder fullResponse = new StringBuilder();
        try {
            // Verify IDOR (User owns all repos) - This is already done in Controller, but good to be safe.
            List<Repository> repos = repositoryRepository.findAllById(repoIds);
            for (Repository r : repos) {
                if (!r.getUser().getId().equals(userId)) {
                    throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied to one or more repositories");
                }
            }

            // Retrieve context from all requested repos
            List<Map<String, Object>> allRetrievedChunks = new ArrayList<>();

            for (Repository r : repos) {
                Map<String, Object> searchPayload = new HashMap<>();
                searchPayload.put("repo_id", r.getId().toString());
                searchPayload.put("query", question);
                searchPayload.put("top_k", 3); // 3 per repo to avoid blowing up context

                try {
                    Map<String, Object> searchResult = pythonServiceClient.postToPython("/internal/search", searchPayload);
                    
                    if (searchResult != null && searchResult.containsKey("results")) {
                        Object results = searchResult.get("results");
                        if (results instanceof List) {
                            for (Object item : (List<?>) results) {
                                if (item instanceof Map) {
                                    Map<?, ?> resMap = (Map<?, ?>) item;
                                    String fileId = (String) resMap.get("file_id");
                                    if (fileId != null) {
                                        repoFileRepository.findById(UUID.fromString(fileId)).ifPresent(f -> {
                                            if (f.getRawContent() != null) {
                                                Map<String, Object> chunk = new HashMap<>();
                                                chunk.put("repo_name", r.getGithubOwner() + "/" + r.getGithubName());
                                                chunk.put("file_path", f.getFilePath());
                                                chunk.put("content", f.getRawContent().substring(0, Math.min(f.getRawContent().length(), 2000)));
                                                allRetrievedChunks.add(chunk);
                                            }
                                        });
                                    }
                                }
                            }
                        }
                    }
                } catch (Exception ex) {
                    // Ignore failures for individual repos, proceed with what we have
                }
            }

            // Build Augmented prompt
            StringBuilder promptBuilder = new StringBuilder();
            promptBuilder.append("You are CodeCompass, an expert AI assistant answering questions comparing multiple codebases.\n");
            
            if (!allRetrievedChunks.isEmpty()) {
                promptBuilder.append("\n=== RELEVANT CODE CONTEXT ===\n");
                for (Map<String, Object> chunk : allRetrievedChunks) {
                    promptBuilder.append("\n--- Repository: ").append(chunk.get("repo_name")).append(" | File: ").append(chunk.get("file_path")).append(" ---\n");
                    promptBuilder.append(chunk.get("content")).append("\n");
                }
                promptBuilder.append("\n=== END CONTEXT ===\n");
            }

            promptBuilder.append("\nUSER: ").append(question).append("\nASSISTANT:");

            Map<String, Object> chatPayload = new HashMap<>();
            chatPayload.put("prompt", promptBuilder.toString());
            // No specific repo_id for cross-repo chat, or just use the first one if required
            chatPayload.put("repo_id", repoIds.get(0).toString());

            try {
                Map<String, Object> chatResp = pythonServiceClient.postToPython("/internal/chat", chatPayload);

                String aiText = "";
                if (chatResp != null && chatResp.containsKey("answer")) {
                    aiText = (String) chatResp.get("answer");
                }

                String[] words = aiText.split("(?<=\\s)");
                for (String word : words) {
                    fullResponse.append(word);
                    emitter.send(SseEmitter.event().name("token").data(word));
                    Thread.sleep(15);
                }
            } catch (Exception ex) {
                String fallback = "Error reaching the AI service. " + ex.getMessage();
                emitter.send(SseEmitter.event().name("token").data(fallback));
            }

            emitter.send(SseEmitter.event().name("done").data("[DONE]"));
            emitter.complete();

        } catch (Exception e) {
            try {
                emitter.send(SseEmitter.event().name("error").data(e.getMessage()));
                emitter.complete();
            } catch (IOException ignored) {}
        }
    }
}

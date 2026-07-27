package com.codecompass.backend.controller;

import com.codecompass.backend.model.User;
import com.codecompass.backend.repository.UserRepository;
import com.codecompass.backend.service.RagService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import com.codecompass.backend.service.RagService;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/chat")
public class CrossRepoChatController {

    private final RagService ragService;
    private final UserRepository userRepository;

    public CrossRepoChatController(RagService ragService, UserRepository userRepository) {
        this.ragService = ragService;
        this.userRepository = userRepository;
    }

    public static class CrossRepoChatRequest {
        public List<UUID> repoIds;
        public String prompt;
    }

    @PostMapping(value = "/cross-repo", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter crossRepoChat(
            @RequestBody CrossRepoChatRequest request,
            Authentication auth) {

        UUID userId = UUID.fromString(auth.getName());
        User currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));

        if (request.repoIds == null || request.repoIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Must provide at least one repository ID");
        }

        if (request.prompt == null || request.prompt.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Prompt cannot be empty");
        }

        SseEmitter emitter = new SseEmitter(600000L); // 10 minutes timeout
        
        // Note: RagService handles the IDOR check for all repos
        ragService.streamCrossRepoAnswer(request.repoIds, currentUser.getId(), request.prompt, emitter);

        return emitter;
    }
}

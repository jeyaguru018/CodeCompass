package com.codecompass.backend.repository;

import com.codecompass.backend.model.ChatSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ChatSessionRepository extends JpaRepository<ChatSession, UUID> {
    List<ChatSession> findByUserIdAndRepositoryIdOrderByLastMessageAtDesc(UUID userId, UUID repoId);
    Optional<ChatSession> findByIdAndUserId(UUID id, UUID userId);
    Optional<ChatSession> findBySharedToken(String token);
}

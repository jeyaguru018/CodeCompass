package com.codecompass.backend.repository;

import com.codecompass.backend.model.Repository;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

import java.time.LocalDateTime;

public interface RepositoryRepository extends JpaRepository<Repository, UUID> {
    List<Repository> findByUserId(UUID userId);
    List<Repository> findByStatusInAndUpdatedAtBefore(List<String> statuses, LocalDateTime threshold);
    List<Repository> findByGithubOwnerAndGithubName(String githubOwner, String githubName);
}

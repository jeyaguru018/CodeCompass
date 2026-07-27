package com.codecompass.backend.repository;

import com.codecompass.backend.model.RepoFile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;

@Repository
public interface RepoFileRepository extends JpaRepository<RepoFile, UUID> {
    List<RepoFile> findByRepositoryId(UUID repoId);
    List<RepoFile> findByRepositoryIdOrderByFilePath(UUID repoId);
    long countByRepositoryId(UUID repoId);
    long countByRepositoryIdAndIsHotspotTrue(UUID repoId);
    List<RepoFile> findTop50ByRepositoryIdOrderByComplexityScoreDesc(UUID repoId);
}

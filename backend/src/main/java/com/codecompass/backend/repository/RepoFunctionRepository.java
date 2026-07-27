package com.codecompass.backend.repository;

import com.codecompass.backend.model.RepoFunction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;

@Repository
public interface RepoFunctionRepository extends JpaRepository<RepoFunction, UUID> {
    List<RepoFunction> findByRepositoryId(UUID repoId);
    List<RepoFunction> findByFileId(UUID fileId);
    List<RepoFunction> findByRepositoryIdAndFileId(UUID repoId, UUID fileId);
    long countByRepositoryId(UUID repoId);
}

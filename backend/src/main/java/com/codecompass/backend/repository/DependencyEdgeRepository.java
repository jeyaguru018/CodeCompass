package com.codecompass.backend.repository;

import com.codecompass.backend.model.DependencyEdge;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;

@Repository
public interface DependencyEdgeRepository extends JpaRepository<DependencyEdge, UUID> {
    List<DependencyEdge> findByRepositoryId(UUID repoId);
    void deleteByRepositoryId(UUID repoId);
}

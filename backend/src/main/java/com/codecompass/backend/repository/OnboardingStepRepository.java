package com.codecompass.backend.repository;

import com.codecompass.backend.model.OnboardingStep;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;

@Repository
public interface OnboardingStepRepository extends JpaRepository<OnboardingStep, UUID> {
    List<OnboardingStep> findByRepositoryIdOrderByStepOrder(UUID repoId);
    void deleteByRepositoryId(UUID repoId);
}

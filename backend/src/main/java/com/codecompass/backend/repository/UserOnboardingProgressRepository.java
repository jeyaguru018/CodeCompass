package com.codecompass.backend.repository;

import com.codecompass.backend.model.UserOnboardingProgress;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserOnboardingProgressRepository extends JpaRepository<UserOnboardingProgress, UUID> {
    List<UserOnboardingProgress> findByUserId(UUID userId);
    Optional<UserOnboardingProgress> findByUserIdAndStepId(UUID userId, UUID stepId);
    boolean existsByUserIdAndStepId(UUID userId, UUID stepId);
    long countByUserIdAndStepIdIn(UUID userId, List<UUID> stepIds);
    void deleteByStepId(UUID stepId);
}

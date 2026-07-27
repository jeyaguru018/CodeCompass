package com.codecompass.backend.model;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "onboarding_steps")
public class OnboardingStep {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "repo_id", nullable = false)
    private Repository repository;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "file_id", nullable = false)
    private RepoFile file;

    @Column(name = "step_order", nullable = false)
    private Integer stepOrder;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String reason;

    @Column(name = "estimated_minutes")
    private Integer estimatedMinutes = 10;

    public OnboardingStep() {}

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public Repository getRepository() { return repository; }
    public void setRepository(Repository repository) { this.repository = repository; }
    public RepoFile getFile() { return file; }
    public void setFile(RepoFile file) { this.file = file; }
    public Integer getStepOrder() { return stepOrder; }
    public void setStepOrder(Integer stepOrder) { this.stepOrder = stepOrder; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public Integer getEstimatedMinutes() { return estimatedMinutes; }
    public void setEstimatedMinutes(Integer estimatedMinutes) { this.estimatedMinutes = estimatedMinutes; }
}

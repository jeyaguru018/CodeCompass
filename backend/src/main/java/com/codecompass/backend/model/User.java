package com.codecompass.backend.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(
    name = "users",
    indexes = {
        @Index(name = "idx_user_email", columnList = "email"),
        @Index(name = "idx_user_github_login", columnList = "github_login")
    }
)
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(name = "github_login", unique = true)
    private String githubLogin;

    @Column(name = "github_access_token", columnDefinition = "TEXT")
    private String githubAccessToken;

    @Column(length = 20)
    private String plan = "free";

    @Column(name = "ai_tokens_used")
    private Integer aiTokensUsed = 0;

    @Column(name = "ai_tokens_reset_at", nullable = false)
    private LocalDateTime aiTokensResetAt = LocalDateTime.now().plusMonths(1);

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    public User() {}

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getGithubLogin() { return githubLogin; }
    public void setGithubLogin(String githubLogin) { this.githubLogin = githubLogin; }
    public String getGithubAccessToken() { return githubAccessToken; }
    public void setGithubAccessToken(String githubAccessToken) { this.githubAccessToken = githubAccessToken; }
    public String getPlan() { return plan; }
    public void setPlan(String plan) { this.plan = plan; }
    public Integer getAiTokensUsed() { return aiTokensUsed; }
    public void setAiTokensUsed(Integer aiTokensUsed) { this.aiTokensUsed = aiTokensUsed; }
    public LocalDateTime getAiTokensResetAt() { return aiTokensResetAt; }
    public void setAiTokensResetAt(LocalDateTime aiTokensResetAt) { this.aiTokensResetAt = aiTokensResetAt; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getLastLoginAt() { return lastLoginAt; }
    public void setLastLoginAt(LocalDateTime lastLoginAt) { this.lastLoginAt = lastLoginAt; }
}

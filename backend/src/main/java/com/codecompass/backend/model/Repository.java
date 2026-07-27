package com.codecompass.backend.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(
    name = "repositories",
    indexes = {
        @Index(name = "idx_repo_user_id", columnList = "user_id"),
        @Index(name = "idx_repo_user_status", columnList = "user_id, status")
    }
)
public class Repository {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "github_owner", nullable = false, length = 120)
    private String githubOwner;

    @Column(name = "github_name", nullable = false, length = 120)
    private String githubName;

    @Column(name = "github_url", nullable = false, columnDefinition = "TEXT")
    private String githubUrl;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "primary_language", length = 60)
    private String primaryLanguage;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "language_breakdown", columnDefinition = "jsonb")
    private String languageBreakdown;

    @Column(name = "star_count")
    private Integer starCount = 0;

    @Column(name = "fork_count")
    private Integer forkCount = 0;

    @Column(length = 30)
    private String status = "PENDING";

    @Column(name = "analysis_progress")
    private Integer analysisProgress = 0;

    @Column(name = "analysis_step", columnDefinition = "TEXT")
    private String analysisStep;

    @Column(name = "faiss_index_id", length = 120)
    private String faissIndexId;

    @Column(name = "faiss_index_data")
    private byte[] faissIndexData; // Stored as bytea

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "faiss_chunk_map", columnDefinition = "jsonb")
    private String faissChunkMap;

    @Column(name = "file_count")
    private Integer fileCount = 0;

    @Column(name = "function_count")
    private Integer functionCount = 0;

    @Column(name = "hotspot_count")
    private Integer hotspotCount = 0;

    @Column(name = "ai_summary", columnDefinition = "TEXT")
    private String aiSummary;

    @Column(name = "analyzed_at")
    private LocalDateTime analyzedAt;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Repository() {}

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getGithubOwner() { return githubOwner; }
    public void setGithubOwner(String githubOwner) { this.githubOwner = githubOwner; }
    public String getGithubName() { return githubName; }
    public void setGithubName(String githubName) { this.githubName = githubName; }
    public String getGithubUrl() { return githubUrl; }
    public void setGithubUrl(String githubUrl) { this.githubUrl = githubUrl; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getPrimaryLanguage() { return primaryLanguage; }
    public void setPrimaryLanguage(String primaryLanguage) { this.primaryLanguage = primaryLanguage; }
    public String getLanguageBreakdown() { return languageBreakdown; }
    public void setLanguageBreakdown(String languageBreakdown) { this.languageBreakdown = languageBreakdown; }
    public Integer getStarCount() { return starCount; }
    public void setStarCount(Integer starCount) { this.starCount = starCount; }
    public Integer getForkCount() { return forkCount; }
    public void setForkCount(Integer forkCount) { this.forkCount = forkCount; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Integer getAnalysisProgress() { return analysisProgress; }
    public void setAnalysisProgress(Integer analysisProgress) { this.analysisProgress = analysisProgress; }
    public String getAnalysisStep() { return analysisStep; }
    public void setAnalysisStep(String analysisStep) { this.analysisStep = analysisStep; }
    public String getFaissIndexId() { return faissIndexId; }
    public void setFaissIndexId(String faissIndexId) { this.faissIndexId = faissIndexId; }
    public byte[] getFaissIndexData() { return faissIndexData; }
    public void setFaissIndexData(byte[] faissIndexData) { this.faissIndexData = faissIndexData; }
    public String getFaissChunkMap() { return faissChunkMap; }
    public void setFaissChunkMap(String faissChunkMap) { this.faissChunkMap = faissChunkMap; }
    public Integer getFileCount() { return fileCount; }
    public void setFileCount(Integer fileCount) { this.fileCount = fileCount; }
    public Integer getFunctionCount() { return functionCount; }
    public void setFunctionCount(Integer functionCount) { this.functionCount = functionCount; }
    public Integer getHotspotCount() { return hotspotCount; }
    public void setHotspotCount(Integer hotspotCount) { this.hotspotCount = hotspotCount; }
    public String getAiSummary() { return aiSummary; }
    public void setAiSummary(String aiSummary) { this.aiSummary = aiSummary; }
    public LocalDateTime getAnalyzedAt() { return analyzedAt; }
    public void setAnalyzedAt(LocalDateTime analyzedAt) { this.analyzedAt = analyzedAt; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}

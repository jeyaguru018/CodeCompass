package com.codecompass.backend.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.util.List;

@Entity
@Table(
    name = "repo_files",
    indexes = {
        @Index(name = "idx_repofile_repo_id", columnList = "repo_id"),
        @Index(name = "idx_repofile_repo_path", columnList = "repo_id, file_path")
    }
)
public class RepoFile {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "repo_id", nullable = false)
    private Repository repository;

    @Column(name = "file_path", nullable = false, columnDefinition = "TEXT")
    private String filePath;

    @Column(name = "file_name", nullable = false)
    private String fileName;

    @Column(length = 60)
    private String language;

    @Column(name = "size_bytes")
    private Integer sizeBytes = 0;

    @Column(name = "line_count")
    private Integer lineCount = 0;

    @Column(name = "complexity_score")
    private Float complexityScore = 0.0f;

    @Column(name = "churn_score")
    private Float churnScore = 0.0f;

    @Column(name = "hotspot_score")
    private Float hotspotScore = 0.0f;

    @Column(name = "is_hotspot")
    private Boolean isHotspot = false;

    @Column(name = "is_entry_point")
    private Boolean isEntryPoint = false;

    @Column(name = "module_type", length = 60)
    private String moduleType = "utility";

    @Column(name = "ai_summary", columnDefinition = "TEXT")
    private String aiSummary;

    @Column(name = "raw_content", columnDefinition = "TEXT")
    private String rawContent;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "vector_chunk_ids", columnDefinition = "jsonb")
    private List<String> vectorChunkIds;

    @Column(name = "last_commit_at")
    private LocalDateTime lastCommitAt;

    @Column(name = "last_commit_message", columnDefinition = "TEXT")
    private String lastCommitMessage;

    public RepoFile() {}

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public Repository getRepository() { return repository; }
    public void setRepository(Repository repository) { this.repository = repository; }
    public String getFilePath() { return filePath; }
    public void setFilePath(String filePath) { this.filePath = filePath; }
    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }
    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }
    public Integer getSizeBytes() { return sizeBytes; }
    public void setSizeBytes(Integer sizeBytes) { this.sizeBytes = sizeBytes; }
    public Integer getLineCount() { return lineCount; }
    public void setLineCount(Integer lineCount) { this.lineCount = lineCount; }
    public Float getComplexityScore() { return complexityScore; }
    public void setComplexityScore(Float complexityScore) { this.complexityScore = complexityScore; }
    public Float getChurnScore() { return churnScore; }
    public void setChurnScore(Float churnScore) { this.churnScore = churnScore; }
    public Float getHotspotScore() { return hotspotScore; }
    public void setHotspotScore(Float hotspotScore) { this.hotspotScore = hotspotScore; }
    public Boolean getIsHotspot() { return isHotspot; }
    public void setIsHotspot(Boolean isHotspot) { this.isHotspot = isHotspot; }
    public Boolean getIsEntryPoint() { return isEntryPoint; }
    public void setIsEntryPoint(Boolean isEntryPoint) { this.isEntryPoint = isEntryPoint; }
    public String getModuleType() { return moduleType; }
    public void setModuleType(String moduleType) { this.moduleType = moduleType; }
    public String getAiSummary() { return aiSummary; }
    public void setAiSummary(String aiSummary) { this.aiSummary = aiSummary; }
    public String getRawContent() { return rawContent; }
    public void setRawContent(String rawContent) { this.rawContent = rawContent; }
    public List<String> getVectorChunkIds() { return vectorChunkIds; }
    public void setVectorChunkIds(List<String> vectorChunkIds) { this.vectorChunkIds = vectorChunkIds; }
    public LocalDateTime getLastCommitAt() { return lastCommitAt; }
    public void setLastCommitAt(LocalDateTime lastCommitAt) { this.lastCommitAt = lastCommitAt; }
    public String getLastCommitMessage() { return lastCommitMessage; }
    public void setLastCommitMessage(String lastCommitMessage) { this.lastCommitMessage = lastCommitMessage; }
}

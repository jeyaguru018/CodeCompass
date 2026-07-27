package com.codecompass.backend.model;

import jakarta.persistence.*;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.util.List;

@Entity
@Table(
    name = "repo_functions",
    indexes = {
        @Index(name = "idx_repofunc_file_id", columnList = "file_id"),
        @Index(name = "idx_repofunc_repo_id", columnList = "repo_id")
    }
)
public class RepoFunction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "file_id", nullable = false)
    private RepoFile file;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "repo_id", nullable = false)
    private Repository repository;

    @Column(name = "function_name", nullable = false)
    private String functionName;

    @Column(name = "class_name")
    private String className;

    @Column(name = "start_line", nullable = false)
    private Integer startLine;

    @Column(name = "end_line", nullable = false)
    private Integer endLine;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private List<String> parameters;

    @Column(name = "return_type", columnDefinition = "TEXT")
    private String returnType;

    @Column(name = "content", columnDefinition = "TEXT")
    private String content;

    @Column(name = "faiss_id")
    private Long faissId;

    @Column(name = "complexity_score")
    private Float complexityScore = 0.0f;

    @Column(name = "ai_summary", columnDefinition = "TEXT")
    private String aiSummary;

    public RepoFunction() {}

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public RepoFile getFile() { return file; }
    public void setFile(RepoFile file) { this.file = file; }
    public Repository getRepository() { return repository; }
    public void setRepository(Repository repository) { this.repository = repository; }
    public String getFunctionName() { return functionName; }
    public void setFunctionName(String functionName) { this.functionName = functionName; }
    public String getClassName() { return className; }
    public void setClassName(String className) { this.className = className; }
    public Integer getStartLine() { return startLine; }
    public void setStartLine(Integer startLine) { this.startLine = startLine; }
    public Integer getEndLine() { return endLine; }
    public void setEndLine(Integer endLine) { this.endLine = endLine; }
    public Long getFaissId() { return faissId; }
    public void setFaissId(Long faissId) { this.faissId = faissId; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public List<String> getParameters() { return parameters; }
    public void setParameters(List<String> parameters) { this.parameters = parameters; }
    public String getReturnType() { return returnType; }
    public void setReturnType(String returnType) { this.returnType = returnType; }
    public Float getComplexityScore() { return complexityScore; }
    public void setComplexityScore(Float complexityScore) { this.complexityScore = complexityScore; }
    public String getAiSummary() { return aiSummary; }
    public void setAiSummary(String aiSummary) { this.aiSummary = aiSummary; }
}

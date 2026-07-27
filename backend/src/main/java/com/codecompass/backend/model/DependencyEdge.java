package com.codecompass.backend.model;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(
    name = "dependency_edges",
    indexes = {
        @Index(name = "idx_dep_edge_repo_id", columnList = "repo_id"),
        @Index(name = "idx_dep_edge_source", columnList = "source_file_id"),
        @Index(name = "idx_dep_edge_target", columnList = "target_file_id")
    }
)
public class DependencyEdge {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "repo_id", nullable = false)
    private Repository repository;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_file_id", nullable = false)
    private RepoFile sourceFile;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_file_id")
    private RepoFile targetFile;

    @Column(name = "import_statement", nullable = false, columnDefinition = "TEXT")
    private String importStatement;

    @Column(name = "is_external")
    private Boolean isExternal = false;

    @Column(name = "external_package")
    private String externalPackage;

    public DependencyEdge() {}

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public Repository getRepository() { return repository; }
    public void setRepository(Repository repository) { this.repository = repository; }
    public RepoFile getSourceFile() { return sourceFile; }
    public void setSourceFile(RepoFile sourceFile) { this.sourceFile = sourceFile; }
    public RepoFile getTargetFile() { return targetFile; }
    public void setTargetFile(RepoFile targetFile) { this.targetFile = targetFile; }
    public String getImportStatement() { return importStatement; }
    public void setImportStatement(String importStatement) { this.importStatement = importStatement; }
    public Boolean getIsExternal() { return isExternal; }
    public void setIsExternal(Boolean isExternal) { this.isExternal = isExternal; }
    public String getExternalPackage() { return externalPackage; }
    public void setExternalPackage(String externalPackage) { this.externalPackage = externalPackage; }
}

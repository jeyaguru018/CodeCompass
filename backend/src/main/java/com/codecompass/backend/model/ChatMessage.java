package com.codecompass.backend.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.util.List;

@Entity
@Table(
    name = "chat_messages",
    indexes = {
        @Index(name = "idx_chatmsg_session_created", columnList = "session_id, created_at")
    }
)
public class ChatMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    private ChatSession session;

    @Column(length = 20, nullable = false)
    private String role; // 'user' or 'assistant'

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "context_file_id")
    private RepoFile contextFile;

    @Column(name = "context_function")
    private String contextFunction;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "cited_file_ids", columnDefinition = "jsonb")
    private List<UUID> citedFileIds;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "cited_line_ranges", columnDefinition = "jsonb")
    private String citedLineRanges;

    @Column(name = "tokens_used")
    private Integer tokensUsed = 0;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();

    public ChatMessage() {}

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public ChatSession getSession() { return session; }
    public void setSession(ChatSession session) { this.session = session; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public RepoFile getContextFile() { return contextFile; }
    public void setContextFile(RepoFile contextFile) { this.contextFile = contextFile; }
    public String getContextFunction() { return contextFunction; }
    public void setContextFunction(String contextFunction) { this.contextFunction = contextFunction; }
    public List<UUID> getCitedFileIds() { return citedFileIds; }
    public void setCitedFileIds(List<UUID> citedFileIds) { this.citedFileIds = citedFileIds; }
    public String getCitedLineRanges() { return citedLineRanges; }
    public void setCitedLineRanges(String citedLineRanges) { this.citedLineRanges = citedLineRanges; }
    public Integer getTokensUsed() { return tokensUsed; }
    public void setTokensUsed(Integer tokensUsed) { this.tokensUsed = tokensUsed; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}

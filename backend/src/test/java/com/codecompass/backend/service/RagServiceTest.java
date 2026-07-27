package com.codecompass.backend.service;

import com.codecompass.backend.model.*;
import com.codecompass.backend.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpEntity;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class RagServiceTest {

    @Mock
    private RepositoryRepository repositoryRepository;

    @Mock
    private RepoFileRepository repoFileRepository;

    @Mock
    private ChatMessageRepository chatMessageRepository;

    @Mock
    private ChatSessionRepository chatSessionRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private RestTemplate restTemplate;

    @InjectMocks
    private RagService ragService;

    @BeforeEach
    void setUp() {
        // Reflection to set @Value fields
        org.springframework.test.util.ReflectionTestUtils.setField(ragService, "pythonServiceUrl", "http://localhost:8000");
        org.springframework.test.util.ReflectionTestUtils.setField(ragService, "internalSecret", "secret");
    }

    @Test
    void testStreamAnswerConstructsCorrectPromptAndPersistsAIResponse() throws Exception {
        // Arrange
        UUID repoId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID contextFileId = UUID.randomUUID();
        String question = "How does authentication work?";

        Repository repo = new Repository();
        repo.setId(repoId);
        repo.setGithubOwner("owner");
        repo.setGithubName("repo");
        when(repositoryRepository.findById(repoId)).thenReturn(Optional.of(repo));

        ChatMessage msgHistory = new ChatMessage();
        msgHistory.setRole("user");
        msgHistory.setContent("Previous message");
        when(chatMessageRepository.findTop8BySessionIdOrderByCreatedAtDesc(sessionId))
                .thenReturn(Collections.singletonList(msgHistory));

        // Mock FAISS search response from Python
        Map<String, Object> searchRespBody = new HashMap<>();
        searchRespBody.put("results", Arrays.asList(Map.of("file_id", UUID.randomUUID().toString())));
        ResponseEntity<Map> searchResp = ResponseEntity.ok(searchRespBody);
        when(restTemplate.postForEntity(eq("http://localhost:8000/internal/search"), any(HttpEntity.class), eq(Map.class)))
                .thenReturn(searchResp);

        // Mock File Repository for the context chunk
        RepoFile mockFile = new RepoFile();
        mockFile.setId(contextFileId);
        mockFile.setFilePath("src/auth.ts");
        mockFile.setRawContent("export function login() { return true; }");
        when(repoFileRepository.findById(any(UUID.class))).thenReturn(Optional.of(mockFile));

        // Mock Chat response from Python
        Map<String, Object> chatRespBody = new HashMap<>();
        chatRespBody.put("answer", "Auth works via JWT tokens.");
        ResponseEntity<Map> chatResp = ResponseEntity.ok(chatRespBody);
        when(restTemplate.postForEntity(eq("http://localhost:8000/internal/chat"), any(HttpEntity.class), eq(Map.class)))
                .thenReturn(chatResp);

        SseEmitter mockEmitter = mock(SseEmitter.class);

        // Act
        ragService.streamAnswer(repoId, sessionId, userId, question, contextFileId.toString(), mockEmitter);

        // Assert Step 1: Prompt Construction sent to python /internal/chat
        ArgumentCaptor<HttpEntity> entityCaptor = ArgumentCaptor.forClass(HttpEntity.class);
        verify(restTemplate).postForEntity(eq("http://localhost:8000/internal/chat"), entityCaptor.capture(), eq(Map.class));
        
        Map<String, Object> payload = (Map<String, Object>) entityCaptor.getValue().getBody();
        String prompt = (String) payload.get("prompt");
        
        assertTrue(prompt.contains("Repository: owner/repo"));
        assertTrue(prompt.contains("=== RELEVANT CODE CONTEXT ==="));
        assertTrue(prompt.contains("src/auth.ts"));
        assertTrue(prompt.contains("export function login"));
        assertTrue(prompt.contains("Previous message"));
        assertTrue(prompt.contains(question));

        // Assert Step 2: Emitter was used to stream the response
        verify(mockEmitter, atLeastOnce()).send(any(SseEmitter.SseEventBuilder.class));
        verify(mockEmitter, times(1)).complete();

        // Assert Step 3: AI Message was persisted
        ArgumentCaptor<ChatMessage> msgCaptor = ArgumentCaptor.forClass(ChatMessage.class);
        verify(chatMessageRepository).save(msgCaptor.capture());
        
        ChatMessage savedMsg = msgCaptor.getValue();
        assertEquals("assistant", savedMsg.getRole());
        assertEquals("Auth works via JWT tokens.", savedMsg.getContent());
        assertNotNull(savedMsg.getCitedFileIds());
    }
}

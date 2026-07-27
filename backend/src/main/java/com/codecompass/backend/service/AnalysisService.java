package com.codecompass.backend.service;

import com.codecompass.backend.model.*;
import com.codecompass.backend.repository.*;
import com.codecompass.backend.security.AES256EncryptionUtil;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.*;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Owns the entire 7-stage analysis pipeline.
 * GitHub fetching, Python service calls, DB writes — all in Java.
 * Python service is stateless: it receives raw data and returns structured results.
 */
@Service
public class AnalysisService {

    private final RepositoryRepository repositoryRepository;
    private final UserRepository userRepository;
    private final RepoFileRepository repoFileRepository;
    private final RepoFunctionRepository repoFunctionRepository;
    private final DependencyEdgeRepository dependencyEdgeRepository;
    private final OnboardingStepRepository onboardingStepRepository;
    private final RestTemplate restTemplate;
    private final AES256EncryptionUtil encryptionUtil;
    private final StringRedisTemplate redisTemplate;
    private final PythonServiceClient pythonServiceClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${app.python-service-url:http://localhost:8000}")
    private String pythonServiceUrl;

    @Value("${app.internal-secret:default-secret}")
    private String internalSecret;

    @Value("${gemini.api-key:}")
    private String geminiApiKey;

    public AnalysisService(RepositoryRepository repositoryRepository,
                           UserRepository userRepository,
                           RepoFileRepository repoFileRepository,
                           RepoFunctionRepository repoFunctionRepository,
                           DependencyEdgeRepository dependencyEdgeRepository,
                           OnboardingStepRepository onboardingStepRepository,
                           RestTemplate restTemplate,
                           AES256EncryptionUtil encryptionUtil,
                           StringRedisTemplate redisTemplate,
                           PythonServiceClient pythonServiceClient) {
        this.repositoryRepository = repositoryRepository;
        this.userRepository = userRepository;
        this.repoFileRepository = repoFileRepository;
        this.repoFunctionRepository = repoFunctionRepository;
        this.dependencyEdgeRepository = dependencyEdgeRepository;
        this.onboardingStepRepository = onboardingStepRepository;
        this.restTemplate = restTemplate;
        this.encryptionUtil = encryptionUtil;
        this.redisTemplate = redisTemplate;
        this.pythonServiceClient = pythonServiceClient;
    }

    // ─── Start (synchronous — returns immediately) ────────────────────────────
    @Transactional
    public Repository startAnalysis(UUID userId, String githubUrl) {
        User user = userRepository.findById(userId).orElseThrow();

        String[] parts = githubUrl.replaceAll("\\.git$", "").trim().split("/");
        String owner = parts[parts.length - 2];
        String name  = parts[parts.length - 1];
        
        String lockKey = "lock:analyze:" + userId.toString() + ":" + owner + "/" + name;
        Boolean acquired = redisTemplate.opsForValue().setIfAbsent(lockKey, "PROCESSING", Duration.ofMinutes(15));
        if (Boolean.FALSE.equals(acquired)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Analysis for this repository is already in progress.");
        }

        Repository repo = new Repository();
        repo.setUser(user);
        repo.setGithubUrl(githubUrl);
        repo.setGithubOwner(owner);
        repo.setGithubName(name);
        repo.setStatus("PENDING");
        repo.setAnalysisProgress(0);
        repo.setAnalysisStep("Queued");
        return repositoryRepository.save(repo);
    }

    // ─── Main pipeline (async) ────────────────────────────────────────────────
    @Async
    public void processAnalysis(UUID repoId, UUID userId) {
        Repository repo = repositoryRepository.findById(repoId).orElseThrow();
        User user = userRepository.findById(userId).orElseThrow();

        String githubToken = null;
        if (user.getGithubAccessToken() != null) {
            try {
                githubToken = encryptionUtil.decrypt(user.getGithubAccessToken());
            } catch (Exception e) {
                // token decryption failure: log and continue with unauthenticated (public repos only)
            }
        }

        try {
            // ── Stage 1: CLONING ──────────────────────────────────────────────
            updateProgress(repoId, "CLONING", 10, "Connecting to GitHub API...");
            Map<String, Object> repoMeta = fetchRepoMetadata(repo.getGithubOwner(), repo.getGithubName(), githubToken);
            String defaultBranch = (String) repoMeta.getOrDefault("default_branch", "main");
            repo = repositoryRepository.findById(repoId).orElseThrow();
            repo.setDescription((String) repoMeta.get("description"));
            repo.setPrimaryLanguage((String) repoMeta.get("language"));
            repo.setStarCount((Integer) repoMeta.getOrDefault("stargazers_count", 0));
            repo.setForkCount((Integer) repoMeta.getOrDefault("forks_count", 0));
            repositoryRepository.save(repo);

            // Fetch the full file tree
            List<Map<String, Object>> treeItems = fetchFileTree(repo.getGithubOwner(), repo.getGithubName(), defaultBranch, githubToken);
            // Download content for each file (skip binary and >1MB)
            List<Map<String, Object>> files = downloadFileContents(repo.getGithubOwner(), repo.getGithubName(), treeItems, githubToken);

            // ── Stage 2: PARSING ──────────────────────────────────────────────
            updateProgress(repoId, "PARSING", 30, "Running AST Code Parsing across " + files.size() + " files...");

            // Send all files to Python /internal/parse
            Map<String, Object> parsePayload = new HashMap<>();
            parsePayload.put("repo_id", repoId.toString());
            parsePayload.put("github_owner", repo.getGithubOwner());
            parsePayload.put("github_name", repo.getGithubName());
            if (githubToken != null) {
                parsePayload.put("github_token", githubToken);
            }
            parsePayload.put("files", files);

            Map<String, Object> parseResult = pythonServiceClient.postToPython("/internal/parse", parsePayload);

            // Fetch Git Churn
            updateProgress(repoId, "PARSING", 40, "Fetching Git Churn data...");
            Map<String, Integer> fileChurn = fetchGitChurn(repo.getGithubOwner(), repo.getGithubName(), files, githubToken);

            // Java writes parsed results to Postgres
            List<RepoFile> savedFiles = persistParsedFiles(repoId, files, parseResult, fileChurn);
            List<RepoFunction> savedFunctions = persistFunctions(repoId, savedFiles, parseResult);

            // ── Stage 3: GRAPH ────────────────────────────────────────────────
            updateProgress(repoId, "GRAPH", 50, "Building Dependency Graph...");
            persistDependencyEdges(repoId, savedFiles, parseResult);

            // ── Stage 4: EMBEDDING ────────────────────────────────────────────
            updateProgress(repoId, "EMBEDDING", 65, "Generating Vector Embeddings...");

            // Build embed payload: file content chunks for FAISS
            List<Map<String, Object>> embedFiles = new ArrayList<>();
            for (RepoFile rf : savedFiles) {
                if (rf.getRawContent() != null && !rf.getRawContent().isBlank()) {
                    Map<String, Object> ef = new HashMap<>();
                    ef.put("file_id", rf.getId().toString());
                    ef.put("content", rf.getRawContent());
                    embedFiles.add(ef);
                }
            }
            Map<String, Object> embedPayload = new HashMap<>();
            embedPayload.put("repo_id", repoId.toString());
            embedPayload.put("files", embedFiles);

            Map<String, Object> embedResult = pythonServiceClient.postToPython("/internal/embed", embedPayload);

            // Python returns serialized FAISS index as base64 bytes — Java stores as bytea
            if (embedResult.containsKey("faiss_index_base64")) {
                byte[] faissBytes = Base64.getDecoder().decode((String) embedResult.get("faiss_index_base64"));
                repo = repositoryRepository.findById(repoId).orElseThrow();
                repo.setFaissIndexData(faissBytes);
                repo.setFaissIndexId(repoId.toString());
                
                if (embedResult.containsKey("chunk_to_file_map")) {
                    Object mapObj = embedResult.get("chunk_to_file_map");
                    try {
                        String mapJson = objectMapper.writeValueAsString(mapObj);
                        repo.setFaissChunkMap(mapJson);
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
                
                repositoryRepository.save(repo);
            }

            // ── Stage 5: SUMMARIZING ─────────────────────────────────────────
            updateProgress(repoId, "SUMMARIZING", 80, "Generating Plain-English Summaries...");

            // Send entry-point files to Python /internal/summarize; Python calls Gemini and returns JSON
            List<Map<String, Object>> entryFiles = new ArrayList<>();
            for (RepoFile rf : savedFiles) {
                if (Boolean.TRUE.equals(rf.getIsEntryPoint()) && rf.getRawContent() != null) {
                    Map<String, Object> ef = new HashMap<>();
                    ef.put("file_path", rf.getFilePath());
                    ef.put("content", rf.getRawContent().substring(0, Math.min(rf.getRawContent().length(), 4000)));
                    entryFiles.add(ef);
                }
            }
            Map<String, Object> summarizePayload = new HashMap<>();
            summarizePayload.put("repo_id", repoId.toString());
            summarizePayload.put("entry_files", entryFiles.isEmpty() ? files.subList(0, Math.min(5, files.size())) : entryFiles);

            Map<String, Object> summaryResult = pythonServiceClient.postToPython("/internal/summarize", summarizePayload);

            // Persist repo-level summary
            repo = repositoryRepository.findById(repoId).orElseThrow();
            if (summaryResult.containsKey("repo_summary")) {
                repo.setAiSummary((String) summaryResult.get("repo_summary"));
            }

            // Persist per-file summaries returned by Python
            if (summaryResult.containsKey("file_summaries")) {
                Object fs = summaryResult.get("file_summaries");
                if (fs instanceof List) {
                    for (Object item : (List<?>) fs) {
                        if (item instanceof Map) {
                            Map<?, ?> fMap = (Map<?, ?>) item;
                            String fileId = (String) fMap.get("file_id");
                            String summary = (String) fMap.get("summary");
                            if (fileId != null && summary != null) {
                                repoFileRepository.findById(UUID.fromString(fileId)).ifPresent(rf -> {
                                    rf.setAiSummary(summary);
                                    repoFileRepository.save(rf);
                                });
                            }
                        }
                    }
                }
            }

            // Summarize top methods (limit 50 to avoid long waits and quota)
            List<Map<String, Object>> methodPayloadList = new ArrayList<>();
            savedFunctions.stream()
                .filter(rf -> rf.getContent() != null && rf.getContent().length() > 20 && !rf.getFunctionName().startsWith("_"))
                .sorted((a, b) -> Float.compare(b.getComplexityScore() != null ? b.getComplexityScore() : 0, a.getComplexityScore() != null ? a.getComplexityScore() : 0))
                .limit(50)
                .forEach(rf -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("function_id", rf.getId().toString());
                    m.put("name", rf.getFunctionName());
                    m.put("content", rf.getContent());
                    methodPayloadList.add(m);
                });

            if (!methodPayloadList.isEmpty()) {
                Map<String, Object> methodPayload = new HashMap<>();
                methodPayload.put("repo_id", repoId.toString());
                methodPayload.put("methods", methodPayloadList);
                
                Map<String, Object> methodResult = pythonServiceClient.postToPython("/internal/summarize_methods", methodPayload);
                if (methodResult.containsKey("method_summaries")) {
                    Object ms = methodResult.get("method_summaries");
                    if (ms instanceof List) {
                        for (Object item : (List<?>) ms) {
                            if (item instanceof Map) {
                                Map<?, ?> mMap = (Map<?, ?>) item;
                                String funcId = (String) mMap.get("function_id");
                                String summary = (String) mMap.get("summary");
                                if (funcId != null && summary != null && !summary.isBlank()) {
                                    repoFunctionRepository.findById(UUID.fromString(funcId)).ifPresent(rf -> {
                                        rf.setAiSummary(summary);
                                        repoFunctionRepository.save(rf);
                                    });
                                }
                            }
                        }
                    }
                }
            }

            // Update aggregate counts
            repo.setFileCount((int) repoFileRepository.countByRepositoryId(repoId));
            repo.setFunctionCount((int) repoFunctionRepository.countByRepositoryId(repoId));
            repo.setHotspotCount((int) repoFileRepository.countByRepositoryIdAndIsHotspotTrue(repoId));
            repositoryRepository.save(repo);

            // ── Stage 6: ONBOARDING ───────────────────────────────────────────
            updateProgress(repoId, "ONBOARDING", 92, "Generating Onboarding Checklist...");

            Map<String, Object> onboardPayload = new HashMap<>();
            onboardPayload.put("repo_id", repoId.toString());
            onboardPayload.put("repo_summary", repo.getAiSummary() != null ? repo.getAiSummary() : "");

            // Collect top files by centrality for onboarding context
            List<Map<String, Object>> topFiles = new ArrayList<>();
            for (RepoFile rf : savedFiles) {
                Map<String, Object> tf = new HashMap<>();
                tf.put("file_id", rf.getId().toString());
                tf.put("file_path", rf.getFilePath());
                tf.put("is_entry_point", Boolean.TRUE.equals(rf.getIsEntryPoint()));
                tf.put("complexity_score", rf.getComplexityScore());
                topFiles.add(tf);
            }
            topFiles.sort((a, b) -> Boolean.TRUE.equals(b.get("is_entry_point")) ? 1 : -1);
            onboardPayload.put("files", topFiles.subList(0, Math.min(20, topFiles.size())));

            Map<String, Object> onboardResult = pythonServiceClient.postToPython("/internal/onboard", onboardPayload);

            // Persist onboarding steps
            if (onboardResult.containsKey("steps")) {
                Object stepsObj = onboardResult.get("steps");
                if (stepsObj instanceof List) {
                    onboardingStepRepository.deleteByRepositoryId(repoId);
                    int order = 1;
                    for (Object stepItem : (List<?>) stepsObj) {
                        if (stepItem instanceof Map) {
                            Map<String, Object> sMap = (Map<String, Object>) stepItem;
                            String fileId = (String) sMap.get("file_id");
                            if (fileId != null) {
                                repoFileRepository.findById(UUID.fromString(fileId)).ifPresent(rf -> {
                                    OnboardingStep step = new OnboardingStep();
                                    step.setRepository(repositoryRepository.getReferenceById(repoId));
                                    step.setFile(repoFileRepository.getReferenceById(rf.getId()));
                                    step.setStepOrder(((Number) sMap.getOrDefault("step_order", 1)).intValue());
                                    step.setReason(String.valueOf(sMap.getOrDefault("reason", "Recommended file to read.")));
                                    step.setEstimatedMinutes(((Number) sMap.getOrDefault("estimated_minutes", 10)).intValue());
                                    onboardingStepRepository.save(step);
                                });
                            }
                        }
                    }
                }
            }

            // ── Stage 7: COMPLETE ─────────────────────────────────────────────
            repo = repositoryRepository.findById(repoId).orElseThrow();
            repo.setStatus("COMPLETED");
            repo.setAnalysisProgress(100);
            repo.setAnalysisStep("Analysis Complete");
            repo.setAnalyzedAt(LocalDateTime.now());
            repositoryRepository.save(repo);

        } catch (Exception e) {
            e.printStackTrace();
            repo = repositoryRepository.findById(repoId).orElseThrow();
            repo.setStatus("FAILED");
            repo.setAnalysisStep("Error: " + truncate(e.getMessage(), 200));
            repositoryRepository.save(repo);
        } finally {
            String lockKey = "lock:analyze:" + userId.toString() + ":" + repo.getGithubOwner() + "/" + repo.getGithubName();
            redisTemplate.delete(lockKey);
        }
    }

    // ─── GitHub API helpers ───────────────────────────────────────────────────

    private Map<String, Object> fetchRepoMetadata(String owner, String name, String token) {
        HttpEntity<Void> entity = new HttpEntity<>(githubHeaders(token));
        ResponseEntity<Map> resp = restTemplate.exchange(
            "https://api.github.com/repos/" + owner + "/" + name,
            HttpMethod.GET, entity, Map.class);
        return resp.getBody() != null ? resp.getBody() : Map.of();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> fetchFileTree(String owner, String name, String branch, String token) {
        HttpEntity<Void> entity = new HttpEntity<>(githubHeaders(token));
        String url = "https://api.github.com/repos/" + owner + "/" + name + "/git/trees/" + branch + "?recursive=1";
        ResponseEntity<Map> resp = restTemplate.exchange(url, HttpMethod.GET, entity, Map.class);
        if (resp.getBody() == null) return List.of();
        List<Map<String, Object>> tree = (List<Map<String, Object>>) resp.getBody().get("tree");
        return tree != null ? tree : List.of();
    }

    private static final Set<String> SUPPORTED_EXTENSIONS = Set.of(
        "py", "js", "jsx", "ts", "tsx", "java", "kt", "go", "rs", "rb",
        "c", "cpp", "h", "cs", "php", "swift", "scala", "md", "json", "yml", "yaml", "toml", "xml"
    );
    private static final Set<String> SKIP_DIRS = Set.of("node_modules", ".git", ".idea", "target", "build", "dist", "__pycache__", ".gradle");

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> downloadFileContents(String owner, String name,
                                                            List<Map<String, Object>> treeItems, String token) {
        List<Map<String, Object>> result = new ArrayList<>();
        HttpEntity<Void> entity = new HttpEntity<>(githubHeaders(token));

        for (Map<String, Object> item : treeItems) {
            String type = (String) item.get("type");
            String path = (String) item.get("path");
            if (!"blob".equals(type) || path == null) continue;

            // Skip directories and unsupported files
            boolean skip = SKIP_DIRS.stream().anyMatch(d -> path.startsWith(d + "/") || path.contains("/" + d + "/"));
            if (skip) continue;

            String ext = path.contains(".") ? path.substring(path.lastIndexOf('.') + 1).toLowerCase() : "";
            if (!SUPPORTED_EXTENSIONS.contains(ext)) continue;

            Object sizeObj = item.get("size");
            long size = sizeObj instanceof Number ? ((Number) sizeObj).longValue() : 0L;
            if (size > 1_000_000) continue; // skip >1MB

            try {
                String url = "https://api.github.com/repos/" + owner + "/" + name + "/contents/" + path;
                ResponseEntity<Map> resp = restTemplate.exchange(url, HttpMethod.GET, entity, Map.class);
                if (resp.getBody() == null) continue;

                String encoding = (String) resp.getBody().get("encoding");
                String content = (String) resp.getBody().get("content");
                if (content == null) continue;

                String decoded;
                if ("base64".equals(encoding)) {
                    decoded = new String(Base64.getMimeDecoder().decode(content));
                } else {
                    decoded = content;
                }

                Map<String, Object> fileData = new HashMap<>();
                fileData.put("path", path);
                fileData.put("content", decoded);
                fileData.put("language", detectLanguage(ext));
                fileData.put("size", size);
                result.add(fileData);

                Thread.sleep(20); // gentle rate limiting ~50 req/s
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                break;
            } catch (Exception e) {
                // Skip files that error (e.g. rate limit) — log in production
            }
        }
        return result;
    }

    private HttpHeaders githubHeaders(String token) {
        HttpHeaders h = new HttpHeaders();
        h.setAccept(List.of(MediaType.APPLICATION_JSON));
        if (token != null) h.setBearerAuth(token);
        return h;
    }

    // ─── Persistence helpers ──────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private List<RepoFile> persistParsedFiles(UUID repoId, List<Map<String, Object>> rawFiles,
                                               Map<String, Object> parseResult, Map<String, Integer> fileChurn) {
        // Build a map from file path → parse result
        Map<String, Map<String, Object>> parseMap = new HashMap<>();
        Object parsedFilesObj = parseResult.get("files");
        if (parsedFilesObj instanceof List) {
            for (Object pf : (List<?>) parsedFilesObj) {
                if (pf instanceof Map) {
                    Map<String, Object> pfMap = (Map<String, Object>) pf;
                    parseMap.put((String) pfMap.get("path"), pfMap);
                }
            }
        }

        List<RepoFile> saved = new ArrayList<>();
        for (Map<String, Object> rawFile : rawFiles) {
            String path = (String) rawFile.get("path");
            String content = (String) rawFile.get("content");
            String lang = (String) rawFile.get("language");
            Object sizeObj = rawFile.get("size");
            int size = sizeObj instanceof Number ? ((Number) sizeObj).intValue() : 0;

            RepoFile rf = new RepoFile();
            rf.setRepository(repositoryRepository.getReferenceById(repoId));
            rf.setFilePath(path);
            rf.setFileName(path.contains("/") ? path.substring(path.lastIndexOf('/') + 1) : path);
            rf.setLanguage(lang);
            rf.setSizeBytes(size);
            rf.setLineCount(content != null ? content.split("\n").length : 0);
            rf.setRawContent(content != null && content.length() > 51200 ? content.substring(0, 51200) : content);

            // Apply parse results if available
            Map<String, Object> parsed = parseMap.get(path);
            if (parsed != null) {
                Object complexity = parsed.get("complexity_score");
                if (complexity instanceof Number) rf.setComplexityScore(((Number) complexity).floatValue());

                Integer churnCount = fileChurn.get(path);
                float churnScore = (churnCount != null) ? Math.min(100f, churnCount * 5f) : 0f;
                rf.setChurnScore(churnScore);

                float hs = rf.getComplexityScore() != null ? rf.getComplexityScore() : 0f;
                if (!fileChurn.isEmpty()) {
                    hs = hs * 0.6f + churnScore * 0.4f;
                }
                rf.setHotspotScore(hs);
                rf.setIsHotspot(hs >= 70f);

                Object isEntry = parsed.get("is_entry_point");
                rf.setIsEntryPoint(Boolean.TRUE.equals(isEntry));

                Object modType = parsed.get("module_type");
                rf.setModuleType(modType instanceof String ? (String) modType : "utility");
            }

            saved.add(repoFileRepository.save(rf));
        }
        return saved;
    }

    @SuppressWarnings("unchecked")
    private List<RepoFunction> persistFunctions(UUID repoId, List<RepoFile> savedFiles,
                                   Map<String, Object> parseResult) {
        List<RepoFunction> savedFunctions = new ArrayList<>();
        // Build path → file map
        Map<String, RepoFile> pathToFile = new HashMap<>();
        for (RepoFile rf : savedFiles) pathToFile.put(rf.getFilePath(), rf);

        Object parsedFilesObj = parseResult.get("files");
        if (!(parsedFilesObj instanceof List)) return savedFunctions;

        for (Object pf : (List<?>) parsedFilesObj) {
            if (!(pf instanceof Map)) continue;
            Map<String, Object> pfMap = (Map<String, Object>) pf;
            String path = (String) pfMap.get("path");
            RepoFile fileObj = pathToFile.get(path);
            if (fileObj == null) continue;

            String fileContent = fileObj.getRawContent();
            String[] lines = fileContent != null ? fileContent.split("\n", -1) : new String[0];

            Object funcsObj = pfMap.get("functions");
            if (!(funcsObj instanceof List)) continue;

            for (Object funcItem : (List<?>) funcsObj) {
                if (!(funcItem instanceof Map)) continue;
                Map<String, Object> fn = (Map<String, Object>) funcItem;

                RepoFunction rf = new RepoFunction();
                rf.setFile(repoFileRepository.getReferenceById(fileObj.getId()));
                rf.setRepository(repositoryRepository.getReferenceById(repoId));
                rf.setFunctionName((String) fn.getOrDefault("name", "unknown"));
                rf.setClassName((String) fn.get("class_name"));

                Object sl = fn.get("start_line");
                int startLine = sl instanceof Number ? ((Number) sl).intValue() : 0;
                rf.setStartLine(startLine);
                
                Object el = fn.get("end_line");
                int endLine = el instanceof Number ? ((Number) el).intValue() : 0;
                rf.setEndLine(endLine);

                // Extract content
                if (startLine > 0 && endLine >= startLine && lines.length >= endLine) {
                    StringBuilder sb = new StringBuilder();
                    for (int i = startLine - 1; i < endLine; i++) {
                        sb.append(lines[i]).append("\n");
                    }
                    rf.setContent(sb.toString().trim());
                }

                Object params = fn.get("parameters");
                if (params instanceof List) {
                    rf.setParameters((List<String>) params);
                }

                rf.setReturnType((String) fn.get("return_type"));

                Object cx = fn.get("complexity_score");
                if (cx instanceof Number) rf.setComplexityScore(((Number) cx).floatValue());

                savedFunctions.add(repoFunctionRepository.save(rf));
            }
        }
        return savedFunctions;
    }

    @SuppressWarnings("unchecked")
    private void persistDependencyEdges(UUID repoId, List<RepoFile> savedFiles,
                                         Map<String, Object> parseResult) {
        Map<String, UUID> pathToId = new HashMap<>();
        for (RepoFile rf : savedFiles) pathToId.put(rf.getFilePath(), rf.getId());

        dependencyEdgeRepository.deleteByRepositoryId(repoId);

        Object edgesObj = parseResult.get("edges");
        if (!(edgesObj instanceof List)) return;

        for (Object edgeItem : (List<?>) edgesObj) {
            if (!(edgeItem instanceof Map)) continue;
            Map<String, Object> em = (Map<String, Object>) edgeItem;

            String srcPath = (String) em.get("source");
            String tgtPath = (String) em.get("target");
            UUID srcId = pathToId.get(srcPath);
            if (srcId == null) continue;

            DependencyEdge edge = new DependencyEdge();
            edge.setRepository(repositoryRepository.getReferenceById(repoId));
            edge.setSourceFile(repoFileRepository.getReferenceById(srcId));
            edge.setImportStatement((String) em.getOrDefault("import_statement", ""));

            Boolean isExternal = (Boolean) em.get("is_external");
            edge.setIsExternal(Boolean.TRUE.equals(isExternal));

            if (Boolean.TRUE.equals(isExternal)) {
                edge.setExternalPackage((String) em.get("external_package"));
            } else if (tgtPath != null && pathToId.containsKey(tgtPath)) {
                edge.setTargetFile(repoFileRepository.getReferenceById(pathToId.get(tgtPath)));
            }

            dependencyEdgeRepository.save(edge);
        }
    }

    // ─── Utilities ────────────────────────────────────────────────────────────

    private void updateProgress(UUID repoId, String status, int progress, String step) {
        Repository repo = repositoryRepository.findById(repoId).orElseThrow();
        repo.setStatus(status);
        repo.setAnalysisProgress(progress);
        repo.setAnalysisStep(step);
        repositoryRepository.save(repo);
    }

    private String detectLanguage(String ext) {
        return switch (ext) {
            case "py" -> "Python";
            case "js", "jsx" -> "JavaScript";
            case "ts", "tsx" -> "TypeScript";
            case "java" -> "Java";
            case "kt" -> "Kotlin";
            case "go" -> "Go";
            case "rs" -> "Rust";
            case "rb" -> "Ruby";
            case "cs" -> "C#";
            case "cpp", "c", "h" -> "C/C++";
            case "php" -> "PHP";
            case "swift" -> "Swift";
            case "scala" -> "Scala";
            case "md" -> "Markdown";
            default -> "Unknown";
        };
    }

    private String truncate(String s, int max) {
        if (s == null) return "Unknown error";
        return s.length() > max ? s.substring(0, max) + "..." : s;
    }

    private Map<String, Integer> fetchGitChurn(String owner, String name, List<Map<String, Object>> files, String token) {
        Map<String, Integer> churnMap = new HashMap<>();
        HttpHeaders headers = githubHeaders(token);
        
        try {
            // Check rate limit first
            ResponseEntity<Map> rateResp = restTemplate.exchange(
                "https://api.github.com/rate_limit", HttpMethod.GET, new HttpEntity<>(headers), Map.class);
            if (rateResp.getBody() != null) {
                Map<String, Object> resources = (Map<String, Object>) rateResp.getBody().get("resources");
                Map<String, Object> core = (Map<String, Object>) resources.get("core");
                int remaining = (Integer) core.get("remaining");
                
                // Threshold: If remaining quota is less than (files.size() + 100), skip churn to protect the pipeline.
                if (remaining < files.size() + 100) {
                    System.out.println("WARNING: GitHub API quota too low (" + remaining + " remaining). Skipping churn calculation to protect pipeline.");
                    return churnMap; // Empty map means churn = 0
                }
            }
        } catch (Exception e) {
            System.out.println("Could not fetch rate limit: " + e.getMessage());
        }

        // Fetch churn for each file (only the last 6 months to be relevant)
        String sinceDate = LocalDateTime.now().minusMonths(6).toString();
        // GitHub API requires ISO 8601 format like YYYY-MM-DDTHH:MM:SSZ
        if (!sinceDate.endsWith("Z")) {
             sinceDate = sinceDate.split("\\.")[0] + "Z";
        }
        for (Map<String, Object> file : files) {
            String path = (String) file.get("path");
            try {
                ResponseEntity<List> commitResp = restTemplate.exchange(
                    "https://api.github.com/repos/" + owner + "/" + name + "/commits?path=" + path + "&since=" + sinceDate + "&per_page=100",
                    HttpMethod.GET, new HttpEntity<>(headers), List.class);
                if (commitResp.getBody() != null) {
                    churnMap.put(path, commitResp.getBody().size());
                }
                Thread.sleep(50); // Be nice to the API
            } catch (Exception e) {
                // If one file fails, we just leave its churn at 0 and continue. 
            }
        }
        return churnMap;
    }
}

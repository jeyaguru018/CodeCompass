package com.codecompass.backend.service;

import com.codecompass.backend.model.Repository;
import com.codecompass.backend.repository.RepositoryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class RepositoryAnalysisJanitor {

    private static final Logger log = LoggerFactory.getLogger(RepositoryAnalysisJanitor.class);
    private final RepositoryRepository repositoryRepository;
    private final StringRedisTemplate redisTemplate;

    public RepositoryAnalysisJanitor(RepositoryRepository repositoryRepository, StringRedisTemplate redisTemplate) {
        this.repositoryRepository = repositoryRepository;
        this.redisTemplate = redisTemplate;
    }

    /**
     * Runs every 60 seconds.
     * Looks for any repository stuck in "PROCESSING" or "PENDING" for more than 15 minutes.
     * If found, marks them as FAILED and forces the Redis lock to release.
     */
    @Scheduled(fixedRate = 60000)
    @Transactional
    public void cleanupHungAnalyses() {
        LocalDateTime threshold = LocalDateTime.now().minusMinutes(15);
        List<Repository> hungRepos = repositoryRepository.findByStatusInAndUpdatedAtBefore(
                List.of("PROCESSING", "PENDING"), threshold);

        for (Repository repo : hungRepos) {
            log.warn("Found hung analysis for repo {} (ID: {}). Last updated at {}. Marking as FAILED.",
                    repo.getGithubName(), repo.getId(), repo.getUpdatedAt());

            repo.setStatus("FAILED");
            repo.setAnalysisStep("Error: Analysis timed out or crashed mid-run.");
            repo.setUpdatedAt(LocalDateTime.now());
            repositoryRepository.save(repo);

            String lockKey = "lock:analyze:" + repo.getUser().getId() + ":" + repo.getGithubOwner() + "/" + repo.getGithubName();
            redisTemplate.delete(lockKey);
            log.info("Released redis lock: {}", lockKey);
        }
    }
}

package com.codecompass.backend.config;

import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.time.Duration;
import java.util.Map;

/**
 * Redis-backed Spring Cache configuration.
 *
 * Cache regions and TTLs:
 *   - repo-detail:   10 minutes  — GET /api/v1/repos/{id} (repo metadata, rarely changes)
 *   - repo-list:     2 minutes   — GET /api/v1/repos (dashboard listing, changes when repos are added/deleted)
 *   - repo-files:    15 minutes  — file tree data (only changes on re-analysis)
 *   - repo-graph:    15 minutes  — architecture graph (only changes on re-analysis)
 *
 * @CacheEvict is wired on deleteRepository() and reanalyzeRepository() in RepositoryController
 * to ensure stale data is never served after destructive operations.
 */
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public RedisCacheManager cacheManager(RedisConnectionFactory connectionFactory) {
        // Default: JSON serialization, no TTL (can be overridden per cache region)
        RedisCacheConfiguration defaultConfig = RedisCacheConfiguration.defaultCacheConfig()
            .serializeKeysWith(
                RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
            .serializeValuesWith(
                RedisSerializationContext.SerializationPair.fromSerializer(
                    new GenericJackson2JsonRedisSerializer()))
            .disableCachingNullValues();

        return RedisCacheManager.builder(connectionFactory)
            .cacheDefaults(defaultConfig.entryTtl(Duration.ofMinutes(5)))
            .withInitialCacheConfigurations(Map.of(
                "repo-detail", defaultConfig.entryTtl(Duration.ofMinutes(10)),
                "repo-list",   defaultConfig.entryTtl(Duration.ofMinutes(2)),
                "repo-files",  defaultConfig.entryTtl(Duration.ofMinutes(15)),
                "repo-graph",  defaultConfig.entryTtl(Duration.ofMinutes(15))
            ))
            .build();
    }
}

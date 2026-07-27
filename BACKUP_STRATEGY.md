# Backup & Recovery Strategy

## PostgreSQL Data

### Production (Cloud Deployment)
CodeCompass is designed to be deployed on platforms that provide automated Postgres backup:

| Platform | Backup Frequency | Retention | Point-in-Time Recovery |
|----------|-----------------|-----------|----------------------|
| **Render Postgres** | Daily snapshots | 7 days (free), 30 days (paid) | Yes (paid tier) |
| **Supabase** | Daily snapshots | 7 days | Yes (pro tier) |
| **Railway** | Daily snapshots | 7 days | No |
| **AWS RDS** | Configurable (1–35 days) | Per config | Yes |

**Recommended**: Supabase or Render — both provide automated daily snapshots with zero configuration.

### Manual Backup (Development / Self-hosted)
```bash
# Full logical dump
pg_dump -U postgres -d codecompass -F c -f codecompass_$(date +%Y%m%d).dump

# Restore
pg_restore -U postgres -d codecompass_restored codecompass_20260710.dump
```

### Docker Volume Backup
```bash
# Backup the Postgres Docker volume
docker exec codecompass-postgres pg_dump -U postgres codecompass | gzip > backup_$(date +%Y%m%d).sql.gz

# Restore
gunzip -c backup_20260710.sql.gz | docker exec -i codecompass-postgres psql -U postgres codecompass
```

---

## Application Rollback

### Strategy: Docker Image Tags
Every deployment produces a tagged Docker image. Rollback = redeploy the previous tag.

```bash
# Build and tag a release
docker build -t codecompass-backend:1.2.0 .
docker push ghcr.io/your-org/codecompass-backend:1.2.0

# Rollback to previous version (30-second rollback)
docker pull ghcr.io/your-org/codecompass-backend:1.1.0
docker stop codecompass-backend
docker run -d --name codecompass-backend ghcr.io/your-org/codecompass-backend:1.1.0
```

On Render/Railway: both platforms keep a deployment history — rollback is a single button click.

---

## Database Schema Migrations

### Current approach
`spring.jpa.hibernate.ddl-auto: update` — Hibernate creates new tables/columns/indexes automatically.

### Production recommendation: Flyway
For production, replace `ddl-auto: update` with Flyway for versioned, auditable migrations:
```yaml
spring:
  flyway:
    enabled: true
    locations: classpath:db/migration
```
Migration files: `V1__initial_schema.sql`, `V2__add_indexes.sql`, etc.

Benefits:
- Every schema change is in version control
- Can be reviewed in PRs before deployment
- Automatic rollback scripts via Flyway Undo (paid) or manual `V2__rollback_add_indexes.sql`

---

## What Happens If The Database Crashes?

1. **Spring Boot health check** (`/actuator/health`) immediately reports `DOWN` — monitoring alerts fire.
2. **HikariCP** retries connections up to `connection-timeout` (30s) — transient outages are transparent to users.
3. For a full crash: restore from the most recent daily snapshot. Data loss window = at most 24 hours.
4. For point-in-time recovery (Supabase/RDS): recovery to any second within the retention window.

---

## Interview Answer (30 seconds)

> "For the cloud deployment I'd use Render's or Supabase's built-in daily Postgres snapshots — zero configuration and 7-day retention out of the box. Application rollback is handled by Docker image tags: every release is tagged, and rolling back is just redeploying the previous tag — takes about 30 seconds on Render. The Spring Boot Actuator health endpoint at `/actuator/health` lets a load balancer detect and fail-over from a crashed instance before users notice."

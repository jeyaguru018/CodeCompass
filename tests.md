# CodeCompass API Tests

Below are `curl` commands to test the complete flow of CodeCompass locally.

## Setup
First, start the backend and python services:
```bash
docker-compose up -d postgres
cd python-service && pip install -r requirements.txt && uvicorn main:app --port 8000
cd backend && mvn spring-boot:run
```

Set up your authorization token from the frontend or create one via the DB/register endpoint:
```bash
export JWT="your.jwt.token"
```

## 1. Auth & Registration
```bash
# Register
curl -X POST http://localhost:8081/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com", "password":"password123", "githubToken":"ghp_..."}'

# Login
curl -X POST http://localhost:8081/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com", "password":"password123"}'
```

## 2. Analysis Pipeline
```bash
# Start Analysis (async)
curl -X POST http://localhost:8081/api/v1/repos/analyze \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"githubUrl":"https://github.com/expressjs/express"}'

# Extract repoId from response:
export REPO_ID="<repo_id>"

# Poll Status
curl -X GET http://localhost:8081/api/v1/repos/$REPO_ID/status \
  -H "Authorization: Bearer $JWT"

# Re-analyze (clear and restart)
curl -X POST http://localhost:8081/api/v1/repos/$REPO_ID/reanalyze \
  -H "Authorization: Bearer $JWT"
```

## 3. Workspace Data (Architecture & Structure)
```bash
# Get basic overview and summary
curl -X GET http://localhost:8081/api/v1/repos/$REPO_ID \
  -H "Authorization: Bearer $JWT"

# Get full file tree (with hotspot tags)
curl -X GET http://localhost:8081/api/v1/repos/$REPO_ID/files \
  -H "Authorization: Bearer $JWT"

# Get dependency graph edges
curl -X GET http://localhost:8081/api/v1/repos/$REPO_ID/graph \
  -H "Authorization: Bearer $JWT"

# Get specific file's parsed functions
export FILE_ID="<file_id_from_tree>"
curl -X GET http://localhost:8081/api/v1/repos/$REPO_ID/files/$FILE_ID/functions \
  -H "Authorization: Bearer $JWT"
```

## 4. Onboarding Plan
```bash
# Get all AI-generated onboarding steps
curl -X GET http://localhost:8081/api/v1/repos/$REPO_ID/onboarding \
  -H "Authorization: Bearer $JWT"

# Mark a step as complete
export STEP_ID="<step_id>"
curl -X POST http://localhost:8081/api/v1/repos/$REPO_ID/onboarding/$STEP_ID/complete \
  -H "Authorization: Bearer $JWT"

# Mark a step as incomplete
curl -X DELETE http://localhost:8081/api/v1/repos/$REPO_ID/onboarding/$STEP_ID/complete \
  -H "Authorization: Bearer $JWT"
```

## 5. RAG Chat & SSE Streaming
```bash
# List chat sessions
curl -X GET http://localhost:8081/api/v1/repos/$REPO_ID/chat/sessions \
  -H "Authorization: Bearer $JWT"

# Create new chat session
curl -X POST http://localhost:8081/api/v1/repos/$REPO_ID/chat/sessions \
  -H "Authorization: Bearer $JWT"

export SESSION_ID="<session_id>"

# Stream AI response (SSE)
curl -N -X POST http://localhost:8081/api/v1/repos/$REPO_ID/chat/sessions/$SESSION_ID/messages \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
        "content": "Where are the authentication routes?",
        "contextFileId": null,
        "contextFunction": null
      }'
```

You should see an output stream that looks like this:
```
data: I found
data: the authentication
data: routes in
data: src/routes/auth.ts
event: citations
data: d7b5f5...
event: done
data: [DONE]
```

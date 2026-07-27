"""
main.py — CodeCompass Python Intelligence Service

Internal-only FastAPI service. Never exposed to the public internet.
Protected by X-Internal-Secret header on every endpoint.

Stateless contract:
  - Receives all data it needs from Java in the request body.
  - Returns all results in the response body.
  - Does NOT write to the database (except searcher.py reads FAISS blobs for caching).
  - Does NOT call GitHub.
"""
import os
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager

INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "default-secret")


def verify_secret(request: Request):
    secret = request.headers.get("X-Internal-Secret", "")
    if secret != INTERNAL_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden: missing or invalid internal secret")


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting CodeCompass Python Intelligence Service...")
    yield
    print("Shutting down.")


app = FastAPI(title="CodeCompass Intelligence Service", lifespan=lifespan)

# Internal service — CORS not required, but restrict to same origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # restricted to private network in deployment
    allow_methods=["POST", "DELETE", "GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "python-intelligence"}


# ─── /internal/parse ─────────────────────────────────────────────────────────

class FileInput(BaseModel):
    path: str
    content: str
    language: Optional[str] = None

class ParseRequest(BaseModel):
    repo_id: str
    github_owner: Optional[str] = None
    github_name: Optional[str] = None
    github_token: Optional[str] = None
    files: List[FileInput]

@app.post("/internal/parse")
async def parse_repo(request_data: ParseRequest, request: Request):
    verify_secret(request)
    from parser import parse_repo_files
    files = [{'path': f.path, 'content': f.content, 'language': f.language} for f in request_data.files]
    result = await parse_repo_files(files, request_data.github_owner, request_data.github_name, request_data.github_token)
    return result


# ─── /internal/embed ─────────────────────────────────────────────────────────

class EmbedFileInput(BaseModel):
    file_id: str
    content: str

class EmbedRequest(BaseModel):
    repo_id: str
    files: List[EmbedFileInput]

@app.post("/internal/embed")
async def embed_repo(request_data: EmbedRequest, request: Request):
    verify_secret(request)
    from embedder import embed_files
    files = [{'file_id': f.file_id, 'content': f.content} for f in request_data.files]
    result = embed_files(files)
    return result


# ─── /internal/search ────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    repo_id: str
    query: str
    top_k: int = 8

@app.post("/internal/search")
async def search_repo(request_data: SearchRequest, request: Request):
    verify_secret(request)
    from searcher import search_repo_functions
    results = search_repo_functions(request_data.repo_id, request_data.query, request_data.top_k)
    return {"results": results}


# ─── /internal/summarize ─────────────────────────────────────────────────────

class EntryFileInput(BaseModel):
    file_path: str
    content: str

class SummarizeRequest(BaseModel):
    repo_id: str
    entry_files: List[EntryFileInput]

@app.post("/internal/summarize")
async def summarize_repo(request_data: SummarizeRequest, request: Request):
    verify_secret(request)
    from chatter import generate_repo_summary
    entry_files = [{'file_path': f.file_path, 'content': f.content} for f in request_data.entry_files]
    result = generate_repo_summary(entry_files, repo_name=request_data.repo_id)
    return result


class MethodInput(BaseModel):
    function_id: str
    name: str
    content: str

class SummarizeMethodsRequest(BaseModel):
    repo_id: str
    methods: List[MethodInput]

@app.post("/internal/summarize_methods")
async def summarize_methods(request_data: SummarizeMethodsRequest, request: Request):
    verify_secret(request)
    from chatter import generate_method_summaries
    methods = [{'function_id': m.function_id, 'name': m.name, 'content': m.content} for m in request_data.methods]
    result = await generate_method_summaries(methods)
    return result


# ─── /internal/diff_explain ──────────────────────────────────────────────────

class DiffExplainRequest(BaseModel):
    repo_id: str
    diff_text: str

@app.post("/internal/diff_explain")
async def diff_explain(request_data: DiffExplainRequest, request: Request):
    verify_secret(request)
    from chatter import generate_diff_explanation
    result = await generate_diff_explanation(request_data.diff_text, repo_name=request_data.repo_id)
    return result


# ─── /internal/generate_adr ──────────────────────────────────────────────────

class GenerateAdrRequest(BaseModel):
    repo_id: str
    repo_summary: str

@app.post("/internal/generate_adr")
async def generate_adr(request_data: GenerateAdrRequest, request: Request):
    verify_secret(request)
    from chatter import generate_adr
    result = await generate_adr(request_data.repo_id, request_data.repo_summary)
    return result


# ─── /internal/onboard ───────────────────────────────────────────────────────

class OnboardFileInput(BaseModel):
    file_id: str
    file_path: str
    is_entry_point: bool = False
    complexity_score: float = 0.0

class OnboardRequest(BaseModel):
    repo_id: str
    repo_summary: str
    files: List[OnboardFileInput]

@app.post("/internal/onboard")
async def onboard_repo(request_data: OnboardRequest, request: Request):
    verify_secret(request)
    from chatter import generate_onboarding_plan
    files = [{'file_id': f.file_id, 'file_path': f.file_path, 'is_entry_point': f.is_entry_point}
             for f in request_data.files]
    result = generate_onboarding_plan(request_data.repo_summary, files)
    return result


# ─── /internal/simulate_onboarding ───────────────────────────────────────────

class SimulateOnboardingRequest(BaseModel):
    repo_id: str
    repo_summary: str
    role: str
    files: List[OnboardFileInput]

@app.post("/internal/simulate_onboarding")
async def simulate_onboarding(request_data: SimulateOnboardingRequest, request: Request):
    verify_secret(request)
    from chatter import generate_simulated_onboarding
    files = [{'file_id': f.file_id, 'file_path': f.file_path, 'is_entry_point': f.is_entry_point}
             for f in request_data.files]
    result = await generate_simulated_onboarding(request_data.repo_summary, files, request_data.role)
    return result


# ─── /internal/chat ──────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    prompt: str
    repo_id: str

@app.post("/internal/chat")
async def chat_repo(request_data: ChatRequest, request: Request):
    verify_secret(request)
    from chatter import answer_chat_question
    result = answer_chat_question(request_data.prompt)
    return result


# ─── /internal/index/{repo_id} (DELETE) ──────────────────────────────────────

@app.delete("/internal/index/{repo_id}")
async def delete_index(repo_id: str, request: Request):
    verify_secret(request)
    from searcher import evict_cache
    evict_cache(repo_id)
    return {"status": "evicted", "repo_id": repo_id}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

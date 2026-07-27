import os
import sys
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__) + '/..'))

import faiss
import numpy as np
from rank_bm25 import BM25Okapi

# We will mock the database and FAISS data for testing hybrid search directly
# Instead of relying on a real database, we create a mock corpus and simulate searcher.py behavior

# Mock Corpus
corpus = [
    {"file_id": "file1", "content": "def calculate_revenue(users): return users * 10"},
    {"file_id": "file2", "content": "def user_auth_token_generator(user): return 'token'"},
    {"file_id": "file3", "content": "class AuthManager: pass"},
    {"file_id": "file4", "content": "import jwt"}
]

# Mock Vector Similarities (simulating FAISS output)
# Suppose a query "user_auth_token_generator" yields the following FAISS similarities:
# Vector search often struggles with exact long identifiers if they are rare or split into subwords
faiss_scores = {
    "file1": 0.4,
    "file2": 0.45,  # Close, but maybe not top if vector doesn't perfectly align
    "file3": 0.6,   # Vector search thinks 'AuthManager' is very semantically related to 'auth'
    "file4": 0.5
}

def test_hybrid_search_boosts_exact_match():
    # 1. FAISS Semantic Search Results
    semantic_results = [{"file_id": fid, "score": score} for fid, score in faiss_scores.items()]
    
    # Sort purely by semantic score
    pure_semantic_top = sorted(semantic_results, key=lambda x: x["score"], reverse=True)
    assert pure_semantic_top[0]["file_id"] == "file3", "Pure vector search should favor file3 based on our mock data"
    
    # 2. Exact Keyword Search (Hybrid using rank_bm25)
    import re
    tokenized_corpus = []
    file_ids = []
    for doc in corpus:
        tokens = re.findall(r'\w+', doc["content"].lower())
        tokenized_corpus.append(tokens)
        file_ids.append(doc["file_id"])
        
    bm25 = BM25Okapi(tokenized_corpus)
    
    query = "user_auth_token_generator"
    query_tokens = re.findall(r'\w+', query.lower())
    doc_scores = bm25.get_scores(query_tokens)
    
    kw_results = []
    for idx, score in enumerate(doc_scores):
        if score > 0:
            kw_results.append({'file_id': file_ids[idx], 'score': float(score)})
            
    # 3. Reciprocal Rank Fusion / Merge (like in searcher.py)
    merged = {}
    for res in semantic_results:
        merged[res['file_id']] = merged.get(res['file_id'], 0) + res['score'] * 0.8
        
    for res in kw_results:
        # Boost BM25 exact matches
        merged[res['file_id']] = merged.get(res['file_id'], 0) + res['score'] * 1.5
        
    sorted_merged = sorted(merged.items(), key=lambda x: x[1], reverse=True)
    
    # The hybrid search should boost file2 to the top because of the exact string match
    assert sorted_merged[0][0] == "file2", "Hybrid search failed to rank the exact match first!"
    
    print("Hybrid Search Test Passed: Exact string match ranked higher than pure semantic similarity.")

if __name__ == "__main__":
    test_hybrid_search_boosts_exact_match()

import os
import json
import faiss
import numpy as np
import google.generativeai as genai
from database import get_readonly_db_connection, get_db_cursor
from cachetools import LRUCache

genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))

# Cache tuples of (index, chunk_map)
index_cache = LRUCache(maxsize=10)

def get_faiss_data(repo_id: str):
    if repo_id in index_cache:
        return index_cache[repo_id]
        
    conn = get_readonly_db_connection()
    cursor = get_db_cursor(conn)
    
    try:
        cursor.execute("SELECT faiss_index_data, faiss_chunk_map FROM repositories WHERE id = %s", (repo_id,))
        row = cursor.fetchone()
        if not row or not row['faiss_index_data']:
            return None, None
            
        index_bytes = bytes(row['faiss_index_data'])
        index_array = np.frombuffer(index_bytes, dtype=np.uint8)
        index = faiss.deserialize_index(index_array)
        
        chunk_map = []
        if row['faiss_chunk_map']:
            # Handle string or dict depending on driver
            cm = row['faiss_chunk_map']
            if isinstance(cm, str):
                chunk_map = json.loads(cm)
            else:
                chunk_map = cm
        # Build BM25 Index
        cursor.execute("SELECT id, file_path, raw_content FROM repo_files WHERE repository_id = %s", (repo_id,))
        files = cursor.fetchall()
        
        from rank_bm25 import BM25Okapi
        import re
        tokenized_corpus = []
        file_ids = []
        for f in files:
            content = f['raw_content'] or ''
            path = f['file_path'] or ''
            tokens = re.findall(r'\w+', (path + " " + content).lower())
            tokenized_corpus.append(tokens)
            file_ids.append(str(f['id']))
            
        bm25 = BM25Okapi(tokenized_corpus) if tokenized_corpus else None
                
        index_cache[repo_id] = (index, chunk_map, bm25, file_ids)
        return index, chunk_map, bm25, file_ids
    finally:
        cursor.close()
        conn.close()

def evict_cache(repo_id: str):
    if repo_id in index_cache:
        del index_cache[repo_id]

def get_bm25_results(bm25, file_ids, query: str, top_k: int = 3):
    if not bm25:
        return []
    import re
    tokens = re.findall(r'\w+', query.lower())
    doc_scores = bm25.get_scores(tokens)
    
    # Get top k indices
    import numpy as np
    top_indices = np.argsort(doc_scores)[::-1][:top_k]
    
    results = []
    for idx in top_indices:
        score = float(doc_scores[idx])
        if score > 0:
            results.append({'file_id': file_ids[idx], 'score': score})
    return results

def search_repo_functions(repo_id: str, query: str, top_k: int = 5):
    res = get_faiss_data(repo_id)
    if not res or not res[0]:
        return []
    index, chunk_map, bm25, file_ids = res
    if not index:
        return []
        
    try:
        # 1. FAISS Semantic Search
        result = genai.embed_content(
            model="models/text-embedding-004",
            content=query,
            task_type="retrieval_query"
        )
        query_vector = np.array([result['embedding']]).astype('float32')
        
        distances, faiss_ids = index.search(query_vector, top_k)
        found_ids = faiss_ids[0].tolist()
        
        semantic_results = []
        if found_ids and found_ids[0] != -1:
            for fid in found_ids:
                if fid != -1 and fid < len(chunk_map):
                    dist = float(distances[0][found_ids.index(fid)])
                    mapped_file_id = chunk_map[fid].get('file_id')
                    if mapped_file_id:
                        # Convert L2 distance to a pseudo-similarity score (0 to 1) for merging
                        sim_score = 1.0 / (1.0 + dist)
                        semantic_results.append({'file_id': mapped_file_id, 'score': sim_score})
                        
        # 2. Exact Keyword Search (Hybrid using rank_bm25)
        kw_results = get_bm25_results(bm25, file_ids, query, top_k=3)
        
        # 3. Reciprocal Rank Fusion / Merge
        merged = {}
        for idx, res in enumerate(semantic_results):
            merged[res['file_id']] = merged.get(res['file_id'], 0) + res['score'] * 0.8
            
        for idx, res in enumerate(kw_results):
            # Give keyword exact matches a strong boost
            merged[res['file_id']] = merged.get(res['file_id'], 0) + res['score'] * 1.5
            
        # Sort by combined score descending
        sorted_merged = sorted(merged.items(), key=lambda x: x[1], reverse=True)
        
        final_results = []
        for file_id, score in sorted_merged[:top_k]:
            final_results.append({'file_id': file_id, 'score': score})
            
        return final_results
    except Exception as e:
        print(f"Error during search: {e}")
        return []

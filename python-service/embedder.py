"""
embedder.py — Stateless FAISS embedding generation.

Receives file content from Java. Returns serialized FAISS index as base64.
Does NOT access the database. Does NOT write anywhere.
Java stores the returned bytes as bytea in Postgres.
"""
import os
import time
import base64
import faiss
import numpy as np
import google.generativeai as genai
from typing import List, Dict, Any

genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))

DIMENSION = 768
CHUNK_SIZE = 2048      # characters (~512 tokens)
CHUNK_OVERLAP = 512    # characters overlap between chunks
BATCH_SIZE = 100       # Gemini embedding API batch limit


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end])
        start += chunk_size - overlap
        if start >= len(text):
            break
    return chunks


def embed_files(files: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    files: [{'file_id': str, 'content': str}, ...]
    Returns: {
        'faiss_index_base64': str,    # base64-encoded serialized FAISS index
        'chunk_count': int,
        'chunk_to_file_map': [{'chunk_idx': int, 'file_id': str}, ...]
    }
    """
    all_texts: List[str] = []
    chunk_to_file_map: List[Dict[str, Any]] = []

    for file_data in files:
        file_id = file_data.get('file_id', '')
        content = file_data.get('content', '')
        if not content or not content.strip():
            continue

        chunks = chunk_text(content)
        for chunk in chunks:
            chunk_to_file_map.append({'chunk_idx': len(all_texts), 'file_id': file_id})
            all_texts.append(chunk)

    if not all_texts:
        # Return empty FAISS index
        index = faiss.IndexFlatL2(DIMENSION)
        id_map = faiss.IndexIDMap(index)
        serialized = faiss.serialize_index(id_map)
        return {
            'faiss_index_base64': base64.b64encode(serialized.tobytes()).decode('utf-8'),
            'chunk_count': 0,
            'chunk_to_file_map': [],
        }

    # Generate embeddings in batches with throttling
    all_embeddings: List[List[float]] = []
    for i in range(0, len(all_texts), BATCH_SIZE):
        batch = all_texts[i:i + BATCH_SIZE]
        try:
            result = genai.embed_content(
                model="models/text-embedding-004",
                content=batch,
                task_type="retrieval_document"
            )
            batch_embeddings = result['embedding']
            # Gemini returns a list of embeddings
            if isinstance(batch_embeddings[0], list):
                all_embeddings.extend(batch_embeddings)
            else:
                # Single embedding returned for single-item batch
                all_embeddings.append(batch_embeddings)
        except Exception as e:
            # On API error: insert zero vectors so chunk map stays aligned
            for _ in batch:
                all_embeddings.append([0.0] * DIMENSION)

        # Throttle between batches to stay under rate limits
        if i + BATCH_SIZE < len(all_texts):
            time.sleep(1.0)

    if not all_embeddings:
        index = faiss.IndexFlatL2(DIMENSION)
        id_map = faiss.IndexIDMap(index)
        serialized = faiss.serialize_index(id_map)
        return {
            'faiss_index_base64': base64.b64encode(serialized.tobytes()).decode('utf-8'),
            'chunk_count': 0,
            'chunk_to_file_map': [],
        }

    embed_matrix = np.array(all_embeddings, dtype='float32')
    actual_dim = embed_matrix.shape[1]

    base_index = faiss.IndexFlatL2(actual_dim)
    id_map = faiss.IndexIDMap(base_index)

    ids = np.arange(len(all_embeddings), dtype='int64')
    id_map.add_with_ids(embed_matrix, ids)

    # Serialize to bytes, encode as base64 for HTTP transport
    serialized = faiss.serialize_index(id_map)
    index_bytes = serialized.tobytes()
    index_b64 = base64.b64encode(index_bytes).decode('utf-8')

    return {
        'faiss_index_base64': index_b64,
        'chunk_count': len(all_texts),
        'chunk_to_file_map': chunk_to_file_map,
    }

"""
chatter.py — Stateless AI summarization and chat completion.

Receives data from Java, calls Gemini, returns results.
Does NOT write to the database. Does NOT maintain state.
"""
import os
import google.generativeai as genai
from typing import List, Dict, Any, Optional

genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))
MODEL = "gemini-1.5-flash"


def generate_repo_summary(entry_files: List[Dict[str, Any]], repo_name: str = "") -> Dict[str, Any]:
    """
    entry_files: [{'file_path': str, 'content': str}, ...]
    Returns: {'repo_summary': str, 'file_summaries': [{'file_path': str, 'summary': str}, ...]}
    """
    model = genai.GenerativeModel(MODEL)

    # Per-file summaries
    file_summaries = []
    for ef in entry_files:
        path = ef.get('file_path', '')
        content = ef.get('content', '')[:2000]
        if not content:
            continue
        try:
            prompt = (
                f"You are a senior software engineer. Summarize what this file does in 1–2 clear sentences.\n"
                f"File: {path}\n\n```\n{content}\n```\n\nSummary:"
            )
            resp = model.generate_content(prompt)
            summary = resp.text.strip() if resp.text else ""
            if summary:
                file_summaries.append({'file_path': path, 'summary': summary})
        except Exception:
            pass  # skip on API error

    # Whole-repo summary from the per-file summaries
    repo_summary = ""
    if file_summaries:
        combined = "\n".join([f"- {fs['file_path']}: {fs['summary']}" for fs in file_summaries[:5]])
        try:
            prompt = (
                f"Based on these key files in the repository {repo_name}, write a 2–3 sentence plain-English "
                f"summary of what this codebase does and its main purpose:\n\n{combined}\n\nSummary:"
            )
            resp = model.generate_content(prompt)
            repo_summary = resp.text.strip() if resp.text else ""
        except Exception:
            repo_summary = f"Repository containing {len(entry_files)} source files."

    return {'repo_summary': repo_summary, 'file_summaries': file_summaries}


def generate_onboarding_plan(repo_summary: str, files: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    files: [{'file_id': str, 'file_path': str, 'is_entry_point': bool}, ...]
    Returns: {'steps': [{'file_id': str, 'step_order': int, 'reason': str, 'estimated_minutes': int}, ...]}
    """
    model = genai.GenerativeModel(MODEL)

    # Sort: entry points first, then by path length (shorter = more top-level)
    sorted_files = sorted(files, key=lambda f: (not f.get('is_entry_point', False), len(f.get('file_path', ''))))
    candidates = sorted_files[:20]

    file_list = "\n".join([f"{i+1}. {f['file_path']}" for i, f in enumerate(candidates)])
    prompt = (
        f"You are a senior developer onboarding a new team member to a codebase.\n"
        f"Repository summary: {repo_summary}\n\n"
        f"Here are the key files:\n{file_list}\n\n"
        f"Select up to 9 files in the order a new developer should read them, "
        f"and for each provide a one-sentence reason and estimated reading time in minutes.\n"
        f"Respond ONLY with a JSON array like:\n"
        f'[{{"file_index": 1, "reason": "...", "estimated_minutes": 10}}, ...]\n\n'
        f"JSON:"
    )

    steps = []
    try:
        resp = model.generate_content(prompt)
        text = resp.text.strip()
        # Extract JSON array from response
        start = text.find('[')
        end = text.rfind(']') + 1
        if start >= 0 and end > start:
            import json
            raw_steps = json.loads(text[start:end])
            for order, step in enumerate(raw_steps[:9], start=1):
                idx = step.get('file_index', 1) - 1
                if 0 <= idx < len(candidates):
                    steps.append({
                        'file_id': candidates[idx]['file_id'],
                        'step_order': order,
                        'reason': step.get('reason', 'Recommended file to review.'),
                        'estimated_minutes': step.get('estimated_minutes', 10),
                    })
    except Exception:
        # Fallback: use entry points in order
        for order, f in enumerate(candidates[:5], start=1):
            steps.append({
                'file_id': f['file_id'],
                'step_order': order,
                'reason': 'Key entry-point file — start here to understand the application structure.',
                'estimated_minutes': 10,
            })

    return {'steps': steps}


def answer_chat_question(prompt: str) -> Dict[str, Any]:
    """
    Sends an augmented prompt to Gemini and returns the answer.
    The full RAG context is pre-built by Java and included in the prompt.
    """
    model = genai.GenerativeModel(MODEL)
    try:
        resp = model.generate_content(prompt)
        return {'answer': resp.text.strip() if resp.text else "I couldn't generate a response."}
    except Exception as e:
        return {'answer': f"AI service error: {str(e)}"}


async def generate_method_summaries(methods: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    methods: [{'function_id': str, 'name': str, 'content': str}, ...]
    Returns: [{'function_id': str, 'summary': str}]
    """
    import asyncio
    model = genai.GenerativeModel(MODEL)
    
    async def summarize_one(method: Dict[str, Any]) -> Dict[str, str]:
        func_id = method.get('function_id', '')
        name = method.get('name', 'unknown')
        content = method.get('content', '')
        if not content or len(content) < 10:
            return {'function_id': func_id, 'summary': ''}
            
        prompt = (
            f"You are a senior software engineer. Briefly summarize what the function '{name}' does "
            f"in one clear sentence based on this code:\n\n```\n{content[:1500]}\n```\n\nSummary:"
        )
        try:
            # Use run_in_executor to avoid blocking the event loop with synchronous Gemini calls
            loop = asyncio.get_running_loop()
            resp = await loop.run_in_executor(None, model.generate_content, prompt)
            return {'function_id': func_id, 'summary': resp.text.strip() if resp.text else ""}
        except Exception:
            return {'function_id': func_id, 'summary': ''}

    # Run concurrently (max 10 at a time to avoid Gemini rate limits)
    results = []
    chunk_size = 10
    for i in range(0, len(methods), chunk_size):
        chunk = methods[i:i+chunk_size]
        tasks = [summarize_one(m) for m in chunk]
        chunk_results = await asyncio.gather(*tasks)
        results.extend(chunk_results)
        
    return {'method_summaries': results}


async def generate_diff_explanation(diff_text: str, repo_name: str = "") -> Dict[str, Any]:
    import asyncio
    model = genai.GenerativeModel(MODEL)
    
    if len(diff_text) > 15000:
        diff_text = diff_text[:15000] + "\n...[DIFF TRUNCATED]"
        
    prompt = (
        f"You are a senior code reviewer looking at a PR/commit diff for the repository {repo_name}.\n"
        f"Analyze the following diff and provide a concise risk assessment report.\n"
        f"Highlight potential bugs, security issues, performance regressions, or architectural impact.\n"
        f"If it is a simple change, just state what it does.\n\n"
        f"DIFF:\n```diff\n{diff_text}\n```\n\n"
        f"Report:"
    )
    
    try:
        loop = asyncio.get_running_loop()
        resp = await loop.run_in_executor(None, model.generate_content, prompt)
        return {'explanation': resp.text.strip() if resp.text else "No explanation generated."}
    except Exception as e:
        return {'explanation': f"AI service error during diff analysis: {str(e)}"}

async def generate_adr(repo_id: str, repo_summary: str) -> Dict[str, Any]:
    import asyncio
    from database import get_readonly_db_connection, get_db_cursor
    model = genai.GenerativeModel(MODEL)
    
    conn = get_readonly_db_connection()
    cursor = get_db_cursor(conn)
    try:
        # Fetch top dependencies
        cursor.execute("SELECT external_package FROM dependency_edges WHERE is_external = true AND repository_id = %s LIMIT 20", (repo_id,))
        deps = [row['external_package'] for row in cursor.fetchall() if row['external_package']]
        
        # Fetch top files by complexity
        cursor.execute("SELECT file_path FROM repo_files WHERE repository_id = %s ORDER BY complexity_score DESC LIMIT 5", (repo_id,))
        top_files = [row['file_path'] for row in cursor.fetchall()]
    finally:
        cursor.close()
        conn.close()
        
    prompt = (
        f"You are a Software Architect. Based on the following repository context, generate a plausible Architectural Decision Record (ADR).\n"
        f"Repository Summary: {repo_summary}\n"
        f"Key Dependencies: {', '.join(set(deps))}\n"
        f"Most Complex Files: {', '.join(top_files)}\n\n"
        f"Create an ADR following the standard format:\n"
        f"1. Title\n2. Status\n3. Context\n4. Decision\n5. Consequences\n\n"
        f"ADR:"
    )
    
    try:
        loop = asyncio.get_running_loop()
        resp = await loop.run_in_executor(None, model.generate_content, prompt)
        return {'adr': resp.text.strip() if resp.text else "Could not generate ADR."}
    except Exception as e:
        return {'adr': f"Error generating ADR: {str(e)}"}

async def generate_simulated_onboarding(repo_summary: str, files: List[Dict[str, Any]], role: str) -> Dict[str, Any]:
    import asyncio
    model = genai.GenerativeModel(MODEL)
    
    sorted_files = sorted(files, key=lambda f: (not f.get('is_entry_point', False), len(f.get('file_path', ''))))
    candidates = sorted_files[:20]
    
    file_list = "\n".join([f"{i+1}. {f['file_path']}" for i, f in enumerate(candidates)])
    prompt = (
        f"You are a senior developer onboarding a new team member to a codebase.\n"
        f"The new team member's role/focus is: '{role}'.\n"
        f"Repository summary: {repo_summary}\n\n"
        f"Here are the key files:\n{file_list}\n\n"
        f"Based on the role '{role}', select up to 9 files they should read first, "
        f"and for each provide a one-sentence reason customized for this role and estimated reading time.\n"
        f"Respond ONLY with a JSON array like:\n"
        f'[{{"file_index": 1, "reason": "...", "estimated_minutes": 10}}, ...]\n\n'
        f"JSON:"
    )
    
    steps = []
    try:
        loop = asyncio.get_running_loop()
        resp = await loop.run_in_executor(None, model.generate_content, prompt)
        text = resp.text.strip()
        start = text.find('[')
        end = text.rfind(']') + 1
        if start >= 0 and end > start:
            import json
            raw_steps = json.loads(text[start:end])
            for order, step in enumerate(raw_steps[:9], start=1):
                idx = step.get('file_index', 1) - 1
                if 0 <= idx < len(candidates):
                    steps.append({
                        'file_id': candidates[idx]['file_id'],
                        'step_order': order,
                        'reason': step.get('reason', f'Recommended file for {role}.'),
                        'estimated_minutes': step.get('estimated_minutes', 10),
                    })
    except Exception as e:
        return {'error': str(e)}

    return {'steps': steps}

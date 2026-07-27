"""
parser.py — Stateless AST parsing and dependency graph construction.

Receives raw file contents from Java. Returns structured JSON.
Does NOT access the database. Does NOT download from GitHub.
Java owns all database writes.
"""
import ast
import re
import json
import networkx as nx
import asyncio
import aiohttp
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

SUPPORTED_LANGUAGES = {'py', 'js', 'jsx', 'ts', 'tsx', 'java', 'kt', 'go', 'rs', 'rb', 'cs', 'php', 'swift', 'scala'}

# ─── Entry-point detection heuristics ────────────────────────────────────────
ENTRY_POINT_PATTERNS = [
    r'(^|/)main\.(py|go|rs|java|ts|js)$',
    r'(^|/)app\.(py|ts|js)$',
    r'(^|/)server\.(ts|js|py)$',
    r'(^|/)index\.(ts|js)$',
    r'(^|/)__main__\.py$',
    r'(^|/)Program\.cs$',
]


def is_entry_point(file_path: str) -> bool:
    for pattern in ENTRY_POINT_PATTERNS:
        if re.search(pattern, file_path):
            return True
    return False


def classify_module(file_path: str, content: str) -> str:
    path_lower = file_path.lower()
    if is_entry_point(file_path):
        return 'entry_point'
    if any(x in path_lower for x in ['route', 'controller', 'endpoint', 'handler', 'api']):
        return 'api_layer'
    if any(x in path_lower for x in ['service', 'usecase', 'business', 'domain', 'logic']):
        return 'business_logic'
    if any(x in path_lower for x in ['repo', 'dao', 'db', 'database', 'model', 'schema', 'entity']):
        return 'data_layer'
    return 'utility'


# ─── Python AST parsing ───────────────────────────────────────────────────────

def parse_python_file(content: str, file_path: str) -> Dict[str, Any]:
    functions = []
    imports = []
    complexity_score = 1.0

    try:
        tree = ast.parse(content)
    except SyntaxError:
        return {'functions': [], 'imports': [], 'complexity_score': 1.0}

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            params = [arg.arg for arg in node.args.args]
            return_type = None
            if node.returns:
                try:
                    return_type = ast.unparse(node.returns)
                except Exception:
                    pass

            # Cyclomatic complexity
            branches = sum(1 for n in ast.walk(node) if isinstance(n, (
                ast.If, ast.For, ast.While, ast.ExceptHandler, ast.With, ast.BoolOp, ast.IfExp
            )))
            cx = 1 + branches

            # Class name
            class_name = None
            for parent in ast.walk(tree):
                if isinstance(parent, ast.ClassDef):
                    for item in ast.walk(parent):
                        if item is node:
                            class_name = parent.name
                            break

            functions.append({
                'name': node.name,
                'class_name': class_name,
                'start_line': node.lineno,
                'end_line': node.end_lineno or node.lineno,
                'parameters': params,
                'return_type': return_type,
                'complexity_score': float(cx),
            })
            complexity_score = max(complexity_score, float(cx))

        elif isinstance(node, ast.Import):
            for alias in node.names:
                imports.append({'module': alias.name, 'is_from': False})
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                imports.append({'module': node.module, 'is_from': True, 'level': node.level or 0})

    return {'functions': functions, 'imports': imports, 'complexity_score': complexity_score}


# ─── JS/TS regex parsing ──────────────────────────────────────────────────────

def parse_js_ts_file(content: str) -> Dict[str, Any]:
    functions = []
    imports = []

    # Function declarations
    fn_patterns = [
        r'(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(',
        r'const\s+(\w+)\s*=\s*(?:async\s+)?\(',
        r'(?:public|private|protected|static|async)[\s\w]*\s+(\w+)\s*\([^)]*\)\s*(?::\s*\w+\s*)?\{',
    ]
    for pat in fn_patterns:
        for m in re.finditer(pat, content):
            line_num = content[:m.start()].count('\n') + 1
            branch_count = content[m.start():m.start() + 500].count('if ') + \
                           content[m.start():m.start() + 500].count('for ') + \
                           content[m.start():m.start() + 500].count('while ') + \
                           content[m.start():m.start() + 500].count('catch ')
            functions.append({
                'name': m.group(1),
                'class_name': None,
                'start_line': line_num,
                'end_line': line_num + 5,
                'parameters': [],
                'return_type': None,
                'complexity_score': float(1 + branch_count),
            })

    # Import statements
    for m in re.finditer(r'import\s+.*?from\s+[\'"]([^\'"]+)[\'"]', content):
        imports.append({'module': m.group(1), 'is_from': True, 'level': 0})
    for m in re.finditer(r'require\([\'"]([^\'"]+)[\'"]\)', content):
        imports.append({'module': m.group(1), 'is_from': False, 'level': 0})

    complexity = max((f['complexity_score'] for f in functions), default=1.0)
    return {'functions': functions, 'imports': imports, 'complexity_score': complexity}


# ─── Java/Kotlin regex parsing ────────────────────────────────────────────────

def parse_java_file(content: str) -> Dict[str, Any]:
    functions = []
    imports = []

    for m in re.finditer(
        r'(?:public|private|protected|static|final|abstract|\s)+\s+(?:\w+(?:<[^>]*>)?)\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*\{',
        content
    ):
        line_num = content[:m.start()].count('\n') + 1
        branch_count = content[m.start():m.start() + 500].count('if (') + \
                       content[m.start():m.start() + 500].count('for (') + \
                       content[m.start():m.start() + 500].count('while (') + \
                       content[m.start():m.start() + 500].count('catch (')
        functions.append({
            'name': m.group(1),
            'class_name': None,
            'start_line': line_num,
            'end_line': line_num + 5,
            'parameters': [],
            'return_type': None,
            'complexity_score': float(1 + branch_count),
        })

    for m in re.finditer(r'import\s+([\w.]+);', content):
        imports.append({'module': m.group(1), 'is_from': True, 'level': 0})

    complexity = max((f['complexity_score'] for f in functions), default=1.0)
    return {'functions': functions, 'imports': imports, 'complexity_score': complexity}


# ─── Dispatcher ───────────────────────────────────────────────────────────────

def parse_file(file_path: str, content: str) -> Dict[str, Any]:
    ext = file_path.rsplit('.', 1)[-1].lower() if '.' in file_path else ''
    if ext == 'py':
        result = parse_python_file(content, file_path)
    elif ext in ('js', 'jsx', 'ts', 'tsx'):
        result = parse_js_ts_file(content)
    elif ext in ('java', 'kt', 'scala'):
        result = parse_java_file(content)
    else:
        result = {'functions': [], 'imports': [], 'complexity_score': 1.0}

    result['path'] = file_path
    result['is_entry_point'] = is_entry_point(file_path)
    result['module_type'] = classify_module(file_path, content)
    return result


# ─── Dependency graph builder ─────────────────────────────────────────────────

def resolve_import_to_path(module: str, source_path: str, all_paths: set, is_relative: bool = False) -> Optional[str]:
    """Try to resolve an import string to one of the known file paths."""
    if is_relative:
        source_dir = '/'.join(source_path.split('/')[:-1])
        candidate_base = source_dir + '/' + module.lstrip('.').replace('.', '/')
    else:
        candidate_base = module.replace('.', '/')

    for ext in ('', '.py', '.ts', '.tsx', '.js', '.jsx', '.java', '/index.ts', '/index.js'):
        candidate = candidate_base + ext
        if candidate in all_paths:
            return candidate
        # Handle src/ prefix
        if 'src/' + candidate in all_paths:
            return 'src/' + candidate

    return None


def build_dependency_graph(parsed_files: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Build a NetworkX directed graph from parsed import data.
    Returns nodes with centrality scores and edges list.
    """
    all_paths = {f['path'] for f in parsed_files}
    G = nx.DiGraph()

    for f in parsed_files:
        G.add_node(f['path'])

    edges = []
    for f in parsed_files:
        source = f['path']
        for imp in f.get('imports', []):
            module = imp.get('module', '')
            is_relative = imp.get('level', 0) > 0 or module.startswith('.')

            is_external = not is_relative and not module.startswith('.')

            if is_relative:
                target = resolve_import_to_path(module, source, all_paths, is_relative=True)
            else:
                target = resolve_import_to_path(module, source, all_paths, is_relative=False)

            edge = {
                'source': source,
                'target': target,
                'import_statement': f"import {module}",
                'is_external': target is None,
                'external_package': module if target is None else None,
            }
            edges.append(edge)
            if target:
                G.add_edge(source, target)

    # Compute centrality
    try:
        centrality = nx.betweenness_centrality(G, normalized=True)
    except Exception:
        centrality = {n: 0.0 for n in G.nodes()}

    # Tag entry points: nodes with in_degree == 0 that have out_degree > 0
    for f in parsed_files:
        path = f['path']
        if G.in_degree(path) == 0 and G.out_degree(path) > 0:
            f['is_entry_point'] = True
            f['module_type'] = 'entry_point'
        f['centrality_score'] = centrality.get(path, 0.0)

    return {'edges': edges, 'centrality': centrality}


# ─── Git Churn Fetcher ────────────────────────────────────────────────────────

async def fetch_file_churn(session: aiohttp.ClientSession, owner: str, repo: str, file_path: str, since_date: str) -> int:
    """Fetch commit count for a specific file over the last N months."""
    url = f"https://api.github.com/repos/{owner}/{repo}/commits"
    params = {
        'path': file_path,
        'since': since_date,
        'per_page': 100
    }
    try:
        async with session.get(url, params=params) as response:
            if response.status == 200:
                data = await response.json()
                return len(data) if isinstance(data, list) else 0
            return 0
    except Exception:
        return 0

async def compute_git_churn(owner: str, repo: str, token: Optional[str], file_paths: List[str]) -> Dict[str, int]:
    """Compute churn (commit count) for a list of files concurrently."""
    if not owner or not repo:
        return {p: 1 for p in file_paths} # Default fallback

    headers = {'Accept': 'application/vnd.github.v3+json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
        
    since_date = (datetime.utcnow() - timedelta(days=90)).isoformat() + 'Z'
    churn_map = {}
    
    async with aiohttp.ClientSession(headers=headers) as session:
        tasks = [fetch_file_churn(session, owner, repo, p, since_date) for p in file_paths]
        results = await asyncio.gather(*tasks)
        for path, count in zip(file_paths, results):
            # Base churn of 1 to prevent multiplying by 0 in hotspot score
            churn_map[path] = max(1, count)
            
    return churn_map

# ─── Main entry point called by FastAPI ──────────────────────────────────────

async def parse_repo_files(files: List[Dict[str, Any]], github_owner: Optional[str] = None, github_name: Optional[str] = None, github_token: Optional[str] = None) -> Dict[str, Any]:
    """
    files: [{'path': str, 'content': str, 'language': str}, ...]
    Returns: {'files': [...parsed...], 'edges': [...]}
    """
    parsed = []
    file_paths = [f.get('path', '') for f in files]
    
    # Fetch churn data concurrently for all files
    churn_data = await compute_git_churn(github_owner, github_name, github_token, file_paths)
    
    for f in files:
        path = f.get('path', '')
        content = f.get('content', '')
        try:
            result = parse_file(path, content)
            # Integrate git churn score
            result['churn_score'] = float(churn_data.get(path, 1.0))
            parsed.append(result)
        except Exception as e:
            parsed.append({'path': path, 'functions': [], 'imports': [],
                           'complexity_score': 1.0, 'churn_score': 1.0, 'is_entry_point': False,
                           'module_type': 'utility', 'error': str(e)})

    graph_data = build_dependency_graph(parsed)

    return {
        'files': parsed,
        'edges': graph_data['edges'],
    }

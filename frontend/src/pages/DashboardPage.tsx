import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useApiClient } from '../apiClient';
import { motion, AnimatePresence } from 'framer-motion';

interface Repository {
  id: string;
  githubOwner: string;
  githubName: string;
  githubUrl: string;
  status: 'PENDING' | 'ANALYZING' | 'COMPLETED' | 'FAILED';
  analysisProgress: number;
  analysisStep: string;
  errorMessage?: string;
  aiSummary?: string;
  fileCount?: number;
  functionCount?: number;
  hotspotCount?: number;
  updatedAt?: string;
}

function timeAgo(dateStr?: string) {
  if (!dateStr) return 'just now';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Repo Card ────────────────────────────────────────────────────────────────
function RepoCard({ repo, onRetry, index }: { repo: Repository; onRetry: (id: string) => void; index: number }) {
  const isCompleted = repo.status === 'COMPLETED';
  const isAnalyzing = repo.status === 'ANALYZING' || repo.status === 'PENDING';
  const isFailed = repo.status === 'FAILED';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={`bg-[#14141C] border rounded-lg p-unit-4 flex flex-col transition-all duration-200 shadow-sm shadow-black/10 ${
        isFailed ? 'border-rose-900/30' : 'border-[#24242F] hover:border-[#3F3F4E] hover:-translate-y-0.5'
      } ${isCompleted ? 'cursor-pointer' : ''}`}
    >
      {/* ── Card Header ── */}
      <div className="flex justify-between items-start mb-4 border-b border-[#24242F] pb-3">
        <div className="flex items-center gap-2">
          <span className={`material-symbols-outlined ${isCompleted ? 'text-primary' : 'text-outline'}`} style={{ fontSize: '20px' }}>book</span>
          <h3 className="font-mono text-[14px] text-on-surface">{repo.githubOwner} / {repo.githubName}</h3>
        </div>
        {isCompleted && <span className="badge-completed">COMPLETED</span>}
        {isAnalyzing && (
          <span className="badge-analyzing">
            <span className="material-symbols-outlined animate-spin" style={{ fontSize: '12px' }}>sync</span>
            ANALYZING
          </span>
        )}
        {isFailed && <span className="badge-failed">FAILED</span>}
      </div>

      {/* ── Content ── */}
      {isAnalyzing && (
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer -translate-x-full"></div>
          <div className="space-y-2 mb-4">
            <div className="h-4 bg-[#1B1B26] rounded w-full"></div>
            <div className="h-4 bg-[#1B1B26] rounded w-3/4"></div>
          </div>
          <div className="flex gap-2 mb-4">
            <div className="h-6 w-16 bg-[#1B1B26] rounded"></div>
            <div className="h-6 w-20 bg-[#1B1B26] rounded"></div>
            <div className="h-6 w-24 bg-[#1B1B26] rounded"></div>
          </div>
          {repo.analysisStep && (
            <p className="text-on-surface-variant font-mono text-[12px] mb-4">{repo.analysisStep}</p>
          )}
        </div>
      )}

      {isFailed && (
        <div className="bg-rose-950/20 border border-rose-900/30 rounded p-2 mb-4">
          <p className="text-rose-300/80 text-[12px] font-mono flex items-start gap-2">
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>error</span>
            {repo.errorMessage || 'Analysis failed. Please retry.'}
          </p>
        </div>
      )}

      {isCompleted && (
        <>
          <p className="text-on-surface-variant text-[14px] mb-4 line-clamp-2">
            {repo.aiSummary || `${repo.githubOwner}/${repo.githubName} — analyzed successfully.`}
          </p>
          <div className="flex gap-2 mb-4 flex-wrap">
            {repo.fileCount !== undefined && (
              <span className="bg-[#1B1B26] border border-[#24242F] rounded px-2 py-1 font-mono text-[12px] text-on-surface flex items-center gap-1">
                <span className="text-[#918f9d]">Files:</span> {repo.fileCount.toLocaleString()}
              </span>
            )}
            {repo.functionCount !== undefined && (
              <span className="bg-[#1B1B26] border border-[#24242F] rounded px-2 py-1 font-mono text-[12px] text-on-surface flex items-center gap-1">
                <span className="text-[#918f9d]">Funcs:</span> {repo.functionCount.toLocaleString()}
              </span>
            )}
            {repo.hotspotCount !== undefined && repo.hotspotCount > 0 && (
              <span className="bg-[#1B1B26] border border-amber-500/30 rounded px-2 py-1 font-mono text-[12px] text-amber-400 flex items-center gap-1">
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>local_fire_department</span>
                {repo.hotspotCount} Hotspots
              </span>
            )}
          </div>
          {/* Language Bar (placeholder) */}
          <div className="w-full h-1.5 rounded-full overflow-hidden flex mb-2 bg-[#1B1B26]">
            <div className="h-full bg-[#3178c6]" style={{ width: '70%' }}></div>
            <div className="h-full bg-[#f1e05a]" style={{ width: '20%' }}></div>
            <div className="h-full bg-[#3572A5]" style={{ width: '10%' }}></div>
          </div>
          <div className="flex gap-3 font-mono text-[10px] text-on-surface-variant mb-4">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#3178c6]"></span>TypeScript</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#f1e05a]"></span>JavaScript</span>
          </div>
        </>
      )}

      {/* ── Card Footer ── */}
      <div className={`mt-auto flex justify-between items-center ${isAnalyzing ? 'opacity-50' : ''}`}>
        <span className="text-[12px] text-on-surface-variant">
          {isCompleted && `Updated ${timeAgo(repo.updatedAt)}`}
          {isAnalyzing && `Started ${timeAgo(repo.updatedAt)}`}
          {isFailed && `Failed ${timeAgo(repo.updatedAt)}`}
        </span>
        {isCompleted && (
          <Link to={`/workspace/${repo.id}/overview`} className="bg-[#1B1B26] border border-[#24242F] text-[#e4e4e7] px-4 py-1.5 rounded text-[12px] font-semibold hover:bg-[#39383e] transition-colors">
            Open Workspace
          </Link>
        )}
        {isAnalyzing && (
          <button disabled className="bg-[#1B1B26] border border-[#24242F] text-[#e4e4e7] px-4 py-1.5 rounded text-[12px] font-semibold cursor-not-allowed opacity-50">
            Open Workspace
          </button>
        )}
        {isFailed && (
          <button
            onClick={() => onRetry(repo.id)}
            className="bg-[#1B1B26] border border-rose-900/50 text-rose-400 px-4 py-1.5 rounded text-[12px] font-semibold hover:bg-rose-950/20 transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>refresh</span>
            Retry
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRepoUrl, setNewRepoUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { logout } = useAuth();
  const apiFetch = useApiClient();

  // Fetch repos
  const fetchRepos = async () => {
    try {
      const res = await apiFetch('/api/v1/repos');
      if (res.ok) setRepos(await res.json());
    } catch (err) {
      console.error('[Dashboard] fetchRepos failed:', err);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchRepos();
    // Poll every 3s if any repo is analyzing
    pollRef.current = setInterval(() => {
      setRepos((prev) => {
        const hasActive = prev.some((r) => r.status === 'ANALYZING' || r.status === 'PENDING');
        if (hasActive) fetchRepos();
        return prev;
      });
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRepoUrl.trim()) return;
    setAnalyzing(true);
    try {
      const res = await apiFetch('/api/v1/repos/analyze', {
        method: 'POST',
        body: JSON.stringify({ githubUrl: newRepoUrl }),
      });
      if (res.ok) {
        const repo = await res.json();
        setRepos((prev) => [repo, ...prev]);
        setNewRepoUrl('');
      } else {
        const txt = await res.text().catch(() => '');
        alert(`Analysis failed (HTTP ${res.status}): ${txt || 'Check the backend is running.'}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      alert(`Could not reach backend: ${msg}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRetry = async (id: string) => {
    const repo = repos.find((r) => r.id === id);
    if (!repo) return;
    try {
      await apiFetch('/api/v1/repos/analyze', {
        method: 'POST',
        body: JSON.stringify({ githubUrl: repo.githubUrl }),
      });
      fetchRepos();
    } catch (err) {
      console.error('[Dashboard] handleRetry failed:', err);
    }
  };

  const handleSignOut = async () => {
    await logout();
    navigate('/');
  };

  const filtered = repos.filter((r) =>
    !search || `${r.githubOwner}/${r.githubName}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bg-[#0A0A0F] text-[#e4e1e9] min-h-screen flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* ── Top Nav ── */}
      <header className="bg-[#131318] border-b border-[#494454] w-full h-14 flex justify-between items-center px-gutter sticky top-0 z-50">
        <div className="flex items-center gap-unit-4">
          <span className="font-bold text-[20px] text-on-surface">CodeCompass</span>
        </div>

        {/* Search */}
        <div className="flex-1 flex justify-start pl-unit-8">
          <div className="relative w-64">
            <span className="material-symbols-outlined absolute left-2 top-1.5 text-on-surface-variant" style={{ fontSize: '16px' }}>search</span>
            <input
              className="w-full bg-[#14141C] border border-[#24242F] rounded pl-8 pr-2 py-1 text-on-surface focus:outline-none focus:border-[#8B5CF6] font-mono text-[12px] placeholder-[#52525B]"
              placeholder="Search... ⌘K"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-unit-4 text-on-surface-variant">
          <button className="hover:bg-[#2a292f] transition-colors p-1 rounded">
            <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>notifications</span>
          </button>
          <button className="hover:bg-[#2a292f] transition-colors p-1 rounded">
            <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>help_outline</span>
          </button>
          <button onClick={handleSignOut} className="ml-2 w-8 h-8 rounded-full bg-[#8B5CF6] flex items-center justify-center text-white text-sm font-bold">
            U
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Side Nav ── */}
        <nav className="bg-[#1f1f25] border-r border-[#494454] hidden md:flex flex-col h-screen p-unit-4 w-64 sticky top-14" style={{ height: 'calc(100vh - 3.5rem)' }}>
          <div className="mb-unit-6 pb-unit-4 border-b border-[#494454]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded bg-[#1B1B26] border border-[#24242F] flex items-center justify-center">
                <span className="material-symbols-outlined text-[#5de6ff]" style={{ fontSize: '14px' }}>hub</span>
              </div>
              <h2 className="font-semibold text-[20px] text-on-surface">Repositories</h2>
            </div>
            <p className="text-on-surface-variant font-mono text-[12px]">All your codebases</p>
          </div>

          <div className="flex-1 flex flex-col gap-1">
            <Link to="/dashboard" className="flex items-center gap-3 px-3 py-2 bg-[#00cbe6] text-[#00515d] rounded-lg font-semibold text-[14px]">
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>dashboard</span>
              My Repositories
            </Link>
            <Link to="/cross-repo-chat" className="flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:bg-[#39383e] rounded-lg text-[14px]">
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>compare_arrows</span>
              Cross-Repo Chat
            </Link>
          </div>

          <div className="mt-auto border-t border-[#494454] pt-unit-4 flex flex-col gap-1">
            <button onClick={handleSignOut} className="flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:bg-[#39383e] rounded-lg text-[14px]">
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>logout</span>
              Sign Out
            </button>
          </div>
        </nav>

        {/* ── Main Content ── */}
        <main className="flex-1 overflow-y-auto p-unit-6 bg-[#0A0A0F]">
          <div className="max-w-container-max mx-auto w-full">
            {/* ── Action Bar ── */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-unit-8 gap-unit-4">
              <div>
                <h1 className="text-[32px] font-semibold tracking-[-0.01em] text-on-surface mb-1">My Repositories</h1>
                <p className="text-on-surface-variant text-[14px]">Manage and analyze your connected codebases.</p>
              </div>

              {/* Analyze Input */}
              <form onSubmit={handleAnalyze} className="bg-[#14141C]/60 backdrop-blur border border-[#24242F] p-2 rounded-lg flex items-center gap-3 w-full md:w-96">
                <span className="material-symbols-outlined text-outline ml-2" style={{ fontSize: '18px' }}>link</span>
                <input
                  className="bg-transparent border-none focus:ring-0 text-on-surface font-mono text-[12px] flex-1 outline-none placeholder-[#52525B]"
                  placeholder="https://github.com/owner/repo"
                  type="text"
                  value={newRepoUrl}
                  onChange={(e) => setNewRepoUrl(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={analyzing}
                  className="bg-[#8B5CF6] text-white px-4 py-1.5 rounded font-mono text-[12px] whitespace-nowrap hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
                >
                  {analyzing ? (
                    <span className="material-symbols-outlined animate-spin" style={{ fontSize: '14px' }}>progress_activity</span>
                  ) : null}
                  Analyze
                </button>
              </form>
            </div>

            {/* ── Repo Grid ── */}
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <span className="material-symbols-outlined animate-spin text-primary" style={{ fontSize: '40px' }}>progress_activity</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-[#14141C] border border-[#24242F] rounded-xl p-12 text-center flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-[#1B1B26] rounded-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#958ea0]" style={{ fontSize: '32px' }}>folder_open</span>
                </div>
                <div>
                  <h3 className="text-[20px] font-semibold text-on-surface mb-2">No repositories yet</h3>
                  <p className="text-on-surface-variant text-[14px] max-w-md">
                    Paste a GitHub URL in the input above to start your first codebase analysis. CodeCompass will automatically parse and embed the repository.
                  </p>
                </div>
              </div>
            ) : (
              <motion.div layout className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-unit-4">
                <AnimatePresence>
                  {filtered.map((repo, idx) => (
                    <RepoCard key={repo.id} repo={repo} onRetry={handleRetry} index={idx} />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

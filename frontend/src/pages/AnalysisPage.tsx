import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApiClient } from '../apiClient';

const STAGES = [
  { key: 'CLONING',    label: 'Cloning',                   detail: 'Fetching repository metadata and file tree from GitHub...' },
  { key: 'PARSING',    label: 'Parsing',                   detail: 'Running AST analysis over all source files...' },
  { key: 'GRAPH',      label: 'Building Graph',            detail: 'Computing module dependency graph with NetworkX...' },
  { key: 'EMBEDDING',  label: 'Generating Embeddings',     detail: 'Embedding code chunks via Gemini API...' },
  { key: 'SUMMARIZING',label: 'Summarizing',               detail: 'Generating AI summaries per file...' },
  { key: 'ONBOARDING', label: 'Generating Onboarding Path',detail: 'Analyzing entry points and dependency depth...' },
  { key: 'COMPLETE',   label: 'Complete',                  detail: '' },
];

interface AnalysisStatus {
  status: string;
  currentStage?: string;
  analysisStep?: string;
  analysisProgress?: number;
  filesTotal?: number;
  filesParsed?: number;
  functionsFound?: number;
  dependenciesMapped?: number;
}

/**
 * AnalysisPage
 *
 * Polls GET /api/v1/repos/{repoId}/status every 2 seconds and renders a live
 * progress checklist. Navigates to the workspace once status === 'COMPLETED'.
 *
 * Backend contract (status response):
 * {
 *   status: 'PENDING' | 'ANALYZING' | 'COMPLETED' | 'FAILED',
 *   analysisProgress: number (0-100),
 *   analysisStep: string (human-readable current step),
 *   currentStage: string,
 *   filesTotal: number,
 *   filesParsed: number,
 *   functionsFound: number,
 *   dependenciesMapped: number
 * }
 */
export default function AnalysisPage() {
  const { repoId } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const apiFetch = useApiClient();

  const [status, setStatus]     = useState<AnalysisStatus>({ status: 'ANALYZING', analysisProgress: 5 });
  const [repoName, setRepoName] = useState('Analyzing...');
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    if (!repoId) return;
    let cancelled = false;

    // Fetch initial repo info to display the friendly name in the header.
    apiFetch(`/api/v1/repos/${repoId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && !cancelled) {
          setRepoName(`${data.githubOwner} / ${data.githubName}`);
          // If a previous session left this already completed, navigate immediately.
          if (data.status === 'COMPLETED') {
            navigate(`/workspace/${repoId}/overview`, { replace: true });
          }
        }
      })
      .catch(() => { /* ignore – repoName stays as 'Analyzing...' */ });

    // Poll the status endpoint every 2 seconds.
    const poll = setInterval(async () => {
      if (cancelled) return;
      try {
        const res = await apiFetch(`/api/v1/repos/${repoId}/status`);
        if (!res.ok) return; // Transient server error — keep polling.
        const data: AnalysisStatus = await res.json();
        if (!cancelled) {
          setStatus(data);
          if (data.status === 'COMPLETED') {
            clearInterval(poll);
            // Small delay so the user can see the "Complete" state before redirect.
            setTimeout(() => navigate(`/workspace/${repoId}/overview`, { replace: true }), 1500);
          } else if (data.status === 'FAILED') {
            clearInterval(poll);
            setHasFailed(true);
          }
        }
      } catch {
        // Network hiccup — keep polling until we get a response or the user cancels.
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [repoId]); // eslint-disable-line react-hooks/exhaustive-deps
  // NOTE: apiFetch and navigate are stable references from hooks; excluding them
  // prevents the effect from re-registering on every render while remaining safe.

  // Determine which checklist item is active based on progress percentage.
  const activeStageIndex = STAGES.findIndex(s =>
    s.label.toUpperCase().replace(/\s+/g, '_').includes((status.currentStage || status.analysisStep || '').toUpperCase())
  );
  const currentIdx    = activeStageIndex >= 0 ? activeStageIndex : Math.floor((status.analysisProgress ?? 0) / (100 / STAGES.length));
  const progressPct   = status.analysisProgress ?? 0;

  return (
    <div
      className="bg-[#131318] text-[#e4e1e9] min-h-screen flex flex-col antialiased"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      {/* Top progress bar */}
      <div className="fixed top-0 left-0 w-full h-1 bg-[#1f1f25] z-50">
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${progressPct}%`,
            background: 'linear-gradient(90deg, #a078ff, #5de6ff)',
          }}
        />
      </div>

      <main className="flex-1 flex flex-col items-center justify-center w-full max-w-3xl mx-auto px-gutter py-unit-8 relative z-10">

        {/* Header */}
        <div className="text-center mb-unit-8 w-full">
          <h2 className="font-mono text-[11px] text-on-surface-variant uppercase tracking-widest mb-unit-2">Target Acquired</h2>
          <h1 className="font-mono text-[32px] font-semibold text-on-surface">{repoName}</h1>
        </div>

        {/* Failed banner */}
        {hasFailed && (
          <div className="w-full mb-unit-6 bg-rose-500/10 border border-rose-500/30 text-rose-400 p-4 rounded-lg flex items-center gap-3">
            <span className="material-symbols-outlined">error</span>
            <div>
              <p className="font-semibold text-[14px]">Analysis failed</p>
              <p className="font-mono text-[13px] mt-1 text-rose-300">
                The pipeline encountered an error. Check that the Python service is running and your GitHub token is valid, then try re-analyzing.
              </p>
            </div>
          </div>
        )}

        {/* Live counter grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-unit-4 w-full mb-unit-8">
          {[
            { label: 'Files Parsed',        value: status.filesParsed      ?? 0, total: status.filesTotal, color: 'text-on-surface' },
            { label: 'Functions Found',     value: status.functionsFound   ?? 0,                           color: 'text-[#5de6ff]'  },
            { label: 'Dependencies Mapped', value: status.dependenciesMapped ?? 0,                         color: 'text-primary'    },
          ].map(counter => (
            <div key={counter.label} className="bg-[#131318] border border-[#494454] rounded-lg p-unit-4 flex flex-col items-center justify-center text-center">
              <span className="font-mono text-[12px] text-on-surface-variant mb-unit-1">{counter.label}</span>
              <div className={`text-[20px] font-semibold font-mono ${counter.color} flex items-baseline gap-1`}>
                {counter.value.toLocaleString()}
                {counter.total !== undefined && (
                  <span className="font-mono text-[12px] text-outline">/ {counter.total}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Analysis checklist */}
        <div className="w-full bg-[#1f1f25] border border-[#494454] rounded-xl p-unit-6 flex flex-col gap-unit-4 shadow-lg">
          {STAGES.map((stage, i) => {
            const isDone    = i < currentIdx;
            const isActive  = i === currentIdx && !hasFailed;
            const isPending = i > currentIdx || hasFailed;

            return (
              <div key={stage.key}>
                {isDone && (
                  <div className="flex items-center gap-unit-4">
                    <span className="material-symbols-outlined text-[#5de6ff]" style={{ fontSize: '22px', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    <span className="font-mono text-[14px] text-on-surface-variant">{stage.label}</span>
                    <div className="flex-1 border-b border-dashed border-[#494454]/30 mx-unit-2"></div>
                    <span className="font-mono text-[12px] text-outline">Done</span>
                  </div>
                )}
                {isActive && (
                  <div className="flex items-start gap-unit-4 py-unit-2 relative pl-1">
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary rounded-r-full"></div>
                    <div className="relative flex items-center justify-center w-6 h-6 shrink-0 mt-0.5">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-30" style={{ animation: 'ping-dot 1s cubic-bezier(0,0,0.2,1) infinite' }}></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
                    </div>
                    <div className="flex flex-col flex-1">
                      <div className="flex items-center justify-between w-full">
                        <span className="font-mono text-[14px] text-primary font-bold">{stage.label}</span>
                        <span className="font-mono text-[12px] text-primary animate-pulse">Processing...</span>
                      </div>
                      {stage.detail && (
                        <span className="font-mono text-[12px] text-on-surface-variant mt-unit-1">{stage.detail}</span>
                      )}
                    </div>
                  </div>
                )}
                {isPending && (
                  <div className="flex items-center gap-unit-4 opacity-40">
                    <span className="material-symbols-outlined text-outline" style={{ fontSize: '22px' }}>radio_button_unchecked</span>
                    <span className="font-mono text-[14px] text-outline">{stage.label}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Cancel / retry */}
        <div className="mt-unit-8 flex gap-unit-4">
          {hasFailed && (
            <button
              onClick={() => navigate(`/dashboard`)}
              className="font-mono text-[14px] text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-unit-2 px-unit-4 py-unit-2 rounded-lg hover:bg-rose-950/20"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
              Back to Dashboard
            </button>
          )}
          <button
            onClick={() => navigate('/dashboard')}
            className="font-mono text-[14px] text-outline hover:text-error transition-colors duration-200 flex items-center gap-unit-2 px-unit-4 py-unit-2 rounded-lg hover:bg-error-container/10"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>cancel</span>
            Cancel Analysis
          </button>
        </div>
      </main>

      <style>{`
        @keyframes ping-dot {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

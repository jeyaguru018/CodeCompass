import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

const STAGES = [
  { key: 'CLONING', label: 'Cloning', detail: 'Fetching repository metadata and file tree from GitHub...' },
  { key: 'PARSING', label: 'Parsing', detail: 'Running AST analysis over all source files...' },
  { key: 'GRAPH', label: 'Building Graph', detail: 'Computing module dependency graph with NetworkX...' },
  { key: 'EMBEDDING', label: 'Generating Embeddings', detail: 'Embedding code chunks via Gemini API...' },
  { key: 'SUMMARIZING', label: 'Summarizing', detail: 'Generating AI summaries per file...' },
  { key: 'ONBOARDING', label: 'Generating Onboarding Path', detail: 'Analyzing entry points and dependency depth...' },
  { key: 'COMPLETE', label: 'Complete', detail: '' },
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

export default function AnalysisPage() {
  const { repoId } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<AnalysisStatus>({ status: 'ANALYZING', analysisProgress: 20 });
  const [repoName, setRepoName] = useState('Analyzing...');
  const { getToken } = useAuth();

  useEffect(() => {
    if (!repoId) return;
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token || cancelled) return;

      // Fetch initial repo info
      fetch(`http://localhost:8081/api/v1/repos/${repoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.ok ? r.json() : null).then(data => {
        if (data && !cancelled) {
          setRepoName(`${data.githubOwner} / ${data.githubName}`);
          if (data.status === 'COMPLETED') {
            navigate(`/workspace/${repoId}/overview`);
          }
        }
      }).catch(() => {});

      // Poll for status
      const poll = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:8081/api/v1/repos/${repoId}/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
          if (data.status === 'COMPLETED') {
            clearInterval(poll);
            setTimeout(() => navigate(`/workspace/${repoId}/overview`), 1500);
          } else if (data.status === 'FAILED') {
            clearInterval(poll);
          }
        }
      } catch { /* ignore */ }
    }, 2000);

      return () => { cancelled = true; clearInterval(poll); };
    })();
  }, [repoId]);


  // Determine which stage is active
  const activeStageIndex = STAGES.findIndex(s =>
    s.label.toUpperCase().replace(/\s+/g, '_').includes((status.currentStage || status.analysisStep || '').toUpperCase())
  );
  const currentIdx = activeStageIndex >= 0 ? activeStageIndex : Math.floor((status.analysisProgress ?? 0) / (100 / STAGES.length));
  const progressPct = status.analysisProgress ?? 0;

  return (
    <div
      className="bg-[#131318] text-[#e4e1e9] min-h-screen flex flex-col antialiased"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      {/* Progress Bar */}
      <div className="fixed top-0 left-0 w-full h-1 bg-[#1f1f25] z-50">
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${progressPct}%`,
            background: 'linear-gradient(90deg, #a078ff, #5de6ff)',
          }}
        />
      </div>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center w-full max-w-3xl mx-auto px-gutter py-unit-8 relative z-10">
        {/* Header */}
        <div className="text-center mb-unit-8 w-full">
          <h2 className="font-mono text-[11px] text-on-surface-variant uppercase tracking-widest mb-unit-2">Target Acquired</h2>
          <h1 className="font-mono text-[32px] font-semibold text-on-surface">{repoName}</h1>
        </div>

        {/* Live Counter Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-unit-4 w-full mb-unit-8">
          {[
            { label: 'Files Parsed', value: status.filesParsed ?? 0, total: status.filesTotal, color: 'text-on-surface' },
            { label: 'Functions Found', value: status.functionsFound ?? 0, color: 'text-[#5de6ff]' },
            { label: 'Dependencies Mapped', value: status.dependenciesMapped ?? 0, color: 'text-primary' },
          ].map((counter) => (
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

        {/* Analysis Checklist */}
        <div className="w-full bg-[#1f1f25] border border-[#494454] rounded-xl p-unit-6 flex flex-col gap-unit-4 shadow-lg">
          {STAGES.map((stage, i) => {
            const isDone = i < currentIdx;
            const isActive = i === currentIdx;
            const isPending = i > currentIdx;

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

        {/* Cancel */}
        <button
          onClick={() => navigate('/dashboard')}
          className="mt-unit-8 font-mono text-[14px] text-outline hover:text-error transition-colors duration-200 flex items-center gap-unit-2 px-unit-4 py-unit-2 rounded-lg hover:bg-error-container/10"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>cancel</span>
          Cancel Analysis
        </button>
      </main>

      <style>{`
        @keyframes ping-dot {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

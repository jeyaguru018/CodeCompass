import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate, Routes, Route, NavLink } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import DiffExplainerTab from './DiffExplainerTab';
import ADRModal from './ADRModal';
import CountUp from 'react-countup';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Repo {
  id: string;
  githubOwner: string;
  githubName: string;
  aiSummary?: string;
  fileCount?: number;
  functionCount?: number;
  hotspotCount?: number;
  status?: string;
}
interface ChatMessage { role: 'user' | 'assistant'; content: string; id: string; }

// ─── Shared Sidebar ───────────────────────────────────────────────────────────
function WorkspaceSidebar({ repo, repoId }: { repo: Repo | null; repoId: string }) {
  const tabs = [
    { path: 'overview', icon: 'dashboard', label: 'Overview' },
    { path: 'architecture', icon: 'account_tree', label: 'Architecture Map' },
    { path: 'chat', icon: 'forum', label: 'Repo Chat' },
    { path: 'onboarding', icon: 'rocket_launch', label: 'Onboarding' },
    { path: 'explorer', icon: 'folder_open', label: 'Explorer' },
    { path: 'diff', icon: 'difference', label: 'Diff Explainer' },
    { path: 'settings', icon: 'settings', label: 'Settings' },
  ];

  return (
    <nav className="bg-[#1f1f25] border-r border-[#494454] hidden md:flex flex-col h-screen p-unit-4 w-64 fixed left-0 top-0 z-40" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
      {/* Repo Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-8 h-8 rounded-full bg-[#1B1B26] border border-[#24242F] flex items-center justify-center">
          <span className="material-symbols-outlined text-[#22D3EE]" style={{ fontSize: '16px' }}>hub</span>
        </div>
        <div>
          <h1 className="font-semibold text-[20px] text-on-surface truncate" style={{ fontFamily: 'Inter, sans-serif' }}>
            {repo ? repo.githubName : '...'}
          </h1>
          <p className="font-mono text-[12px] text-on-surface-variant truncate">
            {repo ? repo.githubOwner : ''}
          </p>
        </div>
      </div>

      {/* Nav Links */}
      <div className="flex-1 flex flex-col gap-1">
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={`/workspace/${repoId}/${tab.path}`}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 text-[14px] ${
                isActive
                  ? 'bg-[#00cbe6] text-[#00515d] font-medium'
                  : 'text-on-surface-variant hover:bg-[#39383e]'
              }`
            }
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-4 border-t border-[#494454] pt-4 flex flex-col gap-1">
        <Link
          to="/dashboard"
          className="flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:bg-[#39383e] rounded-lg text-[14px] transition-all"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
          All Repos
        </Link>
        <a href="#" className="flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:bg-[#39383e] rounded-lg text-[12px] transition-all">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>description</span>
          Docs
        </a>
        <a href="#" className="flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:bg-[#39383e] rounded-lg text-[12px] transition-all">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>contact_support</span>
          Support
        </a>
      </div>
    </nav>
  );
}

// ─── Top Bar ─────────────────────────────────────────────────────────────────
function TopBar({ repo, tabLabel }: { repo: Repo | null; tabLabel: string }) {
  return (
    <header className="w-full h-14 bg-[#131318] border-b border-[#494454] flex justify-between items-center px-gutter flex-shrink-0 sticky top-0 z-30">
      <div className="flex items-center gap-2">
        <span className="font-bold text-[20px] text-on-surface md:hidden mr-4" style={{ fontFamily: 'Inter, sans-serif' }}>CodeCompass</span>
        <nav className="hidden md:flex items-center gap-2 text-on-surface-variant font-mono text-[12px]">
          <Link className="hover:text-primary transition-colors" to="/dashboard">Repositories</Link>
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
          <span className="text-on-surface-variant">{repo?.githubOwner}</span>
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
          <span className="text-on-surface">{repo?.githubName}</span>
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
          <span className="text-primary">{tabLabel}</span>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <button className="text-on-surface-variant hover:bg-[#1f1f25] p-1 rounded-full">
          <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>notifications</span>
        </button>
        <button className="text-on-surface-variant hover:bg-[#1f1f25] p-1 rounded-full">
          <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>help_outline</span>
        </button>
        <div className="w-8 h-8 rounded-full bg-[#8B5CF6] flex items-center justify-center text-white text-sm font-bold ml-2">U</div>
      </div>
    </header>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ repo }: { repo: Repo | null }) {
  return (
    <div className="p-gutter md:p-unit-6 space-y-unit-6">
      {/* AI Summary */}
      <div className="bg-[#14141C] border border-[#24242F] rounded-xl p-unit-6 relative overflow-hidden flex items-start gap-4">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#8B5CF6]"></div>
        <div className="p-2 bg-[#1B1B26] rounded-lg border border-[#24242F] text-[#22D3EE] flex-shrink-0 mt-1">
          <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>auto_awesome</span>
        </div>
        <div>
          <h2 className="text-[20px] font-semibold text-on-surface mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>Repository Intelligence Summary</h2>
          <p className="text-[16px] text-on-surface-variant leading-relaxed max-w-4xl">
            {repo?.aiSummary || (
              <>
                The <span className="font-mono text-[#22D3EE] bg-[#1B1B26] px-1 rounded">{repo?.githubName || 'repository'}</span> has been analyzed. The AI-generated architecture map, embeddings, and onboarding path are ready. Use the tabs on the left to explore.
              </>
            )}
          </p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-unit-4">
        {[
          { icon: 'folder', label: 'Files', value: repo?.fileCount ?? '—', color: 'text-on-surface' },
          { icon: 'data_object', label: 'Functions', value: repo?.functionCount ?? '—', color: 'text-on-surface' },
          { icon: 'local_fire_department', label: 'Hotspots', value: repo?.hotspotCount ?? '—', color: repo?.hotspotCount ? 'text-error' : 'text-on-surface', warn: (repo?.hotspotCount ?? 0) > 0 },
          { icon: 'library_books', label: 'Doc Coverage', value: '84%', color: 'text-on-surface' },
        ].map((stat) => (
          <div key={stat.label} className="bg-[#14141C] border border-[#24242F] rounded-xl p-unit-4 hover:border-[#3F3F4E] transition-colors relative overflow-hidden">
            {stat.warn && (
              <div className="absolute top-0 right-0 p-2 text-error">
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>warning</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-on-surface-variant mb-2">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{stat.icon}</span>
              <span className="font-mono text-[11px] uppercase tracking-widest font-semibold">{stat.label}</span>
            </div>
            <div className={`text-[48px] leading-none font-bold tracking-tight font-mono ${stat.color}`}>
              {typeof stat.value === 'number' ? <CountUp end={stat.value} duration={2} separator="," /> : stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Language + Onboarding */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-unit-4">
        <div className="bg-[#14141C] border border-[#24242F] rounded-xl p-unit-6 lg:col-span-2">
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#24242F]">
            <h3 className="text-[20px] font-semibold text-on-surface" style={{ fontFamily: 'Inter, sans-serif' }}>Language Breakdown</h3>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-8">
            <svg className="w-48 h-48 -rotate-90 flex-shrink-0" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" fill="transparent" stroke="#1B1B26" strokeWidth="16" />
              <circle cx="50" cy="50" r="40" fill="transparent" stroke="#22D3EE" strokeDasharray="251.2" strokeDashoffset="236.1" strokeWidth="16" />
              <circle cx="50" cy="50" r="40" fill="transparent" stroke="#8B5CF6" strokeDasharray="251.2" strokeDashoffset="206" strokeWidth="16" style={{ transform: 'rotate(21.6deg)', transformOrigin: '50px 50px' }} />
              <circle cx="50" cy="50" r="40" fill="transparent" stroke="#3178C6" strokeDasharray="251.2" strokeDashoffset="45.2" strokeWidth="16" style={{ transform: 'rotate(64.8deg)', transformOrigin: '50px 50px' }} />
            </svg>
            <div className="flex-1 w-full space-y-3">
              {[
                { lang: 'TypeScript', pct: '82%', color: '#3178C6' },
                { lang: 'Python', pct: '12%', color: '#8B5CF6' },
                { lang: 'Go', pct: '6%', color: '#22D3EE' },
              ].map((l) => (
                <div key={l.lang} className="flex items-center justify-between p-2 rounded hover:bg-[#1B1B26] transition-colors border border-transparent hover:border-[#3F3F4E]">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: l.color }}></div>
                    <span className="font-mono text-[14px] text-on-surface">{l.lang}</span>
                  </div>
                  <span className="font-mono text-[14px] text-on-surface-variant">{l.pct}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-[#14141C] border border-[#24242F] rounded-xl p-unit-6 flex flex-col">
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#24242F]">
            <h3 className="text-[20px] font-semibold text-on-surface" style={{ fontFamily: 'Inter, sans-serif' }}>Onboarding</h3>
            <span className="font-mono text-[12px] text-[#22D3EE] bg-[#1B1B26] px-2 py-1 rounded border border-[#24242F]">In Progress</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center py-4">
            <div className="relative w-32 h-32 mb-6">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="transparent" stroke="#1B1B26" strokeWidth="8" />
                <circle cx="50" cy="50" r="45" fill="transparent" stroke="#8B5CF6" strokeDasharray="282.7" strokeDashoffset="188.5" strokeLinecap="round" strokeWidth="8" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[28px] font-bold text-on-surface">3<span className="text-[20px] text-on-surface-variant">/9</span></span>
              </div>
            </div>
            <p className="font-body-sm text-on-surface-variant text-center mb-6 text-[14px]">Modules completed. Next up: Local Environment Setup.</p>
            <Link to={`/workspace/${repo?.id ?? ''}/onboarding`} className="w-full py-2 bg-[#1B1B26] text-[#e4e4e7] border border-[#24242F] rounded-lg hover:border-[#3F3F4E] transition-colors flex items-center justify-center gap-2 text-[14px]">
              Continue Onboarding
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Architecture Map Tab ─────────────────────────────────────────────────────
function ArchitectureTab({ repoId }: { repoId: string }) {
  const [showADR, setShowADR] = useState(false);
  const selectedModule = 'src/server/middleware/auth.ts';

  return (
    <div className="flex-1 relative overflow-hidden grid-bg h-full" style={{ height: 'calc(100vh - 56px)' }}>
      {/* Floating Toolbar */}
      <div className="absolute top-unit-6 left-unit-6 z-20 flex flex-col gap-unit-3">
        <div className="bg-[#131318] rounded-lg border border-[#24242F] p-unit-1 flex gap-unit-1 shadow-lg">
          <button className="px-unit-3 py-1 rounded text-on-surface-variant font-mono text-[12px] hover:text-on-surface">Module</button>
          <button className="px-unit-3 py-1 rounded bg-[#2a292f] text-on-surface font-mono text-[12px] font-medium">Function</button>
        </div>
        <div className="bg-[#131318] rounded-lg border border-[#24242F] p-unit-2 flex items-center justify-between gap-unit-4 shadow-lg">
          <div className="flex items-center gap-unit-2">
            <span className="material-symbols-outlined text-rose-500" style={{ fontSize: '18px' }}>local_fire_department</span>
            <span className="font-mono text-[12px] text-on-surface">Heatmap</span>
          </div>
          <div className="w-8 h-4 bg-rose-500/20 rounded-full relative cursor-pointer border border-rose-500/50">
            <div className="w-4 h-4 bg-rose-500 rounded-full absolute right-0 top-1/2 -translate-y-1/2 shadow-[0_0_8px_rgba(244,63,94,0.8)]"></div>
          </div>
        </div>
        <div className="bg-[#131318] rounded-lg border border-[#24242F] flex flex-col shadow-lg overflow-hidden mt-unit-4">
          <button className="p-unit-2 hover:bg-[#2a292f] text-on-surface-variant hover:text-on-surface transition-colors border-b border-[#24242F]">
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>add</span>
          </button>
          <button className="p-unit-2 hover:bg-[#2a292f] text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>remove</span>
          </button>
        </div>
      </div>

      {/* Graph Canvas */}
      <svg className="w-full h-full absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <path d="M 400 300 Q 500 250 600 350" stroke="#24242F" strokeWidth="1.5" fill="none" />
        <path d="M 600 350 L 750 300" stroke="#24242F" strokeWidth="1.5" fill="none" />
        <path d="M 600 350 L 550 500" stroke="#f43f5e" strokeWidth="2" fill="none" opacity="0.6" />
        <path d="M 550 500 L 400 600" stroke="#f43f5e" strokeWidth="2" fill="none" opacity="0.6" />
        <path d="M 600 350 Q 800 450 850 550" stroke="#8B5CF6" strokeWidth="2" fill="none" strokeDasharray="4" style={{ animation: 'dash-anim 20s linear infinite' }} />
        <path d="M 400 300 L 250 400" stroke="#24242F" strokeWidth="1.5" fill="none" />
        <path d="M 250 400 L 200 550" stroke="#24242F" strokeWidth="1.5" fill="none" />
      </svg>

      {/* Graph Nodes */}
      <div className="absolute" style={{ top: 330, left: 580, zIndex: 10 }}>
        <div className="bg-[#14141C] border-2 border-[#8B5CF6] rounded-xl p-unit-3 flex flex-col items-center gap-unit-2 shadow-xl cursor-pointer" style={{ boxShadow: '0 0 16px 2px rgba(34,211,238,0.3)' }}>
          <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center border border-cyan-500/30">
            <span className="material-symbols-outlined text-cyan-400" style={{ fontSize: '20px' }}>account_tree</span>
          </div>
          <div className="text-center">
            <div className="font-mono text-[14px] text-on-surface font-medium">server.ts</div>
            <div className="font-mono text-[12px] text-on-surface-variant">Core</div>
          </div>
        </div>
      </div>
      {[
        { top: 480, left: 520, icon: 'lock', label: 'auth.ts', sub: 'High Churn', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30', glow: '0 0 24px 6px rgba(244,63,94,0.5)' },
        { top: 580, left: 360, icon: 'database', label: 'db_pool.ts', sub: 'Complex', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', glow: '0 0 20px 4px rgba(245,158,11,0.4)' },
        { top: 280, left: 350, icon: 'api', label: 'router.ts', sub: 'API Layer', color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/30', glow: 'none' },
        { top: 280, left: 730, icon: 'view_quilt', label: 'views.ts', sub: 'UI', color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/30', glow: 'none' },
      ].map((node) => (
        <div key={node.label} className="absolute bg-[#14141C] border border-[#24242F] rounded-xl p-unit-3 flex flex-col items-center gap-unit-2 shadow-xl hover:-translate-y-1 transition-transform cursor-pointer" style={{ top: node.top, left: node.left, zIndex: 10, boxShadow: node.glow !== 'none' ? node.glow : undefined }}>
          <div className={`w-10 h-10 rounded-full ${node.bg} flex items-center justify-center border ${node.border}`}>
            <span className={`material-symbols-outlined ${node.color}`} style={{ fontSize: '20px' }}>{node.icon}</span>
          </div>
          <div className="text-center">
            <div className="font-mono text-[14px] text-on-surface font-medium">{node.label}</div>
            <div className={`font-mono text-[12px] ${node.color}`}>{node.sub}</div>
          </div>
        </div>
      ))}

      {/* Right Drawer */}
      <aside className="absolute right-0 top-0 bottom-0 w-[380px] bg-[#14141C] border-l border-[#24242F] flex flex-col z-30 shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
        <div className="p-unit-4 border-b border-[#24242F] flex justify-between items-start">
          <div>
            <div className="flex items-center gap-unit-2 mb-unit-2">
              <span className="px-unit-2 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded font-mono text-[12px] flex items-center gap-1">
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>local_fire_department</span> Hotspot
              </span>
              <span className="px-unit-2 py-0.5 bg-[#1B1B26] text-[#A1A1AA] border border-[#24242F] rounded font-mono text-[12px]">Middleware</span>
            </div>
            <h2 className="font-mono text-[14px] text-on-surface break-all">src/server/middleware/auth.ts</h2>
          </div>
          <button className="text-on-surface-variant hover:text-on-surface p-unit-1 rounded hover:bg-[#1B1B26] transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-unit-4 flex flex-col gap-unit-6">
          <div>
            <h3 className="font-mono text-[11px] text-on-surface-variant uppercase tracking-widest mb-3">Health Metrics</h3>
            <div className="space-y-3">
              {[
                { label: 'Cyclomatic Complexity', value: '42', color: 'text-amber-400', pct: '85%' },
                { label: 'Churn Score', value: '78', color: 'text-rose-400', pct: '78%' },
              ].map((m) => (
                <div key={m.label} className="bg-[#1B1B26] p-unit-3 rounded-lg border border-[#24242F]">
                  <div className="flex justify-between items-end mb-unit-2">
                    <span className="font-mono text-[12px] text-on-surface">{m.label}</span>
                    <span className={`font-mono text-[14px] ${m.color} font-bold`}>{m.value}</span>
                  </div>
                  <div className="w-full bg-[#14141C] h-2 rounded-full overflow-hidden">
                    <div className="bg-gradient-to-r from-amber-500 to-rose-500 h-full rounded-full" style={{ width: m.pct }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="font-mono text-[11px] text-on-surface-variant uppercase tracking-widest mb-3">AI Summary</h3>
            <p className="font-mono text-[13px] text-on-surface-variant leading-relaxed">
              This middleware handles JWT validation and role-based access control. High complexity in the <code className="text-[#5de6ff] bg-[#1B1B26] px-1 rounded">verifyToken()</code> function.
            </p>
          </div>
          <div className="flex flex-col gap-2 mt-auto">
            <button 
              onClick={() => setShowADR(true)}
              className="w-full py-2 bg-[#8B5CF6] text-white rounded-lg font-mono text-[13px] font-semibold hover:opacity-90 flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>architecture</span>
              Generate ADR
            </button>
            <button className="w-full py-2 bg-[#1B1B26] border border-[#24242F] text-on-surface rounded-lg font-mono text-[13px] hover:border-[#3F3F4E] flex items-center justify-center gap-2">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>folder_open</span>
              Open in Explorer
            </button>
          </div>
        </div>
      </aside>
      
      {showADR && (
        <ADRModal 
          repoId={repoId} 
          moduleName={selectedModule} 
          onClose={() => setShowADR(false)} 
        />
      )}
    </div>
  );
}

// ─── Repo Chat Tab ────────────────────────────────────────────────────────────
function ChatTab({ repoId }: { repoId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { getToken } = useAuth();

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const token = await getToken();
      const res = await fetch(`http://localhost:8081/api/v1/repos/${repoId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: userMsg.content }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { id: Date.now().toString() + 'a', role: 'assistant', content: data.answer || data.message || 'No response from AI.' }]);
    } catch {
      setMessages(prev => [...prev, { id: Date.now().toString() + 'e', role: 'assistant', content: '⚠️ Could not reach the backend. Make sure the service is running.' }]);
    } finally {
      setLoading(false);
    }
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleShare = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`http://localhost:8081/api/v1/repos/${repoId}/chat/share`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const url = `${window.location.origin}/chat/${data.shareToken}`;
        await navigator.clipboard.writeText(url);
        alert('Share link copied to clipboard: ' + url);
      } else {
        alert('Failed to generate share link.');
      }
    } catch (e) {
      console.error(e);
      alert('Error generating share link.');
    }
  };

  const SUGGESTED = ['Explain the auth flow', 'What are the hotspots?', 'How is the database layer structured?'];

  useEffect(() => {
    const fetchChatHistory = async () => {
      const token = await getToken();
      if (!token) return;
      try {
        const res = await fetch(`http://localhost:8081/api/v1/repos/${repoId}/chat/sessions`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const sessions = await res.json();
        if (sessions && sessions.length > 0) {
          const sessionId = sessions[0].id;
          const msgRes = await fetch(`http://localhost:8081/api/v1/repos/${repoId}/chat/sessions/${sessionId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const sessionData = await msgRes.json();
          if (sessionData.messages) {
            setMessages(sessionData.messages);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchChatHistory();
  }, [repoId]);

  return (
    <div className="flex h-full overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>
      <div className="flex-1 flex flex-col relative">
        {/* Share Button */}
        {messages.length > 0 && (
          <button 
            onClick={handleShare}
            className="absolute top-4 right-6 z-10 bg-[#1B1B26] border border-[#24242F] p-2 rounded-lg hover:bg-[#3F3F4E] hover:border-[#8B5CF6] text-on-surface-variant hover:text-primary flex items-center gap-2 text-[12px] font-mono shadow-md transition-all"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>share</span>
            Share
          </button>
        )}
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-unit-6 space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-xl p-unit-3 ${
                msg.role === 'user'
                  ? 'bg-[#1B1B26] border border-[#3F3F4E] text-on-surface'
                  : 'bg-[#131318] border border-primary/20 text-on-surface-variant'
              }`}>
                <p className="font-mono text-[14px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-[#131318] border border-primary/20 rounded-xl p-unit-3 flex items-center gap-2">
                <span className="material-symbols-outlined animate-pulse text-primary" style={{ fontSize: '16px' }}>more_horiz</span>
                <span className="font-mono text-[13px] text-on-surface-variant">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions */}
        {messages.length < 2 && (
          <div className="px-unit-6 pb-2 flex gap-2 flex-wrap">
            {SUGGESTED.map((q) => (
              <button key={q} onClick={() => setInput(q)} className="bg-[#1B1B26] border border-[#24242F] hover:border-[#8B5CF6] text-on-surface-variant hover:text-primary font-mono text-[12px] px-3 py-1.5 rounded-full transition-all">
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <form onSubmit={send} className="p-unit-4 border-t border-[#24242F] flex items-center gap-3">
          <input
            className="flex-1 bg-[#1f1f25] border border-[#494454] rounded-lg px-4 py-2.5 font-mono text-[14px] text-on-surface outline-none focus:border-[#8B5CF6] placeholder-[#52525B]"
            placeholder="Ask anything about this codebase..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" disabled={loading} className="bg-[#8B5CF6] text-white p-2.5 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity" style={{ boxShadow: '0 0 10px rgba(139,92,246,0.3)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>send</span>
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Onboarding Tab ───────────────────────────────────────────────────────────
function OnboardingTab({ repoId }: { repoId: string }) {
  const [steps, setSteps] = useState<any[]>([]);
  const [role, setRole] = useState('Frontend Engineer');
  const { getToken } = useAuth();


  useEffect(() => {
    const fetchSteps = async () => {
      const token = await getToken();
      if (!token) return;
      try {
        const res = await fetch(`http://localhost:8081/api/v1/repos/${repoId}/onboarding`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setSteps(data.map((s: any) => ({
          id: s.id,
          fileName: s.fileName || s.filePath,
          readTime: `${s.estimatedMinutes} min`,
          reason: s.reason,
          done: s.isCompleted
        })));
      } catch (e) {
        console.error(e);
      }
    };
    fetchSteps();
  }, [repoId]);

  const completedCount = steps.filter((s) => s.done).length;
  const progress = Math.round((completedCount / steps.length) * 100);

  const toggle = async (id: string) => {
    const step = steps.find(s => s.id === id);
    if (!step) return;
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
    const token = await getToken();
    try {
      if (step.done) {
        await fetch(`http://localhost:8081/api/v1/repos/${repoId}/onboarding/${id}/complete`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await fetch(`http://localhost:8081/api/v1/repos/${repoId}/onboarding/${id}/complete`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch (e) {
      console.error(e);
      setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, done: step.done } : s)));
    }
  };

  return (
    <div className="p-gutter md:p-unit-6">
      <div className="max-w-3xl">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-unit-6 gap-4">
          <div>
            <h2 className="text-[32px] font-semibold text-on-surface mb-2">Onboarding Checklist</h2>
            <div className="flex items-center gap-4">
              <div className="w-64 h-2 bg-[#1B1B26] rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#22D3EE] rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
              </div>
              <span className="font-mono text-[13px] text-on-surface-variant">{completedCount}/{steps.length}</span>
            </div>
          </div>
          <div>
            <label className="block text-on-surface-variant text-[11px] font-mono mb-1 uppercase tracking-wider">Simulate Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="bg-[#1B1B26] border border-[#24242F] text-on-surface rounded p-1.5 text-[13px] font-mono outline-none focus:border-[#8B5CF6]"
            >
              <option value="Frontend Engineer">Frontend Engineer</option>
              <option value="Backend Engineer">Backend Engineer</option>
              <option value="DevOps">DevOps</option>
              <option value="Security">Security Analyst</option>
            </select>
          </div>
        </div>

        <div className="space-y-3">
          {steps.map((step) => (
            <div
              key={step.id}
              className={`bg-[#14141C] border rounded-xl p-unit-4 flex items-start gap-4 transition-all duration-300 ${
                step.done ? 'border-[#24242F] opacity-60' : 'border-[#24242F] hover:border-[#3F3F4E]'
              }`}
            >
              <button onClick={() => toggle(step.id)} className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                step.done ? 'bg-emerald-500 border-emerald-500' : 'border-[#494454] hover:border-[#8B5CF6]'
              }`}>
                {step.done && <span className="material-symbols-outlined text-white" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>check</span>}
              </button>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[14px] text-on-surface font-medium">{step.fileName}</span>
                  <span className="font-mono text-[12px] text-on-surface-variant bg-[#1B1B26] px-2 py-0.5 rounded">{step.readTime}</span>
                </div>
                <p className="text-[13px] text-on-surface-variant">{step.reason}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Explorer Tab ─────────────────────────────────────────────────────────────
function ExplorerTab({ repoId }: { repoId: string }) {
  const [selectedFile, setSelectedFile] = useState('src/server.ts');
  const [files, setFiles] = useState<any[]>([]);
  const { getToken } = useAuth();


  useEffect(() => {
    const fetchFiles = async () => {
      const token = await getToken();
      if (!token) return;
      try {
        const res = await fetch(`http://localhost:8081/api/v1/repos/${repoId}/files`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        
        // Build basic tree
        const root = { name: 'root', isDir: true, children: [] as any[] };
        data.forEach((f: any) => {
          const parts = f.filePath.split('/');
          let curr = root;
          for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            let next = curr.children.find(c => c.name === part && c.isDir);
            if (!next) {
              next = { name: part, isDir: true, children: [] };
              curr.children.push(next);
            }
            curr = next;
          }
          curr.children.push({ name: parts[parts.length - 1], hotspot: f.isHotspot, id: f.id });
        });
        setFiles(root.children);
      } catch (e) {
        console.error(e);
      }
    };
    fetchFiles();
  }, [repoId]);

  const DEMO_CODE = `import express from 'express';
import { authMiddleware } from './middleware/auth';
import routes from './routes';
import { initDb } from './db/pool';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(authMiddleware);

// Routes
app.use('/api', routes);

// Bootstrap
async function main() {
  await initDb();
  app.listen(PORT, () => {
    console.log(\`Server running on port \${PORT}\`);
  });
}

main().catch(console.error);`;

  function FileTree({ items, depth = 0 }: { items: any[]; depth?: number }) {
    return (
      <>
        {items.map((f: any) => (
          <div key={f.name}>
            <div
              className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-[13px] transition-colors ${
                selectedFile === f.name ? 'bg-[#1B1B26] text-on-surface' : 'text-on-surface-variant hover:text-on-surface hover:bg-[#1B1B26]/50'
              }`}
              style={{ paddingLeft: `${8 + depth * 16}px` }}
              onClick={() => !f.isDir && setSelectedFile(f.name)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{f.isDir ? 'folder' : 'description'}</span>
              <span className="font-mono">{f.name}</span>
              {f.hotspot && <span className="w-2 h-2 rounded-full bg-rose-500 ml-auto flex-shrink-0"></span>}
            </div>
            {f.isDir && f.children && <FileTree items={f.children} depth={depth + 1} />}
          </div>
        ))}
      </>
    );
  }

  return (
    <div className="flex h-full overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>
      {/* File Tree */}
      <div className="w-56 flex-shrink-0 border-r border-[#24242F] bg-[#0A0A0F] overflow-y-auto p-2">
        <div className="font-mono text-[11px] text-on-surface-variant uppercase tracking-widest px-2 py-2 mb-1">Files</div>
        <FileTree items={files} />
      </div>

      {/* Code Viewer */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* AI Summary Banner */}
        <div className="bg-[#14141C] border-b border-[#24242F] p-unit-3 flex items-start gap-3">
          <span className="material-symbols-outlined text-[#22D3EE]" style={{ fontSize: '18px' }}>auto_awesome</span>
          <p className="font-mono text-[13px] text-on-surface-variant flex-1">
            <strong className="text-on-surface">server.ts</strong> — Application entry point. Sets up Express middleware, registers all API routes, and initializes the database connection pool before starting the HTTP server.
          </p>
        </div>

        {/* Code */}
        <div className="flex-1 overflow-auto bg-[#0A0A0F] p-4">
          <pre className="font-mono text-[13px] text-on-surface-variant leading-6">
            {DEMO_CODE.split('\n').map((line, i) => (
              <div key={i} className="flex hover:bg-[#1B1B26]/30 rounded">
                <span className="w-8 text-right text-[#494454] mr-4 flex-shrink-0 select-none">{i + 1}</span>
                <span>{line}</span>
              </div>
            ))}
          </pre>
        </div>
      </div>

      {/* Functions Panel */}
      <div className="w-56 flex-shrink-0 border-l border-[#24242F] bg-[#0A0A0F] overflow-y-auto p-2">
        <div className="font-mono text-[11px] text-on-surface-variant uppercase tracking-widest px-2 py-2 mb-1">Functions</div>
        {[
          { name: 'main()', line: 'L17', complexity: 'Low', color: 'text-emerald-400' },
          { name: 'initDb()', line: 'L18', complexity: 'Med', color: 'text-amber-400' },
        ].map((fn) => (
          <div key={fn.name} className="p-2 rounded hover:bg-[#1B1B26] cursor-pointer transition-colors">
            <div className="flex justify-between items-center">
              <span className="font-mono text-[12px] text-on-surface">{fn.name}</span>
              <span className={`font-mono text-[11px] ${fn.color}`}>{fn.complexity}</span>
            </div>
            <span className="font-mono text-[11px] text-on-surface-variant">{fn.line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab({ repo, repoId }: { repo: Repo | null; repoId: string }) {
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { getToken } = useAuth();

  const handleDeleteRepo = async () => {
    const token = await getToken();
    try {
      await fetch(`http://localhost:8081/api/v1/repos/${repoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      navigate('/dashboard');
    } catch {
      alert('Delete failed.');
    }
  };


  return (
    <div className="p-gutter md:p-unit-6 max-w-2xl">
      <h2 className="text-[32px] font-semibold text-on-surface mb-unit-6">Settings</h2>

      {/* Account Section */}
      <div className="bg-[#14141C] border border-[#24242F] rounded-xl p-unit-6 mb-unit-4">
        <h3 className="font-semibold text-[20px] text-on-surface mb-unit-4">Account</h3>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#8B5CF6] flex items-center justify-center text-white text-lg font-bold">U</div>
          <div>
            <p className="font-semibold text-on-surface">User</p>
            <p className="font-mono text-[13px] text-on-surface-variant">user@example.com</p>
          </div>
          <span className="ml-auto bg-[#8B5CF6]/10 text-primary border border-primary/20 font-mono text-[12px] px-3 py-1 rounded-full">Free Plan</span>
        </div>
      </div>

      {/* Connected Accounts */}
      <div className="bg-[#14141C] border border-[#24242F] rounded-xl p-unit-6 mb-unit-4">
        <h3 className="font-semibold text-[20px] text-on-surface mb-unit-4">Connected Accounts</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 fill-current text-on-surface" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            <div>
              <p className="text-on-surface text-[14px] font-semibold">GitHub</p>
              <p className="font-mono text-[12px] text-on-surface-variant">Not connected</p>
            </div>
          </div>
          <button className="bg-[#1B1B26] border border-[#24242F] hover:border-[#8B5CF6] text-on-surface px-4 py-1.5 rounded-lg font-mono text-[12px] transition-colors">Connect</button>
        </div>
      </div>

      {/* Appearance */}
      <div className="bg-[#14141C] border border-[#24242F] rounded-xl p-unit-6 mb-unit-4">
        <h3 className="font-semibold text-[20px] text-on-surface mb-unit-4">Appearance</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-on-surface text-[14px]">Theme</p>
            <p className="font-mono text-[13px] text-on-surface-variant">Dark mode enabled</p>
          </div>
          <div className="w-12 h-6 bg-[#8B5CF6] rounded-full relative cursor-pointer" style={{ boxShadow: '0 0 8px rgba(139,92,246,0.4)' }}>
            <div className="w-5 h-5 bg-white rounded-full absolute right-0.5 top-0.5 transition-all"></div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-[#14141C] border border-rose-900/30 rounded-xl p-unit-6">
        <h3 className="font-semibold text-[20px] text-rose-400 mb-unit-4">Danger Zone</h3>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-on-surface text-[14px]">Delete Repository</p>
            <p className="font-mono text-[12px] text-on-surface-variant">Permanently deletes all data, files, embeddings, and chat history for {repo?.githubName}.</p>
          </div>
          <button
            onClick={() => setConfirmDelete(true)}
            className="bg-rose-950/30 border border-rose-900/50 text-rose-400 hover:bg-rose-950/50 px-4 py-1.5 rounded-lg font-mono text-[12px] transition-colors"
          >
            Delete Repo
          </button>
        </div>
        {confirmDelete && (
          <div className="border-t border-rose-900/30 pt-4">
            <p className="text-rose-300 text-[13px] mb-3">Are you absolutely sure? This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={handleDeleteRepo} className="bg-rose-600 text-white px-4 py-2 rounded-lg text-[13px] font-semibold hover:bg-rose-500">Yes, delete it</button>
              <button onClick={() => setConfirmDelete(false)} className="bg-[#1B1B26] border border-[#24242F] text-on-surface px-4 py-2 rounded-lg text-[13px] hover:border-[#3F3F4E]">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab label helper ─────────────────────────────────────────────────────────
const TAB_LABELS: Record<string, string> = {
  overview: 'Overview',
  architecture: 'Architecture Map',
  chat: 'Repo Chat',
  onboarding: 'Onboarding',
  explorer: 'Explorer',
  diff: 'Diff Explainer',
  settings: 'Settings',
};

// ─── Workspace Shell ──────────────────────────────────────────────────────────
export default function WorkspacePage() {
  const { repoId } = useParams<{ repoId: string }>();
  const [repo, setRepo] = useState<Repo | null>(null);
  const navigate = useNavigate();
  const { getToken } = useAuth();

  // Derive active tab from URL
  const path = window.location.pathname.split('/').pop() ?? 'overview';
  const tabLabel = TAB_LABELS[path] || 'Overview';

  useEffect(() => {
    if (!repoId) return;
    (async () => {
      const token = await getToken();
      if (!token) { navigate('/auth'); return; }
      fetch(`http://localhost:8081/api/v1/repos/${repoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => { if (r.ok) return r.json(); }).then((data) => { if (data) setRepo(data); }).catch(() => {});
    })();
  }, [repoId]);


  if (!repoId) return null;

  return (
    <div className="bg-[#0A0A0F] text-[#e4e1e9] flex h-screen overflow-hidden" style={{ fontFamily: 'Inter, sans-serif' }}>
      <WorkspaceSidebar repo={repo} repoId={repoId} />

      {/* Main area */}
      <div className="flex-1 flex flex-col md:ml-64 h-full min-w-0">
        <TopBar repo={repo} tabLabel={tabLabel} />
        <div className="flex-1 overflow-auto">
          <Routes>
            <Route path="overview" element={<OverviewTab repo={repo} />} />
            <Route path="architecture" element={<ArchitectureTab repoId={repoId} />} />
            <Route path="chat" element={<ChatTab repoId={repoId} />} />
            <Route path="onboarding" element={<OnboardingTab repoId={repoId} />} />
            <Route path="explorer" element={<ExplorerTab repoId={repoId} />} />
            <Route path="diff" element={<DiffExplainerTab repoId={repoId} />} />
            <Route path="settings" element={<SettingsTab repo={repo} repoId={repoId} />} />
            <Route path="*" element={<OverviewTab repo={repo} />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

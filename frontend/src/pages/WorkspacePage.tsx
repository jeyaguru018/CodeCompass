import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { Link, useParams, useNavigate, Routes, Route, NavLink } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useApiClient } from '../apiClient';
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

interface OverviewData {
  aiSummary?: string;
  fileCount: number;
  functionCount: number;
  hotspotCount: number;
  documentationCoverage: number;       // 0-100 integer percent
  languageBreakdown: Record<string, number>; // { TypeScript: 42, Python: 12, ... }
  onboardingTotal: number;
  onboardingCompleted: number;
  starCount?: number;
  forkCount?: number;
  primaryLanguage?: string;
  description?: string;
}

interface FileContent {
  id: string;
  filePath: string;
  language?: string;
  aiSummary?: string;
  complexityScore?: number;
  hotspotScore?: number;
  rawContent?: string;
  functions: Array<{
    id: string;
    functionName: string;
    className?: string;
    startLine?: number;
    endLine?: number;
    complexityScore?: number;
    aiSummary?: string;
  }>;
}

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

// Language colour map — extended palette
const LANG_COLOURS: Record<string, string> = {
  TypeScript: '#3178C6', JavaScript: '#F7DF1E', Python: '#3572A5',
  Java: '#B07219',       Kotlin: '#A97BFF',     Go: '#00ADD8',
  Rust: '#DEA584',       C: '#555555',           'C++': '#F34B7D',
  'C#': '#178600',       Ruby: '#701516',        PHP: '#4F5D95',
  Swift: '#FA7343',      Dart: '#00B4AB',        HTML: '#E34C26',
  CSS: '#563D7C',        Shell: '#89E051',       Scala: '#C22D40',
};
function langColour(lang: string) { return LANG_COLOURS[lang] ?? '#8B5CF6'; }

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ repo }: { repo: Repo | null }) {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const apiFetch = useApiClient();

  useEffect(() => {
    if (!repo?.id) return;
    let cancelled = false;
    apiFetch(`/api/v1/repos/${repo.id}/overview`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && !cancelled) setOverview(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [repo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived language chart values
  const langEntries = overview
    ? Object.entries(overview.languageBreakdown)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    : [];
  const totalFiles  = langEntries.reduce((s, [, v]) => s + v, 0);

  // SVG donut: circumference = 2π×40 ≈ 251.2
  const CIRC = 251.2;
  let angleOffset = 0;
  const donutSlices = langEntries.map(([lang, count]) => {
    const pct   = totalFiles > 0 ? count / totalFiles : 0;
    const dash  = pct * CIRC;
    const gap   = CIRC - dash;
    const slice = { lang, dash, gap, offset: angleOffset, colour: langColour(lang), pct };
    angleOffset += pct * 360;
    return slice;
  });

  // Onboarding ring
  const onbTotal     = overview?.onboardingTotal    ?? 0;
  const onbCompleted = overview?.onboardingCompleted ?? 0;
  const onbPct       = onbTotal > 0 ? onbCompleted / onbTotal : 0;
  const onbDash      = onbPct * 282.7; // 2π×45
  const onbOffset    = 282.7 - onbDash;

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
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-[#14141C] border border-[#24242F] rounded-xl p-unit-4 h-28 animate-pulse" />
          ))
        ) : ([
          { icon: 'folder',             label: 'Files',        value: overview?.fileCount        ?? repo?.fileCount        ?? '—', warn: false },
          { icon: 'data_object',        label: 'Functions',    value: overview?.functionCount    ?? repo?.functionCount    ?? '—', warn: false },
          { icon: 'local_fire_department', label: 'Hotspots', value: overview?.hotspotCount     ?? repo?.hotspotCount     ?? '—', warn: (overview?.hotspotCount ?? 0) > 0 },
          { icon: 'library_books',      label: 'Doc Coverage', value: overview ? `${overview.documentationCoverage}%` : '—', warn: false },
        ] as const).map((stat) => (
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
            <div className="text-[48px] leading-none font-bold tracking-tight font-mono text-on-surface">
              {typeof stat.value === 'number'
                ? <CountUp end={stat.value} duration={2} separator="," />
                : stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Language Breakdown + Onboarding Ring */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-unit-4">
        {/* Language card */}
        <div className="bg-[#14141C] border border-[#24242F] rounded-xl p-unit-6 lg:col-span-2">
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#24242F]">
            <h3 className="text-[20px] font-semibold text-on-surface" style={{ fontFamily: 'Inter, sans-serif' }}>Language Breakdown</h3>
            {overview?.primaryLanguage && (
              <span className="font-mono text-[12px] text-on-surface-variant bg-[#1B1B26] px-2 py-1 rounded border border-[#24242F]">
                Primary: {overview.primaryLanguage}
              </span>
            )}
          </div>
          {loading ? (
            <div className="h-32 bg-[#1B1B26] rounded animate-pulse" />
          ) : langEntries.length === 0 ? (
            <p className="font-mono text-[13px] text-on-surface-variant">No language data available yet.</p>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-8">
              {/* SVG Donut */}
              <svg className="w-48 h-48 -rotate-90 flex-shrink-0" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#1B1B26" strokeWidth="16" />
                {donutSlices.map(s => (
                  <circle
                    key={s.lang}
                    cx="50" cy="50" r="40"
                    fill="transparent"
                    stroke={s.colour}
                    strokeWidth="16"
                    strokeDasharray={`${s.dash} ${s.gap}`}
                    strokeDashoffset={0}
                    style={{
                      transform: `rotate(${s.offset}deg)`,
                      transformOrigin: '50px 50px',
                      transition: 'stroke-dasharray 0.6s ease',
                    }}
                  />
                ))}
              </svg>
              {/* Legend */}
              <div className="flex-1 w-full space-y-3">
                {donutSlices.map(s => (
                  <div key={s.lang} className="flex items-center justify-between p-2 rounded hover:bg-[#1B1B26] transition-colors border border-transparent hover:border-[#3F3F4E]">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.colour }} />
                      <span className="font-mono text-[14px] text-on-surface">{s.lang}</span>
                    </div>
                    <span className="font-mono text-[14px] text-on-surface-variant">
                      {Math.round(s.pct * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Onboarding ring card */}
        <div className="bg-[#14141C] border border-[#24242F] rounded-xl p-unit-6 flex flex-col">
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#24242F]">
            <h3 className="text-[20px] font-semibold text-on-surface" style={{ fontFamily: 'Inter, sans-serif' }}>Onboarding</h3>
            <span className="font-mono text-[12px] text-[#22D3EE] bg-[#1B1B26] px-2 py-1 rounded border border-[#24242F]">
              {onbTotal === 0 ? 'Not Started' : onbCompleted === onbTotal ? 'Complete!' : 'In Progress'}
            </span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center py-4">
            <div className="relative w-32 h-32 mb-6">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="transparent" stroke="#1B1B26" strokeWidth="8" />
                <circle cx="50" cy="50" r="45" fill="transparent" stroke="#8B5CF6"
                  strokeDasharray="282.7"
                  strokeDashoffset={onbOffset}
                  strokeLinecap="round" strokeWidth="8"
                  style={{ transition: 'stroke-dashoffset 1s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[28px] font-bold text-on-surface">
                  {onbCompleted}
                  <span className="text-[20px] text-on-surface-variant">/{onbTotal}</span>
                </span>
              </div>
            </div>
            <p className="font-mono text-on-surface-variant text-center mb-6 text-[13px]">
              {onbTotal === 0
                ? 'Onboarding path not yet generated.'
                : onbCompleted === onbTotal
                ? 'All steps completed! 🎉'
                : `${onbTotal - onbCompleted} step${onbTotal - onbCompleted !== 1 ? 's' : ''} remaining.`}
            </p>
            <Link
              to={`/workspace/${repo?.id ?? ''}/onboarding`}
              className="w-full py-2 bg-[#1B1B26] text-[#e4e4e7] border border-[#24242F] rounded-lg hover:border-[#3F3F4E] transition-colors flex items-center justify-center gap-2 text-[14px]"
            >
              {onbCompleted === onbTotal && onbTotal > 0 ? 'Review Checklist' : 'Continue Onboarding'}
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Architecture Map Tab ────────────────────────────
function ArchitectureTab({ repoId }: { repoId: string }) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [graphData,    setGraphData]    = useState<{ nodes: any[]; edges: any[] } | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [showADR,      setShowADR]      = useState(false);
  const [heatmap,      setHeatmap]      = useState(true);   // hotspot colouring on by default
  const [zoom,         setZoom]         = useState(1);

  const svgRef      = useRef<SVGSVGElement>(null);
  const simRef      = useRef<d3.Simulation<any, any> | null>(null);
  const apiFetch    = useApiClient();
  const navigate    = useNavigate();

  // ── Fetch graph data ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    apiFetch(`/api/v1/repos/${repoId}/graph`)
      .then(r => {
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        return r.json();
      })
      .then(data => { if (!cancelled) setGraphData(data); })
      .catch((e: Error) => { if (!cancelled) setError(e.message || 'Failed to load graph data.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [repoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── D3 force simulation ────────────────────────────────────────────────────
  useEffect(() => {
    if (!graphData || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // clear previous render

    const W = svgRef.current.clientWidth  || 900;
    const H = svgRef.current.clientHeight || 600;

    // Clone node data so D3 can mutate positions in place
    const nodes: any[] = graphData.nodes.map(n => ({ ...n }));
    const edgeMap = new Map(nodes.map(n => [n.id, n]));

    // Only include edges where both endpoints exist in node list
    const links: any[] = graphData.edges
      .filter(e => edgeMap.has(e.source) && edgeMap.has(e.target) && e.source !== e.target)
      .map(e => ({ ...e }));

    // Stop any previous simulation
    if (simRef.current) simRef.current.stop();

    const sim = d3.forceSimulation(nodes)
      .force('link',   d3.forceLink(links).id((d: any) => d.id).distance(120).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-280))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collide', d3.forceCollide(38))
      .alphaDecay(0.025);
    simRef.current = sim;

    // ── Zoom & pan ────────────────────────────────────────────────────────
    const zoomBehaviour = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString());
        setZoom(Math.round(event.transform.k * 100));
      });
    svg.call(zoomBehaviour);

    const g = svg.append('g'); // main group — receives zoom transform

    // ── Edge arrows definition ────────────────────────────────────────────
    svg.append('defs').append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 28)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', '#3F3F4E');

    // ── Draw edges ────────────────────────────────────────────────────────
    const edgeSel = g.append('g').attr('class', 'edges')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
        .attr('stroke', '#3F3F4E')
        .attr('stroke-width', 1.2)
        .attr('stroke-opacity', 0.6)
        .attr('marker-end', 'url(#arrow)');

    // ── Draw nodes ────────────────────────────────────────────────────────
    const NODE_R = 22;

    const nodeSel = g.append('g').attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
        .attr('class', 'node')
        .style('cursor', 'pointer')
        .call(
          d3.drag<SVGGElement, any>()
            .on('start', (event, d) => {
              if (!event.active) sim.alphaTarget(0.3).restart();
              d.fx = d.x; d.fy = d.y;
            })
            .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
            .on('end', (event, d) => {
              if (!event.active) sim.alphaTarget(0);
              d.fx = null; d.fy = null;
            })
        )
        .on('click', (_event, d) => {
          setSelectedNode(d);
        });

    // Outer glow circle for hotspots / entry points
    nodeSel.append('circle')
      .attr('r', NODE_R + 6)
      .attr('fill', 'none')
      .attr('stroke', (d: any) => {
        if (d.isHotspot)    return 'rgba(244,63,94,0.45)';
        if (d.isEntryPoint) return 'rgba(139,92,246,0.45)';
        return 'transparent';
      })
      .attr('stroke-width', 6);

    // Main circle
    nodeSel.append('circle')
      .attr('r', NODE_R)
      .attr('fill', (d: any) => {
        if (d.isHotspot)    return '#1f0d10';
        if (d.isEntryPoint) return '#150d26';
        return '#14141C';
      })
      .attr('stroke', (d: any) => {
        if (d.isHotspot)    return '#f43f5e';
        if (d.isEntryPoint) return '#8B5CF6';
        return '#3F3F4E';
      })
      .attr('stroke-width', 1.8);

    // File-name label (abbreviated)
    nodeSel.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', NODE_R + 14)
      .attr('font-size', '10')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('fill', '#918f9d')
      .text((d: any) => {
        const name = d.fileName || (d.filePath || '').split('/').pop() || '';
        return name.length > 14 ? name.slice(0, 12) + '…' : name;
      });

    // Module-type icon text inside circle
    nodeSel.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', '14')
      .attr('font-family', 'Material Symbols Outlined')
      .attr('fill', (d: any) => {
        if (d.isHotspot)    return '#f43f5e';
        if (d.isEntryPoint) return '#8B5CF6';
        return '#52525B';
      })
      .text((d: any) => {
        // Material Symbols codepoints (text variant)
        const t = (d.moduleType || '').toLowerCase();
        if (t.includes('controller') || t.includes('route')) return 'api';
        if (t.includes('service'))   return 'settings';
        if (t.includes('model'))     return 'database';
        if (t.includes('util'))      return 'build';
        if (t.includes('test'))      return 'science';
        if (t.includes('config'))    return 'tune';
        return 'description';
      });

    // ── Tick ──────────────────────────────────────────────────────────────
    sim.on('tick', () => {
      edgeSel
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      nodeSel.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => { sim.stop(); };
  }, [graphData, heatmap]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ────────────────────────────────────────────────────────────────
  const complexityColour = (score?: number) => {
    if (!score) return 'text-on-surface-variant';
    if (score > 15) return 'text-rose-400';
    if (score > 7)  return 'text-amber-400';
    return 'text-emerald-400';
  };
  const complexityLabel = (score?: number) => {
    if (!score) return '—';
    if (score > 15) return `${score} / High`;
    if (score > 7)  return `${score} / Med`;
    return `${score} / Low`;
  };

  const statsBar = (value: number, max: number, colour: string) => {
    const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
    return (
      <div className="w-full bg-[#14141C] h-2 rounded-full overflow-hidden mt-2">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${pct}%`, transition: 'width 0.5s ease' }} />
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 relative overflow-hidden grid-bg h-full" style={{ height: 'calc(100vh - 56px)' }}>

      {/* ── Floating Toolbar ── */}
      <div className="absolute top-unit-6 left-unit-6 z-20 flex flex-col gap-unit-3">
        {/* Heatmap toggle */}
        <div className="bg-[#131318] rounded-lg border border-[#24242F] p-unit-2 flex items-center justify-between gap-unit-4 shadow-lg">
          <div className="flex items-center gap-unit-2">
            <span className="material-symbols-outlined text-rose-500" style={{ fontSize: '18px' }}>local_fire_department</span>
            <span className="font-mono text-[12px] text-on-surface">Heatmap</span>
          </div>
          <button
            onClick={() => setHeatmap(h => !h)}
            className={`w-8 h-4 rounded-full relative transition-colors border ${heatmap ? 'bg-rose-500/20 border-rose-500/50' : 'bg-[#1B1B26] border-[#3F3F4E]'}`}
          >
            <div className={`w-4 h-4 rounded-full absolute top-1/2 -translate-y-1/2 transition-all shadow ${heatmap ? 'right-0 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]' : 'left-0 bg-[#52525B]'}`} />
          </button>
        </div>

        {/* Zoom controls */}
        <div className="bg-[#131318] rounded-lg border border-[#24242F] flex flex-col shadow-lg overflow-hidden">
          <button
            onClick={() => { if (svgRef.current) d3.select(svgRef.current).transition().call((d3.zoom() as any).scaleBy, 1.3); }}
            className="p-unit-2 hover:bg-[#2a292f] text-on-surface-variant hover:text-on-surface transition-colors border-b border-[#24242F]"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>add</span>
          </button>
          <button
            onClick={() => { if (svgRef.current) d3.select(svgRef.current).transition().call((d3.zoom() as any).scaleBy, 0.77); }}
            className="p-unit-2 hover:bg-[#2a292f] text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>remove</span>
          </button>
        </div>

        {/* Zoom level badge */}
        <div className="bg-[#131318] rounded-lg border border-[#24242F] px-2 py-1 shadow-lg text-center">
          <span className="font-mono text-[11px] text-on-surface-variant">{zoom}%</span>
        </div>
      </div>

      {/* ── Graph Canvas ── */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-[#0A0A0F]/80">
          <span className="material-symbols-outlined animate-spin text-primary mb-3" style={{ fontSize: '40px' }}>progress_activity</span>
          <p className="font-mono text-[14px] text-on-surface-variant">Building dependency graph…</p>
        </div>
      )}
      {error && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-3">
          <span className="material-symbols-outlined text-rose-400" style={{ fontSize: '40px' }}>error</span>
          <p className="font-mono text-[14px] text-on-surface-variant">{error}</p>
        </div>
      )}
      {!loading && !error && graphData?.nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-3">
          <span className="material-symbols-outlined text-outline" style={{ fontSize: '48px' }}>account_tree</span>
          <p className="font-mono text-[14px] text-on-surface-variant">No graph data available yet.</p>
          <p className="font-mono text-[12px] text-outline">The graph is built during repository analysis.</p>
        </div>
      )}

      <svg
        ref={svgRef}
        className="w-full h-full"
        style={{ background: 'transparent', cursor: 'grab' }}
      />

      {/* Legend */}
      {!loading && !error && (
        <div className="absolute bottom-4 left-4 z-20 bg-[#131318]/90 border border-[#24242F] rounded-lg p-3 flex flex-col gap-2">
          <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Legend</span>
          {[
            { colour: '#f43f5e', label: 'Hotspot (high churn/complexity)' },
            { colour: '#8B5CF6', label: 'Entry point' },
            { colour: '#3F3F4E', label: 'Regular file' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border-2 flex-shrink-0" style={{ borderColor: l.colour, background: 'transparent' }} />
              <span className="font-mono text-[11px] text-on-surface-variant">{l.label}</span>
            </div>
          ))}
          <div className="border-t border-[#24242F] mt-1 pt-2 font-mono text-[10px] text-on-surface-variant">
            {graphData ? `${graphData.nodes.length} nodes · ${graphData.edges.length} edges` : ''}
          </div>
        </div>
      )}

      {/* ── Right Drawer — shown when a node is selected ── */}
      {selectedNode && (
        <aside className="absolute right-0 top-0 bottom-0 w-[380px] bg-[#14141C] border-l border-[#24242F] flex flex-col z-30 shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
          {/* Header */}
          <div className="p-unit-4 border-b border-[#24242F] flex justify-between items-start">
            <div>
              <div className="flex items-center gap-unit-2 mb-unit-2 flex-wrap">
                {selectedNode.isHotspot && (
                  <span className="px-unit-2 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded font-mono text-[12px] flex items-center gap-1">
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>local_fire_department</span>
                    Hotspot
                  </span>
                )}
                {selectedNode.isEntryPoint && (
                  <span className="px-unit-2 py-0.5 bg-violet-500/10 text-violet-400 border border-violet-500/30 rounded font-mono text-[12px] flex items-center gap-1">
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>play_circle</span>
                    Entry Point
                  </span>
                )}
                {selectedNode.moduleType && (
                  <span className="px-unit-2 py-0.5 bg-[#1B1B26] text-[#A1A1AA] border border-[#24242F] rounded font-mono text-[12px]">
                    {selectedNode.moduleType}
                  </span>
                )}
              </div>
              <h2 className="font-mono text-[13px] text-on-surface break-all">
                {selectedNode.filePath || selectedNode.fileName || 'Unknown file'}
              </h2>
              {selectedNode.language && (
                <span className="font-mono text-[11px] text-primary">{selectedNode.language}</span>
              )}
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-on-surface-variant hover:text-on-surface p-unit-1 rounded hover:bg-[#1B1B26] transition-colors flex-shrink-0"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>close</span>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-unit-4 flex flex-col gap-unit-6">

            {/* Health Metrics */}
            <div>
              <h3 className="font-mono text-[11px] text-on-surface-variant uppercase tracking-widest mb-3">Health Metrics</h3>
              <div className="space-y-3">
                <div className="bg-[#1B1B26] p-unit-3 rounded-lg border border-[#24242F]">
                  <div className="flex justify-between items-end mb-1">
                    <span className="font-mono text-[12px] text-on-surface">Cyclomatic Complexity</span>
                    <span className={`font-mono text-[14px] font-bold ${complexityColour(selectedNode.complexityScore)}`}>
                      {complexityLabel(selectedNode.complexityScore)}
                    </span>
                  </div>
                  {statsBar(selectedNode.complexityScore ?? 0, 30, 'bg-gradient-to-r from-amber-500 to-rose-500')}
                </div>
                <div className="bg-[#1B1B26] p-unit-3 rounded-lg border border-[#24242F]">
                  <div className="flex justify-between items-end mb-1">
                    <span className="font-mono text-[12px] text-on-surface">Hotspot Score</span>
                    <span className={`font-mono text-[14px] font-bold ${selectedNode.hotspotScore > 0.6 ? 'text-rose-400' : 'text-amber-400'}`}>
                      {selectedNode.hotspotScore != null ? (selectedNode.hotspotScore * 100).toFixed(0) + ' / 100' : '—'}
                    </span>
                  </div>
                  {statsBar((selectedNode.hotspotScore ?? 0) * 100, 100, 'bg-gradient-to-r from-violet-500 to-rose-500')}
                </div>
              </div>
            </div>

            {/* AI Summary */}
            {selectedNode.aiSummary && (
              <div>
                <h3 className="font-mono text-[11px] text-on-surface-variant uppercase tracking-widest mb-3">AI Summary</h3>
                <p className="font-mono text-[13px] text-on-surface-variant leading-relaxed">
                  {selectedNode.aiSummary}
                </p>
              </div>
            )}

            {/* Dependencies from this node */}
            {graphData && (() => {
              const outgoing = graphData.edges.filter(e => e.source === selectedNode.id || (e.source && e.source.id === selectedNode.id));
              const incoming = graphData.edges.filter(e => e.target === selectedNode.id || (e.target && e.target.id === selectedNode.id));
              if (outgoing.length === 0 && incoming.length === 0) return null;
              return (
                <div>
                  <h3 className="font-mono text-[11px] text-on-surface-variant uppercase tracking-widest mb-3">
                    Dependencies
                  </h3>
                  {outgoing.length > 0 && (
                    <div className="mb-2">
                      <p className="font-mono text-[11px] text-on-surface-variant mb-1">Imports ({outgoing.length})</p>
                      <div className="space-y-1 max-h-28 overflow-y-auto">
                        {outgoing.slice(0, 10).map((e, i) => {
                          const target = graphData.nodes.find(n => n.id === (e.target?.id ?? e.target));
                          return (
                            <div key={i} className="font-mono text-[11px] text-on-surface-variant bg-[#1B1B26] px-2 py-1 rounded truncate">
                              <span className="text-primary mr-1">→</span>
                              {target?.fileName || (e.importStatement ?? String(e.target))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {incoming.length > 0 && (
                    <div>
                      <p className="font-mono text-[11px] text-on-surface-variant mb-1">Imported by ({incoming.length})</p>
                      <div className="space-y-1 max-h-28 overflow-y-auto">
                        {incoming.slice(0, 10).map((e, i) => {
                          const src = graphData.nodes.find(n => n.id === (e.source?.id ?? e.source));
                          return (
                            <div key={i} className="font-mono text-[11px] text-on-surface-variant bg-[#1B1B26] px-2 py-1 rounded truncate">
                              <span className="text-[#22D3EE] mr-1">←</span>
                              {src?.fileName || String(e.source)}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Action buttons */}
            <div className="flex flex-col gap-2 mt-auto pt-4 border-t border-[#24242F]">
              <button
                onClick={() => setShowADR(true)}
                className="w-full py-2 bg-[#8B5CF6] text-white rounded-lg font-mono text-[13px] font-semibold hover:opacity-90 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>architecture</span>
                Generate ADR
              </button>
              <button
                onClick={() => navigate(`/workspace/${repoId}/explorer`)}
                className="w-full py-2 bg-[#1B1B26] border border-[#24242F] text-on-surface rounded-lg font-mono text-[13px] hover:border-[#3F3F4E] flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>folder_open</span>
                Open in Explorer
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Hint text when no node selected */}
      {!loading && !error && graphData && graphData.nodes.length > 0 && !selectedNode && (
        <div className="absolute bottom-4 right-4 z-20 bg-[#131318]/80 border border-[#24242F] rounded-lg px-3 py-2">
          <p className="font-mono text-[11px] text-on-surface-variant">Click any node to inspect it</p>
        </div>
      )}

      {showADR && selectedNode && (
        <ADRModal
          repoId={repoId}
          moduleName={selectedNode.filePath || selectedNode.fileName || 'unknown'}
          onClose={() => setShowADR(false)}
        />
      )}
    </div>
  );
})}
    </div>
  );
}

// ─── Repo Chat Tab ────────────────────────────────────────────────────────────
/**
 * ChatTab — SSE-streaming chat against a single repository.
 *
 * Session lifecycle:
 *   1. On mount: GET /api/v1/repos/{repoId}/chat/sessions
 *      - If sessions exist: load the most-recent session's messages via
 *        GET /api/v1/repos/{repoId}/chat/sessions/{sessionId}
 *      - If no sessions: POST /api/v1/repos/{repoId}/chat/sessions to create one.
 *   2. On send: POST /api/v1/repos/{repoId}/chat/sessions/{sessionId}/messages
 *      Body: { message: string }
 *      The response is a Server-Sent Events stream; each line is:
 *        data: {"type":"token","content":"..."}   — partial AI token
 *        data: {"type":"citations","files":[...]} — file references
 *        data: {"type":"done"}                    — end of stream
 *   3. On share: POST /api/v1/chat/sessions/{sessionId}/share
 *      Response: { shared_token: string } or { shareToken: string }
 *      The public URL is /chat/shared/{shared_token}
 */
function ChatTab({ repoId }: { repoId: string }) {
  const [messages,  setMessages]  = useState<ChatMessage[]>([]);
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  const [initError, setInitError] = useState('');
  const bottomRef   = useRef<HTMLDivElement>(null);
  const apiFetch    = useApiClient();

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
  }, []);

  // ── Session bootstrap ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        // 1. Fetch existing sessions
        const sessRes = await apiFetch(`/api/v1/repos/${repoId}/chat/sessions`);
        if (!sessRes.ok) {
          // Non-fatal: we'll create a new session below
          const sessions: any[] = [];
          if (!cancelled) await createOrUseSession(sessions, cancelled);
          return;
        }
        const sessions: any[] = await sessRes.json();
        if (!cancelled) await createOrUseSession(sessions, cancelled);
      } catch (err) {
        if (!cancelled) setInitError('Could not load chat history. Start typing to begin a new chat.');
      }
    };

    const createOrUseSession = async (sessions: any[], isCancelled: boolean) => {
      if (sessions && sessions.length > 0) {
        // Use the most-recent session (backend returns newest first)
        const sid = sessions[0].id;
        if (!isCancelled) setSessionId(sid);

        // 2a. Load existing messages
        const msgRes = await apiFetch(`/api/v1/repos/${repoId}/chat/sessions/${sid}`);
        if (msgRes.ok) {
          const data = await msgRes.json();
          // Backend returns { messages: [{id, role, content}] } or just the array
          const msgs: ChatMessage[] = Array.isArray(data) ? data : (data.messages ?? []);
          if (!isCancelled) setMessages(msgs.map(m => ({ id: m.id, role: m.role, content: m.content })));
        }
      } else {
        // 2b. No sessions — create one
        const createRes = await apiFetch(`/api/v1/repos/${repoId}/chat/sessions`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        if (createRes.ok) {
          const created = await createRes.json();
          if (!isCancelled) setSessionId(created.id);
        }
        // If create fails, sessionId stays null — send() will show a clear error
      }
    };

    bootstrap();
    return () => { cancelled = true; };
  }, [repoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send message with SSE streaming ───────────────────────────────────────
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    if (!sessionId) {
      setMessages(prev => [...prev,
        { id: 'err-no-session', role: 'assistant', content: '⚠️ Chat session is still initializing. Please wait a moment and try again.' }
      ]);
      return;
    }

    const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    scrollToBottom();

    // Optimistically add an empty assistant bubble that we'll fill via SSE tokens
    const assistantId = `ai-${Date.now()}`;
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    try {
      const res = await apiFetch(
        `/api/v1/repos/${repoId}/chat/sessions/${sessionId}/messages`,
        {
          method: 'POST',
          // Accept: text/event-stream so the backend knows we can handle SSE
          headers: { Accept: 'text/event-stream' },
          // Backend reads body.get("content") — NOT "message"
          body: JSON.stringify({ content: text }),
        }
      );

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || `Server returned ${res.status}`);
      }

      const contentType = res.headers.get('content-type') ?? '';

      if (contentType.includes('text/event-stream') && res.body) {
        // ── SSE streaming path ──────────────────────────────────────────────
        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer    = '';

        const flush = (line: string) => {
          // SSE lines begin with "data: "
          if (!line.startsWith('data:')) return;
          const raw = line.slice(5).trim();
          if (raw === '[DONE]' || raw === '') return;
          try {
            const evt = JSON.parse(raw);
            if (evt.type === 'token' && evt.content) {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: m.content + evt.content }
                    : m
                )
              );
              scrollToBottom();
            }
            // evt.type === 'citations' — future: attach cited files to the message
            // evt.type === 'done'     — stream finished
          } catch {
            // Non-JSON line (e.g. a keep-alive comment) — ignore
          }
        };

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // SSE events are separated by double newline
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';
          for (const part of parts) {
            for (const line of part.split('\n')) flush(line);
          }
        }
        // Flush any remaining buffer
        for (const line of buffer.split('\n')) flush(line);

      } else {
        // ── JSON fallback path (non-streaming backend) ──────────────────────
        const data = await res.json();
        const answer = data.answer ?? data.message ?? data.content ?? 'No response from AI.';
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: answer } : m)
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: `⚠️ ${msg}` }
            : m
        )
      );
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  // ── Share session ──────────────────────────────────────────────────────────
  const handleShare = async () => {
    if (!sessionId) {
      alert('No active session to share yet.');
      return;
    }
    setShareStatus('copying');
    try {
      // Correct endpoint: POST /api/v1/chat/sessions/{sessionId}/share
      const res = await apiFetch(`/api/v1/chat/sessions/${sessionId}/share`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      // Backend may use shared_token or shareToken
      const token = data.shared_token ?? data.shareToken ?? '';
      if (!token) throw new Error('Backend returned an empty share token.');
      const url = `${window.location.origin}/chat/shared/${token}`;
      await navigator.clipboard.writeText(url);
      setShareStatus('copied');
      setTimeout(() => setShareStatus('idle'), 3000);
    } catch (err: unknown) {
      setShareStatus('error');
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to generate share link: ${msg}`);
      setTimeout(() => setShareStatus('idle'), 3000);
    }
  };

  const SUGGESTED = [
    'Explain the authentication flow',
    'What are the hotspots in this codebase?',
    'How is the database layer structured?',
    'Walk me through the main entry point',
  ];

  const shareLabel: Record<typeof shareStatus, string> = {
    idle:    'Share',
    copying: 'Copying...',
    copied:  'Copied!',
    error:   'Failed',
  };

  return (
    <div className="flex h-full overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>
      <div className="flex-1 flex flex-col relative">

        {/* Init error banner */}
        {initError && (
          <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-400 px-6 py-2 font-mono text-[12px] flex items-center gap-2">
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>warning</span>
            {initError}
          </div>
        )}

        {/* Share Button */}
        {messages.length > 0 && (
          <button
            onClick={handleShare}
            disabled={shareStatus === 'copying'}
            className={`absolute top-4 right-6 z-10 border p-2 rounded-lg flex items-center gap-2 text-[12px] font-mono shadow-md transition-all ${
              shareStatus === 'copied'
                ? 'bg-emerald-950/40 border-emerald-700 text-emerald-400'
                : shareStatus === 'error'
                ? 'bg-rose-950/40 border-rose-700 text-rose-400'
                : 'bg-[#1B1B26] border-[#24242F] hover:bg-[#3F3F4E] hover:border-[#8B5CF6] text-on-surface-variant hover:text-primary'
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              {shareStatus === 'copied' ? 'check_circle' : 'share'}
            </span>
            {shareLabel[shareStatus]}
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
                {/* Streaming cursor on the last assistant message while loading */}
                {loading && msg.role === 'assistant' && msg.id === messages.filter(m => m.role === 'assistant').at(-1)?.id ? (
                  <p className="font-mono text-[14px] leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                    <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 align-middle" style={{ animation: 'cursor-blink 1s steps(1) infinite' }} />
                  </p>
                ) : (
                  <p className="font-mono text-[14px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions */}
        {messages.length < 2 && (
          <div className="px-unit-6 pb-2 flex gap-2 flex-wrap">
            {SUGGESTED.map((q) => (
              <button
                key={q}
                onClick={() => setInput(q)}
                className="bg-[#1B1B26] border border-[#24242F] hover:border-[#8B5CF6] text-on-surface-variant hover:text-primary font-mono text-[12px] px-3 py-1.5 rounded-full transition-all"
              >
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
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-[#8B5CF6] text-white p-2.5 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            style={{ boxShadow: '0 0 10px rgba(139,92,246,0.3)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>send</span>
          </button>
        </form>

        <style>{`
          @keyframes cursor-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        `}</style>
      </div>
    </div>
  );
}

// ─── Onboarding Tab ───────────────────────────────────────────────────────────
function OnboardingTab({ repoId }: { repoId: string }) {
  const [steps, setSteps]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [role,    setRole]   = useState('Frontend Engineer');
  const apiFetch = useApiClient();

  useEffect(() => {
    let cancelled = false;
    const fetchSteps = async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/v1/repos/${repoId}/onboarding`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setSteps(data.map((s: any) => ({
            id:       s.id,
            fileName: s.fileName ?? s.filePath ?? 'Unknown',
            readTime: `${s.estimatedMinutes ?? '?'} min`,
            reason:   s.reason ?? '',
            done:     s.isCompleted ?? false,
          })));
        }
      } catch (e) {
        console.error('Onboarding fetch error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchSteps();
    return () => { cancelled = true; };
  }, [repoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const completedCount = steps.filter((s) => s.done).length;
  const progress = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  const toggle = async (id: string) => {
    const step = steps.find(s => s.id === id);
    if (!step) return;
    // Optimistic update
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
    try {
      const method = step.done ? 'DELETE' : 'POST';
      const res = await apiFetch(`/api/v1/repos/${repoId}/onboarding/${id}/complete`, { method });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
    } catch (e) {
      console.error('Toggle step error:', e);
      // Roll back optimistic update on failure
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

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant gap-4">
            <span className="material-symbols-outlined animate-spin text-primary" style={{ fontSize: '40px' }}>progress_activity</span>
            <p className="font-mono text-[14px]">Loading onboarding path...</p>
          </div>
        ) : steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant gap-3 text-center">
            <span className="material-symbols-outlined text-outline" style={{ fontSize: '48px' }}>rocket_launch</span>
            <p className="font-mono text-[14px]">No onboarding steps generated yet.</p>
            <p className="font-mono text-[12px] text-outline">The AI pipeline generates these during analysis. Try re-analyzing the repository.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {steps.map((step) => (
              <div
                key={step.id}
                className={`bg-[#14141C] border rounded-xl p-unit-4 flex items-start gap-4 transition-all duration-300 ${
                  step.done ? 'border-[#24242F] opacity-60' : 'border-[#24242F] hover:border-[#3F3F4E]'
                }`}
              >
                <button
                  onClick={() => toggle(step.id)}
                  className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                    step.done ? 'bg-emerald-500 border-emerald-500' : 'border-[#494454] hover:border-[#8B5CF6]'
                  }`}
                >
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
        )}
      </div>
    </div>
  );
}

// ─── Explorer Tab ─────────────────────────────────────────────────────────────
function ExplorerTab({ repoId }: { repoId: string }) {
  const [selectedFile,    setSelectedFile]    = useState<string>('');
  const [selectedFileId,  setSelectedFileId]  = useState<string>('');
  const [files,           setFiles]           = useState<any[]>([]);
  const [treeLoading,     setTreeLoading]     = useState(true);
  const [fileContent,     setFileContent]     = useState<FileContent | null>(null);
  const [contentLoading,  setContentLoading]  = useState(false);
  const apiFetch = useApiClient();

  useEffect(() => {
    let cancelled = false;
    const fetchFiles = async () => {
      setTreeLoading(true);
      try {
        const res = await apiFetch(`/api/v1/repos/${repoId}/files`);
        if (!res.ok) return;
        const data = await res.json();

        // Build a nested file tree from flat filePath array
        const root = { name: 'root', isDir: true, children: [] as any[] };
        data.forEach((f: any) => {
          const parts = (f.filePath ?? '').split('/');
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
          curr.children.push({ name: parts[parts.length - 1], hotspot: f.isHotspot, id: f.id, filePath: f.filePath });
        });
        if (!cancelled) {
          setFiles(root.children);
          // Auto-select first real file
          if (data.length > 0) {
            setSelectedFile(data[0].filePath ?? '');
            setSelectedFileId(data[0].id ?? '');
          }
        }
      } catch (e) {
        console.error('File tree fetch error:', e);
      } finally {
        if (!cancelled) setTreeLoading(false);
      }
    };
    fetchFiles();
    return () => { cancelled = true; };
  }, [repoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch file content + functions when a file is selected
  useEffect(() => {
    if (!selectedFileId || !repoId) return;
    let cancelled = false;
    setContentLoading(true);
    setFileContent(null);
    apiFetch(`/api/v1/repos/${repoId}/files/${selectedFileId}/content`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && !cancelled) setFileContent(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setContentLoading(false); });
    return () => { cancelled = true; };
  }, [selectedFileId, repoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileClick = (node) => {
    if (node.isDir) return;
    setSelectedFile(node.filePath || node.name);
    setSelectedFileId(node.id || '');
  };

  function FileTree({ items, depth = 0 }: { items: any[]; depth?: number }) {
    return (
      <>
        {items.map((f: any) => (
          <div key={f.name}>
            <div
              className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-[13px] transition-colors ${
                selectedFile === (f.filePath || f.name) ? 'bg-[#1B1B26] text-on-surface' : 'text-on-surface-variant hover:text-on-surface hover:bg-[#1B1B26]/50'
              }`}
              style={{ paddingLeft: `${8 + depth * 16}px` }}
              onClick={() => handleFileClick(f)}
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
            {contentLoading ? (
              <span className="animate-pulse">Loading file summary...</span>
            ) : fileContent?.aiSummary ? (
              <><strong className="text-on-surface">{fileContent.filePath.split('/').pop()}</strong> &mdash; {fileContent.aiSummary}</>
            ) : selectedFile ? (
              <><strong className="text-on-surface">{selectedFile.split('/').pop()}</strong> &mdash; No AI summary available for this file.</>
            ) : (
              'Select a file from the tree to view its AI summary.'
            )}
          </p>
          {fileContent && (
            <div className="flex gap-2 flex-shrink-0">
              {fileContent.complexityScore !== undefined && (
                <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#1B1B26] border border-[#24242F] text-on-surface-variant">
                  Complexity: {fileContent.complexityScore}
                </span>
              )}
              {fileContent.language && (
                <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#1B1B26] border border-[#24242F] text-primary">
                  {fileContent.language}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Code */}
        <div className="flex-1 overflow-auto bg-[#0A0A0F] p-4">
          {contentLoading ? (
            <div className="flex items-center justify-center h-40 text-on-surface-variant">
              <span className="material-symbols-outlined animate-spin text-primary mr-3" style={{ fontSize: '24px' }}>progress_activity</span>
              <span className="font-mono text-[13px]">Loading file content...</span>
            </div>
          ) : !selectedFileId ? (
            <div className="flex items-center justify-center h-40 text-on-surface-variant">
              <p className="font-mono text-[13px]">Select a file from the tree to view its source code.</p>
            </div>
          ) : fileContent?.rawContent ? (
            <pre className="font-mono text-[13px] text-on-surface-variant leading-6">
              {fileContent.rawContent.split('\n').map((line, i) => (
                <div key={i} className="flex hover:bg-[#1B1B26]/30 rounded">
                  <span className="w-10 text-right text-[#494454] mr-4 flex-shrink-0 select-none">{i + 1}</span>
                  <span>{line}</span>
                </div>
              ))}
            </pre>
          ) : (
            <div className="flex items-center justify-center h-40 text-on-surface-variant">
              <p className="font-mono text-[13px]">Raw content not available for this file.</p>
            </div>
          )}
        </div>
      </div>

      {/* Functions Panel */}
      <div className="w-60 flex-shrink-0 border-l border-[#24242F] bg-[#0A0A0F] overflow-y-auto p-2">
        <div className="font-mono text-[11px] text-on-surface-variant uppercase tracking-widest px-2 py-2 mb-1">
          Functions ({fileContent?.functions?.length ?? 0})
        </div>
        {contentLoading ? (
          <div className="px-2 py-4 text-on-surface-variant font-mono text-[12px] animate-pulse">Loading...</div>
        ) : !fileContent?.functions?.length ? (
          <div className="px-2 py-4 text-on-surface-variant font-mono text-[12px]">
            {selectedFileId ? 'No functions detected in this file.' : 'Select a file to see its functions.'}
          </div>
        ) : (
          fileContent.functions.map((fn) => {
            const complexity = fn.complexityScore ?? 0;
            const complexityLabel = complexity > 15 ? 'High' : complexity > 7 ? 'Med' : 'Low';
            const complexityColor = complexity > 15 ? 'text-rose-400' : complexity > 7 ? 'text-amber-400' : 'text-emerald-400';
            return (
              <div key={fn.id} className="p-2 rounded hover:bg-[#1B1B26] cursor-pointer transition-colors border border-transparent hover:border-[#3F3F4E]">
                <div className="flex justify-between items-center mb-0.5">
                  <span className="font-mono text-[12px] text-on-surface truncate pr-2">
                    {fn.className ? fn.className + '.' : ''}{fn.functionName}()
                  </span>
                  <span className={`font-mono text-[11px] flex-shrink-0 ${complexityColor}`}>{complexityLabel}</span>
                </div>
                {fn.startLine && (
                  <span className="font-mono text-[11px] text-on-surface-variant">L{fn.startLine}{fn.endLine ? `-${fn.endLine}` : ''}</span>
                )}
                {fn.aiSummary && (
                  <p className="font-mono text-[11px] text-on-surface-variant mt-1 line-clamp-2 opacity-70">{fn.aiSummary}</p>
                )}
              </div>
            );
          })
        )}
      </div>
// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab({ repo, repoId }: { repo: Repo | null; repoId: string }) {
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const apiFetch = useApiClient();
  const { logout } = useAuth();

  const handleDeleteRepo = async () => {
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/v1/repos/${repoId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Delete failed: ${msg}`);
    } finally {
      setDeleting(false);
    }
  };


  return (
    <div className="p-gutter md:p-unit-6 max-w-2xl">
      <h2 className="text-[32px] font-semibold text-on-surface mb-unit-6">Settings</h2>

      {/* Account Section */}
      <div className="bg-[#14141C] border border-[#24242F] rounded-xl p-unit-6 mb-unit-4">
        <h3 className="font-semibold text-[20px] text-on-surface mb-unit-4">Account</h3>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#8B5CF6] flex items-center justify-center text-white text-lg font-bold">
            {repo?.githubOwner?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div>
            <p className="font-semibold text-on-surface">{repo?.githubOwner ?? 'Account'}</p>
            <p className="font-mono text-[13px] text-on-surface-variant">
              {repo ? `github.com/${repo.githubOwner}` : 'Sign in to see details'}
            </p>
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
              <button
                onClick={handleDeleteRepo}
                disabled={deleting}
                className="bg-rose-600 text-white px-4 py-2 rounded-lg text-[13px] font-semibold hover:bg-rose-500 disabled:opacity-50 flex items-center gap-2"
              >
                {deleting && <span className="material-symbols-outlined animate-spin" style={{ fontSize: '16px' }}>progress_activity</span>}
                {deleting ? 'Deleting...' : 'Yes, delete it'}
              </button>
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
  const navigate   = useNavigate();
  const apiFetch   = useApiClient();

  // Derive active tab label from URL
  const path     = window.location.pathname.split('/').pop() ?? 'overview';
  const tabLabel = TAB_LABELS[path] || 'Overview';

  useEffect(() => {
    if (!repoId) return;
    let cancelled = false;
    apiFetch(`/api/v1/repos/${repoId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && !cancelled) setRepo(data); })
      .catch(() => {}); // Non-fatal — sidebar stays in loading state
    return () => { cancelled = true; };
  }, [repoId]); // eslint-disable-line react-hooks/exhaustive-deps


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

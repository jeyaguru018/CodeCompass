import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiClient } from '../apiClient';

interface Repo {
  id: string;
  githubOwner: string;
  githubName: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  id: string;
}

/**
 * CrossRepoChatPage
 *
 * Lets the user select two analysed repositories and ask AI to compare them.
 *
 * Backend contract:
 *   POST /api/v1/chat/cross-repo
 *   Body: { repoIds: [string, string], prompt: string }
 *   Response: text/event-stream  (same token/citations/done SSE format as single-repo chat)
 *   JSON fallback: { answer: string }
 *
 * Corrections vs the original:
 *   - Endpoint was /api/v1/cross-repo-chat  → correct: /api/v1/chat/cross-repo
 *   - Payload was { repoIdA, repoIdB, question } → correct: { repoIds: [A, B], prompt }
 *   - Used raw fetch+getToken instead of useApiClient() → now centralized
 *   - No SSE handling at all → now streams token events in real time
 */
export default function CrossRepoChatPage() {
  const [repos,   setRepos]   = useState<Repo[]>([]);
  const [repoA,   setRepoA]   = useState<string>('');
  const [repoB,   setRepoB]   = useState<string>('');
  const [messages,setMessages]= useState<ChatMessage[]>([]);
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchErr,setFetchErr]= useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const apiFetch  = useApiClient();
  const navigate  = useNavigate();

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
  }, []);

  // Load completed repos for the two selectors
  useEffect(() => {
    let cancelled = false;
    const fetchRepos = async () => {
      try {
        const res = await apiFetch('/api/v1/repos');
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data: any[] = await res.json();
        const completed = data.filter(r => r.status === 'COMPLETED');
        if (!cancelled) setRepos(completed);
      } catch (err: unknown) {
        if (!cancelled) setFetchErr(err instanceof Error ? err.message : 'Failed to load repositories.');
      }
    };
    fetchRepos();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading || !repoA || !repoB || repoA === repoB) return;

    const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    scrollToBottom();

    // Optimistic assistant bubble for streaming
    const assistantId = `ai-${Date.now()}`;
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    try {
      const res = await apiFetch('/api/v1/chat/cross-repo', {
        method: 'POST',
        headers: { Accept: 'text/event-stream' },
        // Corrected payload: repoIds array + prompt (not repoIdA/B/question)
        body: JSON.stringify({ repoIds: [repoA, repoB], prompt: text }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || `Server returned ${res.status}`);
      }

      const contentType = res.headers.get('content-type') ?? '';

      if (contentType.includes('text/event-stream') && res.body) {
        // ── SSE streaming path ───────────────────────────────────────────────
        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer    = '';

        const flush = (line: string) => {
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
          } catch {
            // Ignore non-JSON keep-alive lines
          }
        };

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';
          for (const part of parts) {
            for (const line of part.split('\n')) flush(line);
          }
        }
        for (const line of buffer.split('\n')) flush(line);

      } else {
        // ── JSON fallback path ────────────────────────────────────────────────
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
          m.id === assistantId ? { ...m, content: `⚠️ ${msg}` } : m
        )
      );
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const repoLabel = (id: string) => {
    const r = repos.find(x => x.id === id);
    return r ? `${r.githubOwner}/${r.githubName}` : id;
  };

  return (
    <div className="bg-[#0A0A0F] text-[#e4e1e9] min-h-screen flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>
      <header className="bg-[#131318] border-b border-[#494454] w-full h-14 flex items-center px-gutter sticky top-0 z-50">
        <button onClick={() => navigate('/dashboard')} className="text-on-surface-variant hover:text-on-surface mr-4 transition-colors">
          <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>arrow_back</span>
        </button>
        <span className="font-bold text-[20px] text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-[#8B5CF6]">forum</span>
          Cross-Repo Chat
        </span>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 flex flex-col min-h-0 h-[calc(100vh-3.5rem)]">

        {/* Repo error banner */}
        {fetchErr && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-3 rounded-lg mb-4 font-mono text-[12px] flex items-center gap-2">
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>error</span>
            {fetchErr}
          </div>
        )}

        {/* Repo selectors */}
        <div className="bg-[#14141C] border border-[#24242F] p-4 rounded-xl mb-4 flex flex-col md:flex-row gap-4 items-center">
          <div className="flex-1 w-full">
            <label className="block text-on-surface-variant text-[12px] font-mono mb-1">Repository A</label>
            <select
              value={repoA}
              onChange={(e) => setRepoA(e.target.value)}
              className="w-full bg-[#1B1B26] border border-[#24242F] text-on-surface rounded p-2 text-[14px] font-mono outline-none focus:border-[#8B5CF6]"
            >
              <option value="">Select a repository...</option>
              {repos.map((r) => (
                <option key={r.id} value={r.id} disabled={r.id === repoB}>
                  {r.githubOwner}/{r.githubName}
                </option>
              ))}
            </select>
          </div>
          <div className="hidden md:flex items-center justify-center pt-5">
            <span className="material-symbols-outlined text-[#52525B]">compare_arrows</span>
          </div>
          <div className="flex-1 w-full">
            <label className="block text-on-surface-variant text-[12px] font-mono mb-1">Repository B</label>
            <select
              value={repoB}
              onChange={(e) => setRepoB(e.target.value)}
              className="w-full bg-[#1B1B26] border border-[#24242F] text-on-surface rounded p-2 text-[14px] font-mono outline-none focus:border-[#8B5CF6]"
            >
              <option value="">Select a repository...</option>
              {repos.map((r) => (
                <option key={r.id} value={r.id} disabled={r.id === repoA}>
                  {r.githubOwner}/{r.githubName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 bg-[#14141C] border border-[#24242F] rounded-xl flex flex-col min-h-0 overflow-hidden relative shadow-lg">
          {(!repoA || !repoB || repoA === repoB) ? (
            <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant p-6 text-center gap-3">
              <span className="material-symbols-outlined text-[#3F3F4E] mb-2" style={{ fontSize: '48px' }}>compare_arrows</span>
              <p className="font-mono text-[14px]">Select two different repositories above to start comparing them.</p>
              {repoA === repoB && repoA && (
                <p className="font-mono text-[12px] text-rose-400">⚠️ Both selections are the same repository. Choose two different ones.</p>
              )}
            </div>
          ) : (
            <>
              {/* Context banner */}
              <div className="bg-[#1B1B26] border-b border-[#24242F] px-4 py-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#8B5CF6]" style={{ fontSize: '14px' }}>merge</span>
                <span className="font-mono text-[11px] text-on-surface-variant">
                  Comparing <strong className="text-primary">{repoLabel(repoA)}</strong> vs <strong className="text-[#22D3EE]">{repoLabel(repoB)}</strong>
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="flex items-center justify-center h-full text-on-surface-variant/50">
                    <p className="font-mono text-[13px]">Ask a question comparing both repositories.</p>
                  </div>
                )}
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-xl p-3 ${
                      msg.role === 'user'
                        ? 'bg-[#1B1B26] border border-[#3F3F4E] text-on-surface'
                        : 'bg-[#131318] border border-[#8B5CF6]/30 text-on-surface-variant'
                    }`}>
                      {loading && msg.role === 'assistant' && msg.id === messages.filter(m => m.role === 'assistant').at(-1)?.id ? (
                        <p className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                          <span className="inline-block w-0.5 h-3.5 bg-[#8B5CF6] ml-0.5 align-middle" style={{ animation: 'cursor-blink 1s steps(1) infinite' }} />
                        </p>
                      ) : (
                        <p className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={send} className="p-3 border-t border-[#24242F] flex items-center gap-2 bg-[#14141C]">
                <input
                  className="flex-1 bg-[#1f1f25] border border-[#494454] rounded-lg px-4 py-2.5 font-mono text-[13px] text-on-surface outline-none focus:border-[#8B5CF6] placeholder-[#52525B]"
                  placeholder="How is authentication handled differently in these repos?"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="bg-[#8B5CF6] text-white p-2.5 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center"
                  style={{ boxShadow: '0 0 10px rgba(139,92,246,0.2)' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>send</span>
                </button>
              </form>
            </>
          )}
        </div>
      </main>

      <style>{`
        @keyframes cursor-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}

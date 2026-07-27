import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
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

export default function CrossRepoChatPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoA, setRepoA] = useState<string>('');
  const [repoB, setRepoB] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  
  const { getToken } = useAuth();
  const apiFetch = useApiClient();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchRepos = async () => {
      try {
        const res = await apiFetch('/api/v1/repos');
        if (res.ok) {
          const data = await res.json();
          const completed = data.filter((r: any) => r.status === 'COMPLETED');
          setRepos(completed);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchRepos();
  }, [apiFetch]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading || !repoA || !repoB || repoA === repoB) return;
    
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const token = await getToken();
      const res = await fetch(`http://localhost:8081/api/v1/cross-repo-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ repoIdA: repoA, repoIdB: repoB, question: userMsg.content }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev, 
        { id: Date.now().toString() + 'a', role: 'assistant', content: data.answer || 'No response.' }
      ]);
    } catch {
      setMessages((prev) => [
        ...prev, 
        { id: Date.now().toString() + 'e', role: 'assistant', content: '⚠️ Error reaching backend.' }
      ]);
    } finally {
      setLoading(false);
    }
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  return (
    <div className="bg-[#0A0A0F] text-[#e4e1e9] min-h-screen flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>
      <header className="bg-[#131318] border-b border-[#494454] w-full h-14 flex items-center px-gutter sticky top-0 z-50">
        <button onClick={() => navigate('/dashboard')} className="text-on-surface-variant hover:text-on-surface mr-4">
          <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>arrow_back</span>
        </button>
        <span className="font-bold text-[20px] text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-[#8B5CF6]">forum</span>
          Cross-Repo Chat
        </span>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 flex flex-col min-h-0 h-[calc(100vh-3.5rem)]">
        <div className="bg-[#14141C] border border-[#24242F] p-4 rounded-xl mb-4 flex flex-col md:flex-row gap-4 items-center">
          <div className="flex-1 w-full">
            <label className="block text-on-surface-variant text-[12px] font-mono mb-1">Repository A</label>
            <select
              value={repoA}
              onChange={(e) => setRepoA(e.target.value)}
              className="w-full bg-[#1B1B26] border border-[#24242F] text-on-surface rounded p-2 text-[14px]"
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
              className="w-full bg-[#1B1B26] border border-[#24242F] text-on-surface rounded p-2 text-[14px]"
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
            <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant p-6 text-center">
              <span className="material-symbols-outlined text-[#3F3F4E] mb-2" style={{ fontSize: '48px' }}>chat_bubble</span>
              <p>Select two different repositories above to start comparing them.</p>
            </div>
          ) : (
            <>
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
                      <p className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-[#131318] border border-[#8B5CF6]/30 rounded-xl p-3 flex items-center gap-2">
                      <span className="material-symbols-outlined animate-pulse text-[#8B5CF6]" style={{ fontSize: '16px' }}>more_horiz</span>
                      <span className="font-mono text-[13px] text-on-surface-variant">Analyzing both repos...</span>
                    </div>
                  </div>
                )}
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
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>send</span>
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

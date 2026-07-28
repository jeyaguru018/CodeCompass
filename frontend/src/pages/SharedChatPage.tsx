import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { API_BASE } from '../config';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

interface SharedSession {
  id: string;
  title: string | null;
  repository_name: string;
  messages: ChatMessage[];
}

/**
 * SharedChatPage
 *
 * A public, read-only view of a shared chat session. No auth required.
 *
 * Backend contract:
 *   GET /api/v1/chat/shared/{token}   (NO Authorization header)
 *   Response: {
 *     id: string,
 *     title: string | null,
 *     repository_name: string,          // "owner/name"
 *     messages: [{ id, role, content, created_at, cited_file_ids }]
 *   }
 *   404 → session not found or not public
 */
export default function SharedChatPage() {
  const { token } = useParams<{ token: string }>();
  const [session,  setSession]  = useState<SharedSession | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  useEffect(() => {
    if (!token) {
      setError('No sharing token provided in the URL.');
      setLoading(false);
      return;
    }

    // This endpoint is public — no Authorization header is sent.
    // Using the centralized API_BASE so switching environments
    // (dev → staging → prod) requires one config change.
    fetch(`${API_BASE}/api/v1/chat/shared/${token}`)
      .then(async res => {
        if (!res.ok) {
          // Surface backend message when possible; fall back to a generic string.
          const text = await res.text().catch(() => '');
          throw new Error(
            res.status === 404
              ? 'This shared chat session does not exist or has been unshared.'
              : text || `Server error (${res.status})`
          );
        }
        return res.json() as Promise<SharedSession>;
      })
      .then(data => setSession(data))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load chat.'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="bg-[#0A0A0F] text-[#e4e1e9] min-h-screen flex flex-col items-center" style={{ fontFamily: 'Inter, sans-serif' }}>
      <header className="w-full max-w-4xl mt-12 mb-8 flex flex-col items-center gap-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#1B1B26] border border-[#24242F] flex items-center justify-center">
            <span className="material-symbols-outlined text-[#22D3EE]" style={{ fontSize: '16px' }}>hub</span>
          </div>
          <span className="font-bold text-[24px] text-on-surface">CodeCompass</span>
        </div>
        {session?.repository_name && (
          <p className="text-on-surface-variant font-mono text-[13px]">{session.repository_name}</p>
        )}
        <p className="text-on-surface-variant font-mono text-[13px] bg-[#14141C] border border-[#24242F] px-4 py-1.5 rounded-full flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: '16px' }}>public</span>
          {session?.title ?? 'Shared Chat Session'}
        </p>
      </header>

      <main className="w-full max-w-4xl flex-1 flex flex-col min-h-0 px-4 pb-12">
        <div className="bg-[#14141C] border border-[#24242F] rounded-xl flex-1 flex flex-col overflow-hidden shadow-xl">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-on-surface-variant">
              <span className="material-symbols-outlined animate-spin text-[#8B5CF6]" style={{ fontSize: '40px' }}>progress_activity</span>
              <p className="font-mono text-[14px]">Loading shared chat...</p>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-on-surface-variant p-6 text-center">
              <span className="material-symbols-outlined text-rose-500" style={{ fontSize: '48px' }}>error</span>
              <p className="font-mono text-[14px] text-rose-400">{error}</p>
            </div>
          ) : session?.messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-on-surface-variant p-6 text-center">
              <span className="material-symbols-outlined text-outline" style={{ fontSize: '48px' }}>chat_bubble</span>
              <p className="font-mono text-[14px]">This shared session has no messages.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {session?.messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl p-4 ${
                    msg.role === 'user'
                      ? 'bg-[#1B1B26] border border-[#3F3F4E] text-on-surface rounded-br-sm'
                      : 'bg-[#131318] border border-primary/20 text-on-surface-variant rounded-bl-sm'
                  }`}>
                    <div className="flex items-center gap-2 mb-2 opacity-60">
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                        {msg.role === 'user' ? 'person' : 'smart_toy'}
                      </span>
                      <span className="font-mono text-[11px] uppercase tracking-wider font-semibold">
                        {msg.role === 'user' ? 'You' : 'AI Assistant'}
                      </span>
                    </div>
                    <p className="font-mono text-[14px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Read-only footer */}
          <div className="bg-[#1B1B26] border-t border-[#24242F] p-4 text-center">
            <p className="font-mono text-[12px] text-on-surface-variant flex items-center justify-center gap-2">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>lock</span>
              This is a read-only shared conversation. Sign in to CodeCompass to chat with your own repositories.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

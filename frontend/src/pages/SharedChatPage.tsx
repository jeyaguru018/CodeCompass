import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  id: string;
}

export default function SharedChatPage() {
  const { token } = useParams<{ token: string }>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchSharedChat = async () => {
      try {
        // We hit the public endpoint with no Authorization header
        const res = await fetch(`http://localhost:8081/api/v1/repos/share/${token}`);
        if (!res.ok) {
          throw new Error('Chat session not found or expired.');
        }
        const data = await res.json();
        setMessages(data.messages || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load chat.');
      } finally {
        setLoading(false);
      }
    };
    fetchSharedChat();
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
        <p className="text-on-surface-variant font-mono text-[13px] bg-[#14141C] border border-[#24242F] px-4 py-1.5 rounded-full flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: '16px' }}>public</span>
          Shared Chat Session
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
          ) : (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {messages.map((msg) => (
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
          
          {/* Read Only Footer */}
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

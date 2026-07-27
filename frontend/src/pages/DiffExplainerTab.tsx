import { useState } from 'react';
import { useAuth } from '../AuthContext';

export default function DiffExplainerTab({ repoId }: { repoId: string }) {
  const [diffText, setDiffText] = useState('');
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState('');
  const { getToken } = useAuth();

  const handleExplain = async () => {
    if (!diffText.trim()) return;
    setLoading(true);
    setError('');
    setExplanation('');

    try {
      const token = await getToken();
      const res = await fetch(`http://localhost:8081/api/v1/diff/explain`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ repoId, diffText }),
      });
      
      if (!res.ok) {
        throw new Error('Failed to analyze diff');
      }
      
      const data = await res.json();
      setExplanation(data.explanation || 'No explanation returned.');
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-gutter md:p-unit-6 h-full flex flex-col">
      <div className="mb-unit-6">
        <h2 className="text-[32px] font-semibold text-on-surface mb-2">Diff Explainer</h2>
        <p className="text-on-surface-variant font-mono text-[13px]">Paste a git diff or pull request changes to get an AI risk assessment.</p>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-unit-6 min-h-0">
        {/* Input Area */}
        <div className="flex-1 flex flex-col bg-[#14141C] border border-[#24242F] rounded-xl overflow-hidden">
          <div className="bg-[#1B1B26] border-b border-[#24242F] p-3 flex items-center justify-between">
            <span className="font-mono text-[13px] text-on-surface-variant uppercase tracking-wider font-semibold">Diff Input</span>
            <button 
              onClick={handleExplain}
              disabled={loading || !diffText.trim()}
              className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white px-4 py-1.5 rounded-md font-mono text-[13px] transition-colors disabled:opacity-50 flex items-center gap-2 shadow-[0_0_10px_rgba(139,92,246,0.2)]"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin" style={{ fontSize: '16px' }}>progress_activity</span>
                  Analyzing...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>insights</span>
                  Explain Diff
                </>
              )}
            </button>
          </div>
          <textarea
            value={diffText}
            onChange={(e) => setDiffText(e.target.value)}
            placeholder="Paste your raw diff here..."
            className="flex-1 w-full bg-transparent p-4 font-mono text-[13px] text-[#A1A1AA] outline-none resize-none"
            spellCheck={false}
          />
        </div>

        {/* Output Area */}
        <div className="flex-1 flex flex-col bg-[#14141C] border border-[#24242F] rounded-xl overflow-hidden">
          <div className="bg-[#1B1B26] border-b border-[#24242F] p-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#22D3EE]" style={{ fontSize: '18px' }}>auto_awesome</span>
            <span className="font-mono text-[13px] text-[#22D3EE] uppercase tracking-wider font-semibold">AI Assessment</span>
          </div>
          <div className="flex-1 p-6 overflow-y-auto">
            {loading && (
              <div className="flex flex-col items-center justify-center h-full text-on-surface-variant gap-4">
                <span className="material-symbols-outlined animate-pulse text-[#8B5CF6]" style={{ fontSize: '48px' }}>memory</span>
                <p className="font-mono text-[14px]">Analyzing code changes and detecting risks...</p>
              </div>
            )}
            
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-4 rounded-lg flex items-center gap-3">
                <span className="material-symbols-outlined">error</span>
                <p className="font-mono text-[13px]">{error}</p>
              </div>
            )}
            
            {!loading && !error && explanation && (
              <div className="prose prose-invert prose-sm max-w-none font-mono">
                {explanation.split('\n').map((line, i) => (
                  <p key={i} className="mb-2 leading-relaxed text-on-surface-variant">
                    {line.startsWith('#') ? <strong className="text-on-surface text-[15px] block mt-4 mb-2">{line.replace(/#/g, '')}</strong> : line}
                  </p>
                ))}
              </div>
            )}
            
            {!loading && !error && !explanation && (
              <div className="flex items-center justify-center h-full text-on-surface-variant/50">
                <p className="font-mono text-[13px]">Explanation will appear here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

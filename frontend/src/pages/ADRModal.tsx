import { useState } from 'react';
import { useAuth } from '../AuthContext';

export default function ADRModal({ 
  repoId, 
  moduleName, 
  onClose 
}: { 
  repoId: string, 
  moduleName: string, 
  onClose: () => void 
}) {
  const [adr, setAdr] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { getToken } = useAuth();

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`http://localhost:8081/api/v1/repos/${repoId}/adr`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ targetModule: moduleName }),
      });
      if (!res.ok) throw new Error('Failed to generate ADR');
      const data = await res.json();
      setAdr(data.adrContent);
    } catch (err: any) {
      setError(err.message || 'Error generating ADR.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="bg-[#14141C] border border-[#24242F] w-full max-w-3xl max-h-[85vh] rounded-xl flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-[#1B1B26] border-b border-[#24242F] p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#8B5CF6]/20 flex items-center justify-center border border-[#8B5CF6]/30">
              <span className="material-symbols-outlined text-[#8B5CF6]" style={{ fontSize: '18px' }}>architecture</span>
            </div>
            <div>
              <h3 className="font-semibold text-on-surface text-[16px]">Architecture Decision Record</h3>
              <p className="font-mono text-on-surface-variant text-[12px]">Module: {moduleName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface p-1 rounded hover:bg-[#2a292f] transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col min-h-0 bg-[#0A0A0F]">
          {!adr && !loading && !error && (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
              <span className="material-symbols-outlined text-outline mb-4" style={{ fontSize: '48px' }}>psychology</span>
              <h4 className="text-[18px] text-on-surface font-semibold mb-2">Generate ADR</h4>
              <p className="text-on-surface-variant text-[14px] max-w-sm mb-6">
                CodeCompass will use AI to analyze {moduleName} and generate a structured Architecture Decision Record explaining its purpose, dependencies, and design patterns.
              </p>
              <button 
                onClick={handleGenerate}
                className="bg-[#8B5CF6] text-white px-6 py-2.5 rounded-lg font-mono text-[14px] font-semibold hover:opacity-90 shadow-[0_0_15px_rgba(139,92,246,0.4)] transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>auto_awesome</span>
                Generate ADR
              </button>
            </div>
          )}

          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center py-12 gap-4">
              <span className="material-symbols-outlined animate-spin text-[#8B5CF6]" style={{ fontSize: '48px' }}>sync</span>
              <p className="font-mono text-[14px] text-on-surface-variant animate-pulse">Analyzing module architecture...</p>
            </div>
          )}

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-4 rounded-lg flex items-center gap-3">
              <span className="material-symbols-outlined">error</span>
              <p className="font-mono text-[13px]">{error}</p>
            </div>
          )}

          {adr && (
            <div className="prose prose-invert prose-sm max-w-none font-mono text-[13px]">
              {adr.split('\n').map((line, i) => (
                <p key={i} className="mb-2 text-on-surface-variant">
                  {line.startsWith('#') ? <strong className="text-on-surface text-[15px] block mt-4 mb-2">{line.replace(/#/g, '')}</strong> : line}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

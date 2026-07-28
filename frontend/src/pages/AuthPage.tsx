import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, register } = useAuth();

  // If user lands here after trying to analyze a repo, flip to register view
  useEffect(() => {
    const redirect = searchParams.get('redirect');
    if (redirect === 'analyze') setIsLogin(false);
    
    // Clear any autofilled data on fresh open
    setEmail('');
    setPassword('');
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        const namePart = email.split('@')[0] || 'Developer';
        const fallbackName = namePart.length >= 2 ? namePart : 'Developer';
        await register(fallbackName, email, password);
      }
      navigate('/dashboard');
    } catch (err: any) {
      let msg = err.message;
      try {
        const parsed = JSON.parse(msg);
        if (parsed.message) msg = parsed.message;
        else if (parsed.errors) msg = parsed.errors.map((e: any) => e.defaultMessage || e.msg).join(', ');
      } catch (e) {
        // Not JSON
      }
      setError(msg || (isLogin ? 'Invalid credentials.' : 'Registration failed.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="bg-[#131318] text-[#e4e1e9] h-screen w-full flex overflow-hidden antialiased"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      {/* ── Left Panel ── */}
      <div className="hidden lg:flex w-1/2 bg-[#0e0e13] flex-col justify-between p-unit-8 relative overflow-hidden border-r border-[#494454] z-0">
        {/* Brand */}
        <div className="z-20 flex items-center gap-2 relative">
          <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>schema</span>
          <span className="font-bold text-[20px] text-on-surface tracking-tight">CodeCompass</span>
        </div>

        {/* Background Illustration */}
        <div className="absolute inset-0 z-0 flex items-center justify-center opacity-40">
          {/* Animated node graph SVG */}
          <svg viewBox="0 0 600 600" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="glow-v" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="glow-c" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
              </radialGradient>
            </defs>
            {/* Edges */}
            <line x1="300" y1="300" x2="180" y2="180" stroke="#494454" strokeWidth="1" />
            <line x1="300" y1="300" x2="420" y2="200" stroke="#494454" strokeWidth="1" />
            <line x1="300" y1="300" x2="450" y2="380" stroke="#8B5CF6" strokeWidth="1.5" strokeDasharray="6" />
            <line x1="300" y1="300" x2="150" y2="400" stroke="#494454" strokeWidth="1" />
            <line x1="300" y1="300" x2="300" y2="460" stroke="#22D3EE" strokeWidth="1" />
            <line x1="180" y1="180" x2="100" y2="120" stroke="#494454" strokeWidth="1" />
            <line x1="420" y1="200" x2="500" y2="130" stroke="#494454" strokeWidth="1" />
            {/* Nodes */}
            <circle cx="300" cy="300" r="16" fill="#1B1B26" stroke="#8B5CF6" strokeWidth="2" />
            <circle cx="300" cy="300" r="28" fill="url(#glow-v)" opacity="0.5" />
            <circle cx="180" cy="180" r="10" fill="#1B1B26" stroke="#22D3EE" strokeWidth="1.5" />
            <circle cx="420" cy="200" r="8" fill="#1B1B26" stroke="#d0bcff" strokeWidth="1.5" />
            <circle cx="450" cy="380" r="12" fill="#1B1B26" stroke="#f43f5e" strokeWidth="1.5" />
            <circle cx="150" cy="400" r="8" fill="#1B1B26" stroke="#494454" strokeWidth="1" />
            <circle cx="300" cy="460" r="10" fill="#1B1B26" stroke="#22D3EE" strokeWidth="1.5" />
            <circle cx="100" cy="120" r="6" fill="#1B1B26" stroke="#494454" strokeWidth="1" />
            <circle cx="500" cy="130" r="7" fill="#1B1B26" stroke="#494454" strokeWidth="1" />
          </svg>
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e13] via-transparent to-[#0e0e13]"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#0e0e13] via-transparent to-transparent"></div>
        </div>

        {/* Tagline */}
        <div className="z-20 max-w-lg animate-fade-in-up relative">
          <h1 className="text-[48px] leading-[56px] font-bold tracking-[-0.02em] text-on-surface mb-unit-4">
            Understand any codebase in under 60 seconds.
          </h1>
          <p className="text-[16px] text-on-surface-variant leading-[24px]">
            Connect your repositories and let our AI map, analyze, and explain your entire architecture instantly.
          </p>
        </div>
      </div>

      {/* ── Right Panel (Auth Form) ── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-gutter relative z-10 bg-[#131318]">
        <div className="w-full max-w-[420px] bg-[#131318] border border-[#494454] rounded-xl p-unit-8 flex flex-col gap-unit-6 shadow-2xl animate-fade-in-up delay-1">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-2 mb-unit-2 justify-center">
            <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>schema</span>
          </div>

          {/* Header */}
          <div className="flex flex-col gap-unit-2 text-center lg:text-left">
            <h2 className="text-[24px] lg:text-[32px] font-semibold text-on-surface">
              {isLogin ? 'Welcome back' : 'Create account'}
            </h2>
            <p className="text-[14px] text-on-surface-variant">
              {isLogin ? 'Sign in to your CodeCompass account' : 'Start analyzing your repositories for free'}
            </p>
          </div>

          {/* GitHub Button */}
          <button
            type="button"
            onClick={() => alert('GitHub OAuth is not fully configured in the backend yet. Please create an account using an email and password below.')}
            className="w-full bg-[#1f1f25] border border-[#494454] text-on-surface py-unit-3 rounded-lg flex items-center justify-center gap-unit-3 hover:border-primary hover:bg-[#2a292f] transition-all duration-200 group relative overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface"
          >
            <svg className="w-5 h-5 fill-current text-on-surface" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            <span className="font-semibold text-[14px]">Continue with GitHub</span>
            <div className="absolute inset-0 rounded-lg border border-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" style={{ boxShadow: 'inset 0 0 12px rgba(139, 92, 246, 0.15)' }}></div>
          </button>

          {/* Divider */}
          <div className="flex items-center gap-unit-4">
            <div className="h-px bg-[#494454] flex-1"></div>
            <span className="font-mono text-[11px] text-outline uppercase tracking-wider">or continue with email</span>
            <div className="h-px bg-[#494454] flex-1"></div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-[#93000a]/20 border border-[#93000a]/40 rounded-lg p-unit-3 text-[#ffdad6] text-[13px] font-mono">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-unit-4" autoComplete="off">
            <div className="flex flex-col gap-unit-2">
              <label className="font-mono text-[12px] text-on-surface-variant">Email Address</label>
              <input
                className="input-field"
                placeholder="dev@company.com"
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="nope"
              />
            </div>
            <div className="flex flex-col gap-unit-2">
              <div className="flex justify-between items-center">
                <label className="font-mono text-[12px] text-on-surface-variant">Password</label>
                {isLogin && <a className="font-mono text-[12px] text-primary hover:text-primary-container transition-colors" href="#">Forgot?</a>}
              </div>
              <input
                className="input-field"
                placeholder="••••••••"
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
              />
              {!isLogin && (
                <p className="font-mono text-[11px] text-on-surface-variant mt-1">
                  Minimum 8 characters required.
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="mt-unit-2 w-full bg-primary text-on-primary py-unit-3 rounded-lg font-semibold text-[14px] hover:bg-primary-container transition-all duration-200 flex justify-center items-center gap-2 focus:outline-none hover:shadow-[0_0_15px_rgba(139,92,246,0.3)] disabled:opacity-50"
            >
              {loading ? (
                <span className="material-symbols-outlined animate-spin" style={{ fontSize: '18px' }}>progress_activity</span>
              ) : (
                <>
                  {isLogin ? 'Sign In' : 'Create Account'}
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
                </>
              )}
            </button>
          </form>

          {/* Toggle */}
          <div className="text-center">
            <p className="text-[14px] text-on-surface-variant">
              {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
              <button
                type="button"
                onClick={() => { setIsLogin(!isLogin); setError(''); setEmail(''); setPassword(''); }}
                className="text-primary hover:text-primary-container font-semibold transition-colors focus:outline-none"
              >
                {isLogin ? 'Create Account' : 'Sign In'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

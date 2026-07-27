import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

// ─── WebGL Shader Background ─────────────────────────────────────────────────
function ShaderBackground({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext;
    if (!gl) return;

    function syncSize() {
      if (!canvas) return;
      const w = canvas.clientWidth || 1280;
      const h = canvas.clientHeight || 720;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }
    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);
    syncSize();

    const vs = `attribute vec2 a_position; varying vec2 v_texCoord;
void main() { v_texCoord = a_position * 0.5 + 0.5; gl_Position = vec4(a_position, 0.0, 1.0); }`;
    const fs = `precision highp float;
uniform float u_time; uniform vec2 u_resolution; varying vec2 v_texCoord;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
             mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
}
void main() {
  vec2 uv = v_texCoord;
  float n = noise(uv * 3.0 + u_time * 0.1);
  vec3 c1 = vec3(0.545, 0.361, 0.965);
  vec3 c2 = vec3(0.133, 0.827, 0.933);
  vec3 bg = vec3(0.039, 0.039, 0.059);
  float mask = smoothstep(0.4, 0.6, n);
  vec3 accent = mix(c1, c2, uv.x);
  gl_FragColor = vec4(mix(bg, accent * 0.15, mask), 1.0);
}`;

    function cs(type: number, src: string) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src); gl!.compileShader(s); return s;
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, cs(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, cs(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog); gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_resolution');

    let raf: number;
    function render(t: number) {
      syncSize();
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
      if (uTime) gl!.uniform1f(uTime, t * 0.001);
      if (uRes) gl!.uniform2f(uRes, canvas!.width, canvas!.height);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(render);
    }
    render(0);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={canvasRef} className={className} style={{ display: 'block', width: '100%', height: '100%' }} />;
}

// ─── Landing Page ─────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [repoUrl, setRepoUrl] = useState('');
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    if (!isAuthenticated) {
      sessionStorage.setItem('pending_repo_url', repoUrl);
      navigate(`/auth?redirect=analyze&url=${encodeURIComponent(repoUrl)}`);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div className="bg-[#0A0A0F] text-on-background min-h-screen custom-scrollbar" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* ── Top Nav ── */}
      <header className="w-full h-14 border-b border-outline-variant bg-surface flex justify-between items-center px-gutter fixed top-0 z-50">
        <div className="flex items-center gap-unit-2">
          <span className="material-symbols-outlined text-primary text-[20px]">hub</span>
          <span className="font-semibold text-[20px] text-on-surface tracking-tight">CodeCompass</span>
        </div>
        <div className="flex items-center gap-unit-4">
          <Link className="text-on-surface-variant hover:text-primary transition-colors text-sm" to="/auth">Login</Link>
          <Link className="bg-[#8B5CF6] text-white px-unit-4 py-unit-2 rounded font-semibold text-sm hover:opacity-90 transition-opacity" to="/auth">Get Started</Link>
        </div>
      </header>

      <main className="pt-14 relative w-full overflow-hidden flex flex-col items-center">
        {/* ── Hero Section ── */}
        <section className="relative w-full min-h-[870px] flex flex-col items-center justify-center px-gutter py-unit-8">
          {/* Shader Background */}
          <div className="absolute inset-0 w-full h-full opacity-60 pointer-events-none">
            <ShaderBackground />
          </div>

          <div className="relative z-10 max-w-container-max mx-auto w-full flex flex-col items-center text-center gap-unit-6 mt-unit-8">
            <h1 className="text-[48px] leading-[56px] font-bold tracking-[-0.02em] text-on-surface max-w-4xl">
              Your codebase, finally understood.
            </h1>
            <p className="text-[16px] leading-[24px] text-on-surface-variant max-w-2xl">
              Paste a GitHub URL. Get an architecture map, a bug-risk heatmap, and an AI that actually knows your code.
            </p>

            {/* Command Palette Input */}
            <form onSubmit={handleAnalyze} className="mt-unit-8 w-full max-w-2xl bg-[#14141C] border border-[#24242F] rounded-lg p-unit-2 flex items-center gap-unit-2 transition-all duration-300 glow-violet-focus focus-within:border-[#8B5CF6] focus-within:shadow-[0_0_15px_1px_rgba(139,92,246,0.2)]">
              <span className="material-symbols-outlined text-outline ml-unit-2" style={{ fontSize: '20px' }}>link</span>
              <input
                className="flex-1 bg-transparent border-none text-on-surface font-mono text-[14px] focus:ring-0 placeholder:text-[#52525B] h-10 outline-none"
                placeholder="github.com/your-org/your-repo"
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
              />
              <button type="submit" className="bg-[#8B5CF6] text-white px-unit-6 h-10 rounded font-semibold text-sm hover:opacity-90 transition-opacity glow-violet flex items-center gap-unit-2 whitespace-nowrap">
                <span className="material-symbols-outlined text-sm" style={{ fontSize: '16px' }}>analytics</span>
                Analyze Repository
              </button>
            </form>

            {/* Trust Badges */}
            <div className="mt-unit-4 flex items-center gap-unit-4 text-outline font-mono text-[12px]">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>lock</span>
                SOC2 Type II
              </span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>speed</span>
                &lt; 2min parse
              </span>
            </div>
          </div>
        </section>

        {/* ── How it Works ── */}
        <section className="w-full max-w-container-max mx-auto px-gutter py-unit-8 flex flex-col items-center relative z-10">
          <div className="text-center mb-unit-8">
            <h2 className="text-[32px] leading-[40px] font-semibold tracking-[-0.01em] text-on-surface">Three steps to clarity</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-unit-6 w-full">
            {[
              { num: '01', title: 'Paste', desc: 'Connect any public or private repository URL. We support standard Git auth.', color: 'text-primary', grad: 'from-[#8B5CF6]/5' },
              { num: '02', title: 'Parse', desc: 'Our engine analyzes ASTs, commit history, and dependencies in seconds.', color: 'text-[#00cbe6]', grad: 'from-[#00cbe6]/5' },
              { num: '03', title: 'Explore', desc: 'Navigate the generated architecture maps or ask the AI directly.', color: 'text-[#22D3EE]', grad: 'from-[#22D3EE]/5' },
            ].map((step) => (
              <div key={step.num} className="bg-[#14141C] border border-[#24242F] rounded-xl p-unit-6 flex flex-col items-center text-center gap-unit-4 hover:border-[#3F3F4E] transition-colors relative group">
                <div className={`absolute inset-0 bg-gradient-to-b ${step.grad} to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity`}></div>
                <div className={`w-12 h-12 rounded-full bg-[#1B1B26] border border-[#24242F] flex items-center justify-center relative z-10 ${step.color}`}>
                  <span className="font-mono text-[14px]">{step.num}</span>
                </div>
                <h3 className="text-[20px] leading-[28px] font-semibold text-on-surface relative z-10">{step.title}</h3>
                <p className="text-[14px] leading-[20px] text-on-surface-variant relative z-10">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features Bento Grid ── */}
        <section className="w-full max-w-container-max mx-auto px-gutter py-unit-8 mb-unit-8 relative z-10">
          <div className="mb-unit-8">
            <h2 className="text-[32px] leading-[40px] font-semibold tracking-[-0.01em] text-on-surface">Deep Technical Insight</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-unit-4 auto-rows-[300px]">
            {/* Architecture Map - large */}
            <div className="md:col-span-8 bg-[#14141C] border border-[#24242F] rounded-xl overflow-hidden flex flex-col relative group">
              <div className="p-unit-6 border-b border-[#24242F] bg-[#14141C] z-10">
                <div className="flex items-center gap-unit-2 mb-2">
                  <span className="material-symbols-outlined text-[#5de6ff]" style={{ fontSize: '20px' }}>account_tree</span>
                  <h3 className="text-[20px] font-semibold text-on-surface">Architecture Map</h3>
                </div>
                <p className="text-[14px] text-on-surface-variant max-w-md">Auto-generated interactive diagrams showing module dependencies and data flow.</p>
              </div>
              <div className="flex-1 bg-[#0A0A0F] relative overflow-hidden flex items-center justify-center p-4">
                <div className="relative w-full h-full border border-[#24242F] rounded bg-[#1B1B26] flex items-center justify-center">
                  <div className="absolute w-[2px] h-20 bg-[#24242F] top-10 left-1/4 transform -rotate-45"></div>
                  <div className="absolute w-[2px] h-24 bg-[#24242F] top-1/2 right-1/3 transform rotate-45"></div>
                  <div className="absolute w-32 h-[2px] bg-[#24242F] bottom-1/4 left-1/3"></div>
                  <div className="absolute top-10 left-1/4 w-3 h-3 rounded-full bg-[#22D3EE] shadow-[0_0_10px_#22D3EE]"></div>
                  <div className="absolute top-1/3 left-1/2 w-4 h-4 rounded-full bg-primary shadow-[0_0_15px_#d0bcff]"></div>
                  <div className="absolute bottom-1/4 right-1/4 w-3 h-3 rounded-full bg-[#22D3EE]"></div>
                  <div className="absolute bottom-10 left-1/3 w-3 h-3 rounded-full bg-outline"></div>
                </div>
              </div>
            </div>

            {/* Repo Chat */}
            <div className="md:col-span-4 bg-[#14141C] border border-[#24242F] rounded-xl overflow-hidden flex flex-col">
              <div className="p-unit-6 border-b border-[#24242F] bg-[#14141C]">
                <div className="flex items-center gap-unit-2 mb-2">
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: '20px' }}>forum</span>
                  <h3 className="text-[20px] font-semibold text-on-surface">Repo Chat</h3>
                </div>
              </div>
              <div className="flex-1 bg-[#0A0A0F] p-unit-4 flex flex-col gap-unit-2">
                <div className="bg-[#1B1B26] border border-[#24242F] rounded-lg p-unit-2 max-w-[80%] self-end">
                  <p className="text-[14px] text-on-surface">Where is the auth middleware configured?</p>
                </div>
                <div className="bg-surface border border-primary/20 rounded-lg p-unit-2 max-w-[90%] flex flex-col gap-1">
                  <p className="text-[14px] text-on-surface-variant">
                    Auth is managed in{' '}
                    <span className="bg-[#1B1B26] px-1 rounded font-mono text-[12px] text-[#5de6ff]">src/middleware/auth.ts</span>
                    {' '}using JWT.
                  </p>
                </div>
              </div>
            </div>

            {/* Bug Heatmap */}
            <div className="md:col-span-4 bg-[#14141C] border border-[#24242F] rounded-xl overflow-hidden flex flex-col">
              <div className="p-unit-6 border-b border-[#24242F] bg-[#14141C]">
                <div className="flex items-center gap-unit-2 mb-2">
                  <span className="material-symbols-outlined text-error" style={{ fontSize: '20px' }}>bug_report</span>
                  <h3 className="text-[20px] font-semibold text-on-surface">Bug Heatmap</h3>
                </div>
              </div>
              <div className="flex-1 bg-[#0A0A0F] p-unit-4 flex items-center justify-center">
                <div className="grid grid-cols-4 grid-rows-4 gap-1 w-[150px] h-[150px]">
                  {[0,20,0,0, 0,60,80,0, 40,0,0,0, 0,0,30,0].map((v, i) => (
                    <div key={i} className="rounded-sm" style={{
                      backgroundColor: v ? `rgba(255,180,171,${v/100})` : '#1B1B26',
                      boxShadow: v > 60 ? '0 0 8px rgba(255,180,171,0.4)' : 'none',
                    }} />
                  ))}
                </div>
              </div>
            </div>

            {/* Onboarding Checklist */}
            <div className="md:col-span-8 bg-[#14141C] border border-[#24242F] rounded-xl overflow-hidden flex flex-col">
              <div className="p-unit-6 border-b border-[#24242F] bg-[#14141C]">
                <div className="flex items-center gap-unit-2 mb-2">
                  <span className="material-symbols-outlined text-[#00cbe6]" style={{ fontSize: '20px' }}>rocket_launch</span>
                  <h3 className="text-[20px] font-semibold text-on-surface">Onboarding Context</h3>
                </div>
                <p className="text-[14px] text-on-surface-variant">Auto-generated documentation tailored to new hires.</p>
              </div>
              <div className="flex-1 bg-[#0A0A0F] p-unit-4 overflow-hidden">
                <div className="flex flex-col gap-unit-2">
                  {[
                    { done: true, text: 'Setup local environment (Docker)' },
                    { done: false, text: 'Review core database schema' },
                    { done: false, text: 'Understand critical path components' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-unit-3 bg-[#1B1B26] p-unit-3 rounded border border-[#24242F]">
                      <span className={`material-symbols-outlined text-sm ${item.done ? 'text-primary' : 'text-outline'}`} style={{ fontSize: '16px' }}>
                        {item.done ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                      <span className="font-mono text-[14px] text-on-surface">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full border-t border-[#24242F] bg-[#0A0A0F] py-unit-6 text-center">
        <p className="font-mono text-[12px] text-outline">© 2024 CodeCompass. High-density developer tooling.</p>
      </footer>
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { Play, Code2, FolderTree, Terminal, Bot, MoreVertical, Plus, Trash2, Smartphone, ChevronDown, RefreshCw, AlertTriangle, Shield, Activity, Cpu, Zap } from 'lucide-react';
import EditorView from './components/EditorView';
import TerminalView from './components/TerminalView';
import FileExplorer from './components/FileExplorer';
import LoginView from './components/LoginView';
import StorageMonitor from './components/StorageMonitor';
import { socket, sendEncrypted } from './utils/socket';
import { encryptPayload, decryptPayload } from './utils/crypto';

// Native SVGs
const GithubIcon = ({ color = "currentColor", size = 20, active = false }) => (
  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={active ? "var(--accent-color)" : "var(--text-muted)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path><path d="M9 18c-4.51 2-5-2-7-2"></path></svg>
    <div style={{ position: 'absolute', top: -1, right: -1, width: 6, height: 6, borderRadius: '50%', background: active ? 'var(--success)' : 'var(--danger)', boxShadow: active ? '0 0 8px var(--success)' : 'none', border: '1px solid black' }}></div>
  </div>
);

const GitlabIcon = ({ color = "currentColor", size = 20, active = false }) => (
  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={active ? "var(--warning)" : "var(--text-muted)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 13.29-3.33-10a.42.42 0 0 0-.14-.18.38.38 0 0 0-.22-.11.39.39 0 0 0-.23.07.42.42 0 0 0-.14.18l-2.26 6.67H8.32L6.06 3.27a.42.42 0 0 0-.14-.18.38.38 0 0 0-.22-.07.4.4 0 0 0-.23.07.42.42 0 0 0-.14.18L2 13.29a.74.74 0 0 0 .27.83L12 21l9.73-6.88a.74.74 0 0 0 .27-.83Z"></path></svg>
    <div style={{ position: 'absolute', top: -1, right: -1, width: 6, height: 6, borderRadius: '50%', background: active ? 'var(--success)' : 'var(--danger)', boxShadow: active ? '0 0 8px var(--success)' : 'none', border: '1px solid black' }}></div>
  </div>
);

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('ai');
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [gitAuth, setGitAuth] = useState({ github: true, gitlab: true });
  const [apiStatus, setApiStatus] = useState({ healthy: true, model: 'Multi-Engine' });
  const [GEMINI_API_KEY_VALID, setKeyValid] = useState(false);
  const [showStorageMonitor, setShowStorageMonitor] = useState(false);
  
  const MODELS = [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (推薦)' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Thinking)' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Lite' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (Legacy)' },
    { id: 'gemini-2.0-flash-thinking-exp', label: 'Gemini Thinking (Exp)' }
  ];
  const [selectedModel, setSelectedModel] = useState(MODELS[0]); // 穩定首選
  const [modelUsage, setModelUsage] = useState({
    'gemini-2.5-pro': { max: 1000, used: 0, reset: 'Stable' },
    'gemini-2.5-flash': { max: 5000, used: 0, reset: 'Stable' },
  });
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: "GravityLink v1.11 專業模型矩陣已就緒。" }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [code, setCode] = useState('// GravityLink Synchronized Protocol');
  const fileInputRef = useRef(null);

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    
    socket.on('ai_message', (enc) => {
      const p = decryptPayload(enc);
      if(p) {
        setChatMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && (last.text.includes('[') || last.text.includes('...'))) {
            const updated = [...prev];
            updated[updated.length - 1] = { ...last, text: p.text };
            return updated;
          }
          return [...prev, { role: p.role, text: p.text }];
        });
        if (p.text.includes('[NB 代理執行成功]') || p.text.includes('[代理連動失敗]') || p.text.includes('[錯誤]')) {
          setIsGenerating(false);
        }
      }
    });

    socket.on('system_status', (enc) => {
      const data = decryptPayload(enc);
      if (data) {
        if (data.git) setGitAuth(data.git);
        if (data.gemini) setApiStatus(data.gemini);
        if (data.usage) setModelUsage(data.usage);
        if (data.keyValid !== undefined) setKeyValid(data.keyValid);
      }
    });

    socket.on('auth_result', (enc) => {
      const res = decryptPayload(enc);
      if (res && res.success) setIsAuthenticated(true);
    });

    const handleVisible = () => {
      if (document.visibilityState === 'visible' && !socket.connected) socket.connect();
    };
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      socket.off('ai_message'); socket.off('system_status'); socket.off('auth_result');
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, []);

  const handleSendChat = () => {
    if (!chatInput.trim() || isGenerating) return;
    const msg = chatInput.trim();
    setChatMessages(prev => [...prev, { role: 'user', text: msg }, { role: 'assistant', text: '[主機通訊中...] 正在等待 NB 回應' }]);
    setIsGenerating(true);
    sendEncrypted('ai_request', { prompt: msg, modelId: selectedModel.id }, encryptPayload);
    setChatInput('');
  };

  if (!isAuthenticated) return (
    <div style={{ height: '100dvh', width: '100vw', background: 'var(--bg-color)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <LoginView onLoginSuccess={() => setIsAuthenticated(true)} />
    </div>
  );

  const usage = modelUsage[selectedModel.id] || { max: 100, used: 0, reset: '05/06 12:00' };
  const fillPct = Math.max(5, Math.min(100, Math.round(((usage.max - usage.used) / usage.max) * 100)));

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      
      <header className="glass-panel" style={{ 
        height: 'calc(60px + env(safe-area-inset-top))', paddingTop: 'env(safe-area-inset-top)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', zIndex: 1000
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Smartphone size={22} color={isGenerating ? "var(--success)" : "var(--accent-color)"} className={isGenerating ? "animate-pulse" : ""} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h1 style={{ fontSize: '1rem', fontWeight: '900', margin: 0, color: 'white' }}>GRAVITY LINK</h1>
            <span style={{ fontSize: '0.55rem', color: isGenerating ? 'var(--success)' : 'var(--text-muted)', fontWeight: 'bold' }}>
              {isGenerating ? 'HOST PROCESSING...' : 'STABLE PRO v1.11'}
            </span>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', gap: 12 }}>
             <GithubIcon size={20} active={gitAuth.github} />
             <GitlabIcon size={20} active={gitAuth.gitlab} />
          </div>
          <div style={{ display: 'flex', gap: 6, padding: '6px 12px', borderRadius: 14, background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-color)' }}>
            {[ 
              { id: 'nb-light', l: 'NB', s: isConnected }, 
              { id: 'ai-light', l: 'AI', s: apiStatus.healthy },
              { id: 'key-light', l: 'KEY', s: !!GEMINI_API_KEY_VALID } // 這裡會連動後端狀態
            ].map((n, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div id={n.id} style={{ width: 6, height: 6, borderRadius: '50%', background: n.s ? 'var(--success)' : 'var(--danger)', boxShadow: n.s ? '0 0 10px var(--success)' : 'none' }}></div>
                <span style={{ fontSize: '0.55rem', fontWeight: '900', color: n.s ? 'white' : 'var(--text-muted)' }}>{n.l}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {chatMessages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', background: m.role === 'user' ? 'var(--accent-color)' : 'var(--bg-panel)', padding: '14px 18px', borderRadius: '20px', marginBottom: '15px', maxWidth: '85%', border: '1px solid var(--border-color)', boxShadow: '0 8px 25px rgba(0,0,0,0.2)' }}>
                <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: '1.6', color: 'white' }}>{m.text}</p>
              </div>
            ))}
          </div>
          
          <div style={{ padding: '15px', background: 'var(--bg-panel)', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', background: 'var(--bg-color)', padding: '12px', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '50px' }}>
                <div className={`mana-orb-container ${isGenerating ? 'animate-pulse' : ''}`} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="mana-liquid" style={{ height: `${fillPct}%` }}></div>
                  <span style={{ position: 'absolute', fontSize: '0.6rem', fontWeight: '900', color: 'white', zIndex: 10 }}>{fillPct}%</span>
                </div>
                <span style={{ fontSize: '0.55rem', color: 'var(--accent-color)', marginTop: '6px', fontWeight: '900' }}>{usage.reset}</span>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="下達開發指令..." style={{ background: 'transparent', color: 'white', border: 'none', outline: 'none', fontSize: '17px', minHeight: '44px', resize: 'none' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div onClick={() => { const idx = MODELS.findIndex(m => m.id === selectedModel.id); setSelectedModel(MODELS[(idx + 1) % MODELS.length]); }} style={{ fontSize: '0.75rem', color: 'var(--accent-color)', border: '1px solid var(--accent-glow)', padding: '4px 12px', borderRadius: '10px', background: 'rgba(47,129,247,0.15)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {selectedModel.label} <ChevronDown size={12} />
                    </div>
                    <button onClick={handleSendChat} disabled={isGenerating} className="btn btn-primary" style={{ width: '42px', height: '42px', borderRadius: '14px', boxShadow: isGenerating ? 'none' : '0 0 15px var(--accent-glow)' }}>
                      <Play size={20} fill="white" />
                    </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <nav className="glass-panel" style={{ height: '60px', display: 'flex', justifyContent: 'space-around', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingBottom: 'env(safe-area-inset-bottom)', flexShrink: 0 }}>
        {[ { id: 'files', l: '檔案', i: FolderTree }, { id: 'editor', l: '編輯', i: Code2 }, { id: 'terminal', l: '終端', i: Terminal }, { id: 'ai', l: '助理', i: Bot } ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className="btn" style={{ flex: 1, color: activeTab === tab.id ? 'var(--accent-color)' : 'var(--text-muted)', flexDirection: 'column', gap: '5px', position: 'relative' }}>
            <tab.i size={22} />
            <span style={{ fontSize: '0.65rem', fontWeight: '800' }}>{tab.l}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

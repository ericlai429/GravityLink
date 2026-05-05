import React, { useState, useEffect, useRef } from 'react';
import { Play, Code2, FolderTree, Terminal, Bot, MoreVertical, Wifi, WifiOff, CheckCircle2, ImagePlus, ChevronDown, Database, GitBranch, Square, FileText, Check, X, Plus, Smartphone, Trash2 } from 'lucide-react';
import EditorView from './components/EditorView';
import TerminalView from './components/TerminalView';
import FileExplorer from './components/FileExplorer';
import LoginView from './components/LoginView';
import StorageMonitor from './components/StorageMonitor';
import { socket, sendEncrypted } from './utils/socket';
import { encryptPayload, decryptPayload } from './utils/crypto';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('editor');
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [showStorageMonitor, setShowStorageMonitor] = useState(false);
  const [gitAuth, setGitAuth] = useState({ github: false, gitlab: false });
  const [apiStatus, setApiStatus] = useState({ healthy: false, model: '' });
  const [isGitHubSyncing, setIsGitHubSyncing] = useState(false);
  const [isGitLabSyncing, setIsGitLabSyncing] = useState(false);
  
  const MODELS = ['Gemini 2.0 Flash (High)', 'Gemini 2.0 Flash Lite (Lite)', 'Gemini 1.5 Pro (Extreme)'];
  const [selectedModel, setSelectedModel] = useState(MODELS[0]);
  const [modelUsage, setModelUsage] = useState({
    'Gemini 2.0 Flash (High)': { max: 1000000, used: 150000, reset: '5/7 00:00' },
    'Gemini 2.0 Flash Lite (Lite)': { max: 5000000, used: 250000, reset: '5/7 08:00' },
    'Gemini 1.5 Pro (Extreme)': { max: 50000, used: 12000, reset: '5/7 12:00' },
  });
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(null);
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: "你好！我是 GravityLink 助理。您可以要求我修改檔案或執行任務。" }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [currentFile, setCurrentFile] = useState('App.jsx');
  const [code, setCode] = useState('// Welcome to GravityLink v1.11');
  const fileInputRef = useRef(null);

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('ai_message', (enc) => {
      const p = decryptPayload(enc);
      if(p) { setChatMessages(prev => [...prev, { role: p.role, text: p.text }]); setIsGenerating(false); }
    });
    socket.on('system_status', (enc) => {
      const data = decryptPayload(enc);
      if (data) {
        if (data.git) setGitAuth(data.git);
        if (data.gemini) setApiStatus(data.gemini);
      }
    });
    return () => {
      socket.off('connect'); socket.off('disconnect'); socket.off('ai_message'); socket.off('system_status');
    };
  }, []);

  const handleSendChat = () => {
    if (!chatInput.trim() || isGenerating) return;
    setChatMessages(prev => [...prev, { role: 'user', text: chatInput }]);
    setIsGenerating(true);
    sendEncrypted('ai_request', { prompt: chatInput, model: selectedModel }, encryptPayload);
    setChatInput('');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'editor': return <EditorView code={code} setCode={setCode} />;
      case 'terminal': return <TerminalView />;
      case 'files': return <FileExplorer />;
      case 'ai':
        return (
          <div className="ai-chat-container" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="chat-history" style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
              {chatMessages.map((msg, idx) => (
                <div key={idx} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', background: msg.role === 'user' ? 'var(--accent-color)' : 'var(--bg-glass)', padding: '10px', borderRadius: '10px', marginBottom: '8px', maxWidth: '85%', border: '1px solid var(--border-color)' }}>
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>{msg.text}</p>
                </div>
              ))}
              {isGenerating && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>AI 正在生成中...</div>}
            </div>
            <div className="chat-input-area" style={{ padding: '8px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-panel)' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', background: 'var(--bg-glass)', padding: '8px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '40px' }}>
                  <div className="mana-orb-container" style={{ width: '30px', height: '30px' }}><div className="mana-liquid" style={{ height: `${Math.round(((modelUsage[selectedModel].max - modelUsage[selectedModel].used)/modelUsage[selectedModel].max)*100)}%` }}></div></div>
                  <span style={{ fontSize: '0.4rem', color: 'var(--text-muted)', marginTop: '2px' }}>{modelUsage[selectedModel].reset}</span>
                </div>
                <textarea 
                  value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  placeholder="指令..." 
                  style={{ flex: 1, background: 'transparent', color: 'white', border: 'none', outline: 'none', fontSize: '16px', minHeight: '36px', resize: 'none' }}
                />
                <button onClick={handleSendChat} className="btn btn-primary" style={{ padding: '6px' }}><Play size={16} fill="white" /></button>
              </div>
            </div>
          </div>
        );
      default: return null;
    }
  };

  if (!isAuthenticated) return <LoginView onLoginSuccess={() => setIsAuthenticated(true)} />;

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--bg-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      
      {/* 1. Header (Notch-Aware) */}
      <header className="glass-panel" style={{ 
        position: 'absolute', top: 0, left: 0, right: 0, 
        height: 'calc(54px + env(safe-area-inset-top))', 
        paddingTop: 'env(safe-area-inset-top)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
        paddingLeft: '16px', paddingRight: '16px', 
        zIndex: 1000, borderBottom: '1px solid var(--border-color)', 
        background: 'var(--bg-glass)', backdropFilter: 'blur(15px)' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Smartphone size={18} color="var(--accent-color)" />
          <h1 style={{ fontSize: '0.85rem', fontWeight: '700', margin: 0 }}>GravityLink <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>v1.11</span></h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '5px' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: isConnected ? 'var(--success)' : 'var(--danger)' }}></div>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: apiStatus.healthy ? 'var(--success)' : 'var(--danger)' }}></div>
          </div>
          <button onClick={() => setShowStorageMonitor(true)} className="btn"><MoreVertical size={18} /></button>
        </div>
      </header>

      {/* 2. Main Content (Shifted for Notch) */}
      <main style={{ position: 'absolute', top: 'calc(54px + env(safe-area-inset-top))', bottom: 'calc(54px + env(safe-area-inset-bottom))', left: 0, right: 0, overflow: 'hidden' }}>
        {renderContent()}
      </main>

      {/* 3. Bottom Navigation (Fixed Bottom) */}
      <nav className="glass-panel" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '54px', display: 'flex', justifyContent: 'space-around', alignItems: 'center', borderTop: '1px solid var(--border-color)', background: 'var(--bg-glass)', backdropFilter: 'blur(15px)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <button onClick={() => setActiveTab('files')} className="btn" style={{ flex: 1, color: activeTab === 'files' ? 'var(--accent-color)' : 'var(--text-muted)', flexDirection: 'column', display: 'flex', alignItems: 'center', gap: '2px' }}><FolderTree size={18} /><span style={{ fontSize: '0.55rem' }}>檔案</span></button>
        <button onClick={() => setActiveTab('editor')} className="btn" style={{ flex: 1, color: activeTab === 'editor' ? 'var(--accent-color)' : 'var(--text-muted)', flexDirection: 'column', display: 'flex', alignItems: 'center', gap: '2px' }}><Code2 size={18} /><span style={{ fontSize: '0.55rem' }}>編輯</span></button>
        <button onClick={() => setActiveTab('terminal')} className="btn" style={{ flex: 1, color: activeTab === 'terminal' ? 'var(--accent-color)' : 'var(--text-muted)', flexDirection: 'column', display: 'flex', alignItems: 'center', gap: '2px' }}><Terminal size={18} /><span style={{ fontSize: '0.55rem' }}>終端</span></button>
        <button onClick={() => setActiveTab('ai')} className="btn" style={{ flex: 1, color: activeTab === 'ai' ? 'var(--accent-color)' : 'var(--text-muted)', flexDirection: 'column', display: 'flex', alignItems: 'center', gap: '2px' }}><Bot size={18} /><span style={{ fontSize: '0.55rem' }}>助理</span></button>
      </nav>

      {showStorageMonitor && <StorageMonitor onClose={() => setShowStorageMonitor(false)} gitAuth={gitAuth} apiStatus={apiStatus} />}
    </div>
  );
}

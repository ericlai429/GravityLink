import React, { useState, useEffect, useRef } from 'react';
import { Play, Code2, FolderTree, Terminal, Bot, MoreVertical, Wifi, WifiOff, CheckCircle2, ImagePlus, ChevronDown, Database, GitBranch, Square, FileText, Check, X, Plus, Smartphone, Trash2 } from 'lucide-react';
import EditorView from './components/EditorView';
import TerminalView from './components/TerminalView';
import FileExplorer from './components/FileExplorer';
import LoginView from './components/LoginView';
import StorageMonitor from './components/StorageMonitor';
import { socket, offlineBuffer, sendEncrypted } from './utils/socket';
import { encryptPayload, decryptPayload } from './utils/crypto';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [activeTab, setActiveTab] = useState('editor');
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'waiting'
  const saveTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const generationTimeoutRef = useRef(null);
  
  const [isUploading, setIsUploading] = useState(false);
  const [showStorageMonitor, setShowStorageMonitor] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [systemLogs, setSystemLogs] = useState([]);
  const [gitAuth, setGitAuth] = useState({ hasUser: false, username: '', hasRemote: false });
  const [apiStatus, setApiStatus] = useState({ online: false, healthy: false, model: '' });
  const [currentPort, setCurrentPort] = useState(3001); // Default from socket.js
  const lastPinRef = useRef(null); // Store PIN for auto-reauth
  const [isGitHubSyncing, setIsGitHubSyncing] = useState(false);
  const [isGitLabSyncing, setIsGitLabSyncing] = useState(false);
  
  // Antigravity UI & MP States
  const MODELS = [
    'Gemini 2.0 Flash (High)',
    'Gemini 2.0 Flash Lite (Lite)',
    'Gemini 1.5 Pro (Extreme)',
  ];
  const MOCK_QUOTAS = {
    'Gemini 2.0 Flash (High)': { max: 1000000, used: 150000, reset: '5/7 00:00' },
    'Gemini 2.0 Flash Lite (Lite)': { max: 5000000, used: 250000, reset: '5/7 08:00' },
    'Gemini 1.5 Pro (Extreme)': { max: 50000, used: 12000, reset: '5/7 12:00' },
  };
  
  const [selectedModel, setSelectedModel] = useState(MODELS[0]);
  const [modelUsage, setModelUsage] = useState(MOCK_QUOTAS);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(null); // e.g. { count: 1, type: 'File Edit' }
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: "你好！我是 GravityLink 助理。你可以要求我修改、刪除檔案，或是執行任何開發任務。", steps: [] }
  ]);
  const [chatInput, setChatInput] = useState('');
  
  const [currentFile, setCurrentFile] = useState('App.jsx');
  const [code, setCode] = useState(`// Welcome to GravityLink Mobile IDE
import React from 'react';

function HelloWorld() {
  return (
    <div className="container">
      <h1>Hello, GravityLink!</h1>
      <p>AES Encrypted Connection to AMD NB Server.</p>
    </div>
  );
}

export default HelloWorld;
`);

  const addLog = (text, type = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setSystemLogs(prev => [{ time, text, type }, ...prev].slice(0, 30));
  };

  const playSound = (type) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      if (type === 'send') {
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.05);
      } else {
        osc.frequency.setValueAtTime(660, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.05);
      }
      gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.1);
    } catch(e) {}
  };

  const vibrate = (p = 10) => { if ('vibrate' in navigator) navigator.vibrate(p); };

  // Socket Connection Handling
  useEffect(() => {
    const onConnect = () => {
      setIsConnected(true);
      
      // 1. Auto-Reauthenticate if we have a stored PIN
      if (lastPinRef.current) {
        console.log('[Auth] Attempting auto-reauth with stored PIN...');
        sendEncrypted('verify_pin', lastPinRef.current, encryptPayload);
      }

      // 2. Refresh Git Auth Status
      sendEncrypted('git_check_auth', {}, encryptPayload);

      // 3. Process offline code buffer if any
      while (offlineBuffer.length > 0) {
        const { event, payload } = offlineBuffer.shift();
        sendEncrypted(event, payload, encryptPayload);
      }

      // 2. Sync any pending connection error logs to the NB
      const pendingLogs = JSON.parse(localStorage.getItem('link_error_logs') || '[]');
      if (pendingLogs.length > 0) {
        sendEncrypted('report_error_logs', pendingLogs, encryptPayload);
        localStorage.removeItem('link_error_logs'); // clear after sending
      }
    };
    
    const onDisconnect = () => setIsConnected(false);
    
    const onSaveSuccess = () => {
      setSaveStatus('saved');
    };

    const onImageUploadSuccess = (encryptedFilename) => {
      setIsUploading(false);
      const filename = decryptPayload(encryptedFilename);
      alert(`Debug image uploaded: ${filename}`);
    };

    // Git sync result is handled by the second onGitSyncResult below

    // Listen for NB AI events (Mouthpiece Mode)
    const onAiStateChange = (encryptedPayload) => {
      const payload = decryptPayload(encryptedPayload);
      if (payload) setIsGenerating(payload.isGenerating);
    };

    const onAiMessage = (encryptedPayload) => {
      const payload = decryptPayload(encryptedPayload);
      if (payload) {
        setChatMessages(prev => [...prev, { role: payload.role, text: payload.text }]);
        if (typeof addLog === 'function') addLog(`AI: ${payload.text.substring(0, 30)}...`, 'ai');
        if (typeof playSound === 'function') playSound('receive');
        if (typeof vibrate === 'function') vibrate(20);
      }
    };

    const onGitSyncResult = (encryptedData) => {
      setIsGitHubSyncing(false);
      setIsGitLabSyncing(false);
      const data = decryptPayload(encryptedData);
      if (data) setChatMessages(prev => [...prev, { role: 'ai', text: `[Git] ${data.success ? '✅' : '❌'} ${data.message}` }]);
    };

    const onGitAuthStatus = (encryptedData) => {
      const data = decryptPayload(encryptedData);
      if (data) setGitAuth(data);
    };

    const onAiApprovalRequest = (encryptedReq) => {
      const req = decryptPayload(encryptedReq);
      setPendingApproval(req); 
      setIsGenerating(false);
    };

    const onAuthRequired = () => {
      console.log('[Auth] Server requested PIN. Resetting auth state.');
      setIsAuthenticated(false);
    };

    const onSystemStatus = (encryptedData) => {
      const data = decryptPayload(encryptedData);
      if (data) {
        if (data.git) setGitAuth(data.git);
        if (data.gemini) {
          setApiStatus(data.gemini);
          // If server reports warning/limited, trigger local cooldown
          if (data.gemini.warning) setCooldown(20);
        }
      }
    };

    socket.on('connect', onConnect);
    socket.on('auth_required', onAuthRequired);
    socket.on('disconnect', onDisconnect);
    socket.on('fs_write_success', onSaveSuccess);
    socket.on('image_upload_success', onImageUploadSuccess);
    socket.on('git_sync_result', onGitSyncResult);
    socket.on('git_auth_status', onGitAuthStatus);
    socket.on('ai_approval_request', onAiApprovalRequest);
    socket.on('ai_state_change', onAiStateChange);
    socket.on('ai_message', onAiMessage);
    socket.on('system_status', onSystemStatus);

    const handlePortHop = (e) => setCurrentPort(e.detail);
    window.addEventListener('port_hop', handlePortHop);
    return () => {
      socket.off('connect', onConnect);
      socket.off('auth_required', onAuthRequired);
      socket.off('disconnect', onDisconnect);
      socket.off('fs_write_success', onSaveSuccess);
      socket.off('image_upload_success', onImageUploadSuccess);
      socket.off('git_sync_result', onGitSyncResult);
      socket.off('git_auth_status', onGitAuthStatus);
      socket.off('ai_approval_request', onAiApprovalRequest);
      socket.off('ai_state_change', onAiStateChange);
      socket.off('ai_message', onAiMessage);
      socket.off('system_status', onSystemStatus);
      window.removeEventListener('port_hop', handlePortHop);
    };
  }, []);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  // Auto-Save Logic (Debounced)
  useEffect(() => {
    if (!isAuthenticated) return;
    
    setSaveStatus('waiting');
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      setSaveStatus('saving');
      sendEncrypted('fs_write', { path: currentFile, content: code }, encryptPayload);
    }, 1500); // 1.5 seconds after last keystroke

    return () => clearTimeout(saveTimeoutRef.current);
  }, [code, currentFile, isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <LoginView 
        onLoginSuccess={(email, pin) => {
          lastPinRef.current = pin;
          setUserEmail(email);
          setIsAuthenticated(true);
        }} 
      />
    );
  }

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = reader.result;
      const filename = `debug_${Date.now()}_${file.name}`;
      sendEncrypted('report_debug_image', { filename, base64Data }, encryptPayload);
    };
    reader.readAsDataURL(file);
  };

  const handleGitSync = (remote) => {
    if (!isConnected) {
      alert('無法同步：尚未連線至 NB。');
      return;
    }
    const msg = prompt('輸入備註訊息（留空自動產生）：');
    if (msg === null) return;

    if (remote === 'github') setIsGitHubSyncing(true);
    else setIsGitLabSyncing(true);
    sendEncrypted('git_sync', { remote, message: msg || `Mobile sync - ${new Date().toISOString()}` }, encryptPayload);
  };

  const handleClearChat = () => {
    if (window.confirm('確定要清除所有對話紀錄並重置 AI 上下文嗎？')) {
      setChatMessages([]);
      sendEncrypted('clear_chat', {}, encryptPayload);
    }
  };
  const handleSendChat = () => {
    if (!chatInput.trim() || isGenerating) return;
    
    if (cooldown > 0) {
      setChatMessages(prev => [...prev, { role: 'ai', text: `[系統] 請等待 ${cooldown} 秒後再試，避免觸發 API 頻率限制。` }]);
      return;
    }

    const input = chatInput.trim().toLowerCase();
    const originalInput = chatInput.trim();
    
    // Command: Save Now
    if (input === 'save' || input === 'save now') {
      setChatMessages(prev => [...prev, { role: 'user', text: originalInput }]);
      setChatInput('');
      setSaveStatus('saving');
      sendEncrypted('fs_write', { path: currentFile, content: code }, encryptPayload);
      setTimeout(() => {
        setChatMessages(prev => [...prev, { role: 'ai', text: `[System] 檔案 ${currentFile} 已成功強制存檔至 NB 端。` }]);
      }, 500);
      return;
    }
    
    // Connection guard
    if (!isConnected) {
      setChatMessages(prev => [...prev, 
        { role: 'user', text: originalInput },
        { role: 'ai', text: '[System] ❌ 目前未連線至 NB，指令已暫存。請確認連線後再試。' }
      ]);
      setChatInput('');
      return;
    }

    // Show user message immediately in local UI
    setChatMessages(prev => [...prev, { role: 'user', text: originalInput }]);
    setChatInput('');
    setIsGenerating(true);

    if (typeof playSound === 'function') playSound('send');
    if (typeof vibrate === 'function') vibrate(10);
    if (typeof addLog === 'function') addLog(`發送指令: ${originalInput.substring(0, 30)}`, 'user');

    // Emit AI request to NB (Pure Mouthpiece Mode)
    sendEncrypted('ai_request', { prompt: originalInput, model: selectedModel }, encryptPayload);
  };

  const handleApprovalResponse = (status) => {
    if (!pendingApproval) return;
    sendEncrypted('approval_response', { id: pendingApproval.id, status }, encryptPayload);
    setPendingApproval(null);
    if (status === 'accepted') setIsGenerating(true); // resume generation
  };

  const handleStopGeneration = () => {
    setIsGenerating(false);
    if (generationTimeoutRef.current) clearTimeout(generationTimeoutRef.current);
    setChatMessages(prev => [...prev, { role: 'ai', text: '[System] 生成已被使用者強制中斷。 (Generation Interrupted)' }]);
    sendEncrypted('ai_stop', {}, encryptPayload);
  };

  const handleLogin = (pin) => {
    lastPinRef.current = pin; // Store for re-auth
    sendEncrypted('verify_pin', pin, encryptPayload);
  };

  const cycleModel = () => {
    const currentIndex = MODELS.indexOf(selectedModel);
    setSelectedModel(MODELS[(currentIndex + 1) % MODELS.length]);
  };

  const currentQuota = modelUsage[selectedModel];
  const mpPercentage = Math.max(0, Math.min(100, ((currentQuota.max - currentQuota.used) / currentQuota.max) * 100));

  const renderContent = () => {
    switch (activeTab) {
      case 'editor':
        return <EditorView code={code} setCode={setCode} />;
      case 'terminal':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-panel)' }}>
            <div style={{ flex: 1, minHeight: '50%' }}>
              <TerminalView />
            </div>
            <div style={{ height: '120px', borderTop: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', padding: '8px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.7rem' }}>
              <div style={{ color: 'var(--accent-color)', marginBottom: '4px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Database size={12} /> 系統活動紀錄 (System Activity)
              </div>
              {systemLogs.length === 0 && <div style={{ color: 'var(--text-muted)' }}>尚無活動紀錄...</div>}
              {systemLogs.map((log, idx) => (
                <div key={idx} style={{ marginBottom: '2px', color: log.type === 'ai' ? '#8833ff' : log.type === 'user' ? 'var(--accent-color)' : 'var(--text-muted)' }}>
                  <span style={{ opacity: 0.5 }}>[{log.time}]</span> {log.text}
                </div>
              ))}
            </div>
          </div>
        );
      case 'ai':
        return (
          <div className="ai-chat-container">
            {/* Chat History Area */}
            <div className="chat-history">
              {chatMessages.map((msg, idx) => (
                <div key={idx} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', background: msg.role === 'user' ? 'var(--accent-color)' : 'var(--bg-glass)', color: msg.role === 'user' ? 'white' : 'var(--text-main)', padding: '12px 16px', borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px', border: msg.role === 'user' ? 'none' : '1px solid var(--border-color)', maxWidth: '85%' }}>
                  <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: '1.5' }}>{msg.text}</p>
                </div>
              ))}
              {isGenerating && !pendingApproval && (
                <div style={{ alignSelf: 'flex-start', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '8px 16px' }}>
                  <span className="animate-pulse">AI 生成中...</span>
                </div>
              )}
            </div>

            {/* Antigravity Input & Controls Area */}
            <div className="chat-input-area">
              
              {/* Approval Bar (Antigravity Style) */}
              {pendingApproval && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(47, 129, 247, 0.1)', border: '1px solid var(--accent-glow)', borderRadius: '12px', padding: '10px 14px', marginBottom: '4px', animation: 'slideUp 0.2s ease-out' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', fontSize: '0.9rem' }}>
                    <FileText size={16} color="var(--accent-color)" />
                    <span>{pendingApproval.count} 個檔案待確認修改</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleApprovalResponse('rejected')} className="btn" style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'transparent', color: 'var(--text-muted)' }}>全部拒絕</button>
                    <button onClick={() => handleApprovalResponse('accepted')} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '6px', gap: '4px' }}>全部同意 <ChevronDown size={14}/></button>
                  </div>
                </div>
              )}

              {/* Action Bar Container (Diablo Style) */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                
                {/* Left Widget Area (MP Orb) */}
                <div className="mana-orb-wrapper" style={{ paddingBottom: '4px' }}>
                  <div className="mana-orb-container">
                    <div className="mana-glare"></div>
                    <div className="mana-liquid" style={{ height: `${mpPercentage}%` }}></div>
                    <div className="mana-text">{Math.round(mpPercentage)}%</div>
                  </div>
                  <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textAlign: 'center', background: 'rgba(0,0,0,0.5)', padding: '2px 4px', borderRadius: '4px', marginTop: '4px' }}>
                    重置於 <br/> {modelUsage[selectedModel].reset}
                  </span>
                </div>

                {/* Antigravity Input Box */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-glass)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '12px' }}>
                  <textarea 
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
                    placeholder="輸入指令，或使用 @ 提及，/ 開啟工作流" 
                    disabled={isGenerating || pendingApproval}
                    style={{ width: '100%', minHeight: '60px', background: 'transparent', color: 'white', border: 'none', outline: 'none', fontSize: '0.95rem', resize: 'none' }}
                  />
                
                {/* Bottom Row of Input Box (Model Selector & Action Buttons) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button className="btn" onClick={() => fileInputRef.current?.click()} style={{ padding: '4px', color: 'var(--text-muted)' }} title="新增照片/上下文">
                      <Plus size={18} />
                    </button>
                    <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} ref={fileInputRef} onChange={handleImageUpload} />

                    {/* Model Selector */}
                    <div 
                      onClick={cycleModel}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)' }}
                      title="點擊切換模型"
                    >
                      <span style={{ fontSize: '0.85rem' }}>{selectedModel}</span>
                      <ChevronDown size={14} />
                    </div>
                    
                    {/* Clear History Button */}
                    <button 
                      className="btn" 
                      onClick={handleClearChat} 
                      style={{ padding: '4px', color: 'var(--text-muted)' }} 
                      title="清除對話紀錄 (重置 AI 額度)"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Send / Stop Button */}
                  {isGenerating ? (
                    <button onClick={handleStopGeneration} className="btn" style={{ background: 'rgba(218, 54, 51, 0.2)', padding: '8px', borderRadius: '8px' }}>
                      <Square size={16} color="var(--danger)" fill="var(--danger)" />
                    </button>
                  ) : (
                    <button 
                      onClick={handleSendChat} 
                      className="btn" 
                      disabled={cooldown > 0}
                      style={{ 
                        background: cooldown > 0 ? 'rgba(255,255,255,0.05)' : (chatInput.trim() ? 'white' : 'rgba(255,255,255,0.1)'), 
                        padding: '8px', 
                        borderRadius: '8px',
                        position: 'relative',
                        minWidth: '40px'
                      }}
                    >
                      {cooldown > 0 ? (
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--warning)' }}>{cooldown}s</span>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill={chatInput.trim() ? "black" : "var(--text-muted)"} xmlns="http://www.w3.org/2000/svg"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                      )}
                    </button>
                  )}
                </div>
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return <EditorView code={code} setCode={setCode} />;
    }
  };

  return (
    <>
      <div className={`app-container ${activeTab === 'files' ? 'hide-main' : ''}`} style={{ display: 'flex', flexDirection: 'row', height: '100%', width: '100%', backgroundColor: 'var(--bg-color)' }}>

      {/* Left Pane: File Explorer (Sidebar) */}
      <aside 
        className={activeTab === 'files' ? 'sidebar-active' : 'sidebar-hidden'}
        style={{ width: '33.33%', minWidth: '250px', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', height: '100%' }}
      >
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-glass)' }}>
          <h2 style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderTree size={18} color="var(--accent-color)" />
            專案結構
          </h2>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>唯讀模式（請透過 AI 進行修改）</p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <FileExplorer />
        </div>
      </aside>

      {/* Right Pane: Main Workspace */}
      <div className="main-workspace" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', width: '66.66%' }}>
        {/* Header */}
      <header className="glass-panel app-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', background: 'linear-gradient(135deg, var(--accent-color), #8833ff)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <Smartphone size={20} color="white" />
            <div style={{ position: 'absolute', bottom: -2, right: -2, width: 10, height: 10, borderRadius: '50%', background: isConnected ? 'var(--success)' : 'var(--danger)', border: '2px solid var(--bg-panel)' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '1rem', fontWeight: '700', color: 'white', margin: 0 }}>GravityLink <span style={{ fontSize: '0.65rem', color: 'var(--accent-color)', background: 'rgba(47,129,247,0.1)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--accent-glow)' }}>v1.11 穩定版</span></h1>
              {isConnected ? <CheckCircle2 size={12} color="var(--success)" /> : <WifiOff size={12} color="var(--danger)" />}
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
              目前檔案: <span style={{ color: 'var(--accent-color)' }}>{currentFile}</span>
            </p>
          </div>
        </div>
        
        {/* Desktop/Tablet Header Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          
          {/* Quick Status Pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px', borderRadius: '20px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)' }}>
             <div style={{ width: 6, height: 6, borderRadius: '50%', background: isConnected ? 'var(--success)' : 'var(--danger)' }}></div>
             <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>{isConnected ? 'ONLINE' : 'OFFLINE'}</span>
          </div>

          {/* Unified Action Menu Trigger */}
          <div style={{ position: 'relative' }}>
            <button 
              className="btn" 
              onClick={() => setShowStorageMonitor(!showStorageMonitor)} 
              style={{ padding: '8px', background: 'var(--bg-glass)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
            >
              <MoreVertical size={20} />
            </button>
            
            {/* Quick Actions overlay when needed or just use the existing storage monitor as a gateway */}
          </div>

          <button className="btn btn-primary" style={{ padding: '8px 14px', gap: '6px', borderRadius: '8px' }}>
            <Play size={14} fill="white" />
            <span style={{ fontSize: '0.85rem' }}>啟動</span>
          </button>
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {renderContent()}
      </main>

      </div> {/* End Main Workspace */}

      {/* Global Bottom Navigation (Visible in all tabs) */}
      <nav className="glass-panel bottom-nav" style={{ 
        position: 'fixed', bottom: 0, left: 0, right: 0, 
        display: 'flex', justifyContent: 'space-around', 
        padding: '8px 0', borderTop: '1px solid var(--border-color)', 
        zIndex: 100, background: 'var(--bg-glass)', backdropFilter: 'blur(10px)' 
      }}>
        <button className="btn" onClick={() => setActiveTab('files')} style={{ flexDirection: 'column', gap: '4px', color: activeTab === 'files' ? 'var(--accent-color)' : 'var(--text-muted)', background: 'transparent' }}>
          <FolderTree size={20} />
          <span style={{ fontSize: '0.65rem' }}>檔案</span>
        </button>
        <button className="btn" onClick={() => setActiveTab('editor')} style={{ flexDirection: 'column', gap: '4px', color: activeTab === 'editor' ? 'var(--accent-color)' : 'var(--text-muted)', background: 'transparent' }}>
          <Code2 size={20} />
          <span style={{ fontSize: '0.65rem' }}>編輯</span>
        </button>
        <button className="btn" onClick={() => setActiveTab('terminal')} style={{ flexDirection: 'column', gap: '4px', color: activeTab === 'terminal' ? 'var(--accent-color)' : 'var(--text-muted)', background: 'transparent' }}>
          <Terminal size={20} />
          <span style={{ fontSize: '0.65rem' }}>終端</span>
        </button>
        <button className="btn" onClick={() => setActiveTab('ai')} style={{ flexDirection: 'column', gap: '4px', color: activeTab === 'ai' ? 'var(--accent-color)' : 'var(--text-muted)', background: 'transparent' }}>
          <Bot size={20} />
          <span style={{ fontSize: '0.65rem' }}>助理</span>
        </button>
      </nav>
    </div> {/* End App Container */}

    {showStorageMonitor && (
      <StorageMonitor 
        onClose={() => setShowStorageMonitor(false)} 
        gitAuth={gitAuth}
        apiStatus={apiStatus}
        onGitSync={handleGitSync}
        isGitHubSyncing={isGitHubSyncing}
        isGitLabSyncing={isGitLabSyncing}
      />
    )}
    </>
  );
}

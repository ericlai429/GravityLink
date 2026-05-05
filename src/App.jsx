import React, { useState, useEffect, useRef } from 'react';
import { Play, Code2, FolderTree, TerminalSquare, BotMessageSquare, MoreVertical, Wifi, WifiOff, CheckCircle2, ImagePlus, ChevronDown, Database, GitBranch, Square, FileText, Check, X, Plus, Smartphone } from 'lucide-react';
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
  const [isGitHubSyncing, setIsGitHubSyncing] = useState(false);
  const [isGitLabSyncing, setIsGitLabSyncing] = useState(false);
  const [gitAuth, setGitAuth] = useState({ hasUser: false, username: '', hasRemote: false });
  const [apiStatus, setApiStatus] = useState({ online: false, healthy: false, model: '' });
  const [currentPort, setCurrentPort] = useState(3001); // Default from socket.js
  const lastPinRef = useRef(null); // Store PIN for auto-reauth
  
  // Antigravity UI & MP States
  const MODELS = [
    'Gemini 3.1 Pro (High)',
    'Gemini 3.1 Pro (Low)',
    'Gemini 3 Flash',
    'Claude Sonnet 4.6 (Thinking)',
    'Claude Opus 4.6 (Thinking)',
    'GPT-OSS 120B (Medium)'
  ];
  const MOCK_QUOTAS = {
    'Gemini 3.1 Pro (High)': { max: 2000000, used: 850000, reset: '5/7 00:00' },
    'Gemini 3.1 Pro (Low)': { max: 2000000, used: 850000, reset: '5/7 08:00' },
    'Gemini 3 Flash': { max: 10000000, used: 1500000, reset: '5/7 12:00' },
    'Claude Sonnet 4.6 (Thinking)': { max: 200000, used: 20000, reset: '5/6 18:00' },
    'Claude Opus 4.6 (Thinking)': { max: 100000, used: 5000, reset: '5/6 22:00' },
    'GPT-OSS 120B (Medium)': { max: 500000, used: 420000, reset: '5/7 04:00' }
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
        if (data.gemini) setApiStatus(data.gemini);
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

  const handleSendChat = () => {
    if (!chatInput.trim() || isGenerating) return;

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
        return <TerminalView />;
      case 'ai':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--bg-panel)', position: 'relative' }}>
            


            {/* Chat History Area */}
            <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
            <div style={{ padding: '0 16px 16px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              
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
                  <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textAlign: 'center', background: 'rgba(0,0,0,0.5)', padding: '2px 4px', borderRadius: '4px', marginTop: '4px' }}>
                    重置於 <br/> {modelUsage[selectedModel].reset}
                  </div>
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
                    
                    {/* Model Selector (Antigravity Style - Interactive) */}
                    <div 
                      onClick={cycleModel}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)' }}
                      title="點擊切換模型"
                    >
                      <span style={{ fontSize: '0.85rem' }}>{selectedModel}</span>
                      <ChevronDown size={14} />
                    </div>
                  </div>

                  {/* Send / Stop Button */}
                  {isGenerating ? (
                    <button onClick={handleStopGeneration} className="btn" style={{ background: 'rgba(218, 54, 51, 0.2)', padding: '8px', borderRadius: '8px' }}>
                      <Square size={16} color="var(--danger)" fill="var(--danger)" />
                    </button>
                  ) : (
                    <button onClick={handleSendChat} className="btn" style={{ background: chatInput.trim() ? 'white' : 'rgba(255,255,255,0.1)', padding: '8px', borderRadius: '8px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill={chatInput.trim() ? "black" : "var(--text-muted)"} xmlns="http://www.w3.org/2000/svg"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
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
      <div className="landscape-prompt">
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Smartphone size={48} style={{ marginBottom: '16px', color: 'var(--accent-color)', transform: 'rotate(90deg)', animation: 'pulse 2s infinite' }} />
          <h2 style={{ margin: '0 0 8px 0', fontSize: '1.2rem' }}>請將手機轉為橫向</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>GravityLink 專為橫向開發設計</p>
        </div>
      </div>
      <div className="app-container" style={{ display: 'flex', flexDirection: 'row', height: '100%', width: '100%', backgroundColor: 'var(--bg-color)' }}>

      {/* Left Pane: 1/3 File Explorer (Read-Only) */}
      <aside style={{ width: '33.33%', minWidth: '250px', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', height: '100%' }}>
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

      {/* Right Pane: 2/3 Main Workspace */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', width: '66.66%' }}>
        {/* Header */}
      <header className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', background: 'linear-gradient(135deg, var(--accent-color), #8833ff)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <Smartphone size={20} color="white" />
            <div style={{ position: 'absolute', bottom: -2, right: -2, width: 10, height: 10, borderRadius: '50%', background: isConnected ? 'var(--success)' : 'var(--danger)', border: '2px solid var(--bg-panel)' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '1rem', fontWeight: '700', color: 'white', margin: 0 }}>GravityLink <span style={{ fontSize: '0.65rem', color: 'var(--accent-color)', background: 'rgba(47,129,247,0.1)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--accent-glow)' }}>v1.0.2 穩定版</span></h1>
              {isConnected ? <CheckCircle2 size={12} color="var(--success)" /> : <WifiOff size={12} color="var(--danger)" />}
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
              目前檔案: <span style={{ color: 'var(--accent-color)' }}>{currentFile}</span>
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          
          {/* Consolidated Status Lights */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '4px 12px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)' }}>
            {/* NB Connection */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title={isConnected ? '已連線至 NB' : '未連線'}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: isConnected ? 'var(--success)' : 'var(--danger)', boxShadow: isConnected ? '0 0 6px var(--success)' : 'none' }}></div>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>NB</span>
            </div>
            {/* Gemini API */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title={apiStatus.healthy ? `Gemini API 正常 (${apiStatus.model})` : 'Gemini API 離線'}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: apiStatus.healthy ? 'var(--success)' : apiStatus.online ? 'var(--warning)' : 'var(--danger)', boxShadow: apiStatus.healthy ? '0 0 6px var(--success)' : 'none' }}></div>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>AI</span>
            </div>
            {/* GitHub */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title={gitAuth.github ? 'GitHub 已連結' : 'GitHub 未連結'}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: gitAuth.github ? 'var(--success)' : 'var(--danger)', boxShadow: gitAuth.github ? '0 0 6px var(--success)' : 'none' }}></div>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>GitHub</span>
            </div>
            {/* GitLab */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title={gitAuth.gitlab ? 'GitLab 已連結' : 'GitLab 未連結'}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: gitAuth.gitlab ? 'var(--success)' : 'var(--danger)', boxShadow: gitAuth.gitlab ? '0 0 6px var(--success)' : 'none' }}></div>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>GitLab</span>
            </div>
          </div>

          {/* GitHub Backup */}
          <button 
            className="btn" 
            onClick={() => handleGitSync('github')} 
            disabled={isGitHubSyncing}
            style={{ padding: '5px 8px', borderRadius: '8px', background: 'var(--bg-glass)', border: '1px solid var(--border-color)', color: isGitHubSyncing ? 'var(--accent-color)' : 'var(--text-main)', opacity: isGitHubSyncing ? 0.5 : 1 }} 
            title="備份至 GitHub"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className={isGitHubSyncing ? 'animate-pulse' : ''}><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.02 0c2.3-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.82.58C20.57 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z"/></svg>
          </button>
          {/* GitLab Backup */}
          <button 
            className="btn" 
            onClick={() => handleGitSync('gitlab')} 
            disabled={isGitLabSyncing}
            style={{ padding: '5px 8px', borderRadius: '8px', background: 'var(--bg-glass)', border: '1px solid var(--border-color)', color: isGitLabSyncing ? 'var(--accent-color)' : 'var(--text-main)', opacity: isGitLabSyncing ? 0.5 : 1 }} 
            title="備份至 GitLab"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className={isGitLabSyncing ? 'animate-pulse' : ''}><path d="M23.6 9.59l-.03-.09-3.28-8.56a.87.87 0 0 0-.33-.36.89.89 0 0 0-1.01.12.87.87 0 0 0-.26.39l-2.21 6.78H7.53L5.32 1.09a.87.87 0 0 0-.26-.39.89.89 0 0 0-1.01-.12.87.87 0 0 0-.33.36L.44 9.5l-.03.09a6.2 6.2 0 0 0 2.06 7.17l.01.01.04.03 5.09 3.81 2.52 1.91 1.53 1.16a1.03 1.03 0 0 0 1.25 0l1.53-1.16 2.52-1.91 5.13-3.84.01-.01a6.2 6.2 0 0 0 2.06-7.17z"/></svg>
          </button>

          {/* Storage Monitor Toggle */}
          <button className="btn" onClick={() => setShowStorageMonitor(true)} style={{ padding: '4px', color: 'var(--text-muted)' }} title="存儲空間監控">
            <Database size={18} />
          </button>

          {/* Auto-Save Indicator */}
          {activeTab === 'editor' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: saveStatus === 'saved' ? 'var(--success)' : 'var(--text-muted)', fontSize: '0.75rem', marginRight: '4px' }}>
              {saveStatus === 'saved' ? (
                <><CheckCircle2 size={12} /> 已存檔</>
              ) : saveStatus === 'saving' ? (
                <span className="animate-pulse">存檔中...</span>
              ) : null}
            </div>
          )}

          <button className="btn btn-primary" style={{ padding: '8px 16px', gap: '6px' }}>
            <Play size={14} fill="white" />
            <span style={{ fontSize: '0.85rem' }}>啟動項目</span>
          </button>
        </div>
      </header>

        {/* Main Content Area */}
        <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {renderContent()}
        </main>

        {/* Bottom Navigation for Right Pane */}
        <nav className="glass-panel" style={{ display: 'flex', justifyContent: 'space-around', padding: '8px 0', borderTop: '1px solid var(--border-color)', zIndex: 10 }}>
          <button 
            className="btn" 
            onClick={() => setActiveTab('editor')}
            style={{ flexDirection: 'column', gap: '4px', color: activeTab === 'editor' ? 'var(--accent-color)' : 'var(--text-muted)', background: 'transparent', boxShadow: 'none' }}
          >
            <Code2 size={22} />
            <span style={{ fontSize: '0.7rem', fontWeight: '500' }}>編輯器</span>
          </button>
          <button 
            className="btn" 
            onClick={() => setActiveTab('terminal')}
            style={{ flexDirection: 'column', gap: '4px', color: activeTab === 'terminal' ? 'var(--accent-color)' : 'var(--text-muted)', background: 'transparent', boxShadow: 'none' }}
          >
            <TerminalSquare size={22} />
            <span style={{ fontSize: '0.7rem', fontWeight: '500' }}>控制台</span>
          </button>
          <button 
            className="btn" 
            onClick={() => setActiveTab('ai')}
            style={{ flexDirection: 'column', gap: '4px', color: activeTab === 'ai' ? 'var(--accent-color)' : 'var(--text-muted)', background: 'transparent', boxShadow: 'none' }}
          >
            <BotMessageSquare size={22} />
            <span style={{ fontSize: '0.7rem', fontWeight: '500' }}>AI 對話</span>
          </button>
        </nav>
      </div>

      {/* Storage Monitor Modal */}
      {showStorageMonitor && <StorageMonitor onClose={() => setShowStorageMonitor(false)} />}
      </div>
    </>
  );
}

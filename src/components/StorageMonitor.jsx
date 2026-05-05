import React, { useState, useEffect } from 'react';
import { Database, Trash2, X, HardDrive, GitBranch, Activity, Smartphone, CheckCircle2 } from 'lucide-react';

export default function StorageMonitor({ onClose, gitAuth, apiStatus, onGitSync, isGitHubSyncing, isGitLabSyncing }) {
  const [localStorageSize, setLocalStorageSize] = useState(0);
  const [cacheSize, setCacheSize] = useState(0);

  const calculateSize = async () => {
    let _lsTotal = 0;
    for (let x in localStorage) {
      if (!localStorage.hasOwnProperty(x)) continue;
      _lsTotal += ((localStorage[x].length + x.length) * 2);
    }
    setLocalStorageSize(_lsTotal);

    if ('caches' in window) {
      try {
        let _cacheTotal = 0;
        if (navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          if (estimate.usage) _cacheTotal = estimate.usage;
        }
        setCacheSize(_cacheTotal);
      } catch (err) {}
    }
  };

  useEffect(() => {
    calculateSize();
    const interval = setInterval(calculateSize, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="glass-panel animate-slide-up" style={{ width: '100%', maxWidth: '400px', padding: '24px', borderRadius: '20px', border: '1px solid var(--border-color)', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Activity size={20} color="var(--accent-color)" />
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700' }}>系統控制中心</h3>
          </div>
          <button onClick={onClose} className="btn" style={{ padding: '4px' }}><X size={24} /></button>
        </div>

        {/* Section 1: Git & Backup */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px', display: 'block' }}>代碼備份與同步</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button 
              onClick={() => onGitSync('github')}
              disabled={isGitHubSyncing}
              className="btn" 
              style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '12px', flexDirection: 'column', gap: '8px', opacity: isGitHubSyncing ? 0.5 : 1 }}
            >
              <GitBranch size={20} color={gitAuth.github ? 'var(--success)' : 'var(--text-muted)'} />
              <span style={{ fontSize: '0.75rem' }}>GitHub</span>
            </button>
            <button 
              onClick={() => onGitSync('gitlab')}
              disabled={isGitLabSyncing}
              className="btn" 
              style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '12px', flexDirection: 'column', gap: '8px', opacity: isGitLabSyncing ? 0.5 : 1 }}
            >
              <GitBranch size={20} color={gitAuth.gitlab ? 'var(--success)' : 'var(--text-muted)'} />
              <span style={{ fontSize: '0.75rem' }}>GitLab</span>
            </button>
          </div>
        </div>

        {/* Section 2: AI & System Status */}
        <div style={{ marginBottom: '24px', padding: '14px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
               <CheckCircle2 size={14} /> AI 狀態
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 'bold' }}>{apiStatus.model || 'Ready'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
               <Smartphone size={14} /> 手機快取
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--accent-color)' }}>{formatBytes(cacheSize + localStorageSize)}</span>
          </div>
        </div>

        {/* Section 3: Maintenance */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={onClose}
            className="btn" 
            style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '12px', fontSize: '0.9rem' }}
          >
            關閉
          </button>
          <button 
            onClick={() => { if(window.confirm('確定清除快取？')) { localStorage.clear(); window.location.reload(); } }}
            className="btn" 
            style={{ padding: '12px', background: 'rgba(218, 54, 51, 0.1)', color: 'var(--danger)', border: '1px solid rgba(218, 54, 51, 0.2)', borderRadius: '12px' }}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

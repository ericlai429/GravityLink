import React, { useState, useEffect } from 'react';
import { Database, Trash2, X, HardDrive } from 'lucide-react';

export default function StorageMonitor({ onClose }) {
  const [localStorageSize, setLocalStorageSize] = useState(0);
  const [cacheSize, setCacheSize] = useState(0);

  const calculateSize = async () => {
    // 1. Calculate LocalStorage Size
    let _lsTotal = 0;
    for (let x in localStorage) {
      if (!localStorage.hasOwnProperty(x)) continue;
      _lsTotal += ((localStorage[x].length + x.length) * 2); // roughly 2 bytes per char
    }
    setLocalStorageSize(_lsTotal);

    // 2. Estimate Cache Storage (Service Worker PWA UI Assets)
    if ('caches' in window) {
      try {
        let _cacheTotal = 0;
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          const cache = await caches.open(name);
          const requests = await cache.keys();
          // We can't easily get exact byte size of all cached assets without fetching them all,
          // so we use a rough heuristic or just show the number of cached assets.
          // For a more exact size, we'd need StorageManager API.
          _cacheTotal += requests.length * 1024 * 50; // VERY rough estimate: 50kb per asset
        }
        
        // Use Storage API if available for more accurate quota
        if (navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          if (estimate.usage) {
            _cacheTotal = estimate.usage;
          }
        }
        setCacheSize(_cacheTotal);
      } catch (err) {
        console.error("Failed to estimate cache size", err);
      }
    }
  };

  useEffect(() => {
    calculateSize();
    // Refresh every 5 seconds while open
    const interval = setInterval(calculateSize, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleClearCache = async () => {
    const confirmClear = window.confirm(
      "您確定要釋放所有手機端的暫存資料嗎？\n\n這將清除離線日誌，並在下次重整時強制從 NB 重新下載介面資源。"
    );
    
    if (confirmClear) {
      // Clear LocalStorage (except specific settings if needed, but for now we clear error logs)
      localStorage.removeItem('link_error_logs');
      
      // Clear Service Worker Caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
      
      alert('手機存儲空間與 PWA 緩存已成功釋放。');
      calculateSize();
      window.location.reload(); // Force reload to fetch fresh UI from NB
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel" style={{ width: '90%', maxWidth: '350px', padding: '24px', borderRadius: '16px', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <X size={20} />
        </button>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Database size={20} color="var(--accent-color)" />
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>手機空間監控</h3>
        </div>

        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: '1.4' }}>
          GravityLink 以薄客戶端模式運行。核心代碼僅存儲於您的 NB 主機，下方顯示的數據代表緩存的介面資源與用於網路韌性的臨時離線日誌。
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HardDrive size={16} color="var(--text-muted)" />
              <span style={{ fontSize: '0.9rem' }}>離線錯誤日誌</span>
            </div>
            <span style={{ fontWeight: '600', color: 'var(--accent-color)' }}>{formatBytes(localStorageSize)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={16} color="var(--text-muted)" />
              <span style={{ fontSize: '0.9rem' }}>介面資源緩存 (PWA)</span>
            </div>
            <span style={{ fontWeight: '600', color: 'var(--success)' }}>{formatBytes(cacheSize)}</span>
          </div>
        </div>

        <button 
          onClick={handleClearCache}
          className="btn" 
          style={{ width: '100%', padding: '12px', background: 'rgba(218, 54, 51, 0.1)', color: 'var(--danger)', border: '1px solid rgba(218, 54, 51, 0.3)', borderRadius: '8px', gap: '8px', fontWeight: '500' }}
        >
          <Trash2 size={16} />
          清除手機暫存空間
        </button>
      </div>
    </div>
  );
}

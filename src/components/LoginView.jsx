import React, { useState, useEffect } from 'react';
import { ShieldCheck, Wifi, KeyRound } from 'lucide-react';
import { socket, sendEncrypted } from '../utils/socket';
import { encryptPayload, decryptPayload } from '../utils/crypto';

export default function LoginView({ onLoginSuccess }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    const handleAuthResult = (encryptedResult) => {
      setIsVerifying(false);
      const result = decryptPayload(encryptedResult);
      if (result && result.success) {
        onLoginSuccess('Anydesk Auth', pin); // Pass pin back to App
      } else {
        setError(result?.message || '驗證失敗');
      }
    };

    socket.on('auth_result', handleAuthResult);
    return () => socket.off('auth_result', handleAuthResult);
  }, [onLoginSuccess]);

  const handleConnect = (e) => {
    e.preventDefault();
    if (!pin) {
      setError('請輸入 6 位數密碼');
      return;
    }
    if (!socket.connected) {
      setError('尚未連線至 NB 伺服器');
      return;
    }
    
    setIsVerifying(true);
    setError('');
    sendEncrypted('verify_pin', pin, encryptPayload);
  };

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
      <div className="glass-panel" style={{ padding: '40px', borderRadius: '24px', maxWidth: '380px', width: '90%', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
        
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(47, 129, 247, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', border: '1px solid var(--accent-glow)' }}>
          <ShieldCheck size={32} color="var(--accent-color)" />
        </div>

        <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '8px', background: 'linear-gradient(180deg, #fff, #8b949e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          GravityLink 安全連線
        </h1>
        
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '32px', lineHeight: '1.5' }}>
          請輸入 6 位數無人值守存取密碼，安全地連結至您的 NB 主機。
        </p>

        <form onSubmit={handleConnect} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ position: 'relative' }}>
            <KeyRound size={20} color="var(--text-muted)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text" 
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="請輸入存取密碼" 
              style={{ width: '100%', padding: '16px 16px 16px 48px', borderRadius: '12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: 'white', fontSize: '1rem', textAlign: 'center', outline: 'none' }}
              disabled={isVerifying}
            />
          </div>

          {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: 0 }}>{error}</p>}

          <button 
            type="submit"
            className="btn btn-primary" 
            style={{ width: '100%', padding: '14px', borderRadius: '12px', fontSize: '1rem', fontWeight: '600', display: 'flex', justifyContent: 'center', marginTop: '8px' }}
            disabled={isVerifying}
          >
            {isVerifying ? '驗證中...' : '連結至 NB 主機'}
          </button>
        </form>

        <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          <Wifi size={14} color={socket.connected ? "var(--success)" : "var(--danger)"} />
          {socket.connected ? "伺服器已連線 (AES-256 加密)" : "正在等待伺服器響應..."}
        </div>
      </div>
    </div>
  );
}

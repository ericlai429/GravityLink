import { io } from 'socket.io-client';
import { encryptPayload } from './crypto';

export const FALLBACK_PORTS = [3001, 8080, 8443];
let currentPortIndex = 0;

const getUrl = () => {
  // 強制使用與當前網頁一致的協議 (通常是 http)
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const hostname = window.location.hostname || 'localhost';
  return `${protocol}//${hostname}:${FALLBACK_PORTS[currentPortIndex]}`;
};

export const socket = io(getUrl(), {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
  timeout: 15000,
  // 繞過安全檢查的關鍵參數
  rejectUnauthorized: false,
  secure: window.location.protocol === 'https:'
});

let isHopping = false;
const hopToNextPort = () => {
  if (isHopping) return;
  isHopping = true;
  currentPortIndex = (currentPortIndex + 1) % FALLBACK_PORTS.length;
  console.log(`[Network] Security Block? Hopping to ${FALLBACK_PORTS[currentPortIndex]}...`);
  
  window.dispatchEvent(new CustomEvent('port_hop', { detail: FALLBACK_PORTS[currentPortIndex] }));

  setTimeout(() => {
    socket.io.uri = getUrl();
    socket.connect();
    isHopping = false;
  }, 3000);
};

socket.on('connect_error', (err) => {
  console.error('[Network] Connection Error:', err.message);
  hopToNextPort();
});

export const sendEncrypted = (event, payload, encryptFn) => {
  if (socket.connected) {
    socket.emit(event, encryptFn(payload));
  }
};

socket.on('connect', () => console.log('[Network] Connected safely via', socket.io.uri));

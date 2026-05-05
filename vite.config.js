import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    // 暫時移除 PWA 以排除連線安全性封鎖問題
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // 確保不強制使用 HTTPS
    https: false
  }
});

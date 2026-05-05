import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        // Cache UI elements, JS, CSS, and static assets aggressively.
        // This ensures the frontend UI is stored locally on the phone and loads instantly,
        // preventing network congestion from causing missing UI assets.
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      manifest: {
        name: 'GravityLink IDE',
        short_name: 'GravityLink',
        description: 'Private Mobile AI Development Platform',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
      }
    })
  ],
});

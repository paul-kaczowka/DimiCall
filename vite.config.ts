import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // Proxy pour les requêtes d'authentification
      '/api/auth': {
        target: 'http://localhost:5173',
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('proxyRes', (proxyRes, req, res) => {
            // Forcer les en-têtes CORS corrects
            proxyRes.headers['access-control-allow-origin'] = 'http://localhost:5174';
            proxyRes.headers['access-control-allow-credentials'] = 'true';
          });
        }
      }
    }
  }
});

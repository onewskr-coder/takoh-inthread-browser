import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        onboarding: resolve(__dirname, 'onboarding.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        'threads-interceptor': resolve(__dirname, 'src/content-scripts/threads-interceptor.ts'),
        'threads-content': resolve(__dirname, 'src/content-scripts/threads-content.tsx'),
        'inthread-bridge': resolve(__dirname, 'src/content-scripts/inthread-bridge.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') {
            return 'background.js';
          }
          if (chunkInfo.name === 'threads-interceptor') {
            return 'content-scripts/threads-interceptor.js';
          }
          if (chunkInfo.name === 'threads-content') {
            return 'content-scripts/threads-content.js';
          }
          if (chunkInfo.name === 'inthread-bridge') {
            return 'content-scripts/inthread-bridge.js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            if (assetInfo.name.includes('threads-content')) {
              return 'content-scripts/threads-content.css';
            }
            return 'assets/[name]-[hash].css';
          }
          return 'assets/[name]-[hash].[ext]';
        }
      }
    }
  }
});

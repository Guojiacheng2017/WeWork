import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  base: './',
  resolve: { dedupe: ['react', 'react-dom'] },
  plugins: [react(), tailwindcss()],
  test: {
    exclude: ['node_modules/**', 'dist/**', 'app-runtime/**', 'desktop/**', 'server/**'],
  },
  server: {
    fs: { allow: [root] },
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/wework-api': {
        target: 'http://127.0.0.1:8791',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/wework-api/, ''),
      },
    },
  },
});

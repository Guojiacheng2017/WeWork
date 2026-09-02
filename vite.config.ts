import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  test: {
    exclude: ['node_modules/**', 'dist/**', 'app-runtime/**', 'desktop/**', 'server/**'],
  },
  server: {
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

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@liner/core': path.resolve(__dirname, '../../packages/liner-core/src/index'),
    },
  },
  server: {
    port: 5180,
    host: '127.0.0.1',
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});

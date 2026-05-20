import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
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

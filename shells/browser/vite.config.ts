import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { offlinePlugin } from './plugins/offline.ts';

export default defineConfig({
  plugins: [react(), offlinePlugin()],
  base: './',
  // Tauri expects a fixed port in development.
  server: { port: 5173, strictPort: true, fs: { allow: ['../..'] } },
  build: { outDir: 'dist', target: 'es2022', sourcemap: true },
  optimizeDeps: { exclude: ['sql.js'] },
});

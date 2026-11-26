import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { offlinePlugin } from './plugins/offline.ts';
import { musicAssetsPlugin } from './plugins/music-assets.ts';

export default defineConfig({
  plugins: [react(), musicAssetsPlugin(), offlinePlugin()],
  base: './',
  // Tauri expects a fixed port in development.
  server: { port: 5173, strictPort: true, fs: { allow: ['../..'] } },
  build: { outDir: 'dist', target: 'es2022', sourcemap: true },
  // sql.js is CommonJS: it must be pre-bundled in dev, or its default export is undefined and the app is blank.
  optimizeDeps: { include: ['sql.js'] },
  // The new-game history worker imports the app's modules as ES modules.
  worker: { format: 'es' },
});

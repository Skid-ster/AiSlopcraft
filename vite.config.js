import { defineConfig } from 'vite';

export default defineConfig({
  // relative base so the build works at any host/subpath (GitHub Pages)
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: { '/ws': { target: 'ws://127.0.0.1:8787', ws: true, changeOrigin: true } }
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
    proxy: { '/ws': { target: 'ws://127.0.0.1:8787', ws: true, changeOrigin: true } }
  },
  build: {
    rollupOptions: {
      output: {
        // Keep the engine separately cacheable from the frequently edited game.
        manualChunks: { three: ['three'] }
      }
    }
  }
});

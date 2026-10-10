import { defineConfig } from 'vite';

export default defineConfig({
  // relative base so the build works at any host/subpath (GitHub Pages)
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true
  }
});

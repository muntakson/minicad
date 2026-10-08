import { defineConfig } from 'vite';
export default defineConfig({
  root: '.',
  build: { outDir: 'dist' },
  server: { port: 3010, host: '0.0.0.0', allowedHosts: ['minicad.dnaboy.org'] },
});

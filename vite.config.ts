import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Relative base + HashRouter: the built app runs from any static host or sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5196, strictPort: true },
  preview: { port: 4196, strictPort: true },
  build: { chunkSizeWarningLimit: 1500 },
});

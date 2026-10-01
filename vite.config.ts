import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { speechProxy } from './server/speechProxy.ts';

// Relative base + HashRouter: the built app runs from any static host or sub-path.
// speechProxy() adds the same-origin /api/speech/* endpoints to `vite` and `vite preview` (keys from the server's
// environment / .env.local only; never `define`d, never in import.meta.env).
export default defineConfig({
  base: './',
  plugins: [react(), speechProxy()],
  server: { port: 5196, strictPort: true },
  preview: { port: 4196, strictPort: true },
  build: { chunkSizeWarningLimit: 1500 },
});

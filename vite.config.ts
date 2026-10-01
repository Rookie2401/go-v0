import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { speechProxy } from './server/speechProxy.ts';

// GoListen is deferred to V2 (see FEATURES in src/core/config.ts). While it is off the dev and preview servers expose
// no /api/speech/* endpoints. To work on V2: set this to true together with FEATURES.listen.
const LISTEN = false;

// Relative base + HashRouter: the built app runs from any static host or sub-path.
// speechProxy() (when enabled) adds the same-origin /api/speech/* endpoints to `vite` and `vite preview` (keys from
// the server's environment / .env.local only; never `define`d, never in import.meta.env).
export default defineConfig({
  base: './',
  plugins: [react(), ...(LISTEN ? [speechProxy()] : [])],
  server: { port: 5196, strictPort: true },
  preview: { port: 4196, strictPort: true },
  build: { chunkSizeWarningLimit: 1500 },
});

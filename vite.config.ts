import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { rightsGate } from './server/rightsGate.ts';
import { speechProxy } from './server/speechProxy.ts';

// GoListen is deferred to V2 (see FEATURES in src/core/config.ts). While it is off the dev and preview servers expose
// no /api/speech/* endpoints. To work on V2: set this to true together with FEATURES.listen.
const LISTEN = false;

// Relative base + HashRouter: the built app runs from any static host or sub-path.
// speechProxy() (when enabled) adds the same-origin /api/speech/* endpoints to `vite` and `vite preview` (keys from
// the server's environment / .env.local only; never `define`d, never in import.meta.env).
export default defineConfig({
  base: './',
  // rightsGate(): a production build leaves out every bundled document whose rights are unverified, and stops on a
  // document that claims a status without its evidence (src/ingest/rights.ts; `npm run rights:check` reports the same).
  plugins: [react(), rightsGate(), ...(LISTEN ? [speechProxy()] : [])],
  // The watcher stays out of the large data files that tools write while a dev server runs: a dictionary source being
  // downloaded or a dictionary being built (a thousand shards) locked files under the watcher and stopped the server
  // (EBUSY). They are static data: nothing in them is a module, and the built shards are served fresh on every request.
  server: {
    port: 5196, strictPort: true,
    watch: { ignored: ['**/data/dictionaries/**', '**/data/private/**', '**/data/research/**', '**/data/review/*/generated/**', '**/public/dict/**', '**/public/library/**'] },
  },
  preview: { port: 4196, strictPort: true },
  build: { chunkSizeWarningLimit: 1500 },
});

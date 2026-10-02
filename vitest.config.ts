import { defineConfig } from 'vitest/config';
// testTimeout: several tests import the whole bundled corpus (every course's texts) through the real importer, some of
// them twice; with five courses' texts that no longer fits the 5-second default on a busy machine.
export default defineConfig({ test: { include: ['test/**/*.test.ts', 'test/**/*.test.tsx'], environment: 'node', testTimeout: 20_000 } });

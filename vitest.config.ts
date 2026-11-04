import { readFileSync } from 'node:fs';
import { configDefaults, defineConfig } from 'vitest/config';
// testTimeout: several tests import the whole bundled corpus (every course's texts) through the real importer, some of
// them twice; with five courses' texts that no longer fits the 5-second default on a busy machine.
// GO_CI_NO_LOCAL_DATA=1 leaves out the files named in test/needs-local-data.txt: they read dictionaries or builds that are generated and untracked.
// `npm run gate` on a machine with the data runs everything.
const localOnly = process.env.GO_CI_NO_LOCAL_DATA === '1'
  ? readFileSync(new URL('./test/needs-local-data.txt', import.meta.url), 'utf8').split(/\r?\n/).map((l) => l.split('#')[0]!.trim()).filter(Boolean)
  : [];

export default defineConfig({ test: { include: ['test/**/*.test.ts', 'test/**/*.test.tsx'], exclude: [...configDefaults.exclude, ...localOnly], environment: 'node', testTimeout: 20_000 } });

// Measures what one answered GoReview card costs as the log grows (events read, events folded, milliseconds).
//   npx vite-node scripts/loadcheck/goreview/probe-fold.ts
// The measurement lives in test/loading/goreview.fold.probe.test.ts (it needs the jsdom app rig); it is skipped unless PROBE_FOLD=1.
import { spawnSync } from 'node:child_process';

const r = spawnSync('npx', ['vitest', 'run', 'test/loading/goreview.fold.probe.test.ts', '--reporter=basic'], {
  stdio: 'inherit', shell: true, env: { ...process.env, PROBE_FOLD: '1' },
});
process.exit(r.status ?? 1);

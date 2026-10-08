/**
 * npm run library:frequency (scripts/library-frequency.mts): Norwegian has no library and no dictionary, so it counts from the bundled
 * corpus and the ladder units alone and writes the sidecar by itself; --dry-run writes nothing; a bad language exits 1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runNode } from '../helpers/cli';
import { parseFrequencyText } from '../../src/dict';
import { tmpDir } from './helpers';

const cli = path.resolve('node_modules/vite-node/dist/cli.mjs');
const run = (...args: string[]) => runNode([cli, '--config', 'scripts/vite.config.ts', 'scripts/library-frequency.mts', ...args], { cwd: path.resolve('.'), timeout: 240_000 });
const root = tmpDir('go-libfreq-');
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('library:frequency', () => {
  it('rejects an unknown language', async () => {
    expect((await run('xx', '--dict', root)).status).toBe(1);
  }, 120_000);

  it('nb: counts the bundled corpus and the ladder (no library), writes frequency.json, leaves no manifest', async () => {
    const dict = path.join(root, 'dict');
    const dry = await run('nb', '--dict', dict, '--dry-run', '--date', '2026-10-07');
    expect(dry.status).toBe(0);
    expect(dry.out).toContain('nothing written');
    expect(fs.existsSync(path.join(dict, 'nb', 'frequency.json'))).toBe(false);
    const r = await run('nb', '--dict', dict, '--date', '2026-10-07');
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/source ladder\s+data\/ladder\/nb\/units: \d+ texts/);
    const f = parseFrequencyText(fs.readFileSync(path.join(dict, 'nb', 'frequency.json'), 'utf8'), 'nb')!;
    expect(f.size).toBeGreaterThan(100);
    expect(f.builtAt).toBe('2026-10-07');
    expect(f.get('være')?.rank).toBeLessThan(10);
    expect(f.sources.some((s) => s.kind === 'library')).toBe(false);
    expect(fs.existsSync(path.join(dict, 'nb', 'manifest.json'))).toBe(false);
  }, 240_000);
});

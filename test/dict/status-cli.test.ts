/**
 * npm run dict:status — which dictionaries a build will ship. Runs before `vite build`, so it must never fail a build
 * for a missing dictionary unless one was required, and must fail for a dictionary that is half there.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runNode } from '../helpers/cli';
import { buildFixture, tmpDir, writeBuild } from './helpers';

const cli = path.resolve('node_modules/vite-node/dist/cli.mjs');
const run = (...args: string[]) => runNode([cli, 'scripts/dict-status.mts', ...args], { cwd: path.resolve('.'), timeout: 90_000 });

const root = tmpDir('go-dict-status-');
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('dict:status', () => {
  it('lists every language, says "none" where nothing is built, and exits 0', async () => {
    const empty = path.join(root, 'empty');
    fs.mkdirSync(empty, { recursive: true });
    const r = await run('--dir', empty);
    expect(r.status).toBe(0);
    for (const lang of ['es', 'sq', 'th', 'hi', 'de']) expect(r.out).toContain(`dict:status - ${lang}: none`);
  }, 120_000);

  it('describes a built dictionary: id, entries, shards, source file, licence', async () => {
    const dir = path.join(root, 'built');
    writeBuild(dir, buildFixture());
    const r = await run('--dir', dir);
    expect(r.status).toBe(0);
    const line = r.out.split('\n').find((l) => l.startsWith('dict:status - th:'))!;
    expect(line).toMatch(/kaikki-th@/);
    expect(line).toMatch(/entries · \d+ shards?, [\d.]+ MB/);
    expect(line).toMatch(/CC BY-SA/);
    expect(r.out).toContain('dict:status - es: none');
  }, 120_000);

  it('--require fails for a missing dictionary and passes for a present one', async () => {
    const dir = path.join(root, 'built');
    expect((await run('--dir', dir, '--require', 'th')).status).toBe(0);
    const r = await run('--dir', dir, '--require', 'th,es');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/required dictionary missing/);
  }, 120_000);

  it('fails when the manifest names shards that are not there', async () => {
    const dir = path.join(root, 'half');
    const langDir = writeBuild(dir, buildFixture());
    const shard = fs.readdirSync(langDir).find((n) => n.startsWith('s-'))!;
    fs.rmSync(path.join(langDir, shard));
    const r = await run('--dir', dir);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/1 shard file\(s\) named by the manifest are missing/);
  }, 120_000);
});

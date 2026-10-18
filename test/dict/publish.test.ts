/**
 * npm run dict:publish — check a built dictionary tree and publish it off GitHub Pages: dry run, manifest check, shards before
 * manifests, idempotent directory copy, gzip repack of the full shards, rsync/scp plan for a remote target.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { createFullRecordSource } from '../../src/dict';
import { buildFullFile } from '../../src/dict/build-full';
import { repackFull } from '../../src/dict/full-pack';
import { isRemoteTarget, planPublish, publish } from '../../src/dict/publish-node';
import { runNode } from '../helpers/cli';
import { FIXTURE, buildFixture, thNormalize, tmpDir, writeBuild } from './helpers';

const root = tmpDir('go-dict-publish-');
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

let n = 0;
/** A small tree: the th schema-3 dictionary and its full-2 records (plain shards), as `npm run dict:build` + `dict:build-full` leave public/dict. */
async function tree(): Promise<string> {
  const dir = path.join(root, `tree-${n++}`);
  writeBuild(dir, buildFixture());
  await buildFullFile({ input: FIXTURE, lang: 'th', outDir: dir, date: '2026-10-17', normalize: thNormalize, gzip: false });
  return dir;
}
const files = (dir: string): string[] => {
  const out: string[] = [];
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.push(path.relative(dir, p).replace(/\\/g, '/')); } };
  if (fs.existsSync(dir)) walk(dir);
  return out.sort();
};
const quiet = { log: () => undefined };

describe('dict:publish — check and plan', () => {
  it('plans every shard and manifest of a good tree, shards first and manifests last', async () => {
    const src = await tree();
    const plan = planPublish(src);
    expect(plan.errors).toEqual([]);
    expect(plan.summary.map((s) => s.lang)).toEqual(['th']);
    expect(plan.summary[0].full).toMatch(/^full-2 · \d+ records · \d+ shards$/);
    const manifests = plan.files.filter((f) => f.manifest).map((f) => f.rel);
    expect(manifests.sort()).toEqual(['full/manifest.json', 'manifest.json']);
    const firstManifest = plan.files.findIndex((f) => f.manifest);
    expect(plan.files.slice(firstManifest).every((f) => f.manifest)).toBe(true); // nothing but manifests after the first manifest
    expect(plan.files.every((f) => /^(manifest\.json|s-[0-9a-f]+\.json|frequency\.json|full\/(manifest\.json|f-[0-9a-f]+\.json))$/.test(f.rel))).toBe(true);
  });

  it('refuses a tree whose manifest names a shard that is not there, an empty shard, or a broken manifest', async () => {
    const a = await tree();
    const shard = fs.readdirSync(path.join(a, 'th')).find((f) => f.startsWith('s-'))!;
    fs.rmSync(path.join(a, 'th', shard));
    expect(planPublish(a).errors[0].message).toContain(`${shard} is named by a manifest but is not there`);
    const b = await tree();
    const fshard = fs.readdirSync(path.join(b, 'th', 'full')).find((f) => f.startsWith('f-'))!;
    fs.writeFileSync(path.join(b, 'th', 'full', fshard), '');
    expect(planPublish(b).errors.some((e) => e.message.includes(`full/${fshard} is empty`))).toBe(true);
    const c = await tree();
    fs.writeFileSync(path.join(c, 'th', 'full', 'manifest.json'), '{not json');
    expect(planPublish(c).errors.some((e) => e.message.startsWith('full/manifest.json cannot be read'))).toBe(true);
    const d = path.join(root, 'nothing-here');
    expect(planPublish(d).errors[0].message).toContain('does not exist');
  });

  it('reports a full shard no manifest names without sending it', async () => {
    const src = await tree();
    fs.writeFileSync(path.join(src, 'th', 'full', 'f-ff.json'), '{}');
    const plan = planPublish(src);
    expect(plan.errors).toEqual([]);
    expect(plan.warnings.some((w) => w.message.includes('not named by the manifest'))).toBe(true);
    expect(plan.files.some((f) => f.rel === 'full/f-ff.json')).toBe(false);
  });
});

describe('dict:publish — send', () => {
  it('a dry run checks, prints the plan and writes nothing (not even the destination folder)', async () => {
    const src = await tree();
    const dest = path.join(root, 'dest-dry');
    const lines: string[] = [];
    const r = publish({ src, dest, dryRun: true, log: (l) => lines.push(l) });
    expect(r.ok).toBe(true);
    expect(r.dryRun).toBe(true);
    expect(fs.existsSync(dest)).toBe(false);
    expect(lines.join('\n')).toMatch(/manifest check ok: \d+ files/);
    expect(lines.join('\n')).toContain('dry run: nothing was written');
  });

  it('copies a directory destination (idempotent), and a failed check sends nothing', async () => {
    const src = await tree();
    const dest = path.join(root, 'dest-dir');
    const r1 = publish({ src, dest, ...quiet });
    expect(r1.ok).toBe(true);
    expect(r1.copied).toBe(r1.plan.files.length);
    expect(files(dest)).toEqual(r1.plan.files.map((f) => `th/${f.rel}`).sort());
    for (const f of r1.plan.files) expect(fs.readFileSync(path.join(dest, 'th', f.rel)).equals(fs.readFileSync(f.abs))).toBe(true);
    expect(files(dest).some((f) => f.includes('.part-'))).toBe(false);
    const r2 = publish({ src, dest, ...quiet });
    expect(r2).toMatchObject({ ok: true, copied: 0, skipped: r1.plan.files.length });
    // the dictionary a host serves is usable as is
    const serve = (async (i: RequestInfo | URL) => {
      const p = path.join(dest, String(i).replace(/^https:\/\/host\.test\/dict\//, '').split('?')[0]);
      return fs.existsSync(p) ? new Response(fs.readFileSync(p), { status: 200 }) : new Response('', { status: 404 });
    }) as typeof fetch;
    const src2 = createFullRecordSource('th', { baseUrl: 'https://host.test/dict', fetch: serve });
    expect((await src2.info())?.counts.records).toBeGreaterThan(0);
    // a damaged tree sends nothing
    const bad = await tree();
    fs.rmSync(path.join(bad, 'th', 'manifest.json'));
    fs.writeFileSync(path.join(bad, 'th', 'manifest.json'), '{}');
    const out = path.join(root, 'dest-bad');
    const r3 = publish({ src: bad, dest: out, ...quiet });
    expect(r3.ok).toBe(false);
    expect(fs.existsSync(out)).toBe(false);
  });

  it('--prune removes dictionary shards the tree no longer has, and nothing else', async () => {
    const src = await tree();
    const dest = path.join(root, 'dest-prune');
    publish({ src, dest, ...quiet });
    fs.writeFileSync(path.join(dest, 'th', 's-ee.json'), '{}');
    fs.writeFileSync(path.join(dest, 'th', 'full', 'f-ee.json'), '{}');
    fs.writeFileSync(path.join(dest, 'th', 'notes.txt'), 'mine');
    const r = publish({ src, dest, prune: true, ...quiet });
    expect(r.removed).toBe(2);
    expect(fs.existsSync(path.join(dest, 'th', 'notes.txt'))).toBe(true);
    expect(fs.existsSync(path.join(dest, 'th', 's-ee.json'))).toBe(false);
  });

  it('--full-shards gzip stores f-xx.json.gz and a manifest that says so, leaves the source alone, and reads back the same records', async () => {
    const src = await tree();
    const before = files(src);
    const dest = path.join(root, 'dest-gz');
    const r = publish({ src, dest, fullShards: 'gzip', ...quiet });
    expect(r.ok).toBe(true);
    expect(files(src)).toEqual(before);
    const gz = files(dest).filter((f) => f.startsWith('th/full/f-'));
    expect(gz.length).toBeGreaterThan(0);
    expect(gz.every((f) => f.endsWith('.json.gz'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(dest, 'th/full/manifest.json'), 'utf8'))).toMatchObject({ schema: 'full-2', gzip: true });
    const reader = (dir: string) => createFullRecordSource('th', {
      baseUrl: 'https://host.test/dict',
      fetch: (async (i: RequestInfo | URL) => {
        const p = path.join(dir, String(i).replace(/^https:\/\/host\.test\/dict\//, '').split('?')[0]);
        return fs.existsSync(p) ? new Response(fs.readFileSync(p), { status: 200 }) : new Response('', { status: 404 });
      }) as typeof fetch,
    });
    const a = reader(src), b = reader(dest);
    const manifest = (await a.info())!;
    expect((await b.info())?.rev).toBe(manifest.rev); // rev hashes the shard text: both layouts share it
    const keys = fs.readFileSync(FIXTURE, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return (JSON.parse(l) as { word?: string }).word; } catch { return undefined; } }).filter((w): w is string => typeof w === 'string').map((w) => thNormalize(w));
    let found = 0;
    for (const k of keys) { const x = await a.lookup(k); if (x.length) found++; expect(await b.lookup(k)).toEqual(x); }
    expect(found).toBeGreaterThan(3);
    // and back to plain
    const plain = path.join(root, 'plain-again');
    const rp = repackFull(path.join(dest, 'th', 'full'), plain, false, 'th');
    expect(rp.gzip).toBe(false);
    for (const f of fs.readdirSync(plain).filter((x) => x.startsWith('f-'))) {
      expect(fs.readFileSync(path.join(plain, f)).equals(fs.readFileSync(path.join(src, 'th', 'full', f)))).toBe(true);
    }
    expect(zlib.gunzipSync(fs.readFileSync(path.join(dest, 'th/full', gz[0].replace('th/full/', '')))).length).toBeGreaterThan(0);
  });

  it('recognises a remote target and sends it through rsync, shards before manifests, falling back to scp', async () => {
    expect(isRemoteTarget('deploy@host.example:/srv/dict')).toBe(true);
    expect(isRemoteTarget('host:/srv/dict')).toBe(true);
    expect(isRemoteTarget('C:\\srv\\dict')).toBe(false);
    expect(isRemoteTarget('C:/srv/dict')).toBe(false);
    expect(isRemoteTarget('/srv/dict')).toBe(false);
    expect(isRemoteTarget('./dict')).toBe(false);
    const src = await tree();
    const calls: Array<{ cmd: string; args: string[]; list: string[] }> = [];
    const run = (cmd: string, args: string[]): number => {
      const at = args.indexOf('--files-from');
      calls.push({ cmd, args, list: at >= 0 ? fs.readFileSync(args[at + 1], 'utf8').split('\n').filter(Boolean) : [] });
      return 0;
    };
    const r = publish({ src, dest: 'deploy@host.example:/srv/dict', run, ...quiet });
    expect(r).toMatchObject({ ok: true, remote: true });
    expect(calls.every((c) => c.cmd === 'rsync')).toBe(true);
    const targets = calls.map((c) => c.args[c.args.length - 1]);
    expect(new Set(targets)).toEqual(new Set(['deploy@host.example:/srv/dict/th/', 'deploy@host.example:/srv/dict/th/full/']));
    const manifestCalls = calls.map((c, i) => (c.list.length === 1 && c.list[0] === 'manifest.json' ? i : -1)).filter((i) => i >= 0);
    expect(manifestCalls).toHaveLength(2);
    expect(Math.min(...manifestCalls)).toBeGreaterThan(calls.findIndex((c) => c.list.length > 1)); // shards went first
    const fallback: string[] = [];
    const r2 = publish({ src, dest: 'host:/srv/dict', run: (cmd) => { fallback.push(cmd); return cmd === 'rsync' ? 1 : 0; }, ...quiet });
    expect(r2.ok).toBe(true);
    expect(fallback).toContain('scp');
    const dry: string[] = [];
    publish({ src, dest: 'host:/srv/dict', dryRun: true, run: (cmd) => { dry.push(cmd); return 0; }, ...quiet });
    expect(dry).toEqual([]); // a dry run contacts nothing
  });
});

describe('dict:publish — the command', () => {
  const cli = path.resolve('node_modules/vite-node/dist/cli.mjs');
  it('reads DICT_PUBLISH_TARGET, dry-runs, and exits 2 with no destination and 1 on a failed check', async () => {
    const src = await tree();
    const dest = path.join(root, 'dest-cli');
    const run = (args: string[], env: Record<string, string> = {}) => runNode([cli, 'scripts/dict-publish.mts', ...args], { cwd: path.resolve('.'), timeout: 90_000, env: { ...process.env, ...env } as NodeJS.ProcessEnv });
    const dry = await run(['--src', src, '--dry-run'], { DICT_PUBLISH_TARGET: dest });
    expect(dry.status).toBe(0);
    expect(dry.out).toContain('dry run: nothing was written');
    expect(dry.out).toContain(dest);
    expect(fs.existsSync(dest)).toBe(false);
    const none = await run(['--src', src, '--dry-run'], { DICT_PUBLISH_TARGET: '' });
    expect(none.status).toBe(2);
    const missing = await run(['--src', path.join(root, 'nope'), '--dest', dest]);
    expect(missing.status).toBe(1);
  }, 120_000);
});

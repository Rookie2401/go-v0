/**
 * npm run dict:publish with the English -> target reverse index (src/dict/reverse.ts): the plan carries
 * <lang>/reverse/r-*.json before <lang>/reverse/manifest.json, only when the folder exists.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { DictionaryEntry } from '../../src/core';
import { planPublish, publish } from '../../src/dict/publish-node';
import { REVERSE_VERSION, createReverseBuilder, reverseShardName, type ReverseManifest } from '../../src/dict/reverse';
import { buildFixture, tmpDir, writeBuild } from './helpers';

const root = tmpDir('go-dict-publish-reverse-');
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

const quiet = { log: () => undefined };
const BUCKETS = 4;
let n = 0;

/** The th schema-3 dictionary plus, when asked, a reverse index beside it. */
function tree(withReverse: boolean): string {
  const dir = path.join(root, `tree-${n++}`);
  writeBuild(dir, buildFixture());
  if (withReverse) {
    const b = createReverseBuilder();
    for (const [form, gloss, rank] of [['น้ำ', 'water', 104], ['รด', 'to water', 1348], ['หอ', 'house', 1730], ['บ้าน', 'home', 300]] as const) {
      b.add({ form, lang: 'th', glosses: [gloss] } as DictionaryEntry, rank);
    }
    const { shards, heads } = b.finish(BUCKETS);
    const out = path.join(dir, 'th', 'reverse');
    fs.mkdirSync(out, { recursive: true });
    const shardFiles: string[] = [];
    for (const [bucket, shard] of [...shards].sort((x, y) => x[0] - y[0])) {
      const name = reverseShardName(bucket, BUCKETS);
      fs.writeFileSync(path.join(out, name), JSON.stringify(shard));
      shardFiles.push(name);
    }
    const manifest: ReverseManifest = { version: REVERSE_VERSION, lang: 'th', buckets: BUCKETS, heads, shardFiles, builtFrom: 'fixture' };
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest));
  }
  return dir;
}
const files = (dir: string): string[] => {
  const out: string[] = [];
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.push(path.relative(dir, p).replace(/\\/g, '/')); } };
  if (fs.existsSync(dir)) walk(dir);
  return out.sort();
};

describe('dict:publish — the reverse index', () => {
  it('plans reverse/r-*.json first and reverse/manifest.json last, after every shard', () => {
    const plan = planPublish(tree(true));
    expect(plan.errors).toEqual([]);
    const rel = plan.files.map((f) => f.rel);
    const shards = rel.filter((r) => /^reverse\/r-[0-9a-f]+\.json$/.test(r));
    expect(shards.length).toBeGreaterThan(0);
    expect(rel).toContain('reverse/manifest.json');
    const firstManifest = plan.files.findIndex((f) => f.manifest);
    expect(plan.files.slice(firstManifest).every((f) => f.manifest)).toBe(true); // nothing but manifests after the first manifest
    expect(rel.indexOf('reverse/manifest.json')).toBeGreaterThan(Math.max(...shards.map((s) => rel.indexOf(s))));
    expect(plan.summary[0].reverse).toMatch(/^\d+ heads · \d+ shards$/);
  });

  it('plans nothing extra when there is no reverse folder (every existing behaviour is kept)', () => {
    const plan = planPublish(tree(false));
    expect(plan.errors).toEqual([]);
    expect(plan.files.some((f) => f.rel.startsWith('reverse/'))).toBe(false);
    expect(plan.summary[0].reverse).toBeUndefined();
  });

  it('refuses a reverse manifest that names a missing shard, an unreadable one, and warns about a folder with no manifest or stray shards', () => {
    const a = tree(true);
    const shard = fs.readdirSync(path.join(a, 'th', 'reverse')).find((f) => f.startsWith('r-'))!;
    fs.rmSync(path.join(a, 'th', 'reverse', shard));
    expect(planPublish(a).errors[0].message).toContain(`reverse/${shard} is named by a manifest but is not there`);
    const b = tree(true);
    fs.writeFileSync(path.join(b, 'th', 'reverse', 'manifest.json'), '{not json');
    expect(planPublish(b).errors.some((e) => e.message.startsWith('reverse/manifest.json cannot be read'))).toBe(true);
    const c = tree(true);
    fs.rmSync(path.join(c, 'th', 'reverse', 'manifest.json'));
    const planC = planPublish(c);
    expect(planC.errors).toEqual([]);
    expect(planC.warnings.some((w) => w.message.includes('reverse/ has no manifest.json'))).toBe(true);
    expect(planC.files.some((f) => f.rel.startsWith('reverse/'))).toBe(false);
    const d = tree(true);
    fs.writeFileSync(path.join(d, 'th', 'reverse', 'r-ff.json'), '{}');
    const planD = planPublish(d);
    expect(planD.errors).toEqual([]);
    expect(planD.warnings.some((w) => w.message.includes('not named by the manifest'))).toBe(true);
    expect(planD.files.some((f) => f.rel === 'reverse/r-ff.json')).toBe(false);
  });

  it('copies the reverse index to a directory destination, and --prune removes only stale reverse shards', () => {
    const src = tree(true);
    const dest = path.join(root, 'dest');
    const r = publish({ src, dest, ...quiet });
    expect(r.ok).toBe(true);
    expect(files(dest).filter((f) => f.startsWith('th/reverse/')).length).toBeGreaterThan(1);
    expect(fs.readFileSync(path.join(dest, 'th', 'reverse', 'manifest.json'), 'utf8')).toBe(fs.readFileSync(path.join(src, 'th', 'reverse', 'manifest.json'), 'utf8'));
    expect(publish({ src, dest, ...quiet }).copied).toBe(0); // idempotent
    fs.writeFileSync(path.join(dest, 'th', 'reverse', 'r-ee.json'), '{}');
    fs.writeFileSync(path.join(dest, 'th', 'reverse', 'notes.txt'), 'mine');
    const pruned = publish({ src, dest, prune: true, ...quiet });
    expect(pruned.removed).toBe(1);
    expect(fs.existsSync(path.join(dest, 'th', 'reverse', 'r-ee.json'))).toBe(false);
    expect(fs.existsSync(path.join(dest, 'th', 'reverse', 'notes.txt'))).toBe(true);
  });

  it('sends the reverse index to a remote target in its own rsync group, shards before the manifest', () => {
    const src = tree(true);
    const calls: Array<{ args: string[]; list: string[] }> = [];
    const run = (_cmd: string, args: string[]): number => {
      const at = args.indexOf('--files-from');
      calls.push({ args, list: at >= 0 ? fs.readFileSync(args[at + 1], 'utf8').split('\n').filter(Boolean) : [] });
      return 0;
    };
    expect(publish({ src, dest: 'deploy@host.example:/srv/dict', run, ...quiet }).ok).toBe(true);
    const rev = calls.map((c, i) => ({ ...c, i })).filter((c) => c.args[c.args.length - 1] === 'deploy@host.example:/srv/dict/th/reverse/');
    expect(rev).toHaveLength(2);
    expect(rev[0].list.every((f) => /^r-[0-9a-f]+\.json$/.test(f))).toBe(true);
    expect(rev[1].list).toEqual(['manifest.json']);
    expect(rev[1].i).toBeGreaterThan(rev[0].i);
    // the top-level manifest also goes after every shard group
    expect(calls.findIndex((c) => c.list.length === 1 && c.list[0] === 'manifest.json' && c.args[c.args.length - 1].endsWith('/th/'))).toBeGreaterThan(rev[0].i);
  });
});

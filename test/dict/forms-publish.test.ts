/**
 * npm run dict:publish with the slim forms index (src/dict/forms.ts): the plan carries <lang>/forms/f-*.json before
 * <lang>/forms/manifest.json, only when the folder exists.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { DictionaryEntry } from '../../src/core';
import { FORMS_VERSION, createFormsBuilder, formsShardFile, type FormsManifest } from '../../src/dict/forms';
import { planPublish, publish } from '../../src/dict/publish-node';
import { buildFixture, tmpDir, writeBuild } from './helpers';

const root = tmpDir('go-dict-publish-forms-');
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

const quiet = { log: () => undefined };
const BUCKETS = 4;
let n = 0;

/** The th schema-3 dictionary plus, when asked, a forms index beside it. */
function tree(withForms: boolean): string {
  const dir = path.join(root, `tree-${n++}`);
  writeBuild(dir, buildFixture());
  if (withForms) {
    const b = createFormsBuilder();
    for (const form of ['น้ำ', 'รด', 'หอ', 'บ้าน', 'แมว', 'หมา', 'ปลา', 'นก']) b.add({ form, lang: 'th', glosses: [], pos: 'NOUN' } as DictionaryEntry);
    const { shards, forms, lemmas, fromTables } = b.finish(BUCKETS);
    const out = path.join(dir, 'th', 'forms');
    fs.mkdirSync(out, { recursive: true });
    const shardFiles: string[] = [];
    for (const [bucket, text] of [...shards].sort((x, y) => x[0] - y[0])) {
      const name = formsShardFile(bucket, BUCKETS);
      fs.writeFileSync(path.join(out, name), text);
      shardFiles.push(name);
    }
    const manifest: FormsManifest = { version: FORMS_VERSION, lang: 'th', buckets: BUCKETS, forms, lemmas, fromTables, shardFiles, builtFrom: 'fixture' };
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

describe('dict:publish — the forms index', () => {
  it('plans forms/f-*.json first and forms/manifest.json last, after every shard', () => {
    const plan = planPublish(tree(true));
    expect(plan.errors).toEqual([]);
    const rel = plan.files.map((f) => f.rel);
    const shards = rel.filter((r) => /^forms\/f-[0-9a-f]+\.json$/.test(r));
    expect(shards.length).toBeGreaterThan(0);
    expect(rel).toContain('forms/manifest.json');
    const firstManifest = plan.files.findIndex((f) => f.manifest);
    expect(plan.files.slice(firstManifest).every((f) => f.manifest)).toBe(true); // nothing but manifests after the first manifest
    expect(rel.indexOf('forms/manifest.json')).toBeGreaterThan(Math.max(...shards.map((s) => rel.indexOf(s))));
    expect(plan.summary[0].forms).toMatch(/^\d+ forms · \d+ shards$/);
  });

  it('plans nothing extra when there is no forms folder (every existing behaviour is kept)', () => {
    const plan = planPublish(tree(false));
    expect(plan.errors).toEqual([]);
    expect(plan.files.some((f) => f.rel.startsWith('forms/'))).toBe(false);
    expect(plan.summary[0].forms).toBeUndefined();
  });

  it('refuses a forms manifest that names a missing shard, an unreadable one, and warns about a folder with no manifest or stray shards', () => {
    const a = tree(true);
    const shard = fs.readdirSync(path.join(a, 'th', 'forms')).find((f) => f.startsWith('f-'))!;
    fs.rmSync(path.join(a, 'th', 'forms', shard));
    expect(planPublish(a).errors[0].message).toContain(`forms/${shard} is named by a manifest but is not there`);
    const b = tree(true);
    fs.writeFileSync(path.join(b, 'th', 'forms', 'manifest.json'), '{not json');
    expect(planPublish(b).errors.some((e) => e.message.startsWith('forms/manifest.json cannot be read'))).toBe(true);
    const b2 = tree(true);
    fs.writeFileSync(path.join(b2, 'th', 'forms', 'manifest.json'), JSON.stringify({ version: 9 }));
    expect(planPublish(b2).errors.some((e) => e.message === 'forms/manifest.json is not a readable forms-index manifest')).toBe(true);
    const c = tree(true);
    fs.rmSync(path.join(c, 'th', 'forms', 'manifest.json'));
    const planC = planPublish(c);
    expect(planC.errors).toEqual([]);
    expect(planC.warnings.some((w) => w.message.includes('forms/ has no manifest.json'))).toBe(true);
    expect(planC.files.some((f) => f.rel.startsWith('forms/'))).toBe(false);
    const d = tree(true);
    fs.writeFileSync(path.join(d, 'th', 'forms', 'f-ff.json'), '{}');
    const planD = planPublish(d);
    expect(planD.errors).toEqual([]);
    expect(planD.warnings.some((w) => w.message.includes('forms shard file(s) on disk are not named by the manifest'))).toBe(true);
    expect(planD.files.some((f) => f.rel === 'forms/f-ff.json')).toBe(false);
  });

  it('copies the forms index to a directory destination, and --prune removes only stale forms shards', () => {
    const src = tree(true);
    const dest = path.join(root, 'dest');
    const r = publish({ src, dest, ...quiet });
    expect(r.ok).toBe(true);
    expect(files(dest).filter((f) => f.startsWith('th/forms/')).length).toBeGreaterThan(1);
    expect(fs.readFileSync(path.join(dest, 'th', 'forms', 'manifest.json'), 'utf8')).toBe(fs.readFileSync(path.join(src, 'th', 'forms', 'manifest.json'), 'utf8'));
    expect(publish({ src, dest, ...quiet }).copied).toBe(0); // idempotent
    fs.writeFileSync(path.join(dest, 'th', 'forms', 'f-ee.json'), '{}');
    fs.writeFileSync(path.join(dest, 'th', 'forms', 'notes.txt'), 'mine');
    const pruned = publish({ src, dest, prune: true, ...quiet });
    expect(pruned.removed).toBe(1);
    expect(fs.existsSync(path.join(dest, 'th', 'forms', 'f-ee.json'))).toBe(false);
    expect(fs.existsSync(path.join(dest, 'th', 'forms', 'notes.txt'))).toBe(true);
  });

  it('sends the forms index to a remote target in its own rsync group, shards before the manifest', () => {
    const src = tree(true);
    const calls: Array<{ args: string[]; list: string[] }> = [];
    const run = (_cmd: string, args: string[]): number => {
      const at = args.indexOf('--files-from');
      calls.push({ args, list: at >= 0 ? fs.readFileSync(args[at + 1], 'utf8').split('\n').filter(Boolean) : [] });
      return 0;
    };
    expect(publish({ src, dest: 'deploy@host.example:/srv/dict', run, ...quiet }).ok).toBe(true);
    const grp = calls.map((c, i) => ({ ...c, i })).filter((c) => c.args[c.args.length - 1] === 'deploy@host.example:/srv/dict/th/forms/');
    expect(grp).toHaveLength(2);
    expect(grp[0].list.every((f) => /^f-[0-9a-f]+\.json$/.test(f))).toBe(true);
    expect(grp[1].list).toEqual(['manifest.json']);
    expect(grp[1].i).toBeGreaterThan(grp[0].i);
    expect(calls.findIndex((c) => c.list.length === 1 && c.list[0] === 'manifest.json' && c.args[c.args.length - 1].endsWith('/th/'))).toBeGreaterThan(grp[0].i);
  });

  it('carries the reverse index and the forms index side by side', () => {
    const dir = tree(true);
    fs.mkdirSync(path.join(dir, 'th', 'reverse'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'th', 'reverse', 'r-00.json'), '{"water":[["น้ำ","NOUN",1,0,0]]}');
    fs.writeFileSync(path.join(dir, 'th', 'reverse', 'manifest.json'), JSON.stringify({ version: 2, lang: 'th', buckets: 4, heads: 1, shardFiles: ['r-00.json'], builtFrom: 'fixture' }));
    const plan = planPublish(dir);
    expect(plan.errors).toEqual([]);
    const rel = plan.files.map((f) => f.rel);
    expect(rel).toContain('reverse/r-00.json');
    expect(rel).toContain('forms/manifest.json');
    expect(plan.summary[0].reverse).toBeDefined();
    expect(plan.summary[0].forms).toBeDefined();
  });
});

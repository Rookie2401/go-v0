/// <reference types="node" />
/**
 * Node-only: check a built dictionary tree (`public/dict`) and publish it to a destination that is NOT GitHub Pages: a
 * directory (a Caddy web root, a mounted volume) or an rsync/scp target (`user@host:/srv/dict`). The CLI is
 * scripts/dict-publish.mts (`npm run dict:publish`).
 *
 * What it does, in this order:
 *   1. CHECK  every language in the tree: the schema-3 manifest and its shard files, the optional frequency table, the
 *             full manifest (full-1 shardFiles, or the full-2 `occupied` bitmap) and every shard it names. A manifest that
 *             names a shard that is not there, a zero-byte file or a manifest that cannot be read is an error and nothing
 *             is published.
 *   2. PLAN   the files to send (only dictionary files: manifests, shards, frequency tables and, when there is a reverse/ or forms/ folder, the reverse index and the forms index), with their sizes.
 *   3. SEND   shards first, manifests last, so a reader that fetches a new manifest always finds the shards it names.
 *             A directory destination gets a temp-file-and-rename per file and is skipped file by file when the same bytes
 *             are already there; a remote destination goes through rsync (else scp). --dry-run does only 1 and 2.
 * Nothing is deleted at the destination unless asked (`prune`), and then only dictionary files the tree no longer has.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LANGUAGES, type LanguageCode } from '../core';
import { FULL_SCHEMA_2, FULL_SHARD_FILE, fullShardName, occupiedBuckets, parseFullManifest } from './full-format';
import { repackFull } from './full-pack';
import { SHARD_FILE, parseManifest } from './format';
import { FORMS_DIR, FORMS_MANIFEST, FORMS_SHARD_FILE, parseFormsManifest } from './forms';
import { REVERSE_DIR, REVERSE_MANIFEST, REVERSE_SHARD_FILE, parseReverseManifest } from './reverse';

export type FullShards = 'keep' | 'gzip' | 'plain';

export interface Problem { lang: string; message: string }
export interface PlanFile { lang: string; rel: string; abs: string; bytes: number; manifest: boolean }
export interface Plan {
  files: PlanFile[];
  errors: Problem[];
  warnings: Problem[];
  /** per language: schema-3 shards, full shards, bytes */
  summary: Array<{ lang: string; schema3?: string; full?: string; reverse?: string; forms?: string; files: number; bytes: number }>;
}

const sizeOf = (f: string): number => { try { return fs.statSync(f).size; } catch { return -1; } };
const readJson = (f: string): unknown => JSON.parse(fs.readFileSync(f, 'utf8')) as unknown;

/** Check and plan a tree. `langs` limits it (default: every language folder that exists). */
export function planPublish(src: string, langs?: readonly string[], fullDirs: Readonly<Record<string, string>> = {}): Plan {
  const plan: Plan = { files: [], errors: [], warnings: [], summary: [] };
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) { plan.errors.push({ lang: '-', message: `source folder ${src} does not exist` }); return plan; }
  const wanted = langs ?? LANGUAGES.filter((l) => fs.existsSync(path.join(src, l)));
  if (!wanted.length) plan.errors.push({ lang: '-', message: `no language folder under ${src}` });
  for (const lang of wanted) {
    const dir = path.join(src, lang);
    const err = (message: string) => plan.errors.push({ lang, message });
    const warn = (message: string) => plan.warnings.push({ lang, message });
    if (!fs.existsSync(dir)) { err(`no folder ${dir}`); continue; }
    const mine: PlanFile[] = [];
    const fullDir = fullDirs[lang] ?? path.join(dir, 'full');
    const add = (rel: string, manifest = false): boolean => {
      const abs = rel.startsWith('full/') ? path.join(fullDir, rel.slice(5)) : path.join(dir, rel);
      const bytes = sizeOf(abs);
      if (bytes < 0) { err(`${rel} is named by a manifest but is not there`); return false; }
      if (bytes === 0) { err(`${rel} is empty`); return false; }
      mine.push({ lang, rel: rel.replace(/\\/g, '/'), abs, bytes, manifest });
      return true;
    };
    const entry: Plan['summary'][number] = { lang, files: 0, bytes: 0 };
    // schema-3 shards
    const m3File = path.join(dir, 'manifest.json');
    if (fs.existsSync(m3File)) {
      try {
        const m = parseManifest(readJson(m3File), lang as LanguageCode);
        if (!m) err('manifest.json is not a readable dictionary manifest');
        else {
          if (!m.shardFiles.length) err('manifest.json names no shard files');
          for (const s of m.shardFiles) if (SHARD_FILE.test(s)) add(s);
          add('manifest.json', true);
          entry.schema3 = `schema ${m.schema} · ${m.entries.toLocaleString('en-US')} entries · ${m.shardFiles.length} shards`;
        }
      } catch (e) { err(`manifest.json cannot be read (${e instanceof Error ? e.message : String(e)})`); }
    } else warn('no schema-3 manifest.json (the lexicon is not published for this language)');
    if (fs.existsSync(path.join(dir, 'frequency.json'))) add('frequency.json');
    // full records
    const fFile = path.join(fullDir, 'manifest.json');
    if (fs.existsSync(fFile)) {
      try {
        const m = parseFullManifest(readJson(fFile), lang as LanguageCode);
        if (!m) err('full/manifest.json is not a readable full manifest');
        else {
          const names = m.schema === FULL_SCHEMA_2 && m.occupied
            ? occupiedBuckets(m.occupied, m.buckets).map((b) => fullShardName(b, m.buckets, m.gzip === true))
            : m.shardFiles;
          if (!names.length) err('full/manifest.json names no shard files');
          if (m.schema === FULL_SCHEMA_2 && (!m.rev || !m.occupied)) err('full-2 manifest lacks `rev` or `occupied`: rebuild it');
          for (const n of names) if (FULL_SHARD_FILE.test(n)) add(`full/${n}`);
          // files on disk that no manifest names are reported, never sent
          const have = fs.readdirSync(fullDir).filter((n) => FULL_SHARD_FILE.test(n));
          const extra = have.filter((n) => !names.includes(n));
          if (extra.length) warn(`${extra.length} full shard file(s) on disk are not named by the manifest and are not sent (e.g. ${extra[0]})`);
          add('full/manifest.json', true);
          entry.full = `${m.schema}${m.gzip ? ' gzip' : ''} · ${m.counts.records.toLocaleString('en-US')} records · ${names.length} shards`;
        }
      } catch (e) { err(`full/manifest.json cannot be read (${e instanceof Error ? e.message : String(e)})`); }
    } else warn('no full records (full/manifest.json)');
    // the English -> target reverse index (src/dict/reverse.ts): only when the folder exists; shards first, its manifest last
    const revDir = path.join(dir, REVERSE_DIR);
    if (fs.existsSync(revDir) && fs.statSync(revDir).isDirectory()) {
      const rFile = path.join(revDir, REVERSE_MANIFEST);
      if (!fs.existsSync(rFile)) warn(`${REVERSE_DIR}/ has no ${REVERSE_MANIFEST}: the reverse index is not sent`);
      else {
        try {
          const m = parseReverseManifest(readJson(rFile), lang as LanguageCode);
          if (!m) err(`${REVERSE_DIR}/${REVERSE_MANIFEST} is not a readable reverse-index manifest`);
          else {
            if (!m.shardFiles.length) err(`${REVERSE_DIR}/${REVERSE_MANIFEST} names no shard files`);
            for (const n of m.shardFiles) add(`${REVERSE_DIR}/${n}`);
            const extra = fs.readdirSync(revDir).filter((n) => REVERSE_SHARD_FILE.test(n) && !m.shardFiles.includes(n));
            if (extra.length) warn(`${extra.length} reverse shard file(s) on disk are not named by the manifest and are not sent (e.g. ${extra[0]})`);
            add(`${REVERSE_DIR}/${REVERSE_MANIFEST}`, true);
            entry.reverse = `${m.heads.toLocaleString('en-US')} heads · ${m.shardFiles.length} shards`;
          }
        } catch (e) { err(`${REVERSE_DIR}/${REVERSE_MANIFEST} cannot be read (${e instanceof Error ? e.message : String(e)})`); }
      }
    }
    // the slim forms index (src/dict/forms.ts): only when the folder exists; shards first, its manifest last
    const formsDir = path.join(dir, FORMS_DIR);
    if (fs.existsSync(formsDir) && fs.statSync(formsDir).isDirectory()) {
      const fFormsFile = path.join(formsDir, FORMS_MANIFEST);
      if (!fs.existsSync(fFormsFile)) warn(`${FORMS_DIR}/ has no ${FORMS_MANIFEST}: the forms index is not sent`);
      else {
        try {
          const m = parseFormsManifest(readJson(fFormsFile), lang as LanguageCode);
          if (!m) err(`${FORMS_DIR}/${FORMS_MANIFEST} is not a readable forms-index manifest`);
          else {
            if (!m.shardFiles.length) err(`${FORMS_DIR}/${FORMS_MANIFEST} names no shard files`);
            for (const n of m.shardFiles) add(`${FORMS_DIR}/${n}`);
            const extra = fs.readdirSync(formsDir).filter((n) => FORMS_SHARD_FILE.test(n) && !m.shardFiles.includes(n));
            if (extra.length) warn(`${extra.length} forms shard file(s) on disk are not named by the manifest and are not sent (e.g. ${extra[0]})`);
            add(`${FORMS_DIR}/${FORMS_MANIFEST}`, true);
            entry.forms = `${m.forms.toLocaleString('en-US')} forms · ${m.shardFiles.length} shards`;
          }
        } catch (e) { err(`${FORMS_DIR}/${FORMS_MANIFEST} cannot be read (${e instanceof Error ? e.message : String(e)})`); }
      }
    }
    entry.files = mine.length;
    entry.bytes = mine.reduce((n, f) => n + f.bytes, 0);
    plan.files.push(...mine);
    plan.summary.push(entry);
  }
  // shards first, manifests last, so a new manifest never points at a shard that is not there yet
  plan.files.sort((a, b) => Number(a.manifest) - Number(b.manifest));
  return plan;
}

/** `user@host:/path` or `host:/path`, not a Windows drive (`C:\dict`) and not a path. */
export function isRemoteTarget(dest: string): boolean {
  if (/^[A-Za-z]:[\\/]/.test(dest) || /^[A-Za-z]:$/.test(dest)) return false;
  return /^[^/\\:\s]+:.+/.test(dest) && !dest.startsWith('file:');
}

export interface PublishOptions {
  src: string;
  dest: string;
  langs?: readonly string[];
  /** keep (default): send the full shards as built; gzip / plain: repack them first (full-2 only). */
  fullShards?: FullShards;
  dryRun?: boolean;
  /** remove dictionary files at a directory destination that the tree no longer has */
  prune?: boolean;
  log?: (line: string) => void;
  /** run an external command (rsync/scp); returns the exit status. Tests inject one. */
  run?: (cmd: string, args: string[]) => number;
}

export interface PublishResult { ok: boolean; plan: Plan; copied: number; skipped: number; removed: number; bytesSent: number; remote: boolean; dryRun: boolean }

const sha = (f: string): string => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const defaultRun = (cmd: string, args: string[]): number => spawnSync(cmd, args, { stdio: 'inherit' }).status ?? 1;
const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

export function publish(opts: PublishOptions): PublishResult {
  const log = opts.log ?? ((l: string) => console.log(l));
  const run = opts.run ?? defaultRun;
  const remote = isRemoteTarget(opts.dest);
  const src = opts.src;
  let tmp: string | undefined;
  const result = (ok: boolean, plan: Plan, extra: Partial<PublishResult> = {}): PublishResult => ({ ok, plan, copied: 0, skipped: 0, removed: 0, bytesSent: 0, remote, dryRun: !!opts.dryRun, ...extra });
  try {
    // optional repack of the full shards into a scratch folder per language (the source is never touched)
    const fullDirs: Record<string, string> = {};
    if (opts.fullShards && opts.fullShards !== 'keep') {
      const want = opts.fullShards === 'gzip';
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'go-dict-publish-'));
      for (const lang of (opts.langs ?? LANGUAGES.filter((l) => fs.existsSync(path.join(opts.src, l)))) as string[]) {
        const full = path.join(opts.src, lang, 'full');
        if (!fs.existsSync(path.join(full, 'manifest.json'))) continue;
        try {
          const r = repackFull(full, path.join(tmp, lang, 'full'), want, lang as LanguageCode);
          fullDirs[lang] = path.join(tmp, lang, 'full');
          log(`dict:publish - ${lang}: full shards repacked ${want ? 'gzip' : 'plain'}: ${mb(r.bytesIn)} -> ${mb(r.bytesOut)} (${r.files} files)`);
        } catch (e) {
          log(`  ERROR (${lang}): cannot repack the full shards: ${e instanceof Error ? e.message : String(e)}`);
          return result(false, { files: [], errors: [{ lang, message: 'repack failed' }], warnings: [], summary: [] });
        }
      }
    }

    const plan = planPublish(src, opts.langs, fullDirs);
    for (const s of plan.summary) log(`dict:publish - ${s.lang}: ${[s.schema3, s.full ? `full ${s.full}` : undefined, s.reverse ? `reverse ${s.reverse}` : undefined, s.forms ? `forms ${s.forms}` : undefined].filter(Boolean).join(' · ') || 'nothing to send'} · ${s.files} files, ${mb(s.bytes)}`);
    for (const w of plan.warnings) log(`  warning (${w.lang}): ${w.message}`);
    for (const e of plan.errors) log(`  ERROR (${e.lang}): ${e.message}`);
    const total = plan.files.reduce((n, f) => n + f.bytes, 0);
    log(`dict:publish - manifest check ${plan.errors.length ? `FAILED (${plan.errors.length} problem(s)); nothing is sent` : 'ok'}: ${plan.files.length} files, ${mb(total)} -> ${opts.dest}${remote ? ' (remote)' : ''}`);
    if (plan.errors.length) return result(false, plan);
    if (opts.dryRun) {
      log('dict:publish - dry run: nothing was written');
      return result(true, plan, { skipped: plan.files.length });
    }

    if (remote) {
      // rsync per (language, area) group, shards first and manifests last; scp, in chunks, when rsync is not there
      const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'go-dict-list-'));
      try {
        interface Group { lang: string; area: string; root: string; shards: string[]; manifests: string[] }
        const groups = new Map<string, Group>();
        for (const f of plan.files) {
          const area = f.rel.startsWith('full/') ? 'full' : f.rel.startsWith(`${REVERSE_DIR}/`) ? REVERSE_DIR : f.rel.startsWith(`${FORMS_DIR}/`) ? FORMS_DIR : '';
          const g = groups.get(`${f.lang}|${area}`) ?? { lang: f.lang, area, root: '', shards: [], manifests: [] };
          g.root = area ? path.dirname(f.abs) : path.join(src, f.lang);
          (f.manifest ? g.manifests : g.shards).push(area ? f.rel.slice(area.length + 1) : f.rel);
          groups.set(`${f.lang}|${area}`, g);
        }
        const target = (g: Group) => `${opts.dest.replace(/[/\\]+$/, '')}/${g.lang}/${g.area ? `${g.area}/` : ''}`;
        let sent = 0;
        for (const pass of ['shards', 'manifests'] as const) {
          for (const [i, g] of [...groups.values()].entries()) {
            const names = g[pass];
            if (!names.length) continue;
            const listFile = path.join(stage, `${pass}-${i}.txt`);
            fs.writeFileSync(listFile, names.join('\n') + '\n');
            let status = run('rsync', ['-az', '--partial', '--files-from', listFile, g.root.replace(/\\/g, '/').replace(/\/?$/, '/'), target(g)]);
            if (status !== 0) {
              log('dict:publish - rsync failed or is not installed; trying scp');
              status = 0;
              for (let k = 0; k < names.length; k += 100) {
                const code = run('scp', [...names.slice(k, k + 100).map((n) => path.join(g.root, n)), target(g)]);
                if (code !== 0) status = code;
              }
              if (status !== 0) return result(false, plan, { copied: sent, remote: true });
            }
            sent += names.length;
          }
        }
        return result(true, plan, { copied: sent, bytesSent: total });
      } finally {
        fs.rmSync(stage, { recursive: true, force: true });
      }
    }

    // a directory destination
    let copied = 0, skipped = 0, bytesSent = 0, removed = 0;
    for (const f of plan.files) {
      const to = path.join(opts.dest, f.lang, f.rel);
      if (fs.existsSync(to) && sizeOf(to) === f.bytes && sha(to) === sha(f.abs)) { skipped++; continue; }
      fs.mkdirSync(path.dirname(to), { recursive: true });
      const part = `${to}.part-${process.pid}`;
      fs.copyFileSync(f.abs, part);
      fs.renameSync(part, to);
      copied++; bytesSent += f.bytes;
    }
    if (opts.prune) {
      const keep = new Set(plan.files.map((f) => path.join(opts.dest, f.lang, f.rel)));
      for (const lang of new Set(plan.files.map((f) => f.lang))) {
        const walk = (d: string) => {
          if (!fs.existsSync(d)) return;
          for (const n of fs.readdirSync(d)) {
            const p = path.join(d, n);
            if (fs.statSync(p).isDirectory()) { if (n === 'full' || n === REVERSE_DIR || n === FORMS_DIR) walk(p); continue; }
            if ((SHARD_FILE.test(n) || FULL_SHARD_FILE.test(n) || REVERSE_SHARD_FILE.test(n) || FORMS_SHARD_FILE.test(n)) && !keep.has(p)) { fs.rmSync(p); removed++; }
          }
        };
        walk(path.join(opts.dest, lang));
      }
    }
    log(`dict:publish - done: ${copied} file(s) copied (${mb(bytesSent)}), ${skipped} already up to date${opts.prune ? `, ${removed} stale shard(s) removed` : ''}`);
    return result(true, plan, { copied, skipped, bytesSent, removed });
  } finally {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
}

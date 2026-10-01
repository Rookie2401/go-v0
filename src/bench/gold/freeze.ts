/// <reference types="node" />
/**
 * Frozen evaluation sets. `gold:freeze` records, in `<dir>/frozen/<id>.json`, exactly which gold files make up a set
 * (path + sha256), what they contain (counts per stratum, who checked them, when) and the tool versions, plus a set
 * hash. A frozen set is immutable: `verifyFrozen` re-hashes every file and any difference is a refusal, and
 * `gold:accept` will not write into a file that belongs to one. Only HUMAN-CHECKED rows can be frozen: a row without
 * `checkedBy` is a machine draft and is refused.
 */
import fs from 'node:fs';
import path from 'node:path';
import { thAdapter } from '../../adapters/th';
import { parseJsonl, validateUnitCases, type UnitGoldCase } from '../units/gold';
import { parseGoldJsonl } from './format';
import { FROZEN_SUBDIR, findFiles, relPosix, sha256File, sha256Of, writeText } from './io-node';
import type { GoldSentence } from './types';

export const GOLD_TOOLS_VERSION = 'gold-tools@2';
export const FROZEN_ID = /^[a-z0-9][a-z0-9._-]*$/u;

export interface ToolVersions { goldTools: string; adapter: string; node: string; icu: string; unicode: string }

export const currentTools = (): ToolVersions => ({
  goldTools: GOLD_TOOLS_VERSION, adapter: `adapter-th@${thAdapter.version}`,
  node: process.version, icu: process.versions.icu ?? 'unknown', unicode: process.versions.unicode ?? 'unknown',
});

export interface FrozenFile {
  /** Relative to the gold directory, forward slashes. */
  path: string;
  kind: 'words' | 'units';
  sha256: string;
  /** Rows of the file that belong to the selection. */
  rows: number;
  strata: Record<string, number>;
  heldOut: number;
}

export interface FrozenManifest {
  id: string;
  createdAt: string;
  tools: ToolVersions;
  selection: { strata: string[] | null; heldOutOnly: boolean };
  files: FrozenFile[];
  counts: { words: Record<string, number>; wordsHeldOut: Record<string, number>; units: Record<string, number> };
  checkedBy: Array<{ name: string; firstDate: string; lastDate: string; rows: number }>;
  setHash: string;
}

export const manifestPath = (dir: string, id: string): string => path.join(dir, FROZEN_SUBDIR, `${id}.json`);

/** Hash of what the set IS: the selection and each file's path and content hash; not the date or the tool versions. */
export function setHashOf(selection: FrozenManifest['selection'], files: ReadonlyArray<Pick<FrozenFile, 'path' | 'sha256'>>): string {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path)).map((f) => `${f.path}\u0000${f.sha256}`);
  return sha256Of(JSON.stringify({ strata: selection.strata ? [...selection.strata].sort() : null, heldOutOnly: selection.heldOutOnly, files: sorted }));
}

// ───────────────────────────── reading the gold files ─────────────────────────────

interface Loaded { file: string; rel: string; kind: 'words' | 'units'; sha256: string; words: GoldSentence[]; units: UnitGoldCase[] }

function loadFile(dir: string, file: string, kind: 'words' | 'units'): Loaded {
  const raw = fs.readFileSync(file);
  const text = raw.toString('utf8');
  const rel = relPosix(dir, file);
  if (kind === 'words') {
    const r = parseGoldJsonl(text, rel);
    if (r.problems.length) throw new Error(`${rel} is not valid gold: ${r.problems.slice(0, 3).join('; ')}`);
    return { file, rel, kind, sha256: sha256Of(raw), words: r.sentences, units: [] };
  }
  const units = parseJsonl(text);
  const problems = validateUnitCases(units);
  if (problems.length) throw new Error(`${rel} is not valid unit gold: ${problems.slice(0, 3).join('; ')}`);
  return { file, rel, kind, sha256: sha256Of(raw), words: [], units };
}

export interface FreezeOptions {
  id: string;
  strata?: string[];
  heldOutOnly?: boolean;
  /** ISO timestamp; injected so a freeze is reproducible in tests. */
  now?: string;
  tools?: ToolVersions;
}

const dateOf = (iso: string | undefined): string => (iso ?? '').slice(0, 10);

/** Freeze every checked gold file under `dir` that has rows in the selection. Writes the manifest; never overwrites one. */
export function freezeSet(dir: string, opt: FreezeOptions): FrozenManifest {
  if (!FROZEN_ID.test(opt.id)) throw new Error(`--name must be lower-case letters, digits, "." "_" "-" (got "${opt.id}")`);
  const target = manifestPath(dir, opt.id);
  if (fs.existsSync(target)) throw new Error(`${path.join(FROZEN_SUBDIR, `${opt.id}.json`)} already exists: a frozen set is immutable, freeze under a new name`);
  const strata = opt.strata && opt.strata.length ? [...opt.strata] : null;
  const heldOutOnly = opt.heldOutOnly === true;
  const wanted = (s: string) => strata === null || strata.includes(s);

  const loaded: Loaded[] = [
    ...findFiles(dir, '.gold.jsonl').map((f) => loadFile(dir, f, 'words')),
    ...findFiles(dir, '.units.jsonl').map((f) => loadFile(dir, f, 'units')),
  ];
  const files: FrozenFile[] = [];
  const counts: FrozenManifest['counts'] = { words: {}, wordsHeldOut: {}, units: {} };
  const who = new Map<string, { first: string; last: string; rows: number }>();
  const unchecked: string[] = [];
  const note = (name: string, at: string) => {
    const w = who.get(name) ?? { first: at, last: at, rows: 0 };
    w.rows++;
    if (at < w.first) w.first = at;
    if (at > w.last) w.last = at;
    who.set(name, w);
  };
  for (const l of loaded) {
    const f: FrozenFile = { path: l.rel, kind: l.kind, sha256: l.sha256, rows: 0, strata: {}, heldOut: 0 };
    if (l.kind === 'words') {
      for (const s of l.words) {
        if (!wanted(s.stratum) || (heldOutOnly && s.heldOut !== true)) continue;
        if (!s.checkedBy) { unchecked.push(`${l.rel}: ${s.id}`); continue; }
        f.rows++;
        f.strata[s.stratum] = (f.strata[s.stratum] ?? 0) + 1;
        counts.words[s.stratum] = (counts.words[s.stratum] ?? 0) + 1;
        if (s.heldOut) { f.heldOut++; counts.wordsHeldOut[s.stratum] = (counts.wordsHeldOut[s.stratum] ?? 0) + 1; }
        note(s.checkedBy, dateOf(s.checkedAt));
      }
    } else if (!heldOutOnly) { // reading units carry no held-out flag
      for (const c of l.units) {
        if (!wanted(c.stratum)) continue;
        if (!c.checkedBy) { unchecked.push(`${l.rel}: ${c.id}`); continue; }
        f.rows++;
        f.strata[c.stratum] = (f.strata[c.stratum] ?? 0) + 1;
        counts.units[c.stratum] = (counts.units[c.stratum] ?? 0) + 1;
        note(c.checkedBy, dateOf(c.checkedAt));
      }
    }
    if (f.rows > 0) files.push(f);
  }
  if (unchecked.length) {
    throw new Error(`${unchecked.length} selected row(s) have not been checked by a named person (first: ${unchecked[0]}); only human-checked rows can be frozen`);
  }
  if (files.length === 0) throw new Error('nothing to freeze: no checked gold rows match the selection');
  const selection = { strata, heldOutOnly };
  const manifest: FrozenManifest = {
    id: opt.id,
    createdAt: opt.now ?? new Date().toISOString(),
    tools: opt.tools ?? currentTools(),
    selection,
    files,
    counts,
    checkedBy: [...who.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, w]) => ({ name, firstDate: w.first, lastDate: w.last, rows: w.rows })),
    setHash: setHashOf(selection, files),
  };
  writeText(target, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

// ───────────────────────────── reading and verifying ─────────────────────────────

export function readManifest(dir: string, id: string): FrozenManifest {
  const file = manifestPath(dir, id);
  if (!fs.existsSync(file)) throw new Error(`no frozen set "${id}" under ${dir} (run: npm run gold:freeze -- --name ${id})`);
  const m = JSON.parse(fs.readFileSync(file, 'utf8')) as FrozenManifest;
  if (!m || m.id !== id || !Array.isArray(m.files) || typeof m.setHash !== 'string') throw new Error(`${file} is not a frozen-set manifest`);
  return m;
}

/** Every reason the files on disk no longer match the manifest (empty list = verified). */
export function verifyFrozen(dir: string, m: FrozenManifest): string[] {
  const problems: string[] = [];
  for (const f of m.files) {
    const p = path.join(dir, f.path);
    if (!fs.existsSync(p)) { problems.push(`${f.path}: the file is missing`); continue; }
    const h = sha256File(p);
    if (h !== f.sha256) problems.push(`${f.path}: the file has changed since it was frozen (sha256 ${h.slice(0, 12)}… instead of ${f.sha256.slice(0, 12)}…)`);
  }
  if (setHashOf(m.selection, m.files) !== m.setHash) problems.push('the manifest itself was edited: its set hash does not match its file list');
  return problems;
}

/** The word-gold rows of a verified frozen set, with the selection (strata, held-out only) applied. */
export function frozenWordRows(dir: string, m: FrozenManifest): GoldSentence[] {
  const out: GoldSentence[] = [];
  const strata = m.selection.strata;
  for (const f of m.files) {
    if (f.kind !== 'words') continue;
    for (const s of loadFile(dir, path.join(dir, f.path), 'words').words) {
      if (strata && !strata.includes(s.stratum)) continue;
      if (m.selection.heldOutOnly && s.heldOut !== true) continue;
      out.push(s);
    }
  }
  return out;
}

/** Files belonging to any frozen set under `dir`: relative path → the ids of the sets that hold it. */
export function frozenFiles(dir: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const fdir = path.join(dir, FROZEN_SUBDIR);
  if (!fs.existsSync(fdir)) return out;
  for (const name of fs.readdirSync(fdir).sort()) {
    if (!name.endsWith('.json')) continue;
    try {
      const m = JSON.parse(fs.readFileSync(path.join(fdir, name), 'utf8')) as FrozenManifest;
      for (const f of m.files ?? []) out.set(f.path, [...(out.get(f.path) ?? []), m.id]);
    } catch { /* a damaged manifest protects nothing it cannot name */ }
  }
  return out;
}

/** The ids of frozen sets that contain `file` (empty = free to write). */
export function frozenSetsHolding(dir: string, file: string): string[] {
  return frozenFiles(dir).get(relPosix(dir, file)) ?? [];
}

export function listFrozen(dir: string): FrozenManifest[] {
  const fdir = path.join(dir, FROZEN_SUBDIR);
  if (!fs.existsSync(fdir)) return [];
  const out: FrozenManifest[] = [];
  for (const name of fs.readdirSync(fdir).sort()) {
    if (name.endsWith('.json')) {
      try { out.push(JSON.parse(fs.readFileSync(path.join(fdir, name), 'utf8')) as FrozenManifest); } catch { /* skip */ }
    }
  }
  return out;
}

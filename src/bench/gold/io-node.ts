/// <reference types="node" />
/** Node-only file helpers for the gold set: where files live, recursive loading, safe writing. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseGoldJsonl } from './format';
import type { GoldSentence } from './types';

export const GENERATED_DIR = 'data/benchmarks/th/generated';
export const WIKTIONARY_GOLD_FILE = `${GENERATED_DIR}/wiktionary-examples.gold.jsonl`;
export const COURSE_DIR = 'data/private/benchmarks/th';
/** Under a gold directory: reading-unit gold and drafts, frozen manifests, local reports. */
export const UNITS_SUBDIR = 'units';
export const FROZEN_SUBDIR = 'frozen';
export const REPORTS_SUBDIR = 'reports';

export const sha256Of = (data: string | Buffer): string => crypto.createHash('sha256').update(data).digest('hex');
export const sha256File = (file: string): string => sha256Of(fs.readFileSync(file));
/** Path of `file` relative to `dir`, with forward slashes. */
export const relPosix = (dir: string, file: string): string => path.relative(path.resolve(dir), path.resolve(file)).split(path.sep).join('/');

export function ensureDir(dir: string): void { fs.mkdirSync(dir, { recursive: true }); }

export function writeText(file: string, text: string): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text, 'utf8');
}

/** Every file ending in `suffix` under `dir` (a file path is accepted too), recursively, in a stable order. */
export function findFiles(dir: string, suffix: string, acceptFile = false): string[] {
  if (!fs.existsSync(dir)) return [];
  const st = fs.statSync(dir);
  if (st.isFile()) return acceptFile || dir.endsWith(suffix) ? [dir] : [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of fs.readdirSync(d).sort()) {
      const p = path.join(d, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(suffix)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** Every `*.gold.jsonl` (word segmentation) under `dir`; any file path given directly is accepted as is. */
export const findGoldFiles = (dir: string): string[] => findFiles(dir, '.gold.jsonl', true);

/** Every `*.units.jsonl` (reading-unit gold) under `dir`. */
export const findUnitFiles = (dir: string): string[] => findFiles(dir, '.units.jsonl');

export interface LoadedGold { sentences: GoldSentence[]; files: string[]; problems: string[] }

/** Load and validate all gold files below `dir`. A duplicate id across files keeps the first and reports the rest. */
export function loadGoldDir(dir: string): LoadedGold {
  const files = findGoldFiles(dir);
  const sentences: GoldSentence[] = [];
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const f of files) {
    const r = parseGoldJsonl(fs.readFileSync(f, 'utf8'), path.basename(f));
    problems.push(...r.problems);
    for (const s of r.sentences) {
      if (ids.has(s.id)) { problems.push(`${path.basename(f)}: duplicate id ${s.id} across files, ignored`); continue; }
      ids.add(s.id);
      sentences.push(s);
    }
  }
  return { sentences, files, problems };
}

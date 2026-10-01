/// <reference types="node" />
/** Node-only file helpers for the gold set: where files live, recursive loading, safe writing. */
import fs from 'node:fs';
import path from 'node:path';
import { parseGoldJsonl } from './format';
import type { GoldSentence } from './types';

export const GENERATED_DIR = 'data/benchmarks/th/generated';
export const WIKTIONARY_GOLD_FILE = `${GENERATED_DIR}/wiktionary-examples.gold.jsonl`;
export const COURSE_DIR = 'data/private/benchmarks/th';

export function ensureDir(dir: string): void { fs.mkdirSync(dir, { recursive: true }); }

export function writeText(file: string, text: string): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text, 'utf8');
}

/** Every `*.gold.jsonl` under `dir` (a file path is accepted too), recursively, in a stable order. */
export function findGoldFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const st = fs.statSync(dir);
  if (st.isFile()) return [dir];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of fs.readdirSync(d).sort()) {
      const p = path.join(d, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.gold.jsonl')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

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

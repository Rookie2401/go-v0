/// <reference types="node" />
/**
 * Shared helpers for the corpus CLI scripts (corpus-validate, corpus-check, corpus-migrate).
 * Run with vite-node: `npm run corpus:validate -- <file-or-dir>...`, `npm run corpus:check`, `npm run corpus:migrate`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdapterRegistry } from '../src/adapters';
import {
  computePublished, validateBatch, type AnalysisCoverage, type BatchValidation, type ValidationIssue,
} from '../src/ingest';

export const registry = createAdapterRegistry();

/** Expand files and directories (recursively) into a sorted list of .json files. */
export function collectJsonFiles(inputs: string[]): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) for (const name of fs.readdirSync(p).sort()) walk(path.join(p, name));
    else if (p.toLowerCase().endsWith('.json')) out.push(p);
  };
  for (const i of inputs) walk(i);
  return out;
}

export interface LoadedFile { file: string; doc: unknown; parseError?: string }

export function loadFiles(files: string[]): LoadedFile[] {
  return files.map((file) => {
    try { return { file, doc: JSON.parse(fs.readFileSync(file, 'utf8')) as unknown }; }
    catch (e) { return { file, doc: undefined, parseError: e instanceof Error ? e.message : String(e) }; }
  });
}

export const pct = (c: AnalysisCoverage | undefined) => (c ? `${(c.coverage * 100).toFixed(1)}% (${c.analysed}/${c.words} words)` : 'n/a');

export function printIssues(issues: ValidationIssue[], indent = '  '): void {
  for (const i of issues) {
    console.log(`${indent}${i.severity === 'error' ? 'ERROR' : 'warn '} ${i.path || '(document)'}: ${i.message} [${i.code}]`);
    console.log(`${indent}      hint: ${i.hint}`);
  }
}

export interface ValidationRun { errors: number; warnings: number; documents: number; batch: BatchValidation | undefined }

/** Validate loaded files as one batch and print path + hint for every issue plus the analysis coverage. */
export function validateAndPrint(loaded: LoadedFile[]): ValidationRun {
  let errors = 0;
  let warnings = 0;
  const parsed = loaded.filter((l) => l.parseError === undefined);
  for (const l of loaded) {
    if (l.parseError !== undefined) { errors++; console.log(`${l.file}\n  ERROR (document): not valid JSON: ${l.parseError}\n        hint: fix the syntax error; a corpus file is one JSON object`); }
  }
  const batch = parsed.length ? validateBatch(parsed.map((l) => l.doc), { registry }) : undefined;
  batch?.documents.forEach((r, i) => {
    const e = r.issues.filter((x) => x.severity === 'error').length;
    const w = r.issues.length - e;
    errors += e;
    warnings += w;
    const gate = e === 0 && typeof parsed[i].doc === 'object' && parsed[i].doc !== null ? computePublished(parsed[i].doc as Record<string, unknown>) : undefined;
    console.log(`${parsed[i].file}  [${r.id}]  ${e} error(s), ${w} warning(s); analysis coverage ${pct(r.coverage)}${gate ? `; ${gate.published ? 'would be PUBLISHED' : 'unpublished'}` : ''}`);
    printIssues(r.issues);
    if (gate && !gate.published) for (const reason of gate.unpublishedReasons) console.log(`        unpublished: ${reason}`);
    if (r.coverage && r.coverage.unanalysed.length) console.log(`        unanalysed forms: ${r.coverage.unanalysed.slice(0, 12).join(', ')}${r.coverage.unanalysed.length > 12 ? ', ...' : ''}`);
  });
  return { errors, warnings, documents: loaded.length, batch };
}

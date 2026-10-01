/// <reference types="node" />
/**
 * Node-only half of the hand-data / dictionary comparison: stream the source file once, read the course documents
 * and the resolutions file, run the comparison, write the report and the review JSON. Not imported by the browser
 * bundle (and not re-exported from src/dict/index.ts).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import type { LanguageCode } from '../core';
import { thAdapter } from '../adapters/th';
import {
  compareHandToDictionary, corpusCoverage, createDictCollector, parseResolutions,
  type CorpusDoc, type CompareResult, type DictStats,
} from './compare';
import { corpusTokens, documentTexts, handData, plainTexts, wantedForms } from './compare-hand';
import { renderDisagreementsJson, renderReport, type SourceFileInfo } from './compare-report';

export interface CompareFileOptions {
  input: string;
  lang: LanguageCode;
  /** Dictionary id, e.g. "kaikki-th@2026-09-28". */
  dictionaryId: string;
  /** YYYY-MM-DD of the source's own Last-Modified, shown in the report. */
  lastModified?: string;
  url?: string;
  /** Directory of course documents (`data/corpus/th`) and extra plain-text files. */
  corpusDir?: string;
  textFiles?: string[];
  resolutionsFile: string;
  reportFile: string;
  jsonFile: string;
}

export interface CompareFileResult {
  result: CompareResult;
  stats: DictStats;
  report: string;
  json: string;
  source: SourceFileInfo;
}

function sha256Of(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

/** Last-Modified date (YYYY-MM-DD) out of a saved HTTP header file such as data/dictionaries/headers.txt. */
export function lastModifiedFromHeaders(text: string): string | undefined {
  const m = /^last-modified:\s*(.+)$/im.exec(text);
  if (!m) return undefined;
  const d = new Date(m[1].trim());
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

function readCorpus(opts: CompareFileOptions): CorpusDoc[] {
  const docs: CorpusDoc[] = [];
  if (opts.corpusDir && fs.existsSync(opts.corpusDir)) {
    for (const name of fs.readdirSync(opts.corpusDir).filter((n) => n.endsWith('.json')).sort()) {
      let json: unknown;
      try { json = JSON.parse(fs.readFileSync(path.join(opts.corpusDir, name), 'utf8')); } catch { continue; }
      if ((json as { lang?: unknown })?.lang !== 'th') continue;
      docs.push({ name, tokens: corpusTokens(documentTexts(json)) });
    }
  }
  for (const f of opts.textFiles ?? []) {
    if (!fs.existsSync(f)) continue;
    docs.push({ name: path.basename(f), tokens: corpusTokens(plainTexts(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''))) });
  }
  return docs;
}

export async function compareFile(opts: CompareFileOptions): Promise<CompareFileResult> {
  if (opts.lang !== 'th') throw new Error('dict:compare compares the Thai hand data only (--lang th)');
  const hand = handData();
  const docs = readCorpus(opts);
  const wanted = wantedForms(hand, docs.map((d) => d.tokens));

  const collector = createDictCollector({ lang: opts.lang, normalize: (s) => thAdapter.normalize(s), wanted });
  const rl = readline.createInterface({ input: fs.createReadStream(opts.input, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) collector.addLine(line);
  const dict = collector.finish();
  if (dict.stats.entries === 0) throw new Error('no usable entries in the input (nothing written)');

  let resolutionProblems: string[] = [];
  let resolutions = new Map<string, import('./compare').Resolution>();
  if (fs.existsSync(opts.resolutionsFile)) {
    let raw: unknown;
    try { raw = JSON.parse(fs.readFileSync(opts.resolutionsFile, 'utf8')); } catch (e) { throw new Error(`cannot read ${opts.resolutionsFile}: ${e instanceof Error ? e.message : String(e)} (it was left untouched)`); }
    const parsed = parseResolutions(raw);
    resolutions = parsed.map;
    resolutionProblems = parsed.problems;
  }

  const result = compareHandToDictionary(hand, dict, { dictionaryId: opts.dictionaryId, resolutions });
  const stat = fs.statSync(opts.input);
  const source: SourceFileInfo = {
    file: path.relative(process.cwd(), opts.input).split(path.sep).join('/'),
    bytes: stat.size, lines: dict.stats.lines + dict.stats.blank, sha256: await sha256Of(opts.input),
    lastModified: opts.lastModified, url: opts.url,
  };
  const input = { result, dictStats: dict.stats, source, corpus: corpusCoverage(docs, dict), resolutionProblems };
  return { result, stats: dict.stats, report: renderReport(input), json: renderDisagreementsJson(input), source };
}

/** Write both outputs, and an empty resolutions file when none exists (an existing one is never touched). */
export function writeCompareOutputs(opts: CompareFileOptions, out: CompareFileResult): void {
  for (const f of [opts.reportFile, opts.jsonFile, opts.resolutionsFile]) fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(opts.reportFile, out.report, 'utf8');
  fs.writeFileSync(opts.jsonFile, out.json, 'utf8');
  if (!fs.existsSync(opts.resolutionsFile)) fs.writeFileSync(opts.resolutionsFile, '{}\n', 'utf8');
}

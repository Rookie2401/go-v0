/// <reference types="node" />
/**
 * scripts/ar-deck-limits-lib.mts: the sweep behind src/adapters/arabic/generated/deck-limits.ts (written by npm run ar:deck-limits)
 *
 * THE SWEEP behind the deck gate's known-limits list (docs/arabic/DECK.md). It runs the real adapter (the compiled core plus EVERY shard of
 * public/lexicon/ar/standard) over the three development sets the pack has already been tuned on:
 *     test/fixtures/arabic/regression.json            (decided cases that name a lemma)
 *     test/fixtures/arabic/msa-dev.json               (unvocalized prose)
 *     test/fixtures/arabic/msa-dev-vocalized.json     (the same sentences, fully vocalized)
 * and records every written form whose TOP reading is credited (confidence >= 0.5, not a guess) with a lemma that differs from the
 * reference lemma BY LETTERS (arKey of the two lemmas differ: a difference of vowels only is the annotator's spelling, not a misreading).
 *   AR_KNOWN_LIMITS    written form -> reason. The key is the printed form NFC when the page had vowels, else its arKey.
 *   AR_LIMITED_LEMMAS  "<head form>|<POS>" of the lexeme wrongly credited -> reason (the card of that lexeme would be built from a lemma id
 *                      the extension recorded for a misread word, so it is held back too).
 * The pure pieces are exported so test/adapters/arabic-deck-limits.test.ts re-runs the very same sweep and fails when the generated file is
 * out of step. The command line is scripts/ar-deck-limits.mts; this file holds the pieces so that a test or another script can import them without running it.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { AnalysisCandidate } from '../src/core';
import { arAdapter } from '../src/adapters/ar';
import { AR_CORE } from '../src/adapters/arabic/generated/core';
import { installArabicIndex, resetArabicIndexes, type ArabicFormIndex } from '../src/adapters/arabic/index-store';
import { arHeadForm, arKey, arTokenize, hasTashkil } from '../src/adapters/arabic/text';

export const LIMITS_FILE = 'src/adapters/arabic/generated/deck-limits.ts';
export const SHARD_DIR = 'public/lexicon/ar/standard';
const FIXTURES = 'test/fixtures/arabic';

interface GoldToken { surface: string; lemma: string | null; pos: string; skip?: boolean }
interface GoldSentence { id: string; text: string; tokens: GoldToken[] }
interface RegCase { id: string; text: string; target: string; expect: { lemma: string | null; pos?: string; undecided?: boolean } }

const readJson = <T,>(file: string): T => JSON.parse(fs.readFileSync(path.resolve(FIXTURES, file), 'utf8')) as T;

export const shardsPresent = (): boolean => fs.existsSync(path.resolve(SHARD_DIR, 'manifest.json'));

/** The compiled core plus every shard on disk, installed (the whole product index). */
export function installFullIndex(): void {
  resetArabicIndexes();
  installArabicIndex(AR_CORE as ArabicFormIndex);
  const manifest = JSON.parse(fs.readFileSync(path.resolve(SHARD_DIR, 'manifest.json'), 'utf8')) as { shards: Record<string, { file: string }> };
  for (const s of Object.values(manifest.shards)) installArabicIndex(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.resolve(SHARD_DIR, s.file))).toString('utf8')) as ArabicFormIndex);
}

export interface Sweep { forms: Record<string, string>; lemmas: Record<string, string> }

export function sweepDeckLimits(): Sweep {
  const forms: Record<string, string> = {};
  const lemmas: Record<string, string> = {};
  const check = (surface: string, gold: string | null, goldPos: string, cands: AnalysisCandidate[]): void => {
    const top = cands[0];
    if (!gold || !top || top.unconfirmed || top.confidence < 0.5 || !top.lemma || arKey(top.lemma) === arKey(gold)) return;
    const key = hasTashkil(surface) ? surface.normalize('NFC') : arKey(surface);
    const reason = `credited ${arHeadForm(top.lemma, top.pos ?? goldPos)} (${top.pos ?? '?'}) where the reference lemma is ${gold}`;
    forms[key] ??= reason;
    lemmas[`${arHeadForm(top.lemma, top.pos ?? goldPos)}|${top.pos ?? goldPos}`] ??= `credited to the spelling ${key}, reference lemma ${gold}`;
  };
  for (const file of ['msa-dev.json', 'msa-dev-vocalized.json']) {
    for (const s of readJson<{ sentences: GoldSentence[] }>(file).sentences) {
      const toks = arTokenize(s.text);
      const words = toks.filter((t) => t.isWord);
      if (words.length !== s.tokens.length) continue;
      const out = arAdapter.analyze(toks);
      words.forEach((w, i) => {
        const g = s.tokens[i];
        if (g.skip || !g.lemma) return;
        check(w.surface, g.lemma, g.pos, out.find((o) => o.token === w || o.token.start === w.start)?.candidates ?? []);
      });
    }
  }
  for (const c of readJson<{ cases: RegCase[] }>('regression.json').cases) {
    if (!c.expect.lemma || c.expect.undecided) continue;
    const toks = arTokenize(c.text);
    const i = toks.findIndex((t) => t.isWord && arKey(t.surface) === arKey(c.target));
    if (i < 0) continue;
    const out = arAdapter.analyze(toks);
    check(toks[i].surface, c.expect.lemma, c.expect.pos ?? 'NOUN', out[i]?.candidates ?? []);
  }
  return { forms, lemmas };
}

const sorted = (o: Record<string, string>): Array<[string, string]> => Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

/** The text of the generated file for a sweep (the test compares it with the file on disk). */
export function renderLimits(s: Sweep): string {
  const body = (o: Record<string, string>): string => sorted(o).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n');
  return [
    '// GENERATED by scripts/ar-deck-limits.mts (npm run ar:deck-limits) from the sweep of test/fixtures/arabic/{regression,msa-dev,msa-dev-vocalized}.json. Do not edit by hand:',
    '// test/adapters/arabic-deck-limits.test.ts re-runs the sweep and fails when this file is out of step. Read docs/arabic/DECK.md.',
    'export const AR_KNOWN_LIMITS: Readonly<Record<string, string>> = {',
    body(s.forms),
    '};',
    'export const AR_LIMITED_LEMMAS: Readonly<Record<string, string>> = {',
    body(s.lemmas),
    '};',
    '',
  ].join('\n');
}

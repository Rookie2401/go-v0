/**
 * Scoring of the gold sentences (norwegian-gold-data.ts) against an adapter: lemma and part of speech of the best candidate of each
 * annotated word. MACHINE-DRAFTED expectations, pending native review. Shared by the gold test and by anything that wants the numbers.
 */
import type { LanguageCode } from '../../src/core';
import { adapter } from './helpers';
import type { GoldSentence } from './norwegian-gold-data';

export interface Annotated { surface: string; lemma: string; pos: string }
export interface Parsed { text: string; words: Annotated[] }

export function parseGold(line: string): Parsed {
  const words: Annotated[] = [];
  const plain: string[] = [];
  for (const chunk of line.split(/\s+/).filter(Boolean)) {
    const m = /^(.+?)=([^/]*)\/([A-Z]+)(.*)$/u.exec(chunk);
    if (!m) { plain.push(chunk); continue; }
    words.push({ surface: m[1], lemma: m[2].replace(/_/g, ' '), pos: m[3] });
    plain.push(m[1] + m[4]);
  }
  return { text: plain.join(' '), words };
}

export interface WordResult { surface: string; expected: { lemma: string; pos: string }; got?: { lemma?: string; pos?: string }; lemmaOk: boolean; posOk: boolean }
export interface SentenceResult { id: string; kind: string; text: string; words: WordResult[]; ok: boolean }

export function scoreSentence(lang: LanguageCode, g: GoldSentence): SentenceResult {
  const ad = adapter(lang);
  const parsed = parseGold(g.line);
  const tokens = ad.tokenize(parsed.text);
  const analyses = ad.analyze(tokens);
  let at = 0;
  const words: WordResult[] = parsed.words.map((w) => {
    let k = at;
    while (k < tokens.length && !(tokens[k].isWord && tokens[k].surface === w.surface)) k++;
    if (k >= tokens.length) return { surface: w.surface, expected: w, lemmaOk: false, posOk: false };
    at = k + 1;
    const c = analyses[k].candidates[0];
    return { surface: w.surface, expected: w, got: c ? { lemma: c.lemma, pos: c.pos } : undefined, lemmaOk: c?.lemma === w.lemma, posOk: c?.pos === w.pos };
  });
  return { id: g.id, kind: g.kind, text: parsed.text, words, ok: words.every((w) => w.lemmaOk && w.posOk) };
}

export interface Score { sentences: number; sentencesOk: number; words: number; lemmaOk: number; posOk: number; bothOk: number; failures: string[] }

export function scoreGold(lang: LanguageCode, gold: GoldSentence[]): Score {
  const results = gold.map((g) => scoreSentence(lang, g));
  const words = results.flatMap((r) => r.words);
  const failures: string[] = [];
  for (const r of results) for (const w of r.words) if (!w.lemmaOk || !w.posOk) failures.push(`${r.id} "${w.surface}": expected ${w.expected.lemma}/${w.expected.pos}, got ${w.got ? `${w.got.lemma}/${w.got.pos}` : 'nothing'}`);
  return {
    sentences: results.length, sentencesOk: results.filter((r) => r.ok).length, words: words.length,
    lemmaOk: words.filter((w) => w.lemmaOk).length, posOk: words.filter((w) => w.posOk).length, bothOk: words.filter((w) => w.lemmaOk && w.posOk).length, failures,
  };
}

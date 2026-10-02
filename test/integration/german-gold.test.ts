/**
 * The German linguistic gold set, run against the real adapter (data/benchmarks/de/gold.json: the coordinator's own
 * judgement of each sentence, written before the adapter existed).
 *
 * A sentence passes when every expectation on it holds. A sentence the adapter is KNOWN not to get right is listed in
 * data/benchmarks/de/known-limits.json with the reason; such a sentence must then actually fail — when it starts to
 * pass, the test asks for its entry to be removed, so the list of limits cannot go stale. The summary test prints the
 * result by category; docs/german/STATUS.md quotes it.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import type { AnalysisCandidate, PartOfSpeech } from '../../src/core';

interface GoldPart { text?: string; lemma?: string; kind?: string }
interface GoldToken {
  form: string; nth?: number; lemma?: string | string[]; pos?: PartOfSpeech | PartOfSpeech[];
  morph?: Record<string, string>; includes?: Record<string, string>; ambiguous?: Record<string, string[]>;
  unitWith?: string[]; notUnit?: boolean; parts?: GoldPart[]; noPartKind?: string;
  orthography?: { modern: string; period: string }; noOrthography?: boolean; hasRole?: boolean;
}
interface GoldSentence {
  id: string; category: string; text: string; note?: string; disputed?: string; segments?: number;
  tokens?: GoldToken[]; constructions?: string[]; notConstructions?: string[];
}

// Round 1 (gold.json) was written before the adapter existed; round 2 (gold-2.json) after it landed and first run unseen.
const readGold = (file: string) => (JSON.parse(fs.readFileSync(file, 'utf8')) as { sentences: GoldSentence[] }).sentences;
const gold = { sentences: [...readGold('data/benchmarks/de/gold.json'), ...readGold('data/benchmarks/de/gold-2.json')] };
const LIMITS_FILE = 'data/benchmarks/de/known-limits.json';
const limits: Record<string, string> = fs.existsSync(LIMITS_FILE) ? JSON.parse(fs.readFileSync(LIMITS_FILE, 'utf8')) : {};

const de = createAdapterRegistry().get('de');
const same = (a: string | undefined, b: string) => a !== undefined && de.normalize(a) === de.normalize(b);
const values = (v: string | undefined) => (v ?? '').split(',').filter(Boolean);
const list = <T>(v: T | T[]): T[] => (Array.isArray(v) ? v : [v]);

/** Every expectation of one gold sentence that does not hold, in words. Empty = the sentence passes. */
export function failuresOf(s: GoldSentence): string[] {
  const out: string[] = [];
  if (s.segments !== undefined) {
    const n = de.segmentSentences(s.text).length;
    if (n !== s.segments) out.push(`sentences: expected ${s.segments}, got ${n}`);
  }
  if (!s.tokens && !s.constructions && !s.notConstructions) return out;
  const tokens = de.tokenize(s.text);
  const analyses = de.analyze(tokens);
  for (const g of s.tokens ?? []) {
    const hits = tokens.map((t, i) => (t.surface === g.form ? i : -1)).filter((i) => i >= 0);
    const i = hits[g.nth ?? 0];
    if (i === undefined) { out.push(`${g.form}: no such token`); continue; }
    const c: AnalysisCandidate | undefined = analyses[i].candidates[0];
    if (!c) { out.push(`${g.form}: no reading`); continue; }
    const say = (what: string) => out.push(`${g.form}: ${what} (got ${c.lemma ?? '—'}/${c.pos ?? '—'} ${JSON.stringify(c.morph)})`);
    if (g.lemma !== undefined && !list(g.lemma).some((l) => same(c.lemma, l))) say(`lemma should be ${list(g.lemma).join(' or ')}`);
    if (g.pos !== undefined && !list(g.pos).includes(c.pos as PartOfSpeech)) say(`part of speech should be ${list(g.pos).join(' or ')}`);
    for (const [k, v] of Object.entries(g.morph ?? {})) if (c.morph[k] !== v) say(`${k} should be exactly ${v}`);
    for (const [k, v] of Object.entries(g.includes ?? {})) if (!values(c.morph[k]).includes(v)) say(`${k} should include ${v}`);
    for (const [k, vs] of Object.entries(g.ambiguous ?? {})) if (!vs.every((v) => values(c.morph[k]).includes(v))) say(`${k} should stay open between ${vs.join(' and ')}`);
    if (g.unitWith) {
      const pieces = (c.unit?.pieces ?? []).map((p) => tokens[p]?.surface);
      if (!c.unit) say(`should be a piece of a unit with ${g.unitWith.join(', ')}`);
      else if (![g.form, ...g.unitWith].every((f) => pieces.includes(f))) say(`unit should join ${[g.form, ...g.unitWith].join(' + ')}, joins ${pieces.join(' + ')}`);
    }
    if (g.notUnit && c.unit) say(`should not be a piece of a unit (${c.unit.display})`);
    if (g.parts) {
      let at = 0;
      for (const want of g.parts) {
        const found = (c.parts ?? []).findIndex((p, k) => k >= at
          && (want.text === undefined || same(p.text, want.text)) && (want.lemma === undefined || same(p.lemma, want.lemma)) && (want.kind === undefined || p.kind === want.kind));
        if (found < 0) { say(`parts should contain ${JSON.stringify(want)} in order, has ${JSON.stringify((c.parts ?? []).map((p) => ({ text: p.text, lemma: p.lemma, kind: p.kind })))}`); break; }
        at = found + 1;
      }
    }
    if (g.noPartKind && (c.parts ?? []).some((p) => p.kind === g.noPartKind)) say(`should have no part of kind ${g.noPartKind}`);
    if (g.orthography) {
      if (!c.orthography) say(`should be related to today's spelling ${g.orthography.modern}`);
      else if (!same(c.orthography.modern, g.orthography.modern) || c.orthography.period !== g.orthography.period) say(`older spelling should be ${g.orthography.modern} (${g.orthography.period}), is ${c.orthography.modern} (${c.orthography.period})`);
    }
    if (g.noOrthography && c.orthography) say(`is today's spelling and should have no spelling relation (has ${c.orthography.modern})`);
    if (g.hasRole && !(c.role && c.role.trim())) say('should say what the word does (role)');
  }
  if (s.constructions || s.notConstructions) {
    const keys = new Set(de.detectPatterns(tokens, analyses).map((p) => p.key));
    for (const k of s.constructions ?? []) if (!keys.has(k)) out.push(`construction ${k} not recognised (found: ${[...keys].join(', ') || 'none'})`);
    for (const k of s.notConstructions ?? []) if (keys.has(k)) out.push(`construction ${k} should not be recognised`);
  }
  return out;
}

describe('German gold set', () => {
  it('is well formed: unique ids, a category and a text each, known-limit ids exist', () => {
    const ids = gold.sentences.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of gold.sentences) { expect(s.category, s.id).toBeTruthy(); expect(s.text, s.id).toBeTruthy(); }
    for (const id of Object.keys(limits)) expect(ids, `known limit ${id}`).toContain(id);
    expect(gold.sentences.length).toBeGreaterThanOrEqual(80);
  });

  it.each(gold.sentences.map((s) => [s.id, s.text, s] as const))('%s — %s', (_id, _text, s) => {
    const failures = failuresOf(s);
    if (limits[s.id] !== undefined) {
      expect(failures.length, `${s.id} is listed as a known limit ("${limits[s.id]}") but now passes: remove it from ${LIMITS_FILE}`).toBeGreaterThan(0);
      return;
    }
    expect(failures, s.note ?? s.disputed ?? '').toEqual([]);
  });

  it('summary by category (printed for the status document)', () => {
    const by = new Map<string, { n: number; pass: number }>();
    let pass = 0;
    for (const s of gold.sentences) {
      const ok = failuresOf(s).length === 0;
      const row = by.get(s.category) ?? { n: 0, pass: 0 };
      row.n++; if (ok) { row.pass++; pass++; }
      by.set(s.category, row);
    }
    const lines = [...by.entries()].map(([k, v]) => `${k} ${v.pass}/${v.n}`);
    console.info(`German gold set: ${pass} of ${gold.sentences.length} sentences pass; known limits ${Object.keys(limits).length}. ${lines.join('; ')}`);
    expect(pass + Object.keys(limits).length).toBeGreaterThanOrEqual(gold.sentences.length);
  });
});

/**
 * Reads the hand data out of the Thai adapter for the comparison (src/dict/compare.ts), and the word tokens out of
 * course documents. Browser-safe (no node modules); imports the adapter, never edits it.
 */
import { thAdapter, thLexicon, THAI_COMPOUNDS } from '../adapters/th';
import { annotationKey, mergeAnnotations } from '../adapters/thai/entries';
import { CORE_ANNOTATIONS } from '../adapters/thai/lexicon-core';
import { FUNCTION_ANNOTATIONS, FUNCTION_ENTRIES } from '../adapters/thai/function-words';
import { CLASSIFIER_ANNOTATIONS, CLASSIFIER_ENTRIES } from '../adapters/thai/classifiers';
import { BASE_PHRASE_RULES, PHRASE_UNITS } from '../adapters/thai/phrases';
import { THAI_ORTH_EXCEPTIONS, THAI_ORTH_SETTLED } from '../adapters/thai/orth-exceptions';
import { decodeThaiRespelling } from '../adapters/thai/orthography';
import type { CorpusToken, HandCategory, HandData, HandEntry, HandException, HandPhrase } from './compare';

const normalize = (s: string): string => thAdapter.normalize(s);

/** The ids of the adapter's sources, as package B names them (`adapter-th@<version>:hand` ...). */
export function handSourceIds(): HandData['sourceIds'] {
  const base = `adapter-${thAdapter.lang}@${thAdapter.version}`;
  return { hand: `${base}:hand`, phrases: `${base}:phrases`, orthExceptions: `${base}:orth-exceptions` };
}

/**
 * The hand lexicon as the adapter holds it, one row per (form, part of speech) entry.
 * Category: a classifier (part of speech CLF, or listed in classifiers.ts) first; then a function word (listed in
 * function-words.ts, or carrying a `role`); everything else is core vocabulary (the seed list in th.ts and
 * lexicon-core.ts).
 */
export function handEntries(): HandEntry[] {
  const annotations = mergeAnnotations(CORE_ANNOTATIONS, FUNCTION_ANNOTATIONS, CLASSIFIER_ANNOTATIONS);
  const clfSet = new Set<unknown>(CLASSIFIER_ENTRIES);
  const fnSet = new Set<unknown>(FUNCTION_ENTRIES);
  return thLexicon.entries.map((e) => {
    const ann = annotations.get(annotationKey(e.lemma, e.pos));
    const category: HandCategory = clfSet.has(e) || e.pos === 'CLF' ? 'classifier' : fnSet.has(e) || ann?.role ? 'function' : 'core';
    const row: HandEntry = { form: normalize(e.lemma), pos: e.pos, gloss: e.gloss, category };
    if (ann?.register?.length) row.register = [...ann.register];
    if (ann?.role) row.role = ann.role;
    if (ann?.counts) row.counts = ann.counts;
    if (e.translit) row.translit = e.translit;
    return row;
  });
}

/** Phrase units as headwords (the five base units whose written form is a continuous string, plus PHRASE_UNITS). */
export function handPhrases(): HandPhrase[] {
  const out: HandPhrase[] = [];
  for (const r of BASE_PHRASE_RULES) {
    if (r.display.includes('…') || r.display.includes('_')) continue; // a frame with a gap is not a headword
    out.push({ form: normalize(r.display), gloss: r.gloss, kind: r.kind });
  }
  for (const [form, gloss, kind] of PHRASE_UNITS) out.push({ form: normalize(form), gloss, kind });
  return out;
}

export function handExceptions(): HandException[] {
  const out: HandException[] = [];
  const tones = (surface: string, respelling: string): string[] | undefined => {
    try { return decodeThaiRespelling(normalize(surface), respelling).map((s) => s.tone as string); } catch { return undefined; }
  };
  for (const x of THAI_ORTH_EXCEPTIONS) out.push({ surface: normalize(x.surface), respelling: x.respelling, list: 'exception', note: x.note, tones: tones(x.surface, x.respelling) });
  for (const x of THAI_ORTH_SETTLED) out.push({ surface: normalize(x.surface), respelling: x.respelling, list: 'settled', tones: tones(x.surface, x.respelling) });
  return out;
}

export function handData(): HandData {
  return {
    lang: 'th',
    sourceIds: handSourceIds(),
    entries: handEntries(),
    phrases: handPhrases(),
    compounds: [...THAI_COMPOUNDS].map(normalize),
    exceptions: handExceptions(),
  };
}

/** The sentence texts of a course document (schema 2: sections > paragraphs > sentences), or [] for anything else. */
export function documentTexts(json: unknown): string[] {
  const out: string[] = [];
  const sections = (json as { sections?: unknown })?.sections;
  if (!Array.isArray(sections)) return out;
  for (const sec of sections) {
    const paragraphs = (sec as { paragraphs?: unknown })?.paragraphs;
    if (!Array.isArray(paragraphs)) continue;
    for (const p of paragraphs) {
      const sentences = (p as { sentences?: unknown })?.sentences;
      if (!Array.isArray(sentences)) continue;
      for (const s of sentences) {
        const text = (s as { text?: unknown })?.text;
        if (typeof text === 'string' && text.trim()) out.push(text);
      }
    }
  }
  return out;
}

/** Plain text: one piece per non-blank line. */
export const plainTexts = (text: string): string[] => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/** Word tokens of the given pieces of text, tokenized and analysed by the real adapter; `hand` = a lexicon analysis exists. */
export function corpusTokens(texts: readonly string[]): CorpusToken[] {
  const out: CorpusToken[] = [];
  for (const t of texts) {
    const tokens = thAdapter.tokenize(t);
    const analyses = thAdapter.analyze(tokens);
    tokens.forEach((tok, i) => {
      if (!tok.isWord) return;
      const cands = analyses[i]?.candidates ?? [];
      const hand = cands.some((c) => ((c as { origin?: string }).origin ?? 'hand') === 'hand');
      out.push({ form: tok.normalized, hand });
    });
  }
  return out;
}

/** Every form the dictionary lookup has to keep: the hand data and the corpus tokens. */
export function wantedForms(hand: HandData, corpus: readonly (readonly CorpusToken[])[]): Set<string> {
  const s = new Set<string>();
  for (const e of hand.entries) s.add(e.form);
  for (const p of hand.phrases) s.add(p.form);
  for (const c of hand.compounds) s.add(c);
  for (const x of hand.exceptions) s.add(x.surface);
  for (const toks of corpus) for (const t of toks) s.add(t.form);
  return s;
}

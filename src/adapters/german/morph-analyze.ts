/**
 * Analysis of one written word: reverse indexes built ONCE per lexicon view from the generated forms, then O(1)
 * lookups. Capital letters decide the noun readings; the closed classes are asked of the lexicon directly.
 */
import type { DeClosedForm, DeContraction, DeLexiconView, DeReading } from './types';
import { morphOfCells } from './types';
import { describeGermanMorph } from './morph-describe';
import { guessReadings } from './morph-guess';
import { adjectiveEntries, nounEntries, type Entry } from './morph-readings';
import { capitalise, isCapitalised } from './morph-util';
import { conjugateFull } from './morph-verb';
import { detachedEntries, participleAdjectiveEntries, verbEntries } from './morph-verbreadings';

interface Index {
  /** Noun forms, keyed exactly as written (capitalised). */
  nouns: Map<string, DeReading[]>;
  /** Verb and adjective forms, keyed lower-case; the readings with a detached prefix come last. */
  lower: Map<string, DeReading[]>;
  /** Finished answers by written form (bounded). */
  cache: Map<string, DeReading[]>;
}

const INDEXES = new WeakMap<DeLexiconView, Index>();
const CACHE_LIMIT = 50_000;

function push(map: Map<string, DeReading[]>, entries: readonly Entry[]): void {
  for (const [form, reading] of entries) {
    const list = map.get(form);
    if (list) list.push(reading);
    else map.set(form, [reading]);
  }
}

function buildIndex(lex: DeLexiconView): Index {
  const nouns = new Map<string, DeReading[]>();
  for (const n of lex.allNouns()) push(nouns, nounEntries(n));

  const main = new Map<string, DeReading[]>();
  const participles = new Map<string, DeReading[]>();
  const detached = new Map<string, DeReading[]>();
  for (const v of lex.allVerbs()) {
    const conj = conjugateFull(v);
    push(main, verbEntries(v, conj));
    push(participles, participleAdjectiveEntries(v, conj));
    push(detached, detachedEntries(v, conj));
  }
  for (const a of lex.allAdjectives()) push(main, adjectiveEntries(a));

  // main readings first (by confidence, listing order kept for ties), then participles used as adjectives, then detached prefixes
  const lower = new Map<string, DeReading[]>();
  for (const map of [main, participles, detached]) {
    for (const [form, list] of map) lower.set(form, [...(lower.get(form) ?? []), ...list]);
  }
  for (const [form, list] of lower) lower.set(form, list.map((r, i) => [r, i] as const).sort((a, b) => b[0].confidence - a[0].confidence || a[1] - b[1]).map(([r]) => r));
  return { nouns, lower, cache: new Map() };
}

function indexOf(lex: DeLexiconView): Index {
  let idx = INDEXES.get(lex);
  if (!idx) { idx = buildIndex(lex); INDEXES.set(lex, idx); }
  return idx;
}

// ---------------------------------------------------------------------------------------------------------------
// closed classes

function closedReading(c: DeClosedForm): DeReading {
  const morph = { ...(c.cells ? morphOfCells(c.cells) : {}), ...(c.morph ?? {}) };
  const reading: DeReading = {
    lemma: c.lemma, pos: c.pos, morph, confidence: 0.92, lemmaKnown: true, gloss: c.gloss,
    rule: `${c.lemma}, a listed form: ${describeGermanMorph(morph) || 'no ending to read'}`,
  };
  if (c.cells) reading.cells = c.cells.map((x) => ({ ...x }));
  if (c.role) reading.role = c.role;
  return reading;
}

/** im = in + dem: the preposition part is the longest shared beginning, the rest is the article's ending. */
function contractionReading(c: DeContraction, written: string): DeReading {
  let n = 0;
  while (n < c.preposition.length && n < written.length - 1 && written[n].toLowerCase() === c.preposition[n]) n++;
  const articleMorph = { ...morphOfCells([c.cell]), PronType: 'Art', Definite: 'Def' };
  return {
    lemma: c.preposition, pos: 'ADP', morph: {}, cells: [{ ...c.cell }], confidence: 0.92, lemmaKnown: true, gloss: c.gloss,
    rule: `contraction of ${c.preposition} + ${c.article}: ${describeGermanMorph(morphOfCells([c.cell]))} article`,
    parts: [
      { text: written.slice(0, n), start: 0, end: n, lemma: c.preposition, pos: 'ADP', kind: 'contracted' },
      { text: written.slice(n), start: n, end: written.length, lemma: 'der', pos: 'DET', morph: articleMorph, kind: 'contracted' },
    ],
  };
}

function plainReadings(lex: DeLexiconView, lower: string): DeReading[] {
  return lex.plain(lower).map((p) => {
    const r: DeReading = { lemma: p.lemma, pos: p.pos, morph: {}, confidence: 0.9, lemmaKnown: true, gloss: p.gloss, rule: `${p.lemma}, an uninflected word of the word list` };
    if (p.role) r.role = p.role;
    if (p.register) r.register = [...p.register];
    if (p.varieties) r.varieties = [...p.varieties];
    return r;
  });
}

// ---------------------------------------------------------------------------------------------------------------

const CAPITAL_NOUN = 'written with a capital, as German nouns are';
const CAPITAL_LOWER = 'written with a capital: possibly only the first word of a sentence';

function compute(word: string, lex: DeLexiconView, idx: Index): DeReading[] {
  const cap = isCapitalised(word);
  const lower = word.toLowerCase();
  const out: DeReading[] = [];
  if (cap) {
    const allCaps = word.length > 1 && word === word.toUpperCase();
    for (const r of idx.nouns.get(word) ?? (allCaps ? idx.nouns.get(capitalise(lower)) : undefined) ?? []) out.push({ ...r, rule: `${r.rule}; ${CAPITAL_NOUN}` });
  }
  const rest: DeReading[] = [];
  const con = lex.contraction(lower);
  if (con) rest.push(contractionReading(con, word));
  for (const c of lex.closed(lower)) rest.push(closedReading(c));
  rest.push(...plainReadings(lex, lower));
  rest.push(...(idx.lower.get(lower) ?? []));
  for (const r of rest) out.push(cap ? { ...r, rule: `${r.rule}; ${CAPITAL_LOWER}` } : r);
  return out.length ? out : guessReadings(word);
}

function clone(r: DeReading): DeReading {
  const c: DeReading = { ...r, morph: { ...r.morph } };
  if (r.cells) c.cells = r.cells.map((x) => ({ ...x }));
  if (r.parts) c.parts = r.parts.map((p) => ({ ...p, ...(p.morph ? { morph: { ...p.morph } } : {}) }));
  if (r.prefix) c.prefix = { ...r.prefix };
  if (r.register) c.register = [...r.register];
  if (r.varieties) c.varieties = [...r.varieties];
  return c;
}

/** Every context-free reading of one written word (capitalisation as written), best first. */
export function analyze(surface: string, lex: DeLexiconView): DeReading[] {
  const word = surface.normalize('NFC');
  if (!word) return [];
  const idx = indexOf(lex);
  let result = idx.cache.get(word);
  if (!result) {
    result = compute(word, lex, idx);
    if (idx.cache.size >= CACHE_LIMIT) idx.cache.clear();
    idx.cache.set(word, result);
  }
  return result.map(clone);
}

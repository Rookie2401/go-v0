/**
 * Analysis of one written word: reverse indexes built ONCE per lexicon view from the generated forms, then O(1)
 * lookups. Capital letters decide the noun readings; the closed classes are asked of the lexicon directly.
 */
import type { DeCell, DeClosedForm, DeContraction, DeLexiconView, DeReading } from './types';
import { morphOfCells } from './types';
import { describeGermanMorph } from './morph-describe';
import { deriveReadings, oldEnding } from './morph-derived';
import { buildPluralHeads, guessReadings, type PluralHeads } from './morph-guess';
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
  /** Plural forms of the known nouns, built the first time an unknown capitalised word needs them. */
  heads?: PluralHeads;
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

/**
 * The cells of a contraction: the article's own determiner cells, kept where the preposition governs the case
 * (im = in + dem: dative masculine and neuter). The lexicon's single `cell` is only the fallback.
 */
function contractionCells(c: DeContraction, lex: DeLexiconView): DeCell[] {
  const cases = lex.preposition(c.preposition)?.cases;
  const article = lex.closed(c.article).find((x) => x.pos === 'DET' && x.morph?.PronType === 'Art' && x.cells);
  const cells = (article?.cells ?? []).filter((x) => !cases || cases.includes(x.c));
  return cells.length ? cells.map((x) => ({ c: x.c, g: x.g })) : [{ c: c.cell.c, g: c.cell.g }];
}

/** im = in + dem: the preposition part is the longest shared beginning, the rest is the article's ending. */
function contractionReading(c: DeContraction, written: string, lex: DeLexiconView): DeReading {
  let n = 0;
  while (n < c.preposition.length && n < written.length - 1 && written[n].toLowerCase() === c.preposition[n]) n++;
  const cells = contractionCells(c, lex);
  const cellMorph = morphOfCells(cells);
  const articleMorph = { ...cellMorph, PronType: 'Art', Definite: 'Def' };
  return {
    lemma: c.preposition, pos: 'ADP', morph: {}, cells, confidence: 0.92, lemmaKnown: true, gloss: c.gloss,
    rule: `contraction of ${c.preposition} + ${c.article}: ${describeGermanMorph(cellMorph)} article`,
    // `text` is the WORD each part stands for (im = in + dem), which is what a reader is shown; `start` / `end` say which
    // letters of the written word belong to it. The letters alone ("i" + "m") are not words and must never be displayed.
    parts: [
      { text: c.preposition, start: 0, end: n, lemma: c.preposition, pos: 'ADP', kind: 'contracted' },
      { text: c.article, start: n, end: written.length, lemma: 'der', pos: 'DET', morph: articleMorph, kind: 'contracted' },
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

/** The readings the word list itself gives (listed forms and regular paradigms), with no derivation and no guess. */
function listed(word: string, lex: DeLexiconView, idx: Index): DeReading[] {
  const cap = isCapitalised(word);
  const lower = word.toLowerCase();
  const out: DeReading[] = [];
  if (cap) {
    const allCaps = word.length > 1 && word === word.toUpperCase();
    for (const r of idx.nouns.get(word) ?? (allCaps ? idx.nouns.get(capitalise(lower)) : undefined) ?? []) out.push({ ...r, rule: `${r.rule}; ${CAPITAL_NOUN}` });
  }
  const rest: DeReading[] = [];
  const con = lex.contraction(lower);
  if (con) rest.push(contractionReading(con, word, lex));
  for (const c of lex.closed(lower)) rest.push(closedReading(c));
  // a name is a name only with a capital (klein is not Klein, wolf is not Wolf), and it stands behind the ordinary readings
  // of a word that is also a verb, an adjective or a function word (Klein ist er nicht); the sentence layer moves it up
  // after a title or a first name (context-words.ts, decideNames)
  const plain = plainReadings(lex, lower);
  rest.push(...plain.filter((r) => r.pos !== 'PROPN'));
  rest.push(...(idx.lower.get(lower) ?? []));
  if (cap) rest.push(...plain.filter((r) => r.pos === 'PROPN'));
  for (const r of rest) out.push(cap ? { ...r, rule: `${r.rule}; ${CAPITAL_LOWER}` } : r);
  return out;
}

/** Listed readings; for a word the list does not hold, derived readings (diminutive, name genitive, clitic es, old full ending), then guesses. */
function compute(word: string, lex: DeLexiconView, idx: Index): DeReading[] {
  const own = listed(word, lex, idx);
  if (own.length) {
    // erquicket, salbest: spelled like a Konjunktiv I form (-et, -est), which is all the list gives; Luther's present indicative follows
    if (own.every((r) => r.pos === 'VERB' && r.morph.Mood === 'Sub') && /e(?:s)?t$/.test(word)) {
      return [...own, ...oldEnding(word, (w) => listed(w, lex, idx))];
    }
    return own;
  }
  const derived = deriveReadings(word, lex, (w) => listed(w, lex, idx));
  if (derived.length) return derived;
  if (!isCapitalised(word)) return guessReadings(word);
  idx.heads ??= buildPluralHeads(lex.allNouns());
  return guessReadings(word, idx.heads, (front) => listed(front, lex, idx).length > 0);
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

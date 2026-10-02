/**
 * Every context-free reading of one written Albanian form, best first. Coordinator's file: it only joins what the
 * packages built.
 *
 *   1. the closed classes (function-words.ts), every reading kept;
 *   2. the word list: each noun, adjective, adverb and verb generates its forms once (morph-noun, morph-adjective,
 *      morph-verb) into an index form → readings;
 *   3. clitic clusters, particle + clitic, apostrophe forms, an imperative with attached pronouns (clitics.ts);
 *   and only when none of these knows the form:
 *   4. the same word typed without ë / ç (orthography.ts) — read as the properly spelled form, and said so;
 *   5. a Gheg or older form related to its Standard equivalent (gheg.ts, historical.ts) — read through it, and said so;
 *   6. readings by ending (guessNoun, guessVerb): `lemmaKnown: false`, a guess, no gloss.
 *
 * A form that several word classes claim keeps all its readings and none above 0.6: the sentence decides (sentence.ts).
 * Nothing is modernised, respelled or dropped from the text; a relation to a Standard form is a statement about the
 * reading (`SqReading.relation`), never a change of the word.
 */
import { SQ_FUNCTION_READINGS } from './function-words';
import { cliticReadings } from './clitics';
import { ghegToStandard } from './gheg';
import { historicalToModern } from './historical';
import { SQ_ADJECTIVES, SQ_ADVERBS } from './lexicon-modifiers';
import { SQ_NOUNS } from './lexicon-nouns';
import { SQ_VERBS } from './lexicon-verbs';
import { adjectiveForms } from './morph-adjective';
import { guessNoun, nounForms } from './morph-noun';
import { guessVerb, verbForms } from './morph-verb';
import { restoreDiacritics, sqNormalize } from './orthography';
import type { SqForm, SqLexeme, SqReading } from './types';

const GENDER: Record<string, string> = { m: 'Masc', f: 'Fem', n: 'Neut' };
const isVerbal = (r: SqReading): boolean => r.pos === 'VERB' || r.pos === 'AUX';
const keyOf = (r: SqReading): string => `${r.lemma}|${r.pos}|${Object.keys(r.morph).sort().map((k) => `${k}=${r.morph[k]}`).join(';')}|${(r.parts ?? []).map((p) => p.text).join('+')}`;

/** The word list as one array, in a fixed order (nouns and names, adjectives, adverbs, verbs). */
export const SQ_LEXEMES: readonly SqLexeme[] = [...SQ_NOUNS, ...SQ_ADJECTIVES, ...SQ_ADVERBS, ...SQ_VERBS];

function readingOf(lex: SqLexeme, f: SqForm, listed: boolean): SqReading {
  const morph = { ...f.morph };
  if (lex.gender && (lex.pos === 'NOUN' || lex.pos === 'PROPN') && !morph.Gender) morph.Gender = GENDER[lex.gender];
  const r: SqReading = {
    lemma: lex.lemma, pos: lex.pos, morph, gloss: lex.gloss, confidence: listed ? 0.9 : 0.85, lemmaKnown: true,
    rule: f.form === lex.lemma && listed ? 'as listed' : f.rule.endsWith(` of ${lex.lemma}`) ? f.rule : `${f.rule} of ${lex.lemma}`, origin: listed ? 'hand' : 'rule',
  };
  const varieties = [...new Set([...(lex.varieties ?? []), ...(f.varieties ?? [])])];
  if (varieties.length) r.varieties = varieties;
  if (lex.register?.length) r.register = [...lex.register];
  if (lex.role) r.role = lex.role;
  if (lex.articulated) r.articulated = true;
  return r;
}

function formsOf(lex: SqLexeme): SqForm[] {
  switch (lex.pos) {
    case 'NOUN': case 'PROPN': return nounForms(lex);
    case 'ADJ': return adjectiveForms(lex);
    case 'VERB': case 'AUX': return verbForms(lex);
    default: return [{ form: lex.lemma, morph: {}, rule: 'as listed' }];
  }
}

let index: Map<string, SqReading[]> | undefined;
let problems: string[] = [];

/** form → readings of the word list (built once). A lexeme whose forms cannot be made is skipped and reported by `sqIndexProblems`. */
function wordIndex(): Map<string, SqReading[]> {
  if (index) return index;
  const map = new Map<string, SqReading[]>();
  problems = [];
  for (const lex of SQ_LEXEMES) {
    let forms: SqForm[];
    try { forms = formsOf(lex); } catch (e) { problems.push(`${lex.lemma}/${lex.pos}: ${e instanceof Error ? e.message : String(e)}`); continue; }
    const lemmaForm = sqNormalize(lex.lemma);
    for (const f of forms) {
      const form = sqNormalize(f.form);
      if (!form) continue;
      const list = map.get(form) ?? [];
      const r = readingOf(lex, f, form === lemmaForm);
      if (!list.some((x) => keyOf(x) === keyOf(r))) list.push(r);
      map.set(form, list);
    }
  }
  index = map;
  return map;
}

/** Lexemes whose forms could not be generated (should be empty; a test asserts it). */
export function sqIndexProblems(): string[] {
  wordIndex();
  return [...problems];
}

/** Readings of a form from the closed classes and the word list only (no clusters, no guesses). */
function listed(form: string): SqReading[] {
  const fn = SQ_FUNCTION_READINGS.get(form) ?? [];
  const open = wordIndex().get(form) ?? [];
  if (!fn.length) return open.map((r) => ({ ...r, morph: { ...r.morph } }));
  // a closed-class word that is also a noun, adjective or verb form (do, pa, para, mirë): every reading, none above 0.6
  const all = [...fn, ...open].map((r) => ({ ...r, morph: { ...r.morph } }));
  return open.length ? all.map((r) => ({ ...r, confidence: Math.min(r.confidence, 0.6) })) : all;
}

/** Is this written form a Standard Albanian form the adapter's own data knows? */
export const sqKnownForm = (form: string): boolean => SQ_FUNCTION_READINGS.has(form) || wordIndex().has(form);

const CACHE = new Map<string, SqReading[]>();
const CACHE_MAX = 40000;
const copy = (r: SqReading): SqReading => ({ ...r, morph: { ...r.morph }, ...(r.parts ? { parts: r.parts.map((p) => ({ ...p })) } : {}), ...(r.relation ? { relation: { ...r.relation } } : {}) });

/**
 * Every reading of a NORMALIZED form (see `sqNormalize`), best first; empty when nothing can be said.
 * Pure and cached: the same form always gives the same readings (copies are handed out).
 */
export function analyzeSqForm(form: string): SqReading[] {
  let hit = CACHE.get(form);
  if (!hit) {
    hit = analyse(form);
    if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value as string);
    CACHE.set(form, hit);
  }
  return hit.map(copy);
}

function analyse(form: string): SqReading[] {
  const known = listed(form);
  const verb = (f: string): SqReading[] => listed(f).filter(isVerbal);
  const fused = cliticReadings(form, verb);
  if (known.length || fused.length) {
    const out = [...known];
    for (const r of fused) if (!out.some((x) => keyOf(x) === keyOf(r))) out.push(r);
    // a form that is both a listed word and a fused cluster (ta, ia): the readings compete
    return known.length && fused.length ? out.map((r) => ({ ...r, confidence: Math.min(r.confidence, 0.6) })) : out;
  }

  // typed without ë / ç: the properly spelled word(s) it could be
  const restored = restoreDiacritics(form, sqKnownForm);
  if (restored.length) {
    const cap = restored.length === 1 ? 0.7 : 0.5;
    return restored.slice(0, 3).flatMap((standard) => listed(standard).map((r) => ({
      ...r, confidence: Math.min(r.confidence, cap),
      relation: { standard, period: 'sq-ascii', confidence: cap, rule: `typed without ë or ç: read as ${standard}` },
    })));
  }

  // a Gheg or an older form with a Standard equivalent the lists know
  const related = [...ghegToStandard(form, sqKnownForm), ...historicalToModern(form, sqKnownForm)];
  if (related.length) {
    const seen = new Set<string>();
    const out: SqReading[] = [];
    for (const c of related) {
      if (seen.has(c.standard)) continue;
      seen.add(c.standard);
      for (const r of listed(c.standard)) {
        out.push({
          ...r, confidence: Math.min(r.confidence, c.confidence),
          varieties: [...new Set([...(r.varieties ?? []), c.variety])],
          relation: { standard: c.standard, period: c.variety, confidence: c.confidence, rule: c.rule },
        });
      }
      if (seen.size >= 2) break;
    }
    if (out.length) return out;
  }

  // readings by ending: guesses
  const guesses = [...guessVerb(form), ...guessNoun(form)];
  const unique: SqReading[] = [];
  for (const g of guesses) if (!unique.some((x) => keyOf(x) === keyOf(g))) unique.push(g);
  return unique.slice(0, 4);
}

/** Every form the word list generates, with its readings (for validation against other sources). */
export function sqGeneratedForms(): ReadonlyMap<string, SqReading[]> {
  return wordIndex();
}

/**
 * Which DIALECT a sentence is written in: Gheg or Standard Albanian. The sentence decides, on what is written in it and nothing
 * else; a sentence whose words are the same in both is not assigned to either.
 *
 * Why a sentence and not a word. Most Albanian words are written alike in Gheg and in the Standard (which rests on Tosk), so a
 * single word seldom says where it belongs. A sentence does when it holds forms the two write differently:
 *
 *   Gheg writes                         where the Standard writes
 *   asht / âsht / osht                  është
 *   nji                                 një
 *   tue + participle                    duke + participle
 *   a nasal vowel (â ê î ô û ŷ)         no such letter
 *   participles in -ue, -ye, -un        -uar, -yer, -ur
 *   me + participle (the infinitive)    për të + participle, or the subjunctive
 *   shpi, un, kênë                      shtëpi, unë, qenë
 *   tash, çka (also heard in Standard)  çfarë
 *   everyday spoken forms (ni, kom, jom, amo, aj, naj, gjo, veq, hala, kqyr; participles cut short: punu, shku, kalua)
 *
 * Each form found is a point for its side, counted once however often it recurs: two for a form only one side writes (asht, nji,
 * a nasal vowel, a spoken Gheg form; on the Standard side only është), one for a form that leans (a participle ending, tash /
 * çka, me before a verb; on the Standard side një, duke, unë, shtëpi …). The two sides are not weighed alike, on purpose: Gheg
 * speakers and writers use një, duke and tani freely beside their own forms, so those say little, and calling a Gheg sentence
 * Standard would credit the learner's main target with what they met in a dialect. The sentence is read as
 *
 *   Gheg       when the Gheg points are two or more and outnumber the Standard ones;
 *   Standard   when the Standard points are three or more and the sentence holds no Gheg form at all;
 *   undecided  otherwise: it is then READ as Standard, the course's target, and says that this is a default, not a finding.
 *
 * Only a decision made on the text (`evidence: 'text'`) is recorded as the dialect of what the learner met; a default is never
 * recorded (packages/golearn-extension/src/store `encounterVariety`), so a sentence that tells nothing stays unclassified.
 *
 * What this is not. Gheg is a group of spoken varieties with no single written norm, and writers mix: a Kosovo newspaper is
 * Standard with the odd Gheg word, older Shkodër printing is Gheg throughout. The rules above are machine-drafted from the same
 * correspondences as gheg.ts and have not been checked by a speaker. Dialectal Tosk, Arbëresh and Arvanitika are not told apart
 * here at all: the adapter has no source for them beyond a dictionary's own label on a word. Nothing in the text is changed.
 */
import type { AnalysisCandidate, RawToken } from '../../core';
import { ghegListing } from './gheg';
import { sqKnownForm } from './morphology';

/** The adapter's own codes (albanian/varieties.ts): 'sq' Standard Albanian, 'aln' Gheg. */
export type SqDialect = 'sq' | 'aln';

export interface SqDialectDecision {
  dialect: SqDialect;
  /** `text`: the sentence's own forms decided; `default`: nothing in it decided, it is read as Standard by default. */
  evidence: 'text' | 'default';
  /** In plain words, for the card. */
  basis: string;
  /** The forms that counted for each side, as written (lower case), in order of appearance. */
  ghegForms: string[];
  standardForms: string[];
  ghegPoints: number;
  standardPoints: number;
}

export const DIALECT_RULES = {
  /** Points a sentence needs before it is assigned to Gheg. */
  threshold: 2,
  /** Points it needs before it is assigned to the Standard (more, and with no Gheg form at all: see the header). */
  standardThreshold: 3,
  strong: 2,
  weak: 1,
  /** At most this many points from participle endings on one side: a long narrative is not Standard because it has six participles. */
  participleCap: 2,
} as const;

const NASAL = /[âêîôûŷ]/u;
/** The one Standard form Gheg speech and writing do not use beside their own (asht, âsht, osht). */
const STANDARD_STRONG: ReadonlySet<string> = new Set(['është', "s'është"]);
/**
 * Standard forms that lean Standard: Gheg has its own form for each, and Gheg speakers use these too (in the Gheg treebank's
 * transcribed speech një and duke stand beside ni and tu in the same sentence). "tani" is not here at all: it is everywhere in that speech.
 */
const STANDARD_WEAK: ReadonlySet<string> = new Set(['një', 'duke', 'çfarë', 'unë', 'qenë', 'shtëpi', 'shtëpia', 'shtëpinë', 'shtëpisë']);
/**
 * Everyday spoken (above all Kosovo) Gheg forms that are not words of the Standard at all: ni "a, one", kom / jom "I have / am",
 * amo "but", aj "he", naj "some", gjo "thing", veq "only", hala "still", nashta "maybe", kqyr "look" … A reader meets them in
 * informal writing; none has a reading in the word list, so they are recognised here by their spelling alone.
 */
const SPOKEN_GHEG: ReadonlySet<string> = new Set([
  'ni', 'niher', 'najher', 'naj', 'najsen', 'amo', 'aj', 'kom', 'jom', 'qka', 'veq', 'hala', 'nashta', 'gjo', 'sen', 'qashtu', 'qishtu', 'kqyr', 'kshyr', 'kerkush', 'kërkush',
]);
/** A participle cut short, as spoken Gheg has it: punu, shku (Standard punuar, shkuar), kalua (kaluar). Only when the Standard participle is a form the list knows. */
const shortParticiple = (form: string): boolean => !sqKnownForm(form) && ((form.length >= 4 && form.endsWith('u') && sqKnownForm(`${form}ar`)) || (form.length >= 5 && form.endsWith('ua') && sqKnownForm(`${form}r`)));

const isGhegReading = (c: AnalysisCandidate): boolean => (c.varieties ?? []).some((v) => v === 'aln' || v.startsWith('aln-'));
const isParticiple = (c: AnalysisCandidate | undefined): boolean => c?.pos === 'VERB' && c.morph?.VerbForm === 'Part';

/** The dialect of one sentence, from its tokens and their readings (best first, as the sentence layer left them). */
export function sentenceDialect(tokens: RawToken[], candidates: AnalysisCandidate[][]): SqDialectDecision {
  const R = DIALECT_RULES;
  const ghegForms: string[] = [], standardForms: string[] = [];
  let gheg = 0, standard = 0, ghegParticiples = 0, standardParticiples = 0;
  const counted = new Set<string>(); // a form counts once for its side, however often the sentence repeats it
  const words: number[] = [];
  tokens.forEach((t, i) => { if (t.isWord) words.push(i); });

  words.forEach((i, w) => {
    const form = tokens[i].normalized;
    const cands = candidates[i] ?? [];
    const top = cands[0];
    const prev = w > 0 ? tokens[words[w - 1]].normalized : undefined;
    const prev2 = w > 1 ? tokens[words[w - 2]].normalized : undefined;

    // ── Gheg ──
    const listing = ghegListing(form);
    const short = shortParticiple(form);
    const first = !counted.has(form);
    counted.add(form);
    if (!first) { /* counted already */ }
    else if (listing === 'strong' || NASAL.test(form) || SPOKEN_GHEG.has(form)) { gheg += R.strong; ghegForms.push(form); }
    else if (listing === 'weak') { gheg += R.weak; ghegForms.push(form); }
    else if (short && prev !== 'u') {
      if (ghegParticiples < R.participleCap) { gheg += R.weak; ghegParticiples += 1; }
      ghegForms.push(form);
    }
    else if (cands.length > 0 && cands.every(isGhegReading) && prev !== 'u') {
      // a form the Standard does not have, read only through a Gheg correspondence (punue → punuar, grue → grua). Not after "u":
      // "u thye", "u kthye" are the Standard's own non-active aorist, which the word list may lack and the -ye pattern would misread.
      if (ghegParticiples < R.participleCap) { gheg += R.weak; ghegParticiples += 1; }
      ghegForms.push(form);
    }
    // the Gheg infinitive: "me" directly before a participle ("me punue", "me marrë", "me shku"); Standard "me" is "with" and takes a
    // noun. One point only: the Standard has a few fixed phrases of the same shape (me thënë të drejtën, me qenë se).
    if (prev === 'me' && !counted.has(`me ${form}`) && (short || isParticiple(top) || (cands.length > 0 && cands.every(isGhegReading) && cands.some(isParticiple)))) {
      counted.add(`me ${form}`);
      gheg += R.weak;
      ghegForms.push(`me ${form}`);
    }

    // ── Standard ──
    if (!first) { /* counted already */ }
    else if (STANDARD_STRONG.has(form)) { standard += R.strong; standardForms.push(form); }
    else if (STANDARD_WEAK.has(form)) { standard += R.weak; standardForms.push(form); }
    else if (isParticiple(top) && !isGhegReading(top!) && /(?:uar|yer|ur)$/u.test(form) && prev !== 'me') {
      if (standardParticiples < R.participleCap) { standard += R.weak; standardParticiples += 1; standardForms.push(form); }
    }
    // the Standard's own infinitive-like construction: "për të" + participle
    if (first && prev === 'të' && prev2 === 'për' && isParticiple(top) && !isGhegReading(top!)) { standard += R.weak; standardForms.push(`për të ${form}`); }
  });

  const list = (forms: string[]): string => [...new Set(forms)].slice(0, 4).join(', ');
  const base = { ghegForms, standardForms, ghegPoints: gheg, standardPoints: standard };
  if (gheg >= R.threshold && gheg > standard) {
    const beside = standard > 0 ? `, beside fewer Standard ones (${list(standardForms)})` : ' and no form only the Standard writes';
    return { dialect: 'aln', evidence: 'text', basis: `the sentence has Gheg forms (${list(ghegForms)})${beside}`, ...base };
  }
  if (standard >= R.standardThreshold && gheg === 0) {
    return { dialect: 'sq', evidence: 'text', basis: `the sentence has forms the Standard writes and Gheg writes otherwise (${list(standardForms)}), and no Gheg form`, ...base };
  }
  if (gheg > 0 && standard > 0) {
    return { dialect: 'sq', evidence: 'default', basis: `the sentence mixes Gheg forms (${list(ghegForms)}) and Standard ones (${list(standardForms)}); its dialect is not settled, so it is read as Standard by default`, ...base };
  }
  if (gheg > 0) {
    return { dialect: 'sq', evidence: 'default', basis: `one form leans Gheg (${list(ghegForms)}), which is not enough to call the sentence Gheg; it is read as Standard by default`, ...base };
  }
  if (standard > 0) {
    return { dialect: 'sq', evidence: 'default', basis: `the sentence has forms that lean Standard (${list(standardForms)}), which Gheg speakers use too: not enough to settle it; it is read as Standard by default`, ...base };
  }
  return { dialect: 'sq', evidence: 'default', basis: 'nothing in the sentence tells Gheg from Standard (most words are written alike in both); it is read as Standard, the course’s target, by default', ...base };
}

/**
 * Every reading of every word says which dialect its sentence was read in: `notes.period` ('aln' | 'sq', the adapter's variety
 * codes), `notes.periodBasis` (plain words) and `notes.periodEvidence` ('text' | 'default'). The same three notes the Greek and
 * Hebrew analysers write for a period, so the card, the reader's events and the learner model treat a dialect as they treat a
 * period. Candidates are copied, never written to.
 */
export function stampSqDialect(tokens: RawToken[], candidates: AnalysisCandidate[][]): AnalysisCandidate[][] {
  const d = sentenceDialect(tokens, candidates);
  return candidates.map((cands, i) => (tokens[i]?.isWord
    ? cands.map((c) => ({ ...c, notes: { ...c.notes, period: d.dialect, periodBasis: d.basis, periodEvidence: d.evidence } }))
    : cands));
}

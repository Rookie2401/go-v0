/**
 * Hindi word forms by rule: nouns (direct, oblique, vocative; the marked -ा / -ी classes and the unmarked ones),
 * adjectives that agree and those that do not, pronouns with their oblique and fused forms (मुझे, मुझसे, उसने, किसको),
 * the genitive का / के / की, and verbs — stem, infinitive, the imperfective and perfective participles, subjunctive,
 * future, commands at three levels of politeness, the conjunctive कर / करके, irregular perfectives (गया, किया, लिया,
 * दिया, हुआ, पिया), causatives related to their base verb.
 *
 * A reading says how it was reached (`rule`, in plain words), how sure it is, and whether the lemma is one the word
 * list vouches for. A lemma that is only inferred stays at 0.6 or less. Feature names and values: docs/PLAN12.md.
 *
 * Package H2. EVERYTHING HERE IS MACHINE-DRAFTED from the author's own knowledge of Hindi grammar (no external source,
 * no corpus); it is checked only by its own tests and by the coordinator's held-out tables. Where a rule is not safe
 * the reading is returned with a lower confidence, never as the single confident answer.
 *
 * Structure: morph-orth.ts (spelling), morph-noun.ts (nouns, adjectives), morph-pronoun.ts (closed table),
 * morph-verb.ts + morph-verb-read.ts (verbs), morph-describe.ts (plain words). Analysis generates and compares; it
 * never reasons about a form that the generator could not have produced.
 */
import type { PartOfSpeech, RegisterTag, WordPart } from '../../core';
import { describeMorph } from './morph-describe';
import { adjReadings, inflectAdj, inflectNoun, nounReadings } from './morph-noun';
import { fold, isDevanagariWord, nfc, validWordShape } from './morph-orth';
import { inflectClosed, pronounReadings } from './morph-pronoun';
import type { Ctx, Raw } from './morph-types';
import { inflectVerb, verbReadings } from './morph-verb-read';
import { walaReadings } from './morph-wala';

/** What the word list knows about a lemma, for the rules that depend on it. */
export interface HindiLemmaInfo {
  pos: PartOfSpeech;
  /** Nouns: the gender decides the paradigm. */
  gender?: 'm' | 'f' | 'mf';
  /** An adjective or noun that does not change its ending (सुंदर, लाल; the noun पिता, राजा, नेता: masculine in -ा that keeps it). */
  invariant?: boolean;
  /** Verbs: takes ने in the perfective (transitive in the relevant sense). Unknown ⇒ undefined, never guessed. */
  ergative?: boolean;
  /** Verbs: the base verb this one is the causative of (कराना → करना, दिखाना → देखना). */
  causativeOf?: string;
}

export interface HindiAnalyzeOptions {
  /** Is this lemma (with this part of speech, when given) in the word list? Without it every lemma is inferred. */
  knownLemma?(lemma: string, pos?: PartOfSpeech): boolean;
  lemmaInfo?(lemma: string, pos: PartOfSpeech): HindiLemmaInfo | undefined;
}

export interface HindiAnalysis {
  lemma: string;
  pos: PartOfSpeech;
  morph: Record<string, string>;
  /** A fused word: stem + postposition or particle (उसने, मुझसे, इसीलिए …). Offsets within the form. */
  parts?: WordPart[];
  register?: RegisterTag[];
  /** In plain words, how the form was reached ("masculine noun in -ा, oblique plural"). */
  rule: string;
  /** Extra facts: `derivedFrom` is the base lemma of an abstract noun in -ता / -पन / -पना. */
  notes?: Record<string, string>;
  /** True when the lemma was confirmed by `knownLemma`; a rule-only guess stays at 0.6 or less. */
  lemmaKnown: boolean;
  confidence: number;
}

/** At most this many readings of a form whose lemmas nobody vouches for. */
const GUESS_CAP = 4;
/** A guess this much weaker than the best guess is explained by it and left out. */
const GUESS_SPREAD = 0.15;

function makeCtx(opts: HindiAnalyzeOptions): Ctx {
  const has = typeof opts.knownLemma === 'function';
  return {
    hasList: has,
    known: (l, p) => (has ? !!opts.knownLemma!(l, p) : false),
    knownAny: (l, p) => (has ? !!opts.knownLemma!(l, p) || !!opts.knownLemma!(l) : false),
    knownVerb: (l) => (has ? !!opts.knownLemma!(l, 'VERB') || !!opts.knownLemma!(l, 'AUX') : false),
    info: (l, p) => (typeof opts.lemmaInfo === 'function' ? opts.lemmaInfo(l, p) : undefined),
  };
}

/** The reading without its person: the variants of one finite form (third / first / second) share it. */
const groupKey = (r: { lemma: string; pos: string; morph: Record<string, string> }): string => {
  const { Person: _p, Polite: _q, ...rest } = r.morph;
  void _p; void _q;
  return `${r.lemma}|${r.pos}|${JSON.stringify(rest)}`;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Every reading the rules give for one form (NFC), best first. Empty when nothing can be derived. */
export function analyzeHindiForm(form: string, opts: HindiAnalyzeOptions = {}): HindiAnalysis[] {
  if (!form) return [];
  const w0 = nfc(form);
  if (!isDevanagariWord(w0)) return [];
  const w = fold(w0);
  const ctx = makeCtx(opts);
  const raws: Raw[] = [];
  for (const r of pronounReadings(w, ctx)) raws.push(r);
  for (const r of verbReadings(w, w0, ctx)) raws.push(r);
  for (const r of nounReadings(w, w0, ctx)) raws.push(r);
  for (const r of adjReadings(w, w0, ctx)) raws.push(r);
  for (const r of walaReadings(w, w0, ctx)) raws.push(r);
  // parts slice the form as written (a chandrabindu stays a chandrabindu)
  if (w0 !== w) for (const r of raws) if (r.parts) r.parts = r.parts.map((p) => ({ ...p, text: w0.slice(p.start, p.end) }));
  if (!raws.length) return [];

  // the same reading reached twice (two classes of one lemma) is one reading
  const seen = new Set<string>();
  const list = raws.filter((r) => {
    // a lemma that cannot be a Hindi word shape (…ाआ, a vowel sign after a vowel) is never returned unless the list itself holds it
    if (!r.known && !validWordShape(r.lemma)) return false;
    const k = `${r.lemma}|${r.pos}|${JSON.stringify(r.morph)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const known = list.filter((r) => r.known);
  const ambiguous = new Set(known.map((r) => r.paradigm)).size >= 2;
  const toAnalysis = (r: Raw, confidence: number): HindiAnalysis => ({
    lemma: r.lemma, pos: r.pos, morph: r.morph, ...(r.parts ? { parts: r.parts } : {}), ...(r.register ? { register: r.register } : {}), ...(r.notes ? { notes: { ...r.notes } } : {}),
    rule: !r.known && r.tier === 'guess' ? `${r.rule}; ${r.lemma} is not in the word list, this is the rule alone` : r.rule,
    lemmaKnown: r.known, confidence: round2(confidence),
  });

  const distinctKnown = new Set(known.map(groupKey)).size;
  const knownOut = known
    .map((r, i) => ({ r, i, c: ambiguous ? 0.7 : r.tier === 'assumed' ? 0.8 : distinctKnown >= 2 ? 0.85 : 0.9 }))
    .sort((a, b) => b.c - a.c || b.r.prior - a.r.prior || a.i - b.i)
    .map((x) => toAnalysis(x.r, x.c));

  const rest = list.filter((r) => !r.known);
  const closedRest = rest.filter((r) => r.tier === 'closed');
  let guesses = list.some((r) => r.tier === 'closed') ? [] : rest.filter((r) => r.tier === 'guess');
  if (guesses.length) {
    const top = Math.max(...guesses.map((r) => r.prior));
    guesses = guesses.filter((r) => r.prior >= top - GUESS_SPREAD && (!known.length || r.prior >= 0.57));
  }
  const ordered = guesses.map((r, i) => ({ r, i })).sort((a, b) => b.r.prior - a.r.prior || a.i - b.i).map((x) => x.r);
  // the person-variants of one guess are one guess
  const cap = known.length ? 2 + new Set(closedRest.map(groupKey)).size : GUESS_CAP;
  const kept = new Set<string>();
  const unknownOut = [...closedRest, ...ordered]
    .filter((r) => {
      const k = groupKey(r);
      if (kept.has(k)) return true;
      if (kept.size >= cap) return false;
      kept.add(k);
      return true;
    })
    .map((r) => toAnalysis(r, Math.min(0.6, r.prior)));
  return [...knownOut, ...unknownOut];
}

/** The forms of a lemma with their features: a noun's or adjective's paradigm, a verb's stem, participles and finite forms. */
export function inflectHindi(lemma: string, pos: PartOfSpeech, info?: HindiLemmaInfo): Array<{ form: string; morph: Record<string, string> }> {
  const l = nfc(lemma);
  let rows: Array<{ form: string; morph: Record<string, string> }>;
  switch (pos) {
    case 'NOUN': case 'PROPN': rows = inflectNoun(l, info); break;
    case 'VERB': case 'AUX': rows = inflectVerb(l, info?.causativeOf); break;
    case 'PRON': rows = inflectClosed(l) ?? []; break;
    case 'ADJ': case 'DET': case 'ADP': case 'NUM': rows = inflectClosed(l) ?? (pos === 'ADP' ? [] : inflectAdj(l, info)); break;
    default: rows = [];
  }
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.form}|${JSON.stringify(r.morph)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** कहना → कह; undefined when the lemma is not an infinitive in -ना. */
export function hindiVerbStem(lemma: string): string | undefined {
  return lemma.endsWith('ना') && lemma.length > 2 ? lemma.slice(0, -2) : undefined;
}

/** "feminine singular, perfective participle", "oblique plural", "polite command": plain words for a feature bundle. */
export function describeHindiMorph(morph: Record<string, string>, pos?: PartOfSpeech): string {
  return describeMorph(morph, pos);
}

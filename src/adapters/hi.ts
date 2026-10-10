/**
 * Hindi adapter. NFC identity only (no case folding); nukta, chandrabindu, matras and virama stay inside tokens because
 * Intl.Segmenter('hi') keeps combining marks in the word. NFC decomposes the precomposed nukta letters (U+0958…U+095F): the
 * canonical form is the decomposed one (ज़ = ज + ़), so ज़ and ज are different forms and nothing folds them. A variant
 * spelling (हिंदी / हिन्दी, गई / गयी, a word with and without its nukta) is related through `hindiSpellingVariants` and
 * a reading reached that way says so in `notes.variantOf`; the text itself is never changed.
 *
 * Layers, in the order a token meets them: the hand word list (src/adapters/hindi/lexicon-*.ts, about 1,500 lemmas, the
 * closed classes with every form) → the morphology engine (hindi/morphology.ts: rule readings of any noun, adjective,
 * pronoun or verb form, `knownLemma` answered from the word list) → the same two steps for each spelling variant of the form
 * → nothing (an empty list: the importer then asks a dictionary). A word-list reading is confident and glossed. A rule reading
 * of a lemma the list holds is confident and glossed from the list; a lemma the list does not hold is `unconfirmed`,
 * 0.6 at most, with no gloss and a note saying the lemma is inferred. Then the neighbour rules of hindi/disambiguate.ts order
 * the readings of a homograph (that is not a parser). Phrase units come from hindi/phrases.ts, constructions from
 * hindi/constructions.ts, sentence boundaries from hindi/sentences.ts, writing checks from hindi/production.ts, and script
 * decoding from hindi/script.ts / pronunciation.ts / translit.ts; this file only wires them together.
 * Where a sibling module returns nothing the adapter keeps the few older rules of its first version (three course phrases,
 * the compound-verb and conjunct-verb phrases, three patterns, two writing checks) as a fallback.
 * The data is machine-drafted and has not been checked by a native speaker.
 */
import type {
  AdapterSupport, AnalysisCandidate, AnalysisSourceInfo, AnalyzedToken, ErrorCandidate, LanguageAdapter, PatternCandidate,
  PartOfSpeech, PhraseCandidate, PronunciationSupport, RawToken, RegisterTag,
} from '../core';
import {
  Lexicon, hasPos, makeWordTokenizer, matchPhraseRules, nfc, speechNormalizeGeneric, type LexEntry, type PhraseRule,
} from './shared';
import { analyzeHindiForm, describeHindiMorph, type HindiAnalysis, type HindiLemmaInfo } from './hindi/morphology';
import { annotationKey, buildRows, parseRows, type HiAnnotation } from './hindi/entries';
import { FUNCTION_ROWS } from './hindi/lexicon-function';
import { NUMBER_TIME_ROWS } from './hindi/lexicon-numbers-time';
import { VERB_ROWS } from './hindi/lexicon-verbs';
import { NOUN_HOME_ROWS } from './hindi/lexicon-nouns-home';
import { NOUN_WORLD_ROWS } from './hindi/lexicon-nouns-world';
import { NOUN_FAITH_ROWS } from './hindi/lexicon-nouns-faith';
import { ADJECTIVE_ROWS } from './hindi/lexicon-modifiers';
import { COURSE_ROWS } from './hindi/lexicon-course';
import { VERB_MORE_ROWS } from './hindi/lexicon-more-verbs';
import { WORD_MORE_ROWS } from './hindi/lexicon-more-words';
import { EXTRA_MORE_ROWS } from './hindi/lexicon-more-extra';
import { FRAME_MORE_ROWS } from './hindi/lexicon-more-frames';
import { GAP_FREQUENT_ROWS, GAP_NAME_ROWS, GAP_NUMBER_ROWS, GAP_ROWS } from './hindi/lexicon-gap-words';
import { LADDER_FIX_ROWS } from './hindi/lexicon-ladder-fixes';
import { registerOf } from './hindi/registers';
import { isNounFirst } from './hindi/noun-first';
import { HI_VARIETIES } from './hindi/varieties';
import { hindiSearchForm, hindiSpellingVariants } from './hindi/script';
import { decodeHindi, decodeHindiWithPronunciation, describeHindiOrthFeature, hindiOrthFeatures } from './hindi/pronunciation';
import { transliterateHindi } from './hindi/translit';
import { detectHindiPhrases } from './hindi/phrases';
import { detectHindiConstructions } from './hindi/constructions';
import { disambiguateHindi } from './hindi/disambiguate';
import { segmentHindiSentences } from './hindi/sentences';
import { checkHindiProduction } from './hindi/production';
import { hiParadigm, hindiCellsFor, type HiParadigmContext } from './hindi/paradigm';
import { hiFeaturesFromTableTags } from './hindi/table-tags';

const LANG = 'hi' as const;
// '3': the fix batches after '2' changed what is stored (persons and cells as separate readings, causatives, the
// progressive, transitivity notes, the list-driven nukta relation, ~1,000 more lemmas), so imported Hindi texts are re-analysed
// '4': the ladder plan's gaps (data/ladder/hi/PLAN.md 6-7): ~230 more lemmas (frame words, numerals 31-99, names), the everyday noun first
// for words written like a verb form (गाड़ी, भाई, सही, फल, the name सीता: hindi/noun-first.ts), कमरों read as कमरा
// '5': the first reading of the ladder (101 units): जी after a name or title, ~20 more words, and the neighbour rules of hindi/ladder-context.ts (किरण, सीख, पूरी, सजा, सोता, बिल …)
const VERSION = '6';
const ANALYZER = `adapter-${LANG}@${VERSION}`;

/** Where the adapter's own data comes from. All of it is machine-drafted: none has been checked by a native speaker. */
export const HI_SOURCE_IDS = {
  hand: `${ANALYZER}:hand`,
  phrases: `${ANALYZER}:phrases`,
  constructions: `${ANALYZER}:constructions`,
  rules: `${ANALYZER}:rules`,
} as const;

const HI_SOURCES: Record<string, AnalysisSourceInfo> = {
  [HI_SOURCE_IDS.hand]: { id: HI_SOURCE_IDS.hand, label: 'Course word list', origin: 'hand', reviewStatus: 'machine-drafted', version: VERSION },
  [HI_SOURCE_IDS.phrases]: { id: HI_SOURCE_IDS.phrases, label: 'Course phrase list', origin: 'hand', reviewStatus: 'machine-drafted', version: VERSION },
  [HI_SOURCE_IDS.constructions]: { id: HI_SOURCE_IDS.constructions, label: 'Course grammar patterns', origin: 'hand', reviewStatus: 'machine-drafted', version: VERSION },
  [HI_SOURCE_IDS.rules]: { id: HI_SOURCE_IDS.rules, label: 'Hindi word-form rules', origin: 'rule', reviewStatus: 'machine-drafted', version: VERSION },
};

const normalize = (s: string) => nfc(s);

// ── the word list: rows (text blocks) → entries ──
/**
 * A row that cannot be read or built is collected here and skipped, so that a typo in a lexicon file never stops the module
 * from loading (every adapter test imports it). The lexicon test asserts that the list is empty.
 */
export const hiLexiconProblems: string[] = [];
const ROWS = [
  ...parseRows(FUNCTION_ROWS, 'function', hiLexiconProblems), ...parseRows(NUMBER_TIME_ROWS, 'numbers-time', hiLexiconProblems),
  ...parseRows(VERB_ROWS, 'verbs', hiLexiconProblems), ...parseRows(NOUN_HOME_ROWS, 'nouns-home', hiLexiconProblems),
  ...parseRows(NOUN_WORLD_ROWS, 'nouns-world', hiLexiconProblems), ...parseRows(NOUN_FAITH_ROWS, 'nouns-faith', hiLexiconProblems),
  ...parseRows(ADJECTIVE_ROWS, 'modifiers', hiLexiconProblems), ...parseRows(COURSE_ROWS, 'course', hiLexiconProblems),
  ...parseRows(VERB_MORE_ROWS, 'more-verbs', hiLexiconProblems), ...parseRows(WORD_MORE_ROWS, 'more-words', hiLexiconProblems),
  ...parseRows(EXTRA_MORE_ROWS, 'more-extra', hiLexiconProblems),
  ...parseRows(FRAME_MORE_ROWS, 'more-frames', hiLexiconProblems),
  ...parseRows(GAP_ROWS, 'gap-words', hiLexiconProblems), ...parseRows(GAP_FREQUENT_ROWS, 'gap-frequent', hiLexiconProblems),
  ...parseRows(GAP_NUMBER_ROWS, 'gap-numbers', hiLexiconProblems), ...parseRows(GAP_NAME_ROWS, 'gap-names', hiLexiconProblems),
  ...parseRows(LADDER_FIX_ROWS, 'ladder-fixes', hiLexiconProblems),
];
const BUILT = buildRows(ROWS, new Set(), hiLexiconProblems);
const ANNOTATIONS: Map<string, HiAnnotation> = BUILT.annotations;

/**
 * When a surface belongs to two entries the earlier one is listed first, and the closed classes come before the open ones
 * (की is the genitive before it is "did", पर is "on" before it is "but", दो is "two" before it is "give!").
 */
const POS_RANK: Record<string, number> = {
  ADP: 0, PRON: 1, DET: 2, CONJ: 3, SCONJ: 4, PART: 5, AUX: 6, ADV: 7, INTJ: 8, NUM: 9, VERB: 10, ADJ: 11, NOUN: 12, PROPN: 13,
};
const ORDERED = [...BUILT.entries].sort((a, b) => (POS_RANK[a.pos] ?? 99) - (POS_RANK[b.pos] ?? 99));

export const hiLexicon = new Lexicon(ORDERED, normalize);

/** What the word list holds, for the readiness table and the tests. */
export const hiLexiconStats = {
  lemmas: hiLexicon.entries.length,
  duplicates: BUILT.duplicates,
  byPos: hiLexicon.entries.reduce<Record<string, number>>((m, e) => { m[e.pos] = (m[e.pos] ?? 0) + 1; return m; }, {}),
};

/** The domains a row names (family, food, church …); kept beside the entries, like the register tags. */
export function hiDomainsOf(lemma: string, pos?: string): string[] {
  const ann = pos ? ANNOTATIONS.get(annotationKey(lemma, pos as never)) : [...ANNOTATIONS].find(([k]) => k.startsWith(`${lemma}|`))?.[1];
  return ann?.domains ? [...ann.domains] : [];
}

/** What the word list knows about a lemma, for the rules that depend on it (gender, a noun that does not change, ने, a causative). */
export function hiLemmaInfo(lemma: string, pos: string): HindiLemmaInfo | undefined {
  const info = ANNOTATIONS.get(annotationKey(lemma, pos as never))?.info;
  return info ? { ...info } : undefined;
}

// ── spelling relations ──
// A form's identity is its NFC text, the nukta kept: ज़ and ज are different letters and nothing is folded. What the adapter does
// know is which spellings of the LIST's words differ only by a nukta (or by an `also:` spelling written on a row), so that a text
// spelled the other way is still read as that word - the reading says so in `notes.variantOf`, the text is never rewritten.
const NUKTA = String.fromCodePoint(0x093c);
/** The letters of a spelling without its nukta signs (nothing else is folded). */
const skeleton = (s: string): string => nfc(s).split(NUKTA).join('');

/** Nukta-less skeleton → the distinct spellings of every listed form that have it. */
const FORM_SKELETON = new Map<string, string[]>();
/** Nukta-less skeleton → the listed lemmas (with their part of speech) that have it. */
const LEMMA_SKELETON = new Map<string, Array<{ lemma: string; pos: string }>>();
for (const e of hiLexicon.entries) {
  for (const f of e.forms) {
    const k = skeleton(f.form);
    const list = FORM_SKELETON.get(k) ?? [];
    if (!list.includes(f.form)) list.push(f.form);
    FORM_SKELETON.set(k, list);
  }
  const lk = skeleton(e.lemma);
  const ll = LEMMA_SKELETON.get(lk) ?? [];
  ll.push({ lemma: e.lemma, pos: e.pos });
  LEMMA_SKELETON.set(lk, ll);
}

/** `also:` spellings written on rows: the other spelling and the listed lemma it stands for. */
const ALSO_SPELLINGS: Array<{ spelling: string; lemma: string; from: string; to: string }> = [];
/** What differs between two spellings: their common ending is left out (but never starts on a vowel sign or a virama), so that every inflected form with the same ending is reached too. */
function differingStart(a: string, b: string): [string, string] {
  let k = 0;
  while (k < a.length && k < b.length && a[a.length - 1 - k] === b[b.length - 1 - k]) k++;
  while (k > 0 && /^\p{M}/u.test(a.slice(a.length - k))) k--;
  return [a.slice(0, a.length - k), b.slice(0, b.length - k)];
}
for (const [key, ann] of ANNOTATIONS) {
  for (const a of ann.also ?? []) {
    const lemma = key.slice(0, key.indexOf('|'));
    const [from, to] = differingStart(nfc(a), lemma);
    ALSO_SPELLINGS.push({ spelling: nfc(a), lemma, from, to });
  }
}

const LEMMA_CACHE = new Map<string, string | null>();
/**
 * The listed spelling of a lemma the rules propose: the lemma itself when it is listed, else its spelling variants (the script
 * module: ँ / ं, न् / ं …), an `also:` spelling, or the one listed lemma with the same nukta-less skeleton. Two listed lemmas that
 * differ only by the nukta are never mixed up: the lemma as written wins, and an ambiguous skeleton answers nothing.
 */
function resolveLemma(lemma: string, pos?: string): string | undefined {
  const key = `${lemma}|${pos ?? ''}`;
  const cached = LEMMA_CACHE.get(key);
  if (cached !== undefined) return cached ?? undefined;
  let found: string | undefined;
  if (hiLexicon.find(lemma, pos as never)) found = lemma;
  else {
    const tries = [...hindiSpellingVariants(lemma).map((v) => nfc(v)), ...ALSO_SPELLINGS.filter((a) => a.spelling === lemma).map((a) => a.lemma)];
    found = tries.find((v) => v !== lemma && hiLexicon.find(v, pos as never));
    if (!found) {
      const spellings = [...new Set((LEMMA_SKELETON.get(skeleton(lemma)) ?? []).filter((x) => !pos || x.pos === pos).map((x) => x.lemma))];
      if (spellings.length === 1) found = spellings[0];
    }
  }
  // an adjective that is also used as a noun (ग़रीब, बीमार, दुष्ट): the list holds the adjective, the rules may read a noun
  if (!found && pos === 'NOUN') found = resolveLemma(lemma, 'ADJ') ?? resolveLemma(lemma, 'NUM');
  if (LEMMA_CACHE.size > 20000) LEMMA_CACHE.clear();
  LEMMA_CACHE.set(key, found ?? null);
  return found;
}

/** Other spellings of a form that the word list or the script module relate to it, most usual first; the form itself excluded. */
function alternativeSpellings(form: string): string[] {
  const out: string[] = [];
  const add = (s: string) => { const n = nfc(s); if (n && n !== form && !out.includes(n)) out.push(n); };
  const viaModule = hindiSpellingVariants(form).map((v) => nfc(v));
  viaModule.forEach(add);
  for (const a of ALSO_SPELLINGS) if (a.from && form.startsWith(a.from)) add(a.to + form.slice(a.from.length));
  (FORM_SKELETON.get(skeleton(form)) ?? []).forEach(add);
  // and the listed spellings of those variants (ं for ँ, then the nukta: ढूंढा → ढूँढा → ढूँढ़ा)
  for (const m of viaModule) (FORM_SKELETON.get(skeleton(m)) ?? []).forEach(add);
  return out;
}

// ── the analysis pipeline for one normalized form ──
const knownLemma = (lemma: string, pos?: string): boolean => resolveLemma(lemma, pos) !== undefined;
/** One options object, so that the engine's per-lexicon memo is shared by every call. */
const ENGINE_OPTS = {
  knownLemma,
  lemmaInfo: (lemma: string, pos: PartOfSpeech): HindiLemmaInfo | undefined => {
    const r = resolveLemma(lemma, pos);
    if (!r) return undefined;
    const own = hiLemmaInfo(r, pos);
    if (own || pos !== 'NOUN') return own;
    const adj = hiLemmaInfo(r, 'ADJ'); // the adjective used as a noun: either gender
    return adj ? { pos: 'NOUN', gender: 'mf', ...(adj.invariant ? { invariant: true } : {}) } : { pos: 'NOUN', gender: 'mf', invariant: true };
  },
};
const union = <T extends string>(a: readonly T[] | undefined, b: readonly T[] | undefined): T[] | undefined => {
  const out = [...new Set([...(a ?? []), ...(b ?? [])])];
  return out.length ? out : undefined;
};
const keyOf = (c: AnalysisCandidate) => `${c.lemma}|${c.pos}`;
const IN_LIST = 'in the word list';

/** Copy register tags from the row (or, failing that, from the register group of the word) onto a candidate. */
function annotate(c: AnalysisCandidate): AnalysisCandidate {
  if (!c.lemma || !c.pos) return c;
  const ann = ANNOTATIONS.get(annotationKey(c.lemma, c.pos));
  const own = ann?.register ?? (ann ? registerOf(c.lemma) : undefined);
  const register = union<RegisterTag>(c.register, own);
  const out = register ? { ...c, register } : { ...c };
  // a causative says so, and from which verb it is made
  const base = c.pos === 'VERB' ? ann?.info.causativeOf : undefined;
  if (base) {
    out.morph = { ...c.morph, Voice: 'Cau' };
    out.notes = { ...(c.notes ?? {}), derivedFrom: (c.notes?.derivedFrom as string | undefined) ?? base };
  }
  // whether the verb takes ने in the perfective, where the row says so (the construction detector tells a passive from a compound verb by it)
  const erg = c.pos === 'VERB' || c.pos === 'AUX' ? ann?.info.ergative : undefined;
  if (erg !== undefined) out.notes = { ...(out.notes ?? c.notes ?? {}), ergative: erg ? 'yes' : 'no' };
  return out;
}

/**
 * An engine reading. A lemma the word list vouches for is glossed from it; a lemma it does not hold is a rule guess: origin
 * 'rule', confidence 0.6 at most, no gloss, never marked as a lexicon hit, and `unconfirmed` (a dictionary may decide such a
 * word; see AnalysisCandidate.unconfirmed). The list, not the engine, decides which lemmas are known. A lemma the rules wrote in
 * another spelling than the list's (ज without its nukta) comes back in the LIST's spelling, with `notes.variantOf`, so that the
 * learner's record of one word is not split in two.
 */
function fromEngine(a: HindiAnalysis): AnalysisCandidate {
  const resolved = resolveLemma(a.lemma, a.pos) ?? (a.lemmaKnown ? resolveLemma(a.lemma) : undefined);
  const entry = resolved ? hiLexicon.find(resolved, a.pos) ?? hiLexicon.find(resolved) : undefined;
  const respelt = !!entry && entry.lemma !== a.lemma;
  const c: AnalysisCandidate = {
    lemma: entry ? entry.lemma : a.lemma, pos: a.pos, morph: { ...a.morph },
    confidence: entry ? (respelt ? Math.min(a.confidence, 0.8) : a.confidence) : Math.min(a.confidence, 0.6),
    notes: { source: 'rule', rule: a.rule, lemmaStatus: entry ? IN_LIST : 'inferred by the rules', ...(respelt ? { variantOf: entry!.lemma } : {}) },
    origin: 'rule', sourceId: HI_SOURCE_IDS.rules,
  };
  if (entry) c.gloss = entry.gloss;
  else c.unconfirmed = true;
  if (a.parts?.length) c.parts = a.parts.map((p) => ({ ...p }));
  if (a.register?.length) c.register = [...a.register];
  return annotate(c);
}

const engineRead = (form: string): AnalysisCandidate[] => analyzeHindiForm(form, ENGINE_OPTS).map(fromEngine);
/** The rules' readings of lemmas the list holds. */
const engineKnown = (form: string): AnalysisCandidate[] => engineRead(form).filter((c) => c.notes?.lemmaStatus === IN_LIST);

/**
 * The word list's readings of one spelling. Forms that are written alike but are different forms (the masculine plural
 * perfective participle and the second / third person subjunctive of one verb, the oblique singular and the direct plural of
 * an adjective) stay SEPARATE readings, as the rule engine gives them: one reading per entry and per distinct feature bundle,
 * so that no reading carries a comma list in a feature and the neighbour rules can choose between them.
 */
function handCandidates(form: string): AnalysisCandidate[] {
  const hits = [...hiLexicon.lookup(form)].sort((a, b) => a.order - b.order);
  if (!hits.length) return [];
  const byEntry = new Map<LexEntry, Array<{ morph: Record<string, string>; notes: Record<string, string | string[]> }>>();
  for (const h of hits) {
    const list = byEntry.get(h.entry) ?? [];
    const key = JSON.stringify(Object.entries(h.form.morph).sort());
    const have = list.find((r) => JSON.stringify(Object.entries(r.morph).sort()) === key);
    if (have) Object.assign(have.notes, h.form.notes ?? {});
    else list.push({ morph: { ...h.form.morph }, notes: { ...(h.entry.notes ?? {}), ...(h.form.notes ?? {}), ...(h.entry.translit ? { translit: h.entry.translit } : {}) } });
    byEntry.set(h.entry, list);
  }
  const total = [...byEntry.values()].reduce((n, l) => n + l.length, 0);
  const out: AnalysisCandidate[] = [];
  for (const [entry, list] of byEntry) {
    list.forEach((r, k) => {
      // one reading: sure. Several readings of one entry (forms written alike): 0.8. Several entries: 0.55, and among a verb's readings the
      // perfective participle of a base verb (met, grew) outranks the bare stem of its causative (mixed, increased), which needs a vector or an
      // auxiliary after it to be read as a stem at all
      let confidence = total === 1 ? 0.92 : byEntry.size === 1 ? 0.8 : k === 0 ? 0.55 : 0.5;
      if (byEntry.size > 1) {
        if (r.morph.VerbForm === 'Stem' && r.morph.Voice === 'Cau') confidence = 0.5;
        else if (r.morph.VerbForm === 'Part' && r.morph.Aspect === 'Perf' && !entry.forms.some((f) => f.morph.Voice === 'Cau')) confidence = 0.6;
      }
      // the plural of a feminine participle without the nasal (रही as "were staying") is the less usual reading of the form
      if (r.morph.VerbForm === 'Part' && r.morph.Gender === 'Fem' && r.morph.Number === 'Plur' && !form.endsWith(String.fromCodePoint(0x0902))) confidence = Math.max(0.3, Math.round((confidence - 0.05) * 100) / 100);
      out.push(annotate({
        lemma: entry.lemma, pos: entry.pos, morph: r.morph, notes: Object.keys(r.notes).length ? r.notes : undefined,
        confidence, gloss: entry.gloss, origin: 'hand', sourceId: HI_SOURCE_IDS.hand,
      }));
    });
  }
  // the written form of an everyday noun that is also a verb form (गाड़ी, फल, भाई, सही, सीता) comes before the verb readings: the list's order puts verbs first
  const lead = (c: AnalysisCandidate): number => (c.lemma === form && c.pos && isNounFirst(c.lemma, c.pos) ? 0 : 1);
  return out.some((c) => lead(c) === 0) ? [...out].sort((a, b) => lead(a) - lead(b)) : out;
}

/**
 * The word list's readings of one spelling, with the rules' readings of other listed lemmas beside them. Empty when the list
 * has no such form. No guessed lemma stands beside a known word.
 */
function handReadings(form: string): AnalysisCandidate[] {
  const hand = handCandidates(form);
  if (!hand.length) return [];
  const eng = engineRead(form);
  // a fused word (उसने) is two units: the rules know where they split; the list only knows the word
  const parts = new Map(eng.filter((c) => c.parts?.length).map((c) => [keyOf(c), c.parts] as const));
  const base = hand.map((c) => (!c.parts && parts.has(keyOf(c)) ? { ...c, parts: parts.get(keyOf(c))!.map((p) => ({ ...p })) } : c));
  const have = new Set(base.map(keyOf));
  // a form the list has as written is that word: the rules never relate it to a lemma that is merely spelled alike (सजा is not सज़ा)
  const alt = eng.filter((c) => !have.has(keyOf(c)) && c.notes?.lemmaStatus === IN_LIST && c.notes.variantOf === undefined);
  if (!alt.length) return base;
  // the word list is the first reading; the rules' other readings follow it, below it
  const top = Math.min(0.75, Math.max(...base.map((c) => c.confidence)));
  return [...base.map((c) => ({ ...c, confidence: Math.min(c.confidence, top) })), ...alt.map((c) => ({ ...c, confidence: Math.min(c.confidence, top - 0.05) }))];
}

/** A reading reached through another spelling: it says which, and it is a little less sure; the surface is never altered. */
const viaVariant = (c: AnalysisCandidate, variant: string, form: string): AnalysisCandidate => {
  const out: AnalysisCandidate = { ...c, confidence: Math.min(c.confidence, 0.8), notes: { ...(c.notes ?? {}), variantOf: (c.notes?.variantOf as string | undefined) ?? variant } };
  // the parts were cut from the other spelling: they are kept only if they tile the text as written
  if (out.parts && out.parts.map((p) => p.text).join('') !== form) delete out.parts;
  return out;
};

const cloneCandidate = (c: AnalysisCandidate): AnalysisCandidate => {
  const n: AnalysisCandidate = { ...c, morph: { ...c.morph } }; // the spread keeps `unconfirmed`
  if (c.notes) { n.notes = {}; for (const k in c.notes) { const v = c.notes[k]; n.notes[k] = Array.isArray(v) ? [...v] : v; } }
  if (c.parts) n.parts = c.parts.map((p) => ({ ...p, ...(p.morph ? { morph: { ...p.morph } } : {}) }));
  if (c.varieties) n.varieties = [...c.varieties];
  if (c.register) n.register = [...c.register];
  return n;
};

/** Context-free analyses are a pure function of the form: computed once, kept in a bounded cache (oldest evicted), handed out as copies. */
const FORM_CACHE = new Map<string, AnalysisCandidate[]>();
const FORM_CACHE_MAX = 40000;

/**
 * A feminine plural written with the anusvara (गायें, सोचें, बातें) is also the other spelling of a verb form (गाएँ, सोचें): the word list
 * reaches the verb through the variant and used to stop there. The noun plural the rules make of a listed noun stands beside it, below it:
 * the neighbour rules choose (hindi/noun-first.ts), and where nothing decides the verb stays first, as before.
 */
function withPluralNouns(form: string, readings: AnalysisCandidate[]): AnalysisCandidate[] {
  if (!form.endsWith('ें')) return readings;
  const nouns = engineKnown(form).filter((c) => c.pos === 'NOUN' && c.morph.Number === 'Plur' && !readings.some((r) => r.lemma === c.lemma && r.pos === c.pos));
  if (!nouns.length) return readings;
  const top = Math.min(0.75, Math.max(...readings.map((r) => r.confidence)));
  return [...readings, ...nouns.map((c) => ({ ...c, confidence: Math.min(c.confidence, top - 0.05) }))];
}

/** Everything the adapter can say about one normalized form, best first. Empty when nothing is derivable. */
function analyzeForm(form: string): AnalysisCandidate[] {
  let hit = FORM_CACHE.get(form);
  if (!hit) {
    hit = analyzeFormUncached(form).map(cloneCandidate);
    if (FORM_CACHE.size >= FORM_CACHE_MAX) FORM_CACHE.delete(FORM_CACHE.keys().next().value as string);
    FORM_CACHE.set(form, hit);
  }
  return hit.map(cloneCandidate);
}

function analyzeFormUncached(form: string): AnalysisCandidate[] {
  // 1. this spelling in the word list
  const direct = handReadings(form);
  if (direct.length) return direct;
  // 2. another spelling of a listed form (हिंदी / हिन्दी, a nukta present or absent, an `also:` spelling): found there, said so
  const others = alternativeSpellings(form);
  for (const v of others) {
    const r = handReadings(v);
    if (r.length) return withPluralNouns(form, r.map((c) => viaVariant(c, v, form)));
  }
  // 3. the rules on lemmas the list holds (a lemma spelled differently comes back in the list's spelling), here and at the other spellings
  const known = engineKnown(form);
  if (known.length) return known;
  for (const v of others) {
    const r = engineKnown(v);
    if (r.length) return r.map((c) => viaVariant(c, v, form));
  }
  // 4. nothing the list vouches for: the rules' guesses at this spelling (unconfirmed, 0.6 at most), then at another's; or nothing
  const guess = engineRead(form);
  if (guess.length) return guess;
  for (const v of others) {
    const g = engineRead(v);
    if (g.length) return g.map((c) => viaVariant(c, v, form));
  }
  return [];
}

// ── neighbours: which reading of a homograph is meant here ──
/** The older rule of the first version: पर after a comma is "but", otherwise "on". Used only where the neighbour rules leave the order as it was. */
function legacyContext(i: number, tokens: RawToken[], cands: AnalysisCandidate[]): AnalysisCandidate[] {
  if (tokens[i].normalized !== 'पर' || cands.length < 2) return cands;
  const conj = tokens[i - 1]?.surface === ',';
  const idx = cands.findIndex((c) => c.pos === (conj ? 'CONJ' : 'ADP'));
  if (idx < 0) return cands;
  const note = conj ? 'पर after a comma is "but"' : 'पर after a noun is "on, at"';
  return [
    { ...cands[idx], notes: { ...(cands[idx].notes ?? {}), context: note } },
    ...cands.filter((_, k) => k !== idx).map((c) => ({ ...c, confidence: Math.min(c.confidence, 0.3) })),
  ];
}

function order(i: number, tokens: RawToken[], base: AnalysisCandidate[][]): AnalysisCandidate[] {
  const cands = base[i];
  if (!cands.length) return cands;
  const ordered = disambiguateHindi(i, tokens, base);
  return ordered === cands ? legacyContext(i, tokens, cands) : ordered;
}

// ── phrases ──
const NOMINAL = ['NOUN', 'PROPN', 'PRON'] as const;

/** The three course phrases of the first version, and its compound-verb and conjunct-verb phrases, as rules of the adapter's own. */
const SEED_PHRASES: PhraseRule[] = [
  { pattern: ['जब', '_', 'छोटा', 'होना'], display: 'जब मैं छोटा था', gloss: 'when I was young', kind: 'formula',
    variants: [['जब', { slot: true, pos: ['PRON'] }, 'छोटा', 'होना']] },
  { pattern: ['समझना', 'लगना'], display: 'समझने लगा', gloss: 'began to understand', kind: 'construction',
    variants: [['समझना', 'लगना']] },
  { pattern: ['_', 'पर', 'विश्वास'], display: '… पर विश्वास (करना)', gloss: 'to believe in, to put faith in', kind: 'frame',
    variants: [[{ slot: true, pos: [...NOMINAL] }, 'पर', 'विश्वास']] },
];
const FALLBACK_PHRASES: PhraseRule[] = [
  { pattern: ['कर', 'देना'], display: 'कर दिया', gloss: 'compound verb: did (completely / for someone)', kind: 'construction', variants: [['कर', 'देना']] },
  { pattern: ['कर', 'लेना'], display: 'कर लिया', gloss: 'compound verb: did (for oneself / done)', kind: 'construction', variants: [['कर', 'लेना']] },
  { pattern: ['हो', 'जाना'], display: 'हो गया', gloss: 'compound verb: became, has become', kind: 'construction', variants: [['हो', 'जाना']] },
  { pattern: ['क्षमा', 'करना'], display: 'क्षमा करना', gloss: 'to forgive', kind: 'collocation', variants: [['क्षमा', { gap: 1, only: ['ADV', 'PART'] }, 'करना']] },
  { pattern: ['प्रेम', 'करना'], display: 'प्रेम करना', gloss: 'to love', kind: 'collocation', variants: [['प्रेम', { gap: 1, only: ['ADV', 'PART'] }, 'करना']] },
  { pattern: ['विश्वास', 'करना'], display: 'विश्वास करना', gloss: 'to believe, to have faith', kind: 'collocation', variants: [['विश्वास', { gap: 1, only: ['ADV', 'PART'] }, 'करना']] },
];

/** The phrase module's units, then the adapter's own rules for what the module did not find (the same tokens, or some of them, are one unit). */
function detectPhrases(tokens: RawToken[], analyses: AnalyzedToken[]): PhraseCandidate[] {
  const found = detectHindiPhrases(tokens, analyses);
  const covered = (p: PhraseCandidate) => found.some((f) => p.tokenIndexes.every((t) => f.tokenIndexes.includes(t)));
  const own = matchPhraseRules(tokens, analyses, [...SEED_PHRASES, ...FALLBACK_PHRASES], normalize).filter((p) => !covered(p));
  if (!own.length) return found;
  return [...found, ...own].sort((a, b) => a.tokenIndexes[0] - b.tokenIndexes[0] || a.pattern.join('_').localeCompare(b.pattern.join('_')));
}

// ── older patterns and writing checks: a fallback for a sentence the sibling module says nothing about ──
const splitFeature = (v: string | undefined): string[] => (v ?? '').split(',').filter(Boolean);

function legacyPatterns(tokens: RawToken[], analyses: AnalyzedToken[]): PatternCandidate[] {
  const out: PatternCandidate[] = [];
  analyses.forEach((a, i) => {
    const c = a.candidates[0];
    if (!c) return;
    // ergative: ने / -ने pronoun … perfective verb
    if (tokens[i].normalized === 'ने' || splitFeature(c.morph.Case).includes('Erg')) {
      for (let k = i + 1; k < Math.min(tokens.length, i + 6) && tokens[k].isWord; k++) {
        const v = analyses[k]?.candidates[0];
        if (v?.pos === 'VERB' && splitFeature(v.morph.Aspect).includes('Perf')) {
          out.push({ key: 'ergative-ne', title: 'Ergative ने + perfective', confidence: Math.min(c.confidence, v.confidence), tokenIndexes: [i, k],
            explanation: 'In the perfective past the doer is marked with ने, and the verb agrees with the object, not the doer.' });
          break;
        }
      }
    }
    // -ता था
    if (c.pos === 'VERB' && splitFeature(c.morph.Aspect).includes('Imp') && analyses[i + 1]?.candidates[0]?.lemma === 'होना' && analyses[i + 1]?.candidates[0]?.morph.Tense === 'Past') {
      out.push({ key: 'past-imperfective', title: 'Past imperfective (-ता था)', confidence: c.confidence, tokenIndexes: [i, i + 1],
        explanation: 'Verb + -ता/-ती/-ते + था/थी/थे describes a habit or ongoing state in the past: "मैं नहीं समझता था".' });
    }
    // postposition after a noun / pronoun
    if (c.pos === 'ADP' && tokens[i].normalized !== 'ने' && i > 0 && hasPos(analyses[i - 1], 'NOUN', 'PROPN', 'PRON')) {
      out.push({ key: 'postposition', title: 'Postposition after the noun', confidence: Math.min(0.8, c.confidence), tokenIndexes: [i - 1, i],
        explanation: 'Hindi puts the little word after the noun: दिल में "in the heart", परमेश्वर पर "on God".' });
    }
  });
  return out;
}

function adjectiveForm(lemma: string, gender: string, number: string): string | undefined {
  const entry = hiLexicon.find(lemma, 'ADJ');
  if (!entry) return undefined;
  const pick = entry.forms.filter((f) => f.morph.Gender === gender && f.morph.Number === number);
  return (pick.find((f) => f.morph.Case !== 'Obl') ?? pick[0])?.form;
}

function legacyProduction(tokens: RawToken[], analyses: AnalyzedToken[]): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  analyses.forEach((a, i) => {
    const c = a.candidates[0];
    if (!c || !tokens[i].isWord) return;

    // ने needs a perfective verb
    if (tokens[i].normalized === 'ने' || splitFeature(c.morph.Case).includes('Erg')) {
      for (let k = i + 1; k < Math.min(tokens.length, i + 6) && tokens[k].isWord; k++) {
        const v = analyses[k]?.candidates[0];
        const form = splitFeature(v?.morph.VerbForm);
        if (!v || v.pos !== 'VERB' || form.includes('Conv') || form.includes('Stem')) continue;
        if (splitFeature(v.morph.Aspect).includes('Imp') && !splitFeature(v.morph.Aspect).includes('Perf')) {
          out.push({
            category: 'postposition', tokenIndexes: [i, k], confidence: 0.65, affectsMeaning: false,
            message: 'ने goes with a perfective verb (e.g. किया, लिया); this verb is imperfective (-ता/-ती).',
          });
        }
        break;
      }
    }

    // adjective–noun gender agreement (inflecting adjectives only)
    const n = analyses[i + 1]?.candidates[0];
    if (c.pos === 'ADJ' && c.morph.Gender && n?.pos === 'NOUN' && n.morph.Gender && !c.morph.Gender.includes(',') && !n.morph.Gender.includes(',') && c.morph.Gender !== n.morph.Gender && tokens[i + 1].isWord) {
      const fix = c.lemma && n.morph.Number && !n.morph.Number.includes(',') ? adjectiveForm(c.lemma, n.morph.Gender, n.morph.Number) : undefined;
      out.push({
        category: 'agreement', tokenIndexes: [i, i + 1], confidence: fix ? 0.8 : 0.6, affectsMeaning: false,
        message: `The adjective agrees with the noun: ${tokens[i + 1].surface} is ${n.morph.Gender === 'Fem' ? 'feminine' : 'masculine'}.`,
        suggestion: fix ? { start: tokens[i].start, end: tokens[i].end, replacement: fix } : undefined,
      });
    }
  });
  return out;
}

// ── honest support statement ──
const SUPPORT: AdapterSupport = {
  tokenization: 'dependable', // Intl.Segmenter('hi'); matras, nukta, chandrabindu and virama stay inside tokens (grapheme-checked in tests)
  sentenceSegmentation: 'limited', // danda, double danda, Latin terminators, quotations and a list of abbreviations; an unlisted abbreviation can split a sentence
  lemmatization: 'seed-only', // a hand list of about 1,500 lemmas and the closed classes; other words get a rule reading marked as inferred, or none
  morphology: 'limited', // rule readings of nouns, adjectives, pronouns and verbs; an ambiguous form returns every reading; not measured on running prose yet
  phraseDetection: 'limited', // compound verbs, complex predicates and compound postpositions found where the neighbouring words are analysed; nothing is discovered
  productionChecks: 'limited',
  limitations: [
    'Lemmatization is seed-only: the built-in word list is a machine-drafted seed (about 1,500 lemmas and the closed classes) that has not been checked by a native speaker; any other word gets a rule reading marked as inferred, or none.',
    'A reading the rules only infer (the lemma is not in the word list) is kept so that the form is still explained, but it is a rule guess: origin "rule", confidence 0.6 at most, no gloss, a note saying the lemma is inferred, and never marked as a word-list hit. Go does not claim it.',
    'Nothing has been measured on real running prose yet: the figures for coverage and for the rules come from the bundled seed texts and from tests written by the same authors, not from a held-out sample read by a Hindi speaker.',
    'Pronunciation is derived by rule from the spelling (whether the unwritten a is said, nasalization, conjuncts). Where the rules cannot tell, the unit says so with a low confidence instead of guessing; borrowed words and some compounds are the uncertain cases. A dictionary or a reviewer can correct a pronunciation without touching the text.',
    'The word list and the lexical layers (everyday, Sanskrit-derived, Persian and Arabic-derived, English loans) are labels on words, not verdicts: no layer is "the correct Hindi". Awadhi, Braj and the language of the sant poets are catalogued as their own languages and are not analysed here.',
    'A word that is written alike in two ways (की, पर, खाना, सोना, आम) gets every reading, ordered by its neighbours where they decide; this is not a parser.',
    'Number words are spoken for 0-20 only; larger numbers stay as digits in speech text.',
    'Production checks are a few rules, not a grammar checker: they report only what they recognise, only for words the analysis identifies, and an empty result never means the sentence is correct.',
  ],
};

/** What the paradigm needs from the word list: the entry (in its listed spelling) with the forms its row lists by hand. */
export const HI_PARADIGM_CONTEXT: HiParadigmContext = {
  listed(lemma, pos) {
    const r = resolveLemma(lemma, pos);
    const e = r ? hiLexicon.find(r, pos) : undefined;
    return e ? { lemma: e.lemma, info: hiLemmaInfo(e.lemma, pos), forms: e.forms } : undefined;
  },
};

export const hiAdapter: LanguageAdapter = {
  lang: LANG,
  name: 'Hindi',
  script: 'Deva',
  version: VERSION,
  support: SUPPORT,
  sources: HI_SOURCES,
  varieties: HI_VARIETIES,

  segmentSentences: segmentHindiSentences,
  tokenize: makeWordTokenizer({ locale: 'hi', normalize }),
  normalize,
  searchNormalize: (q) => hindiSearchForm(q).trim(),

  analyze: (tokens): AnalyzedToken[] => {
    const base = tokens.map((t) => (t.isWord ? analyzeForm(t.normalized) : []));
    return tokens.map((t, i) => ({ token: t, candidates: t.isWord ? order(i, tokens, base) : [], analyzer: ANALYZER }));
  },

  /**
   * The same ordering as `analyze`, after the importer put a dictionary's readings on some tokens. A token of this adapter
   * starts again from its context-free readings (what an earlier ordering did to them does not matter); any other token
   * brings its readings as they are, and its neighbours read them like ours. Only order, a lowered confidence and
   * `notes.context` can change; a token whose analyzer is not in `analyzers` is left exactly alone.
   */
  refine: (tokens, analyzed, analyzers, given): AnalyzedToken[] => {
    // a token of ours starts again from its context-free readings, unless the importer put a dictionary's readings beside ours (`given`):
    // then its list is taken as it arrived, like the list of another analyzer, and only reordered by the neighbours
    const base = tokens.map((t, i) => (analyzed[i].analyzer === ANALYZER && !given?.has(i) ? (t.isWord ? analyzeForm(t.normalized) : []) : analyzed[i].candidates));
    return tokens.map((t, i) => (t.isWord && analyzers.has(analyzed[i].analyzer)
      ? { ...analyzed[i], candidates: [...order(i, tokens, base)] }
      : analyzed[i]));
  },

  detectPhrases,

  detectPatterns(tokens, analyses): PatternCandidate[] {
    const found = detectHindiConstructions(tokens, analyses);
    return found.length ? found : legacyPatterns(tokens, analyses);
  },

  pronunciation(token, analysis): PronunciationSupport {
    void analysis;
    const s = token.normalized;
    const notes: string[] = [];
    // the unwritten a: said, silent or uncertain in this word (the pronunciation module says which, unit by unit)
    const inherent = decodeHindi(s).filter((u) => u.inherentVowel !== undefined);
    if (inherent.length) {
      if (inherent.some((u) => u.inherentVowel === 'dropped')) notes.push('An unwritten "a" is not pronounced here (schwa deletion): पाप is "pāp".');
      if (inherent.some((u) => u.inherentVowel === 'pronounced')) notes.push('An unwritten "a" is pronounced in this word: a consonant letter with no vowel sign carries it.');
      if (inherent.some((u) => u.inherentVowel === 'uncertain')) notes.push('Whether an unwritten "a" is said is uncertain in this word: a dictionary or a teacher decides.');
    } else if (/[क-ह]$/u.test(s)) notes.push('Word-final inherent "a" is normally not pronounced (schwa deletion): पाप is "pāp".');
    if (/[ँं]/u.test(s)) notes.push('ँ / ं nasalizes the vowel.');
    if (/़/u.test(s)) notes.push('The dot under a letter (nukta) marks a borrowed sound (क़ ख़ ग़ ज़ फ़).');
    if (/्/u.test(s)) notes.push('A halant (्) joins consonants into a conjunct with no vowel between them.');
    // a romanization only where the transliteration module is sure of every unit of the word
    const tr = transliterateHindi(s);
    const sure = tr.text !== '' && tr.confidence >= 0.6;
    if (tr.text !== '' && !sure) notes.push('The pronunciation by rule is a guess for this word: no romanization is shown.');
    return sure ? { transliteration: tr.text, notes } : { notes };
  },

  speechNormalize: (text) =>
    speechNormalizeGeneric(text, {
      tool: `speech-${LANG}@1`,
      numberToWords: hiNumberToWords,
      nativeDigits: '०१२३४५६७८९',
      percentWord: 'प्रतिशत',
    }),

  display: { wordSeparator: ' ', showBoundariesOnHighlight: false, fontFamily: '"Noto Sans Devanagari", "Nirmala UI", system-ui, sans-serif', lineHeight: 1.9 },

  checkProduction(tokens, analyses, sentence): ErrorCandidate[] {
    const found = checkHindiProduction(tokens, analyses, sentence);
    return found.length ? found : legacyProduction(tokens, analyses);
  },

  relate(a, b) {
    const na = normalize(a), nb = normalize(b);
    if (na === nb) return 'same';
    // the lemmas of each form (the word list, the rules and spelling variants): readings of 0.5 or more count
    const lemmas = (form: string) => new Set(analyzeForm(form).filter((c) => c.confidence >= 0.5 && c.lemma).map((c) => c.lemma as string));
    const lb = lemmas(nb);
    for (const l of lemmas(na)) if (lb.has(l)) return 'inflection';
    return 'none';
  },

  decode: decodeHindi,
  decodeWithPronunciation: decodeHindiWithPronunciation,
  orthFeatures: hindiOrthFeatures,
  describeOrthFeature: describeHindiOrthFeature,
  describeMorph: (morph, pos) => describeHindiMorph(morph, pos),

  /** Generation (Linguistic Engine V2, Stage 3): the forms of a word of the list, from the same rules as `analyze`; see hindi/paradigm.ts. */
  paradigm: (lemma, pos, hint) => hiParadigm(lemma, pos, hint, HI_PARADIGM_CONTEXT),
  /** The dictionary table's tags -> this adapter's cell features (hindi/table-tags.ts). The optional `form` tells a simple tense from its construction. */
  /** The cells an analysed reading occupies: the reading is normalised like a cell and matched where both state a feature (hindi/paradigm.ts `hindiCellsFor`). */
  cellsFor: (p, features, surface) => hindiCellsFor(p, p.pos, features, surface),
  featuresFromTableTags: (tags, pos, form?: string) => hiFeaturesFromTableTags(tags, pos, form),
};

const HI_UNITS = ['शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस', 'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस', 'बीस'];
/** Hindi numerals 11–99 are irregular; only 0–20 are supported, larger numbers are left as digits (recorded). */
export function hiNumberToWords(n: number): string | null {
  return Number.isInteger(n) && n >= 0 && n <= 20 ? nfc(HI_UNITS[n]) : null;
}

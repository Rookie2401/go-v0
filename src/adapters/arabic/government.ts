/**
 * What Arabic particles, prepositions and numbers govern: the tables the sentence layer (sentence.ts), the constructions (constructions.ts)
 * and the shallow syntax (syntax.ts) read. Plus the small predicates over a reading that all three share.
 *
 * MACHINE-DRAFTED from standard descriptions of Modern Standard Arabic grammar. Not reviewed by a native speaker or an Arabist. Every
 * entry is a fact of the grammar (what a particle takes after it), never a dictionary meaning. The prepositions are read from the
 * closed-class table (closed.ts), so the two cannot disagree.
 */
import type { AnalysisCandidate } from '../../core/adapters';
import { AR_CLOSED } from './closed';
import { arKey } from './text';

export type Cand = AnalysisCandidate;

// ───────────────────────────── predicates over one reading ─────────────────────────────

export const valsOf = (c: Cand, key: string): string[] => (c.morph[key] ? c.morph[key].split(',') : []);
export const hasVal = (c: Cand, key: string, v: string): boolean => valsOf(c, key).includes(v);
export const onlyVal = (c: Cand, key: string, v: string): boolean => c.morph[key] === v;
export const isPos = (c: Cand, ...pos: string[]): boolean => c.pos !== undefined && pos.includes(c.pos);
/** A finite verb (not a participle or a verbal noun, which the analyser files under NOUN or ADJ). */
export const isFiniteVerb = (c: Cand): boolean => isPos(c, 'VERB', 'AUX') && (c.morph.VerbForm === undefined || hasVal(c, 'VerbForm', 'Fin'));
export const isImperfect = (c: Cand): boolean => isFiniteVerb(c) && hasVal(c, 'Aspect', 'Imp');
export const isPerfect = (c: Cand): boolean => isFiniteVerb(c) && hasVal(c, 'Aspect', 'Perf');
export const isNominal = (c: Cand): boolean => isPos(c, 'NOUN', 'ADJ', 'PROPN', 'NUM');
export const isNounLike = (c: Cand): boolean => isPos(c, 'NOUN', 'PROPN') || (isPos(c, 'ADJ') && !!c.notes?.derivedFrom);
/** The reading carries the article (ال was cut off the stem) or is a definite form of its own. */
export const hasArticle = (c: Cand): boolean => !!c.parts?.some((p) => p.kind === 'prefix' && p.lemma === 'ال');
export const isDefinite = (c: Cand): boolean => hasArticle(c) || c.morph.Definite === 'Def';
export const hasSuffix = (c: Cand): boolean => !!c.parts?.some((p) => p.kind === 'suffix');
export const hasPreposition = (c: Cand): boolean => !!c.parts?.some((p) => p.kind === 'prefix' && p.pos === 'ADP');
/** The lexeme a reading credits: lemma and part of speech (a derived participle or verbal noun is its own lexeme). */
export const lexemeOf = (c: Cand): string => `${c.lemma ?? ''}|${c.pos ?? ''}|${c.notes?.derivedFrom ?? ''}`;
/** A reading that credits a lexeme when it reaches 0.5. */
export const isCredited = (c: Cand): boolean => !!c.lemma && !c.unconfirmed && c.confidence >= 0.5;
export const lemmaKeyOf = (c: Cand): string => (c.lemma ? arKey(c.lemma) : '');

// ───────────────────────────── particles that govern a mood ─────────────────────────────

export interface ArMoodParticle {
  /** The lemma has a shadda (لَمَّا, أَلَّا) or must not (أَنْ): the unvocalized key is shared with another particle. */
  shadda?: boolean;
  mood: 'Jus' | 'Sub';
  /** Words for the learner: "jussive", "subjunctive". */
  moodWord: string;
  /** The particle always takes this mood on the verb right after it (no other word in its spelling does). */
  certain: boolean;
  /** Plain label of the construction. */
  label: string;
}

/** Keyed by the lemma key (arKey of the vocalized lemma). */
export const AR_MOOD_PARTICLES: Readonly<Record<string, ArMoodParticle>> = {
  لم: { mood: 'Jus', moodWord: 'jussive', certain: true, label: 'negation of the past: لَمْ + jussive' },
  لما: { shadda: true, mood: 'Jus', moodWord: 'jussive', certain: false, label: 'not yet: لَمَّا + jussive' },
  لن: { mood: 'Sub', moodWord: 'subjunctive', certain: true, label: 'negation of the future: لَنْ + subjunctive' },
  كي: { mood: 'Sub', moodWord: 'subjunctive', certain: true, label: 'purpose: كَيْ + subjunctive' },
  لكي: { mood: 'Sub', moodWord: 'subjunctive', certain: true, label: 'purpose: لِكَيْ + subjunctive' },
  لئلا: { mood: 'Sub', moodWord: 'subjunctive', certain: true, label: 'negative purpose: لِئَلَّا + subjunctive' },
  كيلا: { mood: 'Sub', moodWord: 'subjunctive', certain: true, label: 'negative purpose: كَيْلَا + subjunctive' },
  ألا: { shadda: true, mood: 'Sub', moodWord: 'subjunctive', certain: false, label: 'أَلَّا (أَنْ + لَا) + subjunctive' },
  إذن: { mood: 'Sub', moodWord: 'subjunctive', certain: false, label: 'إِذَنْ + subjunctive' },
  حتى: { mood: 'Sub', moodWord: 'subjunctive', certain: false, label: 'حَتَّى before a verb: "until, so that" + subjunctive' },
  أن: { shadda: false, mood: 'Sub', moodWord: 'subjunctive', certain: false, label: 'أَنْ ("to, that") + subjunctive' },
};

/** The keys that are one particle and nothing else in practice: a decision needs no vowel mark. */
export const AR_SAFE_PARTICLES: ReadonlySet<string> = new Set(['لم', 'لن', 'كي', 'لكي', 'لئلا', 'كيلا', 'قد', 'سوف']);

/** The particles that put a verb in the future or add a nuance to it; the word after them is a verb, never a noun. */
export const AR_VERB_PARTICLES: Readonly<Record<string, { label: string }>> = {
  قد: { label: 'قَدْ + verb' },
  سوف: { label: 'سَوْفَ + imperfect: the future' },
};

/** Particles of negation, with what follows. */
export const AR_NEGATION: Readonly<Record<string, { id: string; label: string; follows: string }>> = {
  لا: { id: 'la', label: 'لَا', follows: 'the indicative (negation) or the jussive (a prohibition, 2nd person)' },
  لم: { id: 'lam', label: 'لَمْ', follows: 'the jussive (past)' },
  لما: { id: 'lamma', label: 'لَمَّا', follows: 'the jussive (not yet)' },
  لن: { id: 'lan', label: 'لَنْ', follows: 'the subjunctive (future)' },
  ما: { id: 'ma', label: 'مَا', follows: 'a perfect (past) or an indicative (present)' },
  ليس: { id: 'laysa', label: 'لَيْسَ', follows: 'a predicate in the accusative' },
};

// ───────────────────────────── prepositions ─────────────────────────────

export interface ArPreposition { lemma: string; gloss: string; /** A noun in the accusative that works as a preposition (بعد, قبل, عند …). */ nounLike: boolean }

/** Words listed as prepositions in closed.ts that are also verbs or particles often enough to be left out. */
const NOT_A_SAFE_PREPOSITION = new Set(['خلا', 'عدا']);
/** Prepositions that can also begin a clause: a finite verb after them is possible, so they never exclude one. */
export const AR_PREPOSITIONS_WITH_VERB: ReadonlySet<string> = new Set(['من', 'منذ', 'مذ', 'حتى']);
/** The prepositions whose spelling is almost never anything else: no vowel mark is needed to trust them. */
export const AR_SAFE_PREPOSITIONS: ReadonlySet<string> = new Set(['في', 'على', 'إلى', 'عن', 'مع']);

function buildPrepositions(): ReadonlyMap<string, ArPreposition> {
  const out = new Map<string, ArPreposition>();
  for (const [key, entries] of Object.entries(AR_CLOSED)) {
    if (NOT_A_SAFE_PREPOSITION.has(key)) continue;
    const e = entries.find((x) => x.pos === 'ADP' && !x.suffix && !x.fusedOf && (x.governs ?? '').startsWith('genitive'));
    if (e) out.set(key, { lemma: e.lemma, gloss: e.gloss, nounLike: (e.role ?? '').includes('noun') });
  }
  return out;
}
/** key → preposition (the key of the lemma; also of the form without its vowels). */
export const AR_PREPOSITIONS: ReadonlyMap<string, ArPreposition> = buildPrepositions();

/**
 * Nouns that stand in construct before a genitive, so the word after them is a noun and never a verb (كُلّ بَعْض جَمِيع …). `غَيْر` is left
 * out of the certain list: غَيَّرَ "he changed" is spelled like it and is followed by a subject. Lemma keys.
 */
export const AR_CONSTRUCT_HEADS: ReadonlySet<string> = new Set(['كل', 'بعض', 'جميع', 'معظم', 'أحد', 'إحدى', 'نفس', 'عدة']);

// ───────────────────────────── inna and kāna, and their sisters ─────────────────────────────

/** The lemma keys that are inna and her sisters (not the unvocalized spelling alone). */
export const AR_INNA_LEMMAS: ReadonlySet<string> = new Set(['إن', 'أن', 'كأن', 'لكن', 'ليت', 'لعل']);
/** كَانَ and its sisters (lemma keys): the subject stays nominative, the predicate becomes accusative. */
export const AR_KANA_LEMMAS: Readonly<Record<string, string>> = {
  كان: 'was, were', ليس: 'is not', اصبح: 'became, in the morning was', أصبح: 'became, in the morning was', امسى: 'became, in the evening was',
  أمسى: 'became, in the evening was', اضحى: 'became, in the forenoon was', أضحى: 'became, in the forenoon was', ظل: 'remained, kept on',
  بات: 'spent the night, became', صار: 'became',
};

// ───────────────────────────── numbers ─────────────────────────────

export type ArNumKind = 'one' | 'two' | 'few' | 'tens' | 'hundred' | 'thousand' | 'thousands';
export interface ArNumWord {
  value: number;
  kind: ArNumKind;
  /** The written form ends in ة: it takes a MASCULINE counted noun (the polarity of 3–10). */
  ta?: boolean;
  /** The form without ة (ثَلَاث): it takes a FEMININE counted noun. */
  noTa?: boolean;
}
const W: Record<string, ArNumWord> = {};
const few = (value: number, withTa: string, without: string): void => {
  for (const k of withTa.split(' ')) W[arKey(k)] = { value, kind: 'few', ta: true };
  for (const k of without.split(' ')) W[arKey(k)] = { value, kind: 'few', noTa: true };
};
few(3, 'ثلاثة', 'ثلاث'); few(4, 'أربعة اربعة', 'أربع اربع'); few(5, 'خمسة', 'خمس'); few(6, 'ستة', 'ست'); few(7, 'سبعة', 'سبع');
few(8, 'ثمانية', 'ثماني ثمان'); few(9, 'تسعة', 'تسع'); few(10, 'عشرة', 'عشر');
for (const k of ['واحد', 'أحد', 'احد', 'إحدى', 'احدى']) W[arKey(k)] = { value: 1, kind: 'one' };
W[arKey('واحد')] = { value: 1, kind: 'one' }; W[arKey('واحدة')] = { value: 1, kind: 'one' };
W[arKey('اثنان')] = { value: 2, kind: 'two' }; W[arKey('اثنين')] = { value: 2, kind: 'two' }; W[arKey('اثنتان')] = { value: 2, kind: 'two' }; W[arKey('اثنتين')] = { value: 2, kind: 'two' };
[['عشرون', 'عشرين', 20], ['ثلاثون', 'ثلاثين', 30], ['أربعون', 'أربعين', 40], ['خمسون', 'خمسين', 50], ['ستون', 'ستين', 60], ['سبعون', 'سبعين', 70], ['ثمانون', 'ثمانين', 80], ['تسعون', 'تسعين', 90]]
  .forEach(([a, b, v]) => { for (const k of [a, b, String(a).replace('أ', 'ا'), String(b).replace('أ', 'ا')]) W[arKey(String(k))] = { value: Number(v), kind: 'tens' }; });
for (const k of ['مئة', 'مائة', 'ميه']) W[arKey(k)] = { value: 100, kind: 'hundred' };
for (const k of ['ألف', 'الف']) W[arKey(k)] = { value: 1000, kind: 'thousand' };
for (const k of ['آلاف', 'الاف']) W[arKey(k)] = { value: 1000, kind: 'thousands' };
W[arKey('مليون')] = { value: 1000000, kind: 'thousand' };
export const AR_NUMBER_WORDS: Readonly<Record<string, ArNumWord>> = W;
/** The word that makes 11–19 with a unit before it (أَحَدَ عَشَرَ, ثَلَاثَةَ عَشَرَ). */
export const AR_TEEN_KEYS: ReadonlySet<string> = new Set([arKey('عشر'), arKey('عشرة')]);
/** The word is the second half of 11–19 (عَشَرَ after a unit): not a number of its own. */
export const isTeenSecond = (key: string, prevKey: string | undefined): boolean => AR_TEEN_KEYS.has(key) && prevKey !== undefined && AR_TEEN_UNITS.has(prevKey);
/** The unit words that can take عَشَرَ (and the dual-oblique اِثْنَا / اِثْنَيْ). */
export const AR_TEEN_UNITS: ReadonlySet<string> = new Set(['احد', 'أحد', 'إحدى', 'احدى', 'اثنا', 'اثني', 'اثنتا', 'اثنتي', ...Object.entries(W).filter(([, v]) => v.kind === 'few' && v.value < 10).map(([k]) => k)]);

// ───────────────────────────── demonstratives, relatives, pronouns ─────────────────────────────

export const roleOf = (c: Cand): string => String(c.notes?.role ?? '');

/** The independent personal pronouns by lemma key, with the person, number and gender they have (a spelling that fits both genders has both). */
export const AR_PERSONAL: Readonly<Record<string, { Person: string; Number: string; Gender?: string }>> = {
  أنا: { Person: '1', Number: 'Sing' }, نحن: { Person: '1', Number: 'Plur' },
  أنت: { Person: '2', Number: 'Sing' }, أنتما: { Person: '2', Number: 'Dual' }, أنتم: { Person: '2', Number: 'Plur', Gender: 'Masc' }, أنتن: { Person: '2', Number: 'Plur', Gender: 'Fem' },
  هو: { Person: '3', Number: 'Sing', Gender: 'Masc' }, هي: { Person: '3', Number: 'Sing', Gender: 'Fem' }, هما: { Person: '3', Number: 'Dual' },
  هم: { Person: '3', Number: 'Plur', Gender: 'Masc' }, هن: { Person: '3', Number: 'Plur', Gender: 'Fem' },
};
const FEM_DEMONSTRATIVE = new Set(['هذه', 'تلك', 'هاتان', 'هاتين', 'ذه']);
export const AR_DEMONSTRATIVES: ReadonlySet<string> = new Set(['هذا', 'هذه', 'ذلك', 'تلك', 'هؤلاء', 'أولئك', 'هذان', 'هذين', 'هاتان', 'هاتين', 'ذاك', 'ذلكم']);
export const AR_RELATIVES: ReadonlySet<string> = new Set(['الذي', 'التي', 'الذين', 'اللذان', 'اللذين', 'اللتان', 'اللتين', 'اللاتي', 'اللائي', 'اللواتي']);
export const isDemonstrative = (c: Cand): boolean => isPos(c, 'PRON', 'DET') && (AR_DEMONSTRATIVES.has(lemmaKeyOf(c)) || roleOf(c) === 'demonstrative') && !hasSuffix(c) && !hasArticle(c);
export const isRelative = (c: Cand): boolean => isPos(c, 'PRON') && (AR_RELATIVES.has(lemmaKeyOf(c)) || roleOf(c) === 'relative pronoun') && !hasSuffix(c);
export const isIndependentPronoun = (c: Cand): boolean => isPos(c, 'PRON') && (lemmaKeyOf(c) in AR_PERSONAL || roleOf(c) === 'independent pronoun') && !hasSuffix(c) && !hasArticle(c);
/** The gender a demonstrative's written form has (هٰذِهِ feminine); undefined when the form does not say. */
export const demonstrativeGender = (surfaceKey: string): 'Fem' | 'Masc' | undefined => (FEM_DEMONSTRATIVE.has(surfaceKey) ? 'Fem' : AR_DEMONSTRATIVES.has(surfaceKey) ? 'Masc' : undefined);
/** The person, number and gender of a pronoun reading. */
export function personalFeatures(c: Cand): { Person?: string; Number?: string; Gender?: string } {
  const t = AR_PERSONAL[lemmaKeyOf(c)];
  return { ...(t ?? {}), ...(c.morph.Person ? { Person: c.morph.Person } : {}), ...(c.morph.Number && !t ? { Number: c.morph.Number } : {}), ...(c.morph.Gender && !t?.Gender ? { Gender: c.morph.Gender } : {}) };
}

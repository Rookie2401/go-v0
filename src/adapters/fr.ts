/**
 * French adapter. NFC + lower-case identity, accents and ligatures preserved (côte ≠ cote ≠ côté), every typographic apostrophe read
 * as the straight one (l’homme and l'homme are one identity; the page's own text is never changed).
 *
 * Layers, in the order a token meets them: the hand word list (src/adapters/french: the closed classes with every form, elided
 * forms included, and about 3,400 lemmas) → the morphology engine (french/morphology.ts: rule readings of any verb, noun or adjective
 * form by generation, `knownLemma` answered from the word list) → the other spelling of a ligature (coeur → cœur) → older spelling
 * (french/historical.ts) → a name or a Roman numeral → nothing. Readings are then ordered by their neighbours where the neighbours
 * decide (french/disambiguate.ts); phrase units (french/phrases), constructions (french/constructions), shallow syntax (french/syntax),
 * pronunciation notes (french/pronunciation: the IPA is only ever a dictionary's), sentence segmentation (french/sentences).
 *
 * Tokens (french/tokenize.ts): an elided word is its own token and keeps its apostrophe (l' · homme); a pronoun joined to a verb by a
 * hyphen is its own token (donne · le · moi); a hyphenated compound is one token (peut-être).
 *
 * Confident: word-list words and closed classes. Uncertain, and said to be: a word the engine only infers (`unconfirmed`, 0.6 at most,
 * no gloss: a dictionary may decide it), a word with several readings (all are returned).
 * The data is machine-drafted and has not been checked by a native speaker.
 */
import type {
  AdapterSupport, AnalysisCandidate, AnalysisSourceInfo, AnalyzedToken, ErrorCandidate, LanguageAdapter, PartOfSpeech, PatternCandidate,
  PhraseCandidate, RawToken, RegisterTag, WordPart,
} from '../core';
import { cellOf, type ParadigmCell } from '../core/paradigm';
import { Lexicon, matchPhraseRules, nfc, type PhraseRule } from './shared';
import { foldFr, ligatureVariants, normalizeFr } from './french/orth';
import { tokenizeFrench } from './french/tokenize';
import { segmentFrenchSentences } from './french/sentences';
import { frenchSpeechNormalize } from './french/speech';
import { buildRows, mergeAnnotations, parseRows } from './french/entries';
import { annotationKey, type FrAnnotation, type FrenchAnalysis } from './french/types';
import { FUNCTION_ROWS } from './french/function-words';
import { VERB_ROWS } from './french/lexicon-verbs';
import { NOUN_ROWS } from './french/lexicon-nouns';
import { ADJECTIVE_ROWS, ADVERB_ROWS, PROPER_ROWS } from './french/lexicon-modifiers';
import { FR_LABEL_VARIETIES, FR_VARIETIES } from './french/varieties';
import { analyzeFrenchForm, describeFrenchMorph } from './french/morphology';
import { frenchCellFeatureSets, frenchParadigm } from './french/paradigm';
import { frenchFeaturesFromTableTags, frenchMorphFromTags } from './french/table-tags';
import { frenchPronunciation } from './french/pronunciation';
import { disambiguateFrench } from './french/disambiguate';
import { detectFrenchConstructions } from './french/constructions';
import { VERB_SLOT_PATTERNS, buildPhraseRules } from './french/phrases';
import { frenchSyntax } from './french/syntax';
import { historicalReadings } from './french/historical';
import { checkFrenchProduction } from './french/production';
import { FR_FULL_SOURCE_ID, fullFlags, fullGender, fullLemma, loadFrenchLexicon, onFrenchLexiconLoaded } from './french/lexicon-full';

export { loadFrenchLexicon };

const LANG = 'fr' as const;
const VERSION = '1';
const ANALYZER = `adapter-${LANG}@${VERSION}`;

/** Where the adapter's own data comes from. All of it is machine-drafted: none has been checked by a native speaker. */
export const FR_SOURCE_IDS = {
  hand: `${ANALYZER}:hand`,
  phrases: `${ANALYZER}:phrases`,
  constructions: `${ANALYZER}:constructions`,
  rules: `${ANALYZER}:rules`,
  /** The lemma list taken from the dictionary (french/lexicon-full): it says that a word exists, with its part of speech and gender; it carries no meaning. */
  lemmas: `${ANALYZER}:lemmas`,
} as const;

const FR_SOURCES: Record<string, AnalysisSourceInfo> = {
  [FR_SOURCE_IDS.hand]: { id: FR_SOURCE_IDS.hand, label: 'French word list', origin: 'hand', reviewStatus: 'machine-drafted', version: VERSION },
  [FR_SOURCE_IDS.phrases]: { id: FR_SOURCE_IDS.phrases, label: 'French phrase list', origin: 'hand', reviewStatus: 'machine-drafted', version: VERSION },
  [FR_SOURCE_IDS.constructions]: { id: FR_SOURCE_IDS.constructions, label: 'French grammar patterns', origin: 'hand', reviewStatus: 'machine-drafted', version: VERSION },
  [FR_SOURCE_IDS.rules]: { id: FR_SOURCE_IDS.rules, label: 'French word-form rules', origin: 'rule', reviewStatus: 'machine-drafted', version: VERSION },
  [FR_SOURCE_IDS.lemmas]: { id: FR_SOURCE_IDS.lemmas, label: `French lemma list (Wiktionary, via kaikki.org — CC BY-SA 4.0; ${FR_FULL_SOURCE_ID})`, origin: 'dictionary', reviewStatus: 'machine-drafted', version: VERSION },
};

// ── the word list: rows (text blocks) → entries ──
/**
 * Rows of the word-list files that could not be read ("file:line: what is wrong"). A bad row is skipped and listed here instead of
 * throwing while the module loads: the adapter registry imports every adapter, so a throw here would stop every language.
 * test/adapters/french-adapter.test.ts asserts that this list is empty.
 */
export const frLexiconProblems: string[] = [];
const ROW_FILES: ReadonlyArray<[rows: string, file: string]> = [
  [FUNCTION_ROWS, 'function-words'], [VERB_ROWS, 'verbs'], [NOUN_ROWS, 'nouns'], [ADJECTIVE_ROWS, 'adjectives'], [ADVERB_ROWS, 'adverbs'], [PROPER_ROWS, 'proper'],
];
const ROWS = ROW_FILES.flatMap(([rows, file]) => parseRows(rows, file, frLexiconProblems));
const BUILT = buildRows(ROWS, new Set(), frLexiconProblems);
const ANNOTATIONS: Map<string, FrAnnotation> = mergeAnnotations(BUILT.annotations);

/** The order matters: when a surface is ambiguous the earlier entry is listed first (the closed classes come first). */
export const frLexicon = new Lexicon(BUILT.entries, normalizeFr);

/** What the word list holds, for the readiness table and the tests. */
export const frLexiconStats = {
  lemmas: frLexicon.entries.length,
  duplicates: BUILT.duplicates,
  byPos: frLexicon.entries.reduce<Record<string, number>>((m, e) => { m[e.pos] = (m[e.pos] ?? 0) + 1; return m; }, {}),
};

/** What the word list says about a lemma beyond its forms (auxiliary, h aspiré, pronominal, variety, register). */
export const frAnnotation = (lemma: string, pos: PartOfSpeech): FrAnnotation | undefined => ANNOTATIONS.get(annotationKey(lemma, pos));

// ── the analysis pipeline for one normalized form ──
const CLOSED = new Set(['DET', 'PRON', 'ADP', 'CONJ', 'SCONJ', 'NUM', 'INTJ', 'PART']); // a listed name is not closed: Vienne / qu'il vienne, Pierre / une pierre, Marie / il se marie
/** Closed-class words that are also common verb or noun forms: the engine's reading is kept beside the hand one (entre: between / enters). */
const ALSO_OPEN = new Set(['entre', 'pendant', 'durant', 'suivant', 'devant', 'puis', 'contre', 'sous', 'tu', 'vers', 'dix', 'neuf', 'la', 'sur', 'car', 'or', 'pas', 'point', 'personne', 'son', 'ton']);

/** Is the lemma, with this very part of speech, in the hand word list? (être and avoir are AUX there; the engine calls them verbs.) */
const inHandPair = (lemma: string, pos: PartOfSpeech): boolean => !!frLexicon.find(lemma, pos) || ((pos === 'VERB' || pos === 'AUX') && (!!frLexicon.find(lemma, 'VERB') || !!frLexicon.find(lemma, 'AUX')));
/** Is the lemma in the hand word list (the one that carries glosses)? */
const inHandList = (lemma: string, pos?: PartOfSpeech): boolean => !!frLexicon.find(lemma, pos);
/**
 * Is this a real lemma? The hand word list answers first; then the lemma list taken from the dictionary (french/lexicon-full: about
 * 78,000 lemmas with part of speech and gender, loaded lazily, so it answers "no" until it has arrived). être and avoir are AUX in the
 * hand list and verbs in the dictionary's.
 */
const knownLemma = (lemma: string, pos?: PartOfSpeech): boolean => inHandList(lemma, pos) || fullLemma(lemma, pos === 'AUX' ? 'VERB' : pos);
/** The gender the hand list gives a noun (the first gender among its forms; a /mf noun says "Fem,Masc"), else the dictionary lemma list's. */
const genderOf = (lemma: string, pos: PartOfSpeech): string | undefined =>
  frLexicon.find(lemma, pos)?.forms.map((f) => f.morph.Gender).find((g) => g !== undefined) ?? (pos === 'NOUN' || pos === 'PROPN' ? fullGender(lemma) : undefined);
/**
 * One options object, so that the engine's per-lexicon memo is shared by every call. The engine remembers its answers per knownLemma
 * function, so when the lemma list arrives the object is made again with new functions and every cache built on the old answers is dropped.
 */
let ENGINE_OPTS = { knownLemma: (l: string, p?: PartOfSpeech) => knownLemma(l, p), genderOf: (l: string, p: PartOfSpeech) => genderOf(l, p) };
const union = <T extends string>(a: readonly T[] | undefined, b: readonly T[] | undefined): T[] | undefined => {
  const out = [...new Set([...(a ?? []), ...(b ?? [])])];
  return out.length ? out : undefined;
};
/** One word: its lemma and part of speech. être and avoir are AUX in the word list and VERB to the engine: the same word, never two readings. */
const keyOf = (c: AnalysisCandidate) => `${c.lemma}|${c.pos === 'AUX' ? 'VERB' : c.pos}`;

/** Copy variety and register tags, and the facts a card or a rule needs (auxiliary, h aspiré, pronominal), from the annotation table onto a candidate. */
function annotate(c: AnalysisCandidate): AnalysisCandidate {
  const ann = c.lemma && c.pos ? ANNOTATIONS.get(annotationKey(c.lemma, c.pos)) : undefined;
  const next = { ...c };
  const varieties = union(c.varieties, ann?.varieties);
  // the imperfect subjunctive and the passé simple are the tenses of written narrative: said, never hidden
  const literary = (c.pos === 'VERB' || c.pos === 'AUX') && c.morph.VerbForm === 'Fin' && ((c.morph.Mood === 'Sub' && c.morph.Tense === 'Imp') || (c.morph.Mood === 'Ind' && c.morph.Tense === 'Past'));
  const register = union<RegisterTag>(union<RegisterTag>(c.register, ann?.register), literary ? ['literary'] : undefined);
  if (varieties) next.varieties = varieties;
  if (register) next.register = register;
  if (ann?.aux || ann?.hAspire || ann?.pronominal) {
    next.notes = { ...(next.notes ?? {}) };
    if (ann.aux) next.notes.auxiliary = ann.aux === 'both' ? 'être or avoir' : ann.aux;
    if (ann.hAspire) next.notes.hAspire = 'yes';
    if (ann.pronominal) next.notes.pronominal = 'yes';
  }
  return next;
}

/**
 * An engine reading. A lemma the word list vouches for is glossed from it; a lemma it does not hold is a rule guess: origin 'rule',
 * confidence 0.6 at most, no gloss, never marked as a word-list hit, and `unconfirmed` (a dictionary may decide such a word).
 */
function fromEngine(a: FrenchAnalysis): AnalysisCandidate {
  const entry = a.lemmaKnown ? frLexicon.find(a.lemma, a.pos) ?? frLexicon.find(a.lemma) : undefined;
  // a lemma only the dictionary's lemma list knows: the word exists (so the reading is not a guess), but the list gives it no meaning
  const listed = a.lemmaKnown && !inHandPair(a.lemma, a.pos);
  const c: AnalysisCandidate = {
    lemma: a.lemma, pos: a.pos, morph: { ...a.morph }, confidence: a.lemmaKnown ? (listed ? Math.min(a.confidence, 0.8) : a.confidence) : Math.min(a.confidence, 0.6),
    notes: { source: 'rule', rule: a.rule, lemmaStatus: !a.lemmaKnown ? 'inferred by the rules' : listed ? 'in the dictionary lemma list' : 'in the word list' },
    origin: 'rule', sourceId: FR_SOURCE_IDS.rules,
  };
  if (listed) {
    const notes: Record<string, string | string[]> = { ...c.notes, lemmaSource: FR_SOURCE_IDS.lemmas };
    const flags = fullFlags(a.lemma, a.pos === 'AUX' ? 'VERB' : a.pos);
    if (flags?.hAspire) notes.hAspire = 'yes';
    if (flags?.pronominal) notes.pronominal = 'yes';
    if (flags?.dated) c.register = ['archaic'];
    c.notes = notes;
  }
  if (entry) c.gloss = entry.gloss;
  if (!a.lemmaKnown) c.unconfirmed = true;
  if (a.parts?.length) c.parts = a.parts.map((p) => ({ ...p }));
  if (a.varieties?.length) c.varieties = [...a.varieties];
  if (a.register?.length) c.register = [...a.register];
  return annotate(c);
}

/**
 * One reading per person. The engine writes je parle / il parle as one reading with Person "1,3" (the form is the same); kept so, the card
 * would say "I carry" of "Paul porte un manteau", because nothing could put the third person first. As separate readings the subject
 * decides (french/disambiguate.ts: after je the first person, after a noun or il the third), and where no subject is in sight both are
 * there, as they were. Only finite verbs, and only the person: a noun's "singular or plural" (fils) stays one reading.
 */
function byPerson(c: AnalysisCandidate): AnalysisCandidate[] {
  const persons = c.morph.Person?.split(',') ?? [];
  if (persons.length < 2 || c.morph.VerbForm !== 'Fin') return [c];
  // the third person first: in written French a verb without je or tu beside it is nearly always third person (a noun subject, a relative
  // clause, a subject several words back), and je / tu, when they are the subject, stand next to the verb where the rules see them
  const order = ['3', '1', '2'];
  return [...persons].sort((x, y) => order.indexOf(x) - order.indexOf(y)).map((p) => ({ ...c, morph: { ...c.morph, Person: p }, confidence: Math.min(c.confidence, 0.75) }));
}

const engineRead = (form: string): AnalysisCandidate[] => analyzeFrenchForm(form, ENGINE_OPTS).map(fromEngine).flatMap(byPerson);
/**
 * Readings of one form, some of a lemma the hand list holds and some of a lemma only the dictionary's lemma list holds: the hand list's
 * come first. The hand list is the common words; the dictionary's list also holds rare ones that are spelled like a form of a common
 * one (verra: the future of voir, and the passé simple of the rare verrer; belle: the adjective, and a noun use of beau), and those
 * must not lead. They are kept, below.
 */
function handFirst(readings: AnalysisCandidate[]): AnalysisCandidate[] {
  const hand = readings.filter((c) => c.notes?.lemmaStatus === 'in the word list');
  if (!hand.length || hand.length === readings.length) return readings;
  const floor = Math.min(...hand.map((c) => c.confidence)) - 0.2;
  return [...hand, ...readings.filter((c) => !hand.includes(c)).map((c) => ({ ...c, confidence: Math.min(c.confidence, Math.max(0.3, floor)) }))];
}
/** A reading whose lemma a list vouches for (the hand list, or the dictionary's lemma list): not a guess from the ending. */
const vouched = (c: AnalysisCandidate): boolean => c.notes?.lemmaStatus !== undefined && c.notes.lemmaStatus !== 'inferred by the rules';

/** The lemma of the second half of a contraction: aux = à + les (le); auxquels = à + lesquels (lequel). */
const CONTRACTED_LEMMA: Readonly<Record<string, string>> = { les: 'le', la: 'le', lesquels: 'lequel', lesquelles: 'lequel', laquelle: 'lequel' };

/** au = à + le: the halves the word list names (`notes.components`), as parts of the written word. */
function withContractionParts(form: string, c: AnalysisCandidate): AnalysisCandidate {
  const comps = c.notes?.components;
  if (!Array.isArray(comps) || comps.length !== 2) return c;
  const [first, second] = comps;
  // the written word does not show where one half ends: both parts cover the whole word, in order
  const parts: WordPart[] = [
    { text: form, start: 0, end: form.length, lemma: first, pos: 'ADP', kind: 'contracted' },
    { text: form, start: 0, end: form.length, lemma: CONTRACTED_LEMMA[second] ?? second, pos: c.pos === 'PRON' ? 'PRON' : 'DET', kind: 'contracted',
      ...(c.pos === 'PRON' ? {} : { morph: { Definite: 'Def', PronType: 'Art', Number: second === 'les' ? 'Plur' : 'Sing' } }) },
  ];
  return { ...c, parts };
}

/**
 * A word-list reading of a verb whose every form is listed (être, avoir, aller), one reading per cell. The list keeps one entry per verb
 * and would merge the cells a form has into one bundle (allions: "Mood Ind,Sub; Tense Imp,Pres", which also says present indicative,
 * and that is wrong); the engine conjugates the same verb and keeps the cells apart, so its cells are taken, with the list's part of
 * speech, gloss and standing. A form the engine does not give for that lemma keeps the list's bundle.
 */
function verbCells(form: string, c: AnalysisCandidate): AnalysisCandidate[] {
  if ((c.pos !== 'AUX' && c.pos !== 'VERB') || !c.lemma) return [c];
  const cells = analyzeFrenchForm(form, ENGINE_OPTS).filter((a) => a.lemma === c.lemma && (a.pos === 'VERB' || a.pos === 'AUX'));
  if (cells.length < 2) return cells.length === 1 ? byPerson({ ...c, morph: { ...cells[0].morph } }) : [c];
  // several cells of one verb: each is a reading, none more confident than a competing one may be
  return cells.flatMap((a) => byPerson({ ...c, morph: { ...a.morph }, confidence: Math.min(c.confidence, 0.75) }));
}

/**
 * The word list's hits for a form, as readings. One entry gives one reading, its forms merged (fils: singular or plural), with two
 * exceptions where a merged bundle would state something false. A word that is a negative in one use and not in another (plus: "no
 * longer" after ne, "more" otherwise) is two readings, the plain one first: merged, it would say Polarity=Neg of "plus grand". A pronoun
 * that is a clitic in one use and a possessive in another (leur: je leur parle / le leur) is two readings, the clitic first.
 */
function listReadings(form: string): AnalysisCandidate[] {
  const hits = frLexicon.lookup(form);
  const differs = (k: 'Polarity' | 'Poss', pos: string) => (h: (typeof hits)[number]) =>
    h.entry.pos === pos && h.form.morph[k] === undefined && hits.some((o) => o.entry === h.entry && o.form.morph[k] !== undefined);
  const split = hits.filter((h) => differs('Polarity', 'ADV')(h) || differs('Poss', 'PRON')(h));
  // a noun whose gender changes its meaning (le livre, la livre; le tour, la tour) lists both genders as forms of their own: one reading each,
  // with the meaning that goes with the gender, so that the article can decide between them
  const gendered = hits.filter((h) => h.entry.pos === 'NOUN' && (h.form.morph.Gender === 'Masc' || h.form.morph.Gender === 'Fem')
    && hits.some((o) => o.entry === h.entry && o.form.morph.Gender !== undefined && o.form.morph.Gender !== h.form.morph.Gender));
  if (gendered.length) {
    const rest = hits.filter((h) => !gendered.includes(h));
    // the gender the word list's gloss names first is the commoner word (la somme before le somme) and leads where nothing decides
    const gl = gendered[0].entry.gloss;
    const femFirst = gl.includes('(f)') && (!gl.includes('(m)') || gl.indexOf('(f)') < gl.indexOf('(m)'));
    const byGender = (femFirst ? ['Fem', 'Masc'] : ['Masc', 'Fem']).flatMap((g) => frLexicon.toCandidates(gendered.filter((h) => h.form.morph.Gender === g)).map((c) => ({ ...c, gloss: glossFor(c.gloss, g), confidence: Math.min(c.confidence, 0.55) })));
    return [...byGender, ...(rest.length ? listReadingsOf(rest) : [])];
  }
  return listReadingsOf(hits, split);
}

/** "book (m); pound (f)" → "book" for the masculine, "pound" for the feminine; a gloss not written that way is left whole. */
function glossFor(gloss: string | undefined, gender: string): string | undefined {
  if (!gloss) return gloss;
  const parts = gloss.split(';').map((p) => p.trim());
  const tag = gender === 'Masc' ? '(m)' : '(f)';
  if (!parts.every((p) => p.endsWith('(m)') || p.endsWith('(f)'))) return gloss;
  const mine = parts.filter((p) => p.endsWith(tag)).map((p) => p.slice(0, -3).trim());
  return mine.length ? mine.join('; ') : gloss;
}

function listReadingsOf(hits: ReturnType<typeof frLexicon.lookup>, split: ReturnType<typeof frLexicon.lookup> = []): AnalysisCandidate[] {
  if (!split.length) return frLexicon.toCandidates(hits);
  // the entries keep the order the list has them in (leur: the possessive determiner before the pronoun); inside one entry the split reading comes first
  const orderOf = (c: AnalysisCandidate) => Math.min(...hits.filter((h) => h.entry.lemma === c.lemma && h.entry.pos === c.pos).map((h) => h.order));
  const plain = frLexicon.toCandidates(split).map((c) => ({ c, at: orderOf(c), second: 0 }));
  const rest = frLexicon.toCandidates(hits.filter((h) => !split.includes(h))).map((c) => ({ c, at: orderOf(c), second: 1 }));
  return [...plain, ...rest].sort((x, y) => x.at - y.at || x.second - y.second).map(({ c }) => ({ ...c, confidence: Math.min(c.confidence, 0.55) }));
}

const handCandidates = (form: string): AnalysisCandidate[] =>
  listReadings(form).flatMap((c) => verbCells(form, withContractionParts(form, annotate({ ...c, origin: 'hand', sourceId: FR_SOURCE_IDS.hand }))));

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

/** Readings of a spelling from the word list or from a known lemma only (an inferred lemma does not count as "a word"). */
function solidReadings(form: string): AnalysisCandidate[] {
  const hand = handCandidates(form);
  if (hand.length) return hand;
  return analyzeFrenchForm(form, ENGINE_OPTS).filter((a) => a.lemmaKnown).map(fromEngine);
}

function analyzeFormUncached(form: string): AnalysisCandidate[] {
  const hand = handCandidates(form);
  if (hand.length) {
    const mergeable = hand.some((c) => !CLOSED.has(c.pos ?? '')) || ALSO_OPEN.has(form);
    if (!mergeable) return hand;
    const have = new Set(hand.map(keyOf));
    // beside a word-list reading the rules add only readings of lemmas the list also knows: never a guessed verb or a guessed derivation
    // (not the lemma list's: a noun use of every adjective it lists would crowd the adjective out — ces beaux paysages, un court moment; measured on
    // UD French GSD dev, adding them lowered the first reading's part of speech by 0.3 points. A noun the hand list lacks is added to the hand list.)
    const alt = engineRead(form).filter((c) => !have.has(keyOf(c)) && c.notes?.lemmaStatus === 'in the word list');
    if (!alt.length) return hand;
    // the word list's reading comes first; the rules' other readings follow it, below it
    const top = Math.min(0.75, Math.max(...hand.map((c) => c.confidence)));
    return [...hand.map((c) => ({ ...c, confidence: Math.min(c.confidence, top) })), ...alt.map((c) => ({ ...c, confidence: Math.min(c.confidence, top - 0.05) }))];
  }
  const eng = engineRead(form);
  // a reading a list vouches for stands; the guesses the rules made beside it for lemmas no list knows are dropped (cathédrale is the noun, not a verb the rules could spell)
  if (eng.some(vouched)) return handFirst(eng.filter(vouched));
  // the page writes "coeur", "oeuvre", "soeur": the word is the one with the ligature; the text is not changed, the card says so
  for (const v of ligatureVariants(form)) {
    const solid = solidReadings(v);
    if (solid.length) return solid.map((c) => ({ ...c, notes: { ...(c.notes ?? {}), spelling: `usually written ${v}` } }));
  }
  // older spelling (j'avois, les enfans, le tems): the modern word, tagged fr-hist; only when the modern spelling is a word the list knows
  const hist = historicalReadings(form, solidReadings).map((h) => annotate({
    ...h.reading, confidence: Math.min(h.reading.confidence, 0.6), varieties: union(h.reading.varieties, ['fr-hist']), register: union<RegisterTag>(h.reading.register, ['historical']),
    notes: { ...(h.reading.notes ?? {}), source: 'rule', modern: h.modern, historical: h.rule }, origin: 'rule', sourceId: FR_SOURCE_IDS.rules,
  }));
  return hist.length ? [...hist, ...eng.filter((c) => c.pos === 'VERB' || c.pos === 'AUX')] : eng;
}

const ROMAN_NUMERAL = /^(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/;
/** The value of capitals that are a Roman numeral of I, V, X, L, C (1–99), with the French ordinal ending allowed (XIXe, Ier); undefined for anything else. */
function romanNumeral(surface: string): number | undefined {
  const s = surface.replace(/(?:e|er|ème|re)$/u, '');
  if (!s || !ROMAN_NUMERAL.test(s) || s === 'L') return undefined;
  const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  let total = 0;
  for (let k = 0; k < s.length; k++) total += v[s[k]] < (v[s[k + 1]] ?? 0) ? -v[s[k]] : v[s[k]];
  return total;
}

/** Is token `i` written with a capital somewhere a sentence does not begin (after another word, not after an opening quote or dash)? */
function capitalInside(i: number, tokens: RawToken[]): boolean {
  for (let k = i - 1; k >= 0; k--) {
    if (tokens[k].isWord) return true;
    if (/[.!?…:«»"“”—–]/u.test(tokens[k].surface)) return false;
  }
  return false;
}

/**
 * A form that is both a listed name and an ordinary word (Vienne / vienne, Pierre / pierre, Rose / rose): written in lower case it is not
 * the name, which goes last; written with a capital inside a sentence it is the name first. At the start of a sentence the capital says
 * nothing and the order is left. Readings are only moved and lowered, never dropped.
 */
function byCapital(cands: AnalysisCandidate[], i: number, tokens: RawToken[]): AnalysisCandidate[] {
  if (cands.length < 2 || !cands.some((c) => c.pos === 'PROPN') || cands.every((c) => c.pos === 'PROPN')) return cands;
  const names = cands.filter((c) => c.pos === 'PROPN');
  const others = cands.filter((c) => c.pos !== 'PROPN');
  const capital = /^\p{Lu}/u.test(tokens[i].surface);
  if (!capital) return [...others, ...names.map((c) => ({ ...c, confidence: Math.min(c.confidence, 0.2) }))];
  if (!capitalInside(i, tokens)) return cands;
  return [...names, ...others.map((c) => ({ ...c, confidence: Math.min(c.confidence, 0.4) }))];
}

/**
 * The readings of one word of a sentence before its neighbours order them: those of the written form, and — for a word no list holds,
 * written with a capital where no sentence begins — the guess that it is a name, before the guesses from its ending. A guess like them:
 * `unconfirmed`, below 0.6, no gloss; a dictionary that lists the word decides.
 */
function readWord(i: number, tokens: RawToken[]): AnalysisCandidate[] {
  const cands = byCapital(analyzeForm(tokens[i].normalized), i, tokens);
  if (cands.some((c) => c.unconfirmed !== true)) return cands;
  const roman = romanNumeral(tokens[i].surface);
  if (roman !== undefined && tokens[i].surface.length > 1) {
    return [annotate({
      lemma: tokens[i].surface, pos: 'NUM', morph: { NumForm: 'Roman' }, gloss: `${roman} (Roman numeral)`, confidence: 0.8, origin: 'rule', sourceId: FR_SOURCE_IDS.rules,
      notes: { source: 'rule', rule: `capitals that read as the Roman numeral ${roman}` },
    })];
  }
  if (!/^\p{Lu}\p{Ll}/u.test(tokens[i].surface) || !capitalInside(i, tokens)) return cands;
  const name = annotate({
    lemma: nfc(tokens[i].surface), pos: 'PROPN', morph: {}, confidence: 0.5, unconfirmed: true, origin: 'rule', sourceId: FR_SOURCE_IDS.rules,
    notes: { source: 'rule', rule: 'written with a capital inside the sentence and on no list: probably a name', lemmaStatus: 'inferred by the rules' },
  });
  return [name, ...cands.map((c) => (c.confidence >= name.confidence ? { ...c, confidence: name.confidence - 0.05 } : c))];
}

/** A reading without what an ordering by context may have changed in it (its confidence, `notes.context`). */
function unordered(c: AnalysisCandidate): string {
  const { confidence: _confidence, notes, ...rest } = c;
  const { context: _context, ...kept } = notes ?? {};
  return JSON.stringify(Object.keys(kept).length ? { ...rest, notes: kept } : rest);
}

/**
 * The list of one of our own tokens after the importer put other readings beside ours (`refine`, `given`): the same readings, none added
 * or dropped. Those that are still ours but for an earlier ordering go first, as the form has them without context; every other reading
 * follows as it came.
 */
function startAgain(list: AnalysisCandidate[], contextFree: AnalysisCandidate[]): AnalysisCandidate[] {
  const left = list.map((c) => ({ c, key: unordered(c) }));
  const ours: AnalysisCandidate[] = [];
  for (const fresh of contextFree) {
    const k = left.findIndex((x) => x.key === unordered(fresh));
    if (k < 0) continue;
    left.splice(k, 1);
    ours.push(fresh);
  }
  return [...ours, ...left.map((x) => x.c)];
}

const PHRASES: PhraseRule[] = buildPhraseRules();

onFrenchLexiconLoaded(() => {
  ENGINE_OPTS = { knownLemma: (l: string, p?: PartOfSpeech) => knownLemma(l, p), genderOf: (l: string, p: PartOfSpeech) => genderOf(l, p) };
  FORM_CACHE.clear();
});

const SUPPORT: AdapterSupport = {
  tokenization: 'dependable', // its own scanner: elided words and hyphen clitics are their own tokens, compounds are whole; every token slices the input exactly
  sentenceSegmentation: 'limited', // guillemets, dialogue dashes, French spacing and a list of abbreviations; an unlisted abbreviation followed by a capital can split a sentence
  lemmatization: 'limited', // a hand list of about 3,400 lemmas and the closed classes; other words get a rule reading (an inferred lemma stays at 0.6 or less, unconfirmed) or none
  morphology: 'limited', // rule readings of verbs (every simple tense, the literary ones included), nouns and adjectives by generation; ambiguity returns every reading
  phraseDetection: 'limited', // listed phrase units and constructions, found where the neighbouring words are known; nothing is discovered
  productionChecks: 'limited',
  limitations: [
    'The word list is a machine-drafted list of about 3,400 lemmas and the closed classes; no native speaker has checked it. Any other word gets a rule reading marked as inferred, or none; where the dictionary is installed it decides such a word.',
    'A reading the rules only infer (the lemma is not in the word list) is kept so that the form is still explained, but it is a rule guess: origin "rule", confidence 0.6 at most, no gloss, and never marked as a word-list hit.',
    'A written form that several words share (porte, livre, est, été, son, vis, suis) returns every reading; the order follows the neighbouring words where they decide, and is otherwise left as the lists have it.',
    'Compound tenses, participle agreement, negation, the object pronouns and the relative pronouns are recognised as listed patterns over adjacent or nearby words; they are not a parser, and a long or inverted sentence can escape them.',
    'Pronunciation: written notes about the spelling only. An IPA transcription is shown only when a dictionary supplies one; liaison is described, never heard; regional pronunciations are not described.',
    'Regional words (Québec, Belgium, Switzerland, Africa, Louisiana) are labelled only where the dictionary labels them; an unlabelled word is not thereby the same everywhere.',
    'Older spelling (j’avois, les enfans, le tems) is recognised without changing the text, and only when the modern spelling is a word the list knows.',
    'Sentence splitting knows the usual abbreviations (M., Mme, Dr, etc., cf., av. J.-C.) but not every one.',
  ],
};

/** Dictionary region and usage labels → variety codes (french/varieties.ts), de-duplicated, in the order given. */
function varietiesFromTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const code = FR_LABEL_VARIETIES[t.toLowerCase()];
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

/**
 * Order every word's readings by its neighbours, twice. The first pass reads each word against its neighbours as their forms have them;
 * the second reads it again against the neighbours as the first pass left them (un ton ferme: "ton" is the noun only once "un" has been
 * read), each word starting again from its own context-free readings, so nothing is compounded. Only order and confidence change.
 */
function orderByContext(tokens: RawToken[], base: AnalysisCandidate[][]): AnalysisCandidate[][] {
  const first = tokens.map((t, i) => (t.isWord ? disambiguateFrench(i, tokens, base) : base[i]));
  const view = [...first];
  return tokens.map((t, i) => {
    if (!t.isWord) return base[i];
    view[i] = base[i];
    const out = disambiguateFrench(i, tokens, view);
    view[i] = first[i];
    return out;
  });
}

/**
 * Function words that only French has among the languages a learner's pages are likely to be in: none of them is a common word of
 * English, Spanish, German, Italian or Albanian (so not le, la, de, en, que, un, les, il, on, son, sur, qui, nos, vos, mes, bien, which those languages share).
 * A text of two or more words that shows none of them gives no sign of being French.
 */
const FRENCH_ANCHORS: ReadonlySet<string> = new Set([
  'des', 'du', 'au', 'aux', 'dans', 'pas', 'avec', 'pour', 'sans', 'sous', 'chez', 'vers', 'et', 'est', 'sont', 'ont', 'était', 'étaient', 'être', 'avoir', 'été', 'suis', 'sommes', 'êtes',
  'avons', 'avez', 'avait', 'avaient', 'sera', 'seront', 'serait', 'fut', 'je', 'nous', 'vous', 'ils', 'elle', 'elles', 'eux', 'moi', 'toi', 'ce', 'cet', 'cette', 'ces', 'cela', 'ça', 'ceci',
  'une', 'tes', 'ses', 'notre', 'votre', 'leur', 'leurs', 'mais', 'où', 'donc', 'alors', 'aussi', 'comme', 'quand', 'parce', 'puisque', 'lorsque', 'depuis', 'pendant',
  'après', 'avant', 'très', 'trop', 'beaucoup', 'peu', 'toujours', 'jamais', 'encore', 'déjà', 'ici', 'oui', 'tout', 'tous', 'toute', 'toutes', 'même', 'autre', 'autres', 'quel',
  'quelle', 'quels', 'quelles', 'dont', 'lequel', 'laquelle', 'pourquoi', 'comment', 'fait', 'faire', 'peut', 'peut-être', "aujourd'hui", 'voici', 'voilà', 'à',
  "qu'", "j'", "c'", "n'", "d'", "l'", "s'", "jusqu'", "lorsqu'", "puisqu'",
]);

/**
 * A reading that only the dictionary's lemma list vouches for is taken at its word only in a text that shows it is French. That list
 * holds some 78,000 lemmas, many of them words French shares with or lent to its neighbours (important, table, service, contact, general,
 * animal): on its own it reads a quarter of an English page and two fifths of a Spanish one, enough for the pack to take text that is not
 * French (GoLearn Active gives a block to the pack that reads 45 % of its words). So where a text of two or more words holds none of the
 * French-only function words above, those readings stay what they are, readings by rule, but are not vouched for: `unconfirmed`, 0.6 at
 * most, and the installed dictionary may still confirm them. The hand word list's readings are not touched, and a word looked up on its
 * own (no sentence) is read as before.
 */
function unanchored(tokens: RawToken[], base: AnalysisCandidate[][]): AnalysisCandidate[][] {
  let words = 0;
  for (const t of tokens) {
    if (!t.isWord) continue;
    words++;
    if (FRENCH_ANCHORS.has(t.normalized)) return base;
  }
  if (words < 2) return base;
  return base.map((list) => (list.some((c) => c.notes?.lemmaSource === FR_SOURCE_IDS.lemmas)
    ? list.map((c) => (c.notes?.lemmaSource === FR_SOURCE_IDS.lemmas
      ? { ...c, unconfirmed: true, confidence: Math.min(c.confidence, 0.6), notes: { ...c.notes, vouching: 'the text around this word shows no French function word, so the lemma list alone does not vouch for this reading' } }
      : c))
    : list));
}

function analyzeAll(tokens: RawToken[]): AnalysisCandidate[][] {
  return orderByContext(tokens, unanchored(tokens, tokens.map((t, i) => (t.isWord ? readWord(i, tokens) : []))));
}

export const frAdapter: LanguageAdapter = {
  lang: LANG,
  name: 'French',
  script: 'Latn',
  version: VERSION,
  support: SUPPORT,
  sources: FR_SOURCES,
  varieties: FR_VARIETIES,

  segmentSentences: segmentFrenchSentences,
  tokenize: tokenizeFrench,
  normalize: normalizeFr,
  /** Accent-insensitive and ligature-insensitive (people type "ecole", "coeur"). */
  searchNormalize: foldFr,

  analyze: (tokens): AnalyzedToken[] => {
    const ordered = analyzeAll(tokens);
    return tokens.map((t, i) => ({ token: t, candidates: ordered[i], analyzer: ANALYZER }));
  },

  /**
   * The same ordering as `analyze`, after the importer put a dictionary's readings on some tokens. A token of this adapter starts again
   * from its context-free readings; any other token brings its readings as they are, and its neighbours read them like ours. Only order,
   * a lowered confidence and `notes.context` can change; a token whose analyzer is not in `analyzers` is left exactly alone.
   */
  refine: (tokens, analyzed, analyzers, given): AnalyzedToken[] => {
    const base = tokens.map((t, i) => {
      if (analyzed[i].analyzer !== ANALYZER) return analyzed[i].candidates;
      if (given?.has(i)) return t.isWord ? startAgain(analyzed[i].candidates, readWord(i, tokens)) : analyzed[i].candidates;
      return t.isWord ? readWord(i, tokens) : [];
    });
    const ordered = orderByContext(tokens, unanchored(tokens, base));
    return tokens.map((t, i) => (t.isWord && analyzers.has(analyzed[i].analyzer) ? { ...analyzed[i], candidates: [...ordered[i]] } : analyzed[i]));
  },

  /** A dictionary files a pronominal verb under "se souvenir" / "s'évanouir", or the pronominal one under the bare verb. */
  lemmaVariants: (lemma, pos): string[] => {
    if (pos !== undefined && pos !== 'VERB') return [];
    const bare = /^(?:se |s')(.+)$/u.exec(lemma);
    if (bare) return [bare[1]];
    if (!/(?:er|ir|re|ïr)$/u.test(lemma)) return [];
    return [/^[aeiouyhàâéèêëîïôûœ]/u.test(lemma) ? `s'${lemma}` : `se ${lemma}`];
  },

  detectPhrases(tokens, analyses): PhraseCandidate[] {
    // a phrase that ends in an infinitive slot (venir de …, être en train de …) needs a verb there, not a noun that is spelled like one
    const verbalSlot = (i: number) => !!analyses[i]?.candidates.some((c) => (c.pos === 'VERB' || c.pos === 'AUX') && c.morph.VerbForm === 'Inf');
    return matchPhraseRules(tokens, analyses, PHRASES, normalizeFr)
      .filter((p) => !VERB_SLOT_PATTERNS.has(p.pattern.join(' ')) || verbalSlot(p.tokenIndexes[p.tokenIndexes.length - 1]));
  },

  detectPatterns(tokens, analyses): PatternCandidate[] {
    return detectFrenchConstructions(tokens, analyses);
  },

  pronunciation: (token, analysis) => frenchPronunciation(token, analysis),
  speechNormalize: frenchSpeechNormalize,
  display: { wordSeparator: ' ', showBoundariesOnHighlight: false, fontFamily: 'Georgia, "Times New Roman", serif', lineHeight: 1.7 },

  checkProduction: (tokens, analyses, sentence): ErrorCandidate[] => checkFrenchProduction(tokens, analyses, sentence, { find: (lemma, pos) => frLexicon.find(lemma, pos), annotation: frAnnotation }),

  relate(a, b) {
    const na = normalizeFr(a), nb = normalizeFr(b);
    if (na === nb) return 'same';
    // the lemmas of each form (the word list and the rules): readings of 0.5 or more count
    const lemmas = (form: string) => new Set(analyzeForm(form).filter((c) => c.confidence >= 0.5 && c.lemma).map((c) => c.lemma as string));
    const lb = lemmas(nb);
    for (const l of lemmas(na)) if (lb.has(l)) return 'inflection';
    return 'none';
  },

  morphFromTags: (tags) => frenchMorphFromTags(tags),
  varietiesFromTags,
  /** The generated table of a verb, noun or adjective (french/paradigm.ts) and the dictionary table's tag map (french/table-tags.ts). */
  paradigm: (lemma, pos) => frenchParadigm(lemma, pos, { known: (l, p) => knownLemma(l, p), genderOf: (l, p) => genderOf(l, p) }),
  featuresFromTableTags: (tags, pos, form) => frenchFeaturesFromTableTags(tags, pos, form),
  // the analysed reading projected onto the cells (comma lists split); empty when nothing matches, so the card falls back
  cellsFor: (p, features) => { const out: ParadigmCell[] = []; for (const f of frenchCellFeatureSets(p.pos, features)) { const c = cellOf(p, f); if (c && !out.includes(c)) out.push(c); } return out; },
  describeMorph: (morph, pos) => describeFrenchMorph(morph, pos),
  /** Contextual syntax: shallow dependencies from the readings above (french/syntax.ts). */
  syntax: (tokens, analyses) => frenchSyntax(tokens, analyses),
};

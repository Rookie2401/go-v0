/**
 * Spanish adapter. NFC + lower-case identity, accents preserved (entendía ≠ entendia).
 *
 * Layers, in the order a token meets them: the hand lexicon (src/adapters/spanish: about 1,500 lemmas, the closed
 * classes with every form, regional words tagged with their variety, plus the older paradigms below) → the
 * morphology engine (spanish/morphology.ts: rule readings of any verb, noun or adjective form, with honest
 * confidence, `knownLemma` answered from the lexicon) → older spelling (spanish/historical.ts: the modern lemma, tagged
 * es-hist, the text itself never changed) → nothing. Phrase units (spanish/phrases), constructions
 * (spanish/constructions), sentence segmentation (spanish/sentences).
 * Confident: lexicon words, closed classes, listed phrases and constructions. Uncertain: a word the engine only infers
 * (confidence 0.6 or less, the rule says so), older spelling, a word with two readings (both are returned).
 * A word with two readings is ordered by its neighbours where they decide (spanish/disambiguate.ts: one or two words to
 * the left, one to the right); that is not a parser, and where they do not decide the order is left as it was.
 * Out of scope: syntax beyond that; a word the rules cannot derive stays unanalysed.
 * The data is machine-drafted and has not been checked by a native speaker.
 */
import type {
  AdapterSupport, AnalysisCandidate, AnalysisSourceInfo, AnalyzedToken, ErrorCandidate, LanguageAdapter, PatternCandidate,
  PhraseCandidate, PronunciationSupport, RawToken, RegisterTag, WordPart,
} from '../core';
import {
  DETERMINISTIC_AT, E, Lexicon, makeWordTokenizer, matchCase, matchPhraseRules, nfc, speechNormalizeGeneric, stripMarks, type PhraseRule,
} from './shared';
import { analyzeSpanishForm, describeSpanishMorph, type SpanishAnalysis } from './spanish/morphology';
import { annotationKey, buildRows, mergeAnnotations, parseRows, type EsAnnotation } from './spanish/entries';
import { VERB_ROWS } from './spanish/lexicon-verbs';
import { NOUN_ROWS } from './spanish/lexicon-nouns';
import { ADJECTIVE_ROWS, PROPER_ROWS } from './spanish/lexicon-modifiers';
import { FUNCTION_ROWS } from './spanish/function-words';
import { REGIONAL_ROWS } from './spanish/regional';
import { COURSE_ROWS } from './spanish/lexicon-course';
import { ES_LABEL_VARIETIES, ES_VARIETIES } from './spanish/varieties';
import { HISTORICAL_EXACT, OLD_CONTRACTIONS, historicalSpellings } from './spanish/historical';
import { VERB_SLOT_PATTERNS, buildPhraseRules } from './spanish/phrases';
import { detectSpanishConstructions } from './spanish/constructions';
import { segmentSpanishSentences } from './spanish/sentences';
import { capitalInside, disambiguateSpanish } from './spanish/disambiguate';

const LANG = 'es' as const;
const VERSION = '10';
const ANALYZER = `adapter-${LANG}@${VERSION}`;

/** Where the adapter's own data comes from. All of it is machine-drafted: none has been checked by a native speaker. */
export const ES_SOURCE_IDS = {
  hand: `${ANALYZER}:hand`,
  phrases: `${ANALYZER}:phrases`,
  constructions: `${ANALYZER}:constructions`,
  rules: `${ANALYZER}:rules`,
} as const;

const ES_SOURCES: Record<string, AnalysisSourceInfo> = {
  [ES_SOURCE_IDS.hand]: { id: ES_SOURCE_IDS.hand, label: 'Course word list', origin: 'hand', reviewStatus: 'machine-drafted', version: VERSION },
  [ES_SOURCE_IDS.phrases]: { id: ES_SOURCE_IDS.phrases, label: 'Course phrase list', origin: 'hand', reviewStatus: 'machine-drafted', version: VERSION },
  [ES_SOURCE_IDS.constructions]: { id: ES_SOURCE_IDS.constructions, label: 'Course grammar patterns', origin: 'hand', reviewStatus: 'machine-drafted', version: VERSION },
  [ES_SOURCE_IDS.rules]: { id: ES_SOURCE_IDS.rules, label: 'Spanish word-form rules', origin: 'rule', reviewStatus: 'machine-drafted', version: VERSION },
};

const normalize = (s: string) => nfc(s).toLocaleLowerCase('es');

// ── the older hand list: explicit paradigms that the engine only adds to ──
const ENTRIES = [
  // verbs
  E('ser', 'AUX', 'to be (essence)', ['ser:inf', 'soy:1s pres', 'eres:2s pres', 'es:3s pres', 'era:1s impf', 'era:3s impf']),
  E('estar', 'AUX', 'to be (state/location)', ['estar:inf', 'estoy:1s pres', 'estás:2s pres', 'está:3s pres']),
  E('tener', 'VERB', 'to have', ['tener:inf', 'tengo:1s pres', 'tienes:2s pres', 'tiene:3s pres', 'tenemos:1p pres', 'tenía:1s impf', 'tenía:3s impf', 'tenga:1s subj', 'tenga:3s subj']),
  E('haber', 'AUX', 'to have (auxiliary)', ['haber:inf', 'he:1s pres', 'ha:3s pres', 'hay:3s pres']),
  E('entender', 'VERB', 'to understand', ['entender:inf', 'entiendo:1s pres', 'entiendes:2s pres', 'entiende:3s pres', 'entendía:1s impf', 'entendía:3s impf', 'entendí:1s pret', 'entendió:3s pret']),
  E('creer', 'VERB', 'to believe', ['creer:inf', 'creo:1s pres', 'crees:2s pres', 'cree:3s pres', 'creía:1s impf', 'creía:3s impf']),
  E('perdonar', 'VERB', 'to forgive', ['perdonar:inf', 'perdono:1s pres', 'perdona:3s pres', 'perdona:2s imper', 'perdonó:3s pret', 'perdone:1s subj', 'perdone:3s subj']),
  E('empezar', 'VERB', 'to begin', ['empezar:inf', 'empiezo:1s pres', 'empieza:3s pres', 'empecé:1s pret']),
  E('amar', 'VERB', 'to love', ['amar:inf', 'amo:1s pres', 'ama:3s pres', 'amó:3s pret']),
  E('querer', 'VERB', 'to want', ['querer:inf', 'quiero:1s pres', 'quiere:3s pres']),
  E('decir', 'VERB', 'to say', ['decir:inf', 'dijéremos:1p fsub']),
  E('engañar', 'VERB', 'to deceive', ['engañar:inf', 'engañamos:1p pres']),
  E('confesar', 'VERB', 'to confess', ['confesar:inf', 'confesamos:1p pres', 'confesáremos:1p fsub']),
  E('limpiar', 'VERB', 'to cleanse', ['limpiar:inf', 'limpie:3s subj']),
  E('perder', 'VERB', 'to lose, perish', ['perder:inf', 'pierda:3s subj', 'pierde:3s pres']),
  E('dar', 'VERB', 'to give', ['dar:inf', 'da:3s pres', 'dado:ptcp m sg']),
  // nouns
  E('pecado', 'NOUN', 'sin', ['pecado:m sg', 'pecados:m pl']),
  E('corazón', 'NOUN', 'heart', ['corazón:m sg', 'corazones:m pl']),
  E('Dios', 'PROPN', 'God', ['Dios:m sg']),
  E('día', 'NOUN', 'day', ['día:m sg', 'días:m pl']),
  E('año', 'NOUN', 'year', ['año:m sg', 'años:m pl']),
  E('mundo', 'NOUN', 'world', ['mundo:m sg']),
  E('paz', 'NOUN', 'peace', ['paz:f sg']),
  E('cosa', 'NOUN', 'thing', ['cosa:f sg', 'cosas:f pl']),
  E('verdad', 'NOUN', 'truth', ['verdad:f sg']),
  E('maldad', 'NOUN', 'wickedness', ['maldad:f sg']),
  E('vida', 'NOUN', 'life', ['vida:f sg']),
  E('manera', 'NOUN', 'manner, way', ['manera:f sg']),
  E('hijo', 'NOUN', 'son', ['hijo:m sg', 'hijos:m pl']),
  E('hija', 'NOUN', 'daughter', ['hija:f sg', 'hijas:f pl']),
  E('casa', 'NOUN', 'house', ['casa:f sg', 'casas:f pl']),
  E('libro', 'NOUN', 'book', ['libro:m sg', 'libros:m pl']),
  E('Ana', 'PROPN', 'Ana (name)'), E('Pedro', 'PROPN', 'Pedro (name)'),
  // the names of Stage 0's people (data/stage0/es): Nico was read as a form of "nicar"
  E('Sam', 'PROPN', 'Sam (name)'), E('Nico', 'PROPN', 'Nico (name)'),
  // the first word of a place or saint's name (San Pedro Sula, San Juan): read as the adjective "santo" without it
  E('San', 'PROPN', 'San, Saint (in names: San Pedro Sula)'),
  // pronouns / determiners
  E('yo', 'PRON', 'I', ['yo:1s nom prs']),
  E('tú', 'PRON', 'you (informal)', ['tú:2s nom prs']),
  E('él', 'PRON', 'he, him', ['él:3s m prs']),
  E('nosotros', 'PRON', 'we', ['nosotros:1p m nom prs']),
  E('nos', 'PRON', 'us (clitic)', ['nos:1p acc dat prs']),
  E('se', 'PRON', 'oneself (reflexive clitic)', ['se:prs']),
  E('qué', 'PRON', 'what', ['qué:int']),
  E('cómo', 'ADV', 'how', ['cómo:int']),
  E('aquel', 'PRON', 'that one', ['aquel:m sg dem', 'aquella:f sg dem', 'aquello:sg dem', 'aquellos:m pl dem', 'aquellas:f pl dem']),
  E('el', 'DET', 'the', ['el:m sg def art']),
  E('la', 'DET', 'the', ['la:f sg def art']),
  E('los', 'DET', 'the', ['los:m pl def art']),
  E('las', 'DET', 'the', ['las:f pl def art']),
  E('un', 'DET', 'a, an', ['un:m sg indef art']),
  E('una', 'DET', 'a, an', ['una:f sg indef art']),
  E('unos', 'DET', 'some', ['unos:m pl indef art']),
  E('unas', 'DET', 'some', ['unas:f pl indef art']),
  E('mi', 'DET', 'my', ['mi:sg poss', 'mis:pl poss']),
  E('su', 'DET', 'his/her/their', ['su:sg poss', 'sus:pl poss']),
  E('nuestro', 'DET', 'our', ['nuestro:m sg poss', 'nuestros:m pl poss', 'nuestra:f sg poss', 'nuestras:f pl poss']),
  E('todo', 'DET', 'all, every', ['todo:m sg', 'toda:f sg', 'todos:m pl', 'todas:f pl']),
  E('mismo', 'ADJ', 'same, -self', ['mismo:m sg', 'mismos:m pl']),
  // adjectives / adverbs
  E('joven', 'ADJ', 'young', ['joven:sg']),
  E('fiel', 'ADJ', 'faithful', ['fiel:sg']),
  E('justo', 'ADJ', 'righteous, just', ['justo:m sg']),
  E('eterno', 'ADJ', 'eternal', ['eterno:m sg', 'eterna:f sg']),
  E('unigénito', 'ADJ', 'only-begotten', ['unigénito:m sg']),
  E('tal', 'ADJ', 'such', ['tal:sg']),
  E('no', 'ADV', 'not', ['no:neg']),
  E('ahora', 'ADV', 'now'),
  E('también', 'ADV', 'also'),
  E('bien', 'ADV', 'well'),
  E('sí', 'INTJ', 'yes'),
  E('hola', 'INTJ', 'hello'),
  E('gracias', 'INTJ', 'thank you'),
  // function words (á is older spelling: it is handled by spanish/historical.ts)
  E('a', 'ADP', 'to, at (personal a)', ['a']),
  E('al', 'ADP', 'to the (a + el)', ['al'], { notes: { components: ['a', 'el'] } }),
  E('del', 'ADP', 'of the (de + el)', ['del'], { notes: { components: ['de', 'el'] } }),
  E('en', 'ADP', 'in, on'),
  E('con', 'ADP', 'with'),
  E('por', 'ADP', 'by, for'),
  E('para', 'ADP', 'for, in order to'),
  E('de', 'ADP', 'of, from'),
  E('y', 'CONJ', 'and'),
  E('pero', 'CONJ', 'but'),
  E('mas', 'CONJ', 'but (literary)'),
  E('si', 'SCONJ', 'if'),
  E('que', 'SCONJ', 'that'),
  E('porque', 'SCONJ', 'because, for'),
  E('cuando', 'SCONJ', 'when'),
  E('uno', 'NUM', 'one', ['uno:m sg']),
  E('dos', 'NUM', 'two'),
  E('tres', 'NUM', 'three'), E('cuatro', 'NUM', 'four'), E('cinco', 'NUM', 'five'), E('seis', 'NUM', 'six'),
  E('siete', 'NUM', 'seven'), E('ocho', 'NUM', 'eight'), E('nueve', 'NUM', 'nine'), E('diez', 'NUM', 'ten'),
  E('doce', 'NUM', 'twelve'), E('veinte', 'NUM', 'twenty'), E('treinta', 'NUM', 'thirty'),
];

// ── the core lexicon: rows (text blocks) → entries; a row the older list already has is skipped ──
/**
 * Rows of the word-list files that could not be read ("file:line: what is wrong"). A bad row is skipped and listed
 * here instead of throwing while the module loads: the adapter registry imports every adapter, so a throw here would
 * stop every language. test/adapters/spanish-lexicon.test.ts asserts that this list is empty.
 */
export const esLexiconProblems: string[] = [];
const ROW_FILES: ReadonlyArray<[rows: string, file: string]> = [
  [FUNCTION_ROWS, 'function-words'], [VERB_ROWS, 'verbs'], [NOUN_ROWS, 'nouns'], [ADJECTIVE_ROWS, 'modifiers'],
  [PROPER_ROWS, 'proper'], [REGIONAL_ROWS, 'regional'], [COURSE_ROWS, 'course'],
];
const ROWS = ROW_FILES.flatMap(([rows, file]) => parseRows(rows, file, esLexiconProblems));
const OLD_KEYS = new Set(ENTRIES.map((e) => annotationKey(e.lemma, e.pos)));
const BUILT = buildRows(ROWS, OLD_KEYS, esLexiconProblems);
const ANNOTATIONS: Map<string, EsAnnotation> = mergeAnnotations(BUILT.annotations);

/** The order matters: when a surface is ambiguous the earlier entry is listed first, and the older list comes first. */
export const esLexicon = new Lexicon([...ENTRIES, ...BUILT.entries], normalize);

/** What the lexicon holds, for the readiness table and the tests. */
export const esLexiconStats = {
  lemmas: esLexicon.entries.length,
  duplicates: BUILT.duplicates,
  byPos: esLexicon.entries.reduce<Record<string, number>>((m, e) => { m[e.pos] = (m[e.pos] ?? 0) + 1; return m; }, {}),
  /** Lemmas carrying a variety tag, by variety. */
  byVariety: [...ANNOTATIONS.values()].reduce<Record<string, number>>((m, a) => { for (const v of a.varieties ?? []) m[v] = (m[v] ?? 0) + 1; return m; }, {}),
};

/** Value of the lexicon numerals (for "number above one takes a plural noun"). */
const NUMERAL_VALUE: Record<string, number> = {
  uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, doce: 12, veinte: 20, treinta: 30,
};

const CLITICS = ['me', 'te', 'lo', 'la', 'los', 'las', 'le', 'les', 'nos', 'se'];

function splitClitics(normalized: string): { stem: string; clitics: string[] } | undefined {
  // peel clitics from the right, longest first, at most two (entenderlo, entendernos → entender + nos)
  const clitics: string[] = [];
  let rest = normalized;
  for (let n = 0; n < 2; n++) {
    const c = [...CLITICS].sort((a, b) => b.length - a.length).find((x) => rest.length > x.length + 2 && rest.endsWith(x));
    if (!c) break;
    clitics.unshift(c);
    rest = rest.slice(0, -c.length);
    if (esLexicon.lookup(rest).some((h) => h.form.morph.VerbForm === 'Inf')) return { stem: rest, clitics };
  }
  return undefined;
}

// ── the analysis pipeline for one normalized form ──
const CLOSED = new Set(['DET', 'PRON', 'ADP', 'CONJ', 'SCONJ', 'NUM', 'INTJ', 'PART', 'PROPN']);
/** Closed-class words that are also very common verb forms: the engine's reading is kept beside the hand one. */
const ALSO_VERB = new Set(['como', 'salvo', 'bajo']);

const knownLemma = (lemma: string, pos?: string): boolean => !!esLexicon.find(lemma, pos as never);
/** The gender the list gives a noun (a diminutive keeps it): the first single gender among its forms. */
const genderOf = (lemma: string, pos: string): string | undefined =>
  esLexicon.find(lemma, pos as never)?.forms.map((f) => f.morph.Gender).find((g) => g !== undefined && !g.includes(','));
/** One options object, so that the engine's per-lexicon memo is shared by every call. */
const ENGINE_OPTS = { knownLemma, genderOf };
const union = (a: readonly string[] | undefined, b: readonly string[] | undefined): string[] | undefined => {
  const out = [...new Set([...(a ?? []), ...(b ?? [])])];
  return out.length ? out : undefined;
};
const keyOf = (c: AnalysisCandidate) => `${c.lemma}|${c.pos}`;

/** Copy variety and register tags from the annotation table onto a candidate. */
function annotate(c: AnalysisCandidate): AnalysisCandidate {
  const ann = c.lemma && c.pos ? ANNOTATIONS.get(annotationKey(c.lemma, c.pos)) : undefined;
  const varieties = union(c.varieties, ann?.varieties);
  // a future subjunctive (dijéremos) is older Spanish whoever produced it
  const old = c.morph.Mood === 'Sub' && c.morph.Tense === 'Fut' ? ['es-hist'] : undefined;
  const v = union(varieties, old);
  const register = union(c.register, ann?.register) as RegisterTag[] | undefined;
  const next = { ...c };
  if (v) next.varieties = v;
  if (register) next.register = register;
  if (old && !next.register?.includes('historical')) next.register = [...(next.register ?? []), 'historical'];
  return next;
}

/** Spoken text of a dialogue line: the raya (— –) is not pronounced. */
function spokenDialogue(text: string): string {
  if (!/[—–]/u.test(text)) return text;
  return text
    .replace(/(^|\n)[ \t]*[—–][ \t]*/gu, '$1') // opens a turn
    .replace(/[ \t]*[—–][ \t]*(?=[.,;:!?…)»”]|$|\n)/gu, '') // closes a reporting clause
    .replace(/([?!…])[ \t]*[—–][ \t]*/gu, '$1 ') // a reporting clause after a question or exclamation
    .replace(/[ \t]*[—–][ \t]*/gu, ', '); // any other dash between words: a pause
}

/**
 * An engine reading. A lemma the word list vouches for is glossed from it; a lemma it does not hold is a rule guess:
 * origin 'rule', confidence 0.6 at most, no gloss, never marked as a lexicon hit, and `unconfirmed` (a dictionary may
 * decide such a word; see AnalysisCandidate.unconfirmed).
 */
function fromEngine(a: SpanishAnalysis): AnalysisCandidate {
  const entry = a.lemmaKnown ? esLexicon.find(a.lemma, a.pos) ?? esLexicon.find(a.lemma) : undefined;
  const c: AnalysisCandidate = {
    lemma: a.lemma, pos: a.pos, morph: { ...a.morph }, confidence: a.lemmaKnown ? a.confidence : Math.min(a.confidence, 0.6),
    notes: { source: 'rule', rule: a.rule, lemmaStatus: a.lemmaKnown ? 'in the word list' : 'inferred by the rules' },
    origin: 'rule', sourceId: ES_SOURCE_IDS.rules,
  };
  if (entry) c.gloss = entry.gloss;
  // a pronoun after a conjugated verb (díjole) is read from the shape of the word alone, whatever the lemma's standing:
  // a dictionary that lists the same writing as a word of its own decides (rodeos is not rodé + os)
  if (!a.lemmaKnown || a.afterFinite) c.unconfirmed = true;
  if (a.afterFinite) c.notes = { ...c.notes, enclisis: 'after a conjugated verb' };
  if (a.parts?.length) c.parts = a.parts.map((p) => ({ ...p }));
  if (a.varieties?.length) c.varieties = [...a.varieties];
  return annotate(c);
}

const engineRead = (form: string): AnalysisCandidate[] => analyzeSpanishForm(form, ENGINE_OPTS).map(fromEngine);

const handCandidates = (form: string): AnalysisCandidate[] =>
  esLexicon.toCandidates(esLexicon.lookup(form)).map((c) => annotate({ ...c, origin: 'hand', sourceId: ES_SOURCE_IDS.hand }));

/** al / del are two units: a + el, de + el. */
function withContractionParts(form: string, c: AnalysisCandidate): AnalysisCandidate {
  if (form !== 'al' && form !== 'del') return c;
  const parts: WordPart[] = [
    { text: form.slice(0, -1), start: 0, end: form.length - 1, lemma: form === 'al' ? 'a' : 'de', pos: 'ADP' },
    { text: 'l', start: form.length - 1, end: form.length, lemma: 'el', pos: 'DET', morph: { Gender: 'Masc', Number: 'Sing', Definite: 'Def', PronType: 'Art' } },
  ];
  return { ...c, parts };
}

/** A lexicon infinitive with attached pronouns: entenderlo, perdonarnos. Built from the lexicon, so confident enough to show. */
function clitic(form: string): AnalysisCandidate[] {
  const sp = splitClitics(form);
  if (!sp) return [];
  const hit = esLexicon.lookup(sp.stem).find((h) => h.form.morph.VerbForm === 'Inf');
  if (!hit) return [];
  // the engine knows the offsets and, when it can tell, the pronoun roles; ours are the plain fallback
  const eng = analyzeSpanishForm(form, ENGINE_OPTS).find((a) => a.lemma === hit.entry.lemma && a.morph.VerbForm === 'Inf' && a.parts?.length);
  let off = sp.stem.length;
  const parts: WordPart[] = eng?.parts?.length ? eng.parts.map((p) => ({ ...p })) : [
    { text: sp.stem, start: 0, end: sp.stem.length, lemma: hit.entry.lemma, pos: 'VERB', morph: { VerbForm: 'Inf' } },
    ...sp.clitics.map((cl): WordPart => { const p: WordPart = { text: cl, start: off, end: off + cl.length, lemma: cl, pos: 'PRON', role: 'object pronoun' }; off += cl.length; return p; }),
  ];
  return [annotate({
    lemma: hit.entry.lemma, pos: 'VERB', morph: { VerbForm: 'Inf' }, gloss: hit.entry.gloss, confidence: 0.85,
    notes: { stem: sp.stem, clitics: sp.clitics, source: 'rule' }, parts, origin: 'rule', sourceId: ES_SOURCE_IDS.rules,
  })];
}

let foldIndex: Map<string, string[]> | undefined;
function foldLookup(folded: string): string[] {
  if (!foldIndex) {
    foldIndex = new Map();
    for (const e of esLexicon.entries) for (const f of e.forms) {
      const n = normalize(f.form);
      const k = stripMarks(n);
      const list = foldIndex.get(k) ?? [];
      if (!list.includes(n)) list.push(n);
      foldIndex.set(k, list);
    }
  }
  return foldIndex.get(folded) ?? [];
}

/** Readings a modern spelling has from the lexicon or from a known lemma only (an inferred lemma does not count as "a word"). */
function solidReadings(modern: string): AnalysisCandidate[] {
  const hand = handCandidates(modern);
  if (hand.length) return hand;
  return analyzeSpanishForm(modern, ENGINE_OPTS).filter((a) => a.lemmaKnown).map(fromEngine);
}

/** Older spelling: the modern lemma, tagged es-hist, `notes.modern` the modern spelling; the surface is never altered. */
function historical(form: string): AnalysisCandidate[] {
  const old = OLD_CONTRACTIONS[form];
  if (old) {
    const parts: WordPart[] = [
      { text: 'de', start: 0, end: 2, lemma: 'de', pos: 'ADP' },
      { text: old.rest, start: 2, end: form.length, lemma: old.lemma, pos: old.lemma === 'este' ? 'DET' : 'PRON' },
    ];
    return [{
      lemma: 'de', pos: 'ADP', morph: {}, gloss: old.gloss, confidence: 0.7, parts, varieties: ['es-hist'], register: ['historical'],
      notes: { source: 'rule', modern: old.modern, historical: 'older contraction of de with a pronoun' }, origin: 'rule', sourceId: ES_SOURCE_IDS.rules,
    }];
  }
  const out: AnalysisCandidate[] = [];
  for (const r of historicalSpellings(form, (m) => solidReadings(m).length > 0, foldLookup)) {
    const exact = HISTORICAL_EXACT[form] === r.modern;
    for (const c of solidReadings(r.modern)) {
      out.push(annotate({
        ...c, confidence: Math.min(c.confidence, exact ? 0.7 : r.rules.length > 1 ? 0.5 : 0.6),
        varieties: union(c.varieties, ['es-hist']), register: union(c.register, ['historical']) as RegisterTag[],
        notes: { ...(c.notes ?? {}), source: 'rule', modern: r.modern, historical: r.rules.join('; ') }, origin: 'rule', sourceId: ES_SOURCE_IDS.rules,
      }));
    }
  }
  return out;
}

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

function analyzeFormUncached(form: string): AnalysisCandidate[] {
  if (HISTORICAL_EXACT[form] !== undefined) {
    const h = historical(form);
    if (h.length) return h;
  }
  const hand = handCandidates(form);
  if (hand.length) {
    const mergeable = hand.some((c) => !CLOSED.has(c.pos ?? '')) || ALSO_VERB.has(form);
    const base = hand.map((c) => withContractionParts(form, c));
    if (!mergeable) return base;
    const have = new Set(base.map(keyOf));
    // beside a word-list reading the rules add only readings of lemmas the list also knows: not a guessed verb
    // (después → "despuer") and not a guessed derivation (pelota → augmentative of pelo)
    const alt = engineRead(form).filter((c) => !have.has(keyOf(c)) && c.notes?.lemmaStatus === 'in the word list' && c.morph.Degree === undefined);
    if (!alt.length) return base;
    // the course list is the first reading; the rules' other readings follow it, below it
    const top = Math.min(0.75, Math.max(...base.map((c) => c.confidence)));
    return [...base.map((c) => ({ ...c, confidence: Math.min(c.confidence, top) })), ...alt.map((c) => ({ ...c, confidence: Math.min(c.confidence, top - 0.05) }))];
  }
  const cl = clitic(form);
  if (cl.length) return cl;
  const eng = engineRead(form);
  if (eng.some((c) => c.notes?.lemmaStatus === 'in the word list')) return eng;
  const hist = historical(form);
  // an old contraction (desta, deste, della) is a closed word: no guess stands beside it (a guessed verb "destar" was
  // put first after se or que, on every page of an old book)
  if (OLD_CONTRACTIONS[form]) return hist;
  // beside an older spelling of a word the list knows, only verb guesses (as before) are kept: not a noun or adjective guess from the ending
  return hist.length ? [...hist, ...eng.filter((c) => c.pos === 'VERB' || c.pos === 'AUX')] : eng;
}

const ROMAN_NUMERAL = /^(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/;
/** The value of capitals that are a Roman numeral of I, V, X, L, C (1–99); undefined for anything else. */
function romanNumeral(surface: string): number | undefined {
  if (!surface || !ROMAN_NUMERAL.test(surface) || surface === 'L') return undefined;
  const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  let total = 0;
  for (let k = 0; k < surface.length; k++) total += v[surface[k]] < (v[surface[k + 1]] ?? 0) ? -v[surface[k]] : v[surface[k]];
  return total;
}

/**
 * The readings of one word of a sentence before its neighbours order them: those of the written form, and — for a word
 * no list holds, written with a capital where no sentence begins (la Nela, de Aldeacorba) — the guess that it is a
 * name, before the guesses from its ending. A guess like them: `unconfirmed`, below 0.6, no gloss; a dictionary that
 * lists the word decides.
 */
function readWord(i: number, tokens: RawToken[]): AnalysisCandidate[] {
  const cands = analyzeForm(tokens[i].normalized);
  if (cands.some((c) => c.unconfirmed !== true)) return cands;
  // Felipe II, el siglo XIX, Carlos V: capitals that are a Roman numeral and no word of any list (a lone
  // C, D, L or M is an initial or an abbreviation — D. Juan — and is left alone; values 1 to 99)
  const roman = romanNumeral(tokens[i].surface);
  if (roman !== undefined) {
    return [annotate({
      lemma: tokens[i].surface, pos: 'NUM', morph: { NumForm: 'Roman' }, gloss: `${roman} (Roman numeral)`, confidence: 0.8, origin: 'rule', sourceId: ES_SOURCE_IDS.rules,
      notes: { source: 'rule', rule: `capitals that read as the Roman numeral ${roman}` },
    })];
  }
  if (!/^\p{Lu}\p{Ll}/u.test(tokens[i].surface) || !capitalInside(i, tokens)) return cands;
  const name = annotate({
    lemma: nfc(tokens[i].surface), pos: 'PROPN', morph: {}, confidence: 0.5, unconfirmed: true, origin: 'rule', sourceId: ES_SOURCE_IDS.rules,
    notes: { source: 'rule', rule: 'written with a capital inside the sentence and on no list: probably a name', lemmaStatus: 'inferred by the rules' },
  });
  return [name, ...cands.map((c) => (c.confidence >= name.confidence ? { ...c, confidence: name.confidence - 0.05 } : c))];
}

// quantifiers that are both a determiner and an adverb (mucho, poco, tanto …), and nouns that are also adverbs (tarde, mañana)
const QUANTIFIERS = new Set(['mucho', 'poco', 'tanto', 'demasiado', 'bastante']);
const TIME_NOUNS = new Set(['tarde', 'mañana']);

function disambiguate(i: number, tokens: RawToken[], base: AnalysisCandidate[][]): AnalysisCandidate[] {
  const cands = base[i];
  if (cands.length < 2) return cands;
  const w = tokens[i].normalized;
  const choose = (pos: string, conf: number): AnalysisCandidate[] => {
    const idx = cands.findIndex((c) => c.pos === pos && c.origin === 'hand');
    if (idx < 0) return cands;
    return [{ ...cands[idx], confidence: conf }, ...cands.filter((_, k) => k !== idx).map((c) => ({ ...c, confidence: Math.min(c.confidence, 0.3) }))];
  };
  if (QUANTIFIERS.has(w) && cands.some((c) => c.pos === 'DET') && cands.some((c) => c.pos === 'ADV')) {
    const nx = base[i + 1]?.[0];
    return nx && (nx.pos === 'NOUN' || nx.pos === 'PROPN') && tokens[i + 1].isWord ? choose('DET', 0.75) : choose('ADV', 0.7);
  }
  // (after aunque the verb is possible: "aunque tarde unos días" — left to the neighbour rules)
  if (TIME_NOUNS.has(w) && cands.some((c) => c.pos === 'NOUN') && cands.some((c) => c.pos === 'ADV') && tokens[i - 1]?.normalized !== 'aunque') {
    const pv = base[i - 1]?.[0];
    return pv && tokens[i - 1].isWord && pv.pos === 'DET' ? choose('NOUN', 0.75) : choose('ADV', 0.7);
  }
  return disambiguateSpanish(i, tokens, base);
}

/** A reading without what an ordering by context may have changed in it (its confidence, `notes.context`). */
function unordered(c: AnalysisCandidate): string {
  const { confidence: _confidence, notes, ...rest } = c;
  const { context: _context, ...kept } = notes ?? {};
  return JSON.stringify(Object.keys(kept).length ? { ...rest, notes: kept } : rest);
}

/**
 * The list of one of our own tokens after the importer put other readings beside ours (`refine`, `given`): the same
 * readings, none added or dropped. Those that are still ours but for an earlier ordering go first, as the form has
 * them without context (their order, their confidence, no `notes.context`); every other reading follows as it came.
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

// ── phrases ──
const PHRASES: PhraseRule[] = [
  { pattern: ['cuando', 'ser', 'joven'], display: 'cuando era joven', gloss: 'when I was young', kind: 'formula',
    variants: [['cuando', { gap: 1, only: ['PRON'] }, 'ser', 'joven']] },
  { pattern: ['empezar', 'a', 'entender'], display: 'empezar a entender', gloss: 'to begin to understand', kind: 'construction',
    variants: [['empezar', 'a', 'entender']] },
  { pattern: ['creer', 'en', '_'], display: 'creer en …', gloss: 'to believe in (someone)', kind: 'frame',
    variants: [['creer', 'en', { slot: true }], ['en', { slot: true, pos: ['PRON', 'PROPN'] }, 'creer']] },
  ...buildPhraseRules(),
];

const DET_NOUN_GUARD = /^h?á?a/u; // el agua, el alma: feminine nouns with stressed a- take "el"

function articleFor(defn: string, gender: string, number: string): string | undefined {
  for (const e of esLexicon.entries) {
    if (e.pos !== 'DET') continue;
    const f = e.forms.find((x) => x.morph.PronType === 'Art' && x.morph.Definite === defn && x.morph.Gender === gender && x.morph.Number === number);
    if (f) return f.form;
  }
  return undefined;
}

const SUPPORT: AdapterSupport = {
  tokenization: 'dependable', // Intl.Segmenter('es'); every token slices the input exactly
  sentenceSegmentation: 'limited', // ¿ ? ¡ ! « » dialogue dashes, ellipses and a list of abbreviations; an unlisted abbreviation (Av.) followed by a capital can split a sentence
  lemmatization: 'seed-only', // a hand list of about 1,500 lemmas and the closed classes; other words get a rule reading with its confidence (an inferred lemma stays at 0.6 or less) or none
  morphology: 'limited', // rule readings of verbs (incl. voseo, vosotros, attached pronouns), nouns and adjectives; ambiguity returns every reading; not measured on running prose yet
  phraseDetection: 'limited', // about 190 listed phrase units and 23 constructions, found where the neighbouring words are known; nothing is discovered
  productionChecks: 'limited',
  limitations: [
    'Lemmatization is seed-only: the built-in word list is a machine-drafted seed (about 1,500 lemmas and the closed classes) that has not been checked by a native speaker; any other word gets a rule reading marked as inferred, or none.',
    'A reading the rules only infer (the lemma is not in the word list) is kept so that the form is still explained, but it is a rule guess: origin "rule", confidence 0.6 at most, no gloss, a note saying the lemma is inferred, and never marked as a word-list hit. Go does not claim it.',
    'Regional words are tagged where known (Honduras, Central America, Latin America, Mexico, the Caribbean, the Andes, the Río de la Plata, Spain): only a handful of each is listed, and an untagged word is not thereby the same everywhere.',
    'Older spelling (á for a, fué, dixo, fazer, vn) is recognised without changing the text, and only when the modern spelling is a word Go knows.',
    'Phrase units and constructions are listed patterns, found only where the neighbouring words are in the word list or readable by the rules; they are not a grammar check.',
    'Sentence splitting knows the usual abbreviations (Sr., Sra., Dr., Ud., pág., núm., EE. UU., a. C.) but not every one.',
    'Production checks: article–noun agreement, de/a + el contraction, yo + conjugation (third-person verb or infinitive), and number above one + singular noun — only for words with a hand-written paradigm or a noun with a plural in the list.',
  ],
};

/**
 * Dictionary labels of an inflected form → the features the engine and the hand paradigms use for the same form
 * (same keys, same values), so that a rule reading and a dictionary reading of one form never contradict each other.
 * A label set is unordered. Several values of one feature become a comma list in a fixed order (persons ascending,
 * tenses Pres, Imp, Past, Fut): "first-person third-person singular present subjunctive" → Person '1,3'.
 * Anything else (usage, structure, region, "form-of") says nothing about the form and is ignored.
 */
const TAG_PERSON: Record<string, string> = { 'first-person': '1', 'second-person': '2', 'third-person': '3' };
const TAG_NUMBER: Record<string, string> = { singular: 'Sing', plural: 'Plur' };
const TAG_GENDER: Record<string, string> = { masculine: 'Masc', feminine: 'Fem' };
const TAG_MOOD: Record<string, string> = { indicative: 'Ind', subjunctive: 'Sub', imperative: 'Imp', conditional: 'Cnd' };
const TAG_TENSE: Record<string, string> = { present: 'Pres', imperfect: 'Imp', preterite: 'Past', future: 'Fut' };
const TAG_NONFINITE: Record<string, string> = { infinitive: 'Inf', gerund: 'Ger', participle: 'Part' };
/** -ísimo is "Abs" in the engine; Cmp has no engine counterpart yet. */
const TAG_DEGREE: Record<string, string> = { diminutive: 'Dim', augmentative: 'Aug', superlative: 'Abs', comparative: 'Cmp' };
const FEATURE_ORDER: Record<string, readonly string[]> = {
  Person: ['1', '2', '3'], Number: ['Sing', 'Plur'], Gender: ['Masc', 'Fem'], Mood: ['Ind', 'Sub', 'Imp', 'Cnd'], Tense: ['Pres', 'Imp', 'Past', 'Fut'],
};

function morphFromTags(tags: readonly string[]): Record<string, string> {
  const have = new Set(tags.map((t) => t.toLowerCase()));
  /** The values of one feature the labels give, in the feature's own order, as a comma list. */
  const pick = (feature: keyof typeof FEATURE_ORDER, table: Record<string, string>): string | undefined => {
    const values = new Set([...have].map((t) => table[t]).filter((v): v is string => v !== undefined));
    const list = FEATURE_ORDER[feature].filter((v) => values.has(v));
    return list.length ? list.join(',') : undefined;
  };
  const out: Record<string, string> = {};
  const set = (k: string, v: string | undefined) => { if (v !== undefined) out[k] = v; };
  const nonFinite = [...have].map((t) => TAG_NONFINITE[t]).find((v) => v !== undefined);
  const mood = pick('Mood', TAG_MOOD);
  if (nonFinite) {
    // an infinitive, gerund or participle has no person, mood or tense ("past" belongs to the participle); a participle agrees
    out.VerbForm = nonFinite;
    if (nonFinite === 'Part') { set('Gender', pick('Gender', TAG_GENDER)); set('Number', pick('Number', TAG_NUMBER)); }
    return out;
  }
  if (mood) out.VerbForm = 'Fin';
  set('Mood', mood);
  set('Tense', pick('Tense', TAG_TENSE));
  set('Person', pick('Person', TAG_PERSON));
  set('Number', pick('Number', TAG_NUMBER));
  set('Gender', pick('Gender', TAG_GENDER));
  // the engine marks the usted / ustedes command (hable, hablen) as formal: Mood Imp with the third person
  if (out.Mood === 'Imp' && out.Person === '3') out.Polite = 'Form';
  for (const t of have) if (TAG_DEGREE[t]) { out.Degree = TAG_DEGREE[t]; break; }
  return out;
}

/** Dictionary region and usage labels → variety codes (spanish/varieties.ts), de-duplicated, in the order given. */
function varietiesFromTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const code = ES_LABEL_VARIETIES[t.toLowerCase()];
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

export const esAdapter: LanguageAdapter = {
  lang: LANG,
  name: 'Spanish',
  script: 'Latn',
  version: VERSION,
  support: SUPPORT,
  sources: ES_SOURCES,
  varieties: ES_VARIETIES,

  segmentSentences: segmentSpanishSentences,
  tokenize: makeWordTokenizer({ locale: 'es', normalize }),
  normalize,
  /** Accent-insensitive (people type "corazon") but ñ stays distinct from n. */
  searchNormalize: (q) => {
    const s = normalize(q).replace(/ñ/g, '\u0001');
    return stripMarks(s).replace(/\u0001/g, 'ñ').trim();
  },

  analyze: (tokens): AnalyzedToken[] => {
    const base = tokens.map((t, i) => (t.isWord ? readWord(i, tokens) : []));
    return tokens.map((t, i) => ({ token: t, candidates: t.isWord ? disambiguate(i, tokens, base) : [], analyzer: ANALYZER }));
  },

  /**
   * The same ordering as `analyze`, after the importer put a dictionary's readings on some tokens. A token of this
   * adapter starts again from its context-free readings (what an earlier ordering did to them does not matter); any
   * other token brings its readings as they are, and its neighbours read them like ours. Only order, a lowered
   * confidence and `notes.context` can change; a token whose analyzer is not in `analyzers` is left exactly alone.
   * A token named in `given` is ours but carries readings the importer put beside ours: its list is kept whole, and
   * only the readings in it that are still exactly ours start again (see `startAgain`).
   */
  refine: (tokens, analyzed, analyzers, given): AnalyzedToken[] => {
    const base = tokens.map((t, i) => {
      if (analyzed[i].analyzer !== ANALYZER) return analyzed[i].candidates;
      if (given?.has(i)) return t.isWord ? startAgain(analyzed[i].candidates, readWord(i, tokens)) : analyzed[i].candidates;
      return t.isWord ? readWord(i, tokens) : [];
    });
    return tokens.map((t, i) => (t.isWord && analyzers.has(analyzed[i].analyzer)
      ? { ...analyzed[i], candidates: [...disambiguate(i, tokens, base)] }
      : analyzed[i]));
  },

  /** A dictionary may file a verb only as pronominal (arrepentirse), or the pronominal one under the bare verb. */
  lemmaVariants: (lemma, pos): string[] => {
    if (pos !== undefined && pos !== 'VERB') return [];
    if (/[aeií]rse$/.test(lemma)) return [lemma.slice(0, -2)];
    return /(ar|er|ir|ír)$/.test(lemma) ? [`${lemma}se`] : [];
  },

  detectPhrases(tokens, analyses): PhraseCandidate[] {
    const verbalSlot = (i: number) => !!analyses[i]?.candidates.some((c) => (c.pos === 'VERB' || c.pos === 'AUX') && (c.morph.VerbForm === 'Inf' || c.morph.VerbForm === 'Ger'));
    return matchPhraseRules(tokens, analyses, PHRASES, normalize)
      .filter((p) => !VERB_SLOT_PATTERNS.has(p.pattern.join(' ')) || verbalSlot(p.tokenIndexes[p.tokenIndexes.length - 1]));
  },

  detectPatterns(tokens, analyses): PatternCandidate[] {
    return detectSpanishConstructions(tokens, analyses);
  },

  pronunciation(token, analysis): PronunciationSupport {
    const s = token.normalized;
    const notes: string[] = [];
    if (/[áéíóú]/.test(s)) notes.push('Stress falls on the accented vowel.');
    else if (/[aeiouns]$/.test(s)) notes.push('No accent mark: stress is on the next-to-last syllable.');
    else notes.push('No accent mark: stress is on the last syllable.');
    if (/(?<!c)h/.test(s)) notes.push('h is silent.');
    if (/ll/.test(s)) notes.push('ll sounds like y in most of Latin America.');
    if (/ñ/.test(s)) notes.push('ñ is like "ny" in canyon.');
    if (/ce|ci|z/.test(s)) notes.push('c (before e/i) and z are pronounced like s in Latin America.');
    if (/j|g[ei]/.test(s)) notes.push('j and g (before e/i) are a breathy h-like sound.');
    if (/qu/.test(s)) notes.push('qu is a k sound; the u is silent.');
    void analysis;
    return { notes };
  },

  speechNormalize: (text, opts) => {
    void opts; // verse markers are stripped in every mode: they are never spoken
    // the raya of dialogue is punctuation, not a sound: the dash opening a turn is dropped; the pair that sets off a
    // reporting clause (—Hola —dijo Luis—.) becomes a pause
    const spoken = spokenDialogue(nfc(text));
    const inner = speechNormalizeGeneric(spoken, {
      tool: `speech-${LANG}@1`,
      numberToWords: esNumberToWords,
      percentWord: 'por ciento',
      abbreviations: [
        { pattern: /\bSra\./gu, replacement: 'señora', label: 'Sra.' },
        { pattern: /\bSr\./gu, replacement: 'señor', label: 'Sr.' },
        { pattern: /\bDra\./gu, replacement: 'doctora', label: 'Dra.' },
        { pattern: /\bDr\./gu, replacement: 'doctor', label: 'Dr.' },
        { pattern: /\betc\./gu, replacement: 'etcétera', label: 'etc.' },
      ],
    });
    if (spoken === nfc(text)) return inner;
    return {
      ...inner,
      transformations: [{ at: DETERMINISTIC_AT, tool: `speech-${LANG}@1`, description: 'dialogue dashes (raya) not spoken: dropped at the start of a turn, a pause around a reporting clause' }, ...inner.transformations],
    };
  },

  display: { wordSeparator: ' ', showBoundariesOnHighlight: false, fontFamily: 'Georgia, "Times New Roman", serif', lineHeight: 1.7 },

  checkProduction(tokens, analyses, _sentence): ErrorCandidate[] {
    const out: ErrorCandidate[] = [];
    for (let i = 0; i < tokens.length - 1; i++) {
      const a = analyses[i]?.candidates[0];
      const b = analyses[i + 1]?.candidates[0];
      if (!tokens[i].isWord || !tokens[i + 1].isWord) continue;

      // contraction: de el → del, a el → al
      if (tokens[i + 1].normalized === 'el' && ['de', 'a'].includes(tokens[i].normalized)) {
        out.push({
          category: 'morphology', tokenIndexes: [i, i + 1], confidence: 0.9, affectsMeaning: false,
          message: `"${tokens[i].normalized} el" contracts to "${tokens[i].normalized === 'de' ? 'del' : 'al'}".`,
          suggestion: { start: tokens[i].start, end: tokens[i + 1].end, replacement: matchCase(tokens[i].surface, tokens[i].normalized === 'de' ? 'del' : 'al') },
        });
        continue;
      }

      // article–noun agreement
      if (a?.pos === 'DET' && a.morph.PronType === 'Art' && b?.pos === 'NOUN' && !`${a.morph.Gender}${a.morph.Number}${b.morph.Gender}${b.morph.Number}`.includes(',')) {
        const mismatch = (a.morph.Gender && b.morph.Gender && a.morph.Gender !== b.morph.Gender) || (a.morph.Number && b.morph.Number && a.morph.Number !== b.morph.Number);
        const exempt = b.morph.Gender === 'Fem' && b.morph.Number === 'Sing' && DET_NOUN_GUARD.test(tokens[i + 1].normalized);
        if (mismatch && !exempt) {
          const fix = articleFor(a.morph.Definite, b.morph.Gender, b.morph.Number);
          out.push({
            category: 'agreement', tokenIndexes: [i, i + 1], confidence: 0.85, affectsMeaning: false,
            message: `The article should agree with the noun: "${tokens[i + 1].surface}" is ${b.morph.Gender === 'Fem' ? 'feminine' : 'masculine'} ${b.morph.Number === 'Plur' ? 'plural' : 'singular'}.`,
            suggestion: fix ? { start: tokens[i].start, end: tokens[i].end, replacement: matchCase(tokens[i].surface, fix) } : undefined,
          });
        }
      }

      // yo + verb that is not first person
      if (tokens[i].normalized === 'yo') {
        const j = tokens[i + 1].normalized === 'no' ? i + 2 : i + 1;
        const v = analyses[j]?.candidates[0];
        const entry = v?.lemma ? esLexicon.find(v.lemma) : undefined;
        const isVerb = !!v && (v.pos === 'VERB' || v.pos === 'AUX') && !!tokens[j]?.isWord;
        if (isVerb && v.morph.Person && !v.morph.Person.split(',').includes('1') && v.morph.Number === 'Sing') {
          // "yo tiene" → "yo tengo": third-person verb after yo
          const want: Record<string, string> = { Person: '1', Number: 'Sing' };
          for (const k of ['Tense', 'Mood'] as const) if (v.morph[k] && !v.morph[k].includes(',')) want[k] = v.morph[k];
          const fix = entry ? esLexicon.formWith(entry, want) : undefined;
          out.push({
            category: 'conjugation', tokenIndexes: [i, j], confidence: fix ? 0.8 : 0.65, affectsMeaning: false,
            message: '"yo" takes the first-person verb form.',
            suggestion: fix ? { start: tokens[j].start, end: tokens[j].end, replacement: matchCase(tokens[j].surface, fix.form) } : undefined,
          });
        } else if (isVerb && v.morph.VerbForm === 'Inf' && !v.notes?.clitics && entry && entry.forms.length > 1) {
          // "Yo creer" → "Yo creo": a bare infinitive after yo (only for a verb with a hand-written paradigm; others are not guessed at)
          const fix = esLexicon.formWith(entry, { Person: '1', Number: 'Sing', Tense: 'Pres', Mood: 'Ind' });
          out.push({
            category: 'conjugation', tokenIndexes: [i, j], confidence: fix ? 0.8 : 0.65, affectsMeaning: false,
            message: '"yo" needs a conjugated verb, not the infinitive: "yo creo", not "yo creer".',
            suggestion: fix ? { start: tokens[j].start, end: tokens[j].end, replacement: matchCase(tokens[j].surface, fix.form) } : undefined,
          });
        }
      }
    }

    // number above one + singular noun → plural ("cinco año" → "cinco años"); only when the lexicon has the plural
    for (let i = 0; i < tokens.length - 1; i++) {
      const digits = !tokens[i].isWord && /^\p{Nd}+$/u.test(tokens[i].surface);
      const n = digits ? Number(tokens[i].surface) : tokens[i].isWord && analyses[i]?.candidates[0]?.pos === 'NUM' ? NUMERAL_VALUE[tokens[i].normalized] : undefined;
      if (n === undefined || !(n > 1)) continue;
      const b = analyses[i + 1]?.candidates[0];
      if (!tokens[i + 1].isWord || b?.pos !== 'NOUN' || b.morph.Number !== 'Sing' || !b.lemma) continue;
      const entry = esLexicon.find(b.lemma, 'NOUN');
      const plural = entry ? esLexicon.formWith(entry, { Number: 'Plur' }) : undefined;
      if (!plural) continue;
      out.push({
        category: 'agreement', tokenIndexes: [i, i + 1], confidence: 0.85, affectsMeaning: false,
        message: `After a number above one the noun is plural: "${plural.form}".`,
        suggestion: { start: tokens[i + 1].start, end: tokens[i + 1].end, replacement: matchCase(tokens[i + 1].surface, plural.form) },
      });
    }
    return out;
  },

  relate(a, b) {
    const na = normalize(a), nb = normalize(b);
    if (na === nb) return 'same';
    // the lemmas of each form (the word list, attached pronouns, the rules and older spelling): readings of 0.5 or more count
    const lemmas = (form: string) => new Set(analyzeForm(form).filter((c) => c.confidence >= 0.5 && c.lemma).map((c) => c.lemma as string));
    const lb = lemmas(nb);
    for (const l of lemmas(na)) if (lb.has(l)) return 'inflection';
    return 'none';
  },

  morphFromTags,
  varietiesFromTags,
  describeMorph: (morph) => describeSpanishMorph(morph),
};

// ── numbers 0–999 999 ──
const U = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const T: Record<number, string> = { 3: 'treinta', 4: 'cuarenta', 5: 'cincuenta', 6: 'sesenta', 7: 'setenta', 8: 'ochenta', 9: 'noventa' };
const H = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function below1000(n: number): string {
  if (n < 30) return U[n];
  if (n < 100) { const u = n % 10; return T[Math.floor(n / 10)] + (u ? ` y ${U[u]}` : ''); }
  if (n === 100) return 'cien';
  const r = n % 100;
  return H[Math.floor(n / 100)] + (r ? ` ${below1000(r)}` : '');
}

export function esNumberToWords(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 999999) return null;
  if (n < 1000) return below1000(n);
  const th = Math.floor(n / 1000);
  const r = n % 1000;
  const head = th === 1 ? 'mil' : `${below1000(th).replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un')} mil`;
  return r ? `${head} ${below1000(r)}` : head;
}

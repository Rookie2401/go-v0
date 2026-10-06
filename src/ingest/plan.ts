/**
 * Planning: a validated CorpusDocument → everything the importer needs, computed purely in memory
 * (segmentation, tokenization, analysis, phrases, patterns, publication decision, content signature).
 * Nothing here touches a store. Row ids that depend on the final sentence key (tokens, analyses, occurrences)
 * are produced later by `materializeSentence`, once the importer has decided which existing sentences survive.
 */
import type {
  AdapterRegistry, AnalysisCandidate, AnalysisOrigin, AnalysisSourceInfo, AnalyzedToken, ContentNote, DictionaryEntry, DictionarySense, EnglishRescue, GrammarPattern, LanguageAdapter, Lemma,
  PartOfSpeech, PatternCandidate, PatternOccurrence, Phrase, PhraseCandidate, PhraseOccurrence, RawToken, ReviewStatus, Token, TokenAnalysis,
} from '../core';
import { hash, ids } from '../core';
import type { AnalysisCoverage } from '../adapters/shared';
import { anchorDocumentNotes, workIdOf, type CorpusDocument, type DocCorrection, type DocNote, type DocSpan, type ValidationIssue } from './format';
import { computePublished, type PublicationDecision } from './publish';

export const INGEST_TOOL = 'ingest@2';
export const IMPORT_ANALYZER = 'import@2';

/** A note ready to be stored once the sentence's final key is known. */
export interface PlannedNote {
  kind: ContentNote['kind'];
  body: string;
  /** Indexes (into the sentence's tokens) of the tokens the note's start/end cover; absent for a whole-sentence note. */
  tokenIndexes?: number[];
  spans?: Array<{ start: number; end: number; label: string }>;
  topics?: string[];
  provenance: 'human' | 'machine';
  reviewStatus: ReviewStatus;
  by?: string;
}

export interface PlannedSentence {
  /** Author-supplied id (stable key), when given. */
  authorId?: string;
  /** ids.sentenceKey(text, repeat) — the key when there is no author id. */
  hashKey: string;
  text: string;
  english?: string;
  verseRefs?: string[];
  /** Display name of the speaker (Sentence.speaker). */
  speaker?: string;
  paragraphIndex: number;
  paraStart: number;
  paraEnd: number;
  tokens: RawToken[];
  /** Adapter analysis with author spans already applied (span ⇒ that token's candidates are the author's). */
  analyzed: AnalyzedToken[];
  /** Token indexes whose analysis came from an author span. */
  spanTokens: Set<number>;
  corrections: DocCorrection[];
  phrases: PhraseCandidate[];
  patterns: PatternCandidate[];
  notes: PlannedNote[];
}

export interface PlannedParagraph { sectionIndex: number; originalText: string }

export interface DocumentPlan {
  doc: CorpusDocument;
  textId: string;
  adapter: LanguageAdapter;
  analyzerName: string;
  paragraphs: PlannedParagraph[];
  sentences: PlannedSentence[];
  coverage: AnalysisCoverage;
  decision: PublicationDecision;
  /** Hash of everything the import would write (apart from timestamps): equal signature ⇒ nothing to do. */
  signature: string;
  nonNfcBlocks: number;
  tokenCount: number;
  /** `Text.workId` (from `doc.work`), when the document names a work. */
  workId?: string;
  /**
   * The analyzer name of the installed dictionary; `tokens` = words only the dictionary knew (analysed from it),
   * `decided` = words the adapter only guessed at (every reading `unconfirmed`) whose readings the dictionary decided,
   * `lemmaOnly` = guessed words the dictionary has no entry for whose rule-derived lemma it does list (kept as the rule's reading),
   * `joined` = words the adapter reads from its own data that also got a dictionary reading of another word or part of speech
   * after the adapter's own (only when the adapter can order them by context, `refine`),
   * `units` = guessed units written as several words (a verb and its stranded particle) whose lemma the dictionary lists,
   * `alongside` = words the adapter analyses that were marked as also in the dictionary.
   */
  dictionary?: { tool: string; tokens: number; decided: number; lemmaOnly: number; joined: number; units: number; alongside: number };
  noteCount: number;
}

/** One sentence as the adapter reads it, before any dictionary rule: what `planDocument` starts from. */
export interface SentenceAnalysis { text: string; tokens: RawToken[]; analyzed: AnalyzedToken[] }

export interface PlanOptions {
  /** Dictionary entries by adapter-normalized form (any word of the text; one the adapter analyses gets them beside its own analysis). */
  dictionary?: ReadonlyMap<string, readonly DictionaryEntry[]>;
  /** `DictionaryInfo.id` of the dictionary the entries came from: part of the analyzer name and of the signature. */
  dictionaryId?: string;
  /**
   * The adapter's analysis of this document's sentences, in reading order (`analyseDocument`), when the caller already has it:
   * the plan then starts from it instead of analysing every sentence again. Absent ⇒ the plan analyses the text itself.
   */
  analysis?: readonly SentenceAnalysis[];
}

const defaultSeparator = ' ';

/** An author's span: origin `corpus` (the text's own supplier), source `import@2`. */
function toCandidate(sp: DocSpan): AnalysisCandidate {
  return { lemma: sp.lemma, pos: sp.pos, morph: sp.morph ? { ...sp.morph } : {}, gloss: sp.gloss, confidence: sp.confidence ?? 1, origin: 'corpus', sourceId: IMPORT_ANALYZER };
}

/** The sentence texts of a document in reading order, exactly as `planDocument` will segment them. */
export function sentenceTextsOf(doc: CorpusDocument, adapter: LanguageAdapter): string[] {
  const out: string[] = [];
  for (const sec of doc.sections) {
    for (const par of sec.paragraphs) {
      if ('sentences' in par) for (const s of par.sentences) out.push(s.text);
      else for (const sp of adapter.segmentSentences(par.text)) out.push(sp.text);
    }
  }
  return out;
}

/** The adapter's analysis of every sentence of a document, in the order `planDocument` meets them (pass it as `PlanOptions.analysis`). */
export function analyseDocument(doc: CorpusDocument, registry: AdapterRegistry): SentenceAnalysis[] {
  const adapter = registry.get(doc.lang);
  return sentenceTextsOf(doc, adapter).map((text) => {
    const tokens = adapter.tokenize(text);
    return { text, tokens, analyzed: adapter.analyze(tokens) };
  });
}

/** A candidate that says nothing about the word (for instance a decoding-only candidate) does not count as an analysis. */
const says = (c: AnalysisCandidate): boolean => !!(c.lemma || c.pos || c.gloss || c.role || c.definition || c.register?.length);
const unanalysed = (a: AnalyzedToken): boolean => a.token.isWord && !a.candidates.some(says);
/** A word the dictionary may decide: the adapter says something about it, and every reading it gives is an unconfirmed guess. */
const decidable = (a: AnalyzedToken): boolean => {
  if (!a.token.isWord) return false;
  const saying = a.candidates.filter(says);
  return saying.length > 0 && saying.every((c) => c.unconfirmed === true);
};
/**
 * A guess that this token is one piece of a unit written as several words (a verb and a particle stranded at the clause end).
 * It is judged by the unit's own lemma, never by the written form's entry, so the rules for the written form leave it aside.
 */
const unitGuess = (c: AnalysisCandidate): boolean => !!c.unit && c.unconfirmed === true;
/** The token as the rules for its written form see it: without its guessed units. */
const withoutUnitGuesses = (a: AnalyzedToken): AnalyzedToken => (a.candidates.some(unitGuess) ? { ...a, candidates: a.candidates.filter((c) => !unitGuess(c)) } : a);

/** The normalized forms of word tokens the adapter cannot analyse. */
export function collectUnanalysedForms(doc: CorpusDocument, registry: AdapterRegistry): Set<string> {
  const adapter = registry.get(doc.lang);
  const forms = new Set<string>();
  for (const text of sentenceTextsOf(doc, adapter)) {
    const tokens = adapter.tokenize(text);
    for (const a of adapter.analyze(tokens)) if (unanalysed(a)) forms.add(a.token.normalized);
  }
  return forms;
}

/** The normalized forms of EVERY word token: what the dictionary pre-pass looks up (it also stands beside the adapter's analyses). */
export function collectWordForms(doc: CorpusDocument, registry: AdapterRegistry): Set<string> {
  const adapter = registry.get(doc.lang);
  const forms = new Set<string>();
  for (const text of sentenceTextsOf(doc, adapter)) for (const t of adapter.tokenize(text)) if (t.isWord) forms.add(t.normalized);
  return forms;
}

/** The same forms, in the same order, read from an analysis the caller already has (`analyseDocument`). */
export function wordFormsOf(analysis: readonly SentenceAnalysis[]): Set<string> {
  const forms = new Set<string>();
  for (const s of analysis) for (const t of s.tokens) if (t.isWord) forms.add(t.normalized);
  return forms;
}

/**
 * What the dictionary says about a form, for display: the short glosses, the parts of speech and the distinct readings,
 * built with the same rules as `dictionaryCandidates` so the reader's view and the imported analysis cannot drift.
 */
export function dictionaryView(entries: readonly DictionaryEntry[]): { glosses: string[]; pos: PartOfSpeech[]; readings: string[] } {
  const glosses: string[] = [];
  const pos: PartOfSpeech[] = [];
  for (const e of entries) {
    for (const g of e.glosses) if (g.trim().length > 0 && !glosses.includes(g)) glosses.push(g);
    if (e.pos && !pos.includes(e.pos)) pos.push(e.pos);
  }
  return { glosses, pos, readings: readingsOf(entries) };
}

/** The distinct readings (respellings, else IPA) the entries of one form list, first one first. */
function readingsOf(entries: readonly DictionaryEntry[]): string[] {
  const out: string[] = [];
  for (const e of entries) {
    const list = e.pronunciations?.length ? e.pronunciations.map((p) => p.respelling ?? p.ipa) : [e.respelling ?? e.ipa];
    for (const r of list) if (r && !out.includes(r)) out.push(r);
  }
  return out;
}

/** The part-of-speech pairs that count as the same word class when a dictionary and a rule set are compared (a verb is an auxiliary in some uses). */
const VERBAL = new Set<PartOfSpeech>(['VERB', 'AUX']);

/**
 * The lemma's own dictionary entry for a reading of part of speech `pos`: the first entry that has glosses of its own (a
 * form-of entry and an entry that is only another spelling do not: their labels are no meaning) and whose part of speech
 * fits - equal, both verbal, or the reading has none.
 * No entry of the right word class means no entry: a verb form is never glossed with the noun's meaning.
 */
function lemmaEntryFor(lemmaEntries: readonly DictionaryEntry[] | undefined, pos: PartOfSpeech | undefined): DictionaryEntry | undefined {
  return (lemmaEntries ?? []).find((e) => !e.formOf?.length && !alternativeOnly(e) && e.glosses.some((g) => g.trim().length > 0) && posFits(pos, e));
}
/** An entry's part of speech fits a reading's: equal, both verbal, or the reading has none. */
const posFits = (pos: PartOfSpeech | undefined, e: DictionaryEntry): boolean =>
  pos === undefined || e.pos === pos || (e.pos !== undefined && VERBAL.has(pos) && VERBAL.has(e.pos));

/**
 * A form of a form: a lemma L that an inflected form names may itself be only an inflected form ("encallecido", listed only
 * as the past participle of "encallecer"). When L's entries of a fitting word class carry exactly one such relation, it is
 * returned (the lemma M and L's labels for it); several relations name no single lemma, so none is chosen. One step only.
 */
function formOfForm(entriesOfL: readonly DictionaryEntry[] | undefined, pos: PartOfSpeech | undefined): { lemma: string; tags: string[] } | undefined {
  const relations = (entriesOfL ?? []).filter((x) => posFits(pos, x)).flatMap((x) => x.formOf ?? []);
  return relations.length === 1 ? relations[0] : undefined;
}

const CAPITAL = /\p{Lu}|\p{Lt}/u;
const SMALL = /\p{Ll}/u;
/** The first letter of a spelling is a capital. */
const startsWithCapital = (s: string): boolean => { const first = /\p{L}/u.exec(s)?.[0]; return first !== undefined && CAPITAL.test(first); };
/** A spelling with capitals and no small letter at all (a headline, an initialism). */
const allCapitals = (s: string): boolean => CAPITAL.test(s) && !SMALL.test(s);

/**
 * How the source writes a headword, as far as its capitals go: 'capitals' = two or more capital letters with no small
 * letter before the first run of capitals ends (PA, ESO, TVE, EE. UU., McDonald); 'capitalised' = it starts with its one
 * capital (Rosa, Marte, Dios); 'any' = everything else (no capital at all, or a small letter first: iPhone, pH).
 */
export function writtenCase(written: string): 'capitals' | 'capitalised' | 'any' {
  const chars = [...written];
  const first = chars.findIndex((c) => CAPITAL.test(c));
  if (first < 0) return 'any';
  let end = first;
  while (end < chars.length && CAPITAL.test(chars[end])) end++;
  const capitals = chars.filter((c) => CAPITAL.test(c)).length;
  if (capitals >= 2 && !SMALL.test(chars.slice(0, end).join(''))) return 'capitals';
  return startsWithCapital(written) ? 'capitalised' : 'any';
}

/**
 * Is this entry a reading of a word written `surface`? An entry written with capitals in the source (`written`; the form
 * it is filed under has lost them) is a reading only of a word written that way:
 *  - an all-capitals word or initialism (PA, ESO): only of the same spelling exactly, or of a word in ALL capitals (a headline);
 *  - a capitalised word (Rosa, Marte): only of a word that starts with a capital (so a sentence-initial word still gets both
 *    the name and the common word, and the adapter's context rules choose);
 *  - anything else, and every entry without `written`: of any word.
 * A script without capitals has no such entries, so nothing changes there.
 */
export function entryAppliesTo(surface: string, entry: Pick<DictionaryEntry, 'written'>): boolean {
  if (entry.written === undefined) return true;
  const written = entry.written.normalize('NFC');
  const s = surface.normalize('NFC');
  switch (writtenCase(written)) {
    case 'capitals': return s === written || allCapitals(s);
    case 'capitalised': return startsWithCapital(s);
    default: return true;
  }
}

/**
 * The dictionary's entries for one token: those filed under its form that are readings of a word written as the token is
 * (`entryAppliesTo`). The one place a token's entries are read: what is left out here is left out for that token
 * everywhere (deciding, explaining, joining, the marker).
 */
function entriesFor(dictionary: ReadonlyMap<string, readonly DictionaryEntry[]>, token: RawToken): readonly DictionaryEntry[] {
  const filed = dictionary.get(token.normalized) ?? [];
  return filed.some((e) => e.written !== undefined) ? filed.filter((e) => entryAppliesTo(token.surface, e)) : filed;
}

/** A lemma's entry as the importer found it; `headword` is set when it is filed under another headword than the lemma asked for. */
interface LemmaHit { entry: DictionaryEntry; headword?: string }
/** `spelling` = the spelling the lemma is looked up from, when that is not the lemma itself (an inflected form the source writes with a capital). */
type LemmaLookup = (lemma: string, pos: PartOfSpeech | undefined, spelling?: string) => LemmaHit | undefined;

/**
 * Where the importer looks for a lemma's own entry: under the lemma itself, and when that has no entry of the right word
 * class, under the other headwords the adapter says a dictionary may file it under (`lemmaVariants`), in order.
 * An entry the source writes with capitals counts only when the lemma is written that way too (`entryAppliesTo`): the
 * common word rosa is never glossed from the name Rosa. A lemma named by an inflected form's entry has lost its capitals
 * (the build normalizes it), so there the form's own spelling in the source decides (Rosas → Rosa).
 */
function lemmaLookup(
  lemmaEntries: ((lemma: string) => readonly DictionaryEntry[] | undefined) | undefined,
  lemmaVariants: ((lemma: string, pos?: PartOfSpeech) => string[]) | undefined,
): LemmaLookup {
  return (lemma, pos, spelling) => {
    const entriesOf = (headword: string) => lemmaEntries?.(headword)?.filter((e) => entryAppliesTo(spelling ?? headword, e));
    const own = lemmaEntryFor(entriesOf(lemma), pos);
    if (own) return { entry: own };
    for (const headword of lemmaVariants?.(lemma, pos) ?? []) {
      const entry = lemmaEntryFor(entriesOf(headword), pos);
      if (entry) return { entry, headword };
    }
    return undefined;
  };
}

/** The first two glosses of an entry, joined. */
const shortGloss = (e: DictionaryEntry): string => e.glosses.filter((g) => g.trim().length > 0).slice(0, 2).join('; ');

/** A sense that only points at another headword (the source's own labels `alt-of` / `form-of`). */
const pointsElsewhere = (s: DictionarySense): boolean => !!s.tags?.some((t) => { const l = t.toLowerCase(); return l === 'alt-of' || l === 'form-of'; });

/**
 * An entry that is only an alternative spelling or form of other headwords ("obsolete spelling of X", "apocopic form of X"):
 * it names them (`altOf`) and has no sense of its own. With no `senses` kept, glosses of its own cannot be told from labels,
 * so only an entry without glosses counts.
 */
function alternativeOnly(e: DictionaryEntry): boolean {
  if (!e.altOf?.length || e.formOf?.length) return false;
  const senses = e.senses ?? [];
  return senses.length ? senses.every(pointsElsewhere) : !e.glosses.some((g) => g.trim().length > 0);
}

/** The source's labels that hold for every sense of an entry (an entry without `senses` has none): one regional sense among general ones marks nothing. */
function labelsOfEverySense(e: DictionaryEntry): string[] {
  const senses = e.senses ?? [];
  if (!senses.length) return [];
  return (senses[0].tags ?? []).filter((t) => senses.every((s) => s.tags?.includes(t)));
}

/** The confidence of a reading by rule whose lemma the dictionary lists (the dictionary lacks the form itself). */
export const LEMMA_IN_DICTIONARY = 0.6;

/**
 * Dictionary entries of one form → analysis candidates (origin `dictionary`, source = `sourceId`, the dictionary id).
 * A dictionary lists what a written form can mean, so confidence is below certainty (0.6 when the form has one part of
 * speech, 0.45 when it has several); entry order is kept, the first is the best candidate and the rest become
 * alternatives. When the entries list more than one reading, the first candidate carries them all in `notes.readings`.
 * An inflected form has no gloss of its own worth showing ("first-person singular of …"): when `lemmaEntries` can say what
 * the lemma means, the candidate's gloss is the lemma's (`notes.glossFrom = 'lemma'`). Region labels become varieties through
 * `varietiesFromTags` only where they hold for the whole reading: every sense of a headword entry, the form-of relation's own
 * tags, and (when the gloss came from it) every sense of the lemma entry.
 * An entry that is only another spelling of a headword (`altOf`, no sense of its own) is a reading of that headword: lemma =
 * the target (one candidate per target), gloss = the target's own, the form's label kept in `notes.altOf`.
 * `lemmaVariants` names other headwords a lemma may be filed under; an entry found there gives the gloss, the candidate keeps
 * the lemma it had, and `notes.lemmaEntry` names the headword used.
 * A form of a form: when the lemma an inflected form names has no entry of its own and is itself listed as exactly one form
 * of a lemma that has one, that lemma is the candidate's, the labels are the form's own followed by the middle step's, and
 * `notes.formOfChain` names the middle step.
 */
export function dictionaryCandidates(
  form: string, entries: readonly DictionaryEntry[], sourceId?: string, morphFromTags?: (tags: readonly string[]) => Record<string, string>,
  lemmaEntries?: (lemma: string) => readonly DictionaryEntry[] | undefined, varietiesFromTags?: (tags: readonly string[]) => string[],
  lemmaVariants?: (lemma: string, pos?: PartOfSpeech) => string[],
): AnalysisCandidate[] {
  return candidatesByEntry(form, entries, sourceId, morphFromTags, lemmaEntries, varietiesFromTags, lemmaVariants).flat();
}

/** The same candidates, kept apart by the entry each comes from (list k is of entry k). */
function candidatesByEntry(
  form: string, entries: readonly DictionaryEntry[], sourceId?: string, morphFromTags?: (tags: readonly string[]) => Record<string, string>,
  lemmaEntries?: (lemma: string) => readonly DictionaryEntry[] | undefined, varietiesFromTags?: (tags: readonly string[]) => string[],
  lemmaVariants?: (lemma: string, pos?: PartOfSpeech) => string[],
): AnalysisCandidate[][] {
  const lemmaOf = lemmaLookup(lemmaEntries, lemmaVariants);
  const varietiesOf = (...tagLists: string[][]): { varieties: string[] } | Record<string, never> => {
    const out = [...new Set(tagLists.flatMap((t) => (varietiesFromTags && t.length ? varietiesFromTags(t) : [])))];
    return out.length ? { varieties: out } : {};
  };
  const confidence = new Set(entries.map((e) => e.pos ?? '')).size > 1 ? 0.45 : 0.6;
  const readings = readingsOf(entries);
  return entries.map((e, k): AnalysisCandidate[] => {
    const glosses = e.glosses.filter((g) => g.trim().length > 0);
    const notes: Record<string, string | string[]> = {};
    if (e.respelling) notes.respelling = e.respelling;
    if (e.ipa) notes.ipa = e.ipa;
    if (e.romanization) notes.romanization = e.romanization;
    if (glosses.length > 2) notes.senses = glosses.slice(2);
    if (e.classifiers?.length) notes.classifiers = [...e.classifiers];
    if (k === 0 && readings.length > 1) notes.readings = readings;
    const common = {
      pos: e.pos, confidence, origin: 'dictionary' as const, ...(sourceId ? { sourceId } : {}),
      ...(glosses.length ? { gloss: glosses.slice(0, 2).join('; ') } : {}),
      ...(e.register?.length ? { register: [...e.register] } : {}),
      ...(e.role ? { role: e.role } : {}),
      ...(e.definition ? { definition: e.definition } : {}),
    };
    // an inflected form: the candidate's lemma is the form-of lemma (one candidate per lemma the entry is a form of), its
    // grammatical labels are the source's own tags, read into `morph` when the adapter can (never guessed otherwise)
    if (e.formOf?.length) {
      return e.formOf.map((f, j) => {
        let lemma = f.lemma;
        let tags = f.tags;
        let hit = lemmaOf(f.lemma, e.pos, e.written);
        let chain: string[] | undefined;
        if (!hit) {
          // a form of a form (encallecidas → encallecido → encallecer): the lemma is the one at the end, the labels are both steps'
          const via = formOfForm(lemmaEntries?.(f.lemma)?.filter((x) => entryAppliesTo(e.written ?? f.lemma, x)), e.pos);
          const further = via && via.lemma !== f.lemma && via.lemma !== form ? lemmaOf(via.lemma, e.pos, e.written) : undefined;
          if (via && further) { hit = further; lemma = via.lemma; tags = [...new Set([...f.tags, ...via.tags])]; chain = [f.lemma]; }
        }
        const own: Record<string, string | string[]> = { ...notes, formOfTags: [...tags] };
        if (j > 0) delete own.readings;
        if (chain) own.formOfChain = chain;
        if (hit) own.glossFrom = 'lemma';
        if (hit?.headword) own.lemmaEntry = hit.headword;
        return {
          ...common, ...(hit ? { gloss: shortGloss(hit.entry) } : {}), lemma, morph: morphFromTags ? { ...morphFromTags(tags) } : {}, notes: own,
          ...varietiesOf(tags, hit ? labelsOfEverySense(hit.entry) : []),
        };
      });
    }
    // only another spelling of a headword: a reading of that headword, with the headword's own meaning when its entry is found;
    // the form's label ("obsolete spelling of …") stays in the notes and is never taken for a meaning of the headword
    if (alternativeOnly(e)) {
      return e.altOf!.map((target, j) => {
        const own: Record<string, string | string[]> = { ...notes, ...(glosses.length ? { altOf: glosses[0] } : {}) };
        delete own.senses;
        if (j > 0) delete own.readings;
        const hit = lemmaOf(target, e.pos);
        if (hit) own.glossFrom = 'lemma';
        if (hit?.headword) own.lemmaEntry = hit.headword;
        return {
          ...common, ...(hit ? { gloss: shortGloss(hit.entry) } : {}), lemma: target, morph: {}, ...(Object.keys(own).length ? { notes: own } : {}),
          ...varietiesOf(labelsOfEverySense(e), hit ? labelsOfEverySense(hit.entry) : []),
        };
      });
    }
    return [{ ...common, lemma: form, morph: {}, ...(Object.keys(notes).length ? { notes } : {}), ...varietiesOf(labelsOfEverySense(e)) }];
  });
}

/** The analyzer name of a dictionary's analyses. */
export const dictionaryTool = (dictionaryId: string): string => `dict:${dictionaryId}`;

/** The confidence of a reading the dictionary and a rule reading agree on: two independent sources, still not a hand-checked analysis. */
export const CONFIRMED_BY_DICTIONARY = 0.7;

/** Two feature sets agree when every feature both state has a value in common (a value may be a comma list: "1,3"). */
function morphAgrees(a: Record<string, string>, b: Record<string, string>): boolean {
  for (const k of Object.keys(a)) {
    if (!(k in b)) continue;
    const mine = a[k].split(',');
    if (!b[k].split(',').some((v) => mine.includes(v))) return false;
  }
  return true;
}

const morphKey = (m: Record<string, string>): string => JSON.stringify(Object.keys(m).sort().map((k) => [k, m[k]]));

/**
 * The dictionary decides a word the rules only guessed at: each dictionary reading that a rule reading agrees with (same
 * lemma, a part of speech that fits, and no contradicting feature) becomes one reading with the rule's features and
 * word parts, stored as confirmed by the dictionary; a dictionary reading no rule matched stands alone with its own
 * confidence; guesses the dictionary does not list are dropped.
 */
function decideByDictionary(adapter: LanguageAdapter, dictionary: readonly AnalysisCandidate[], guesses: readonly AnalysisCandidate[]): AnalysisCandidate[] {
  const out: AnalysisCandidate[] = [];
  const seen = new Set<string>();
  const add = (c: AnalysisCandidate) => {
    const key = `${c.lemma}|${c.pos ?? ''}|${morphKey(c.morph)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(c);
  };
  for (const d of dictionary) {
    const lemma = d.lemma !== undefined ? adapter.normalize(d.lemma) : undefined;
    const fromFormOf = !!d.notes?.formOfTags && Object.keys(d.morph).length > 0;
    const matches = lemma === undefined ? [] : guesses.filter((r) => {
      if (r.lemma === undefined || adapter.normalize(r.lemma) !== lemma) return false;
      if (!(d.pos === undefined || d.pos === r.pos || (d.pos && r.pos && VERBAL.has(d.pos) && VERBAL.has(r.pos)))) return false;
      return !fromFormOf || morphAgrees(d.morph, r.morph);
    });
    if (!matches.length) { add(d); continue; }
    for (const r of matches) {
      const varieties = [...new Set([...(d.varieties ?? []), ...(r.varieties ?? [])])];
      const rule = r.notes?.rule;
      const notes = { ...(d.notes ?? {}), ...(rule !== undefined ? { rule } : {}) };
      add({
        lemma: d.lemma, pos: d.pos ?? r.pos, morph: { ...r.morph }, ...(r.parts?.length ? { parts: r.parts.map((p) => ({ ...p, ...(p.morph ? { morph: { ...p.morph } } : {}) })) } : {}),
        // what the rule says about the written word beyond its grammar travels with it: a unit of several words, an older spelling
        ...(r.unit ? { unit: { ...r.unit, pieces: [...r.unit.pieces] } } : {}), ...(r.orthography ? { orthography: { ...r.orthography } } : {}),
        ...(varieties.length ? { varieties } : {}),
        ...(d.register?.length ? { register: [...d.register] } : {}), ...(d.role ? { role: d.role } : {}), ...(d.definition ? { definition: d.definition } : {}),
        ...(d.gloss ? { gloss: d.gloss } : {}),
        origin: 'dictionary', ...(d.sourceId ? { sourceId: d.sourceId } : {}), confidence: CONFIRMED_BY_DICTIONARY,
        ...(Object.keys(notes).length ? { notes } : {}),
      });
    }
  }
  return out;
}

/**
 * The dictionary lacks the form but may list the lemma a rule derived it from (a verb with attached pronouns, a diminutive, a
 * superlative): the guesses whose lemma it lists - an entry of its own with glosses and a fitting part of speech - are kept,
 * as the rule's own readings (origin and source unchanged) with the lemma's gloss, its status stated in the notes; the rest are
 * dropped. `undefined` when no guess has its lemma in the dictionary: nothing changes for the token then.
 */
function readByLemma(guesses: readonly AnalysisCandidate[], lemmaOf: LemmaLookup, dictionaryId: string): AnalysisCandidate[] | undefined {
  const kept: AnalysisCandidate[] = [];
  for (const r of guesses) {
    const hit = r.lemma !== undefined ? lemmaOf(r.lemma, r.pos) : undefined;
    if (hit) kept.push(vouchedByLemma(r, hit, dictionaryId));
  }
  return kept.length ? kept : undefined;
}

/** A guess by rule whose lemma the dictionary lists: still the rule's reading, no longer a guess, with the lemma's own gloss. */
function vouchedByLemma(r: AnalysisCandidate, hit: LemmaHit, dictionaryId: string): AnalysisCandidate {
  const { unconfirmed: _unconfirmed, ...rest } = r;
  return {
    ...rest, morph: { ...r.morph }, gloss: shortGloss(hit.entry), confidence: r.confidence <= LEMMA_IN_DICTIONARY ? LEMMA_IN_DICTIONARY : r.confidence,
    notes: { ...(r.notes ?? {}), lemmaStatus: 'in the dictionary', lemmaSource: dictionaryId, ...(hit.headword ? { lemmaEntry: hit.headword } : {}) },
  };
}

/**
 * The lemmas (normalized) a second lookup round asks for, so that the rules above find them: the lemma of every inflected
 * form and the target of every alternative spelling among the entries just `found`; the lemma of every guess about a word the
 * dictionary has no entry for (`known` = the entries so far, by form); the lemma of every guessed unit; and for each of them
 * the other headwords the adapter says it may be filed under (`lemmaVariants`).
 */
export function lemmasToLookUp(
  adapter: LanguageAdapter, analysis: readonly SentenceAnalysis[], found: Iterable<readonly DictionaryEntry[]>, known: ReadonlyMap<string, readonly DictionaryEntry[]>,
): Set<string> {
  const lemmas = new Set<string>();
  const want = (lemma: string, pos: PartOfSpeech | undefined) => {
    lemmas.add(adapter.normalize(lemma));
    for (const v of adapter.lemmaVariants?.(lemma, pos) ?? []) lemmas.add(adapter.normalize(v));
  };
  for (const entries of found) {
    for (const e of entries) {
      for (const f of e.formOf ?? []) want(f.lemma, e.pos);
      if (alternativeOnly(e)) for (const target of e.altOf ?? []) want(target, e.pos);
    }
  }
  for (const s of analysis) {
    for (const a of s.analyzed) {
      if (!a.token.isWord) continue;
      for (const c of a.candidates) if (unitGuess(c)) want(c.unit!.display, c.pos);
      const own = withoutUnitGuesses(a);
      if (!decidable(own) || entriesFor(known, a.token).length) continue;
      for (const c of own.candidates) if (says(c) && c.lemma !== undefined) want(c.lemma, c.pos);
    }
  }
  lemmas.delete('');
  return lemmas;
}

/**
 * The lemmas (normalized) a third and last lookup round asks for: where an inflected form among the entries just `found`
 * names a lemma that has no entry of its own and is itself exactly one form of another lemma (a form of a form), that other
 * lemma, with the headwords the adapter says it may be filed under. `known` = the entries after the second round.
 */
export function chainedLemmasToLookUp(
  adapter: LanguageAdapter, found: Iterable<readonly DictionaryEntry[]>, known: ReadonlyMap<string, readonly DictionaryEntry[]>,
): Set<string> {
  const lemmaEntries = (l: string) => known.get(adapter.normalize(l));
  const lemmaOf = lemmaLookup(lemmaEntries, adapter.lemmaVariants?.bind(adapter));
  const lemmas = new Set<string>();
  for (const entries of found) {
    for (const e of entries) {
      for (const f of e.formOf ?? []) {
        if (lemmaOf(f.lemma, e.pos, e.written)) continue;
        const via = formOfForm(lemmaEntries(f.lemma)?.filter((x) => entryAppliesTo(e.written ?? f.lemma, x)), e.pos);
        if (!via) continue;
        lemmas.add(adapter.normalize(via.lemma));
        for (const v of adapter.lemmaVariants?.(via.lemma, e.pos) ?? []) lemmas.add(adapter.normalize(v));
      }
    }
  }
  lemmas.delete('');
  return lemmas;
}

/** A dictionary reading that joins a word the adapter already reads is placed after the adapter's own, at this confidence at most. */
export const BESIDE_CONFIDENCE = 0.45;
/** What a dictionary reading is stored at once a neighbour has decided for it among several parts of speech: the one-part-of-speech dictionary confidence. */
export const DECIDED_BY_CONTEXT = 0.6;
/** "Marked down by a context rule": the most a reading keeps when a neighbour decided against it (the adapters' own convention). */
export const BELOW_CONTEXT_CHOICE = 0.4;
/** At most this many dictionary readings join a word the adapter already reads. */
export const BESIDE_MAX = 3;
/** Beside a unit the dictionary vouches for, the pieces' other readings are kept at this confidence at most. */
export const BELOW_A_UNIT = 0.4;

/** Parts of speech of function words: a word the adapter's own list reads as one of these first gets no dictionary reading beside it. */
export const FUNCTION_WORD_POS: ReadonlySet<PartOfSpeech> = new Set<PartOfSpeech>(['DET', 'PRON', 'ADP', 'CONJ', 'SCONJ', 'NUM', 'PART']);
/** The source's labels for an entry that is not a word of running text: with one of them on every sense, the entry never joins a word the adapter reads. */
export const NOT_RUNNING_TEXT_LABELS: ReadonlySet<string> = new Set(['abbreviation', 'acronym', 'initialism', 'misspelling', 'letter', 'symbol', 'morpheme', 'prefix', 'suffix']);

/** An entry every sense of which the source labels as something other than a word of running text (an entry without `senses` is not one). */
function notRunningText(e: DictionaryEntry): boolean {
  const senses = e.senses ?? [];
  return senses.length > 0 && senses.every((s) => !!s.tags?.some((t) => NOT_RUNNING_TEXT_LABELS.has(t.toLowerCase())));
}

/** A reading the adapter's own data vouches for (its word list, not a rule) of a function word. */
const ownFunctionWord = (c: AnalysisCandidate | undefined): boolean =>
  !!c && c.unconfirmed !== true && (c.origin === 'hand' || (c.origin === undefined && c.notes?.source !== 'rule')) && c.pos !== undefined && FUNCTION_WORD_POS.has(c.pos);

/** A dictionary reading of the written form as a headword of its own (not an inflected form or another spelling of one). */
const isHeadword = (d: AnalysisCandidate): boolean => !d.notes?.formOfTags && d.notes?.altOf === undefined;

/**
 * The dictionary's readings of one form in the order the importer hands them on: headwords before inflected forms and other
 * spellings, each group in dictionary order. The list of the form's pronunciations stays on the first reading.
 */
function headwordsFirst(cands: readonly AnalysisCandidate[]): AnalysisCandidate[] {
  const out = [...cands.filter(isHeadword), ...cands.filter((c) => !isHeadword(c))];
  const at = out.findIndex((c) => c.notes?.readings !== undefined);
  if (at > 0) {
    const { readings, ...rest } = out[at].notes!;
    const { notes: _notes, ...bare } = out[at];
    out[at] = { ...bare, ...(Object.keys(rest).length ? { notes: rest } : {}) };
    out[0] = { ...out[0], notes: { ...(out[0].notes ?? {}), readings } };
  }
  return out;
}

/** What a reading says, for telling one from another: its lemma, part of speech and features. */
const readingKey = (c: AnalysisCandidate): string => `${c.lemma}|${c.pos ?? ''}|${morphKey(c.morph)}`;

/** The kind of a reading: its lemma and word class (a verb and an auxiliary are one class). */
const kindOf = (adapter: LanguageAdapter, c: AnalysisCandidate): string =>
  `${c.lemma !== undefined ? adapter.normalize(c.lemma) : ''}|${c.pos && VERBAL.has(c.pos) ? 'VERB' : c.pos ?? ''}`;

/**
 * The dictionary readings that join a word the adapter already reads from its own data: those of a kind the adapter does not
 * give (al abandono: the word list reads a form of abandonar, the dictionary also has the noun), headwords before inflected
 * forms and other spellings, each in dictionary order, `BESIDE_MAX` at most, at `BESIDE_CONFIDENCE` at most.
 * `dictionary` = the readings that may join (the caller leaves out entries that are not words of running text).
 */
function joiningReadings(adapter: LanguageAdapter, own: readonly AnalysisCandidate[], dictionary: readonly AnalysisCandidate[]): AnalysisCandidate[] {
  const has = new Set<string>();
  for (const c of own.filter(says)) {
    has.add(kindOf(adapter, c));
    // the same lemma as the dictionary may file it (a verb listed only as pronominal) is the same kind, not another reading
    if (c.lemma !== undefined) for (const v of adapter.lemmaVariants?.(c.lemma, c.pos) ?? []) has.add(kindOf(adapter, { ...c, lemma: v }));
  }
  const fresh = dictionary.filter((d) => !has.has(kindOf(adapter, d)));
  const seen = new Set<string>();
  const out: AnalysisCandidate[] = [];
  for (const d of [...fresh.filter(isHeadword), ...fresh.filter((x) => !isHeadword(x))]) {
    const key = `${d.lemma}|${d.pos ?? ''}|${morphKey(d.morph)}`;
    if (seen.has(key) || out.length >= BESIDE_MAX) continue;
    seen.add(key);
    // the list of the form's pronunciations is carried by the marker on the first reading, not repeated here
    const notes = d.notes ? { ...d.notes } : undefined;
    if (notes) delete notes.readings;
    const { notes: _notes, ...rest } = d;
    out.push({ ...rest, confidence: Math.min(d.confidence, BESIDE_CONFIDENCE), ...(notes && Object.keys(notes).length ? { notes } : {}) });
  }
  return out;
}

/** One unit of a sentence: the same pieces and the same lemma. */
const unitKey = (u: NonNullable<AnalysisCandidate['unit']>): string => `${u.display}|${u.pieces.join(',')}`;

/** The (lemma, part of speech) pairs of one token's readings, sorted: what `refine` may reorder but never change. */
const readingPairs = (a: AnalyzedToken): string[] => a.candidates.map((c) => JSON.stringify([c.lemma ?? null, c.pos ?? null])).sort();

/** Plan one (already validated) document. Throws on any broken round-trip invariant: nothing is written by then. */
export function planDocument(doc: CorpusDocument, registry: AdapterRegistry, opts: PlanOptions = {}): DocumentPlan {
  const adapter = registry.get(doc.lang);
  const dictId = opts.dictionaryId ?? 'dictionary';
  const dictTool = opts.dictionary ? dictionaryTool(dictId) : undefined;
  let dictTokens = 0;
  let dictDecided = 0;
  let dictLemmaOnly = 0;
  let dictJoined = 0;
  let dictUnits = 0;
  let dictAlongside = 0;
  const textId = ids.text(doc.lang, doc.id);
  const analyzerName = `adapter-${doc.lang}@${adapter.version}`;
  const speakerName = (id: string | undefined) => (id !== undefined ? doc.speakers?.[id] ?? id : undefined);
  // what the dictionary says a lemma means (a form-of entry's gloss is its lemma's), also under the other headwords the
  // adapter says a dictionary may file the lemma under
  const lemmaEntries = (l: string) => opts.dictionary?.get(adapter.normalize(l));
  const lemmaVariants = adapter.lemmaVariants?.bind(adapter);
  const lemmaOf = lemmaLookup(lemmaEntries, lemmaVariants);

  const paragraphs: PlannedParagraph[] = [];
  const sentences: PlannedSentence[] = [];
  const repeats = new Map<string, number>();
  let nonNfcBlocks = 0;

  const push = (
    text: string, paragraphIndex: number, paraStart: number, paraEnd: number,
    extra: { authorId?: string; english?: string; verseRefs?: string[]; speaker?: string; spans?: DocSpan[]; corrections?: DocCorrection[]; notes?: DocNote[] },
  ) => {
    const repeat = repeats.get(text) ?? 0;
    repeats.set(text, repeat + 1);
    // the caller's analysis of this sentence, when it has one (sentences arrive here in the order `analyseDocument` reads them)
    const ready = opts.analysis?.[sentences.length];
    if (ready && ready.text !== text) throw new Error(`the analysis supplied for ${doc.id} is of another text: sentence ${sentences.length} is "${ready.text}", not "${text}"`);
    const tokens = ready ? ready.tokens : adapter.tokenize(text);
    for (const t of tokens) {
      if (text.slice(t.start, t.end) !== t.surface) throw new Error(`adapter ${doc.lang}: token offsets do not round-trip in "${text}": "${t.surface}" at ${t.start}`);
    }
    const base = ready ? ready.analyzed : adapter.analyze(tokens);
    if (base.length !== tokens.length) throw new Error(`adapter ${doc.lang}: analyze() returned ${base.length} for ${tokens.length} tokens`);
    const analyzed: AnalyzedToken[] = base.map((a) => ({ ...a, candidates: a.candidates.map((c) => ({ ...c })) }));
    // dictionary: a word the adapter says nothing about is analysed from it; a word whose every reading the adapter only
    // guesses at (`unconfirmed`) is decided by it; a word the adapter's own data vouches for keeps its analysis and gets a
    // marker (and a pronunciation when it has none) - and, only when the adapter can order readings by context again
    // (`refine`), the dictionary's readings of another word or part of speech after its own
    const beside = new Map<number, { all: AnalysisCandidate[]; joinable: AnalysisCandidate[] }>();
    if (opts.dictionary && dictTool) {
      const given = new Set<number>(); // tokens whose list of readings this pass made: `refine` takes them as they are
      let supplied = false; // at least one token got readings from the dictionary (or by its word) in this pass
      analyzed.forEach((a, ti) => {
        if (!a.token.isWord) return;
        // a guessed unit is decided below by the unit's own lemma, never by this form's entry: it waits behind the other readings
        const waiting = a.candidates.filter(unitGuess);
        const own = withoutUnitGuesses(a);
        const replace = (candidates: AnalysisCandidate[]) => {
          analyzed[ti] = { token: tokens[ti], candidates: [...candidates, ...waiting], analyzer: dictTool };
          given.add(ti);
          supplied = true;
        };
        const entries = entriesFor(opts.dictionary!, tokens[ti]);
        if (!entries.length) {
          // the dictionary lacks the form: guesses whose lemma it lists stay as the rule's readings, with the lemma's gloss
          const byLemma = decidable(own) ? readByLemma(own.candidates.filter((c) => says(c)), lemmaOf, dictId) : undefined;
          if (byLemma) { replace(byLemma); dictLemmaOnly++; }
          return;
        }
        const byEntry = candidatesByEntry(
          tokens[ti].normalized, entries, dictId, adapter.morphFromTags?.bind(adapter), lemmaEntries, adapter.varietiesFromTags?.bind(adapter), lemmaVariants,
        );
        const cands = byEntry.flat();
        // where the dictionary supplies the list, a headword comes before an inflected form or another spelling of the same writing
        if (unanalysed(own)) { replace(headwordsFirst(cands)); dictTokens++; }
        else if (decidable(own)) {
          replace(decideByDictionary(adapter, headwordsFirst(cands), own.candidates.filter((c) => says(c) && c.unconfirmed === true)));
          dictDecided++;
        } else beside.set(ti, { all: cands, joinable: byEntry.filter((_, k) => !notRunningText(entries[k])).flat() });
      });
      // a guessed unit written as several words, judged once per unit by its own lemma: the dictionary lists it ⇒ on every piece
      // that reading leads, as the rule's own and no longer a guess, the other readings kept below it; it does not ⇒ the guess
      // goes from every piece and nothing else about those words changes
      const verdicts = new Map<string, LemmaHit | undefined>();
      analyzed.forEach((a, ti) => {
        if (!a.candidates.some(unitGuess)) return;
        const leading: AnalysisCandidate[] = [];
        const others: AnalysisCandidate[] = [];
        for (const c of a.candidates) {
          if (!unitGuess(c)) { others.push(c); continue; }
          const key = unitKey(c.unit!);
          if (!verdicts.has(key)) {
            const hit = lemmaOf(c.unit!.display, c.pos);
            verdicts.set(key, hit);
            if (hit) dictUnits++;
          }
          const hit = verdicts.get(key);
          if (hit) leading.push(vouchedByLemma(c, hit, dictId));
        }
        given.add(ti);
        if (!leading.length) { analyzed[ti] = { ...a, candidates: others }; return; }
        analyzed[ti] = {
          token: tokens[ti], analyzer: dictTool,
          candidates: [...leading, ...others.map((c) => (c.confidence > BELOW_A_UNIT ? { ...c, confidence: BELOW_A_UNIT } : c))],
        };
        supplied = true;
      });
      // a word the adapter reads from its own data: the dictionary's readings of another kind join it, after the adapter's own.
      // Only where `refine` can order them by context; a word that is a piece of a unit is left alone, and so is a function
      // word of the adapter's own list (de eso is never the acronym ESO); an entry that is not a word of running text never joins.
      const uncapped = new Map<number, Map<string, number>>(); // per joined token: what each joined reading's confidence was before the cap
      if (adapter.refine) {
        for (const [ti, { joinable }] of beside) {
          const a = analyzed[ti];
          if (a.candidates[0]?.unit || ownFunctionWord(a.candidates[0])) continue;
          const joining = joiningReadings(adapter, a.candidates, joinable);
          if (!joining.length) continue;
          analyzed[ti] = { ...a, candidates: [...a.candidates, ...joining] };
          uncapped.set(ti, new Map(joining.map((j) => [readingKey(j), joinable.find((d) => readingKey(d) === readingKey(j))!.confidence])));
          given.add(ti);
          supplied = true;
          dictJoined++;
        }
      }
      // the readings the dictionary supplied are ordered by context again, by the adapter's own neighbour rules
      if (adapter.refine && supplied) {
        const before = analyzed.map(readingPairs);
        const refined = adapter.refine(tokens, analyzed, new Set([analyzerName, dictTool]), given);
        if (refined.length !== tokens.length) throw new Error(`adapter ${doc.lang}: refine() returned ${refined.length} for ${tokens.length} tokens`);
        refined.forEach((r, ti) => {
          if (JSON.stringify(readingPairs(r)) !== JSON.stringify(before[ti])) throw new Error(`adapter ${doc.lang}: refine() changed the readings of token ${ti} in "${text}"`);
          analyzed[ti] = r;
        });
        // a joined reading that context moved in front of the adapter's own was chosen: the cap that kept it from competing
        // no longer applies, and it gets back the confidence the dictionary reading had (the ones left behind keep the cap)
        for (const [ti, was] of uncapped) {
          const [first, ...rest] = analyzed[ti].candidates;
          const own = first?.origin === 'dictionary' && first.sourceId === dictId ? was.get(readingKey(first)) : undefined;
          if (own !== undefined && own > first.confidence) analyzed[ti] = { ...analyzed[ti], candidates: [{ ...first, confidence: own }, ...rest] };
        }
        // A dictionary reading is stored below certainty when the dictionary lists the spelling under several parts of
        // speech (0.45). When a neighbour then decided for one of them (it says which, and marked every other reading
        // down), the doubt about the part of speech is gone: it is stored as a one-part-of-speech dictionary reading.
        analyzed.forEach((a, ti) => {
          const [first, ...rest] = a.candidates;
          if (!first || first.origin !== 'dictionary' || first.confidence >= DECIDED_BY_CONTEXT || !first.notes?.context) return;
          if (rest.length === 0 || rest.some((r) => r.confidence > BELOW_CONTEXT_CHOICE)) return;
          analyzed[ti] = { ...a, candidates: [{ ...first, confidence: DECIDED_BY_CONTEXT }, ...rest] };
        });
      }
    }
    const spanTokens = new Set<number>();
    for (const sp of extra.spans ?? []) {
      const ti = tokens.findIndex((t) => t.start === sp.start && t.end === sp.end);
      if (ti < 0) throw new Error(`span [${sp.start}, ${sp.end}) in "${text}" is not on a token`);
      const cand = toCandidate(sp);
      analyzed[ti] = {
        token: tokens[ti],
        candidates: [cand, ...(sp.alternatives ?? []).map((a) => ({
          lemma: a.lemma, pos: a.pos, morph: a.morph ? { ...a.morph } : {}, confidence: a.confidence, origin: 'corpus' as const, sourceId: IMPORT_ANALYZER,
        }))],
        analyzer: IMPORT_ANALYZER,
      };
      spanTokens.add(ti);
    }
    // phrases and patterns are detected on the adapter's own analysis, before the dictionary marker is added
    const phrases = adapter.detectPhrases(tokens, analyzed);
    const patterns = adapter.detectPatterns(tokens, analyzed);
    for (const [ti, { all: cands }] of beside) {
      if (spanTokens.has(ti)) continue; // an author's span wins outright
      if (analyzed[ti].candidates[0]?.unit) continue; // a piece of a unit is read by the unit's lemma: this form's entry says nothing about it
      const [first, ...rest] = analyzed[ti].candidates.map((c) => ({ ...c }));
      const hasPronunciation = !!(first.notes && (first.notes.respelling || first.notes.ipa || first.notes.translit || first.notes.romanization));
      const withPron = hasPronunciation ? undefined : cands.find((c) => c.notes?.respelling || c.notes?.ipa);
      const readings = cands[0].notes?.readings;
      const added: Record<string, string | string[]> = {
        ...(withPron?.notes?.respelling ? { respelling: withPron.notes.respelling } : {}), ...(withPron?.notes?.ipa ? { ipa: withPron.notes.ipa } : {}),
        ...(withPron ? { pronunciationSource: dictId } : {}),
        ...(readings ? { readings } : {}),
        // a marker only: the entries stay in the installed dictionary and are asked for at display time, never copied per token
        dictionary: dictId,
      };
      first.notes = { ...(first.notes ?? {}), ...added };
      analyzed[ti] = { ...analyzed[ti], candidates: [first, ...rest] };
      dictAlongside++;
    }
    sentences.push({
      authorId: extra.authorId, hashKey: ids.sentenceKey(text, repeat), text, english: extra.english, verseRefs: extra.verseRefs ? [...extra.verseRefs] : undefined,
      speaker: extra.speaker, paragraphIndex, paraStart, paraEnd, tokens, analyzed, spanTokens, corrections: extra.corrections ?? [],
      phrases, patterns, notes: (extra.notes ?? []).map((n) => planNote(n, tokens)),
    });
  };

  doc.sections.forEach((sec, si) => {
    for (const par of sec.paragraphs) {
      const paragraphIndex = paragraphs.length;
      if ('sentences' in par) {
        const sep = par.separator ?? defaultSeparator;
        let original = '';
        const offsets: Array<[number, number]> = [];
        par.sentences.forEach((s, k) => {
          if (k > 0) original += sep;
          offsets.push([original.length, original.length + s.text.length]);
          original += s.text;
          if (s.text !== s.text.normalize('NFC')) nonNfcBlocks++;
        });
        paragraphs.push({ sectionIndex: si, originalText: original });
        par.sentences.forEach((s, k) => {
          if (original.slice(offsets[k][0], offsets[k][1]) !== s.text) throw new Error(`paragraph offsets do not round-trip for "${s.text}"`);
          push(s.text, paragraphIndex, offsets[k][0], offsets[k][1], {
            authorId: s.id, english: s.english, verseRefs: s.verseRefs, speaker: speakerName(s.speaker), spans: s.spans, corrections: s.corrections, notes: s.notes,
          });
        });
      } else {
        if (par.text !== par.text.normalize('NFC')) nonNfcBlocks++;
        paragraphs.push({ sectionIndex: si, originalText: par.text });
        const spans = adapter.segmentSentences(par.text);
        spans.forEach((sp, k) => {
          if (par.text.slice(sp.start, sp.end) !== sp.text) throw new Error(`adapter ${doc.lang}: sentence span does not slice the paragraph`);
          push(sp.text, paragraphIndex, sp.start, sp.end, { english: par.english?.[k], verseRefs: par.verseRefs });
        });
      }
    }
  });

  // document-level notes go to the sentence whose exact text contains `match` (validation guarantees it exists)
  if (doc.notes?.length) {
    const anchors = anchorDocumentNotes(doc.notes, sentences.map((s) => s.text));
    doc.notes.forEach((n, k) => {
      const at = anchors[k];
      if (at === undefined) throw new Error(`note ${k}: no sentence contains ${JSON.stringify(n.match)}`);
      sentences[at].notes.push(planNote(n, sentences[at].tokens));
    });
  }

  const allTokens = sentences.flatMap((s) => s.tokens);
  const coverage = finalCoverage(sentences);
  const decision = computePublished(doc);
  const noteCount = sentences.reduce((n, s) => n + s.notes.length, 0);

  const signature = hash(JSON.stringify({
    v: 2, publicationPolicy: 'curriculum-native@1', analyzerName, dict: dictTool,
    doc: {
      id: doc.id, lang: doc.lang, locale: doc.locale, title: doc.title, contentType: doc.contentType, corpus: doc.corpus, source: doc.source, review: doc.review,
      difficulty: doc.difficulty, topics: doc.topics, editorialTags: doc.editorialTags, prepTargets: doc.prepTargets, generated: doc.generated,
      scripture: doc.scripture, english: doc.english, sections: doc.sections.map((s) => ({ title: s.title, chapter: s.chapter })), work: doc.work,
      streams: doc.streams, domains: doc.domains, variety: doc.variety, quality: doc.quality,
      // only when set, so the signature of every other document is what it was before the flag existed
      ...(doc.teamText ? { teamText: true } : {}),
      // a pipeline move (reviewed → audio-ready → published) must re-decide publication on re-import
      ...(doc.pipeline ? { pipeline: doc.pipeline } : {}),
      ...(doc.curriculum ? { curriculum: doc.curriculum } : {}),
      ...(doc.readingAssessmentId ? { readingAssessmentId: doc.readingAssessmentId } : {}),
    },
    paragraphs,
    sentences: sentences.map((s) => ({
      a: s.authorId, k: s.hashKey, t: s.text, e: s.english, v: s.verseRefs, sp: s.speaker, p: s.paragraphIndex, ps: s.paraStart, pe: s.paraEnd,
      an: s.analyzed.map((x) => x.candidates), ant: [...s.spanTokens], c: s.corrections, ph: s.phrases, pa: s.patterns,
      nt: s.notes.length ? s.notes : undefined,
    })),
  }));

  return {
    doc, textId, adapter, analyzerName, paragraphs, sentences, coverage, decision, signature, nonNfcBlocks, tokenCount: allTokens.length,
    ...(workIdOf(doc) ? { workId: workIdOf(doc) } : {}), ...(dictTool ? { dictionary: { tool: dictTool, tokens: dictTokens, decided: dictDecided, lemmaOnly: dictLemmaOnly, joined: dictJoined, units: dictUnits, alongside: dictAlongside } } : {}), noteCount,
  };
}

/**
 * Coverage of the FINAL analysis of a document: the adapter's word list, the dictionary, spans supplied with the text and
 * reviewers' corrections (a token with a human correction counts as analysed), with the breakdown by source. The single
 * basis for the figure shown beside the import and for the low-coverage warning.
 */
function finalCoverage(sentences: readonly PlannedSentence[]): AnalysisCoverage {
  const by = { adapter: 0, dictionary: 0, supplied: 0, corrected: 0 };
  const unknown = new Set<string>();
  let words = 0;
  let analysed = 0;
  for (const s of sentences) {
    const corrected = new Set<number>();
    for (const c of s.corrections) { const ti = s.tokens.findIndex((t) => t.start === c.start && t.end === c.end); if (ti >= 0) corrected.add(ti); }
    s.tokens.forEach((t, ti) => {
      if (!t.isWord) return;
      words++;
      if (corrected.has(ti)) by.corrected++;
      else if (s.spanTokens.has(ti)) by.supplied++;
      else if (s.analyzed[ti]?.candidates.length) { if (s.analyzed[ti].analyzer.startsWith('dict:')) by.dictionary++; else by.adapter++; }
      else { unknown.add(t.normalized); return; }
      analysed++;
    });
  }
  return { words, analysed, coverage: words ? analysed / words : 1, unanalysed: [...unknown], bySource: by };
}

const COVERAGE_THRESHOLD = 0.6;

/**
 * The low-coverage warning computed from the plan's final coverage (same threshold as validation's adapter-only one),
 * with the breakdown and the remedies that apply. `dictionaryError` is the reason an installed dictionary could not be read.
 */
export function coverageWarning(plan: DocumentPlan, dictionaryError?: string): ValidationIssue | undefined {
  const c = plan.coverage;
  if (!c.words || c.coverage >= COVERAGE_THRESHOLD) return undefined;
  const by = c.bySource ?? { adapter: c.analysed, dictionary: 0, supplied: 0, corrected: 0 };
  const dictId = plan.dictionary ? plan.dictionary.tool.slice('dict:'.length) : undefined;
  const remedies = ['add spans to the sentences', 'record a correction for a word (docs/IMPORT.md)'];
  if (!dictId) remedies.push(dictionaryError ? 'fix the dictionary so that it can be read' : 'install a dictionary for this language');
  return {
    path: '', code: 'low-analysis-coverage', severity: 'warning',
    message: `only ${Math.round(c.coverage * 100)}% of the words have an analysis (${c.analysed} of ${c.words}): ${by.adapter} from the language's word list, ` +
      `${by.dictionary} from the dictionary ${dictId ?? '(none installed)'}, ${by.supplied} supplied with the text, ${by.corrected} corrected by a reviewer`,
    hint: `The text imports and reads fine, but word help will be missing for the other words. To add analysis: ${remedies.join('; ')}.${dictionaryError ? ' The dictionary could not be read (' + dictionaryError.replace(/^dictionary not used: /, '') + ').' : ''}`,
  };
}

/** A document note → a planned note: defaults applied (human ⇒ approved; machine ⇒ unreviewed) and token indexes resolved. */
function planNote(n: DocNote, tokens: RawToken[]): PlannedNote {
  const provenance = n.provenance ?? 'human';
  const tokenIndexes = n.start !== undefined && n.end !== undefined
    ? tokens.map((t, i) => (t.start >= n.start! && t.end <= n.end! ? i : -1)).filter((i) => i >= 0)
    : undefined;
  return {
    kind: n.kind, body: n.body, ...(tokenIndexes?.length ? { tokenIndexes } : {}), ...(n.spans?.length ? { spans: n.spans.map((s) => ({ ...s })) } : {}),
    ...(n.topics?.length ? { topics: [...n.topics] } : {}), provenance, reviewStatus: n.reviewStatus ?? (provenance === 'human' ? 'approved' : 'unreviewed'),
    ...(n.by ? { by: n.by } : {}),
  };
}

/**
 * The `ContentNote` rows of one sentence. The note key is a stable hash of the sentence key, the kind and the body
 * (two identical notes on one sentence get a `~n` suffix), so an unchanged note keeps its id across imports; editing a
 * sentence moves its notes with it because the sentence key changes.
 */
export function buildNoteRows(plan: DocumentPlan, ps: PlannedSentence, sentenceKey: string, sentenceId: string, tokens: Token[], seen: Map<string, number>): ContentNote[] {
  return ps.notes.map((n) => {
    const base = hash(`${sentenceKey}|${n.kind}|${n.body}`);
    const repeat = seen.get(base) ?? 0;
    seen.set(base, repeat + 1);
    return {
      id: ids.note(plan.textId, repeat ? `${base}~${repeat}` : base), textId: plan.textId, lang: plan.doc.lang, sentenceId,
      ...(n.tokenIndexes?.length ? { tokenIds: n.tokenIndexes.map((i) => tokens[i].id) } : {}),
      kind: n.kind, ...(n.spans ? { spans: n.spans } : {}), body: n.body, ...(n.topics ? { topics: n.topics } : {}),
      provenance: n.provenance, reviewStatus: n.reviewStatus,
    };
  });
}

// ───────────────────────────── materialization ─────────────────────────────

export interface Catalog {
  lemmas: Map<string, Lemma>;
  phrases: Map<string, Phrase>;
  patterns: Map<string, GrammarPattern>;
}
export const newCatalog = (): Catalog => ({ lemmas: new Map(), phrases: new Map(), patterns: new Map() });

export interface SentenceRows {
  tokens: Token[];
  analyses: TokenAnalysis[];
  phraseOccurrences: PhraseOccurrence[];
  patternOccurrences: PatternOccurrence[];
  rescue?: EnglishRescue;
}

/** Build every derived row of one sentence once its final id is known. Lemma/phrase/pattern definitions go to `catalog`. */
export function materializeSentence(plan: DocumentPlan, ps: PlannedSentence, sentenceId: string, now: string, catalog: Catalog): SentenceRows {
  const { doc, textId } = plan;
  const lang = doc.lang;
  const ensureLemma = (lemma: string, pos: PartOfSpeech | undefined, gloss?: string): string => {
    const id = ids.lemma(lang, lemma, pos);
    const cur = catalog.lemmas.get(id);
    if (!cur) catalog.lemmas.set(id, { id, lang, lemma, pos, gloss });
    else if (!cur.gloss && gloss) cur.gloss = gloss;
    return id;
  };

  const tokens: Token[] = ps.tokens.map((r, ti) => ({
    id: ids.token(sentenceId, ti), sentenceId, textId, lang, index: ti, surface: r.surface, start: r.start, end: r.end,
    normalized: r.normalized, formId: ids.form(lang, r.normalized), isWord: r.isWord,
  }));

  const analyses: TokenAnalysis[] = [];
  ps.analyzed.forEach((a, ti) => {
    if (!a.candidates.length) return;
    const [best, ...rest] = a.candidates;
    // an author span's gloss is contextual (TokenAnalysis.gloss), not the lemma's dictionary gloss
    const fromSpan = ps.spanTokens.has(ti);
    // Where each candidate comes from: its own origin / source when it states them (the Thai adapter, the dictionary,
    // an author's span); otherwise a rule-derived candidate (notes.source === 'rule') is `rule` and any other adapter
    // candidate is a lexicon hit, `hand`, of `adapter-<lang>@<version>`.
    const originOf = (c: AnalysisCandidate): { origin: AnalysisOrigin; sourceId: string } => ({
      origin: c.origin ?? (c.notes?.source === 'rule' ? 'rule' : 'hand'), sourceId: c.sourceId ?? `adapter-${lang}@${plan.adapter.version}`,
    });
    const bestOrigin = originOf(best);
    // the gloss of an inflected form ("first-person plural of …") describes the form, not the lemma: it never becomes the lemma's
    // gloss - unless it was taken from the lemma's own dictionary entry in the first place (`glossFrom`)
    // the same holds for the label of another spelling ("obsolete spelling of …", kept in `notes.altOf`)
    const describesForm = (c: AnalysisCandidate) => (!!c.notes?.formOfTags || c.notes?.altOf !== undefined) && c.notes.glossFrom !== 'lemma';
    const lemmaId = best.lemma ? ensureLemma(best.lemma, best.pos, fromSpan || describesForm(best) ? undefined : best.gloss) : undefined;
    const alternatives: NonNullable<TokenAnalysis['alternatives']> = rest.map((r) => {
      const o = originOf(r);
      // a dictionary entry beside a hand analysis never fills in the hand lemma's gloss; it carries its own gloss
      const besideHand = o.origin === 'dictionary' && bestOrigin.origin !== 'dictionary';
      return {
        lemmaId: r.lemma ? ensureLemma(r.lemma, r.pos, fromSpan || besideHand || describesForm(r) ? undefined : r.gloss) : undefined, pos: r.pos, morph: r.morph, confidence: r.confidence,
        ...(besideHand && r.gloss ? { gloss: r.gloss } : {}), origin: o.origin, sourceId: o.sourceId,
      };
    });
    // TODO(contract): AnalysisCandidate has no provenance field. Rule-derived candidates (clitic split, compound guess,
    // separable particle) carry notes.source === 'rule' and are stored as 'machine'; lexicon-backed ones as 'lexicon'.
    const notes = best.notes ? { ...best.notes } : undefined;
    const fromRule = notes?.source === 'rule';
    if (notes) delete notes.source;
    // a lexical unit written as several words (steht … auf): the adapter names its pieces by token index in the sentence,
    // the stored analysis by token id. A piece outside the sentence is a broken analysis: nothing is written.
    let unit: TokenAnalysis['unit'];
    if (best.unit) {
      const idOf = (i: number): string => {
        if (!Number.isInteger(i) || i < 0 || i >= tokens.length) throw new Error(`unit of "${tokens[ti].surface}" in ${sentenceId} names token ${i}, which is not in the sentence`);
        return tokens[i].id;
      };
      unit = { headTokenId: idOf(best.unit.head), pieceTokenIds: best.unit.pieces.map(idOf), role: best.unit.role, display: best.unit.display };
    }
    analyses.push({
      id: ids.analysis(tokens[ti].id, a.analyzer, 0), tokenId: tokens[ti].id, lang, lemmaId, pos: best.pos, morph: best.morph,
      ...(notes && Object.keys(notes).length ? { notes } : {}), ...(best.gloss && fromSpan ? { gloss: best.gloss } : {}),
      // variety, function and an easy target-language definition travel with the analysis (syllables are decoded on demand, never stored)
      ...(best.register?.length ? { register: [...best.register] } : {}), ...(best.role ? { role: best.role } : {}), ...(best.definition ? { definition: best.definition } : {}),
      // units inside the written word (verb + attached pronouns) and the varieties it belongs to, as the adapter states them
      ...(best.parts?.length ? { parts: best.parts.map((p) => ({ ...p, ...(p.morph ? { morph: { ...p.morph } } : {}) })) } : {}),
      ...(best.varieties?.length ? { varieties: [...best.varieties] } : {}),
      // a unit written as several words, and the relation of an older spelling to today's (the text itself is never changed)
      ...(unit ? { unit } : {}), ...(best.orthography ? { orthography: { ...best.orthography } } : {}),
      confidence: best.confidence, provenance: fromRule ? 'machine' : 'lexicon', origin: bestOrigin.origin, sourceId: bestOrigin.sourceId,
      ...(plan.adapter.sources?.[bestOrigin.sourceId] ? { sourceInfo: { ...plan.adapter.sources[bestOrigin.sourceId] } as AnalysisSourceInfo } : {}),
      analyzer: a.analyzer, createdAt: now,
      ...(alternatives.length ? { alternatives } : {}),
    });
  });

  // reviewed human analyses supplied by the author: stored as 'human', superseding the machine/lexicon row
  const perTokenCount = new Map<string, number>();
  for (const c of ps.corrections) {
    const ti = ps.tokens.findIndex((t) => t.start === c.start && t.end === c.end);
    if (ti < 0) throw new Error(`correction [${c.start}, ${c.end}) in "${ps.text}" is not on a token`);
    const analyzer = `human:${c.by}`;
    const n = perTokenCount.get(`${ti}|${analyzer}`) ?? 0;
    perTokenCount.set(`${ti}|${analyzer}`, n + 1);
    const machine = analyses.find((x) => x.tokenId === tokens[ti].id && x.provenance !== 'human');
    analyses.push({
      id: ids.analysis(tokens[ti].id, analyzer, n), tokenId: tokens[ti].id, lang,
      lemmaId: c.lemma ? ensureLemma(c.lemma, c.pos, undefined) : undefined, pos: c.pos, morph: c.morph ? { ...c.morph } : {}, ...(c.gloss ? { gloss: c.gloss } : {}),
      confidence: 1, provenance: 'human', origin: 'reviewed', sourceId: analyzer, analyzer, createdAt: c.at, ...(machine ? { supersedes: machine.id } : {}),
    });
  }

  const phraseOccurrences: PhraseOccurrence[] = ps.phrases.map((pc) => {
    const phraseId = ids.phrase(lang, pc.pattern);
    if (!catalog.phrases.has(phraseId)) catalog.phrases.set(phraseId, { id: phraseId, lang, pattern: pc.pattern, display: pc.display, gloss: pc.gloss, kind: pc.kind });
    return {
      id: ids.phraseOccurrence(phraseId, sentenceId, pc.tokenIndexes[0]), phraseId, sentenceId, textId, lang,
      tokenIds: pc.tokenIndexes.map((i) => tokens[i].id), confidence: pc.confidence, provenance: 'lexicon' as const,
    };
  });
  const patternOccurrences: PatternOccurrence[] = ps.patterns.map((gc) => {
    const patternId = ids.pattern(lang, gc.key);
    if (!catalog.patterns.has(patternId)) catalog.patterns.set(patternId, { id: patternId, lang, key: gc.key, title: gc.title, explanation: gc.explanation });
    return {
      id: ids.patternOccurrence(patternId, sentenceId, gc.tokenIndexes[0]), patternId, sentenceId, textId, lang,
      tokenIds: gc.tokenIndexes.map((i) => tokens[i].id), confidence: gc.confidence, provenance: 'lexicon' as const,
    };
  });

  const rescue: EnglishRescue | undefined = ps.english
    ? { id: ids.rescue(sentenceId), sentenceId, textId, english: ps.english, provenance: 'human', ...(doc.english?.source ? { sourceNote: doc.english.source } : {}) }
    : undefined;

  return { tokens, analyses, phraseOccurrences, patternOccurrences, rescue };
}

/**
 * Assistance helpers for the reader (pure): which layers a word sheet offers and in what order, whether a layer has
 * anything to show for the word in front of the learner, which notes are visible, and how a clause-structure note
 * lays its labelled spans over the sentence's own text.
 *
 * The profile comes from the course catalogue (`catalog.assistanceFor`). A course without a ladder gets
 * DEFAULT_ASSISTANCE, and the reader then keeps its original behaviour exactly (see `isLegacyProfile`).
 */
import { DEFAULT_ASSISTANCE, LAYER_ASSISTANCE_LEVEL, REVIEW_OK } from '../../core';
import type { AnalysisSourceInfo, AssistanceLevel, AssistanceProfile, ContentNote, DictionaryInfo, HelpLayer, OrthographyRelation, PartOfSpeech, RegisterTag, SyllableAnalysis, TokenAnalysis, TokenSupport, Variety, WordPart } from '../../core';

/** The profile of a course without a ladder: the reader looks and behaves exactly as it always did. */
export function isLegacyProfile(profile: AssistanceProfile): boolean {
  return profile === DEFAULT_ASSISTANCE || JSON.stringify(profile) === JSON.stringify(DEFAULT_ASSISTANCE);
}

export interface LayerPlan {
  /** Shown on the first tap: always the gloss, and the decoding with it when the stage says decoding comes first. */
  base: HelpLayer[];
  /** What "more help" walks through, in order. English is always the last step that is not the learner's own record. */
  steps: HelpLayer[];
}

/**
 * The layers of a profile in the order the sheet offers them. English is never removed: it is added when a profile
 * forgets it, and moved by `englishRescue` — `easy` keeps the profile's own position, `secondary` puts it after the
 * target-language layers, `deep` and `on-request` put it last of all.
 */
export function planLayers(profile: AssistanceProfile): LayerPlan {
  const legacy = isLegacyProfile(profile);
  let layers = [...new Set(profile.layers)].filter((l) => l !== 'gloss');
  if (legacy) layers = layers.filter((l) => l !== 'history'); // today's sheet shows the learner's record inside the grammar layer
  if (!layers.includes('english')) layers.push('english');
  if (!legacy && profile.englishRescue !== 'easy') {
    layers = layers.filter((l) => l !== 'english');
    if (profile.englishRescue === 'secondary') {
      let at = layers.length;
      while (at > 0 && layers[at - 1] === 'history') at--;
      layers.splice(at, 0, 'english');
    } else {
      layers.push('english');
    }
  }
  const base: HelpLayer[] = ['gloss'];
  if (!legacy && profile.decodingFirst && layers.includes('decoding')) base.push('decoding');
  return { base, steps: layers.filter((l) => !base.includes(l)) };
}

/** Whether English sits behind the reader's own menu (the per-sentence English buttons) instead of beside every sentence. */
export const englishBehindMenu = (profile: AssistanceProfile): boolean =>
  !isLegacyProfile(profile) && (profile.englishRescue === 'deep' || profile.englishRescue === 'on-request');

// ───────────────────────────── supports ─────────────────────────────

/** Latest defined value for a field, searching from the highest level down (levels return only what they need). */
export function pick<K extends keyof TokenSupport>(supports: Partial<Record<number, TokenSupport>>, key: K): TokenSupport[K] | undefined {
  for (let l = 5; l >= 1; l--) {
    const v = supports[l]?.[key];
    if (v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    return v;
  }
  return undefined;
}

// ───────────────────────────── what a layer has to show ─────────────────────────────

export interface LayerFacts {
  analysis?: TokenAnalysis;
  phrases: number;
  patterns: number;
  morphologyLine?: string;
  /** The adapter can decode this script at all (or the analysis carries a decoding). */
  canDecode: boolean;
  explanation?: string;
  /** Notes visible for this sentence, split the way the sheet shows them. */
  notes: ContentNote[];
  /** Clause-structure notes whose spans fit the sentence (see `hasClauseSpans`). */
  clauseNotes: ContentNote[];
  history: string[];
}

const DISCOURSE_ROLE = /particle|marker|connective|conjunction|discourse/i;
export const isDiscourseRole = (role?: string): boolean => !!role && DISCOURSE_ROLE.test(role);

/** Whether opening this layer would show the learner something about THIS word. English is always worth opening. */
export function layerHasContent(layer: HelpLayer, f: LayerFacts): boolean {
  switch (layer) {
    case 'gloss': return true;
    case 'english': return true;
    case 'decoding': return f.canDecode;
    case 'phrase': return f.phrases > 0;
    case 'grammar': return f.patterns > 0 || !!f.morphologyLine;
    case 'definition': return !!f.analysis?.definition;
    case 'discourse': return isDiscourseRole(f.analysis?.role);
    case 'note': return f.notes.length > 0;
    case 'clause-structure': return f.clauseNotes.length > 0;
    case 'sentence': return !!f.explanation;
    case 'history': return f.history.length > 0;
  }
}

/** The step "more help" opens next: the first layer after those already opened that has something to show. */
export function nextLayer(steps: HelpLayer[], opened: HelpLayer[], f: LayerFacts): HelpLayer | undefined {
  const last = Math.max(-1, ...opened.map((l) => steps.indexOf(l)));
  return steps.slice(last + 1).find((l) => layerHasContent(l, f));
}

export const MORE_LABEL: Record<HelpLayer, string> = {
  gloss: 'Show meaning',
  decoding: 'Show how it is read',
  phrase: 'Show phrases',
  grammar: 'Show grammar',
  definition: 'Show a simple definition',
  discourse: 'Show what it does here',
  'clause-structure': 'Show sentence structure',
  note: 'Show notes',
  sentence: 'Explain this sentence',
  english: 'Show English',
  history: 'Show your history with this word',
};

// ───────────────────────────── varieties ─────────────────────────────

const VARIETY_LINE: Partial<Record<RegisterTag, string>> = {
  colloquial: 'Spoken, informal word',
  formal: 'Formal word',
  literary: 'Older literary word',
  archaic: 'Older literary word',
  historical: 'Historical word, not used today',
  royal: 'Royal vocabulary',
  religious: 'Religious vocabulary',
  'regional-isan': 'Isan regional word — not ordinary Central Thai',
  'regional-north': 'Northern regional word — not ordinary Central Thai',
  'regional-south': 'Southern regional word — not ordinary Central Thai',
  teochew: 'Teochew word — not ordinary Central Thai',
  'child-directed': 'Word used when speaking to children',
  slang: 'Slang',
  sanskritic: 'Formal word of Sanskrit origin',
  'perso-arabic': 'Word of Persian or Arabic origin',
  'english-loan': 'English loanword',
  biblical: 'Word of Scripture and church',
};

/** One line naming the variety of a word, or undefined when it is ordinary standard usage (or says nothing). */
export function varietyLine(register?: RegisterTag[]): string | undefined {
  const lines = [...new Set((register ?? []).filter((r) => r !== 'standard').map((r) => VARIETY_LINE[r]).filter((l): l is string => !!l))];
  return lines.length ? lines.join(' · ') : undefined;
}

/** What a role means for the learner, in plain words ("softening particle", "classifier"). */
export const roleText = (role: string): string => role.replace(/[-_]+/g, ' ');

// ───────────────────────────── notes ─────────────────────────────

export const NOTE_KIND_LABEL: Record<ContentNote['kind'], string> = {
  cultural: 'Cultural note',
  regional: 'Regional note',
  register: 'Note on register',
  literary: 'Literary note',
  historical: 'Historical note',
  'clause-structure': 'Sentence structure',
};

/**
 * The notes the learner may see. A rejected note never; a note a person wrote or reviewed yes; a machine note nobody
 * has reviewed only in preview mode, where it says so.
 */
export function visibleNotes(notes: readonly ContentNote[], sentenceId: string, preview: boolean): ContentNote[] {
  return notes.filter((n) =>
    n.sentenceId === sentenceId && n.reviewStatus !== 'rejected'
    && (REVIEW_OK.includes(n.reviewStatus) || n.provenance !== 'machine' || preview));
}

export const noteIsReviewed = (n: ContentNote): boolean => REVIEW_OK.includes(n.reviewStatus);

export interface ClauseSegment { text: string; label?: string }

/**
 * The sentence's own text cut at the note's labelled spans. Concatenating the segments always gives the sentence back
 * byte for byte; spans that are out of range or overlap an earlier span are ignored, never "fixed".
 */
export function clauseSegments(text: string, spans: ContentNote['spans']): ClauseSegment[] {
  const out: ClauseSegment[] = [];
  let cursor = 0;
  const sorted = [...(spans ?? [])].sort((a, b) => a.start - b.start || a.end - b.end);
  for (const s of sorted) {
    if (!Number.isInteger(s.start) || !Number.isInteger(s.end) || s.start < cursor || s.end <= s.start || s.end > text.length) continue;
    if (s.start > cursor) out.push({ text: text.slice(cursor, s.start) });
    out.push({ text: text.slice(s.start, s.end), label: s.label });
    cursor = s.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out.length ? out : [{ text }];
}

/** Whether a clause-structure note has at least one span that fits the sentence. */
export const hasClauseSpans = (text: string, spans: ContentNote['spans']): boolean => clauseSegments(text, spans).some((s) => !!s.label);

/** The highest assistance level among the opened layers (at least 1: the gloss is always open). */
export const maxLevel = (opened: readonly HelpLayer[]): AssistanceLevel =>
  Math.max(1, ...opened.map((l) => LAYER_ASSISTANCE_LEVEL[l])) as AssistanceLevel;

// ───────────────────────────── where an analysis comes from ─────────────────────────────

/** The short name of a dictionary from its attribution ("Wiktionary via kaikki.org, CC BY-SA 4.0" → "Wiktionary"). */
export function dictionaryName(info?: Pick<DictionaryInfo, 'attribution'>): string | undefined {
  const name = info?.attribution?.split(/\s+via\s+|,|;|—/)[0]?.trim();
  return name || undefined;
}

/**
 * One quiet line naming the source of the analysis on show. Absent origin ⇒ nothing (rows written before origins were
 * recorded, and the other languages, display exactly as they always did). A source we cannot name says nothing rather
 * than guessing its review state.
 */
export function analysisSourceLine(
  a: Pick<TokenAnalysis, 'origin' | 'sourceId'> | undefined,
  sources?: Readonly<Record<string, AnalysisSourceInfo>>,
  dictionary?: Pick<DictionaryInfo, 'attribution'>,
): string | undefined {
  if (!a?.origin) return undefined;
  // A dictionary's reading always names the dictionary, whatever the adapter has opted in to: the meaning on show is
  // the dictionary's, and its licence asks for the attribution.
  if (a.origin === 'dictionary') return dictionary?.attribution ?? (a.sourceId ? `Dictionary ${a.sourceId}` : 'From a dictionary');
  // An adapter that declares no sources has not opted in to showing provenance: its reader stays exactly as it was.
  if (!sources) return undefined;
  switch (a.origin) {
    case 'hand': {
      const src = a.sourceId ? sources?.[a.sourceId] : undefined;
      if (!src) return undefined;
      const state = src.reviewStatus === 'machine-drafted' ? ', machine-drafted — not checked by a native speaker'
        : src.reviewStatus === 'native-reviewed' ? ', checked by a native speaker' : '';
      return `${src.label}${state}`;
    }
    case 'rule': return 'worked out by rule';
    case 'corpus': return 'supplied with this text';
    case 'reviewed': {
      const who = a.sourceId?.replace(/^human:/, '').trim();
      return who ? `checked by ${who}` : 'checked by a person';
    }
  }
}

type Alternative = NonNullable<TokenAnalysis['alternatives']>[number];

/** The dictionary's other readings of this word that carry a gloss. */
export const dictionaryAlternatives = (a?: Pick<TokenAnalysis, 'alternatives'>): Alternative[] =>
  (a?.alternatives ?? []).filter((alt) => alt.origin === 'dictionary' && !!alt.gloss);

const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'and', 'or', 'be', 'for', 'on', 'is']);
const wordsOf = (s: string): Set<string> => new Set((s.toLowerCase().match(/\p{L}+/gu) ?? []).filter((w) => !STOP.has(w)));

/** What the installed dictionary says about a word (`dictionaryView` in src/ingest), asked when the sheet opens. */
export interface DictionaryView { glosses: string[]; pos: PartOfSpeech[]; readings: string[] }

/**
 * What the dictionary lists besides the analysis on show: stored alternatives of origin 'dictionary' (dictionary-only
 * words, older rows) when there are any, else the dictionary's own entries looked up for this form.
 */
export function dictionaryOthers(a: Pick<TokenAnalysis, 'alternatives'> | undefined, view?: DictionaryView): { glosses: string[]; pos: PartOfSpeech[]; stored: boolean; items: Array<{ gloss: string; pos?: PartOfSpeech }> } {
  const stored = dictionaryAlternatives(a);
  if (stored.length) return { glosses: stored.map((alt) => alt.gloss!), pos: stored.map((alt) => alt.pos).filter((p): p is PartOfSpeech => !!p), stored: true, items: stored.map((alt) => ({ gloss: alt.gloss!, pos: alt.pos })) };
  return { glosses: view?.glosses ?? [], pos: view?.pos ?? [], stored: false, items: (view?.glosses ?? []).map((gloss) => ({ gloss })) };
}

/**
 * Whether the course word list and the dictionary visibly part ways on this word: the dictionary's first part of speech
 * differs, or its glosses share no word with the gloss on show. Says nothing about which is right.
 */
export function listsDiffer(a: Pick<TokenAnalysis, 'origin' | 'pos' | 'alternatives'> | undefined, shownGloss: string | undefined, view?: DictionaryView): boolean {
  if (!a || a.origin === 'dictionary') return false; // the line speaks of two sources: it needs the other one
  const other = dictionaryOthers(a, view);
  if (other.glosses.length === 0) return false;
  if (a.pos && other.pos[0] && a.pos !== other.pos[0]) return true;
  if (shownGloss) {
    const mine = wordsOf(shownGloss);
    // stored alternatives: the first one's gloss; a looked-up entry: any of its glosses
    const theirs = wordsOf(other.stored ? other.glosses[0] : other.glosses.join(' '));
    return ![...theirs].some((w) => mine.has(w));
  }
  return false;
}

type SyllableSource = NonNullable<SyllableAnalysis['source']>;

/**
 * Where a syllable's reading came from — a property of the reading itself (`SyllableAnalysis.source`), never inferred
 * from how sure the engine is. Absent source ⇒ nothing is said.
 */
export function syllableSourceLabel(source: SyllableSource | undefined, dictionary?: string): string | undefined {
  switch (source) {
    case 'rule': return 'by the spelling rules';
    case 'exception-list': return "from the course's list of irregular words (machine-drafted)";
    case 'dictionary': return `from the dictionary's pronunciation${dictionary ? ` (${dictionary})` : ''}`;
    case 'author': return 'supplied with this text';
    default: return undefined;
  }
}

export interface DecodingSource {
  /** One line for the whole word: all syllables share a source, or a reviewer supplied the decoding. */
  top?: string;
  /** The sources differ: each syllable names its own. */
  perSyllable: boolean;
}

/**
 * The provenance of a word's decoding. A uniform source is said once at the top; mixed sources are labelled on each
 * syllable; a reviewed analysis that itself supplies the syllables says who checked it (and nothing else implies review).
 */
export function decodingSource(syllables: readonly SyllableAnalysis[], opts: { dictionary?: string; reviewedBy?: string } = {}): DecodingSource {
  if (opts.reviewedBy) return { top: `checked by ${opts.reviewedBy}`, perSyllable: false };
  const sources = new Set(syllables.map((x) => x.source));
  if (sources.size === 1) return { top: syllableSourceLabel([...sources][0], opts.dictionary), perSyllable: false };
  return { perSyllable: [...sources].some((x) => x !== undefined) };
}

const TONE_SOURCE: Record<SyllableSource, string> = {
  rule: 'Spelling rules', 'exception-list': "The course's list of irregular words", dictionary: 'Dictionary', author: 'Supplied with the text',
};

/** Both readings, labelled, with no statement that either is right: "Dictionary: mid. Spelling rules alone: rising." */
export function ruleToneLine(s: Pick<SyllableAnalysis, 'source' | 'tone' | 'ruleTone'>): string | undefined {
  if (!s.ruleTone) return undefined;
  return `${s.source ? TONE_SOURCE[s.source] : 'This reading'}: ${s.tone ?? 'no tone given'}. Spelling rules alone: ${s.ruleTone}.`;
}

/** The certainty of a decoding, a second statement apart from its source: nothing from 0.8, "less certain" from 0.6, else "uncertain". */
export function certainty(confidence: number): 'sure' | 'less-certain' | 'uncertain' {
  return confidence < 0.6 ? 'uncertain' : confidence < 0.8 ? 'less-certain' : 'sure';
}

/** `notes.readings` lists more than one reading of the word. */
export const hasSeveralReadings = (notes: TokenAnalysis['notes']): boolean => {
  const r = notes?.readings;
  return Array.isArray(r) && r.length > 1;
};

// ───────────────────────────── morphology, parts, varieties (Spanish) ─────────────────────────────

export type DescribeMorph = (morph: Record<string, string>, pos?: PartOfSpeech) => string;

/** The lemma text inside a lemma id ("lemma:es:haber:VERB" → "haber"). */
export function lemmaOfId(id?: string): string | undefined {
  const m = id ? /^lemma:[^:]+:(.*?)(?::[A-Z]+)?$/.exec(id) : null;
  return m?.[1] || undefined;
}

const sameWord = (a: string, b: string): boolean => a.normalize('NFC').toLowerCase() === b.normalize('NFC').toLowerCase();

/** "first person plural, imperfect subjunctive of haber": the adapter's plain words plus the lemma (when it is not the written form). */
export function morphInWords(describe: DescribeMorph | undefined, morph: Record<string, string> | undefined, pos: PartOfSpeech | undefined, lemma: string | undefined, surface: string): string | undefined {
  if (!describe || !morph || Object.keys(morph).length === 0) return undefined;
  const words = describe(morph, pos);
  if (!words) return undefined;
  return lemma && !sameWord(lemma, surface) ? `${words} of ${lemma}` : words;
}

/** The other readings the analyzer kept, briefly ("or: …"). Dictionary alternatives are glosses, not morphology: not here. */
export function morphAlternates(describe: DescribeMorph | undefined, a: Pick<TokenAnalysis, 'alternatives'> | undefined, surface: string): string[] {
  if (!describe) return [];
  const out: string[] = [];
  for (const alt of a?.alternatives ?? []) {
    if (alt.origin === 'dictionary') continue;
    const line = morphInWords(describe, alt.morph, alt.pos, lemmaOfId(alt.lemmaId), surface);
    if (line && !out.includes(line)) out.push(line);
  }
  return out.slice(0, 3);
}

/** The parts of a written word that is several units; fewer than two is not worth a line. */
export const wordParts = (a: Pick<TokenAnalysis, 'parts'> | undefined) => ((a?.parts?.length ?? 0) >= 2 ? a!.parts! : []);

/** How the personal-difficulty factors read in words. */
export const PERSONAL_FACTOR_WORD: Record<string, string> = {
  'lexical-coverage': 'lexical coverage', 'new-words': 'new words', phrases: 'phrases', constructions: 'unfamiliar constructions',
  'sentence-length': 'sentence length', 'clause-depth': 'clause depth', subjunctive: 'subjunctive', clitics: 'attached pronouns',
  regional: 'regional vocabulary', historical: 'historical vocabulary', 'proper-names': 'names', domain: 'subject matter',
  author: "author's style", unanalysed: 'words without analysis',
  compounds: 'compound words', 'verb-bracket': 'verbs split apart', genitive: 'genitive', passive: 'passive', 'relative-clauses': 'relative clauses',
  'participial-modifiers': 'participle phrases', nominalizations: 'nouns made from verbs', 'older-spelling': 'older spelling',
};

// ───────────────────────────── lexical units, compounds, older spelling ─────────────────────────────

/**
 * The pieces of a lexical unit written as several words, in text order, then the unit as a dictionary lists it:
 * "steht … auf = aufstehen". Each piece is one stretch of the text (see `unitStretches`), so pieces that stand side
 * by side read as written ("të mira = i mirë") and only separated ones get the dots.
 */
export function unitText(pieces: readonly string[], display: string): string {
  const written = pieces.join(' … ');
  return written && written !== display ? `${written} = ${display}` : display;
}

/** The pieces of a unit as stretches of the text: neighbours in the sentence are joined by a space. `at` is each piece's place in its sentence, ascending. */
export function unitStretches(pieces: ReadonlyArray<{ surface: string; at: number }>): string[] {
  const out: string[] = [];
  pieces.forEach((p, i) => {
    if (i > 0 && p.at === pieces[i - 1].at + 1) out[out.length - 1] += ` ${p.surface}`;
    else out.push(p.surface);
  });
  return out;
}

/** This word's part in its unit, in plain words ("this word is the separable prefix"). The head is the word that carries the unit. */
export function unitRoleText(role: string): string {
  return role === 'head' ? 'this word is the main part' : `this word is the ${roleText(role)}`;
}

/**
 * How one part of a written word reads in the word-parts line. A linking element is shown as such (-s-). A component, the
 * head or a stem that names its word is shown as that WORD, not as the letters it occupies: Hausaufgaben = Haus + Aufgabe
 * (not "aufgaben"), Töpfchen = Topf + chen (not "Töpf"). Everything else is shown as written.
 */
export function partText(p: Pick<WordPart, 'text' | 'kind' | 'lemma'>): string {
  if (p.kind === 'link') return `-${p.text.replace(/^-+|-+$/g, '')}-`;
  if ((p.kind === 'component' || p.kind === 'head' || p.kind === 'stem') && p.lemma) return p.lemma;
  return p.text;
}

/**
 * The plain words after a part, in parentheses. A part that states its `kind` is read by that kind (a component, the head, a link and
 * a contracted word need no label: "im = in + dem"); a prefix, marker, stem or clitic keeps its role; a part with no kind keeps its
 * role exactly as it always did.
 */
export function partRole(p: Pick<WordPart, 'role' | 'kind'>): string | undefined {
  if (!p.role) return undefined;
  if (p.kind === undefined || p.kind === 'prefix' || p.kind === 'marker' || p.kind === 'stem' || p.kind === 'clitic') return p.role;
  return undefined;
}

/** The sentence that names the head of a compound ("the last part decides the gender and the kind of thing"), when the parts name one. */
export function compoundHeadLine(parts: ReadonlyArray<Pick<WordPart, 'text' | 'kind' | 'lemma'>>): string | undefined {
  const head = parts.find((p) => p.kind === 'head');
  if (!head) return undefined;
  return head === parts[parts.length - 1]
    ? `${partText(head)} is the head: the last part decides the gender and the kind of thing.`
    : `${partText(head)} is the head: it decides the gender and the kind of thing.`;
}

/** The older spelling of a word: today's spelling and the period's label from the adapter's table ("today: dass — spelling before 1996"). */
export function olderSpellingLine(o: Pick<OrthographyRelation, 'modern' | 'period'> | undefined, varieties?: Readonly<Record<string, Pick<Variety, 'label'>>>): { modern: string; label?: string } | undefined {
  if (!o) return undefined;
  const label = varieties?.[o.period]?.label;
  return label ? { modern: o.modern, label } : { modern: o.modern };
}

// ───────────────────────────── part of speech in plain words ─────────────────────────────

/** The tags a learner would not recognise, in plain words; every other tag is shown in lower case as before ("noun", "verb"). */
const POS_WORDS: Partial<Record<PartOfSpeech, string>> = {
  PROPN: 'name', AUX: 'helping verb', ADP: 'preposition or postposition', SCONJ: 'conjunction (joins clauses)', CONJ: 'conjunction',
  PART: 'particle', DET: 'determiner', INTJ: 'interjection', NUM: 'number', PRON: 'pronoun', ADV: 'adverb', ADJ: 'adjective',
};
export const posWord = (pos: PartOfSpeech): string => POS_WORDS[pos] ?? pos.toLowerCase();

// ───────────────────────────── the romanization rescue ─────────────────────────────

/**
 * What the romanization rescue shows for a word. Units that are syllables (each states how it ends: Thai) are joined
 * with a hyphen, as before. Units that are written units and not syllables (none states an ending: Devanagari akṣaras)
 * would mislead if joined — घर is one syllable, "ghar", not "gha-r" — so there the adapter's romanization of the whole
 * word is shown when it has one (`whole` is asked only in that case). Falls back to the joined units, then to a
 * romanization carried in the analysis notes; undefined when the word has none.
 */
export function rescueRomanization(units: readonly SyllableAnalysis[], whole: () => string | undefined, fromNotes?: string): string | undefined {
  const joined = units.map((s) => s.romanization).filter((r): r is string => !!r).join('-');
  if (units.length > 0 && units.every((s) => s.ending === undefined)) {
    const w = whole();
    if (w) return w;
  }
  return joined || fromNotes || undefined;
}

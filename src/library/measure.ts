/**
 * Measuring a stored text: its lexical profile and its generic difficulty features, from the rows the importer wrote
 * (live sentences only; a retired sentence is history, never part of what the learner reads).
 *
 * Analyses are resolved with GoLearn's own rule (`pickAnalysis`, `creditableLemmaId`): this module reads the stored
 * rows, it never re-derives them. A feature the analysis cannot measure is ABSENT from the result, never zero:
 *   - part-of-speech features (subordinators, proper nouns, clitics) need at least one analysis that states a POS;
 *   - the subjunctive share needs at least one analysis that states a mood, and counts only an unambiguous "Sub";
 *   - the phrase share needs at least one stored phrase occurrence;
 *   - variety shares are present only when some analysis carries a variety tag.
 */
import type { AppStore, LanguageCode, Text, TextFeatures, TextProfile, Token, TokenAnalysis } from '../core';
import { creditableLemmaId, pickAnalysis } from '../golearn/analysis';
import { cmp, round4 } from './text';

/** A long sentence has more than this many words. */
export const LONG_SENTENCE_WORDS = 30;

/** The analyzers a stored text was produced with, from its transformation log: the adapter and the dictionary, if any. */
export function analyzerKeyOf(text: Pick<Text, 'transformations'>): string[] {
  const tools = text.transformations ?? [];
  const adapter = [...tools].reverse().find((t) => t.tool.startsWith('adapter-'))?.tool;
  const dict = [...tools].reverse().find((t) => t.tool.startsWith('dict:') && t.tool !== 'dict:none')?.tool;
  return [adapter, dict].filter((x): x is string => !!x);
}

export interface MeasureOptions {
  /**
   * How analysis rows are fetched for a batch of token ids. The default asks the store one token at a time (an index
   * lookup each, in parallel batches), which is right for a learner's database; a caller that holds ONE text in a
   * private store (the build tool) passes a single-pass grouping instead.
   */
  analysesOf?: (tokenIds: string[]) => Promise<Map<string, TokenAnalysis[]>>;
}

export interface Measured { profile: TextProfile; features: TextFeatures }

const BATCH = 100;

async function defaultAnalysesOf(store: AppStore, tokenIds: string[]): Promise<Map<string, TokenAnalysis[]>> {
  const out = new Map<string, TokenAnalysis[]>();
  for (let i = 0; i < tokenIds.length; i += BATCH) {
    const slice = tokenIds.slice(i, i + BATCH);
    const rows = await Promise.all(slice.map((id) => store.analyses.where('tokenId', id)));
    slice.forEach((id, k) => { if (rows[k].length) out.set(id, rows[k]); });
  }
  return out;
}

/** Group every analysis of a store by token (for a store that holds one text only). */
export const groupedAnalysesOf = (store: AppStore): MeasureOptions['analysesOf'] => {
  let grouped: Map<string, TokenAnalysis[]> | undefined;
  return async (tokenIds) => {
    if (!grouped) {
      grouped = new Map();
      for (const a of await store.analyses.all()) (grouped.get(a.tokenId) ?? grouped.set(a.tokenId, []).get(a.tokenId)!).push(a);
    }
    const out = new Map<string, TokenAnalysis[]>();
    for (const id of tokenIds) { const r = grouped.get(id); if (r) out.set(id, r); }
    return out;
  };
};

const hasText = (v: unknown): boolean => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.length > 0);

/** Words with attached pronouns (decirselo, entenderlo) and free clitic pronouns (nos, se, me). */
function carriesClitic(a: TokenAnalysis): boolean {
  if (a.parts?.some((p) => p.pos === 'PRON' || /pronoun|reflexive|clitic/i.test(p.role ?? ''))) return true;
  if (hasText(a.notes?.clitics)) return true;
  if (a.pos !== 'PRON') return false;
  const m = a.morph ?? {};
  if (m.Clitic === 'Yes' || m.Reflex === 'Yes') return true;
  return m.PronType === 'Prs' && /Acc|Dat/.test(m.Case ?? '') && !/Nom/.test(m.Case ?? '');
}

const isRelativePronoun = (a: TokenAnalysis): boolean => a.pos === 'PRON' && (a.morph?.PronType ?? '').split(',').includes('Rel');

/** Only an unambiguous "Sub" counts: a value such as "Ind,Sub" states uncertainty and is not asserted. */
const isSubjunctive = (a: TokenAnalysis): boolean => a.morph?.Mood === 'Sub';

const sortedEntries = (m: Map<string, number>): Array<[string, number]> => [...m].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]));
const bump = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by);

/** Measure one stored text. Undefined when the text is not in the store. */
export async function measureStoredText(store: AppStore, textId: string, opts: MeasureOptions = {}): Promise<Measured | undefined> {
  const text = await store.texts.get(textId);
  if (!text) return undefined;
  const lang: LanguageCode = text.lang;

  const live = new Set((await store.sentences.where('textId', textId)).filter((s) => s.retiredInVersion === undefined).map((s) => s.id));
  const words: Token[] = (await store.tokens.where('textId', textId)).filter((t) => t.isWord && live.has(t.sentenceId));
  const byToken = await (opts.analysesOf ?? ((ids) => defaultAnalysesOf(store, ids)))(words.map((t) => t.id));

  const wordsInSentence = new Map<string, number>();
  const forms = new Map<string, number>();
  const lemmas = new Map<string, number>();
  const wordIds = new Set<string>();
  let analysed = 0, withPos = 0, withMood = 0, subordinators = 0, proper = 0, subjunctive = 0, clitics = 0;
  const varieties = new Map<string, number>();

  for (const t of words) {
    wordIds.add(t.id);
    bump(wordsInSentence, t.sentenceId);
    bump(forms, t.normalized);
    const a = pickAnalysis(byToken.get(t.id) ?? []);
    if (!a) continue;
    analysed++;
    const lemmaId = creditableLemmaId(a);
    if (lemmaId) bump(lemmas, lemmaId);
    if (a.pos) {
      withPos++;
      if (a.pos === 'SCONJ' || isRelativePronoun(a)) subordinators++;
      if (a.pos === 'PROPN') proper++;
    }
    if (a.morph?.Mood !== undefined) { withMood++; if (isSubjunctive(a)) subjunctive++; }
    if (carriesClitic(a)) clitics++;
    for (const v of new Set(a.varieties ?? [])) bump(varieties, v);
  }

  const phrases = new Map<string, number>();
  const inPhrase = new Set<string>();
  let phraseOccurrences = 0;
  for (const o of await store.phraseOccurrences.where('textId', textId)) {
    if (!live.has(o.sentenceId)) continue;
    phraseOccurrences++;
    bump(phrases, o.phraseId);
    for (const id of o.tokenIds) if (wordIds.has(id)) inPhrase.add(id);
  }
  const patterns = new Map<string, number>();
  for (const o of await store.patternOccurrences.where('textId', textId)) if (live.has(o.sentenceId)) bump(patterns, o.patternId);

  const total = words.length;
  const sentenceCount = [...live].filter((id) => wordsInSentence.has(id)).length;
  const features: TextFeatures = {
    words: total,
    sentences: sentenceCount,
    uniqueForms: forms.size,
    meanSentenceWords: sentenceCount ? round4(total / sentenceCount) : 0,
  };
  if (sentenceCount) {
    features.longSentenceShare = round4([...wordsInSentence.values()].filter((n) => n > LONG_SENTENCE_WORDS).length / sentenceCount);
    if (withPos) features.subordinatorsPerSentence = round4(subordinators / sentenceCount);
  }
  if (total) {
    if (withMood) features.subjunctiveShare = round4(subjunctive / total);
    if (withPos) features.cliticShare = round4(clitics / total);
    if (phraseOccurrences) features.phraseShare = round4(inPhrase.size / total);
    if (withPos) features.properNounShare = round4(proper / total);
    features.unanalysedShare = round4((total - analysed) / total);
    if (varieties.size) features.varietyShare = Object.fromEntries([...varieties].sort((a, b) => cmp(a[0], b[0])).map(([k, n]) => [k, round4(n / total)]));
  }

  const profile: TextProfile = {
    textId, lang, analyzers: analyzerKeyOf(text), words: total,
    forms: sortedEntries(forms), lemmas: sortedEntries(lemmas), phrases: sortedEntries(phrases), patterns: sortedEntries(patterns),
    features,
  };
  return { profile, features };
}

/** The profile of a text already in the store (live sentences only), computed from its stored tokens and analyses. */
export async function profileOfStoredText(store: AppStore, textId: string): Promise<TextProfile | undefined> {
  return (await measureStoredText(store, textId))?.profile;
}

/** Generic features of a stored text (see TextFeatures). */
export async function featuresOfStoredText(store: AppStore, textId: string): Promise<TextFeatures | undefined> {
  return (await measureStoredText(store, textId))?.features;
}

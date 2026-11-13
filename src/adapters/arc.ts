/**
 * Biblical Aramaic vertical slice. Shares only text mechanics and source-code decoding with
 * Hebrew; no Hebrew indexes, adapter state or learner records enter this module.
 * A source annotation is evidence for an attested form, not a productive grammar.
 */
import type { AnalysisCandidate, LanguageAdapter, PartOfSpeech, RawToken } from '../core';
import { speechNormalizeGeneric } from './shared';
import { consonantal, heNormalize, heSearchNormalize, heSegmentSentences, heTokenize, isPointed } from './hebrew/text';
import { decodeOshb, oshbParts } from './hebrew/oshb';
import { describeHeMorph } from './hebrew/describe';
import { ARAMAIC_SEED } from './aramaic/seed';
import type { AramaicReading } from './aramaic/seed';

export const ARC_VERSION = '2';
export const ARC_ANALYZER = 'adapter-arc@2';
export const ARC_SOURCE_ID = 'oshb-aramaic';
export const ARC_VARIETIES = {
  'arc-bib': { code: 'arc-bib', label: 'Biblical Aramaic', kind: 'period' as const,
    note: 'Corpus-backed Biblical Aramaic readings from the OSHB source. Other dialects are not analysed.' },
};
/** Metadata, not an assertion that every family member is supported. */
export const ARAMAIC_FAMILY = {
  name: 'Aramaic', supported: ['arc-bib'],
  future: ['Targum Onkelos', 'Targum Jonathan', 'Imperial Aramaic', 'Qumran Aramaic', 'Classical Syriac (syc, Syrc)'],
} as const;

const byForm = new Map<string, AramaicReading[]>();
const bySkeleton = new Map<string, AramaicReading[]>();
const byReference = new Map<string, AramaicReading[]>();
const ARC_CANDIDATE_CACHE_LIMIT = 1024;
const candidateCache = new Map<string, AnalysisCandidate[]>();
// Occurrences flagged for review by the source audit. These are not silently corrected.
export const ARAMAIC_QUESTIONED_SOURCE_IDS = new Set([
  '27yeG', '275on', // Dan 3:1, the two cubit occurrences
  '27t52', // Dan 4:31
  '27SNT', // Dan 7:19
  '27mwg', // Dan 4:21
  '15TZB', // Ezra 5:9
  '27x3P', // Dan 7:7
  '27Euh', // Dan 2:39
  '27ZUC', // Dan 4:14
  '27h69', // Dan 5:27
  '27tvs', // Dan 5:18
]);
for (const row of ARAMAIC_SEED) {
  if (!row.morph.startsWith('A')) throw new Error('Non-Aramaic source reading in Aramaic seed');
  const key = heNormalize(row.surface);
  const rows = byForm.get(key) ?? []; rows.push(row); byForm.set(key, rows);
  const skeleton = consonantal(key);
  const sameSkeleton = bySkeleton.get(skeleton) ?? []; sameSkeleton.push(row); bySkeleton.set(skeleton, sameSkeleton);
  const sameReference = byReference.get(row.reference) ?? []; sameReference.push(row); byReference.set(row.reference, sameReference);
}

export interface AramaicLexiconEntry {
  headword: string;
  lemmaId: string;
  pos: PartOfSpeech;
  glosses: string[];
  glossAvailable: boolean;
  attestedForms: string[];
  references: string[];
  frequency: number;
  source: typeof ARC_SOURCE_ID;
}
const lexiconByLemma = new Map<string, AramaicLexiconEntry[]>();
const lexiconByForm = new Map<string, AramaicLexiconEntry[]>();
const lexiconBySkeleton = new Map<string, AramaicLexiconEntry[]>();
const lexiconIdentity = (row: AramaicReading, pos: PartOfSpeech) => `${heNormalize(row.lemma)}\0${row.lemmaId}\0${pos}`;
for (const row of ARAMAIC_SEED) {
  const parsed = decodeOshb(row.lemmaId, row.morph);
  if (!parsed.aramaic) continue;
  const identity = lexiconIdentity(row, parsed.pos);
  let entry = lexiconByLemma.get(heNormalize(row.lemma))?.find(e => `${heNormalize(e.headword)}\0${e.lemmaId}\0${e.pos}` === identity);
  if (!entry) {
    entry = { headword: row.lemma, lemmaId: row.lemmaId, pos: parsed.pos, glosses: [], glossAvailable: false,
      attestedForms: [], references: [], frequency: 0, source: ARC_SOURCE_ID };
    const matches = lexiconByLemma.get(heNormalize(row.lemma)) ?? []; matches.push(entry); lexiconByLemma.set(heNormalize(row.lemma), matches);
  }
  entry.frequency++;
  if (row.glossStatus === 'external' && row.gloss.trim()) { entry.glosses.push(row.gloss.trim()); entry.glossAvailable = true; }
  if (!entry.attestedForms.includes(row.surface)) entry.attestedForms.push(row.surface);
  if (!entry.references.includes(row.reference)) entry.references.push(row.reference);
  const forms = lexiconByForm.get(heNormalize(row.surface)) ?? [];
  if (!forms.includes(entry)) forms.push(entry);
  lexiconByForm.set(heNormalize(row.surface), forms);
}
for (const entries of lexiconByLemma.values()) for (const entry of entries) {
  const key = consonantal(entry.headword);
  const bucket = lexiconBySkeleton.get(key) ?? [];
  if (!bucket.includes(entry)) bucket.push(entry);
  lexiconBySkeleton.set(key, bucket);
}
for (const [form, entries] of lexiconByForm) for (const entry of entries) {
  const key = consonantal(form);
  const bucket = lexiconBySkeleton.get(key) ?? [];
  if (!bucket.includes(entry)) bucket.push(entry);
  lexiconBySkeleton.set(key, bucket);
}
for (const entries of [...lexiconByLemma.values(), ...lexiconByForm.values()]) {
  for (const entry of entries) entry.glosses = [...new Set(entry.glosses)];
}

/** Look up a source-backed headword or attested form. No citation-form morphology is generated. */
export function arcLexiconLookup(query: string, pos?: PartOfSpeech): AramaicLexiconEntry[] {
  const key = heNormalize(query);
  const exact = [...(lexiconByLemma.get(key) ?? []), ...(lexiconByForm.get(key) ?? [])];
  const matches = isPointed(key) ? exact : [...exact, ...(lexiconBySkeleton.get(consonantal(key)) ?? [])];
  const unique = [...new Map(matches.map(entry => [`${heNormalize(entry.headword)}\0${entry.lemmaId}\0${entry.pos}`, entry])).values()];
  return unique.filter(entry => !pos || entry.pos === pos).map(entry => ({ ...entry,
    glosses: [...entry.glosses], attestedForms: [...entry.attestedForms], references: [...entry.references] }));
}

function readings(token: RawToken): { row: AramaicReading; inferred: boolean }[] {
  const key = heNormalize(token.surface);
  if (isPointed(key)) return (byForm.get(key) ?? []).map(row => ({ row, inferred: false }));
  const skeleton = consonantal(key);
  return (bySkeleton.get(skeleton) ?? []).map(row => ({ row, inferred: true }));
}

/** The source's segmented word is matched to this printed surface, retaining UTF-16 offsets.
 * Corpus-bound grammatical certainty is not transferred to another unpointed context.
 */
function buildArcCandidates(token: RawToken): AnalysisCandidate[] {
  if (!token.isWord) return [];
  const out = new Map<string, AnalysisCandidate>();
  for (const { row, inferred } of readings(token)) {
    const parsed = decodeOshb(row.lemmaId, row.morph);
    if (!parsed.aramaic) continue;
    const c: AnalysisCandidate = {
      lemma: row.lemma, pos: parsed.pos, morph: { ...parsed.morph }, gloss: row.gloss,
      confidence: inferred ? 0.6 : 0.92, varieties: ['arc-bib'], origin: 'dictionary', sourceId: ARC_SOURCE_ID,
      notes: { source: 'oshb', code: row.morph, sourceCodes: [row.morph], lemmaId: row.lemmaId.split('/').pop()!, references: [row.reference],
        sourceWordIds: [row.sourceWordId], scope: 'attested source reading; not a productive paradigm',
        ...(ARAMAIC_QUESTIONED_SOURCE_IDS.has(row.sourceWordId) ? { reviewStatus: 'requires-review', reviewReason: 'Source audit flagged this occurrence; source annotation is preserved without correction.' } : {}),
        ...(inferred ? { pointing: 'inferred from the consonantal spelling; alternatives retained' } : {}) },
      parts: oshbParts(token.surface, parsed, row.seg, row.lemma, parsed.pos).map((p, index) => ({
        ...p, kind: p.role === 'stem' ? 'stem' as const : index < parsed.prefixes.length ? 'prefix' as const : 'suffix' as const,
        ...(row.morph.slice(1).split('/')[index] === 'Td' && index > parsed.mainIndex
          ? { role: 'determined (emphatic) state ending', pos: 'DET' as const, morph: { Definite: 'Def' } } : {}),
      })),
    };
    const identity = JSON.stringify([c.lemma, c.pos, c.morph, row.lemmaId, row.seg]);
    const old = out.get(identity);
    if (!old) out.set(identity, c);
    else {
      old.notes!.sourceCodes = [...new Set([...(old.notes!.sourceCodes as string[] ?? []), row.morph])];
      old.notes!.references = [...new Set([...(old.notes!.references as string[]), row.reference])];
      old.notes!.sourceWordIds = [...new Set([...(old.notes!.sourceWordIds as string[]), row.sourceWordId])];
      const sourceWordIds = old.notes!.sourceWordIds as string[];
      if (sourceWordIds.every(id => ARAMAIC_QUESTIONED_SOURCE_IDS.has(id))) {
        old.notes!.reviewStatus = 'requires-review';
        old.notes!.reviewReason = 'Source audit flagged this occurrence; source annotation is preserved without correction.';
      } else {
        delete old.notes!.reviewStatus;
        delete old.notes!.reviewReason;
      }
    }
  }
  return [...out.values()];
}

function cloneCandidate(candidate: AnalysisCandidate): AnalysisCandidate {
  return {
    ...candidate,
    ...(candidate.morph ? { morph: { ...candidate.morph } } : {}),
    ...(candidate.varieties ? { varieties: [...candidate.varieties] } : {}),
    ...(candidate.notes ? { notes: Object.fromEntries(Object.entries(candidate.notes).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])) } : {}),
    ...(candidate.parts ? { parts: candidate.parts.map(part => ({ ...part, ...(part.morph ? { morph: { ...part.morph } } : {}) })) } : {}),
  };
}

/** Exact raw surface cache: mark sequences affect part offsets, so normalized spellings never share templates. */
export function arcCandidates(token: RawToken): AnalysisCandidate[] {
  if (!token.isWord) return [];
  const cached = candidateCache.get(token.surface);
  if (cached) {
    candidateCache.delete(token.surface);
    candidateCache.set(token.surface, cached);
    return cached.map(cloneCandidate);
  }
  const candidates = buildArcCandidates(token);
  if (candidates.length) {
    if (candidateCache.size >= ARC_CANDIDATE_CACHE_LIMIT) candidateCache.delete(candidateCache.keys().next().value!);
    candidateCache.set(token.surface, candidates.map(cloneCandidate));
  }
  return candidates.map(cloneCandidate);
}

export const arcAdapter: LanguageAdapter = {
  lang: 'arc', name: 'Biblical Aramaic', script: 'Hebr', version: ARC_VERSION,
  varieties: ARC_VARIETIES,
  support: {
    tokenization: 'dependable', sentenceSegmentation: 'limited', lemmatization: 'seed-only', morphology: 'limited',
    phraseDetection: 'none', productionChecks: 'none',
    limitations: [
      'The analyser recognizes only attested forms in the bundled corpus; it does not generate or guess unattested forms. Unknown forms remain unresolved.',
      'OSHB supplies morphology; Open Scriptures Strong supplies lexical headwords and base meanings. No independent scholarly review is claimed.',
      'Selected-word glosses remain attached to attested readings. arcLexiconLookup can look up indexed headwords or forms, but does not generate a candidate for an unattested citation form; the pack runtime does not expose a separate dictionary service.',
      'Unpointed forms keep every matching pointed source analysis at reduced confidence. Sentence syntax is not parsed.',
      'Roots, productive paradigms, cognates, Targumic Aramaic, Imperial Aramaic and Syriac are not implemented.',
      'Base meanings are lexical help, not verified inflected translations. No historical pronunciation recording or voice is supplied.',
    ],
  },
  sources: {
    [ARC_SOURCE_ID]: {
      id: ARC_SOURCE_ID, label: 'OSHB Biblical Aramaic morphology; Open Scriptures Strong lexical transcription',
      origin: 'dictionary', reviewStatus: 'external', licence: 'CC BY 4.0. Original work of the Open Scriptures Hebrew Bible available at https://github.com/openscriptures/morphhb',
      version: 'OSHB Aramaic annotations, corpus snapshot 2026-11-05',
    },
  },
  segmentSentences: heSegmentSentences, tokenize: heTokenize, normalize: heNormalize, searchNormalize: heSearchNormalize,
  analyze(tokens, opts) {
    const words = tokens.filter(t => t.isWord);
    // Exact known-source alignment only; punctuation and cantillation do not decide a foreign dialect.
    const aligned = [...byReference.values()]
      .find(rows => rows.length === words.length && rows.every((r, i) => heNormalize(r.surface) === words[i].normalized));
    let index = 0;
    return tokens.map(token => {
      const row = token.isWord ? aligned?.[index++] : undefined;
      let candidates = opts?.varietyId && opts.varietyId !== 'arc-bib' ? [] : arcCandidates(token);
      if (row) candidates = candidates.map(c => {
        const matchesContextRow = (c.notes?.sourceWordIds as string[] | undefined)?.includes(row.sourceWordId) ?? false;
        const notes: NonNullable<AnalysisCandidate['notes']> = { ...c.notes, context: 'Exact annotated source passage; alternatives are retained.' };
        if (matchesContextRow && ARAMAIC_QUESTIONED_SOURCE_IDS.has(row.sourceWordId)) {
          notes.reviewStatus = 'requires-review';
          notes.reviewReason = 'Source audit flagged this occurrence; source annotation is preserved without correction.';
        }
        return { ...c, confidence: matchesContextRow ? 0.98 : 0.65, notes };
      }).sort((a, b) => b.confidence - a.confidence);
      return { token, analyzer: ARC_ANALYZER, candidates };
    });
  },
  detectPhrases: () => [], detectPatterns: () => [], checkProduction: () => [],
  pronunciation: () => ({ notes: [] }), // Absence is stated in support limitations; it is not a pronunciation feature.
  speechNormalize: text => speechNormalizeGeneric(text, { tool: 'speech-arc@1', numberToWords: () => null, abbreviations: [] }),
  display: { wordSeparator: ' ', showBoundariesOnHighlight: false,
    fontFamily: '"SBL Hebrew", "Ezra SIL", "Noto Serif Hebrew", serif', lineHeight: 2 },
  describeMorph: (morph, pos) => describeHeMorph(morph, pos),
  relate(a, b) {
    if (heNormalize(a) === heNormalize(b)) return 'same';
    const lemmas = new Set(arcCandidates({ surface: a, normalized: heNormalize(a), start: 0, end: a.length, isWord: true }).map(c => c.lemma));
    return arcCandidates({ surface: b, normalized: heNormalize(b), start: 0, end: b.length, isWord: true }).some(c => lemmas.has(c.lemma)) ? 'inflection' : 'none';
  },
};

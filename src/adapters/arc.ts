/**
 * Biblical Aramaic vertical slice. Shares only text mechanics and source-code decoding with
 * Hebrew; no Hebrew indexes, adapter state or learner records enter this module.
 * A source annotation is evidence for an attested form, not a productive grammar.
 */
import type { AnalysisCandidate, LanguageAdapter, RawToken } from '../core';
import { speechNormalizeGeneric } from './shared';
import { consonantal, heNormalize, heSearchNormalize, heSegmentSentences, heTokenize, isPointed } from './hebrew/text';
import { decodeOshb, oshbParts } from './hebrew/oshb';
import { describeHeMorph } from './hebrew/describe';
import { ARAMAIC_SEED } from './aramaic/seed';
import type { AramaicReading } from './aramaic/seed';

export const ARC_VERSION = '1';
export const ARC_ANALYZER = 'adapter-arc@1';
export const ARC_SOURCE_ID = 'oshb-aramaic';
export const ARC_VARIETIES = {
  'arc-bib': { code: 'arc-bib', label: 'Biblical Aramaic', kind: 'period' as const,
    note: 'Initial source-backed slice: Daniel 2:4b (qere path) and 2:20. Other dialects are not analysed.' },
};
/** Metadata, not an assertion that every family member is supported. */
export const ARAMAIC_FAMILY = {
  name: 'Aramaic', supported: ['arc-bib'],
  future: ['Targum Onkelos', 'Targum Jonathan', 'Imperial Aramaic', 'Qumran Aramaic', 'Classical Syriac (syc, Syrc)'],
} as const;

const byForm = new Map<string, AramaicReading[]>();
for (const row of ARAMAIC_SEED) {
  if (!row.morph.startsWith('A')) throw new Error('Non-Aramaic source reading in Aramaic seed');
  const key = heNormalize(row.surface);
  const rows = byForm.get(key) ?? []; rows.push(row); byForm.set(key, rows);
}

function readings(token: RawToken): { row: AramaicReading; inferred: boolean }[] {
  const key = heNormalize(token.surface);
  if (isPointed(key)) return (byForm.get(key) ?? []).map(row => ({ row, inferred: false }));
  const skeleton = consonantal(key);
  return ARAMAIC_SEED.filter(row => consonantal(row.surface) === skeleton).map(row => ({ row, inferred: true }));
}

/** The source's segmented word is matched to this printed surface, retaining UTF-16 offsets.
 * Corpus-bound grammatical certainty is not transferred to another unpointed context.
 */
export function arcCandidates(token: RawToken): AnalysisCandidate[] {
  if (!token.isWord) return [];
  const out = new Map<string, AnalysisCandidate>();
  for (const { row, inferred } of readings(token)) {
    const parsed = decodeOshb(row.lemmaId, row.morph);
    if (!parsed.aramaic) continue;
    const c: AnalysisCandidate = {
      lemma: row.lemma, pos: parsed.pos, morph: { ...parsed.morph }, gloss: row.gloss,
      confidence: inferred ? 0.6 : 0.92, varieties: ['arc-bib'], origin: 'dictionary', sourceId: ARC_SOURCE_ID,
      notes: { source: 'oshb', code: row.morph, lemmaId: row.lemmaId.split('/').pop()!, references: [row.reference],
        sourceWordIds: [row.sourceWordId], scope: 'attested source reading; not a productive paradigm',
        ...(inferred ? { pointing: 'inferred from the consonantal spelling; alternatives retained' } : {}) },
      parts: oshbParts(token.surface, parsed, row.seg, row.lemma, parsed.pos).map(p => ({
        ...p, kind: p.role === 'stem' ? 'stem' as const : p.start === 0 && parsed.prefixes.length ? 'prefix' as const : 'suffix' as const,
      })),
    };
    const identity = JSON.stringify([c.lemma, c.pos, c.morph, row.lemmaId, row.seg]);
    const old = out.get(identity);
    if (!old) out.set(identity, c);
    else {
      old.notes!.references = [...new Set([...(old.notes!.references as string[]), row.reference])];
      old.notes!.sourceWordIds = [...new Set([...(old.notes!.sourceWordIds as string[]), row.sourceWordId])];
    }
  }
  return [...out.values()];
}

export const arcAdapter: LanguageAdapter = {
  lang: 'arc', name: 'Biblical Aramaic', script: 'Hebr', version: ARC_VERSION,
  varieties: ARC_VARIETIES,
  support: {
    tokenization: 'dependable', sentenceSegmentation: 'limited', lemmatization: 'seed-only', morphology: 'limited',
    phraseDetection: 'none', productionChecks: 'none',
    limitations: [
      'Only the source forms in Daniel 2:4b (qere) and 2:20 are included; unknown forms remain unresolved.',
      'OSHB supplies morphology; Open Scriptures Strong supplies lexical headwords and base meanings. No independent scholarly review is claimed.',
      'Unpointed forms keep every matching pointed source analysis at reduced confidence. Sentence syntax is not parsed.',
      'Roots, productive paradigms, cognates, Targumic Aramaic, Imperial Aramaic and Syriac are not implemented.',
      'Base meanings are lexical help, not verified inflected translations. No historical pronunciation recording or voice is supplied.',
    ],
  },
  sources: {
    [ARC_SOURCE_ID]: {
      id: ARC_SOURCE_ID, label: 'OSHB Biblical Aramaic morphology; Open Scriptures Strong lexical transcription',
      origin: 'dictionary', reviewStatus: 'external', licence: 'CC BY 4.0. Original work of the Open Scriptures Hebrew Bible available at https://github.com/openscriptures/morphhb',
      version: 'Daniel 2:4b and 2:20, 2026-11-05',
    },
  },
  segmentSentences: heSegmentSentences, tokenize: heTokenize, normalize: heNormalize, searchNormalize: heSearchNormalize,
  analyze(tokens, opts) {
    const words = tokens.filter(t => t.isWord);
    // Exact known-source alignment only; punctuation and cantillation do not decide a foreign dialect.
    const aligned = [...new Set(ARAMAIC_SEED.map(r => r.reference))].map(ref => ARAMAIC_SEED.filter(r => r.reference === ref))
      .find(rows => rows.length === words.length && rows.every((r, i) => heNormalize(r.surface) === words[i].normalized));
    let index = 0;
    return tokens.map(token => {
      const row = token.isWord ? aligned?.[index++] : undefined;
      let candidates = opts?.varietyId && opts.varietyId !== 'arc-bib' ? [] : arcCandidates(token);
      if (row) candidates = candidates.map(c => ({
        ...c, confidence: (c.notes?.sourceWordIds as string[] | undefined)?.includes(row.sourceWordId) ? 0.98 : 0.65,
        notes: { ...c.notes, context: 'Exact annotated source passage; alternatives are retained.' },
      })).sort((a, b) => b.confidence - a.confidence);
      return { token, analyzer: ARC_ANALYZER, candidates };
    });
  },
  detectPhrases: () => [], detectPatterns: () => [], checkProduction: () => [],
  pronunciation: () => ({ notes: ['No independently validated pronunciation is supplied for this historical variety.'] }),
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

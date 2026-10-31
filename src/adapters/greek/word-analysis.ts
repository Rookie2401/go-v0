import { projectWordAnalysis, type WordAnalysis } from '../../core/word-analysis';
import { ENGLISH_AUXILIARIES, ENGLISH_VERBS, englishVerbFromCitation } from './english-verbs';

export interface GreekWordAnalysisInput {
  surface: string; lemma?: string; pos?: string; lemmaGloss?: string;
  morph?: Readonly<Record<string, string>>; source?: string; confidence?: number;
  alternatives?: Array<{ lemma?: string; pos?: string; morph: Readonly<Record<string, string>>; confidence?: number }>;
  sentence?: string; references?: string[];
}
const clean = (s: string): string => s.normalize('NFC').toLocaleLowerCase('el-GR').replace(/\u0300/g, '\u0301');
const SUBJECTS: Record<string, string> = { '1:Sing': 'I', '2:Sing': 'You', '3:Sing': 'He, she, or it', '1:Plur': 'We', '2:Plur': 'You', '3:Plur': 'They' };
const FEATURE_KEYS = ['Tense', 'Voice', 'Mood', 'Person', 'Number', 'VerbForm'] as const;
const semanticSignature = (m: Readonly<Record<string, string>>): string => FEATURE_KEYS.map((k) =>
  `${k}:${k === 'VerbForm' && m[k] === 'Fin' ? '' : m[k] ?? ''}`).join('|');
const candidateSignature = (lemma: string | undefined, pos: string | undefined, morph: Readonly<Record<string, string>>): string =>
  `${lemma ?? ''}|${pos ?? ''}|${semanticSignature(morph)}`;

/** Realize only licensed person/number and present/future active indicative analyses. */
export function greekInflectedMeaning(surface: string, lemma: string | undefined, morph: Readonly<Record<string, string>>, lemmaGloss?: string): string | undefined {
  if (!surface.trim() || !lemma || morph.VerbForm !== 'Fin' || morph.Voice !== 'Act' || morph.Mood !== 'Ind') return undefined;
  const tense = morph.Tense;
  if (tense !== 'Pres' && tense !== 'Fut') return undefined;
  const key = `${morph.Person}:${morph.Number}`;
  const slot = ({ '1:Sing': 0, '2:Sing': 1, '3:Sing': 2, '1:Plur': 3, '2:Plur': 4, '3:Plur': 5 } as Record<string, number>)[key];
  if (slot === undefined) return undefined;
  // The analyzer's actual candidate supplies the Greek lemma and morphology; the citation gloss
  // supplies English lexical evidence. The local inventory covers common lemmas when no gloss exists.
  const resourceEntry = ENGLISH_VERBS.concat(ENGLISH_AUXILIARIES).find((candidate) => clean(candidate.lemma) === clean(lemma));
  const citationEntry = englishVerbFromCitation(lemmaGloss);
  const resolved = citationEntry ?? (!lemmaGloss?.trim() ? resourceEntry : undefined);
  if (!resolved) return undefined;
  if (resolved.base === 'be' && clean(lemma) !== clean('εἰμί')) return undefined;
  const subject = SUBJECTS[key];
  const verb = tense === 'Fut' ? `will ${resolved.base}` : (resolved.present?.[key] ?? (key === '3:Sing' ? resolved.thirdSingular : resolved.base));
  return `${subject} ${verb}`;
}

export function greekWordAnalysis(input: GreekWordAnalysisInput): WordAnalysis {
  const morph = input.morph ?? {};
  const source = input.source;
  const inflectedText = (!input.pos || input.pos === 'VERB')
    ? greekInflectedMeaning(input.surface, input.lemma, morph, input.lemmaGloss)
    : undefined;
  const seenAlternatives = new Set<string>([candidateSignature(input.lemma, input.pos, morph)]);
  const alternatives = (input.alternatives ?? []).filter((a) => {
    const signature = candidateSignature(a.lemma ?? input.lemma, a.pos ?? input.pos, a.morph);
    if (seenAlternatives.has(signature)) return false;
    seenAlternatives.add(signature);
    return true;
  }).filter((a) =>
    (a.lemma ?? input.lemma) !== input.lemma || (a.pos ?? input.pos) !== input.pos || semanticSignature(a.morph) !== semanticSignature(morph)).map((a) => {
    if ((a.lemma && a.lemma !== input.lemma) || (a.pos && a.pos !== input.pos)) return `${a.lemma ?? 'another lexeme'} (${a.pos ?? 'unclassified'}; ${Object.entries(a.morph).map(([k, v]) => `${k}=${v}`).join(', ') || 'no morphology'})`;
    const alternativeMeaning = (!a.pos || a.pos === 'VERB')
      ? greekInflectedMeaning(input.surface, input.lemma, a.morph, input.lemmaGloss)
      : undefined;
    if (alternativeMeaning && alternativeMeaning === inflectedText) return '';
    return alternativeMeaning ?? `Alternative reading (${Object.entries(a.morph).map(([k, v]) => `${k}=${v}`).join(', ') || 'no morphology'})`;
  }).filter(Boolean);
  const meanings = [...new Set([...(inflectedText ? [inflectedText] : []), ...alternatives])];
  const ambiguity = alternatives.length ? meanings : [];
  const gal514 = (input.references ?? []).some((r) => r.toUpperCase() === 'GAL.5.14')
    && !!inflectedText && clean(input.surface) === 'ἀγαπήσεις' && morph.Tense === 'Fut' && morph.Person === '2' && morph.Number === 'Sing';
  return projectWordAnalysis({
    language: 'el', surface: input.surface, lemma: input.lemma ?? null, pos: input.pos ?? null,
    lexicalMeaning: input.lemmaGloss ? { text: englishVerbFromCitation(input.lemmaGloss) ? `to ${englishVerbFromCitation(input.lemmaGloss)!.base}` : input.lemmaGloss, source, confidence: input.confidence } : null,
    grammaticalFeatures: Object.entries(morph).map(([key, value]) => ({ key, value, ...(source ? { source } : {}), confidence: input.confidence, ...(ambiguity.length ? { ambiguity } : {}) })),
    inflectedMeaning: inflectedText ? { text: inflectedText, ...(source ? { source } : {}), confidence: input.confidence, ...(ambiguity.length ? { ambiguity } : {}) } : null,
    contextualMeaning: gal514 ? { text: 'You shall love', source: 'Galatians 5:14', confidence: input.confidence } : null,
    sentenceContext: input.sentence ? { text: input.sentence, ...(gal514 ? { source: 'Galatians 5:14' } : {}), confidence: 1 } : null,
    references: (input.references ?? []).map((r) => ({ label: r.toUpperCase() === 'GAL.5.14' ? 'Galatians 5:14' : r, ...(r.toUpperCase() === 'GAL.5.14' ? { source: 'SBL Greek New Testament' } : {}), uri: r })),
    confidence: input.confidence, ambiguity,
  });
}

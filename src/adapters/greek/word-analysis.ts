import { projectWordAnalysis, type WordAnalysis } from '../../core/word-analysis';

export interface GreekWordAnalysisInput {
  surface: string; lemma?: string; pos?: string; lemmaGloss?: string;
  morph?: Readonly<Record<string, string>>; source?: string; confidence?: number;
  alternatives?: Array<{ lemma?: string; pos?: string; morph: Readonly<Record<string, string>>; confidence?: number }>;
  sentence?: string; references?: string[];
}
const clean = (s: string): string => s.normalize('NFC').toLocaleLowerCase('el-GR');

/** Exact, small evidence map for the requested ἀγαπάω forms; no general conjugator. */
export function greekInflectedMeaning(surface: string, lemma: string | undefined, morph: Readonly<Record<string, string>>): string | undefined {
  if (lemma !== 'ἀγαπάω' || morph.VerbForm !== 'Fin' || morph.Voice !== 'Act' || morph.Mood !== 'Ind') return undefined;
  const form = clean(surface);
  if (form === 'ἀγαπῶ' && morph.Tense === 'Pres' && morph.Person === '1' && morph.Number === 'Sing') return 'I love';
  if (form === 'ἀγαπήσω' && morph.Tense === 'Fut' && morph.Person === '1' && morph.Number === 'Sing') return 'I will love';
  if (form === 'ἀγαπήσεις' && morph.Tense === 'Fut' && morph.Person === '2' && morph.Number === 'Sing') return 'You will love';
  if (form === 'ἀγαπᾷ' && morph.Tense === 'Pres' && morph.Person === '3' && morph.Number === 'Sing') return 'He, she, or it loves';
  return undefined;
}

export function greekWordAnalysis(input: GreekWordAnalysisInput): WordAnalysis {
  const morph = input.morph ?? {};
  const source = input.source;
  const inflectedText = greekInflectedMeaning(input.surface, input.lemma, morph);
  const alternatives = (input.alternatives ?? []).filter((a) =>
    a.lemma !== input.lemma || a.pos !== input.pos || JSON.stringify(a.morph) !== JSON.stringify(morph)).map((a) => {
    if ((a.lemma && a.lemma !== input.lemma) || (a.pos && a.pos !== input.pos)) return `${a.lemma ?? 'another lexeme'} (${a.pos ?? 'unclassified'}; ${Object.entries(a.morph).map(([k, v]) => `${k}=${v}`).join(', ') || 'no morphology'})`;
    return greekInflectedMeaning(input.surface, input.lemma, a.morph)
      ?? `Alternative reading (${Object.entries(a.morph).map(([k, v]) => `${k}=${v}`).join(', ') || 'no morphology'})`;
  });
  const meanings = [...new Set([...(inflectedText ? [inflectedText] : []), ...alternatives])];
  const ambiguity = alternatives.length ? meanings : [];
  const gal514 = (input.references ?? []).some((r) => r.toUpperCase() === 'GAL.5.14')
    && !!inflectedText && clean(input.surface) === 'ἀγαπήσεις' && morph.Tense === 'Fut' && morph.Person === '2' && morph.Number === 'Sing';
  return projectWordAnalysis({
    language: 'el', surface: input.surface, lemma: input.lemma ?? null, pos: input.pos ?? null,
    lexicalMeaning: input.lemmaGloss ? { text: input.lemmaGloss, source, confidence: input.confidence } : null,
    grammaticalFeatures: Object.entries(morph).map(([key, value]) => ({ key, value, ...(source ? { source } : {}), confidence: input.confidence, ...(ambiguity.length ? { ambiguity } : {}) })),
    inflectedMeaning: inflectedText ? { text: inflectedText, ...(source ? { source } : {}), confidence: input.confidence, ...(ambiguity.length ? { ambiguity } : {}) } : null,
    contextualMeaning: gal514 ? { text: 'You shall love', source: 'Galatians 5:14', confidence: input.confidence } : null,
    sentenceContext: input.sentence ? { text: input.sentence, ...(gal514 ? { source: 'Galatians 5:14' } : {}), confidence: 1 } : null,
    references: (input.references ?? []).map((r) => ({ label: r.toUpperCase() === 'GAL.5.14' ? 'Galatians 5:14' : r, ...(r.toUpperCase() === 'GAL.5.14' ? { source: 'SBL Greek New Testament' } : {}), uri: r })),
    confidence: input.confidence, ambiguity,
  });
}

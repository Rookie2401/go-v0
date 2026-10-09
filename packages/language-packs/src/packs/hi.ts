import { plannedManifest } from './planned';
import type { PackManifest } from '../manifest';

/** Planned: Hindi (Devanagari). Adapter version 6 (checked against src/adapters/hi.ts by test/language-packs/planned.test.ts). */
export const HI_VERSION = '6';

export function hindiManifest(): PackManifest {
  return plannedManifest({
    languageId: 'hi', version: HI_VERSION, varietyId: 'hi-standard', scriptId: 'Deva', name: 'Hindi', nativeName: 'हिन्दी',
    varieties: [
      { varietyId: 'hi-standard', label: 'Modern Standard Hindi', analysed: true },
      { varietyId: 'awa', label: 'Awadhi (heritage: read beside Hindi, its own language)', analysed: false },
      { varietyId: 'bra', label: 'Braj (heritage: read beside Hindi, its own language)', analysed: false },
    ],
    dictionary: { entries: 38635, frequency: true },
    adapterSummary: 'seed-only lemmatization (a hand list of about 1,500 lemmas and the closed classes), limited rule-based morphology, compound verbs and postpositions as phrase units.',
    capabilities: ['tokenization', 'sentence-segmentation', 'lemma', 'morphology', 'phrases', 'constructions'],
    features: [
      { key: 'Gender', label: 'Gender', values: { Masc: 'masculine', Fem: 'feminine' }, explain: 'Nouns are masculine or feminine; adjectives ending in -ā and verbs agree with them.' },
      { key: 'Case', label: 'Case', values: { Dir: 'direct', Obl: 'oblique' }, explain: 'A noun takes its oblique form before a postposition.' },
    ],
    constructions: [
      { id: 'postposition', label: 'Postposition', explain: 'Hindi puts a small word after the noun (में “in”, को “to”), where English puts a preposition before it.' },
    ],
    voices: ['hi-IN-SwaraNeural', 'hi-IN-MadhurNeural'],
    segmentation: { method: 'adapter', notes: 'Intl.Segmenter for Hindi; matras, nukta and virama stay inside a token.' },
  });
}

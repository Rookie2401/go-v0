import { plannedManifest } from './planned';
import type { PackManifest } from '../manifest';

/** Planned: Norwegian Nynorsk. Adapter version 2 (checked against src/adapters/nn.ts by test/language-packs/planned.test.ts). */
export const NN_VERSION = '2';

export function nynorskManifest(): PackManifest {
  return plannedManifest({
    languageId: 'nn', version: NN_VERSION, varietyId: 'nn', scriptId: 'Latn', name: 'Norwegian (Nynorsk)', nativeName: 'norsk nynorsk',
    varieties: [
      { varietyId: 'nn', label: 'Nynorsk (the written standard of this pack)', writtenStandard: 'nn', analysed: true },
      { varietyId: 'nn-landsmal', label: 'Landsmål (older form of Nynorsk)', writtenStandard: 'nn', analysed: true },
    ],
    adapterSummary: 'seed-only lemmatization and limited rule-based morphology for Nynorsk; concept families relate eg (Nynorsk) to jeg (Bokmål) without crediting one for the other.',
    capabilities: ['tokenization', 'sentence-segmentation', 'lemma', 'morphology', 'phrases', 'constructions'],
    features: [
      { key: 'Gender', label: 'Gender', values: { Masc: 'masculine', Fem: 'feminine', Neut: 'neuter' }, explain: 'Nynorsk keeps three genders (ein, ei, eit) and the definite ending follows the gender.' },
    ],
    constructions: [
      { id: 'definite-suffix', label: 'Definite ending', explain: 'Nynorsk adds “the” to the end of the noun: ei bok, boka.' },
    ],
    voices: [],
    segmentation: { method: 'adapter', notes: 'Intl.Segmenter for Norwegian; compounds stay one token.' },
    extraProvenance: [
      'Norwegian has two written standards. This pack is Nynorsk (writtenStandard "nn"). No Azure voice for Nynorsk is known to be offered, so no remote voice is named; nothing may be read aloud in Bokmål in its place without the learner choosing that.',
    ],
  });
}

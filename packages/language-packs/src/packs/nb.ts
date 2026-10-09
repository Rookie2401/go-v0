import { plannedManifest } from './planned';
import type { PackManifest } from '../manifest';

/** Planned: Norwegian Bokmål. Adapter version 2 (checked against src/adapters/nb.ts by test/language-packs/planned.test.ts). */
export const NB_VERSION = '2';

export function bokmalManifest(): PackManifest {
  return plannedManifest({
    languageId: 'nb', version: NB_VERSION, varietyId: 'nb', scriptId: 'Latn', name: 'Norwegian (Bokmål)', nativeName: 'norsk bokmål',
    varieties: [
      { varietyId: 'nb', label: 'Bokmål (the written standard of this pack)', writtenStandard: 'nb', analysed: true },
      { varietyId: 'nb-riksmal', label: 'Riksmål (older form of Bokmål)', writtenStandard: 'nb', analysed: true },
    ],
    adapterSummary: 'seed-only lemmatization and limited rule-based morphology for Bokmål; concept families relate jeg (Bokmål) to eg (Nynorsk) without crediting one for the other.',
    capabilities: ['tokenization', 'sentence-segmentation', 'lemma', 'morphology', 'phrases', 'constructions'],
    features: [
      { key: 'Gender', label: 'Gender', values: { Masc: 'masculine', Fem: 'feminine', Neut: 'neuter' }, explain: 'Bokmål nouns are en (masculine or feminine) or et (neuter); the definite ending follows the gender.' },
    ],
    constructions: [
      { id: 'definite-suffix', label: 'Definite ending', explain: 'Norwegian adds “the” to the end of the noun: en bok, boken.' },
    ],
    voices: ['nb-NO-PernilleNeural', 'nb-NO-FinnNeural'],
    segmentation: { method: 'adapter', notes: 'Intl.Segmenter for Norwegian; compounds stay one token.' },
    extraProvenance: [
      'Norwegian has two written standards. This pack is Bokmål (writtenStandard "nb") and never credits Nynorsk words to it: a learner chooses a written standard explicitly (see TEAMS, team norway); jeg and eg are related, not merged.',
    ],
  });
}

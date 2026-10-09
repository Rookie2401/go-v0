import { plannedManifest } from './planned';
import type { PackManifest } from '../manifest';

/** Planned: German. Adapter version 9 (checked against src/adapters/de.ts by test/language-packs/planned.test.ts). */
export const DE_VERSION = '9';

export function germanManifest(): PackManifest {
  return plannedManifest({
    languageId: 'de', version: DE_VERSION, varietyId: 'de-DE', scriptId: 'Latn', name: 'German', nativeName: 'Deutsch',
    varieties: [
      { varietyId: 'de-DE', label: 'Germany (Standard German)', analysed: true },
      { varietyId: 'de-AT', label: 'Austria', analysed: true },
      { varietyId: 'de-CH', label: 'Switzerland', analysed: true },
    ],
    dictionary: { entries: 357750, frequency: true },
    adapterSummary: 'seed-only lemmatization (a word list of about 2,900 entries and the closed classes), limited morphology with case / gender / number cells, compound parts reported.',
    capabilities: ['tokenization', 'sentence-segmentation', 'lemma', 'morphology', 'phrases', 'constructions'],
    features: [
      { key: 'Case', label: 'Case', values: { Nom: 'nominative', Acc: 'accusative', Dat: 'dative', Gen: 'genitive' }, explain: 'The article and the adjective ending show the noun’s job in the sentence.' },
      { key: 'Gender', label: 'Gender', values: { Masc: 'masculine', Fem: 'feminine', Neut: 'neuter' }, explain: 'Every noun is der, die or das; articles and adjectives agree with it.' },
    ],
    constructions: [
      { id: 'separable-verb', label: 'Separable verb', explain: 'A prefix such as auf- goes to the end of the clause: steht … auf is aufstehen.' },
    ],
    voices: ['de-DE-KatjaNeural', 'de-DE-ConradNeural'],
    segmentation: { method: 'adapter', notes: 'Intl.Segmenter for German; a compound stays one token and its parts are reported separately.' },
  });
}

import { plannedManifest } from './planned';
import type { PackManifest } from '../manifest';

/** Planned: Thai. Adapter version 5 (checked against src/adapters/th.ts by test/language-packs/planned.test.ts). */
export const TH_VERSION = '5';

export function thaiManifest(): PackManifest {
  return plannedManifest({
    languageId: 'th', version: TH_VERSION, varietyId: 'th-standard', scriptId: 'Thai', name: 'Thai', nativeName: 'ไทย',
    varieties: [{ varietyId: 'th-standard', label: 'Standard (Central) Thai', analysed: true }],
    dictionary: { entries: 20254, frequency: true },
    adapterSummary: 'seed-only lemmatization (a hand lexicon of about 600 entries), no inflection to analyse, listed phrase units; word and sentence segmentation are limited and Thai has no word spaces.',
    capabilities: ['tokenization', 'sentence-segmentation', 'lemma', 'phrases', 'script-decoding', 'constructions'],
    features: [
      { key: 'Class', label: 'Classifier', values: { Cl: 'classifier' }, explain: 'Counting nouns need a classifier word between the number and the noun.' },
    ],
    constructions: [
      { id: 'classifier-phrase', label: 'Number + classifier', explain: 'The number goes before the classifier, not before the noun alone: สอง คน, “two people”.' },
    ],
    voices: ['th-TH-PremwadeeNeural', 'th-TH-NiwatNeural'],
    segmentation: { method: 'intl', notes: 'Thai has no spaces: ICU dictionary segmentation through Intl.Segmenter, plus a short course compound list; segmentation is limited and not measured on real prose.' },
    extraProvenance: ['Thai segmentation is the weakest part of the existing adapter: where a compound splits can differ from what a learner expects.'],
  });
}

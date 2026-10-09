import { plannedManifest } from './planned';
import type { PackManifest } from '../manifest';

/** Planned: Spanish (Honduran target). Adapter version 12 (checked against src/adapters/es.ts by test/language-packs/planned.test.ts). */
export const ES_VERSION = '12';

export function spanishManifest(): PackManifest {
  return plannedManifest({
    languageId: 'es', version: ES_VERSION, varietyId: 'es-HN', scriptId: 'Latn', name: 'Spanish', nativeName: 'español',
    varieties: [
      { varietyId: 'es-HN', label: 'Honduras (target of the course)', analysed: true, note: 'voseo is an active feature of this target' },
      { varietyId: 'es-419', label: 'Latin America (general)', analysed: true },
      { varietyId: 'es-ES', label: 'Spain (recognise, not the default)', analysed: true },
    ],
    dictionary: { entries: 808278, frequency: true },
    adapterSummary: 'seed-only lemmatization (a hand list of about 1,500 lemmas and the closed classes), limited rule-based morphology including voseo and attached pronouns, listed phrase units.',
    capabilities: ['tokenization', 'sentence-segmentation', 'lemma', 'morphology', 'phrases', 'constructions'],
    features: [
      { key: 'Person', label: 'Person', values: { '1': 'first', '2': 'second', '3': 'third' }, explain: 'Who does the action; the verb ending shows it, so the subject pronoun is often left out.' },
      { key: 'Mood', label: 'Mood', values: { Ind: 'indicative', Sub: 'subjunctive', Imp: 'imperative' }, explain: 'Whether the verb states a fact, expresses doubt or wish, or gives a command.' },
    ],
    constructions: [
      { id: 'voseo', label: 'Voseo', explain: 'In Honduras vos is used for “you” (informal) with its own verb endings: vos tenés.' },
    ],
    voices: ['es-HN-CarlosNeural', 'es-HN-KarlaNeural'],
    segmentation: { method: 'adapter', notes: 'Intl.Segmenter for Spanish; ¿ ¡ and dialogue dashes are handled by the adapter.' },
  });
}

import { experimentalManifest } from './experimental';
import { LA_TUTORIAL } from '../tutorial/la';
import type { PackManifest, ValidationCase } from '../manifest';

/** Experimental: Latin (Clementine-Vulgate orthography). Adapter version 1 (checked against src/adapters/la.ts by test/language-packs/registry.test.ts). */
export const LA_VERSION = '1';

/**
 * The dictionary this pack declares (public/dict/la/manifest.json is the source of truth: test/language-packs/latin.test.ts compares the
 * two when the built dictionary is on disk, so a rebuild that changes either must change both).
 */
export const LA_DICTIONARY = { id: 'kaikki-la@2026-10-17', entries: 997266, frequency: false };

/**
 * Real selections the experimental pack must read as stated, each as adapter-la@1 really reads it: a word the hand list states
 * (principio, Dominus, regit) is 'high-confidence'; a form only the rules generate (deerit, from desum) stays 'provisional'; a form
 * whose ending serves several cases keeps them as a union (Verbum: 'Acc,Nom,Voc'); factum (a participle that is also a noun and a
 * supine) and Hoc keep their competing readings and are 'conflicted'; a word the list does not hold has no reading at all.
 * The sentences are the Clementine Vulgate's own (John 1:1 and 1:14, Psalm 22:1), so a learner meets the same words in the corpus.
 */
export const LA_VALIDATION: ValidationCase[] = [
  { id: 'v-principio', surface: 'principio', sentence: 'In principio erat Verbum, et Verbum erat apud Deum.', expect: { lemma: 'principium', pos: 'NOUN', features: { Case: 'Abl', Number: 'Sing', Gender: 'Neut' }, status: 'high-confidence' } },
  { id: 'v-erat', surface: 'erat', sentence: 'In principio erat Verbum, et Verbum erat apud Deum.', expect: { lemma: 'sum', pos: 'AUX', features: { Tense: 'Imp', Person: '3', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-verbum', surface: 'Verbum', sentence: 'In principio erat Verbum, et Verbum erat apud Deum.', expect: { lemma: 'verbum', pos: 'NOUN', features: { Case: 'Acc,Nom,Voc', Gender: 'Neut' }, status: 'high-confidence' } },
  { id: 'v-et', surface: 'et', sentence: 'In principio erat Verbum, et Verbum erat apud Deum.', expect: { lemma: 'et', pos: 'CONJ', status: 'high-confidence' } },
  { id: 'v-apud', surface: 'apud', sentence: 'In principio erat Verbum, et Verbum erat apud Deum.', expect: { lemma: 'apud', pos: 'ADP', status: 'high-confidence' } },
  { id: 'v-deum', surface: 'Deum', sentence: 'In principio erat Verbum, et Verbum erat apud Deum.', expect: { lemma: 'deus', pos: 'NOUN', features: { Case: 'Acc', Gender: 'Masc' }, status: 'high-confidence' } },
  { id: 'v-dominus', surface: 'Dominus', sentence: 'Dominus regit me, et nihil mihi deerit.', expect: { lemma: 'dominus', pos: 'NOUN', features: { Case: 'Nom', Gender: 'Masc' }, status: 'high-confidence' } },
  { id: 'v-regit', surface: 'regit', sentence: 'Dominus regit me, et nihil mihi deerit.', expect: { lemma: 'rego', pos: 'VERB', features: { Tense: 'Pres', Person: '3', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-me', surface: 'me', sentence: 'Dominus regit me, et nihil mihi deerit.', expect: { lemma: 'ego', pos: 'PRON', features: { Case: 'Abl,Acc', Person: '1' }, status: 'high-confidence' } },
  { id: 'v-mihi', surface: 'mihi', sentence: 'Dominus regit me, et nihil mihi deerit.', expect: { lemma: 'ego', pos: 'PRON', features: { Case: 'Dat', Person: '1' }, status: 'high-confidence' } },
  { id: 'v-deerit', surface: 'deerit', sentence: 'Dominus regit me, et nihil mihi deerit.', expect: { lemma: 'desum', pos: 'VERB', features: { Tense: 'Fut', Person: '3' }, status: 'provisional' } },
  { id: 'v-caro', surface: 'caro', sentence: 'Et verbum caro factum est, et habitavit in nobis.', expect: { lemma: 'caro', pos: 'NOUN', features: { Case: 'Nom,Voc', Gender: 'Fem' }, status: 'high-confidence' } },
  { id: 'v-factum', surface: 'factum', sentence: 'Et verbum caro factum est, et habitavit in nobis.', expect: { lemma: 'facio', pos: 'VERB', features: { VerbForm: 'Part', Tense: 'Perf' }, status: 'conflicted' } },
  { id: 'v-habitavit', surface: 'habitavit', sentence: 'Et verbum caro factum est, et habitavit in nobis.', expect: { lemma: 'habito', pos: 'VERB', features: { Tense: 'Perf', Person: '3', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-nobis', surface: 'nobis', sentence: 'Et verbum caro factum est, et habitavit in nobis.', expect: { lemma: 'ego', pos: 'PRON', features: { Case: 'Abl', Number: 'Plur', Person: '1' }, status: 'high-confidence' } },
  { id: 'v-hoc', surface: 'Hoc', sentence: 'Hoc erat in principio apud Deum.', expect: { lemma: 'hic', pos: 'PRON', status: 'conflicted' } },
  { id: 'v-xyzqwk', surface: 'Xyzqwk', sentence: 'Xyzqwk Deus est.', expect: { readings: 'none', status: 'provisional' } },
];

export function latinManifest(): PackManifest {
  return experimentalManifest({
    languageId: 'la', version: LA_VERSION, varietyId: 'la-ecclesiastical', scriptId: 'Latn', name: 'Latin', nativeName: 'Latina',
    varieties: [
      { varietyId: 'la-ecclesiastical', label: 'Ecclesiastical Latin (Clementine Vulgate spelling)', analysed: true },
      { varietyId: 'la-classical', label: 'Classical Latin (read beside the Vulgate: same word list, not analysed as a variety of its own)', analysed: false },
    ],
    dictionary: LA_DICTIONARY,
    adapterSummary: 'seed-only lemmatization (a hand word list and the closed classes), limited rule-based morphology, listed phrase units and ten sentence patterns, rule-based pronunciation notes, Clementine-Vulgate orthography (ae/oe ligatures, i/j and u/v as printed, macrons ignored).',
    capabilities: ['tokenization', 'sentence-segmentation', 'lemma', 'morphology', 'phrases', 'constructions'],
    features: [
      { key: 'Case', label: 'Case', values: { Nom: 'nominative', Gen: 'genitive', Dat: 'dative', Acc: 'accusative', Abl: 'ablative', Voc: 'vocative' }, explain: 'A Latin noun changes its ending for its job in the sentence; the same ending can serve several cases, so a form often has more than one reading.' },
      { key: 'Gender', label: 'Gender', values: { Masc: 'masculine', Fem: 'feminine', Neut: 'neuter' }, explain: 'Every noun has a gender, and adjectives and participles agree with it.' },
    ],
    constructions: [
      { id: 'ablative-absolute', label: 'Ablative absolute', explain: 'A noun and a participle (or adjective) both in the ablative, set apart from the rest of the sentence, say when or why: Deo duce, “with God leading”.' },
      { id: 'cum-subjunctive', label: 'cum + subjunctive', explain: 'Cum with a subjunctive verb usually means “when” or “since”, or “although”, and describes the circumstances.' },
      { id: 'cum-indicative', label: 'cum + indicative', explain: 'Cum with an indicative verb is a plain “when”, or “whenever”.' },
      { id: 'ut-indicative', label: 'ut + indicative', explain: 'Ut with an indicative verb means “as” or “when”, not purpose or result.' },
      { id: 'ne-purpose', label: 'ne + subjunctive', explain: 'Ne with a subjunctive verb says what is to be avoided: “so that not”, “lest”.' },
      { id: 'gerundive', label: 'Gerundive', explain: 'A verbal adjective in -ndus that means “to be done”, agreeing with its noun.' },
      { id: 'gerund', label: 'Gerund', explain: 'A verbal noun in -ndi, -ndo, -ndum that names the action: ars amandi, “the art of loving”.' },
      { id: 'passive-periphrastic', label: 'Passive periphrastic', explain: 'The gerundive with a form of sum says what must be done: Carthago delenda est, “Carthage must be destroyed”.' },
      { id: 'gerundive-purpose', label: 'ad + gerundive', explain: 'Ad with an accusative gerundive says the purpose: ad portandum, “for carrying”.' },
      { id: 'deponent', label: 'Deponent verb', explain: 'A verb with passive endings and an active meaning: loquor, “I speak”, not “I am spoken”.' },
    ],
    voices: [],
    segmentation: { method: 'adapter', notes: 'Words are runs of letters; ae/oe ligatures and macrons stay inside their words, and a trailing -que, -ne or -ve is left joined to its word.' },
    validation: LA_VALIDATION,
    pronunciationNotes: true,
    tutorial: { ref: LA_TUTORIAL.ref, estimatedMinutes: LA_TUTORIAL.estimatedMinutes },
    thin: [
      'lemmatization is seed-only (a word outside the list gets an inferred reading marked as a guess, or none);',
      'many Latin forms are written alike (the same ending serves several cases), and the pack keeps every reading rather than choosing one;',
      'the spelling is the Clementine Vulgate’s; other editions and classical spelling are read through the same word list and have not been measured;',
      'nothing has been measured on running prose, only on short sentences written by the same authors.',
    ],
    extraProvenance: ['Latin: ported analyser, Clementine-Vulgate orthography, unreviewed.', 'Latin is no one’s first language: there is no native speaker to review this pack. The review it needs is a Latinist’s.'],
  });
}

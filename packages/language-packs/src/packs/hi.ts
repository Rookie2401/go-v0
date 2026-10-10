import { experimentalManifest } from './experimental';
import { HI_TUTORIAL } from '../tutorial/hi';
import type { PackManifest, ValidationCase } from '../manifest';

/** Experimental: Hindi (Devanagari). Adapter version 6 (checked against src/adapters/hi.ts by test/language-packs/registry.test.ts). */
export const HI_VERSION = '6';

/**
 * Real selections the experimental pack must read as stated, each as adapter-hi@6 really reads it: a hand-listed form is
 * 'high-confidence'; a form only the rules generate (लड़कों) stays 'provisional'; the written-alike words पर, गया and
 * विद्यार्थी keep their competing readings and are 'conflicted'; an unknown word has no reading at all.
 */
export const HI_VALIDATION: ValidationCase[] = [
  { id: 'v-kitab', surface: 'किताब', sentence: 'मैं हर दिन किताब पढ़ता हूँ।', expect: { lemma: 'किताब', pos: 'NOUN', features: { Gender: 'Fem', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-padhta', surface: 'पढ़ता', sentence: 'मैं हर दिन किताब पढ़ता हूँ।', expect: { lemma: 'पढ़ना', pos: 'VERB', features: { VerbForm: 'Part', Aspect: 'Imp', Gender: 'Masc', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-hun', surface: 'हूँ', sentence: 'मैं हर दिन किताब पढ़ता हूँ।', expect: { lemma: 'होना', pos: 'AUX', features: { Person: '1', Number: 'Sing', Tense: 'Pres' }, status: 'high-confidence' } },
  { id: 'v-main', surface: 'मैं', sentence: 'मैं हर दिन किताब पढ़ता हूँ।', expect: { lemma: 'मैं', pos: 'PRON', features: { Person: '1', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-mein', surface: 'में', sentence: 'यह लड़का घर में है।', expect: { lemma: 'में', pos: 'ADP', status: 'high-confidence' } },
  { id: 'v-ghar', surface: 'घर', sentence: 'यह लड़का घर में है।', expect: { lemma: 'घर', pos: 'NOUN', features: { Gender: 'Masc' }, status: 'high-confidence' } },
  { id: 'v-mez', surface: 'मेज़', sentence: 'मेज़ पर एक किताब है।', expect: { lemma: 'मेज़', pos: 'NOUN', features: { Gender: 'Fem', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-par', surface: 'पर', sentence: 'मेज़ पर एक किताब है।', expect: { lemma: 'पर', pos: 'ADP', status: 'conflicted' } },
  { id: 'v-ne', surface: 'ने', sentence: 'लड़की ने रोटी खाई।', expect: { lemma: 'ने', pos: 'ADP', features: { Case: 'Erg' }, status: 'high-confidence' } },
  { id: 'v-roti', surface: 'रोटी', sentence: 'लड़की ने रोटी खाई।', expect: { lemma: 'रोटी', pos: 'NOUN', features: { Gender: 'Fem', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-ladkon', surface: 'लड़कों', sentence: 'लड़कों ने खेल खेला।', expect: { lemma: 'लड़का', pos: 'NOUN', features: { Gender: 'Masc', Number: 'Plur', Case: 'Obl' }, status: 'provisional' } },
  { id: 'v-vidyarthi', surface: 'विद्यार्थी', sentence: 'विद्यार्थी स्कूल जाते हैं।', expect: { lemma: 'विद्यार्थी', pos: 'NOUN', status: 'conflicted' } },
  { id: 'v-gaya', surface: 'गया', sentence: 'वह घर चला गया।', expect: { lemma: 'जाना', pos: 'VERB', features: { VerbForm: 'Part', Aspect: 'Perf' }, status: 'conflicted' } },
  { id: 'v-unknown', surface: 'Xyzqwk', sentence: 'Xyzqwk किताब है।', expect: { readings: 'none', status: 'provisional' } },
];

export function hindiManifest(): PackManifest {
  return experimentalManifest({
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
      { key: 'Case', label: 'Case', values: { Dir: 'direct', Obl: 'oblique', Erg: 'ergative' }, explain: 'A noun takes its oblique form before a postposition.' },
    ],
    constructions: [
      { id: 'postposition-after-noun', label: 'Postposition', explain: 'Hindi puts a small word after the noun (में “in”, को “to”), where English puts a preposition before it.' },
    ],
    voices: ['hi-IN-SwaraNeural', 'hi-IN-MadhurNeural'],
    segmentation: { method: 'adapter', notes: 'Intl.Segmenter for Hindi; matras, nukta and virama stay inside a token.' },
    validation: HI_VALIDATION,
    pronunciationNotes: true,
    tutorial: { ref: HI_TUTORIAL.ref, estimatedMinutes: HI_TUTORIAL.estimatedMinutes },
    thin: [
      'lemmatization is seed-only (a word outside the list gets an inferred reading marked as a guess, or none);',
      'words written alike in two ways (पर, की, खाना) keep every reading and are not resolved by a parser;',
      'nothing has been measured on running prose, only on seed texts and tests written by the same authors;',
      'the grammar tables explain only Gender and Case, though the analyser also writes Number, Aspect, Tense, Person and VerbForm.',
    ],
  });
}

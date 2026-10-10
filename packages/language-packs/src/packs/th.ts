import { experimentalManifest } from './experimental';
import { TH_TUTORIAL } from '../tutorial/th';
import type { PackManifest, ValidationCase } from '../manifest';

/** Experimental: Thai. Adapter version 5 (checked against src/adapters/th.ts by test/language-packs/registry.test.ts). */
export const TH_VERSION = '5';

/**
 * Real selections the experimental pack must read as stated, each as adapter-th@5 really reads it. Thai has no
 * inflection, so a reading carries a lemma and a part of speech but no features; every word below is in the hand lexicon
 * (so 'high-confidence'); a word outside it, such as the Latin-script coffee inside a Thai sentence, has no reading.
 */
export const TH_VALIDATION: ValidationCase[] = [
  { id: 'v-khao', surface: 'ข้าว', sentence: 'ฉันกินข้าวที่บ้านทุกวัน', expect: { lemma: 'ข้าว', pos: 'NOUN', status: 'high-confidence' } },
  { id: 'v-kin', surface: 'กิน', sentence: 'ฉันกินข้าวที่บ้านทุกวัน', expect: { lemma: 'กิน', pos: 'VERB', status: 'high-confidence' } },
  { id: 'v-chan', surface: 'ฉัน', sentence: 'ฉันกินข้าวที่บ้านทุกวัน', expect: { lemma: 'ฉัน', pos: 'PRON', status: 'high-confidence' } },
  { id: 'v-baan', surface: 'บ้าน', sentence: 'ฉันกินข้าวที่บ้านทุกวัน', expect: { lemma: 'บ้าน', pos: 'NOUN', status: 'high-confidence' } },
  { id: 'v-thi', surface: 'ที่', sentence: 'ฉันกินข้าวที่บ้านทุกวัน', expect: { lemma: 'ที่', pos: 'SCONJ', status: 'high-confidence' } },
  { id: 'v-wan', surface: 'วัน', sentence: 'ฉันกินข้าวที่บ้านทุกวัน', expect: { lemma: 'วัน', pos: 'NOUN', status: 'high-confidence' } },
  { id: 'v-rongrian', surface: 'โรงเรียน', sentence: 'เขาไปโรงเรียนแล้วครับ', expect: { lemma: 'โรงเรียน', pos: 'NOUN', status: 'high-confidence' } },
  { id: 'v-laeo', surface: 'แล้ว', sentence: 'เขาไปโรงเรียนแล้วครับ', expect: { lemma: 'แล้ว', pos: 'ADV', status: 'high-confidence' } },
  { id: 'v-khrap', surface: 'ครับ', sentence: 'เขาไปโรงเรียนแล้วครับ', expect: { lemma: 'ครับ', pos: 'PART', status: 'high-confidence' } },
  { id: 'v-pai', surface: 'ไป', sentence: 'เขาไปโรงเรียนแล้วครับ', expect: { lemma: 'ไป', pos: 'VERB', status: 'high-confidence' } },
  { id: 'v-kha', surface: 'คะ', sentence: 'คุณชื่ออะไรคะ', expect: { lemma: 'คะ', pos: 'PART', status: 'high-confidence' } },
  { id: 'v-arai', surface: 'อะไร', sentence: 'คุณชื่ออะไรคะ', expect: { lemma: 'อะไร', pos: 'PRON', status: 'high-confidence' } },
  { id: 'v-thai', surface: 'ไทย', sentence: 'เธอพูดภาษาไทยได้ดีมาก ฉันชอบเธอ', expect: { lemma: 'ไทย', pos: 'PROPN', status: 'high-confidence' } },
  { id: 'v-unknown', surface: 'coffee', sentence: 'ฉันชอบ coffee มาก', expect: { readings: 'none', status: 'provisional' } },
];

export function thaiManifest(): PackManifest {
  return experimentalManifest({
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
    validation: TH_VALIDATION,
    pronunciationNotes: true,
    tutorial: { ref: TH_TUTORIAL.ref, estimatedMinutes: TH_TUTORIAL.estimatedMinutes },
    thin: [
      'lemmatization is seed-only (a hand lexicon of about 600 entries; any other word is left unanalysed);',
      'word segmentation is the weakest part: an unlisted compound can be cut where a learner does not expect it (คนใน for คน + ใน) and nothing has been measured on running prose;',
      'sentence breaks need a newline or two spaces; a single space is a clause pause;',
      'there is no inflection to analyse, so a reading carries a part of speech and a lemma but no morphology.',
    ],
    extraProvenance: ['Thai segmentation is the weakest part of the existing adapter: where a compound splits can differ from what a learner expects.'],
  });
}

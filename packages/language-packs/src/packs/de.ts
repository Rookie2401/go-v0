import { experimentalManifest } from './experimental';
import { DE_TUTORIAL } from '../tutorial/de';
import type { PackManifest, ValidationCase } from '../manifest';

/** Experimental: German. Adapter version 9 (checked against src/adapters/de.ts by test/language-packs/registry.test.ts). */
export const DE_VERSION = '9';

/**
 * Real selections the experimental pack must read as stated, each as adapter-de@9 really reads it: a closed-class form the
 * word list states directly (der, in, von) is 'high-confidence'; a noun or verb form the rules generate stays
 * 'provisional'; a noun case the sentence cannot decide stays a union ('Nom,Acc'); a stranded separable prefix (auf) is
 * read as the verb it belongs to (aufstehen) with the part of speech of the prefix.
 */
export const DE_VALIDATION: ValidationCase[] = [
  { id: 'v-buch', surface: 'Buch', sentence: 'Ich lese das Buch.', expect: { lemma: 'Buch', pos: 'NOUN', features: { Gender: 'Neut', Number: 'Sing', Case: 'Nom,Acc' }, status: 'provisional' } },
  { id: 'v-lese', surface: 'lese', sentence: 'Ich lese das Buch.', expect: { lemma: 'lesen', pos: 'VERB', features: { Person: '1', Number: 'Sing', Tense: 'Pres', Mood: 'Ind' }, status: 'provisional' } },
  { id: 'v-das', surface: 'das', sentence: 'Ich lese das Buch.', expect: { lemma: 'der', pos: 'DET', features: { Gender: 'Neut', Definite: 'Def' }, status: 'high-confidence' } },
  { id: 'v-dem', surface: 'dem', sentence: 'Die Frau gibt dem Mann das Buch.', expect: { lemma: 'der', pos: 'DET', features: { Case: 'Dat', Gender: 'Masc', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-mann', surface: 'Mann', sentence: 'Die Frau gibt dem Mann das Buch.', expect: { lemma: 'Mann', pos: 'NOUN', features: { Case: 'Dat', Gender: 'Masc' }, status: 'provisional' } },
  { id: 'v-gibt', surface: 'gibt', sentence: 'Die Frau gibt dem Mann das Buch.', expect: { lemma: 'geben', pos: 'VERB', features: { Person: '3', Number: 'Sing', Tense: 'Pres' }, status: 'provisional' } },
  { id: 'v-frau', surface: 'Frau', sentence: 'Die Frau gibt dem Mann das Buch.', expect: { lemma: 'Frau', pos: 'NOUN', features: { Gender: 'Fem', Case: 'Nom,Acc' }, status: 'provisional' } },
  { id: 'v-steht', surface: 'steht', sentence: 'Er steht früh auf.', expect: { lemma: 'aufstehen', pos: 'VERB', features: { Person: '3', Number: 'Sing', Tense: 'Pres' }, status: 'provisional' } },
  { id: 'v-auf', surface: 'auf', sentence: 'Er steht früh auf.', expect: { lemma: 'aufstehen', pos: 'ADP', status: 'provisional' } },
  { id: 'v-wohnzimmer', surface: 'Wohnzimmer', sentence: 'Das Wohnzimmer ist groß.', expect: { lemma: 'Wohnzimmer', pos: 'NOUN', features: { Gender: 'Neut', Case: 'Nom' }, status: 'provisional' } },
  { id: 'v-ist', surface: 'ist', sentence: 'Das Wohnzimmer ist groß.', expect: { lemma: 'sein', pos: 'AUX', features: { Person: '3', Number: 'Sing', Tense: 'Pres' }, status: 'provisional' } },
  { id: 'v-im', surface: 'im', sentence: 'Die Kinder spielen im Garten.', expect: { lemma: 'in', pos: 'ADP', status: 'high-confidence' } },
  { id: 'v-von', surface: 'von', sentence: 'Der Bahnhof ist weit von der Schule.', expect: { lemma: 'von', pos: 'ADP', status: 'high-confidence' } },
  { id: 'v-krankenhausrechnung', surface: 'Krankenhausrechnung', sentence: 'Sie hat eine Krankenhausrechnung bekommen.', expect: { lemma: 'Krankenhausrechnung', pos: 'NOUN', features: { Gender: 'Fem' }, status: 'provisional' } },
];

export function germanManifest(): PackManifest {
  return experimentalManifest({
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
      { id: 'separable-prefix-verb', label: 'Separable verb', explain: 'A prefix such as auf- goes to the end of the clause: steht … auf is aufstehen.' },
    ],
    voices: ['de-DE-KatjaNeural', 'de-DE-ConradNeural'],
    segmentation: { method: 'adapter', notes: 'Intl.Segmenter for German; a compound stays one token and its parts are reported separately.' },
    validation: DE_VALIDATION,
    pronunciationNotes: true,
    tutorial: { ref: DE_TUTORIAL.ref, estimatedMinutes: DE_TUTORIAL.estimatedMinutes },
    thin: [
      'lemmatization is seed-only (a word outside the list gets an inferred, unconfirmed reading or none);',
      'there is no parser, so a case the neighbours do not decide stays a union (Nom,Acc) rather than a guess;',
      'a compound is split only into words the list knows, and the split reading stays unconfirmed;',
      'a separated verb is put together only when its prefix ends the clause and the joined verb is in the list;',
      'the grammar tables explain only Case and Gender, though the analyser also writes Number, Tense, Mood and Person.',
    ],
  });
}

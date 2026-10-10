import { experimentalManifest } from './experimental';
import { NN_TUTORIAL } from '../tutorial/nn';
import type { PackManifest, ValidationCase } from '../manifest';

/** Experimental: Norwegian Nynorsk. Adapter version 2 (checked against src/adapters/nn.ts by test/language-packs/registry.test.ts). */
export const NN_VERSION = '2';

/**
 * Real selections the experimental pack must read as stated, each as adapter-nn@2 really reads it. Every sentence is owner-authored for this
 * pack and written in Nynorsk. A word the list holds is 'high-confidence'; a homograph the neighbours leave open (the article eit, the particle
 * verb står … opp) keeps its competing readings and is 'provisional'. The Nynorsk list is smaller than the Bokmål one: a word it lacks (kaffen)
 * has no reading, and that is stated in the thin parts rather than hidden here.
 */
export const NN_VALIDATION: ValidationCase[] = [
  { id: 'v-boka', surface: 'boka', sentence: 'Eg les boka kvar dag.', expect: { lemma: 'bok', pos: 'NOUN', features: { Gender: 'Fem', Number: 'Sing', Definite: 'Def' }, status: 'high-confidence' } },
  { id: 'v-les', surface: 'les', sentence: 'Eg les boka kvar dag.', expect: { lemma: 'lese', pos: 'VERB', features: { Tense: 'Pres', VerbForm: 'Fin' }, status: 'high-confidence' } },
  { id: 'v-eg', surface: 'Eg', sentence: 'Eg les boka kvar dag.', expect: { lemma: 'eg', pos: 'PRON', features: { Person: '1', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-borna', surface: 'Borna', sentence: 'Borna spelar i hagen.', expect: { lemma: 'barn', pos: 'NOUN', features: { Number: 'Plur', Definite: 'Def' }, status: 'high-confidence' } },
  { id: 'v-spelar', surface: 'spelar', sentence: 'Borna spelar i hagen.', expect: { lemma: 'spele', pos: 'VERB', features: { Tense: 'Pres', VerbForm: 'Fin' }, status: 'high-confidence' } },
  { id: 'v-jenta', surface: 'Jenta', sentence: 'Jenta har eit stort hus.', expect: { lemma: 'jente', pos: 'NOUN', features: { Gender: 'Fem', Number: 'Sing', Definite: 'Def' }, status: 'high-confidence' } },
  { id: 'v-eit', surface: 'eit', sentence: 'Jenta har eit stort hus.', expect: { lemma: 'ein', pos: 'DET', features: { Gender: 'Neut', Definite: 'Ind' }, status: 'provisional' } },
  { id: 'v-stort', surface: 'stort', sentence: 'Jenta har eit stort hus.', expect: { lemma: 'stor', pos: 'ADJ', features: { Gender: 'Neut', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-har-aux', surface: 'har', sentence: 'Han har ikkje kjøpt bilen enno.', expect: { lemma: 'ha', pos: 'AUX', features: { Tense: 'Pres' }, status: 'high-confidence' } },
  { id: 'v-kjopt', surface: 'kjøpt', sentence: 'Han har ikkje kjøpt bilen enno.', expect: { lemma: 'kjøpe', pos: 'VERB', features: { VerbForm: 'Part', Tense: 'Past' }, status: 'high-confidence' } },
  { id: 'v-ikkje', surface: 'ikkje', sentence: 'Han har ikkje kjøpt bilen enno.', expect: { lemma: 'ikkje', pos: 'ADV', features: { Polarity: 'Neg' }, status: 'high-confidence' } },
  { id: 'v-staar', surface: 'står', sentence: 'Ho står opp klokka sju.', expect: { lemma: 'stå opp', pos: 'VERB', features: { Tense: 'Pres', VerbForm: 'Fin' }, status: 'provisional' } },
  { id: 'v-raudt', surface: 'raudt', sentence: 'Eplet er raudt.', expect: { lemma: 'raud', pos: 'ADJ', features: { Gender: 'Neut', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-ligg', surface: 'ligg', sentence: 'Bøkene ligg på bordet.', expect: { lemma: 'liggje', pos: 'VERB', features: { Tense: 'Pres', VerbForm: 'Fin' }, status: 'high-confidence' } },
];

export function nynorskManifest(): PackManifest {
  return experimentalManifest({
    languageId: 'nn', version: NN_VERSION, varietyId: 'nn', scriptId: 'Latn', name: 'Norwegian (Nynorsk)', nativeName: 'norsk nynorsk',
    varieties: [
      { varietyId: 'nn', label: 'Nynorsk (the written standard of this pack)', writtenStandard: 'nn', analysed: true },
      { varietyId: 'nn-landsmal', label: 'Landsmål (older form of Nynorsk)', writtenStandard: 'nn', analysed: true },
    ],
    adapterSummary: 'seed-only lemmatization and limited rule-based morphology for Nynorsk (a machine-drafted word list smaller than the Bokmål one); concept families relate eg (Nynorsk) to jeg (Bokmål) without crediting one for the other.',
    capabilities: ['tokenization', 'sentence-segmentation', 'lemma', 'morphology', 'phrases', 'constructions'],
    features: [
      { key: 'Gender', label: 'Gender', values: { Masc: 'masculine', Fem: 'feminine', Neut: 'neuter' }, explain: 'Nynorsk keeps three genders (ein, ei, eit) and the definite ending follows the gender.' },
      { key: 'Definite', label: 'Definite ending', values: { Def: 'definite (“the”)', Ind: 'indefinite (“a”, no ending)' }, explain: 'Nynorsk adds “the” to the end of the noun: ei bok, boka; eit hus, huset; plural born, borna.' },
      { key: 'Tense', label: 'Tense', values: { Pres: 'present', Past: 'past' }, explain: 'The verb ending shows the tense and not the person: eg les, han les, vi les.' },
    ],
    constructions: [
      { id: 'perfect-har', label: 'Perfect with ha', explain: 'Har or hadde and a participle say what has happened: Han har ikkje kjøpt bilen.' },
      { id: 'modal-bare-infinitive', label: 'Modal verb and infinitive', explain: 'After skal, vil, kan, må or bør the verb stays in its infinitive, with no å: Vi skal reise.' },
      { id: 'particle-verb', label: 'Particle verb', explain: 'A verb and a small word that make one meaning: står opp is stå opp, “gets up”.' },
    ],
    voices: [],
    segmentation: { method: 'adapter', notes: 'Intl.Segmenter for Norwegian; compounds stay one token.' },
    validation: NN_VALIDATION,
    pronunciationNotes: true,
    tutorial: { ref: NN_TUTORIAL.ref, estimatedMinutes: NN_TUTORIAL.estimatedMinutes },
    thin: [
      'lemmatization is seed-only (a word outside the list gets an inferred, unconfirmed reading or none), and the Nynorsk list is smaller than the Bokmål one, so a common word such as kaffen can have no reading at all;',
      'there is no parser, so what the neighbouring words do not decide stays a list of readings, and some verbs are listed with both an -a and an -e infinitive;',
      'a compound is split only into words the list knows, and the split reading stays unconfirmed with no meaning;',
      'a particle verb is put together only when its particle is within four words after it;',
      'there is no dictionary for Norwegian in the repository, so meanings come from the word list only;',
      'the grammar tables explain only Gender, Definite and Tense, though the analyser also writes Number, Mood, VerbForm, Degree and Person.',
    ],
    extraProvenance: [
      'Norwegian has two written standards. This pack is Nynorsk (writtenStandard "nn"). No Azure voice for Nynorsk is known to be offered, so no remote voice is named; nothing may be read aloud in Bokmål in its place without the learner choosing that. A page that declares only "no" decides nothing between the two.',
    ],
  });
}

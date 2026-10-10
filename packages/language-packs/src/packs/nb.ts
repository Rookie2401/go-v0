import { experimentalManifest } from './experimental';
import { NB_TUTORIAL } from '../tutorial/nb';
import type { PackManifest, ValidationCase } from '../manifest';

/** Experimental: Norwegian Bokmål. Adapter version 2 (checked against src/adapters/nb.ts by test/language-packs/registry.test.ts). */
export const NB_VERSION = '2';

/**
 * Real selections the experimental pack must read as stated, each as adapter-nb@2 really reads it. Every sentence is owner-authored for this
 * pack. A word the list holds is 'high-confidence'; a homograph the neighbours leave open (har as a main verb, the particle verb står … opp)
 * keeps its competing readings and is 'provisional'; a compound the list does not hold is split into words it knows, marked unconfirmed and
 * 'provisional'. Both Bokmål feminine paradigms are valid, so a feminine noun such as bok is shown as 'Fem,Masc'.
 */
export const NB_VALIDATION: ValidationCase[] = [
  { id: 'v-boken', surface: 'boken', sentence: 'Jeg leser boken hver dag.', expect: { lemma: 'bok', pos: 'NOUN', features: { Gender: 'Fem,Masc', Number: 'Sing', Definite: 'Def' }, status: 'high-confidence' } },
  { id: 'v-leser', surface: 'leser', sentence: 'Jeg leser boken hver dag.', expect: { lemma: 'lese', pos: 'VERB', features: { Tense: 'Pres', VerbForm: 'Fin' }, status: 'high-confidence' } },
  { id: 'v-jeg', surface: 'Jeg', sentence: 'Jeg leser boken hver dag.', expect: { lemma: 'jeg', pos: 'PRON', features: { Person: '1', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-barna', surface: 'Barna', sentence: 'Barna spiller i hagen.', expect: { lemma: 'barn', pos: 'NOUN', features: { Number: 'Plur', Definite: 'Def' }, status: 'high-confidence' } },
  { id: 'v-hagen', surface: 'hagen', sentence: 'Barna spiller i hagen.', expect: { lemma: 'hage', pos: 'NOUN', features: { Gender: 'Masc', Number: 'Sing', Definite: 'Def' }, status: 'high-confidence' } },
  { id: 'v-jenta', surface: 'Jenta', sentence: 'Jenta har et stort hus.', expect: { lemma: 'jente', pos: 'NOUN', features: { Gender: 'Fem', Number: 'Sing', Definite: 'Def' }, status: 'high-confidence' } },
  { id: 'v-har-verb', surface: 'har', sentence: 'Jenta har et stort hus.', expect: { lemma: 'ha', pos: 'VERB', features: { Tense: 'Pres' }, status: 'provisional' } },
  { id: 'v-stort', surface: 'stort', sentence: 'Jenta har et stort hus.', expect: { lemma: 'stor', pos: 'ADJ', features: { Gender: 'Neut', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-hus', surface: 'hus', sentence: 'Jenta har et stort hus.', expect: { lemma: 'hus', pos: 'NOUN', features: { Gender: 'Neut', Definite: 'Ind' }, status: 'high-confidence' } },
  { id: 'v-har-aux', surface: 'har', sentence: 'Han har ikke kjøpt bilen ennå.', expect: { lemma: 'ha', pos: 'AUX', features: { Tense: 'Pres' }, status: 'high-confidence' } },
  { id: 'v-kjopt', surface: 'kjøpt', sentence: 'Han har ikke kjøpt bilen ennå.', expect: { lemma: 'kjøpe', pos: 'VERB', features: { VerbForm: 'Part', Tense: 'Past' }, status: 'high-confidence' } },
  { id: 'v-skal', surface: 'skal', sentence: 'Vi skal reise til Bergen i morgen.', expect: { lemma: 'skulle', pos: 'AUX', features: { Tense: 'Pres' }, status: 'high-confidence' } },
  { id: 'v-staar', surface: 'står', sentence: 'Hun står opp klokka sju.', expect: { lemma: 'stå opp', pos: 'VERB', features: { Tense: 'Pres', VerbForm: 'Fin' }, status: 'provisional' } },
  { id: 'v-sykehusregning', surface: 'sykehusregning', sentence: 'Hun fikk en sykehusregning.', expect: { lemma: 'sykehusregning', pos: 'NOUN', features: { Number: 'Sing', Definite: 'Ind' }, status: 'provisional' } },
];

export function bokmalManifest(): PackManifest {
  return experimentalManifest({
    languageId: 'nb', version: NB_VERSION, varietyId: 'nb', scriptId: 'Latn', name: 'Norwegian (Bokmål)', nativeName: 'norsk bokmål',
    varieties: [
      { varietyId: 'nb', label: 'Bokmål (the written standard of this pack)', writtenStandard: 'nb', analysed: true },
      { varietyId: 'nb-riksmal', label: 'Riksmål (older form of Bokmål)', writtenStandard: 'nb', analysed: true },
    ],
    adapterSummary: 'seed-only lemmatization and limited rule-based morphology for Bokmål (a machine-drafted word list of nouns, verbs, adjectives and the closed classes); concept families relate jeg (Bokmål) to eg (Nynorsk) without crediting one for the other.',
    capabilities: ['tokenization', 'sentence-segmentation', 'lemma', 'morphology', 'phrases', 'constructions'],
    features: [
      { key: 'Gender', label: 'Gender', values: { Masc: 'masculine', Fem: 'feminine', Neut: 'neuter' }, explain: 'Bokmål nouns are en (masculine or feminine) or et (neuter). A feminine noun may be written either way (en bok, boken or ei bok, boka), so the card shows it as feminine or masculine.' },
      { key: 'Definite', label: 'Definite ending', values: { Def: 'definite (“the”)', Ind: 'indefinite (“a”, no ending)' }, explain: 'Norwegian adds “the” to the end of the noun: en bok, boken; et hus, huset; plural barn, barna.' },
      { key: 'Tense', label: 'Tense', values: { Pres: 'present', Past: 'past' }, explain: 'The verb ending shows the tense and not the person: jeg leser, han leser, vi leser.' },
    ],
    constructions: [
      { id: 'perfect-har', label: 'Perfect with ha', explain: 'Har or hadde and a participle say what has happened: Han har ikke kjøpt bilen.' },
      { id: 'modal-bare-infinitive', label: 'Modal verb and infinitive', explain: 'After skal, vil, kan, må or bør the verb stays in its infinitive, with no å: Vi skal reise.' },
      { id: 'particle-verb', label: 'Particle verb', explain: 'A verb and a small word that make one meaning: står opp is stå opp, “gets up”.' },
    ],
    voices: ['nb-NO-PernilleNeural', 'nb-NO-FinnNeural'],
    segmentation: { method: 'adapter', notes: 'Intl.Segmenter for Norwegian; compounds stay one token.' },
    validation: NB_VALIDATION,
    pronunciationNotes: true,
    tutorial: { ref: NB_TUTORIAL.ref, estimatedMinutes: NB_TUTORIAL.estimatedMinutes },
    thin: [
      'lemmatization is seed-only (a word outside the list gets an inferred, unconfirmed reading or none);',
      'there is no parser, so what the neighbouring words do not decide stays a list of readings, and a feminine noun is shown as Fem,Masc because both Bokmål paradigms are valid;',
      'a compound is split only into words the list knows, and the split reading stays unconfirmed with no meaning;',
      'a particle verb is put together only when its particle is within four words after it, and after a modal the verb is sometimes still read as an imperative;',
      'there is no dictionary for Norwegian in the repository, so meanings come from the word list only;',
      'the grammar tables explain only Gender, Definite and Tense, though the analyser also writes Number, Mood, VerbForm, Degree and Person.',
    ],
    extraProvenance: [
      'Norwegian has two written standards. This pack is Bokmål (writtenStandard "nb") and never credits Nynorsk words to it: a learner chooses a written standard explicitly; jeg and eg are related, not merged. A page that declares only "no" decides nothing between the two.',
    ],
  });
}

import { experimentalManifest } from './experimental';
import { ARC_TUTORIAL } from '../tutorial/arc';
import type { PackManifest, ValidationCase } from '../manifest';

/** Experimental Biblical Aramaic only. Adapter version 1. */
export const ARC_VERSION = '1';

const DAN_2_4B = "מַלְכָּא֙ לְעָלְמִ֣ין חֱיִ֔י אֱמַ֥ר חֶלְמָ֛א לְעַבְדָ֖ךְ וּפִשְׁרָ֥א נְחַוֵּֽא׃";
const DAN_2_20 = "עָנֵ֤ה דָֽנִיֵּאל֙ וְאָמַ֔ר לֶהֱוֵ֨א שְׁמֵ֤הּ דִּֽי־אֱלָהָא֙ מְבָרַ֔ךְ מִן־עָלְמָ֖א וְעַ֣ד־עָלְמָ֑א דִּ֧י חָכְמְתָ֛א וּגְבוּרְתָ֖א דִּ֥י לֵֽהּ־הִֽיא׃";

export const ARC_VALIDATION: ValidationCase[] = [
  { id: 'v-mal-ka', surface: 'מַלְכָּא֙', sentence: DAN_2_4B, expect: { lemma: 'מֶלֶךְ', pos: 'NOUN', features: { Gender: 'Masc', Number: 'Sing', State: 'Det', Definite: 'Def' } } },
  { id: 'v-almin', surface: 'לְעָלְמִ֣ין', sentence: DAN_2_4B, expect: { pos: 'NOUN', features: { Number: 'Plur' } } },
  { id: 'v-hayi', surface: 'חֱיִ֔י', sentence: DAN_2_4B, expect: { lemma: 'חֲיָא', pos: 'VERB', features: { Binyan: 'Peal', Conj: 'Imp', Person: '2', Gender: 'Masc', Number: 'Sing' } } },
  { id: 'v-emar', surface: 'אֱמַ֥ר', sentence: DAN_2_4B, expect: { lemma: 'אֲמַר', pos: 'VERB', features: { Binyan: 'Peal', Conj: 'Imp', Person: '2', Gender: 'Masc', Number: 'Sing' } } },
  { id: 'v-helma', surface: 'חֶלְמָ֛א', sentence: DAN_2_4B, expect: { pos: 'NOUN', features: { Gender: 'Masc', Number: 'Sing', State: 'Det', Definite: 'Def' } } },
  { id: 'v-pishra', surface: 'וּפִשְׁרָ֥א', sentence: DAN_2_4B, expect: { pos: 'NOUN', features: { Gender: 'Masc', Number: 'Sing', State: 'Det', Definite: 'Def' } } },
  { id: 'v-nechavve', surface: 'נְחַוֵּֽא', sentence: DAN_2_4B, expect: { lemma: 'חֲוָא', pos: 'VERB', features: { Binyan: 'Pael', Conj: 'Impf', Person: '1', Gender: 'Com', Number: 'Plur' } } },
  { id: 'v-daniel', surface: 'דָֽנִיֵּאל֙', sentence: DAN_2_20, expect: { lemma: 'דָּנִיֵּאל', pos: 'PROPN' } },
  { id: 'v-amar', surface: 'וְאָמַ֔ר', sentence: DAN_2_20, expect: { pos: 'VERB', features: { Binyan: 'Peal', Conj: 'Part', Gender: 'Masc', Number: 'Sing' } } },
  { id: 'v-leheve', surface: 'לֶהֱוֵ֨א', sentence: DAN_2_20, expect: { pos: 'VERB', features: { Binyan: 'Peal', Conj: 'Impf', Person: '3', Gender: 'Masc', Number: 'Sing' } } },
  { id: 'v-shemeh', surface: 'שְׁמֵ֤הּ', sentence: DAN_2_20, expect: { pos: 'NOUN', features: { Gender: 'Masc', Number: 'Sing', State: 'Cons' } } },
  { id: 'v-di', surface: 'דִּֽי', sentence: DAN_2_20, expect: { lemma: 'דִּי' } },
  { id: 'v-elaha', surface: 'אֱלָהָא֙', sentence: DAN_2_20, expect: { pos: 'NOUN', features: { Gender: 'Masc', Number: 'Sing', State: 'Det', Definite: 'Def' } } },
];

export function aramaicManifest(): PackManifest {
  const manifest = experimentalManifest({
    languageId: 'arc', version: ARC_VERSION, varietyId: 'arc-bib', scriptId: 'Hebr',
    name: 'Aramaic', nativeName: 'אֲרָמִית', direction: 'rtl',
    varieties: [{ varietyId: 'arc-bib', label: 'Biblical Aramaic', analysed: true, note: 'Only the declared source slice: Daniel 2:4b and 2:20; kept separate from Hebrew.' }],
    adapterSummary: 'A deliberately small, experimental Biblical Aramaic analyser with readings restricted to Biblical Aramaic source forms; it does not label Hebrew readings as Aramaic.',
    capabilities: ['tokenization', 'sentence-segmentation', 'lemma', 'morphology'],
    features: [
      { key: 'Binyan', label: 'Stem', values: { Peal: 'Peal (basic)', Pael: 'Pael (intensive or factitive)', Afel: 'Aphel (causative)', Hafel: 'Haphel (causative)', Itpeel: 'Ithpeel (reflexive or passive)', Itpaal: 'Ithpaal (reflexive or passive)', Hitpeel: 'Hithpeel (reflexive)' }, explain: 'Aramaic verbs use stem patterns. These names label patterns of the root; their force depends on the verb and context.' },
      { key: 'Conj', label: 'Verb form', values: { Perf: 'perfect', Impf: 'imperfect', Imp: 'imperative', Part: 'participle', PassPart: 'passive participle', InfCons: 'infinitive construct' }, explain: 'The source distinguishes verb forms by their morphology. These labels describe forms; they do not by themselves settle the time meant in a sentence.' },
      { key: 'State', label: 'Noun state', values: { Abs: 'absolute', Cons: 'construct', Det: 'determined (often emphatic)' }, explain: 'Nouns may appear in absolute, construct, or determined state. A construct noun is bound to what follows (“X of Y”); the determined state often has an ending in -ā, though that ending is not a one-to-one guide to meaning.' },
      { key: 'Gender', label: 'Gender', values: { Masc: 'masculine', Fem: 'feminine', Com: 'common' }, explain: 'The source marks grammatical gender where it is available; this is a feature of the word.' },
      { key: 'Number', label: 'Number', values: { Sing: 'singular', Plur: 'plural' }, explain: 'The source marks singular and plural forms where available.' },
      { key: 'Person', label: 'Person', values: { 1: 'first person', 2: 'second person', 3: 'third person' }, explain: 'Person is carried by many finite verb forms: first, second, or third.' },
      { key: 'Definite', label: 'Definiteness', values: { Def: 'definite / determined' }, explain: 'This flag records a definite or determined form when the source marks it.' },
    ],
    constructions: [
      { id: 'noun-state', label: 'Noun state', explain: 'Look for the source’s absolute, construct, and determined labels. In a construct phrase, the first noun is linked to what follows; the word order and form matter.' },
      { id: 'attached-parts', label: 'Attached parts', explain: 'Short prepositions and conjunctions can be written attached to a following word. The analyser reports only splits supported by its source forms.' },
    ],
    voices: [],
    segmentation: { method: 'adapter', notes: 'Right-to-left Hebrew-script tokens; vowel and accent marks stay attached to their written word. Aramaic and Hebrew passages are not treated as the same language.' },
    validation: ARC_VALIDATION,
    thin: [
      'The compiled vocabulary and morphology cover only a small, selected part of Biblical Aramaic.',
      'Readings follow source morphology and have not been checked by a Biblical Aramaic specialist or a native speaker.',
      'This is a word analyser, not a parser or translation system; it does not identify subjects, objects, or a complete clause meaning.',
      'There are no recordings or registered voices for this pack.',
    ],
    pronunciationNotes: false,
    tutorial: { ref: ARC_TUTORIAL.ref, estimatedMinutes: ARC_TUTORIAL.estimatedMinutes },
  });
  const attribution = 'Original work of the Open Scriptures Hebrew Bible available at https://github.com/openscriptures/morphhb';
  return {
    ...manifest,
    rights: {
      ...manifest.rights,
      provenance: [
        ...manifest.rights.provenance,
        'Aramaic morphology is adapted from the Aramaic annotations in the Open Scriptures Hebrew Bible (OSHB), CC BY 4.0. ' + attribution + '. The Westminster Leningrad Codex (WLC) source text is public domain.',
        'Only Biblical Aramaic is included. This pack does not cover Jewish Babylonian Aramaic, Syriac, Samaritan Aramaic, or modern spoken Aramaic varieties.',
      ],
      licences: [
        ...manifest.rights.licences,
        { resource: 'Open Scriptures Hebrew Bible Aramaic morphology', licence: 'CC BY 4.0', notice: attribution },
        { resource: 'Westminster Leningrad Codex Aramaic source text', licence: 'Public domain' },
        { resource: 'Open Scriptures HebrewLexicon Strong lexical transcription', licence: 'CC BY 4.0', notice: 'Credit the Open Scriptures Hebrew Bible Project; Strong dictionary text public domain' },
      ],
    },
  };
}

/**
 * The Spanish pack (`pack:es`): the SECOND installable pack, added to show that another language goes through the same
 * shared interfaces as Albanian (prompt 6, section 25) without a second application architecture.
 *
 * It is installable at a deliberately MINIMAL level and is NOT production-ready. Everything linguistic in it is
 * machine-drafted and has not been checked by a native speaker (`reviewStatus: 'machine-drafted'`). What is thin:
 *   - lemmatization is seed-only (about 1,500 hand-listed lemmas and the closed classes); every other word gets a rule
 *     reading marked as inferred, or none, and the status rule keeps every rule reading at 'provisional';
 *   - morphology is rule-based and has not been measured on running prose; ambiguity is kept, not resolved;
 *   - about 190 phrase units and 23 constructions, found only where the neighbouring words are known;
 *   - sentence splitting knows the usual abbreviations but not all of them;
 *   - 17 validation cases (the minimum is 12), all single words in short present/past sentences;
 *   - the tutorial (tutorial/es) is a short orientation, not a course; it does not teach voseo;
 *   - no recordings, and no per-letter Spanish phonetic rule set in GoListen (the adapter's own pronunciation notes are shown);
 *   - the Honduran target (voseo, Honduran vocabulary) is detected by the adapter but not taught by the pack.
 *
 * The version and analyser come from the real adapter (src/adapters/es.ts). They are written here as constants, not
 * imported, so that listing the packs does not pull the Spanish word lists into an application bundle; the registry test
 * (test/language-packs/registry.test.ts) and test/multilang compare the constant with the adapter and fail on drift.
 */
import { CONTRACT_VERSION } from '../../../repository-contract/src';
import { KAIKKI_ATTRIBUTION, type PackManifest, type ValidationCase } from '../manifest';
import { ES_TUTORIAL } from '../tutorial/es';

export const ES_PACK_ID = 'pack:es';
/** Adapter version (checked against src/adapters/es.ts by test/language-packs/registry.test.ts and test/multilang). */
export const ES_VERSION = '12';
/** The shipped dictionary (public/dict/es/manifest.json): checked by installPack against the files on the device. */
export const ES_DICTIONARY = { id: 'kaikki-es@2026-09-28', entries: 808278 } as const;

/**
 * Real selections the pack must read as stated. Every expectation is what the adapter really says (adapter-es@12), not
 * what a person would hope: a form the word list states directly (libros, es, Honduras) is 'high-confidence'; a form only
 * the rules generate (niños, leen, hablé) stays 'provisional' however confident the adapter is; casa is 'provisional'
 * because its top reading (0.75) is below the high-confidence threshold. The voseo form tenés is read as an ordinary
 * second person singular: the adapter's voseo construction is a sentence-level pattern, not a feature of the word.
 */
export const ES_VALIDATION: ValidationCase[] = [
  { id: 'v-libros', surface: 'libros', sentence: 'Los niños leen los libros.', expect: { lemma: 'libro', pos: 'NOUN', features: { Gender: 'Masc', Number: 'Plur' }, status: 'high-confidence' } },
  { id: 'v-ninos', surface: 'niños', sentence: 'Los niños leen los libros.', expect: { lemma: 'niño', pos: 'NOUN', features: { Number: 'Plur' }, status: 'provisional' } },
  { id: 'v-leen', surface: 'leen', sentence: 'Los niños leen los libros.', expect: { lemma: 'leer', pos: 'VERB', features: { Person: '3', Number: 'Plur', Tense: 'Pres', Mood: 'Ind' }, status: 'provisional' } },
  { id: 'v-los', surface: 'Los', sentence: 'Los niños leen los libros.', expect: { lemma: 'los', pos: 'DET', features: { Definite: 'Def', Number: 'Plur', Gender: 'Masc' }, status: 'high-confidence' } },
  { id: 'v-casa', surface: 'casa', sentence: 'La casa es grande.', expect: { lemma: 'casa', pos: 'NOUN', features: { Gender: 'Fem', Number: 'Sing' }, status: 'provisional' } },
  { id: 'v-es', surface: 'es', sentence: 'La casa es grande.', expect: { lemma: 'ser', pos: 'AUX', features: { Person: '3', Number: 'Sing', Tense: 'Pres', Mood: 'Ind' }, status: 'high-confidence' } },
  { id: 'v-grande', surface: 'grande', sentence: 'La casa es grande.', expect: { lemma: 'grande', pos: 'ADJ', features: { Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-esta', surface: 'está', sentence: 'El libro está en la mesa.', expect: { lemma: 'estar', pos: 'AUX', features: { Person: '3', Number: 'Sing', Tense: 'Pres' }, status: 'high-confidence' } },
  { id: 'v-mesa', surface: 'mesa', sentence: 'El libro está en la mesa.', expect: { lemma: 'mesa', pos: 'NOUN', features: { Gender: 'Fem', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-hable', surface: 'hablé', sentence: 'Ayer hablé con mi madre.', expect: { lemma: 'hablar', pos: 'VERB', features: { Person: '1', Number: 'Sing', Tense: 'Past', Mood: 'Ind' }, status: 'provisional' } },
  { id: 'v-madre', surface: 'madre', sentence: 'Ayer hablé con mi madre.', expect: { lemma: 'madre', pos: 'NOUN', features: { Gender: 'Fem', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-tenes', surface: 'tenés', sentence: 'Vos tenés una casa.', expect: { lemma: 'tener', pos: 'VERB', features: { Person: '2', Number: 'Sing', Tense: 'Pres' }, status: 'provisional' } },
  { id: 'v-coma', surface: 'coma', sentence: 'Quiero que ella coma pan.', expect: { lemma: 'comer', pos: 'VERB', features: { Person: '3', Number: 'Sing', Tense: 'Pres', Mood: 'Sub' }, status: 'provisional' } },
  { id: 'v-me', surface: 'me', sentence: 'Ella me da el libro.', expect: { lemma: 'me', pos: 'PRON', features: { Person: '1', Number: 'Sing', Case: 'Acc,Dat' }, status: 'high-confidence' } },
  { id: 'v-pequena', surface: 'pequeña', sentence: 'Ella es una niña pequeña.', expect: { lemma: 'pequeño', pos: 'ADJ', features: { Gender: 'Fem', Number: 'Sing' }, status: 'provisional' } },
  { id: 'v-honduras', surface: 'Honduras', sentence: 'Yo vivo en Honduras.', expect: { lemma: 'Honduras', pos: 'PROPN', status: 'high-confidence' } },
  { id: 'v-unknown', surface: 'Xyzqwk', sentence: 'Xyzqwk es aquí.', expect: { readings: 'none', status: 'provisional' } },
];

export function spanishManifest(): PackManifest {
  return {
    packId: ES_PACK_ID,
    languageId: 'es',
    varietyId: 'es-HN',
    scriptId: 'Latn',
    version: ES_VERSION,
    compatibility: { contractVersion: CONTRACT_VERSION, extensionMin: '0.1.0' },
    identity: { name: 'Spanish', nativeName: 'español', direction: 'ltr' },
    varieties: [
      { varietyId: 'es-HN', label: 'Honduras (target of the course)', analysed: true, note: 'voseo is an active feature of this target; the adapter detects it but this pack does not teach it' },
      { varietyId: 'es-419', label: 'Latin America (general)', analysed: true },
      { varietyId: 'es-ES', label: 'Spain (recognise, not the default)', analysed: true },
    ],
    lexical: {
      handLexicon: {
        ref: 'src/adapters/es.ts and src/adapters/spanish (seed word list, word-form rules, phrase list, construction rules)',
        licence: 'Owner-authored, AI-drafted',
        reviewStatus: 'machine-drafted',
      },
      dictionary: {
        id: ES_DICTIONARY.id,
        baseUrl: 'dict/es/',
        licence: 'CC BY-SA 4.0 (Wiktionary contributors, via kaikki.org)',
        attribution: KAIKKI_ATTRIBUTION,
        entries: ES_DICTIONARY.entries,
        frequency: true,
      },
    },
    analyzer: {
      id: `adapter-es@${ES_VERSION}`,
      version: ES_VERSION,
      capabilities: ['tokenization', 'sentence-segmentation', 'lemma', 'morphology', 'phrases', 'constructions', 'pronunciation-notes', 'production-checks'],
    },
    segmentation: {
      method: 'adapter',
      notes: 'Intl.Segmenter for Spanish underneath; ¿ ¡ and dialogue dashes are handled by the sentence splitter, which knows the usual abbreviations but not every one.',
    },
    sentenceBoundaries: { method: 'adapter' },
    grammar: {
      features: [
        {
          key: 'Gender', label: 'Gender', values: { Masc: 'masculine', Fem: 'feminine' },
          explain: 'Every noun is masculine or feminine, and the little word in front (el, la, un, una) and any adjective must agree with it: el libro, la casa, la casa pequeña. The ending often shows it (-o masculine, -a feminine) but not always (la mano, el día).',
        },
        {
          key: 'Number', label: 'Number', values: { Sing: 'singular', Plur: 'plural' },
          explain: 'One thing or several. The plural of a noun or adjective is made by adding -s after a vowel or -es after a consonant (libro, libros; ciudad, ciudades), and the article and adjective take the plural too: los libros pequeños. On a verb the number is part of the ending.',
        },
        {
          key: 'Tense', label: 'Tense', values: { Pres: 'present', Imp: 'imperfect (was doing)', Past: 'preterite (simple past)', Fut: 'future' },
          explain: 'When the action happens. The present also covers “is doing”; the imperfect (hablaba) is the ongoing or repeated past; the preterite (hablé) is the finished past; the future (hablaré) looks ahead. Note that “Imp” on a Tense means imperfect, while “Imp” on a Mood means imperative (a command).',
        },
        {
          key: 'Mood', label: 'Mood', values: { Ind: 'indicative (a statement)', Sub: 'subjunctive (a wish, doubt or purpose)', Imp: 'imperative (a command)', Cnd: 'conditional (would)' },
          explain: 'How the speaker presents the action. The indicative states facts. The subjunctive appears after verbs of wish, doubt or request and after words such as para que: Quiero que ella coma pan. Many present-tense forms are the same in two moods or persons (coma can be “eat” as a wish or a command), so a word on its own can have several readings.',
        },
        {
          key: 'Person', label: 'Person', values: { '1': 'first (I, we)', '2': 'second (you)', '3': 'third (he, she, it, they; also usted)' },
          explain: 'Who does the action. The verb ending shows the person, so the subject pronoun (yo, tú, vos, ella …) is often left out. In Honduras vos is used for informal “you” with its own verb forms (vos tenés), which the adapter reads as second person singular.',
        },
        {
          key: 'VerbForm', label: 'Verb form', values: { Fin: 'finite (has a person)', Inf: 'infinitive', Ger: 'gerund (-ando, -iendo)', Part: 'past participle (-ado, -ido)' },
          explain: 'A finite verb has a person and a tense. The infinitive (hablar) is the dictionary form; the gerund builds “is doing” with estar; the past participle builds the perfect with haber (he hablado) and works as an adjective.',
        },
      ],
      constructions: [
        {
          id: 'present-indicative', label: 'Present indicative',
          explain: 'The ordinary present: the verb ending carries person and number (hablo, hablas, habla, hablamos, hablan). It states a fact or a habit and also covers what is happening now: Ella bebe agua.',
        },
        {
          id: 'preterite', label: 'Preterite (pretérito indefinido)',
          explain: 'A completed event in the past: Ayer hablé con mi madre. The endings are different from the present (-é, -aste, -ó, -amos, -aron for -ar verbs), and a written accent marks several of them.',
        },
        {
          id: 'imperfect', label: 'Imperfect (pretérito imperfecto)',
          explain: 'How things used to be or were ongoing in the past: Cuando era joven, no entendía. Contrast with the preterite, which names a finished event.',
        },
        {
          id: 'present-subjunctive', label: 'Present subjunctive',
          explain: 'The “other” present, built from the first-person present with the vowel swapped (-ar verbs take -e, -er and -ir verbs take -a): coma, hable, viva. It is used after verbs of wish, request or doubt and after para que, cuando (future) and aunque.',
        },
        {
          id: 'querer-que-subjunctive', label: 'Wanting someone else to act: querer que + subjunctive',
          explain: 'After querer que (and other verbs of wish or request) the verb is in the subjunctive: Quiero que ella coma pan.',
        },
        {
          id: 'object-pronouns', label: 'Object pronouns: me, te, lo, la, le',
          explain: 'A short pronoun stands for the thing or person acted on and goes before a conjugated verb: Ella me da el libro. Two together go indirect first (Me lo dio), and le or les becomes se before lo, la, los, las (Se lo di).',
        },
        {
          id: 'enclitic-pronoun', label: 'Pronouns attached to the verb',
          explain: 'Object pronouns attach to the end of an infinitive, a gerund or a command: entender + lo → entenderlo; da + me + lo → dámelo. The written accent keeps the stress where it was.',
        },
        {
          id: 'double-object-pronouns', label: 'Two object pronouns: se lo, me lo',
          explain: 'Two object pronouns go together before the verb, indirect first: Me lo dio (he gave it to me). Attached to a verb the order is the same: decírselo.',
        },
        {
          id: 'ser-estar-adjective', label: 'Ser or estar with an adjective',
          explain: 'Ser says what someone or something is like: Ella es alta. Estar says how it is now: Ella está cansada. The same adjective can change meaning: es listo (is clever), está listo (is ready).',
        },
        {
          id: 'article-noun-agreement', label: 'Article, noun and adjective agree',
          explain: 'The little word in front, the noun and any adjective share gender and number: la casa pequeña, los libros pequeños. A mismatch (el casa) is the first thing to look for in your own writing.',
        },
        {
          id: 'voseo', label: 'Voseo: vos and its verb forms',
          explain: 'In Honduras and much of Central America vos replaces tú in everyday speech, with its own verb forms: vos tenés, vos hablás, and the command hablá. Recognised by the adapter; not taught in this pack’s orientation.',
        },
      ],
      clitics: ['me', 'te', 'se', 'lo', 'la', 'los', 'las', 'le', 'les', 'nos', 'os'],
    },
    pronunciation: {
      registryRef: 'golisten:es',
      notesAvailable: true,
      recordings: 'none',
      deviceVoiceExpected: true,
      remoteVoice: { provider: 'azure', voices: ['es-HN-CarlosNeural', 'es-HN-KarlaNeural', 'es-MX-DaliaNeural'], requiresConsentAndKey: true },
    },
    tutorial: { ref: ES_TUTORIAL.ref, estimatedMinutes: ES_TUTORIAL.estimatedMinutes, skippable: true },
    rights: {
      provenance: [
        'The hand lexicon (about 1,500 lemmas and the closed classes), word-form rules, phrase list and construction rules (src/adapters/es.ts, src/adapters/spanish) are owner-authored and AI-drafted. No native speaker has checked them. The pack is installable at a minimal level and is not production-ready.',
        'The dictionary is Wiktionary’s Spanish data, via kaikki.org, under CC BY-SA 4.0; every gloss taken from it is shown with that attribution.',
        'The orientation (tutorial/es) is minimal and AI-drafted for this pack, and is not reviewed; its demonstration passage was checked only by machine (every word read by the analyser).',
        'Thin: lemmatization is seed-only (other words get a rule reading marked as inferred, or none); morphology has not been measured on running prose; the 17 validation cases are single words in short sentences; the voseo target is detected but not taught.',
        'There is no recorded audio in this pack and GoListen has no per-letter Spanish phonetic rule set yet; pronunciation help is the adapter’s short written notes, a device voice if the device has one (es-HN, es-419, es-MX, es-ES), and an optional remote voice (consent and a key required).',
      ],
      licences: [
        { resource: 'Spanish course word list, word-form rules, phrase list and construction rules (adapter-es)', licence: 'Owner-authored, AI-drafted; not reviewed by a native speaker' },
        { resource: `Spanish dictionary ${ES_DICTIONARY.id}`, licence: 'CC BY-SA 4.0 (Wiktionary contributors, via kaikki.org)', notice: KAIKKI_ATTRIBUTION },
        { resource: 'Orientation tutorial/es and its demonstration passage', licence: 'Owner-authored, AI-drafted; not reviewed by a native speaker' },
      ],
      reviewStatus: 'machine-drafted',
    },
    validation: structuredClone(ES_VALIDATION),
    status: 'installable',
  };
}

/**
 * Minimal, AI-drafted orientation to Biblical Aramaic. It is not a grammar course and has not been checked by a specialist.
 * The short practice example is from Daniel 2:4 in the WLC text; it is Biblical text, not newly composed dialogue.
 */
import { orientation } from './orientation';
import type { Tutorial, TutorialStep } from './types';

const DAN_2_4 = "מַלְכָּא֙ לְעָלְמִ֣ין חֱיִ֔י אֱמַ֥ר חֶלְמָ֛א לְעַבְדָ֖ךְ וּפִשְׁרָ֥א נְחַוֵּֽא׃";

export const ARC_TUTORIAL_STEPS_OWN: TutorialStep[] = [
  {
    id: 'alphabet-complete', kind: 'alphabet', title: 'Learn the twenty-two consonant letters', estimatedMinutes: 4,
    body: 'Read this list from its letter names, then find familiar shapes in the short source examples: א aleph; ב beth; ג gimel; ד daleth; ה he; ו waw; ז zayin; ח heth; ט teth; י yod; כ kaph; ל lamedh; מ mem; נ nun; ס samekh; ע ayin; פ pe; צ tsadhe; ק qoph; ר resh; ש shin or sin (the point distinguishes them); ת taw. Five letters have final shapes: כ becomes ך, מ becomes ם, נ becomes ן, פ becomes ף, צ becomes ץ. The names help identify letters; they are not a recording of historical pronunciation. In a pointed edition, small marks carry vowels and other reading distinctions. An unpointed text leaves those marks unwritten; do not invent the missing vowels.',
    examples: [
      { surface: 'מַלְכָּא֙', gloss: 'king', note: 'Identify מ, ל, כ and א in the source word; the final א belongs to its determined-state ending.' },
      { surface: 'חֱיִ֔י', gloss: 'live!', note: 'Identify ח and the two written י letters; this is the source imperative, not a general spelling rule.' },
      { surface: 'אֱמַ֥ר', gloss: 'say!', note: 'Identify א, מ and ר, then select the complete word in the practice passage.' },
    ],
  },

  {
    id: 'script-aram',
    kind: 'alphabet',
    title: 'The Aramaic text on the page',
    estimatedMinutes: 2,
    body: 'Biblical Aramaic is written from right to left in Hebrew script. Its consonant letters are the same basic twenty-two-letter set familiar from Hebrew, with the familiar final letter shapes. Printed Bible editions may add vowel points and cantillation marks; many other Aramaic texts do not. Those marks are part of how a text is written, but they are not extra consonant letters.',
    examples: [
      { surface: 'מַלְכָּא֙', gloss: 'king', note: 'a word from Daniel 2:4' },
      { surface: 'חֶלְמָ֛א', gloss: 'dream', note: 'a word from Daniel 2:4' },
      { surface: 'שְׁמֵהּ', gloss: 'his name', note: 'a word from Daniel 2:20' },
    ],
  },
  {
    id: 'forms-and-states',
    kind: 'patterns',
    title: 'Noun states and attached parts',
    estimatedMinutes: 3,
    body: 'The source marks nouns as absolute, construct, or determined. A construct noun is linked to the noun after it, often read “X of Y.” The determined state is often marked by an ending in -ā, but the ending alone is not a complete guide to meaning. Short prepositions and conjunctions can be attached to a word; the card may show a supported split when the analyser can identify it.',
    examples: [
      { surface: 'שְׁמֵהּ', gloss: 'his name', note: 'construct noun with a possessive ending in the source analysis' },
      { surface: 'אֱלָהָא', gloss: 'God', note: 'from Daniel 2:20; determined noun in the source analysis' },
      { surface: 'דִּי', gloss: 'that; which', note: 'a connective word from Daniel 2:20' },
    ],
  },
  {
    id: 'verb-forms',
    kind: 'concept',
    title: 'Verb forms carry person and stem information',
    estimatedMinutes: 3,
    body: 'The analyser reports a stem name such as Peal or Pael and a form such as imperative or imperfect when its source marks one. Endings and prefixes help identify person, gender, and number. Stem names describe patterns; they do not give a single English meaning for every verb. The short phrase from Daniel 2:4 contains “live!” and “say!”, followed by “we will declare.”',
    examples: [
      { surface: 'חֱיִ֔י', gloss: 'live!', note: 'imperative in the source analysis' },
      { surface: 'אֱמַ֥ר', gloss: 'say!', note: 'imperative in the source analysis' },
      { surface: 'נְחַוֵּֽא', gloss: 'we will declare', note: 'first-person plural verb form in the source analysis' },
    ],
  },
];

export const ARC_TUTORIAL: Tutorial = orientation({
  languageId: 'arc',
  languageName: 'Aramaic',
  practice: {
    instruction: 'Select the word for “king” in this excerpt from Daniel 2:4 and look at its noun state.',
    sentence: DAN_2_4,
    target: 'מַלְכָּא֙',
  },
  cardFeatureNote: 'For this pack, the card shows only the Biblical Aramaic source readings it knows: the lemma, part of speech, and source-supported features such as noun state, number, gender, person, verb form, or stem.',
  thin: [
    'The word list follows Aramaic annotations in the OSHB source; omitted forms and analyses remain unknown.',
    'A source-tagged Aramaic form does not establish every possible reading or support productive parsing.',
    'There are no recordings or registered voices for Biblical Aramaic in this pack.',
  ],
  languageSteps: ARC_TUTORIAL_STEPS_OWN,
  notice: 'This minimal Biblical Aramaic orientation was drafted by an AI model and has not been checked by a native speaker or a Biblical Aramaic specialist. Skip it if you prefer; it covers script, a few source forms, and the pack’s limits.',
});

export const ARC_TUTORIAL_STEPS: TutorialStep[] = ARC_TUTORIAL.steps;

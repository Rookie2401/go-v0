/**
 * The shared parts of the minimal orientations of the experimental packs (German, Hindi, Thai, Norwegian Bokmål and
 * Nynorsk): how to select a word, what the card shows, the practice lookup, the honesty step and the sound note read the same
 * way in every language, with the language's own name, its own thin parts and its own voices put in. Everything language-specific
 * (the script note, the first words, the written standards) is written in the language's own file.
 *
 * Every sentence here was drafted by an AI model for these packs; none has been read by a native speaker. The tests
 * (test/language-packs/tutorial-orientations.test.ts) check by machine that each practice target and each example word is read
 * by the real analyser, and nothing more.
 */
import type { Tutorial, TutorialPractice, TutorialStep } from './types';

export interface OrientationSpec {
  languageId: string;
  /** 'German', 'Norwegian (Bokmål)' ... as the learner reads it. */
  languageName: string;
  /** The practice lookup (a word from the pack's own validation sentences). */
  practice: TutorialPractice;
  /** What the card means for this language's features, one or two plain sentences ("Nom,Acc means ..."). */
  cardFeatureNote: string;
  /** The thin parts of this pack, in the words of the learner (shown in the honesty step). */
  thin: string[];
  /** The note about hearing a word, after "This pack has no recordings." */
  sound?: { id: string; body: string };
  /** The script, words and standards steps, in order. */
  languageSteps: TutorialStep[];
  /** One honest sentence the application may show above the tutorial. */
  notice: string;
}

const selectStep = (name: string): TutorialStep => ({
  id: 'select-a-word',
  kind: 'concept',
  title: 'How to select a word',
  estimatedMinutes: 1,
  body: `Click or tap a word to select it; drag across several words to select a phrase. The ${name} analyser reads the word inside its sentence, so the words next to it help it choose between readings; a word selected on its own has no sentence to help and the card says so. The card that opens shows the dictionary form, the part of speech, a short meaning and, if you ask, more.`,
});

const cardStep = (name: string, featureNote: string): TutorialStep => ({
  id: 'what-the-card-shows',
  kind: 'concept',
  title: 'What the card shows',
  estimatedMinutes: 2,
  body: `The card starts with the lemma: the form of the word you would look up in a dictionary. Under it come the part of speech and, where the analyser knows them, the grammar features of the exact form you selected. ${featureNote} When the analyser cannot decide it keeps the readings it cannot tell apart and shows how sure it is, instead of choosing one. A reading marked unconfirmed is a guess from the shape of a word that the ${name} word list does not hold: treat it as a hint, and it is not counted as a word you know.`,
});

const honestyStep = (name: string, thin: string[]): TutorialStep => ({
  id: 'honesty-experimental',
  kind: 'concept',
  title: 'This pack is experimental',
  estimatedMinutes: 2,
  body: `The ${name} pack is experimental and unreviewed. Its word list was drafted by an AI model and no native speaker has checked it. ${thin.join(' ')} It does not check what you write, it gives no subject or object labels, and its readings are measured only on short sentences written for the pack, not on real books or pages. Use it to get started, and trust a native speaker, a printed dictionary or a recording over it.`,
});

/** Assembles the tutorial: select, card, practice, then the language's own steps, the honesty step and, when given, the sound note. */
export function orientation(s: OrientationSpec): Tutorial {
  const steps: TutorialStep[] = [
    selectStep(s.languageName),
    cardStep(s.languageName, s.cardFeatureNote),
    { id: 'practice-lookup', kind: 'practice', title: 'Try a lookup', estimatedMinutes: 1, body: `Now try it once. The sentence below is shown with the analyser reading it; select the word you are asked for and look at the card it opens. Nothing is scored and you can repeat it as often as you like.`, practice: s.practice },
    ...s.languageSteps,
    honestyStep(s.languageName, s.thin),
    ...(s.sound ? [{ id: s.sound.id, kind: 'concept' as const, title: 'How to hear a word', estimatedMinutes: 1, body: s.sound.body }] : []),
  ];
  return {
    ref: `tutorial/${s.languageId}`,
    languageId: s.languageId,
    authorship: 'machine-drafted',
    reviewed: false,
    reviewNeeded: 'native speaker',
    skippable: true,
    estimatedMinutes: steps.reduce((n, x) => n + x.estimatedMinutes, 0),
    steps,
    notice: s.notice,
  };
}

/**
 * The sound note every experimental pack gives: no recordings of its own, written notes, and the honest device-voice capability.
 * A test compares that statement with GoListen's own registry
 * (test/language-packs/tutorial-orientations.test.ts), so it cannot drift unnoticed. If a voice is added later, a device voice would be
 * practice only and a remote voice would need the learner's consent and key.
 */
export const soundBody = (name: string, goListenNote = '', remoteNote = ''): string =>
  `This pack has no recordings of its own. A card may list pronunciation notes in writing, produced by rules and not checked by a native speaker, so when a recording or a person disagrees, trust them. GoLearn can use a matching ${name} voice from your device, if one is installed${goListenNote}; it is synthetic practice only, and installed voices vary${remoteNote}. Audio is never counted as evidence that you can understand speech.`;

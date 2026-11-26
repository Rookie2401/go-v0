/**
 * The Korean orientation (tutorial/ko): drafted by an AI model for the experimental Korean pack. NO native speaker or Korean teacher has checked
 * it. It teaches how to select a word, what the card shows, one practice lookup, the script in one paragraph, the order of a Korean sentence,
 * particles in place of prepositions, the verb at the end with its endings, the two separate dimensions of respect (the speech level for the
 * listener, -(으)시- for the subject), how the card shows a word in parts, what the numbered homonym means, and what "unconfirmed" means. It claims
 * nothing the pack does not deliver (docs/korean/PLAN.md). The practice sentence is one of the pack's validation sentences; a test reads every
 * example word of the steps through the real analyser when the analyser is registered.
 */
import { orientation, soundBody } from './orientation';
import type { Tutorial, TutorialStep } from './types';

export const KO_TUTORIAL_STEPS_OWN: TutorialStep[] = [
  {
    id: 'script-hangul',
    kind: 'alphabet',
    title: 'Hangul: a letter alphabet written in square blocks',
    estimatedMinutes: 3,
    body:
      'Korean is written in Hangul, read from left to right. It is a true alphabet of 19 consonant and 21 vowel letters, but the letters of one syllable are stacked into a single square block: ㅎ + ㅏ + ㄴ make 한, with the vowel to the right of the consonant (가) or below it (고) and a final consonant at the bottom. A block is one syllable, so the page is a row of blocks, and a word is a few of them. The letter ㅇ is silent at the start of a block and sounds ng at the end. Spaces separate units of several syllables (an 어절), not single words: a noun and its particle, or a verb with its endings, are written together. Some Sino-Korean words are also printed in Hanja on some pages; the card shows Hanja only where the dictionary states them. If you want to learn the letters first, the optional Alphabet Sprint in GoReview teaches them in seven short stages; reading with the card needs none of it.',
    examples: [
      { surface: '음악', gloss: 'music', note: 'two blocks: 음 + 악; said eumak: the final ㅁ of 음 is carried onto the silent ㅇ of 악' },
      { surface: '가', gloss: 'a syllable: ㄱ + ㅏ', note: 'the vowel ㅏ stands to the right of the consonant' },
      { surface: '고', gloss: 'a syllable: ㄱ + ㅗ', note: 'the vowel ㅗ stands below the consonant' },
      { surface: '학교', gloss: 'school', note: 'written hakgyo, said [학꾜]: spelling and sound can differ' },
    ],
  },
  {
    id: 'word-order',
    kind: 'patterns',
    title: 'Pattern: the verb comes last',
    estimatedMinutes: 2,
    body:
      'A Korean sentence ends with its verb, and the other parts come before it, usually subject, then object, then verb (the order is called SOV). Korean has no words for “the” or “a” and no grammatical gender, and the verb does not change for the person who does it: 읽어요 can be “I read”, “you read” or “he reads”, and the sentence or the situation tells which. Words that are clear from the situation are often left out altogether, the subject most of all.',
    examples: [
      { surface: '저는 책을 읽어요', gloss: 'I read a book', note: 'I (as for me) + book (object) + read' },
      { surface: '학생이 학교에 가요', gloss: 'the student goes to school', note: 'student (subject) + school (to) + goes' },
    ],
  },
  {
    id: 'particles',
    kind: 'patterns',
    title: 'Pattern: particles instead of prepositions',
    estimatedMinutes: 3,
    body:
      'Where English puts a small word before a noun, Korean writes a particle right after it, and the noun itself never changes. 이/가 marks the subject, 을/를 the object, 에 a place, time or destination, 에서 where an action happens or where something comes from, 와/과 “with” or “and”, 의 “of”. Each pair has two shapes chosen by the last sound of the noun: 이, 을, 은, 과 after a consonant and 가, 를, 는, 와 after a vowel. 은/는 is the topic particle: it says what the sentence is about, or sets one thing against another, and is not simply a second subject marker. Particles can stack (학교에서도 “also at school”), and a plural is marked, if at all, by 들 (학생들): a noun without 들 does not say whether it is one or many, and the card never calls it singular. The card shows the noun and each particle as separate parts, each with its job.',
    examples: [
      { surface: '학교에', gloss: 'to or at school', note: '학교 + 에' },
      { surface: '학교에서', gloss: 'at school; from school', note: '학교 + 에서' },
      { surface: '학교에서도', gloss: 'also at school', note: '학교 + 에서 + 도' },
      { surface: '학생들이', gloss: 'the students (as the subject)', note: '학생 + 들 + 이' },
      { surface: '친구와', gloss: 'with a friend', note: '친구 + 와 (after a vowel)' },
    ],
  },
  {
    id: 'verb-endings',
    kind: 'patterns',
    title: 'Pattern: a verb is a stem plus a chain of endings',
    estimatedMinutes: 3,
    body:
      'A Korean verb is looked up under its dictionary form, which ends in 다 (먹다 “to eat”); what you meet on a page is the stem with endings after it, and the endings carry what other languages put in separate words or in a tense: -었- for the past (먹었어요 “ate”), -(으)시- for honouring the person who does the action (먹으셨어요), an ending for the speech level (-어요, -습니다), and endings that join clauses or turn a verb into a modifier (먹고 “eat and …”, 먹는 사람 “a person who eats”). The ending -겠- is not a future tense: it says the speaker intends or supposes something, or is being polite (알겠습니다 “understood”). What English calls an adjective is a verb here: 예쁘다 “to be pretty” takes endings too (예뻐요 “is pretty”), and the card calls it a descriptive verb. A few stems change when an ending follows (듣다 → 들어요, 춥다 → 추워요), and which ones is a fact about the word, not its spelling: 묻다 “to ask” changes (물어요) but 묻다 “to bury” does not (묻어요). The card names the class when the form shows it.',
    examples: [
      { surface: '먹어요', gloss: 'eat, eats', note: '먹다, polite everyday style' },
      { surface: '먹었어요', gloss: 'ate', note: '먹 + 었 + 어요' },
      { surface: '추워요', gloss: 'is cold', note: '춥다 (ㅂ changes to 우); a descriptive verb' },
      { surface: '들어요', gloss: 'listens', note: '듣다 (ㄷ changes to ㄹ before a vowel); 들다 “to hold; to enter” is spelled the same, so the sentence helps to choose' },
      { surface: '해요', gloss: 'does', note: '하다; the ending and the stem are fused (하 + 여)' },
    ],
  },
  {
    id: 'speech-levels',
    kind: 'concept',
    title: 'Two kinds of respect: the speech level and the honorific',
    estimatedMinutes: 3,
    body:
      'Korean marks respect in two separate places, and the card shows them separately. The speech level is in the LAST ending and shows how the speaker addresses the listener. There are six: 하십시오체 (formal, deferential: 먹습니다), 해요체 (polite, everyday: 먹어요), 해체 (intimate: 먹어), 해라체 (plain: 먹는다, the level of books and news), and the uncommon 하오체 (먹소) and 하게체 (먹네). The honorific -(으)시- is inside the verb and honours the person who is the SUBJECT: 선생님이 오셨어요 “the teacher came”. You can honour the subject in a plain sentence to a friend, and you can be formal about someone you do not honour; the two are independent. Older and literary writing, hymns and Bible translations use further endings (-(으)니라, -(으)소서, -도다 and others); the card names them as literary and gives them no conversational meaning.',
    examples: [
      { surface: '먹습니다', gloss: 'eat (formal)', note: '하십시오체' },
      { surface: '먹어요', gloss: 'eat (polite)', note: '해요체' },
      { surface: '먹어', gloss: 'eat (intimate)', note: '해체' },
      { surface: '먹는다', gloss: 'eats (plain)', note: '해라체' },
      { surface: '오셨어요', gloss: 'came (honouring the subject)', note: '오 + 시 + 었 + 어요: -(으)시- plus the past plus the polite style' },
    ],
  },
  {
    id: 'word-in-parts',
    kind: 'concept',
    title: 'How the card shows a word in parts',
    estimatedMinutes: 2,
    body:
      'The card shows what you selected, the dictionary form, and then the word in parts: a noun with its particles (학생 + 들 + 이), a verb as its stem and its endings (먹 + 었 + 습니다), each part with its job. A part is a span of the written word, and the page is never changed. When two parts share one block, the parts overlap on that block and the card does not cut the block in half: 갔어요 is 가 + 았 + 어요, and the block 갔 belongs to both 가 and 았. A contracted form is the same word as the full one: 봐요 is 보아요 and resolves to 보다, 돼요 to 되다. A form such as 읽으셨습니다 resolves to 읽다, and knowing 읽다 does not make the ending -(으)시- known: the word and its endings are kept apart.',
    examples: [
      { surface: '학생들이', gloss: 'the students (subject)', note: '학생 + 들 + 이' },
      { surface: '먹었습니다', gloss: 'ate (formal)', note: '먹 + 었 + 습니다' },
      { surface: '갔어요', gloss: 'went', note: '가 + 았 + 어요: the block 갔 holds two parts' },
      { surface: '봐요', gloss: 'see, watch', note: '보다; 봐 is the fused 보 + 아' },
    ],
  },
  {
    id: 'homonyms',
    kind: 'concept',
    title: 'Words spelled alike: 눈 (eye) and 눈 (snow)',
    estimatedMinutes: 2,
    body:
      'Korean has many words that are spelled alike but are different words with different origins: 눈 “eye” and 눈 “snow”, 배 “stomach”, “pear” and “boat”, 말 “speech” and “horse”. The dictionary gives each its own entry, and the card keeps them apart. The card shows the plain headword; when it shows one of several entries of a spelling, a small label such as “entry 2” stands beside the meaning. That number is the dictionary’s own entry number: it says which word, not how common it is. For most spelled-alike words one is the ordinary word and the card simply shows it (시간 is “time”; the dictionary’s other 시간 entries come last, if at all). Only where a reader really has to choose (눈, 배, 말) does the card say it could not tell which: it names every candidate, and what you mark on it is kept as “the word 눈, which one not settled”. A clue can settle it: in 눈이 와요 the verb 오다 makes 눈 “snow”, and the shape of a form can rule entries out (물어요 cannot be 묻다 “to bury”). When more than one entry still fits, the card says so.',
    examples: [
      { surface: '눈', gloss: 'eye; snow', note: 'two entries spelled alike; the card names both when the sentence does not choose' },
      { surface: '배', gloss: 'stomach; pear; boat', note: 'three entries' },
      { surface: '물어요', gloss: 'asks; or bites', note: '묻다 “to ask” (ㄷ changes to ㄹ) or 물다 “to bite”; it cannot be 묻다 “to bury”' },
      { surface: '묻어요', gloss: 'buries; or sticks on', note: '묻다 “to bury” or another 묻다 “to stick, to get on”, both regular; it cannot be “to ask”' },
    ],
  },
  {
    id: 'unconfirmed',
    kind: 'concept',
    title: 'What “unconfirmed” means',
    estimatedMinutes: 2,
    body:
      'The pack reads a word by finding its stem in its dictionary and checking that the particles or endings after it fit. When the stem is not in the dictionary (a name, a new word, a rare word, a compound the dictionary does not list, a typing slip; a compound is shown as built from its parts, as 예산안 is 예산 + 안, and marked unconfirmed), the card still explains the particles and endings it can recognise, offers the stem as written with no meaning, and marks the reading unconfirmed. An unconfirmed reading is a hint about the shape of the word: it is not counted as a word you know, and you should check it. A word the pack does not know at all gets no reading, and the card says so.',
    examples: [
      { surface: '학생', gloss: 'student', note: 'in the dictionary: a confirmed reading' },
    ],
  },
];

export const KO_TUTORIAL: Tutorial = orientation({
  languageId: 'ko',
  languageName: 'Korean',
  practice: { instruction: 'Select 학생들이 and look at the card: the noun 학생, the plural marker 들 and the subject particle 이 are shown as separate parts.', sentence: '학생들이 학교에서 공부했습니다.', target: '학생들이' },
  cardFeatureNote: 'For a Korean word the card shows the dictionary form (a verb ends in 다), its class (a descriptive verb conjugates like any verb), the word in parts (a noun with its particles; a stem with its endings, each with its job), the grammar features of the exact form (the plural 들, the topic particle, the past, the honorific -(으)시-, the speech level, the irregular class the form shows), a construction such as -고 있다 when the words make one, the pronunciation as the standard rules give it (with Revised Romanization only as an aid, if you have turned transliteration on), and the Hanja when the dictionary states them. A word that could be one of several entries spelled alike says so.',
  thin: [
    'Korean is read by rules over a Wiktionary stem lexicon, not by a statistical analyser; a stem the lexicon does not hold gets an unconfirmed reading with no meaning.',
    'There is no curated frequency list; homonyms carry the dictionary’s own entry numbers and for 769 of the 2,496 sets of spelled-alike words a decision was drafted by a language model and checked by no person; a word the sentence cannot settle is shown as undecided.',
    'Proper names are the weakest part (about 44 % are covered) and numerals are thin; an irregular verb is known as irregular only where the source has its conjugation table.',
    'No Bible text is bundled with the pack, and its literary endings are named but not taught in depth.',
    'Nothing has been reviewed by a native speaker or a Korean teacher.',
  ],
  sound: { id: 'sound-and-audio', body: soundBody('Korean', '; the pack writes the standard pronunciation as a Hangul respelling (한국어 is said [한구거]), which is the pronunciation and not the spelling', '; a remote Azure voice is available only with your consent and key') },
  languageSteps: KO_TUTORIAL_STEPS_OWN,
  notice: 'This orientation was drafted by an AI model and has not been checked by a native speaker of Korean or a Korean teacher. It covers how to select a word, what the card shows, Hangul, the order of a sentence, particles, verb endings, the two kinds of respect, the parts of a word, homonyms and unconfirmed readings; it does not teach vocabulary or grammar in depth. You can skip it and come back at any time.',
});

export const KO_TUTORIAL_STEPS: TutorialStep[] = KO_TUTORIAL.steps;

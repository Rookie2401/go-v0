/**
 * GoTell test fixtures: fake adapters for es / th / hi with hand-written lexicons and checkProduction
 * rules, plus learner histories (Learner A = beginner story vocabulary; Learner B = has met guilt /
 * conviction / repentance / forgiveness and the phrase "I began to understand …").
 */
import { buildFixtureText, makeFakeAdapter } from './fakes';
import type { FakeLex, World } from './fakes';
import type { FixtureSentence, LanguageCode } from '../../src/core';

/** What a custom SuggestionProvider must still fill in; the service replaces these with measured values. */
export const PLACEHOLDER_HONESTY = { scope: 'partial' as const, remainingIssues: [] as string[], checkerCoverage: '', sources: [] as never[] };

const L = (lemma: string, pos: FakeLex['pos'], gloss?: string, morph?: Record<string, string>): FakeLex => ({ lemma, pos, gloss, morph });

// ───────────────────────── Spanish ─────────────────────────
export const ES_LEXICON: Record<string, FakeLex> = {
  yo: L('yo', 'PRON', 'I', { Case: 'Nom' }), me: L('yo', 'PRON'), mi: L('mi', 'DET', 'my'), cuando: L('cuando', 'SCONJ', 'when'),
  era: L('ser', 'AUX', 'was'), joven: L('joven', 'ADJ', 'young'), 'conocía': L('conocer', 'VERB', 'knew'), de: L('de', 'ADP'),
  'jesús': L('jesús', 'PROPN', 'Jesus'), pero: L('pero', 'CONJ', 'but'), no: L('no', 'PART', 'not'), y: L('y', 'CONJ', 'and'),
  entender: L('entender', 'VERB', 'understand'), 'entendía': L('entender', 'VERB', 'understood'), pecado: L('pecado', 'NOUN', 'sin'),
  el: L('el', 'DET'), la: L('la', 'DET'), una: L('uno', 'DET'), casa: L('casa', 'NOUN', 'house'),
  'sé': L('saber', 'VERB', 'know'), 'sabía': L('saber', 'VERB', 'knew'), creo: L('creer', 'VERB', 'believe'), en: L('en', 'ADP'),
  'empecé': L('empezar', 'VERB', 'began'), a: L('a', 'ADP'), verdad: L('verdad', 'NOUN', 'truth'),
  culpa: L('culpa', 'NOUN', 'guilt'), 'convicción': L('convicción', 'NOUN', 'conviction'), 'perdón': L('perdón', 'NOUN', 'forgiveness'),
  'arrepentí': L('arrepentir', 'VERB', 'repented'), dios: L('dios', 'PROPN', 'God'), dio: L('dar', 'VERB', 'gave'), 'sentí': L('sentir', 'VERB', 'felt'),
  creer: L('creer', 'VERB', 'believe'), tiene: L('tener', 'VERB', 'has'), tengo: L('tener', 'VERB', 'have'), cinco: L('cinco', 'NUM', 'five'),
  'año': L('año', 'NOUN', 'year'), 'años': L('año', 'NOUN', 'years'), 'un': L('uno', 'DET'), 'día': L('día', 'NOUN', 'day'),
  sobre: L('sobre', 'ADP', 'about'),
};

export const ES_RULES = [
  { match: ['el', 'casa'], replace: ['la', 'casa'], category: 'agreement' as const, message: '"casa" is feminine: use "la".' },
  { match: ['no', 'entender'], replace: ['no', 'entendía'], category: 'conjugation' as const, message: 'Use a conjugated verb, not the infinitive.' },
  { match: ['sé', 'en'], replace: ['creo', 'en'], category: 'lexical-choice' as const, message: 'You "believe in" someone; "saber en" is not used.', affectsMeaning: true },
  { match: ['conocía', 'en'], replace: ['sabía', 'en'], category: 'lexical-choice' as const, message: 'Another verb fits here.' },
];
export const ES_PHRASE = ['empecé', 'a', 'entender', '_'];

export const esAdapter = () => makeFakeAdapter({ lang: 'es', lexicon: ES_LEXICON, rules: ES_RULES, phrases: [ES_PHRASE] });

/**
 * The three Spanish checker rules A2 added to the real adapter (yo + infinitive, yo tiene -> tengo, numeral +
 * singular noun), as a fake - for the cases that need a detected-but-unfixable rule (partial scope), which the real
 * adapter cannot be made to produce. The acceptance sentence is ALSO tested against the real adapter (scope.test.ts).
 */
export const ES_ACCEPT_RULES = [
  { match: ['yo', 'creer'], replace: ['yo', 'creo'], category: 'conjugation' as const, message: 'After "yo" use the conjugated verb ("creo"), not the infinitive.' },
  { match: ['yo', 'tiene'], replace: ['yo', 'tengo'], category: 'conjugation' as const, message: '"yo" goes with "tengo", not "tiene".' },
  { match: ['cinco', 'año'], replace: ['cinco', 'años'], category: 'agreement' as const, message: 'After a number above one the noun is plural ("años").' },
];
export const esAcceptAdapter = (rules = ES_ACCEPT_RULES) => makeFakeAdapter({ lang: 'es', lexicon: ES_LEXICON, rules: [...ES_RULES, ...rules], phrases: [ES_PHRASE] });
export const ES_ACCEPT_DRAFT = 'Yo creer en Dios. Yo tiene cinco año.';

/** "Cuando yo era joven yo conocía de Jesús pero yo no entender mi pecado." (learner's rough draft) */
export const ES_ROUGH = 'Cuando yo era joven yo conocía de Jesús pero yo no entender mi pecado.';

// ───────────────────────── Thai ─────────────────────────
export const TH_LEXICON: Record<string, FakeLex> = {
  'ตอน': L('ตอน', 'NOUN', 'time'), 'เด็ก': L('เด็ก', 'NOUN', 'child'), 'ฉัน': L('ฉัน', 'PRON', 'I', { Case: 'Nom' }),
  'รู้จัก': L('รู้จัก', 'VERB', 'know'), 'พระเยซู': L('พระเยซู', 'PROPN', 'Jesus'), 'แต่': L('แต่', 'CONJ', 'but'),
  'ไม่': L('ไม่', 'PART', 'not'), 'เข้าใจ': L('เข้าใจ', 'VERB', 'understand'), 'บาป': L('บาป', 'NOUN', 'sin'),
  'ของ': L('ของ', 'ADP', 'of'), 'เริ่ม': L('เริ่ม', 'VERB', 'begin'), 'ความผิด': L('ความผิด', 'NOUN', 'guilt'),
  'อภัย': L('อภัย', 'VERB', 'forgive'), 'พระเจ้า': L('พระเจ้า', 'PROPN', 'God'), 'ให้': L('ให้', 'VERB', 'give'),
};
export const TH_PHRASE = ['เริ่ม', 'เข้าใจ', '_'];
export const thAdapter = () => makeFakeAdapter({ lang: 'th', lexicon: TH_LEXICON, phrases: [TH_PHRASE] });
/** "when I was young I knew Jesus but I did not understand my sin" — no spaces inside the sentence. */
export const TH_ROUGH = 'ตอนเด็กฉันรู้จักพระเยซูแต่ฉันไม่เข้าใจบาปของฉัน';
export const TH_ROUGH_TOKENS = ['ตอน', 'เด็ก', 'ฉัน', 'รู้จัก', 'พระเยซู', 'แต่', 'ฉัน', 'ไม่', 'เข้าใจ', 'บาป', 'ของ', 'ฉัน'];

// ───────────────────────── Hindi ─────────────────────────
export const HI_LEXICON: Record<string, FakeLex> = {
  'जब': L('जब', 'SCONJ', 'when'), 'मैं': L('मैं', 'PRON', 'I', { Case: 'Nom' }), 'छोटा': L('छोटा', 'ADJ', 'small'), 'छोटी': L('छोटा', 'ADJ', 'small'),
  'था': L('होना', 'AUX'), 'थी': L('होना', 'AUX'), 'स्कूल': L('स्कूल', 'NOUN', 'school'), 'गया': L('जाना', 'VERB', 'went'), 'गई': L('जाना', 'VERB', 'went'),
  'अपना': L('अपना', 'DET', 'own'), 'पाप': L('पाप', 'NOUN', 'sin'), 'समझ': L('समझना', 'VERB', 'understand'), 'समझने': L('समझना', 'VERB', 'understand'),
  'लगा': L('लगना', 'AUX'), 'नहीं': L('नहीं', 'PART', 'not'),
};
export const HI_RULES = [
  { match: ['गया'], replace: ['गई'], category: 'agreement' as const, message: 'Feminine speaker: use the feminine form of the verb.', requires: ['छोटी'] },
];
export const HI_PHRASE = ['_', 'समझने', 'लगा'];
export const hiAdapter = () => makeFakeAdapter({ lang: 'hi', lexicon: HI_LEXICON, rules: HI_RULES, phrases: [HI_PHRASE] });

// ───────────────────────── fixture texts + learner histories ─────────────────────────

type Tk = ReturnType<typeof tokFrom>;
const PUNCT = new Set(['.', ',', '!', '?', '।']);
function tokFrom(lexicon: Record<string, FakeLex>, surface: string) {
  if (PUNCT.has(surface)) return { surface, isWord: false };
  const l = lexicon[surface.normalize('NFC').toLowerCase()];
  return { surface, lemma: l?.lemma, pos: l?.pos, gloss: l?.gloss };
}
/** Explicit, hand-authored token lists (space-separated here only because the fixture text is authored that way). */
export const sentence = (lexicon: Record<string, FakeLex>, words: string, extra: Partial<FixtureSentence> = {}): FixtureSentence => ({
  tokens: words.split(' ').map((w): Tk => tokFrom(lexicon, w)),
  ...extra,
});

/** The learner has met "Yo creo en Dios." and "Yo tengo cinco años." (Story C) - so creo / tengo / años are encountered. */
export async function esStoryC(w: World, userId: string, level: Parameters<World['golearn']['learnText']>[2] = 'recognized') {
  const t = await buildFixtureText(w.store, {
    lang: 'es', slug: 'story-c', title: 'Story C', kind: 'story', sentences: [
      sentence(ES_LEXICON, 'Yo creo en Dios .', { english: 'I believe in God.' }),
      sentence(ES_LEXICON, 'Yo tengo cinco años .', { english: 'I am five years old.' }),
    ],
  });
  await w.golearn.learnText(userId, t.id, level);
  return t;
}

/** Scripture B2: "Un día empecé a entender mi pecado." with the phrase "empecé a entender _" and an English line. */
export async function esScriptureIntent(w: World, userId: string) {
  const t = await buildFixtureText(w.store, {
    lang: 'es', slug: 'scripture-i', title: 'Scripture I', kind: 'scripture', scripture: { book: 'ROM', chapter: 7 }, sentences: [
      sentence(ES_LEXICON, 'Un día empecé a entender mi pecado .', {
        english: 'One day I began to understand my sin.',
        phrases: [{ pattern: ['empecé', 'a', 'entender', '_'], display: 'empecé a entender …', tokenIndexes: [2, 3, 4] }],
      }),
      sentence(ES_LEXICON, 'Yo no entendía mi pecado .', { english: 'I did not understand my sin.' }),
    ],
  });
  await w.golearn.learnText(userId, t.id);
  return t;
}

export async function esStoryA(w: World, userId: string) {
  const t = await buildFixtureText(w.store, {
    lang: 'es', slug: 'story-a', title: 'Story A', kind: 'story', sentences: [
      sentence(ES_LEXICON, 'Cuando yo era joven .'),
      sentence(ES_LEXICON, 'Yo conocía de Jesús pero yo no sé .'),
      sentence(ES_LEXICON, 'La casa .'),
    ],
  });
  await w.golearn.learnText(userId, t.id);
  return t;
}

/** B: story vocabulary + a scripture fixture with guilt / conviction / repentance / forgiveness and "empecé a entender …". */
export async function esLearnerB(w: World, userId: string) {
  await esStoryA(w, userId);
  const t = await buildFixtureText(w.store, {
    lang: 'es', slug: 'scripture-b', title: 'Scripture B', kind: 'scripture', scripture: { book: 'ROM', chapter: 7 }, sentences: [
      sentence(ES_LEXICON, 'Sentí culpa y convicción .'),
      sentence(ES_LEXICON, 'Me arrepentí y Dios me dio perdón .'),
      sentence(ES_LEXICON, 'Empecé a entender la verdad .', { phrases: [{ pattern: ['empecé', 'a', 'entender', '_'], display: 'empecé a entender …', tokenIndexes: [0, 1, 2] }] }),
      sentence(ES_LEXICON, 'Yo no entendía mi pecado .'),
    ],
  });
  await w.golearn.learnText(userId, t.id);
  return t;
}

export async function thStoryA(w: World, userId: string) {
  const t = await buildFixtureText(w.store, {
    lang: 'th', slug: 'story-a', kind: 'story', sentences: [
      { tokens: ['ตอน', 'เด็ก', 'ฉัน', 'รู้จัก', 'พระเยซู'].map((s) => tokFrom(TH_LEXICON, s)) },
      { tokens: ['ฉัน', 'ไม่', 'รู้จัก', 'แต่', 'ฉัน', 'รู้จัก'].map((s) => tokFrom(TH_LEXICON, s)) },
    ],
  });
  await w.golearn.learnText(userId, t.id);
  return t;
}

export async function thLearnerB(w: World, userId: string) {
  await thStoryA(w, userId);
  const t = await buildFixtureText(w.store, {
    lang: 'th', slug: 'scripture-b', kind: 'scripture', scripture: { book: 'ROM', chapter: 7 }, sentences: [
      { tokens: ['ฉัน', 'เริ่ม', 'เข้าใจ', 'ความผิด'].map((s) => tokFrom(TH_LEXICON, s)), phrases: [{ pattern: ['เริ่ม', 'เข้าใจ', '_'], display: 'เริ่มเข้าใจ…', tokenIndexes: [1, 2] }] },
      { tokens: ['พระเจ้า', 'ให้', 'อภัย', 'บาป'].map((s) => tokFrom(TH_LEXICON, s)) },
    ],
  });
  await w.golearn.learnText(userId, t.id);
  return t;
}

export async function hiLearner(w: World, userId: string, lang: LanguageCode = 'hi') {
  const t = await buildFixtureText(w.store, {
    lang, slug: 'story-hi', kind: 'story', sentences: [
      sentence(HI_LEXICON, 'जब मैं छोटी थी मैं स्कूल गई ।'),
      sentence(HI_LEXICON, 'जब मैं छोटा था मैं स्कूल गया ।'),
      sentence(HI_LEXICON, 'मैं समझने लगा ।', { phrases: [{ pattern: ['_', 'समझने', 'लगा'], display: '… समझने लगा', tokenIndexes: [1, 2] }] }),
      sentence(HI_LEXICON, 'अपना पाप नहीं समझ ।'),
    ],
  });
  await w.golearn.learnText(userId, t.id);
  return t;
}

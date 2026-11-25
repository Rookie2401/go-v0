/**
 * A hand-written stem lexicon for the Korean morphology tests (never the real lexicon). Every word the tests read is here with its class,
 * conjugation class, gloss and, for a homonym, its number and its set's state (alone / main / other / balanced, docs/korean/PLAN.md
 * "Identities"). Counts (`n`) are rough orders of magnitude chosen to make the commonest word of a look-alike pair come first, as the
 * priors corpus would.
 */
import { type KoLexEntry, type KoLexicon, installKoreanLexicon, koStemKey, uninstallKoreanLexicon } from '../../../src/adapters/korean/index-store';
import { koClearAnalysisCache } from '../../../src/adapters/korean/analyze';

export const FIXTURE_ID = 'ko-test-fixture';

type Row = [lemma: string, tag: KoLexEntry['tag'], irr: KoLexEntry['irr'] | '', gloss: string, extra?: Partial<KoLexEntry>];

export const FIXTURE_ROWS: readonly Row[] = [
  // nouns, pronouns, numerals, bound nouns
  ['학생', 'NNG', '', 'student', { hanja: '學生', n: 3000 }], ['학교', 'NNG', '', 'school', { hanja: '學校', n: 4000 }], ['한국어', 'NNG', '', 'the Korean language', { hanja: '韓國語', n: 800 }],
  ['대한민국', 'NNP', '', 'the Republic of Korea', { hanja: '大韓民國', n: 300 }],
  ['친구', 'NNG', '', 'friend', { n: 2000 }], ['집', 'NNG', '', 'house, home', { n: 3000 }], ['책', 'NNG', '', 'book', { n: 2000 }],
  ['사람', 'NNG', '', 'person', { n: 9000 }], ['물', 'NNG', '', 'water', { n: 2000 }], ['밥', 'NNG', '', 'rice, a meal', { n: 1500 }],
  ['의사', 'NNG', '', 'doctor', { hanja: '醫師', n: 600 }], ['선생', 'NNG', '', 'teacher', { n: 500 }], ['선생님', 'NNG', '', 'teacher (honorific)', { n: 2500 }],
  ['공부', 'NNG', '', 'study', { n: 1200 }], ['사용', 'NNG', '', 'use', { n: 900 }], ['운동', 'NNG', '', 'exercise', { n: 700 }], ['사랑', 'NNG', '', 'love', { n: 1500 }],
  ['청소', 'NNG', '', 'cleaning', { n: 200 }], ['시작', 'NNG', '', 'beginning', { n: 800 }], ['생각', 'NNG', '', 'thought', { n: 3000 }], ['말씀', 'NNG', '', 'words (honorific)', { n: 400 }],
  ['일', 'NNG', '', 'work; matter', { n: 6000 }], ['일', 'NR', '', 'one', { n: 2000 }],
  ['이', 'NNG', '', 'tooth', { n: 100 }], ['이', 'NR', '', 'two', { n: 900 }], ['이', 'MM', '', 'this', { n: 8000 }], ['이', 'NP', '', 'this one; this person', { n: 1000 }],
  ['하나', 'NR', '', 'one', { n: 1500 }], ['한', 'MM', '', 'one (before a counter)', { n: 4000 }], ['둘', 'NR', '', 'two', { n: 500 }],
  ['나', 'NP', '', 'I, me', { n: 7000 }], ['너', 'NP', '', 'you', { n: 3000 }], ['저', 'NP', '', 'I, me (humble)', { n: 4000 }], ['저', 'MM', '', 'that (over there)', { n: 1500 }],
  ['누구', 'NP', '', 'who', { n: 1000 }], ['이것', 'NP', '', 'this (thing)', { n: 1500 }], ['그것', 'NP', '', 'that (thing)', { n: 2000 }], ['저것', 'NP', '', 'that (thing over there)', { n: 300 }],
  ['무엇', 'NP', '', 'what', { n: 1200 }], ['뭐', 'NP', '', 'what (spoken)', { n: 2000 }], ['그', 'NP', '', 'he; that person', { n: 6000 }], ['그', 'MM', '', 'that', { n: 9000 }],
  ['여기', 'NP', '', 'here', { n: 2000 }], ['거기', 'NP', '', 'there', { n: 1500 }], ['저기', 'NP', '', 'over there', { n: 600 }], ['걔', 'NP', '', 'that kid (contraction of 그 애)', { n: 200 }],
  ['수', 'NNB', '', 'way, means (-(으)ㄹ 수 있다)', { n: 6000 }], ['것', 'NNB', '', 'thing; the fact', { n: 20000 }], ['데', 'NNB', '', 'place; case', { n: 2000 }],
  ['때문', 'NNB', '', 'reason, because of', { n: 2000 }], ['년', 'NNB', '', 'year (counter)', { clf: true, n: 3000 }], ['개', 'NNB', '', 'piece, item (counter)', { clf: true, n: 2000 }],
  ['가지', 'NNG', '', 'branch', { n: 300 }], ['가게', 'NNG', '', 'shop', { n: 500 }], ['감', 'NNG', '', 'persimmon', { n: 100 }], ['자', 'NNG', '', 'ruler (for measuring)', { n: 100 }],
  ['산', 'NNG', '', 'mountain', { hanja: '山', n: 1200 }], ['들', 'NNG', '', 'field, plain', { n: 100 }], ['안', 'NNG', '', 'inside', { n: 3000 }], ['안', 'MAG', '', 'not', { n: 5000 }],
  ['잘', 'MAG', '', 'well', { n: 4000 }], ['다', 'MAG', '', 'all, everything', { n: 6000 }], ['빨리', 'MAG', '', 'quickly', { n: 800 }], ['아주', 'MAG', '', 'very', { n: 1500 }],
  ['그리고', 'MAJ', '', 'and', { n: 3000 }], ['네', 'IC', '', 'yes', { n: 2000 }], ['아', 'IC', '', 'ah', { n: 1000 }],
  ['서울', 'NNP', '', 'Seoul', { n: 1000 }], ['커피', 'NNG', '', 'coffee', { n: 300 }], ['나라', 'NNG', '', 'country', { n: 1500 }], ['비', 'NNG', '', 'rain', { n: 800 }],
  ['때', 'NNG', '', 'time, moment', { n: 6000 }], ['오늘', 'NNG', '', 'today', { n: 2500 }], ['지금', 'NNG', '', 'now', { n: 3000 }], ['문', 'NNG', '', 'door', { n: 900 }], ['손', 'NNG', '', 'hand', { n: 1500 }],
  ['님', 'XSN', '', 'honorific suffix (Mr, Ms; esteemed)'], ['씨', 'XSN', '', 'Mr, Ms (after a name)'], ['적', 'XSN', '', '-ic, -al (of the nature of)'],
  ['문화', 'NNG', '', 'culture', { n: 700 }],
  // homonym sets: balanced
  ['눈', 'NNG', '', 'eye', { hom: 1, set: 'balanced', n: 2000 }], ['눈', 'NNG', '', 'snow', { hom: 2, set: 'balanced', n: 2000 }],
  ['배', 'NNG', '', 'stomach, belly', { hom: 1, set: 'balanced', n: 1500 }], ['배', 'NNG', '', 'boat, ship', { hom: 2, set: 'balanced', n: 1500 }], ['배', 'NNG', '', 'pear', { hom: 3, set: 'balanced', n: 1500 }],
  ['말', 'NNG', '', 'horse', { hom: 1, set: 'balanced', n: 3000 }], ['말', 'NNG', '', 'speech, words', { hom: 2, set: 'balanced', n: 3000 }],
  ['묻다', 'VV', 'D', 'to ask', { hom: 1, set: 'balanced', n: 800 }], ['묻다', 'VV', 'R', 'to bury', { hom: 2, set: 'balanced', n: 800 }], ['묻다', 'VV', 'R', 'to stick, get on (of dirt)', { hom: 3, set: 'balanced', n: 800 }],
  ['걷다', 'VV', 'D', 'to walk', { hom: 1, set: 'balanced', n: 600 }], ['걷다', 'VV', 'R', 'to gather, roll up', { hom: 2, set: 'balanced', n: 600 }],
  ['쓰다', 'VV', 'R', 'to write', { hom: 1, set: 'balanced', n: 3000 }], ['쓰다', 'VV', 'R', 'to use', { hom: 2, set: 'balanced', n: 3000 }], ['쓰다', 'VV', 'R', 'to wear (a hat)', { hom: 3, set: 'balanced', n: 3000 }],
  ['쓰다', 'VA', 'R', 'bitter', { n: 200 }],
  ['이르다', 'VV', 'Reo', 'to reach, arrive at', { hom: 2, set: 'balanced', n: 500 }], ['이르다', 'VV', 'Reu', 'to tell, say', { hom: 3, set: 'balanced', n: 500 }],
  ['이르다', 'VA', 'Reu', 'early', { n: 200 }],
  // homonym sets: main and other
  ['시간', 'NNG', '', 'time', { hom: 1, set: 'main', hanja: '時間', n: 5000 }], ['시간', 'NNG', '', 'necrophilia', { hom: 2, set: 'other', hanja: '屍姦', n: 5000 }],
  ['시간', 'NNG', '', 'periodical publication', { hom: 3, set: 'other', hanja: '時刊', n: 5000 }],
  ['듣다', 'VV', 'D', 'to hear, listen', { hom: 1, set: 'main', n: 2000 }], ['듣다', 'VV', 'R', 'to drip (of tears, rain)', { hom: 2, set: 'other', n: 2000 }],
  // predicates
  ['먹다', 'VV', 'R', 'to eat', { n: 3000 }], ['가다', 'VV', 'R', 'to go', { n: 9000 }], ['오다', 'VV', 'R', 'to come', { n: 8000 }], ['보다', 'VV', 'R', 'to see', { n: 9000 }],
  ['주다', 'VV', 'R', 'to give', { n: 6000 }], ['하다', 'VV', 'Ha', 'to do', { n: 30000 }], ['공부하다', 'VV', 'Ha', 'to study', { n: 800 }], ['사용하다', 'VV', 'Ha', 'to use', { n: 700 }],
  ['사용되다', 'VV', 'R', 'to be used', { n: 300, voice: 'Pass', base: '사용하다' }], ['사랑하다', 'VV', 'Ha', 'to love', { n: 900 }], ['시작하다', 'VV', 'Ha', 'to begin', { n: 900 }],
  ['생각하다', 'VV', 'Ha', 'to think', { n: 3000 }], ['말하다', 'VV', 'Ha', 'to speak, say', { n: 3000 }], ['깨끗하다', 'VA', 'Ha', 'clean', { n: 200 }],
  ['마시다', 'VV', 'R', 'to drink', { n: 900 }], ['되다', 'VV', 'R', 'to become', { n: 12000 }], ['보내다', 'VV', 'R', 'to send', { n: 1000 }], ['서다', 'VV', 'R', 'to stand', { n: 800 }],
  ['켜다', 'VV', 'R', 'to switch on', { n: 200 }], ['크다', 'VA', 'R', 'big', { n: 3000 }], ['바쁘다', 'VA', 'R', 'busy', { n: 400 }], ['예쁘다', 'VA', 'R', 'pretty', { n: 600 }],
  ['아프다', 'VA', 'R', 'sick, painful', { n: 500 }], ['기쁘다', 'VA', 'R', 'glad', { n: 300 }],
  ['들다', 'VV', 'R', 'to hold; to enter', { n: 3000 }], ['물다', 'VV', 'R', 'to bite', { n: 300 }],
  ['닫다', 'VV', 'R', 'to close', { n: 300 }], ['받다', 'VV', 'R', 'to receive', { n: 4000 }], ['달다', 'VA', 'R', 'sweet', { n: 200 }],
  ['춥다', 'VA', 'B', 'cold', { n: 400 }], ['덥다', 'VA', 'B', 'hot', { n: 300 }], ['돕다', 'VV', 'B', 'to help', { n: 800 }], ['곱다', 'VA', 'B', 'fine, lovely', { n: 100 }],
  ['아름답다', 'VA', 'B', 'beautiful', { n: 500 }], ['굽다', 'VV', 'B', 'to bake, roast', { n: 100 }], ['눕다', 'VV', 'B', 'to lie down', { n: 300 }],
  ['잡다', 'VV', 'R', 'to catch, hold', { n: 1500 }], ['입다', 'VV', 'R', 'to wear (clothes)', { n: 800 }],
  ['짓다', 'VV', 'S', 'to build; to make', { n: 700 }], ['낫다', 'VV', 'S', 'to recover, get better', { n: 300 }], ['붓다', 'VV', 'S', 'to pour', { n: 200 }],
  ['웃다', 'VV', 'R', 'to laugh, smile', { n: 1200 }], ['씻다', 'VV', 'R', 'to wash', { n: 400 }],
  ['하얗다', 'VA', 'H', 'white', { n: 300 }], ['그렇다', 'VA', 'H', 'so, like that', { n: 6000 }], ['어떻다', 'VA', 'H', 'how, what like', { n: 3000 }],
  ['빨갛다', 'VA', 'H', 'red', { n: 300 }], ['누렇다', 'VA', 'H', 'yellow, brownish', { n: 50 }], ['파랗다', 'VA', 'H', 'blue', { n: 200 }],
  ['좋다', 'VA', 'R', 'good', { n: 6000 }], ['넣다', 'VV', 'R', 'to put in', { n: 900 }], ['놓다', 'VV', 'R', 'to put, place', { n: 1500 }], ['많다', 'VA', 'R', 'many, much', { n: 4000 }],
  ['괜찮다', 'VA', 'R', 'all right', { n: 1500 }], ['싫다', 'VA', 'R', 'disliked', { n: 500 }],
  ['모르다', 'VV', 'Reu', 'not to know', { n: 3000 }], ['부르다', 'VV', 'Reu', 'to call; to sing', { n: 1000 }], ['빠르다', 'VA', 'Reu', 'fast', { n: 500 }], ['다르다', 'VA', 'Reu', 'different', { n: 2000 }],
  ['따르다', 'VV', 'R', 'to follow', { n: 1200 }], ['치르다', 'VV', 'R', 'to pay; to undergo', { n: 300 }], ['푸르다', 'VA', 'Reo', 'blue, green', { n: 200 }], ['푸다', 'VV', 'U', 'to scoop', { n: 50 }],
  ['살다', 'VV', 'R', 'to live', { n: 3000 }], ['사다', 'VV', 'R', 'to buy', { n: 1500 }], ['만들다', 'VV', 'R', 'to make', { n: 3000 }], ['알다', 'VV', 'R', 'to know', { n: 6000 }],
  ['날다', 'VV', 'R', 'to fly', { n: 300 }], ['갈다', 'VV', 'R', 'to grind; to change', { n: 200 }], ['나다', 'VV', 'R', 'to come out, arise', { n: 2500 }],
  ['열다', 'VV', 'R', 'to open', { n: 800 }], ['놀다', 'VV', 'R', 'to play', { n: 900 }], ['울다', 'VV', 'R', 'to cry', { n: 700 }], ['길다', 'VA', 'R', 'long', { n: 600 }],
  ['있다', 'VV', 'R', 'to exist, be; to have', { n: 20000 }], ['없다', 'VA', 'R', 'not to exist; not to have', { n: 9000 }], ['계시다', 'VV', 'R', 'to be (honorific)', { n: 500 }],
  ['맛있다', 'VA', 'R', 'tasty', { n: 400 }], ['자다', 'VV', 'R', 'to sleep', { n: 1000 }], ['읽다', 'VV', 'R', 'to read', { n: 1000 }], ['앉다', 'VV', 'R', 'to sit', { n: 800 }],
  ['기다리다', 'VV', 'R', 'to wait', { n: 800 }], ['배우다', 'VV', 'R', 'to learn', { n: 800 }], ['가르치다', 'VV', 'R', 'to teach', { n: 600 }], ['만나다', 'VV', 'R', 'to meet', { n: 1500 }],
  ['일어나다', 'VV', 'R', 'to get up', { n: 900 }], ['보이다', 'VV', 'R', 'to be seen; to show', { n: 2000, voice: 'Pass', base: '보다' }], ['먹이다', 'VV', 'R', 'to feed', { n: 100, voice: 'Caus', base: '먹다' }],
  ['가지다', 'VV', 'R', 'to have, take', { n: 2500 }], ['내다', 'VV', 'R', 'to put out; to pay', { n: 2000 }], ['끝나다', 'VV', 'R', 'to end', { n: 800 }], ['쉬다', 'VV', 'R', 'to rest', { n: 600 }],
  ['깨닫다', 'VV', 'D', 'to realise', { n: 400 }], ['싣다', 'VV', 'D', 'to load', { n: 200 }], ['젓다', 'VV', 'S', 'to stir', { n: 100 }],
  ['보다', 'VV', 'R', 'to see', { n: 9000 }], ['놓이다', 'VV', 'R', 'to be placed', { n: 100, voice: 'Pass', base: '놓다' }], ['떨어지다', 'VV', 'R', 'to fall', { n: 800 }],
  ['긷다', 'VV', '', 'to draw (water)', { n: 10 }], ['체포', 'NNG', '', 'arrest', { n: 100 }],
  ['도', 'NNG', '', 'province', { n: 300, hanja: '道' }], ['봄', 'NNG', '', 'spring', { n: 800 }], ['미세', 'NNG', '', 'tininess', { n: 50, hanja: '微細' }], ['밀다', 'VV', 'R', 'to push', { n: 600 }],
  ['계속', 'NNG', '', 'continuation', { n: 900, hanja: '繼續' }], ['계속하다', 'VV', 'Ha', 'to continue', { n: 600 }], ['예산', 'NNG', '', 'budget', { n: 200, hanja: '豫算' }], ['상승', 'NNG', '', 'rise', { n: 200, hanja: '上昇' }],
  ['형제', 'NNG', '', 'brothers', { n: 300, hanja: '兄弟' }], ['애', 'XSN', '', '-philia, love of', { hanja: '愛' }], ['들르다', 'VV', 'R', 'to stop by', { n: 100 }], ['거룩하다', 'VA', 'Ha', 'holy', { n: 100 }],
  ['이루다', 'VV', 'R', 'to achieve', { n: 800 }], ['임하다', 'VV', 'Ha', 'to come upon, descend', { n: 50 }], ['복잡', 'XR', '', 'complexity (root)', { n: 100 }], ['그러나', 'MAG', '', 'but', { n: 3000 }],
  ['때문', 'NNB', '', 'reason', { n: 3000 }], ['같다', 'VA', 'R', 'same', { n: 3000 }], ['같이', 'MAG', '', 'together; like', { n: 1500 }], ['높다', 'VA', 'R', 'high', { n: 600 }], ['삶', 'NNG', '', 'life', { n: 600 }], ['존경', 'NNG', '', 'respect', { n: 100 }], ['걱정', 'NNG', '', 'worry', { n: 500 }],
  ['드리다', 'VV', 'R', 'to give (humble)', { n: 1500 }], ['주무시다', 'VV', 'R', 'to sleep (honorific)', { n: 100 }], ['누이', 'NNG', '', 'sister', { n: 50 }], ['하', 'NNG', '', 'last; below', { n: 50 }], ['만들어지다', 'VV', 'R', 'to be made', { n: 300 }],
];

export function fixtureLexicon(id = FIXTURE_ID): KoLexicon {
  const entries: Record<string, KoLexEntry[]> = {};
  const seen = new Set<string>();
  for (const [lemma, tag, irr, gloss, extra] of FIXTURE_ROWS) {
    const e: KoLexEntry = { lemma, tag, gloss, ...(irr ? { irr } : {}), ...(extra ?? {}) };
    const sig = `${lemma}|${tag}|${e.hom ?? 0}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    for (const k of [koStemKey(lemma, tag), ...(e.hanja ? [e.hanja] : [])]) (entries[k] ??= []).push(e);
  }
  return { schema: 1, id, source: { label: 'test fixture', licence: 'test', url: 'about:blank' }, built: '2026-11-25', entries };
}

export function installFixtureLexicon(id = FIXTURE_ID): void {
  installKoreanLexicon(fixtureLexicon(id));
  koClearAnalysisCache();
}
export function uninstallFixtureLexicon(id = FIXTURE_ID): void {
  uninstallKoreanLexicon(id);
  koClearAnalysisCache();
}

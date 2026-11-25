/**
 * Real Korean words and phrases for Alphabet Sprint decoding practice. Written for this deck (2026-11-25); MACHINE-DRAFTED, not reviewed
 * by a native speaker or a Korean teacher.
 *
 * Every word is a headword of the pack's compiled lexicon (src/adapters/korean/generated/core.ts: Wiktionary via kaikki.org, CC BY-SA 4.0;
 * test/language-packs/ko-alphabet.test.ts looks each one up there), spelled as the dictionary spells it, and glossed from that entry's own
 * meaning (the test also checks that each gloss agrees with the lexicon's). The words are common and concrete first, and a few are Scripture
 * words. A verb or descriptive verb is given in its dictionary form (먹다), as it is on a page's word cards.
 *
 * What the back of a card says about sound is computed, never typed: the Revised Romanization of the standard pronunciation while the learner is
 * early in the stages, then nothing, and from stage 6 on a Hangul respelling in brackets only where the sound differs from the spelling
 * (koWordPronunciation in ../letters-ko.ts). The seven words of stage 7 (the brief's own list) are always shown without romanization.
 */
import type { StarterPhrase, StarterWord } from '../types';
import { KO_STAGES, koFormStage, koWordPronunciation } from '../letters-ko';

/** [form, English gloss, weight 0..1]: a weight is how useful the word is to a beginner (1 = the brief's own words and the commonest). */
export type KoWordRow = readonly [form: string, gloss: string, weight: number];

const STAGE7 = new Set(KO_STAGES[6].words);
const SOURCE = 'written for this deck; headword and meaning checked against src/adapters/korean/generated/core.ts (Wiktionary via kaikki.org, CC BY-SA 4.0)';

export const KO_WORD_ROWS: readonly KoWordRow[] = [
  // the brief's stage 5 and stage 7 words
  ['한', 'one (before a noun)', 1], ['국', 'soup', 1], ['문', 'door', 1], ['말', 'speech, word; horse', 1], ['집', 'house, home', 1], ['밥', 'cooked rice; a meal', 1], ['책', 'book', 1],
  ['사람', 'person, human being', 1], ['한국', 'Korea', 1], ['학교', 'school', 1], ['나라', 'country', 1], ['친구', 'friend', 1], ['사랑', 'love', 1], ['하나님', 'God', 1],
  // pronouns, numbers, question words and the commonest small words
  ['나', 'I, me', 1], ['우리', 'we', 0.95], ['이', 'this', 0.95], ['그', 'that; he', 0.9], ['저', 'I (humble); that over there', 0.85], ['너', 'you (informal)', 0.7], ['하나', 'one', 0.95], ['두', 'two (before a noun)', 0.8],
  ['어디', 'where', 0.85], ['누구', 'who', 0.85], ['무엇', 'what', 0.8], ['뭐', 'what', 0.8], ['얼마', 'how much', 0.7], ['여기', 'here', 0.85], ['거기', 'there', 0.8], ['저기', 'over there', 0.75],
  ['모두', 'all, everyone', 0.75], ['다', 'all', 0.7], ['더', 'more', 0.75], ['또', 'also; again', 0.7], ['잘', 'well', 0.75], ['안', 'not; inside', 0.7], ['아주', 'very', 0.7], ['정말', 'really', 0.7], ['지금', 'now', 0.8], ['너무', 'too (much)', 0.65], ['다시', 'again', 0.65], ['아직', 'still, yet', 0.6],
  // family and people
  ['아이', 'child', 0.95], ['어머니', 'mother', 0.9], ['아버지', 'father', 0.9], ['아기', 'baby', 0.75], ['아들', 'son', 0.8], ['딸', 'daughter', 0.8], ['아내', 'wife', 0.7], ['남편', 'husband', 0.7], ['부모', 'parents', 0.7], ['형', 'older brother (of a man)', 0.6],
  ['동생', 'younger sibling', 0.65], ['형제', 'brothers', 0.55], ['할머니', 'grandmother', 0.65], ['가족', 'family, household', 0.8], ['여자', 'woman', 0.8], ['남자', 'man', 0.8], ['어른', 'adult, grownup', 0.6], ['주인', 'owner, master', 0.5],
  ['학생', 'student', 0.85], ['선생님', 'teacher', 0.8], ['의사', 'doctor', 0.7],
  // nature, place and things
  ['나무', 'tree', 0.9], ['바다', 'sea', 0.85], ['하늘', 'sky', 0.85], ['물', 'water', 0.95], ['불', 'fire', 0.75], ['산', 'mountain', 0.8], ['강', 'river', 0.75], ['달', 'moon', 0.7], ['별', 'star', 0.7], ['해', 'sun', 0.7], ['비', 'rain', 0.7],
  ['바람', 'wind', 0.7], ['구름', 'cloud', 0.55], ['꽃', 'flower', 0.8], ['땅', 'earth, ground', 0.7], ['빛', 'light', 0.65], ['눈', 'eye; snow', 0.75], ['눈물', 'tears', 0.5], ['새', 'bird; new', 0.7], ['개', 'dog', 0.65], ['닭', 'chicken', 0.55],
  ['물고기', 'fish', 0.6], ['뿌리', 'root', 0.4], ['마을', 'village', 0.55], ['도시', 'city', 0.65], ['길', 'road, way', 0.75], ['서울', 'Seoul', 0.7], ['일본', 'Japan', 0.6], ['미국', 'the United States', 0.6],
  ['공원', 'park', 0.55], ['은행', 'bank; ginkgo', 0.55], ['시장', 'market; mayor', 0.6], ['박물관', 'museum', 0.45], ['회사', 'company', 0.65], ['교회', 'church', 0.7], ['대학', 'college, university', 0.6], ['방', 'room', 0.75],
  ['옷', 'clothes, clothing', 0.75], ['신발', 'shoes', 0.65], ['구두', 'dress shoes', 0.55], ['바지', 'pants, trousers', 0.55], ['시계', 'clock, watch', 0.6], ['종이', 'paper', 0.55], ['사진', 'photograph', 0.7], ['신문', 'newspaper', 0.65], ['돈', 'money', 0.8],
  ['지도', 'map; guidance', 0.55], ['소리', 'sound', 0.65], ['자리', 'seat, place', 0.6], ['선물', 'gift', 0.6], ['전화', 'telephone', 0.65], ['영화', 'movie, film', 0.65], ['음악', 'music', 0.7], ['음식', 'food', 0.7], ['쌀', 'uncooked rice', 0.6],
  ['우유', 'milk', 0.65], ['커피', 'coffee', 0.7], ['유리', 'glass', 0.45], ['위', 'above, on top', 0.6], ['뒤', 'back, behind', 0.65], ['앞', 'front, fore', 0.65], ['밖', 'outside', 0.6],
  // the body
  ['머리', 'head', 0.75], ['얼굴', 'face', 0.8], ['코', 'nose', 0.65], ['귀', 'ear', 0.65], ['손', 'hand', 0.75], ['발', 'foot', 0.7], ['몸', 'body', 0.7], ['마음', 'mind, heart', 0.85], ['힘', 'strength', 0.65], ['다리', 'leg; bridge', 0.6],
  // time
  ['오늘', 'today', 0.9], ['어제', 'yesterday', 0.75], ['내일', 'tomorrow', 0.75], ['아침', 'morning', 0.75], ['저녁', 'evening', 0.75], ['낮', 'daytime', 0.55], ['밤', 'night; chestnut', 0.65], ['하루', 'a day', 0.7], ['시간', 'time; hour', 0.8], ['때', 'time; dirt', 0.7],
  ['나이', 'age', 0.6], ['봄', 'spring', 0.6], ['여름', 'summer', 0.6], ['가을', 'autumn, fall', 0.6], ['겨울', 'winter', 0.6], ['여행', 'travel, a trip', 0.55], ['이름', 'name', 0.9],
  // abstract and Scripture words
  ['값', 'price', 0.6], ['삶', 'life', 0.6], ['꿈', 'dream', 0.6], ['끝', 'end', 0.65], ['뜻', 'meaning, will', 0.6], ['공부', 'study, learning', 0.7], ['운동', 'exercise', 0.6], ['약속', 'promise', 0.5], ['식사', 'a meal', 0.5], ['직업', 'job, occupation', 0.45], ['언어', 'language', 0.5],
  ['국민', 'citizens, the people of a nation', 0.4], ['학문', 'learning, scholarship', 0.4], ['독립', 'independence', 0.4], ['관련', 'connection, relation', 0.4], ['편리', 'convenience', 0.4], ['책임', 'responsibility', 0.45], ['국가', 'nation, state', 0.45], ['입구', 'entrance', 0.4], ['생명', 'life', 0.5],
  ['기도', 'prayer', 0.6], ['믿음', 'faith', 0.55], ['소망', 'hope', 0.5], ['죄', 'sin; fault', 0.5], ['말씀', 'word, speech (honorific)', 0.55], ['천국', 'heaven', 0.5], ['감사', 'gratitude, thanks', 0.55], ['구원', 'salvation, relief', 0.45], ['영혼', 'soul', 0.45],
  ['진리', 'truth', 0.45], ['평화', 'peace', 0.5], ['기쁨', 'joy', 0.5], ['십자가', 'cross', 0.45], ['성령', 'the Holy Spirit', 0.45], ['예수', 'Jesus', 0.65],
  // verbs, descriptive verbs and adverbs in their dictionary form
  ['가다', 'to go', 0.9], ['오다', 'to come', 0.9], ['보다', 'to see, to watch', 0.9], ['주다', 'to give', 0.85], ['자다', 'to sleep', 0.8], ['사다', 'to buy', 0.8], ['하다', 'to do', 0.95], ['마시다', 'to drink', 0.8], ['먹다', 'to eat', 0.9],
  ['읽다', 'to read', 0.8], ['쓰다', 'to write; to wear; to spend', 0.8], ['알다', 'to know', 0.8], ['모르다', 'to not know', 0.8], ['살다', 'to live', 0.8], ['만나다', 'to meet', 0.75], ['배우다', 'to learn', 0.7], ['가르치다', 'to teach', 0.65],
  ['있다', 'to be, to exist; to have', 0.9], ['없다', 'to have none, to not exist', 0.9], ['아니다', 'to not be', 0.9], ['크다', 'to be big', 0.8], ['작다', 'to be small', 0.75], ['많다', 'to be many, to be much', 0.8], ['좋다', 'to be good', 0.9], ['같다', 'to be the same, to be like', 0.7],
  ['아프다', 'to be painful, to hurt', 0.7], ['다르다', 'to be different', 0.65], ['높다', 'to be high', 0.6], ['낮다', 'to be low', 0.55], ['길다', 'to be long', 0.55], ['짧다', 'to be short', 0.5], ['넓다', 'to be wide', 0.5], ['믿다', 'to trust, to believe', 0.55],
  ['같이', 'together with', 0.6], ['굳이', 'needlessly; insisting (on doing)', 0.3], ['붙이다', 'to attach, to stick', 0.35],
];

const isNominal = (form: string): boolean => !(form.length > 1 && form.endsWith('다'));

function wordOf([form, gloss, weight]: KoWordRow): StarterWord {
  const stage = Math.max(koFormStage(form), STAGE7.has(form) ? 7 : 0);
  const pronunciation = koWordPronunciation(form, stage, isNominal(form));
  return { form: form.normalize('NFC'), gloss, ...(pronunciation ? { pronunciation } : {}), weight, source: SOURCE };
}

/** The starter words, most useful first. A word the profile cannot model is not left out here (it is never offered: the profile's dependencies are undefined for it). */
export const WORDS: readonly StarterWord[] = KO_WORD_ROWS.map(wordOf).sort((a, b) => b.weight - a.weight);

/** [phrase, English, weight not needed]. Each is correct, ordinary Korean. */
const PHRASE_ROWS: ReadonlyArray<readonly [string, string]> = [
  ['안녕하세요', 'Hello (polite)'],
  ['감사합니다', 'Thank you (formal)'],
  ['저는 학생이에요', 'I am a student'],
  ['이름이 뭐예요?', 'What is your name?'],
  ['한국 사람이에요', 'I am / he is / she is a Korean person'],
  ['사랑해요', 'I love you (polite)'],
  ['하나님은 사랑이십니다', 'God is love (honorific, formal)'],
  ['책이 있어요', 'There is a book; I have a book'],
  ['물 주세요', 'Please give me water'],
  ['어디예요?', 'Where is it?'],
];

export const PHRASES: readonly StarterPhrase[] = PHRASE_ROWS.map(([form, gloss]) => {
  const stage = koFormStage(form);
  const parts = form.replace(/[?!.]/gu, '').split(' ').map((w) => koWordPronunciation(w, stage, true));
  const pronunciation = parts.every((p) => p !== undefined) ? parts.join(' ') : parts.some((p) => p !== undefined) ? parts.map((p, i) => p ?? form.replace(/[?!.]/gu, '').split(' ')[i]).join(' ') : undefined;
  return { form, gloss, ...(pronunciation ? { pronunciation } : {}), source: SOURCE };
});

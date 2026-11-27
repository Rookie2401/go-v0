/**
 * Hand-written corrections (the owner's instruction of 2026-11-27: "manually fix the Korean cards"). Each line is one word the
 * rules read confidently WRONG, with the neighbouring words under which the other reading is meant. A pin fires only on its
 * neighbours; nothing here is a rule about the language. Each pin has a sentence it fixes and a look-alike it must leave
 * alone in test/adapters/korean/pins.test.ts. Written by the model that built the pack; no Korean speaker has reviewed them.
 */
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../core';
import { koAnalyzeToken } from './analyze';
import { koBareLemma, koEntryLemma, koSharedPos, koStemKey, lookupKoreanStem } from './index-store';

export interface KoPin {
  /** The written word. */
  form: RegExp;
  /** The word before / after it, any word of the sentence, and all the words before it (`lead`). All given conditions must hold. */
  prev?: RegExp;
  next?: RegExp;
  sentence?: RegExp;
  lead?: RegExp;
  /** What it is here: the headword and class; `hom` picks the entry of that number. */
  lemma: string;
  pos: string;
  hom?: number;
  /** Read the word as the analyser reads this spelled-out form (a contraction it does not undo). */
  as?: string;
  why: string;
}

export const KO_PINS: readonly KoPin[] = [
  // 크다 "grew" only where the child is the SUBJECT and a word of change stands before it: 아이 옷이 컸어요 is the clothes being big
  { form: /^컸/u, lead: /(^|\s)(아이|아기|아들|딸|손자|손녀)(들)?(가|이|는|은|도)(\s(그새|그동안|벌써|정말|참|이제|어느새))*\s(많이|부쩍|몰라보게|훌쩍|쑥|그새|어느새)$/u, lemma: '크다', pos: 'VERB', why: '아이가 많이 컸다: grew' },
  { form: /^국가(를|는)?$/u, next: /^(부르|불러|불렀|부를|제창|연주)/u, lemma: '국가', pos: 'NOUN', hom: 2, why: '국가를 부르다: the anthem' },
  { form: /^자신(이|은|도)?$/u, next: /^(없|있었|있어|있다|있습|생겼|생겨|붙)/u, prev: /^(?!(나|너|저|그|그녀|자기|우리)$)/u, lemma: '자신', pos: 'NOUN', hom: 2, why: '자신이 없다: confidence' },
  { form: /^과정(에|을|은|이)?$/u, prev: /(석사|박사|학사|교육|훈련|연수|정규|전문|대학원)$/u, lemma: '과정', pos: 'NOUN', hom: 2, why: '석사 과정: a course of study' },
  { form: /^위(가|는|도)$/u, next: /^(아파|아프|아팠|아픈|쓰려|쓰리|쓰렸)/u, lemma: '위', pos: 'NOUN', hom: 2, why: '위가 아프다: the stomach' },
  { form: /^주장(이에요|이야|입니다|이다|이었|으로|인)/u, prev: /팀(의)?$/u, lemma: '주장', pos: 'NOUN', hom: 2, why: '팀 주장: the captain' },
  { form: /^(불러|불렀|부른|불러서|부르)/u, prev: /^배(가|는|도)?$/u, lemma: '부르다', pos: 'ADJ', why: '배가 부르다: full' },
  { form: /^완전$/u, next: /(어요|아요|해요|네요|다|야|해|워|워요|습니다)[.!?]?$/u, lemma: '완전', pos: 'ADV', why: '완전 + a predicate: "totally"' },
  { form: /^꼭$/u, next: /^(잡|쥐|쥔|안아|안았|껴안|붙잡|붙들|다물|다문|묶)/u, lemma: '꼭', pos: 'ADV', hom: 2, why: '꼭 잡다: tightly' },
  { form: /^선과$/u, next: /^악/u, lemma: '선', pos: 'NOUN', hom: 3, why: '선과 악: good and evil' },
  { form: /^돌(이에요|이야|입니다|이다|잔치|이었)/u, prev: /^(아기|아이|첫|우리 아기)(의)?$/u, lemma: '돌', pos: 'NOUN', hom: 2, why: '아기 돌: the first birthday' },
  { form: /^성(을|에)$/u, next: /^(구경|쌓|짓|지었|지은|공격|방문|함락)/u, lemma: '성', pos: 'NOUN', hom: 5, why: '성을 구경하다: a castle' },
  { form: /^창(을|으로)$/u, next: /^(던지|던졌|던져|찌르|찔러|찔렀)/u, lemma: '창', pos: 'NOUN', hom: 2, why: '창을 던지다: a spear' },
  { form: /^창(을)$/u, next: /^들/u, sentence: /(군인|병사|기사|전사|무사)/u, lemma: '창', pos: 'NOUN', hom: 2, why: '군인이 창을 들다: a spear' },
  // 걸어 + 잠그다 / 놓다 / 두다 only after an object (not a road: 길을 걸어 …); 걸어 주세요 is "please walk" and is left alone
  { form: /^걸어$/u, prev: /^(?!(길|거리|골목|산길)(을|를)$).+(을|를)$/u, next: /^(잠[갔그궜근금]|놓[았아는을고]|뒀|두었|두세요)/u, lemma: '걸다', pos: 'VERB', why: '문을 걸어 잠그다: 걸다, not 걷다' },
  { form: /^걸어$/u, prev: /^(그림|옷|전화|말|간판|액자|시계|자물쇠|목도리)(을|를)$/u, lemma: '걸다', pos: 'VERB', why: '그림을 걸어: to hang' },
  { form: /^빚은$/u, next: /^(만두|송편|떡|술|도자기|그릇)/u, lemma: '빚다', pos: 'VERB', why: '빚은 만두: shaped by hand' },
  { form: /^보다$/u, next: /^(가까이|나은|나아|높은|넓은|좋은|많은|깊이|쉽게|빠르게|정확|효과|자세히)/u, lemma: '보다', pos: 'ADV', why: '보다 가까이: more' },
  { form: /^보다$/u, prev: /^(?!.*(을|를)$)/u, next: /^[가-힣]{2,}적(이|인|으로)/u, lemma: '보다', pos: 'ADV', why: '보다 기능적: more' },
  { form: /^줌(의|씩)?$/u, prev: /^(한|두|세|네|몇)$/u, lemma: '줌', pos: 'CLF', why: '한 줌: a handful' },
  { form: /^테(야|다|요)?$/u, prev: /[ᆯ]$|(할|갈|볼|올|될|줄|살|릴|질|칠|을|를)$/u, lemma: '터', pos: 'NOUN', hom: 2, as: '터야', why: '-(으)ㄹ 테야: 터 + 이야' },
  { form: /^원치$/u, next: /^(않|못)/u, lemma: '원하다', pos: 'VERB', as: '원하지', why: '원치 않다: 원하지 contracted' },
];

const bare = (c: AnalysisCandidate): string => koBareLemma(c.lemma ?? '');
const samePos = (c: AnalysisCandidate, pos: string): boolean => c.pos === pos || (pos === 'CLF' && c.pos === 'NOUN');

/** The reading a pin names: one the token already has, or the spelled-out form's, or the same form under the named entry. */
function pinned(pin: KoPin, candidates: readonly AnalysisCandidate[]): AnalysisCandidate | undefined {
  const from = pin.as ? koAnalyzeToken(pin.as) : candidates;
  const entries = lookupKoreanStem(koStemKey(pin.lemma, pin.pos === 'VERB' || pin.pos === 'ADJ' ? 'VV' : 'NNG'))
    .map((h) => h.entry)
    .filter((e) => koBareLemma(e.lemma) === pin.lemma && (koSharedPos(e) === pin.pos || (pin.pos === 'CLF' && !!e.clf)));
  const entry = pin.hom === undefined ? undefined : entries.find((e) => e.hom === pin.hom);
  const wanted = entry ? koEntryLemma(entry) : undefined;
  const have = from.find((c) => bare(c) === pin.lemma && samePos(c, pin.pos) && (!wanted || c.lemma === wanted));
  if (have) return have;
  if (!entry || !wanted) return undefined;
  // another entry of the same spelling: the same form and parts, under that entry's number and meaning
  const like = from.find((c) => bare(c) === pin.lemma && !c.unconfirmed);
  if (!like) return undefined;
  return { ...like, lemma: wanted, ...(entry.gloss ? { gloss: entry.gloss } : {}) };
}

export function applyKoPins(tokens: readonly RawToken[], analyzed: AnalyzedToken[]): void {
  const words = tokens.map((t, i) => ({ t, i })).filter((x) => x.t.isWord);
  const sentence = words.map((x) => x.t.surface).join(' ');
  words.forEach(({ t, i }, k) => {
    const token = analyzed[i];
    if (!token?.candidates.length) return;
    for (const pin of KO_PINS) {
      if (!pin.form.test(t.surface)) continue;
      if (pin.prev && !pin.prev.test(words[k - 1]?.t.surface ?? '')) continue;
      if (pin.next && !pin.next.test(words[k + 1]?.t.surface ?? '')) continue;
      if (pin.sentence && !pin.sentence.test(sentence)) continue;
      if (pin.lead && !pin.lead.test(words.slice(0, k).map((x) => x.t.surface).join(' '))) continue;
      const hit = pinned(pin, token.candidates);
      if (!hit) continue;
      const notes = { ...(hit.notes ?? {}) };
      delete notes.homonym;
      delete notes.homonyms;
      delete notes.credit;
      delete notes.undecidedBy;
      const first: AnalysisCandidate = { ...hit, confidence: 0.92, notes: { ...notes, context: pin.why, pinned: 'yes' } };
      delete (first as { unconfirmed?: boolean }).unconfirmed;
      const rest = token.candidates
        .filter((c) => !(c.lemma === hit.lemma && c.pos === hit.pos))
        .map((c) => ({ ...c, confidence: Math.min(c.confidence, 0.45), notes: { ...(c.notes ?? {}), credit: 'set aside by the sentence' } }));
      analyzed[i] = { ...token, candidates: [first, ...rest] };
      return;
    }
  });
}

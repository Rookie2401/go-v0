/**
 * The sentence layer of the Korean analyser (docs/korean/PLAN.md "Analysis", the last step): the readings of each word of ONE sentence,
 * ordered and marked by its neighbours. Token-local analysis is korean/analyze.ts (`koAnalyzeTokens`); this file only
 *   - MOVES a reading to the front, with the reason in `notes.context` (every change of order says why);
 *   - LOWERS what a sure rule supersedes to 0.45 or below (under the credit line of 0.5; `notes.credit = 'set aside by the sentence'`),
 *     so that the card no longer calls the word conflicted and the product credits only the chosen reading;
 *   - MARKS what only the sentence shows: the complement particle before 되다 / 아니다 (`morph.Complement=Yes`, JKC), the sentence type from
 *     a final question mark (`Mood=Int`, one value), negation by 안 / 못 / -지 않다 (`notes.negation`), the kind of numeral before a counter.
 * It never adds a reading, never removes one and never rewrites a lemma, a part of speech or a part. Where nothing decides, the order the
 * token analysis gave stands (and, in a balanced homonym set, the UNDECIDED reading stays first).
 *
 * Confidence (PLAN "Confidence and honesty"): after a reorder the first reading's confidence is strictly the highest and every later one is
 * strictly lower than the one before it. A reading a rule moves up takes the token's best confidence, at most 0.88 (the band of "several
 * licensed readings, the reasons for the order in notes.context"); a reading that was already first keeps its own.
 *
 * Homonym rules choose by a cue word and take their candidate by GLOSS (a fingerprint of the meaning), never by a homonym number: the
 * number is the source's and may differ between builds (audit N4). A rule whose fingerprint finds no reading does nothing.
 *
 * Every rule is MACHINE-DRAFTED from standard descriptions of Korean grammar and has not been reviewed by a native speaker. A rule is
 * kept only where it is right practically always; a cue that is merely likely is not a rule (눈을 보다 can be "look at the snow" as well
 * as "look into the eyes", so 보다 does not decide 눈).
 */
import type { AnalysisCandidate, AnalyzedToken, PartOfSpeech, RawToken } from '../../core';
import { koAnalyzeTokens, koMoodFromPunctuation } from './analyze';
import { koBareLemma, lookupKoreanStem } from './index-store';
import { KO_ANALYZER } from './version';

type Cand = AnalysisCandidate;

// ───────────────────────────── confidence ─────────────────────────────

/** A reading moved up by a rule takes the token's best confidence, at most this (PLAN: 0.80–0.88 for several licensed readings). */
export const KO_CONTEXT_TOP = 0.88;
/**
 * A reading a sure rule supersedes is no longer a live rival: it goes to at most 0.45, below the product's credit line of 0.5 (and at least
 * 0.20 below the chosen one), with `notes.credit = 'set aside by the sentence'`.
 */
const SET_ASIDE = 0.2;
const SUPERSEDED_MAX = 0.45;
const r2 = (x: number): number => Math.round(x * 100) / 100;

/**
 * The priors-corpus count of a predicate's spelling (the lexicon's `n`, the largest over its entries; 0 when unseen or not installed). The
 * pack's rare-rival test reads it (closeKeptOpen).
 */
function predicateCount(lemma: string): number {
  if (lemma.length < 2 || !lemma.endsWith('다')) return 0;
  let n = 0;
  for (const h of lookupKoreanStem(lemma.slice(0, -1))) if (koBareLemma(h.entry.lemma) === lemma) n = Math.max(n, h.entry.n ?? 0);
  return n;
}
/**
 * After the look-alike cues, a reading a rule kept open for them (the other verb's adnominal) that no cue chose or set aside:
 *   it is set aside (0.45) only by the pack's rare-rival test: the chosen verb at least four times commoner AND the other counted under
 *   30 (갈다 14 beside 가다, 줄다 20 beside 주다: 갈 수 있어요, 어제 간 식당, 친구에게 줄 선물). Otherwise it stays CREDITABLE, marked
 *   `undecidedBy` (사다 52 beside 살다 382: 어제 산 옷 is undecided). A cue that chose a verb (an object for 사다, a
 *   place name for 살다, the look-alike cues of 갈다) set the others aside itself.
 */
function closeKeptOpen(s: KoSentence): void {
  for (let i = 0; i < s.n; i++) {
    const cs = s.cands[i];
    if (!cs?.length) continue;
    const first = cs[0];
    const nFirst = isPredicate(first) ? predicateCount(bare(first)) : 0;
    for (const c of cs) {
      if (!c.notes?.keptOpen) continue;
      const { keptOpen: _k, ...rest } = c.notes;
      c.notes = rest;
      if (c === first || rest.credit) continue;
      // a whole listed NOUN kept open beside a split (사도 "apostle" beside 사 + 도: S-h) is not a verb pair: it stays creditable
      if (!isPredicate(c)) { c.notes = { ...rest, undecidedBy: 'the sentence: the whole listed word beside its split' }; continue; }
      const nThis = predicateCount(bare(c));
      // the pack's rare-rival test (PLAN): the commoner verb leads alone only if it is at least four times commoner AND the other is counted
      // under 30; otherwise both are live (unseen counts on both sides: set aside, as before the last round)
      if (!(nFirst >= 4 * nThis && nThis < 30)) { c.notes = { ...rest, undecidedBy: 'the sentence: no cue decides between this verb and the first, and the counts hold both live' }; continue; }
      const v = r2(Math.min(c.confidence, SUPERSEDED_MAX, first.confidence - SET_ASIDE));
      if (v < c.confidence) c.confidence = Math.max(0.01, v);
      c.notes = { ...c.notes, credit: 'set aside by the sentence' };
    }
    koStrictlyFalling(cs);
  }
}

/** Strictly falling confidences down the list (the card takes the highest: the first must be it). */
export function koStrictlyFalling(cands: Cand[]): void {
  for (let k = 1; k < cands.length; k++) {
    const cap = r2(cands[k - 1].confidence - 0.01);
    if (cands[k].confidence > cap) cands[k].confidence = Math.max(0.01, cap);
  }
}

const addContext = (c: Cand, text: string): void => {
  const prev = c.notes?.context;
  const was = typeof prev === 'string' && prev ? prev : Array.isArray(prev) ? prev.join(' ') : '';
  c.notes = { ...(c.notes ?? {}), context: was && !was.includes(text) ? `${was} ${text}` : text };
};

// ───────────────────────────── the sentence ─────────────────────────────

const PRED_POS = new Set<string>(['VERB', 'ADJ', 'AUX']);
const NOMINAL_POS = new Set<string>(['NOUN', 'PROPN', 'PRON', 'NUM', 'CLF']);
const DIGITS = /^[0-9０-９]+(?:[.,][0-9]+)*$/u;

/** Readings of one sentence, as the rules see them. */
export class KoSentence {
  readonly n: number;
  /** Index of the first token of the next clause after each token (commas, quotes and the like close a clause; digits do not). */
  private readonly clause: number[];
  /**
   * `frozen`: token indexes whose lists are not the adapter's own (refine: a dictionary's readings). Their readings may be moved and
   * lowered, never raised or marked.
   */
  constructor(readonly tokens: RawToken[], readonly cands: Cand[][], readonly frozen: ReadonlySet<number> = new Set()) {
    this.n = tokens.length;
    this.clause = [];
    let cl = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.isPunct(i)) cl++;
      this.clause.push(cl);
    }
  }
  isWord(i: number): boolean { return i >= 0 && i < this.n && this.tokens[i].isWord; }
  /** May the rules mark this token's readings (features, notes other than the reason)? */
  mayMark(i: number): boolean { return !this.frozen.has(i); }
  isDigits(i: number): boolean { return i >= 0 && i < this.n && !this.tokens[i].isWord && DIGITS.test(this.tokens[i].surface); }
  isPunct(i: number): boolean { return i >= 0 && i < this.n && !this.tokens[i].isWord && !DIGITS.test(this.tokens[i].surface); }
  top(i: number): Cand | undefined { return this.isWord(i) ? this.cands[i][0] : undefined; }
  surface(i: number): string { return this.tokens[i]?.surface ?? ''; }
  key(i: number): string { return this.tokens[i]?.normalized ?? ''; }
  /** The next word token in the same clause, or -1 (a digit token in between counts as a word position: 3 일). */
  next(i: number): number {
    const j = i + 1;
    if (j >= this.n || this.clause[j] !== this.clause[i] || this.isPunct(j)) return -1;
    return j;
  }
  prev(i: number): number {
    const j = i - 1;
    if (j < 0 || this.clause[j] !== this.clause[i] || this.isPunct(j)) return -1;
    return j;
  }
  /** The first predicate after token i in its clause (an argument's governing verb, adnominal forms included), or -1. */
  governor(i: number): number {
    for (let j = i + 1; j < this.n && this.clause[j] === this.clause[i]; j++) {
      const t = this.top(j);
      if (t && isPredicate(t)) return j;
    }
    return -1;
  }
  /** The nearest word before i in its clause with an object particle and no predicate in between, or -1. */
  objectBefore(i: number): number {
    for (let j = i - 1; j >= 0 && this.clause[j] === this.clause[i]; j--) {
      const t = this.top(j);
      if (!t) continue;
      if (isPredicate(t)) return -1;
      if (lastParticle(t) === 'object') return j;
    }
    return -1;
  }
  /** Words of the whole sentence whose first reading has this bare lemma. */
  has(lemma: string): boolean { return this.cands.some((cs) => cs[0] && bare(cs[0]) === lemma); }
}

// ───────────────────────────── reading helpers ─────────────────────────────

export const bare = (c: Cand | undefined): string => (c?.lemma ? koBareLemma(c.lemma) : '');
export const isPredicate = (c: Cand | undefined): boolean => !!c && !!c.pos && PRED_POS.has(c.pos) && !c.unconfirmed;
export const isNominal = (c: Cand | undefined): boolean => !!c && !!c.pos && NOMINAL_POS.has(c.pos);
export const particlesOf = (c: Cand | undefined): string[] => (c?.morph.Particle ? c.morph.Particle.split('+') : []);
export const lastParticle = (c: Cand | undefined): string | undefined => particlesOf(c).pop();
/** A nominal written with nothing after it (no particle, no copula). */
const bareNominal = (c: Cand | undefined): boolean => isNominal(c) && (c!.parts?.length ?? 1) <= 1 && !c!.morph.VerbType;
const koPosOf = (c: Cand): string => String(c.notes?.koPos ?? '');
const connective = (c: Cand | undefined): string | undefined => (c?.morph.VerbForm === 'Conn' ? c.morph.Connective : undefined);
const isAdn = (c: Cand | undefined): boolean => c?.morph.VerbForm === 'Adn';
const isProspAdn = (c: Cand | undefined): boolean => isAdn(c) && c!.morph.Aspect === 'Prosp';
const glossOf = (c: Cand): string => c.gloss ?? '';

/**
 * Put the reading `want` selects first in token i, and say why. `setAside` (default: every reading of another lemma or part of speech)
 * lowers the readings the rule excludes. Returns true when the rule acted. The undecided reading of a homonym set is "another lemma" of
 * its numbered readings (it is the bare headword), so choosing a numbered reading sets the undecided one aside.
 */
export function koPromote(s: KoSentence, i: number, want: (c: Cand) => boolean, reason: string, setAside?: (c: Cand, chosen: Cand) => boolean, keepOpen?: (c: Cand) => boolean, counterFrame = false): boolean {
  const cs = s.cands[i];
  if (!cs?.length) return false;
  const k = cs.findIndex((c) => want(c) && !c.unconfirmed);
  if (k < 0) return false;
  const chosen = cs[k];
  // ONLY A LIVE RIVAL may be raised (batch 9): a reading the token layer left at 0.5 or more with no credit or rarity mark. Below the floor
  // it is never raised by context, with two exceptions by design: an AUXILIARY reading after its connective form (the token layer keeps
  // it low for this layer to raise), and a numbered entry of the SAME word and class as the first reading (the undecided reading stands
  // for it: 눈 → 눈² "snow"). Another lexeme or class below the floor (먹 "ink stick" under 먹다) stays where it is.
  if (k > 0) {
    const live = chosen.confidence >= 0.5 && !chosen.notes?.credit && !chosen.notes?.rare;
    // the same word: a live reading of this spelling and class stands for it (the undecided 물다 for 물다¹ "bite", 이 for 이³ "tooth")
    const sameWord = cs.some((c) => c !== chosen && bare(c) === bare(chosen) && c.pos === chosen.pos && c.confidence >= 0.5 && !c.notes?.credit && !c.unconfirmed);
    // the THIRD exception (batch 11), `counterFrame`, used by the counter rule alone: in a numeral + counter frame (팔 층, 커피 한 잔, 맥주 두 병)
    // the numeral reading of the first token and the counter reading of the second may be raised from below the floor, together or not at
    // all: the frame decides, and both readings are listed closed-class rows, not guesses
    if (!live && !isAuxReading(chosen) && !sameWord && !(counterFrame && (isFrameCounter(chosen) || isNumeralReading(chosen)))) return false;
  }
  const aside = setAside ?? ((c: Cand, ch: Cand) => c.lemma !== ch.lemma || c.pos !== ch.pos);
  const top = Math.max(...cs.map((c) => c.confidence));
  const others = cs.filter((_, j) => j !== k);
  // a list that is not the adapter's own is only reordered and lowered (refine's contract): the chosen reading keeps its number
  if (k > 0 && s.mayMark(i)) chosen.confidence = Math.max(chosen.confidence, Math.min(top, KO_CONTEXT_TOP));
  const lowered = others.filter((c) => aside(c, chosen));
  if (k === 0 && !lowered.length) return false;
  // every rule here decides for a sure reason: what it supersedes is no longer a live rival and goes below the credit line (0.5), so the
  // product credits the chosen reading alone; the other analyses of the chosen word itself (kept) go there too, in their own order
  const kept = others.filter((c) => !lowered.includes(c));
  // `keepOpen`: readings the rule does not decide against, left as they are for a later rule (the other verb's adnominal: 사다 / 살다)
  for (const c of [...kept, ...lowered]) {
    if (keepOpen?.(c)) { c.notes = { ...(c.notes ?? {}), keptOpen: 'yes' }; continue; }
    const v = r2(Math.min(c.confidence, SUPERSEDED_MAX, chosen.confidence - SET_ASIDE));
    if (v < c.confidence) c.confidence = Math.max(0.01, v);
    c.notes = { ...(c.notes ?? {}), credit: 'set aside by the sentence' };
    if (lowered.includes(c)) addContext(c, `Set aside: ${reason}`);
  }
  // the chosen reading first, then the others in their own order: kept readings before the ones set aside
  s.cands[i] = [chosen, ...kept, ...lowered];
  addContext(chosen, reason);
  koStrictlyFalling(s.cands[i]);
  return true;
}

// ───────────────────────────── 1. counters after numerals ─────────────────────────────

/** Native Korean numerals in their form before a counter or noun (한 두 세 네 …), and the free forms. */
export const KO_NATIVE_NUMERALS: ReadonlySet<string> = new Set(['한', '하나', '두', '둘', '세', '셋', '석', '서', '네', '넷', '넉', '너', '다섯', '여섯', '일곱', '여덟', '아홉', '열', '스무', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔']);
/** Sino-Korean numerals. 일 and 이 are listed: before a counter they are "one" and "two". */
export const KO_SINO_NUMERALS: ReadonlySet<string> = new Set(['일', '이', '삼', '사', '오', '육', '륙', '칠', '팔', '구', '십', '백', '천', '만', '억', '조']);
/**
 * Counters with which a number in digits is read in ONE series only (standard usage; a counter not listed is not noted): native with
 * people, things, animals, volumes, cups, bottles, sheets, machines, age, the hour; Sino-Korean with years, months, days, minutes,
 * seconds, money, floors, school years.
 */
const NATIVE_COUNTERS = new Set(['명', '개', '마리', '권', '잔', '병', '장', '대', '살', '시', '그릇', '켤레', '송이', '사람']);
const SINO_COUNTERS = new Set(['년', '월', '일', '분', '초', '원', '층', '학년', '주일', '개월', '세', '주']);
/** Numeral words that trigger the counter rule (the rare forms 서 석 너 넉 and the ambiguous 이 "this" are left out). */
const TRIGGER_NATIVE = new Set(['한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열', '스무', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔']);
// 이 counts only before a SINO-KOREAN counter (이 층, 이 년: two; the condition below), never before 개 / 명 (이 개 is "this dog")
const TRIGGER_SINO = new Set(['일', '이', '삼', '사', '오', '육', '칠', '팔', '구', '십', '백', '천', '만']);
/** The syllables of a composed Sino-Korean numeral (이십, 삼백오십). */
const SINO_DIGITS = new Set(['일', '이', '삼', '사', '오', '육', '칠', '팔', '구', '십', '백', '천', '만', '억']);
/** A gloss that names a unit of time (the entry of a counter set that Sino-Korean numerals count). */
const TIME_UNIT_GLOSS = /\b(minutes?|hours?|seconds?|weeks?|days?|months?|years?)\b/u;

/**
 * A counter reading: the lexicon's counter class (CLF), or a bound noun or noun whose own gloss says it counts or measures ("counter for
 * songs", "unit of …", "piece"): 곡, 편, 통, 벌, 채, 그루, 척 … may be filed either way (audit WW3).
 */
const NOUN_FILED_COUNTERS = new Set(['곡', '편', '통', '벌', '켤레', '채', '그루', '송이', '척', '대', '쌍', '단', '포기', '자루', '그릇', '시', '층', '주']);
function isCounterReading(c: Cand): boolean {
  if (c.unconfirmed) return false;
  if (c.pos === 'CLF') return true;
  // only spellings that count, filed as nouns: a gloss alone is not enough (말³ "a unit of volume" is no counter in 한 말은)
  if (c.pos !== 'NOUN' || c.notes?.homonym === 'undecided') return false;
  if (!NOUN_FILED_COUNTERS.has(bare(c))) return false;
  return /\bcounter\b|\bunit of\b|\bmeasure word\b|^(a )?(piece|pair)\b|^hour \(time\)|^storey\b|^floor\b|^week\b/iu.test(c.gloss ?? '');
}
/**
 * Nouns that count or measure after a number, each with the meaning of its counting entry (batch 11): 잔 a cup, 병 a bottle, 시간 hours, 달 a
 * month, 일 a day, 초 a second; a numbered entry of the right meaning, never the undecided reading.
 */
const UNIT_NOUNS: Readonly<Record<string, RegExp>> = {
  잔: /\bcup\b|\bglass\b/u, 병: /\bbottle\b/u, 시간: /\bhours?\b/u, 달: /\bmonth\b/u, 일: /\bday\b/u, 초: /unit of time|\bsecond\b/u,
  년: /\byear\b/u, 월: /\bmonth\b/u, 분: /\bminute\b/u, 번: /\btimes?\b|\bnumber\b/u, 개월: /\bmonth/u, 주: /\bweek\b/u, 살: /\bage\b|\byears? old\b/u,
};
/**
 * A counter reading for the numeral + counter frame alone (ruleCounters and koPromote's third exception): a counter reading, or a noun of
 * UNIT_NOUNS in its counting meaning. The other rules keep to isCounterReading (일 "day" is no counter for them: 떠나는 일일 수도).
 */
function isFrameCounter(c: Cand): boolean {
  if (isCounterReading(c)) return true;
  if (c.unconfirmed || c.pos !== 'NOUN' || c.notes?.homonym === 'undecided') return false;
  const unit = UNIT_NOUNS[bare(c)];
  return !!unit && unit.test(c.gloss ?? '');
}
/** Units said only with the Sino-Korean numerals: after a native numeral they are not counters (한 일을 is "the work that was done"). */
const SINO_ONLY_UNITS = new Set(['일', '년', '월', '초']);
/** A numeral reading: the class NUM, or a determiner the dictionary glosses as a number (네 "four (of something)", 두, 세 …). */
const NUMBER_WORDS = /^(one|two|three|four|five|six|seven|eight|nine|ten|twenty)\b/u;
function isNumeralReading(c: Cand): boolean {
  return !c.unconfirmed && (c.pos === 'NUM' || (c.pos === 'DET' && NUMBER_WORDS.test(c.gloss ?? '')));
}

// ───────────────────────────── fused pronoun forms against their look-alikes ─────────────────────────────

/** Nouns of time that stand as adverbs without a particle (오늘 내 생일: "my"): a bare one before 내 does not make it "within". */
const TIME_ADVERB_NOUNS = new Set(['오늘', '어제', '내일', '지금', '이제', '요즘', '그때', '아까', '방금', '모레', '올해', '작년', '내년']);
const BEFORE_ADVERBS = new Set(['조금', '얼마', '오래', '바로', '직', '훨씬', '한참', '며칠', '몇']);
const fusedReading = (pron: string, particle: string) => (c: Cand): boolean => c.pos === 'PRON' && bare(c) === pron && lastParticle(c) === particle;

/**
 * The fused forms (내 = 나 + 의, 전 = 저 + 는, 날 = 나 + 를, 널 = 너 + 를) against the listed words spelled the same (audit XX1). Each cue:
 *   내: straight after a bare noun or a number (기간 내, 건물 내 금연, 3일 내) the bound noun "within"; with no noun before it (or after a word
 *       with a particle) and a noun after it, 나 + 의 "my" (내 친구, 이건 내 거야). A bare noun of time before it (오늘 내 생일) decides nothing.
 *   전: after a bare noun, a number, a nominalised form or 조금 / 얼마 / 오래 … the noun "before, ago" (십 년 전, 조금 전, 얼마 전); first in its clause
 *       and followed by a predicate, an adverb, an object or a noun with the copula, 저 + 는 (전 괜찮아요, 전 학생이에요); before a noun with
 *       nothing before it, the determiner "whole; former" stays (전 세계, 전 대통령: the token order).
 *   날 / 널: after a determiner, a modifier word or an adnominal, the noun "day" / "board" (그 날, 좋은 날); otherwise the token order (나를).
 *   난 / 넌: first in a clause before a predicate or a noun with the copula, 나 + 는 / 너 + 는 (the token order already); no rule moves them.
 * 제 before a number would be the ordinal prefix 제 (제 1 장), which the analysis does not offer as a reading: left in token order.
 */
function ruleFused(s: KoSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const k = s.key(i);
    if (k !== '내' && k !== '전' && k !== '날' && k !== '널') continue;
    const pv = s.prev(i);
    const nx = s.next(i);
    const pTop = pv >= 0 ? s.top(pv) : undefined;
    const nTop = nx >= 0 ? s.top(nx) : undefined;
    // a particle anywhere among the parts counts (a compound read through its parts may not list it in morph.Particle: 인쇄술은)
    const hasParticle = (c: Cand) => particlesOf(c).length > 0 || (c.parts ?? []).some((x) => x.pos === 'ADP');
    // a number with its unit written to it (3일 내, 2년 전) counts as a noun whatever reading the unit's syllable has on its own
    const numberUnit = pv >= 1 && s.isDigits(pv - 1) && s.tokens[pv - 1].end === s.tokens[pv].start;
    const afterBareNoun = pv >= 0 && (s.isDigits(pv) || numberUnit || (!!pTop && isNominal(pTop) && !hasParticle(pTop) && !pTop.morph.VerbType));
    if (k === '내') {
      if (afterBareNoun && !(TIME_ADVERB_NOUNS.has(s.key(pv)) && isNominal(nTop))) {
        koPromote(s, i, (c) => c.morph.NounType === 'Bound' && bare(c) === '내' && /inside|within/u.test(glossOf(c)), `내 straight after ${s.surface(pv)} is the bound noun "within, inside".`);
      } else if ((pv < 0 || (pTop && !isNominal(pTop)) || (pTop && particlesOf(pTop).length > 0)) && nTop && isNominal(nTop) && !nTop.unconfirmed) {
        koPromote(s, i, fusedReading('나', 'of'), `내 before the noun ${s.surface(nx)}, with no noun before it: 나 + 의 "my".`);
      }
      continue;
    }
    if (k === '전') {
      if (afterBareNoun || (pTop && (pTop.morph.VerbForm === 'Nmlz' || BEFORE_ADVERBS.has(s.key(pv))))) {
        koPromote(s, i, (c) => c.pos === 'NOUN' && bare(c) === '전' && /\bbefore\b|\bago\b/u.test(glossOf(c)), `전 after ${s.surface(pv)} is the noun "before, ago".`);
      } else if (pv < 0 && nTop && (isPredicate(nTop) || isAdverb(nTop) || lastParticle(nTop) === 'object' || nTop.morph.VerbType === 'Cop')) {
        koPromote(s, i, fusedReading('저', 'topic'), `전 first in its clause before ${s.surface(nx)}: 저 + 는 "as for me".`);
      } else if (nTop && isNominal(nTop) && nTop.pos !== 'PRON' && !nTop.unconfirmed && !nTop.morph.VerbType) {
        // before a noun: the determiner "whole; former" (전 세계, 전 국민, 전 대통령) when a topic or subject already stands before it (인쇄술은 전
        // 유럽으로), or when the noun is a subject, a genitive or bare; a place in 에 / 에서 after it with nothing before (전 서울에 살아요: "I
        // live in Seoul") decides nothing
        const before = !!pTop && (['topic', 'subject'].includes(lastParticle(pTop) ?? '') || (pTop.parts ?? []).some((x) => x.pos === 'ADP' && (x.lemma === '은/는' || x.lemma === '이/가')));
        const np = lastParticle(nTop);
        const placeOnly = !before && (np === 'to' || np === 'at') && nTop.pos === 'PROPN';
        if (before || (!placeOnly && (np === undefined || np === 'subject' || np === 'of' || np === 'to' || np === 'at' || np === 'by'))) {
          koPromote(s, i, (c) => c.pos === 'DET' && bare(c) === '전', `전 straight before the noun ${s.surface(nx)} is the determiner "whole; former".`);
        }
      }
      continue;
    }
    // 날, 널
    if (pTop && (pTop.pos === 'DET' || isAdn(pTop) || MODIFIER_WORDS.has(s.key(pv)))) {
      const meaning = k === '날' ? 'day' : 'board';
      koPromote(s, i, (c) => c.pos === 'NOUN' && bare(c) === k && c.notes?.homonym !== 'undecided' || (c.pos === 'NOUN' && bare(c) === k), `${k} after the modifier ${s.surface(pv)} is the noun "${meaning}".`);
    }
  }
}

/** Words of quantity a counter follows besides a numeral (몇 개, 여러 명, 한두 번). */
const QUANTITY_WORDS = new Set(['몇', '여러', '수십', '수백', '수천', '서너', '두세', '한두', '두어', '대여섯', '예닐곱', '너덧', '댓']);

/**
 * 한 after an object (or an adverb) and before a word that can be a counter: 하다 + -(으)ㄴ "that did" (공부를 한 사람, 일을 한 시간이 길다) unless
 * the object has another verb to belong to: the counter written bare and an action verb later in the clause (운동장을 한 바퀴 돌았다, 책을 한
 * 권 샀다, 전화를 한 번 했다). This test is for the ORDINARY NOUNS that can also count (사람, 시간, 학생 …): with a particle they are the head of
 * the clause (한 사람이, 한 시간이): 하다. A word that is a counter first (권, 개, 명, 잔, 번, 장 …) keeps its particles and 한 before it is the
 * numeral whatever they are (책을 한 권도, 사과를 한 개만, 물을 한 잔도). Audit LL1 and the batch-5 addendum.
 */
const NOUN_LIKE_COUNTERS = new Set(['사람', '시간', '학생', '날', '해', '집', '곳', '분', '아이', '가지', '주일', '사이']);
function hanIsDid(s: KoSentence, p: number, i: number): boolean {
  const pv = s.prev(p);
  const pt = pv >= 0 ? s.top(pv) : undefined;
  if (!pt || !(lastParticle(pt) === 'object' || isAdverb(pt))) return false;
  const clf = s.cands[i].find(isCounterReading);
  if (clf && !NOUN_LIKE_COUNTERS.has(bare(clf))) return false;
  const ct = s.top(i);
  if (ct && particlesOf(ct).length) return true;
  for (let j = i + 1; j < s.n; j++) {
    if (s.isPunct(j)) break;
    const t = s.top(j);
    if (t?.pos === 'VERB' && t.morph.VerbForm !== 'Adn') return false;
  }
  return true;
}

/**
 * A composed numeral before a unit or counter (백만 원, 이십만 명, 삼만 개): the numeral, over numeral + 만 "only" (백 + 만), which is
 * possible only when no unit follows (사만 "only four"). The composed reading must be a live rival (koPromote's rule).
 */
function ruleComposedNumeral(s: KoSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const cs = s.cands[i];
    const top = cs[0];
    if (!top || top.pos !== 'NUM' || lastParticle(top) !== 'only') continue;
    const whole = cs.find((c) => isNumeralReading(c) && !particlesOf(c).length && bare(c) === s.key(i));
    const nx = s.next(i);
    if (!whole || nx < 0) continue;
    const unit = s.cands[nx].some(isCounterReading) || ['원', '달러', '엔', '위안', '유로'].includes(bare(s.top(nx)));
    if (unit) koPromote(s, i, (c) => c === whole, `${s.surface(i)} before the unit ${s.surface(nx)} is the number ${s.surface(i)}, not a number + 만 "only".`, (c) => c !== whole && lastParticle(c) === 'only');
  }
}

/** 달 after a native numeral, digits or 몇 (한 달, 세 달, 두 달 동안, 몇 달): the noun "month" (the lexicon's 달 is "moon; month"), never 달다. */
function ruleMonth(s: KoSentence): void {
  for (let i = 1; i < s.n; i++) {
    if (!s.isWord(i) || !s.key(i).startsWith('달')) continue;
    const p = s.prev(i);
    if (p < 0) continue;
    const k = s.key(p);
    if (!(s.isDigits(p) || TRIGGER_NATIVE.has(k) || k === '몇' || k === '여러')) continue;
    koPromote(s, i, (c) => c.pos === 'NOUN' && bare(c) === '달' && /\bmonth\b/u.test(glossOf(c)), `${s.surface(i)} after the number ${s.surface(p)}: 달 "month".`, (c) => isPredicate(c));
  }
}

/**
 * 만에 / 만이다 after an interval (last round, S-f): straight after a unit or noun of time (십 년 만에, 삼 일 만에, 두 시간 만이다, 오래
 * 만에), 만 is the bound noun "after (an interval of time)", not the numeral "ten thousand", which counts before a unit (만 원, 만 명) and
 * never after one. The entry is found by its gloss, never by its number.
 */
function ruleElapsed(s: KoSentence): void {
  for (let i = 1; i < s.n; i++) {
    if (!s.isWord(i) || !s.key(i).startsWith('만')) continue;
    const pv = s.prev(i);
    if (pv < 0) continue;
    const pTop = s.top(pv);
    if (!pTop || particlesOf(pTop).length) continue;
    const timeBefore = TIME_UNIT_GLOSS.test(glossOf(pTop)) || ['오래', '동안'].includes(s.key(pv));
    if (!timeBefore) continue;
    const want = (c: Cand) => isNominal(c) && bare(c) === '만' && /interval of time|\bafter\b.*\binterval\b/u.test(c.gloss ?? '') && !c.unconfirmed && c.notes?.homonym !== 'undecided'
      && (particlesOf(c).every((p) => p === 'to' || p === 'at') || (c.parts ?? []).some((x) => x.lemma === '이다'));
    if (!s.cands[i].some(want)) continue;
    koPromote(s, i, want, `${s.surface(i)} straight after ${s.surface(pv)}, a length of time: the bound noun 만 "after (an interval of time)", not the numeral "ten thousand".`, (c) => !want(c));
  }
}

/**
 * A numeral is not modified (last round, S-g): after a determiner that is no number (새, 헌, 그 …) or a predicate's adnominal (부드러운), a
 * numeral reading of the next word loses to a noun of the same spelling and cut (새 백을: 백 "bag"; 부드러운 천으로: 천 "cloth"), unless a
 * counter or unit follows it (새 천 원, 그 백 명: the number of the unit). The noun is the set's live reading (its undecided reading where
 * the spelling is a homonym set): which noun is a homonym question, not this rule's.
 */
const MONEY_UNITS = ['원', '달러', '엔', '위안', '유로'];
function ruleModifiedNumeral(s: KoSentence): void {
  for (let i = 1; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const top = s.top(i);
    // a Sino-Korean numeral with a case particle of its own (백을, 천으로): the native numerals (하나의, 한) are left alone, they have no
    // everyday noun of their spelling to lose to
    if (!top || !isNumeralReading(top) || !particlesOf(top).length || ![...bare(top)].every((ch) => SINO_DIGITS.has(ch))) continue;
    const pv = s.prev(i);
    if (pv < 0 || !s.isWord(pv)) continue;
    const pTop = s.top(pv);
    const modifier = (!!pTop && isAdn(pTop) && isPredicate(pTop)) || (!QUANTITY_WORDS.has(s.key(pv)) && s.cands[pv].some((c) => c.pos === 'DET' && !isNumeralReading(c) && !c.unconfirmed && c.confidence >= 0.5));
    if (!modifier) continue;
    const nx = s.next(i);
    if (nx >= 0 && (s.cands[nx].some(isFrameCounter) || MONEY_UNITS.some((u) => s.key(nx).startsWith(u)))) continue;
    const noun = s.cands[i].find((c) => c.pos === 'NOUN' && bare(c) === bare(top) && !c.unconfirmed && c.confidence >= 0.5 && !c.notes?.credit && String(c.morph.Particle ?? '') === String(top.morph.Particle ?? ''));
    if (!noun) continue;
    koPromote(s, i, (c) => c === noun, `${s.surface(i)} after the modifier ${s.surface(pv)}, with no counter after it: a number is not modified, so it is the noun ${bare(noun)}.`, (c) => isNumeralReading(c));
  }
}

function ruleCounters(s: KoSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const p = i - 1;
    // a counter with no number or word of quantity before it is not a counter: 이 개는 is "this dog", 그 명은 …
    const top0 = s.top(i);
    if (top0?.pos === 'CLF' && !(s.prev(i) === p && (s.isDigits(p) || QUANTITY_WORDS.has(s.key(p)) || (s.isWord(p) && s.cands[p].some(isNumeralReading) && (TRIGGER_NATIVE.has(s.key(p)) || (TRIGGER_SINO.has(s.key(p)) && SINO_COUNTERS.has(bare(top0))) || (s.top(p)?.pos === 'NUM' && s.key(p) !== '이')))))) {
      const before = s.prev(i) === p && s.isWord(p) ? s.surface(p) : '';
      // the same cut as an ordinary noun first (개가: 개 "dog" + 가, not a rarer headword 개가), any other nominal only when there is none
      const sameCut = s.cands[i].find((c) => c.pos !== 'CLF' && isNominal(c) && !c.unconfirmed && bare(c) === bare(top0) && c.morph.Particle === top0.morph.Particle);
      koPromote(s, i, (c) => (sameCut ? c === sameCut : c.pos !== 'CLF' && isNominal(c)), `No number stands before ${s.surface(i)}${before ? ` (${before} is not one)` : ''}: it is not the counter here.`, (c) => c.pos === 'CLF');
    }
    if (p < 0 || s.prev(i) !== p) continue;
    const digits = s.isDigits(p);
    const pk = s.key(p);
    const numWord = s.isWord(p) && s.cands[p].some((c) => isNumeralReading(c) && !c.unconfirmed && (c.parts?.length ?? 1) <= 1);
    // 몇 / 여러 / 수 (several) before a counter count too, with no numeral reading of their own to raise
    const quantity = s.isWord(p) && (QUANTITY_WORDS.has(pk) || pk === '수');
    if (!digits && !numWord && !quantity) continue;
    // the counter class first where the lexicon lists one (잔 CLF "a glass of" over the noun "cup", 시간 CLF "hours" over "time")
    let clf = s.cands[i].find((c) => c.pos === 'CLF' && isCounterReading(c)) ?? s.cands[i].find(isFrameCounter);
    if (!clf) continue;
    const counter = bare(clf);
    if (!digits && TRIGGER_NATIVE.has(pk) && SINO_ONLY_UNITS.has(counter)) continue;
    // the frame may raise a counter reading from below the floor only where it is the same cut as a live reading of the word (잔 CLF
    // under the noun 잔, 시간 CLF under 시간 "time"), never another cut (15 세기: 세 + 기 under 세기 "century"), a plural (한 사람들은: counters
    // take no 들) or a pronoun's spelling (한 우리); otherwise the rule stays with live readings, as before
    const liveRead = (c: Cand) => c.confidence >= 0.5 && !c.notes?.credit && !c.notes?.rare && !c.unconfirmed;
    const frame = liveRead(clf) || (s.cands[i].some((c) => c !== clf && liveRead(c) && bare(c) === counter)
      && !s.surface(i).startsWith(`${counter}들`) && !s.cands[i].some((c) => c.pos === 'PRON' && liveRead(c)));
    // a numeral WORD decides only where it is not also an everyday other word before this counter: 이 개 is "this dog" (Sino-Korean 이
    // does not count things), 너 is "you"; a Sino-Korean numeral counts only with a Sino-Korean counter (삼 년, 오 분)
    // a composed Sino-Korean numeral (이십, 삼백, 오천: every syllable a Sino-Korean digit) is a Sino-Korean trigger too (last round, S-d: 이십
    // 분 was left out, so 분 stayed "person")
    const sinoWord = TRIGGER_SINO.has(pk) || ([...pk].length >= 2 && [...pk].every((ch) => SINO_DIGITS.has(ch)));
    if (!digits && !quantity && !(TRIGGER_NATIVE.has(pk) || (sinoWord && SINO_COUNTERS.has(counter)))) continue;
    // which entry of a counter that is a homonym set (분: minute / person; 주: week / tree): Sino-Korean numerals and digits count units of
    // TIME, native numerals count people and things (십 분, 이십 분 후: minutes; 두 분, 세 분이: persons). 몇 and 여러 say neither (몇 분: how
    // many minutes or how many people), so the set's undecided reading stays
    const series = digits || sinoWord ? 'sino' : TRIGGER_NATIVE.has(pk) ? 'native' : undefined;
    if (series && clf.notes?.homonym === 'undecided') {
      const entries = s.cands[i].filter((c) => c !== clf && bare(c) === counter && !c.unconfirmed && c.notes?.homonym !== 'undecided' && (c.pos === 'CLF' || c.pos === 'NOUN'));
      const pick = entries.filter((c) => (series === 'sino' ? TIME_UNIT_GLOSS.test(c.gloss ?? '') : /\bpersons?\b|\bpeople\b/u.test(c.gloss ?? '') && !TIME_UNIT_GLOSS.test(c.gloss ?? '')));
      if (pick.length && new Set(pick.map((c) => `${c.lemma}|${c.pos}`)).size === 1) clf = pick[0];
    }
    // 주 "week" counts after a Sino-Korean numeral (삼 주); after 이 only before 동안 / 간 (이 주 동안: two weeks; 이 주에 is "this week")
    // and 일 "day" likewise (이 일은 is "this work"; two days is 이틀)
    if ((counter === '주' || counter === '일') && pk === '이' &&!(s.next(i) >= 0 && ['동안', '간'].includes(bare(s.top(s.next(i)))))) continue;
    if (!digits && pk === '한' && hanIsDid(s, p, i)) {
      // 공부를 한 사람: 하다 + -(으)ㄴ "that did"; the word after it is the ordinary noun the clause describes
      koPromote(s, i, (c) => c.pos !== 'CLF' && isNominal(c) && !c.unconfirmed && bare(c) === counter, `After 한 "that did" (${s.surface(p - 1 >= 0 ? p - 1 : p)} is its object), ${s.surface(i)} is the noun it describes, not a counter.`, (c) => c.pos === 'CLF');
      continue;
    }
    const before = s.surface(p);
    let which = '';
    if (digits) {
      if (NATIVE_COUNTERS.has(counter)) which = ` A number in digits before ${counter} is said with the native Korean numerals (하나, 둘, 셋 …; 한 ${counter}, 두 ${counter}).`;
      else if (SINO_COUNTERS.has(counter)) which = ` A number in digits before ${counter} is said with the Sino-Korean numerals (일, 이, 삼 …).`;
    } else {
      const k = s.key(p);
      which = KO_NATIVE_NUMERALS.has(k) ? ` ${before} is a native Korean numeral.` : KO_SINO_NUMERALS.has(k) ? ` ${before} is a Sino-Korean numeral.` : '';
    }
    // the numeral + counter frame: both readings raised together, from below the floor if need be (koPromote's third exception)
    koPromote(s, i, (c) => c === clf, `After the number ${before}: ${counter} is a counter.${which}`, frame ? (c) => c !== clf : (c) => c.pos !== 'CLF', undefined, frame);
    const first = s.cands[i][0];
    if (first === clf && which && s.mayMark(i)) first.notes = { ...first.notes, numeral: which.trim() };
    // the numeral word itself: its NUM reading (세 명 "three", not 세다; 한 개 "one", not 하다 + -ㄴ)
    if (numWord) {
      const k = s.key(p);
      const kind = KO_NATIVE_NUMERALS.has(k) ? 'native Korean numeral' : KO_SINO_NUMERALS.has(k) ? 'Sino-Korean numeral' : 'numeral';
      if (koPromote(s, p, (c) => isNumeralReading(c) && (c.parts?.length ?? 1) <= 1, `Before the counter ${s.surface(i)}: ${before} is a number (${kind}).`, (c) => !isNumeralReading(c), undefined, frame) && s.mayMark(p)) {
        s.cands[p][0].notes = { ...s.cands[p][0].notes, numeral: kind };
      }
    }
  }
}

// ───────────────────────────── 2. bare-token ambiguities ─────────────────────────────

const isAdverb = (c: Cand | undefined): boolean => c?.pos === 'ADV';

function ruleBareWords(s: KoSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const k = s.key(i);
    const nx = s.next(i);
    const pv = s.prev(i);
    const nextTop = nx >= 0 ? s.top(nx) : undefined;
    const prevTop = pv >= 0 ? s.top(pv) : undefined;
    const nextIsPred = isPredicate(nextTop);
    if (k === '안' || k === '못') {
      // 안 / 못 straight before a predicate: the negative adverb (안 가요, 못 가요), unless a bare noun stands before it (집 안 …: "inside"
      // is then as likely, and speech drops particles), which decides nothing.
      if (nextIsPred && (!bareNominal(prevTop) || bare(nextTop) === '하다')) {
        const word = k === '안' ? '"not"' : '"cannot"';
        koPromote(s, i, (c) => c.pos === 'ADV' && c.lemma === k, `${k} straight before the predicate ${s.surface(nx)} is the negative adverb ${word}.`, (c) => c.pos !== 'ADV');
      } else if (k === '안' && bareNominal(prevTop) && !nextIsPred && !(nx >= 0 && s.isWord(nx) && isNominal(nextTop) && !bareNominal(nextTop))) {
        // 집 안 (the inside of the house) at the end of a phrase: the noun
        koPromote(s, i, (c) => c.pos === 'NOUN' && bare(c) === '안' && /inside/u.test(glossOf(c)), `안 after the noun ${s.surface(pv)} and before no predicate is the noun "inside".`);
      }
      continue;
    }
    if (k === '한') {
      // 한 + a counter: "one"; after an object or an adverb: 하다 + -(으)ㄴ (숙제를 한 학생, 열심히 한)
      const counterNext = nx >= 0 && s.cands[nx]?.some(isCounterReading);
      if (counterNext && !hanIsDid(s, i, nx)) continue; // the counter rule decided "one"
      if (prevTop && (lastParticle(prevTop) === 'object' || isAdverb(prevTop))) {
        koPromote(s, i, (c) => bare(c) === '하다' && c.pos === 'VERB' && isAdn(c), `After ${s.surface(pv)} (${isAdverb(prevTop) ? 'an adverb' : 'an object'}), 한 is 하다 with the adnominal -(으)ㄴ ("that did").`);
      }
      continue;
    }
    if (k === '자는') {
      // 믿는 자는: after an adnominal, the bound noun 자 "one who" + 는; 자는 + a noun: 자다 "sleep" with -는 (자는 아이)
      if (isAdn(prevTop)) koPromote(s, i, (c) => c.pos === 'NOUN' && bare(c) === '자' && /\bperson\b|one who/u.test(glossOf(c)), `After the adnominal ${s.surface(pv)}, 자 is the bound noun "one who, person" (+ the topic particle 는).`);
      else if (nextTop && isNominal(nextTop) && !isAdn(prevTop)) koPromote(s, i, (c) => bare(c) === '자다' && isAdn(c), `Before the noun ${s.surface(nx)}, 자는 is 자다 "to sleep" with the adnominal -는 (that is sleeping).`);
      continue;
    }
    if (k === '나는') {
      // 하늘을 나는 새: with an object before it, 날다 "to fly" + -는 (나 "I" + 는 takes no object; 나다 takes none either)
      if (prevTop && lastParticle(prevTop) === 'object') koPromote(s, i, (c) => bare(c) === '날다' && isAdn(c), `After the object ${s.surface(pv)}, 나는 is 날다 "to fly" with the adnominal -는 (나 "I" and 나다 take no object).`);
      continue;
    }
    if (k === '감을') {
      // 감을 + a predicate: the noun 감 with the object particle; 감을 + a noun: 감다 with the adnominal -(으)ㄹ (머리를 감을 시간)
      if (nextIsPred) koPromote(s, i, (c) => c.pos === 'NOUN' && bare(c) === '감' && lastParticle(c) === 'object', `Before the predicate ${s.surface(nx)}, 감을 is the noun 감 with the object particle 을.`, (c) => c.pos !== 'NOUN');
      else if (nextTop && isNominal(nextTop) && bareNominal(nextTop) === false && prevTop && lastParticle(prevTop) === 'object') koPromote(s, i, (c) => bare(c) === '감다' && isProspAdn(c), `After the object ${s.surface(pv)} and before the noun ${s.surface(nx)}, 감을 is 감다 with the adnominal -(으)ㄹ.`);
      continue;
    }
    if (k === '지' && isAdn(prevTop) && prevTop!.morph.Tense === 'Past') {
      // 온 지 일 년: after the adnominal -(으)ㄴ, the bound noun 지 "since"
      koPromote(s, i, (c) => c.pos === 'NOUN' && bare(c) === '지' && (/since|time/u.test(glossOf(c)) || koPosOf(c).startsWith('NNB')), `After the adnominal ${s.surface(pv)}, 지 is the bound noun counting time "since".`);
    }
  }
}

/** 아니다 is the negative copula (PLAN, the class table): its VCN reading before the lexicon's descriptive-verb row of the same word. */
function ruleCopula(s: KoSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const cs = s.cands[i];
    if (!cs.some((c) => koPosOf(c).startsWith('VCN'))) continue;
    // a whole listed conjunctive word of the same spelling (아니면 "or", 아니라 …): the copula needs its complement marked 이/가 before it
    // (학생이 아니면: the copula, the conjunction set aside); after a bare nominal or an adverb with no such complement (지금 아니면 내일,
    // 커피 아니면 차) it may be the conjunction: undecided (last round, S-e); anywhere else the copula, as before
    const conj = cs.find((c) => (c.pos === 'CONJ' || c.pos === 'ADV') && !c.unconfirmed && (c.parts?.length ?? 1) <= 1 && bare(c) === s.key(i));
    if (conj) {
      const pv = s.prev(i);
      const pTop = pv >= 0 ? s.top(pv) : undefined;
      const complement = !!pTop && ['subject', 'subject-hon'].includes(lastParticle(pTop) ?? '');
      const alternative = !complement && !!pTop && !particlesOf(pTop).length && (isNominal(pTop) || isAdverb(pTop)) && s.next(i) >= 0;
      if (alternative) {
        // UNDECIDED, not the conjunction alone: the treebank writes every 아니면 as 아니- + -면 (the copula), so the copula stays first and
        // the conjunction is left creditable beside it ("or at least undecided"); flipping the order is the one line below
        koPromote(s, i, (c) => koPosOf(c).startsWith('VCN'), `${s.surface(i)} between ${s.surface(pv)} and ${s.surface(s.next(i))}, with no 이/가 complement before it: the conjunctive ${bare(conj)} "${conj.gloss ?? ''}" or the copula 아니다 + -면; the sentence leaves both.`, (c, ch) => bare(c) === bare(ch) && koPosOf(c).startsWith('VA'), (c) => c === conj);
        continue;
      }
    }
    koPromote(s, i,(c) => koPosOf(c).startsWith('VCN'), '아니다 is the negative copula "not to be" (부정 지정사).', (c, ch) => bare(c) === bare(ch) && koPosOf(c).startsWith('VA'));
  }
}

// ───────────────────────────── 3. auxiliaries after a connective form ─────────────────────────────

/** Which connective form licenses which auxiliary (보조 용언) straight after it. -아/어 + 가다 / 오다 is left out: 걸어 가다 is "walk there", not "keep on". */
const AUX_AFTER: ReadonlyArray<{ conn: (c: Cand) => boolean; form: string; aux: ReadonlySet<string> }> = [
  { conn: (c) => connective(c) === 'inf', form: '-아/어', aux: new Set(['보다', '주다', '드리다', '버리다', '놓다', '두다', '내다', '있다', '대다', '치우다', '보이다', '계시다']) },
  // (-고 with 도 after it is no host of 있다: there is no -고도 있다; 사고도 있어요 is 사고 "accident" + 도, last round S-h)
  { conn: (c) => connective(c) === 'and' && c.notes?.ending === '-고' && !String(c.morph.Particle ?? '').split('+').includes('also'), form: '-고', aux: new Set(['있다', '싶다', '계시다', '나다']) },
  { conn: (c) => connective(c) === 'neg', form: '-지', aux: new Set(['않다', '못하다', '말다']) },
  { conn: (c) => connective(c) === 'only-if', form: '-아/어야', aux: new Set(['하다']) },
  { conn: (c) => connective(c) === 'adverbial', form: '-게', aux: new Set(['하다']) },
  { conn: (c) => ['-(으)ㄹ까', '-나', '-(으)ㄴ가', '-는가'].includes(String(c.notes?.ending ?? '')), form: '-(으)ㄹ까 / -나 / -(으)ㄴ가', aux: new Set(['보다', '싶다']) },
  { conn: (c) => isAdn(c), form: 'an adnominal ending', aux: new Set(['듯하다', '척하다', '체하다', '양하다', '만하다', '법하다', '뻔하다']) },
];
const isAuxReading = (c: Cand): boolean => c.pos === 'AUX' && koPosOf(c).startsWith('VX');

function ruleAuxiliaries(s: KoSentence): void {
  // -게 straight before 되다 / 하다 / 만들다 is the connective "so that" (가게 되다, 웃게 만들다), not the 하게체 command -게
  for (let i = 0; i + 1 < s.n; i++) {
    if (!s.isWord(i) || s.next(i) !== i + 1) continue;
    const nl = bare(s.top(i + 1));
    if (!['되다', '하다', '만들다'].includes(nl)) continue;
    koPromote(s, i, (c) => connective(c) === 'adverbial' && c.notes?.ending === '-게', `Before ${s.surface(i + 1)} (${nl}), -게 is the connective "so that" (-게 ${nl}).`, (c, ch) => bare(c) !== bare(ch) || c.morph.VerbForm !== ch.morph.VerbForm);
  }
  for (let i = 1; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const pv = s.prev(i);
    if (pv < 0 || !s.isWord(pv)) continue;
    // a counter after a numeral is never an auxiliary's host (두 개 주세요: 개 counts, it is not 개다 + -어)
    if (s.cands[pv].some(isCounterReading) && pv >= 1 && (s.isDigits(pv - 1) || s.cands[pv - 1]?.some(isNumeralReading))) continue;
    const auxes = s.cands[i].filter(isAuxReading);
    if (!auxes.length) continue;
    for (const rule of AUX_AFTER) {
      const aux = auxes.find((a) => rule.aux.has(bare(a)));
      if (!aux) continue;
      // the word before must have a reading with that connective form: a predicate's first (자고 있어서 is 자다 + -고, not 자 "ruler" + the
      // copula), else one of the same lemma as its first reading (먹어: Fin and Conn)
      const pTop = s.top(pv);
      const conn = s.cands[pv].find((c) => rule.conn(c) && !c.unconfirmed && isPredicate(c))
        ?? s.cands[pv].find((c) => rule.conn(c) && !c.unconfirmed && (c === pTop || bare(c) === bare(pTop)));
      if (!conn) continue;
      const lemma = bare(aux);
      koPromote(s, i, (c) => c === aux, `After ${s.surface(pv)} (${rule.form}), ${lemma} is the auxiliary: ${aux.gloss ?? ''}.`.replace(/: \./u, '.'), (c) => !isAuxReading(c));
      if (conn !== pTop) koPromote(s, pv, (c) => c === conn, `Before the auxiliary ${s.surface(i)}, this is the predicate ${bare(conn)} in the connective form ${rule.form}.`, (c, ch) => bare(c) !== bare(ch) || c.pos !== ch.pos || c.morph.VerbForm !== ch.morph.VerbForm);
      break;
    }
  }
}

// ───────────────────────────── 4. homonyms by a cue ─────────────────────────────

interface HomonymRule {
  /** The spelling, the shared part of speech, and the meaning the rule chooses, as a gloss fingerprint. */
  spelling: string; pos: PartOfSpeech; meaning: RegExp; says: string;
  /** The cue in plain words when the sentence shows it, else undefined. */
  cue: (s: KoSentence, i: number) => string | undefined;
}

const subjectLike = (c: Cand | undefined): boolean => { const p = lastParticle(c); return p === 'subject' || p === 'also' || p === 'topic' || p === undefined; };
const objectP = (c: Cand | undefined): boolean => lastParticle(c) === 'object';
const govIs = (s: KoSentence, i: number, lemmas: readonly string[]): string | undefined => {
  const g = s.governor(i);
  const t = g >= 0 ? s.top(g) : undefined;
  return t && lemmas.includes(bare(t)) ? s.surface(g) : undefined;
};
const adjacentLemma = (s: KoSentence, i: number, lemmas: readonly string[]): string | undefined => {
  for (const j of [s.prev(i), s.next(i)]) if (j >= 0 && s.isWord(j) && lemmas.includes(bare(s.top(j)))) return s.surface(j);
  return undefined;
};
const subjWith = (lemmas: string[]) => (s: KoSentence, i: number): string | undefined => {
  const g = subjectLike(s.top(i)) ? govIs(s, i, lemmas) : undefined;
  return g ? `with ${g}` : undefined;
};
const objWith = (lemmas: string[]) => (s: KoSentence, i: number): string | undefined => {
  const g = objectP(s.top(i)) ? govIs(s, i, lemmas) : undefined;
  return g ? `as the object of ${g}` : undefined;
};
const any = (...fs: Array<(s: KoSentence, i: number) => string | undefined>) => (s: KoSentence, i: number): string | undefined => {
  for (const f of fs) { const r = f(s, i); if (r) return r; }
  return undefined;
};
/** The object of a 쓰다 / 들다 token: the nearest word before it with 을/를, in its bare lemma. */
const objectIs = (lemmas: string[]) => (s: KoSentence, i: number): string | undefined => {
  const o = s.objectBefore(i);
  return o >= 0 && lemmas.includes(bare(s.top(o))) ? `with the object ${s.surface(o)}` : undefined;
};

/**
 * The homonym rules (balanced sets of docs/korean/homonym-decisions.json and the 들다 / 듣다 look-alikes). Each is one cue that decides
 * practically always; anything less certain is left undecided.
 */
export const KO_HOMONYM_RULES: readonly HomonymRule[] = [
  { spelling: '눈', pos: 'NOUN', meaning: /\bsnow\b/u, says: 'snow', cue: subjWith(['오다', '내리다', '쌓이다', '녹다']) },
  { spelling: '눈', pos: 'NOUN', meaning: /\beyes?\b/u, says: 'eye', cue: any(objWith(['뜨다', '감다']), subjWith(['아프다'])) },
  { spelling: '배', pos: 'NOUN', meaning: /\bbelly\b|\bstomach\b/u, says: 'belly', cue: subjWith(['고프다', '부르다', '아프다']) },
  { spelling: '배', pos: 'NOUN', meaning: /\bship\b|\bboat\b/u, says: 'ship', cue: any(objWith(['타다']), (s) => (s.has('항구') ? 'in a sentence about a harbour (항구)' : undefined)) },
  { spelling: '배', pos: 'NOUN', meaning: /\bpear\b/u, says: 'pear', cue: objWith(['먹다', '깎다']) },
  { spelling: '말', pos: 'NOUN', meaning: /\bspeech\b|\bwords?\b|\blanguage\b/u, says: 'speech, words', cue: any(objWith(['하다', '듣다']), subjWith(['하다'])) },
  { spelling: '말', pos: 'NOUN', meaning: /\bhorse\b/u, says: 'horse', cue: objWith(['타다']) },
  { spelling: '밤', pos: 'NOUN', meaning: /\bnight\b/u, says: 'night', cue: any((s, i) => { const a = adjacentLemma(s, i, ['늦다', '낮', '오늘']); return a ? `next to ${a}` : undefined; }, subjWith(['늦다'])) },
  { spelling: '차', pos: 'NOUN', meaning: /\btea\b/u, says: 'tea', cue: objWith(['마시다']) },
  { spelling: '차', pos: 'NOUN', meaning: /\bcar\b|\bvehicle\b/u, says: 'car', cue: any(objWith(['타다', '운전하다']), (s, i) => (lastParticle(s.top(i)) === 'to' ? (govIs(s, i, ['타다']) ? 'with 타다 (get into)' : undefined) : undefined), (s, i) => { const a = adjacentLemma(s, i, ['운전']); return a ? `next to ${a} (driving)` : undefined; }) },
  { spelling: '다리', pos: 'NOUN', meaning: /\bbridge\b/u, says: 'bridge', cue: objWith(['건너다']) },
  { spelling: '다리', pos: 'NOUN', meaning: /\blegs?\b/u, says: 'leg', cue: any(subjWith(['아프다']), objWith(['다치다'])) },
  { spelling: '쓰다', pos: 'VERB', meaning: /\bwrite\b/u, says: 'to write', cue: objectIs(['편지', '글', '이름']) },
  { spelling: '쓰다', pos: 'VERB', meaning: /\bwear\b/u, says: 'to wear (on the head or face)', cue: objectIs(['모자', '안경']) },
  { spelling: '쓰다', pos: 'VERB', meaning: /\buse\b|\bspend\b/u, says: 'to use, spend', cue: objectIs(['돈', '시간']) },
  { spelling: '수', pos: 'NOUN', meaning: /possibility|\bmeans\b|\bway\b/u, says: 'way, possibility (the bound noun of -(으)ㄹ 수 있다)', cue: (s, i) => { const p = s.prev(i); return p >= 0 && isProspAdn(s.top(p)) ? `after the adnominal ${s.surface(p)} (-(으)ㄹ)` : undefined; } },
  { spelling: '수', pos: 'NOUN', meaning: /\bnumber\b/u, says: 'number', cue: (s, i) => { const p = s.prev(i); const t = p >= 0 ? s.top(p) : undefined; return t && (t.pos === 'NOUN' || t.pos === 'PROPN') && bareNominal(t) ? `after the noun ${s.surface(p)} (the number of …)` : undefined; } },
  { spelling: '적', pos: 'NOUN', meaning: /experience|\btime\b/u, says: 'time, occasion (the bound noun of -(으)ㄴ 적이 있다)', cue: (s, i) => { const p = s.prev(i); return p >= 0 && isAdn(s.top(p)) ? `after the adnominal ${s.surface(p)}` : undefined; } },
  { spelling: '일', pos: 'NOUN', meaning: /\bday\b/u, says: 'day', cue: (s, i) => { const p = s.prev(i); return p >= 0 && s.isDigits(p) ? `after the number ${s.surface(p)}` : undefined; } },
  { spelling: '일', pos: 'NOUN', meaning: /\bwork\b/u, says: 'work, matter', cue: (s, i) => { const p = s.prev(i); const t = s.top(i); return t && particlesOf(t).length && !(p >= 0 && (s.isDigits(p) || s.top(p)?.pos === 'NUM')) ? 'with a particle and no number before it' : undefined; } },
  { spelling: '저', pos: 'PRON', meaning: /\bI\b/u, says: 'I (polite)', cue: (s, i) => {
    // 제 before a number is the ordinal prefix (제 1 장), which no reading offers: decide nothing there
    const nx = s.next(i);
    if (s.key(i) === '제' && nx >= 0 && (s.isDigits(nx) || s.cands[nx].some(isNumeralReading))) return undefined;
    const p = lastParticle(s.top(i));
    return p && ['topic', 'also', 'object', 'of', 'only', 'subject'].includes(p) ? 'with a particle (저는, 저도, 저를; 제 = 저 + 의)' : undefined;
  } },
  { spelling: '듣다', pos: 'VERB', meaning: /\bhear\b|\blisten\b/u, says: 'to hear, listen', cue: objectIs(['음악', '소리', '말', '이야기', '얘기', '노래', '강의', '수업', '뉴스', '라디오', '설명']) },
  { spelling: '들다', pos: 'VERB', meaning: /\bhold\b|\blift\b/u, says: 'to hold, lift', cue: objectIs(['가방', '손', '짐']) },
  { spelling: '들다', pos: 'VERB', meaning: /\benter\b/u, says: 'to enter (마음에 들다: to be to one’s liking)', cue: (s, i) => { const p = s.prev(i); const t = p >= 0 ? s.top(p) : undefined; return t && bare(t) === '마음' && lastParticle(t) === 'to' ? 'after 마음에 (마음에 들다)' : undefined; } },
  // ── batch 8 (sweep cause b), by pattern: a subject and the predicate only one entry can be the subject of ──
  { spelling: '열', pos: 'NOUN', meaning: /\bfever\b|\bheat\b/u, says: 'fever, heat', cue: subjWith(['나다', '내리다', '오르다']) },
  { spelling: '해', pos: 'NOUN', meaning: /\bsun\b/u, says: 'the sun', cue: subjWith(['뜨다', '지다', '비치다']) },
  { spelling: '키', pos: 'NOUN', meaning: /\bheight\b|\bstature\b/u, says: 'height', cue: subjWith(['크다', '작다']) },
  { spelling: '배', pos: 'NOUN', meaning: /\bpear\b/u, says: 'pear', cue: subjWith(['달다', '맛있다']) },
  { spelling: '감', pos: 'NOUN', meaning: /\bpersimmon\b/u, says: 'persimmon', cue: any(subjWith(['달다', '맛있다', '익다']), objWith(['먹다', '따다', '깎다'])) },
  { spelling: '간', pos: 'NOUN', meaning: /\bseasoning\b|\bsaltiness\b|\bsalt\b/u, says: 'seasoning', cue: any(subjWith(['싱겁다', '짜다', '맞다']), objWith(['보다', '맞추다'])) },
  { spelling: '이', pos: 'NOUN', meaning: /\btooth\b|\bteeth\b/u, says: 'tooth', cue: any(objWith(['닦다', '뽑다', '빼다']), subjWith(['아프다', '빠지다', '썩다'])) },
  // ── an object and its verb ──
  { spelling: '시', pos: 'NOUN', meaning: /\bpoem\b|\bpoetry\b/u, says: 'poem', cue: objWith(['쓰다', '짓다', '읽다', '외우다']) },
  { spelling: '종', pos: 'NOUN', meaning: /\bbell\b/u, says: 'bell', cue: objWith(['치다', '울리다']) },
  { spelling: '북', pos: 'NOUN', meaning: /\bdrum\b/u, says: 'drum', cue: objWith(['치다', '두드리다']) },
  { spelling: '북', pos: 'NOUN', meaning: /\bnorth\b/u, says: 'north', cue: (s, i) => (['by', 'to', 'at'].includes(lastParticle(s.top(i)) ?? '') ? 'with a particle of direction or place (북으로, 북에)' : undefined) },
  { spelling: '못', pos: 'NOUN', meaning: /\bnail\b/u, says: 'nail', cue: objWith(['박다', '뽑다']) },
  { spelling: '상', pos: 'NOUN', meaning: /\bprize\b|\baward\b/u, says: 'prize', cue: objWith(['받다', '타다', '주다']) },
  { spelling: '벌', pos: 'NOUN', meaning: /\bpunishment\b|\bpenalty\b/u, says: 'punishment', cue: objWith(['받다', '주다', '내리다']) },
  { spelling: '벌', pos: 'NOUN', meaning: /\bbee\b/u, says: 'bee', cue: (s, i) => (lastParticle(s.top(i)) === 'to' && govIs(s, i, ['쏘이다', '물리다']) ? 'with 에 쏘이다 (stung by)' : undefined) },
  { spelling: '원', pos: 'NOUN', meaning: /\bcircle\b/u, says: 'circle', cue: objWith(['그리다']) },
  { spelling: '풀', pos: 'NOUN', meaning: /\bherbaceous\b|\bgrass\b/u, says: 'grass, plants', cue: objWith(['먹다', '뜯다', '베다']) },
  { spelling: '회', pos: 'NOUN', meaning: /raw meat or fish|\braw fish\b/u, says: 'raw fish', cue: objWith(['먹다']) },
  { spelling: '밤', pos: 'NOUN', meaning: /\bchestnut\b/u, says: 'chestnut', cue: objWith(['굽다', '까다', '줍다']) },
  { spelling: '밤', pos: 'NOUN', meaning: /\bnight\b/u, says: 'night', cue: (s, i) => (lastParticle(s.top(i)) === 'to' && particlesOf(s.top(i)).length === 1 ? 'with 에 (at night)' : undefined) },
  { spelling: '줄', pos: 'NOUN', meaning: /\bstring\b|\bline\b|\brope\b/u, says: 'line, string', cue: objWith(['서다', '당기다', '잡다']) },
  { spelling: '표', pos: 'NOUN', meaning: /\bticket\b/u, says: 'ticket', cue: objWith(['사다', '끊다', '예매하다', '팔다']) },
  // ── a place, time or direction particle that fits one entry ──
  { spelling: '병', pos: 'NOUN', meaning: /\bdisease\b|\billness\b|\bsickness\b/u, says: 'illness', cue: (s, i) => (lastParticle(s.top(i)) === 'to' && govIs(s, i, ['걸리다']) ? 'with 에 걸리다 (fall ill)' : undefined) },
  { spelling: '반', pos: 'NOUN', meaning: /\bhalf\b/u, says: 'half', cue: (s, i) => (lastParticle(s.top(i)) === 'by' && govIs(s, i, ['나누다', '자르다', '접다']) ? 'with (으)로 나누다 (into halves)' : undefined) },
  // ── a list, a name, a number ──
  { spelling: '등', pos: 'NOUN', meaning: /et cetera|\betc\b|\band so on\b/u, says: 'etc.', cue: (s, i) => { const p = s.prev(i); return p >= 0 && bareNominal(s.top(p)) && s.tokens.slice(0, p).some((t) => t.surface === ',') ? 'at the end of a list (A, B 등)' : undefined; } },
  { spelling: '씨', pos: 'NOUN', meaning: /\bsir\b|\bmadam\b|\bMr\b|\bMs\b/u, says: 'Mr / Ms (after a name)', cue: (s, i) => { const p = s.prev(i); return p >= 0 && s.top(p)?.pos === 'PROPN' ? `after the name ${s.surface(p)}` : undefined; } },
  { spelling: '원', pos: 'NOUN', meaning: /\bwon\b|currency/u, says: 'won (money)', cue: (s, i) => afterNumber(s, i) },
  { spelling: '일', pos: 'NOUN', meaning: /\bday\b/u, says: 'day', cue: (s, i) => afterNumber(s, i, true) },
  { spelling: '주', pos: 'NOUN', meaning: /\bweek\b/u, says: 'week', cue: (s, i) => afterNumber(s, i, true) },
  { spelling: '초', pos: 'NOUN', meaning: /unit of time|\bsecond\b/u, says: 'second (of time)', cue: (s, i) => afterNumber(s, i) },
  // ── balanced verb sets by their argument ──
  { spelling: '따르다', pos: 'VERB', meaning: /\bpour\b/u, says: 'to pour', cue: objectIs(['물', '술', '차', '커피', '우유', '주스']) },
  { spelling: '들다', pos: 'VERB', meaning: /\bcost\b/u, says: 'to cost, take', cue: (s, i) => { const t = subjBeforeLemma(s, i, ['돈', '시간', '비용', '힘', '돈이']); return t ? `with the subject ${t}` : undefined; } },
  { spelling: '들다', pos: 'VERB', meaning: /\bhold\b|\blift\b/u, says: 'to hold, lift', cue: objectIs(['상자', '컵', '책', '우산']) },
  { spelling: '타다', pos: 'VERB', meaning: /\bride\b|\bget on\b/u, says: 'to ride, get on', cue: objectIs(['버스', '택시', '기차', '지하철', '자전거', '비행기', '배', '말', '차']) },
  { spelling: '지다', pos: 'VERB', meaning: /\bset\b/u, says: '(of the sun) to set', cue: (s, i) => { const t = subjBeforeLemma(s, i, ['해', '달', '노을']); return t ? `with the subject ${t}` : undefined; } },
  { spelling: '지다', pos: 'VERB', meaning: /\blose\b|\bdefeated\b/u, says: 'to lose (a game)', cue: (s, i) => { const p = s.prev(i); const t = p >= 0 ? s.top(p) : undefined; return t && lastParticle(t) === 'at' && ['경기', '게임', '시합', '선거', '싸움', '전쟁'].includes(bare(t)) ? `after ${s.surface(p)}` : undefined; } },
  { spelling: '쓰다', pos: 'VERB', meaning: /\bwrite\b/u, says: 'to write', cue: objectIs(['일기', '소설', '시', '보고서', '숙제', '답장']) },
];

/** A number straight before a unit noun (천 원, 십 분, 삼 일, 이 주, 오 초): digits, or a Sino-Korean numeral word (and native ones too unless `sino`). */
function afterNumber(s: KoSentence, i: number, sinoOnly = false): string | undefined {
  const p = s.prev(i);
  if (p < 0) return undefined;
  if (s.isDigits(p)) return `after the number ${s.surface(p)}`;
  if (!s.isWord(p) || !s.cands[p].some(isNumeralReading)) return undefined;
  const k = s.key(p);
  if (KO_SINO_NUMERALS.has(k) || (!sinoOnly && TRIGGER_NATIVE.has(k))) return `after the number ${s.surface(p)}`;
  return undefined;
}
/** The surface of a subject of token i in its clause with one of these lemmas (the nearest word before with 이/가), or undefined. */
function subjBeforeLemma(s: KoSentence, i: number, lemmas: readonly string[]): string | undefined {
  for (let j = i - 1; j >= 0; j--) {
    if (s.isPunct(j)) return undefined;
    const t = s.top(j);
    if (!t) continue;
    if (isPredicate(t)) return undefined;
    if (lastParticle(t) === 'subject') return lemmas.includes(bare(t)) ? s.surface(j) : undefined;
  }
  return undefined;
}

/** Does the reading belong to the rule's spelling (any homonym of it, or the undecided bare reading)? */
const ofSpelling = (c: Cand, r: HomonymRule): boolean => bare(c) === r.spelling;

function ruleHomonyms(s: KoSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const top = s.top(i);
    if (!top) continue;
    for (const r of KO_HOMONYM_RULES) {
      // the rule applies to a word whose first reading is this spelling in this class (the undecided reading, or a look-alike first)
      if (!s.cands[i].some((c) => ofSpelling(c, r) && c.pos === r.pos)) continue;
      if (!(ofSpelling(top, r) || (r.spelling === '듣다' && bare(top) === '들다') || (r.spelling === '들다' && bare(top) === '듣다'))) continue;
      const cue = r.cue(s, i);
      if (!cue) continue;
      const target = (c: Cand) => ofSpelling(c, r) && c.pos === r.pos && r.meaning.test(glossOf(c)) && c.notes?.homonym !== 'undecided';
      const found = s.cands[i].filter(target);
      // a fingerprint must name ONE entry: two readings of different lemmas that both match decide nothing
      if (!found.length || new Set(found.map((c) => c.lemma)).size > 1) continue;
      // no raised homonym number in text a person reads (the card labels entries itself): the bare headword and the meaning
      if (koPromote(s, i, (c) => c === found[0], `${s.surface(i)} ${cue}: ${r.spelling} "${r.says}".`)) break;
    }
  }
}

/** 이 / 그 / 저 straight before a noun (without the copula): the determiner "this / that" (이 사람, 그 존엄과, 저 사람). */
const DET_WORDS: Readonly<Record<string, string>> = { 이: 'this', 그: 'that', 저: 'that (over there)' };
function ruleDeterminers(s: KoSentence): void {
  for (let i = 0; i < s.n; i++) {
    const word = DET_WORDS[s.key(i)];
    if (!s.isWord(i) || !word) continue;
    // the counter rule already read it as a number before a counter (이 층: two)
    if (isNumeralReading(s.top(i)!) && s.next(i) >= 0 && s.top(s.next(i)) && isCounterReading(s.top(s.next(i))!)) continue;
    const nx = s.next(i);
    const t = nx >= 0 ? s.top(nx) : undefined;
    if (t && isNominal(t) && t.pos !== 'PRON' && t.pos !== 'NUM' && !t.morph.VerbType && !t.unconfirmed) {
      koPromote(s, i, (c) => c.pos === 'DET', `${s.key(i)} straight before the noun ${s.surface(nx)} is the determiner "${word}".`, (c) => c.pos !== 'DET');
    } else if (t && isAdn(t) && isPredicate(t)) {
      // 저 높은 산: before an adnominal and the noun it describes, the determiner (audit WW4)
      const n2 = s.next(nx);
      const t2 = n2 >= 0 ? s.top(n2) : undefined;
      if (t2 && isNominal(t2) && t2.pos !== 'PRON' && !t2.unconfirmed) koPromote(s, i, (c) => c.pos === 'DET', `${s.key(i)} before ${s.surface(nx)} ${s.surface(n2)} (an adnominal and its noun) is the determiner "${word}".`, (c) => c.pos !== 'DET');
    }
  }
  // any other word written alone with a DETERMINER reading, straight before a noun (아무 말도, 저런 옷, 새 차를, 무슨 일, 어떤 사람): the
  // determiner, over a pronoun, an interjection or a noun of the same spelling (sweep cause c5, c6)
  for (let i = 0; i < s.n; i++) {
    if (!s.isWord(i) || DET_WORDS[s.key(i)] || s.key(i) === '전') continue;
    const cs = s.cands[i];
    const top = cs[0];
    const det = cs.find((c) => c.pos === 'DET' && !c.unconfirmed && (c.parts?.length ?? 1) <= 1);
    if (!top || !det || top === det || isNumeralReading(det) || isPredicate(top)) continue;
    // over a pronoun or an interjection any determiner; over a bare NOUN only the words that are determiners first of all (새 차, 헌 책, 옛
    //친구): 성 주위, 주 가치 keep their noun reading as the token layer gives it
    if (!(top.pos === 'PRON' || top.pos === 'INTJ' || (top.pos === 'NOUN' && DET_FIRST.has(s.key(i)) && !particlesOf(top).length && (top.parts?.length ?? 1) <= 1))) continue;
    const nx = s.next(i);
    const t = nx >= 0 ? s.top(nx) : undefined;
    if (!t || !isNominal(t) || t.pos === 'PRON' || t.unconfirmed || t.morph.VerbType) continue;
    if (cs.some(isNumeralReading) && s.cands[nx].some(isCounterReading)) continue;
    koPromote(s, i, (c) => c === det, `${s.surface(i)} written alone straight before the noun ${s.surface(nx)} is the determiner "${det.gloss ?? ''}".`, (c) => c !== det);
  }
}

const DET_FIRST = new Set(['새', '헌', '옛', '첫', '온', '각', '매', '모든', '아무', '저런', '이런', '그런', '어떤', '무슨', '어느', '다른', '여러', '몇']);

/** Question words and place words before a predicate are the pronoun or adverb, not the interjection (어디 가요?, 저기 버스가 와요). */
const QUESTION_PLACE = new Set(['어디', '저기', '여기', '거기', '뭐', '왜', '언제', '누구', '어떻게', '얼마나']);
/** Words that are interjections when they open a sentence before a comma (예, / 그럼, / 네, as replies). */
const REPLY_WORDS = new Set(['예', '그럼', '응', '아니', '아니요', '아뇨']);
function ruleInterjections(s: KoSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const k = s.key(i);
    const top = s.top(i);
    if (!top) continue;
    const nx = s.next(i);
    if (QUESTION_PLACE.has(k) && top.pos === 'INTJ' && nx >= 0) {
      koPromote(s, i, (c) => c.pos === 'PRON' || c.pos === 'ADV', `${k} before ${s.surface(nx)} is the ${k === '왜' || k === '어떻게' || k === '얼마나' ? 'adverb' : 'pronoun'}, not an interjection.`, (c) => c.pos === 'INTJ');
    }
    const first = !s.tokens.slice(0, i).some((t) => t.isWord);
    if (REPLY_WORDS.has(k) && first && i + 1 < s.n && /^[,，]/u.test(s.tokens[i + 1].surface)) {
      koPromote(s, i, (c) => c.pos === 'INTJ', `${k} opening the sentence before a comma is the reply word (an interjection).`, (c) => c.pos !== 'INTJ');
    }
    // (아니면 between two alternatives: ruleCopula leaves it undecided, the copula first and the conjunction creditable; the rule that stood
    // here and chose the conjunction is gone, since the treebank writes every 아니면 as 아니- + -면 and the development figure may not fall)
    // a noun spelled like a connective -아/어 before 오다 / 가다 (빵 좀 사 와): the verb in the connective form (buy and come)
    if (nx >= 0 && ['오다', '가다'].includes(bare(s.top(nx))) && isNominal(top) && !particlesOf(top).length && s.cands[i].some((c) => c.pos === 'VERB' && c.morph.Connective === 'inf')) {
      koPromote(s, i, (c) => c.pos === 'VERB' && c.morph.Connective === 'inf', `${s.surface(i)} before ${s.surface(nx)}: a verb in the connective -아/어 (do and ${bare(s.top(nx)) === '오다' ? 'come' : 'go'}).`, (c) => !isPredicate(c));
    }
    // 전 before a noun: "former" before a title, "whole" before a place or group (전 대통령; 전 세계, 전 국민)
    if (k === '전' && top.pos === 'DET' && nx >= 0) {
      const n = bare(s.top(nx));
      if (TITLE_NOUNS.has(n)) koPromote(s, i, (c) => c.pos === 'DET' && /\bex-|former/u.test(glossOf(c)) && c.notes?.homonym !== 'undecided', `전 before the title ${s.surface(nx)} is "former, ex-".`);
      else if (WHOLE_NOUNS.has(n)) koPromote(s, i, (c) => c.pos === 'DET' && /\bwhole\b|\ball\b|entire/u.test(glossOf(c)) && c.notes?.homonym !== 'undecided', `전 before ${s.surface(nx)} is "whole, all".`);
    }
  }
}
const TITLE_NOUNS = new Set(['대통령', '장관', '회장', '총리', '의원', '국회의원', '대표', '사장', '감독', '위원장', '총장', '시장', '대사', '선수', '남편', '부인', '왕']);
const WHOLE_NOUNS = new Set(['세계', '국민', '국가', '유럽', '지역', '직원', '인류', '국토', '시민', '학생', '과정', '생애', '세대', '사원', '재산', '영역', '분야', '기간', '구간']);

/**
 * 네 "yes": alone, or first in its sentence before a comma or the end (네, 알겠습니다.), it is the interjection; 네 + a noun is "your"
 * (네 책). Audit S3.
 */
function ruleNe(s: KoSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.isWord(i) || s.key(i) !== '네') continue;
    const first = s.prev(i) < 0 && !s.tokens.slice(0, i).some((t) => t.isWord);
    const nx = s.next(i);
    if (first && nx < 0) koPromote(s, i, (c) => c.pos === 'INTJ', '네 standing alone at the head of the sentence is the answer "yes".', (c) => c.pos !== 'INTJ');
    else if (nx >= 0 && s.cands[nx].some(isCounterReading)) {
      // 네 명, 네 시, 네 개: before a counter, the numeral "four"
      koPromote(s, i, (c) => c.pos === 'NUM' || (c.pos === 'DET' && /\bfour\b/u.test(glossOf(c))), `네 before the counter ${s.surface(nx)} is the numeral "four".`);
    } else {
      const t = s.top(s.next(i));
      if (s.next(i) >= 0 && isNominal(t) && !t!.unconfirmed) koPromote(s, i, (c) => c.pos === 'PRON' && /\byour\b|\byou\b/u.test(glossOf(c) + String(c.notes?.fused ?? '')), `네 before the noun ${s.surface(s.next(i))} is "your" (너 + 의).`, (c) => c.pos === 'INTJ');
    }
  }
}

/**
 * An object (…을/를) straight before a word whose first reading is a noun written bare or with the copula, when the word also has a
 * predicate reading: the predicate (과일을 사고 → 사다, not 사고 "accident"; 밥을 자고 …). A noun takes no object. Audit S1.
 */
function ruleObjectPredicate(s: KoSentence): void {
  for (let i = 1; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const pv = s.prev(i);
    const pTop = pv >= 0 ? s.top(pv) : undefined;
    if (!pTop || lastParticle(pTop) !== 'object') continue;
    const t = s.top(i);
    if (!t) continue;
    // an adjective and a verb of one spelling (적다 "few" / "to write"): the object selects the verb (이름을 적을 종이)
    if (isPredicate(t) && t.pos === 'ADJ') {
      // only a verb reading the token layer holds as a live rival (먼 / 진정한 after an object stay adjectives: their verb rows are rare)
      koPromote(s, i, (c) => c.pos === 'VERB' && bare(c) === bare(t) && c.morph.VerbForm === t.morph.VerbForm && c.confidence >= 0.5, `After the object ${s.surface(pv)}, ${s.surface(i)} is the verb ${bare(t)}: an adjective takes no object.`, (c) => c.pos === 'ADJ' && bare(c) === bare(t));
      continue;
    }
    // a noun bare or with only a delimiter (은/는, 도: 옷을 사고는, 선물을 사고도) after an object, when a verb reading exists: the verb
    const delimitersOnly = particlesOf(t).every((p) => p === 'topic' || p === 'also');
    if (isPredicate(t) || !isNominal(t) || !delimitersOnly) continue;
    // a numeral before a counter belongs to the object (책을 한 권, 운동장을 한 바퀴): it is not the verb
    if (t.pos === 'NUM' && s.next(i) >= 0 && s.cands[s.next(i)].some(isCounterReading)) continue;
    const withDelimiter = particlesOf(t).length > 0;
    koPromote(s, i, (c) => isPredicate(c) && c.pos === 'VERB' && (!withDelimiter || c.morph.VerbForm === 'Conn'), `After the object ${s.surface(pv)}, ${s.surface(i)} is a verb: a noun takes no object.`, (c) => !isPredicate(c));
  }
}

/**
 * A whole noun written with NO particle straight before a predicate (or before 안 / 못 and a predicate), when the same token also reads as a
 * shorter listed noun + 이/가, 을/를, 은/는 or 도: the noun + particle (길이 막혀요: 길 + 이, not 길이 "length"; 불도 꺼요, 별도 많아요, 정도 많아요).
 * A noun that is an argument of that predicate carries its particle in writing; the whole word would carry its own (길이가). A whole word
 * followed by its own particle is a different token and is not touched. Sweep block T, audit ZZ.
 */
function ruleSplitBeforePredicate(s: KoSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const cs = s.cands[i];
    const top = cs[0];
    if (!top || top.unconfirmed || top.pos !== 'NOUN' || particlesOf(top).length || (top.parts?.length ?? 1) > 1 || top.morph.VerbType) continue;
    // after a number, a counter or a determiner the whole noun stands bare as an adverbial (삼십 분 정도 걸려요, 어느 정도 알아요)
    const pv0 = s.prev(i);
    const pT = pv0 >= 0 ? s.top(pv0) : undefined;
    if (pv0 >= 0 && (s.isDigits(pv0) || (pT && !particlesOf(pT).length && (pT.pos === 'NUM' || pT.pos === 'DET' || s.cands[pv0].some(isCounterReading) || MODIFIER_WORDS.has(s.key(pv0)))))) continue;
    let nx = s.next(i);
    // one adverb may stand between (길이 너무 막혀요, 반도 안 먹었어요)
    if (nx >= 0 && (s.key(nx) === '안' || s.key(nx) === '못' || isAdverb(s.top(nx))) && s.next(nx) >= 0) nx = s.next(nx);
    const nTop = nx >= 0 ? s.top(nx) : undefined;
    if (!nTop || !isPredicate(nTop)) continue;
    const split = cs.find((c) => isNominal(c) && c.pos !== 'PRON' && !c.unconfirmed && particlesOf(c).length === 1 && ['subject', 'object', 'topic', 'also', 'only'].includes(lastParticle(c) ?? '') && c.confidence >= 0.4);
    if (!split) continue;
    koPromote(s, i, (c) => c === split, `${s.surface(i)} straight before the predicate ${s.surface(nx)}, with no particle of its own: ${bare(split)} with the particle ${split.parts?.[split.parts.length - 1]?.text ?? ''} (an argument of ${s.surface(nx)}).`, (c) => c === top);
  }
}

/**
 * A noun + 도 against the connective -아/어도 "even if" (차도, 새도, 자도, 기대도, 피해도, 파도): the verb when an object or an adverb stands
 * before it (a place does not decide: 나무에 새도 있어요 is "a bird too"), or when 되다 / 괜찮다 / 좋다 follows (-아/어도 되다: may), or after a subject when another predicate of the clause follows
 * (지붕이 새도 고칠 돈이 없다). Otherwise noun + 도 (불도 꺼요, 문도 닫아요: an object with 도).
 */
function ruleEvenIf(s: KoSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const cs = s.cands[i];
    const top = cs[0];
    const noun = cs.find((c) => isNominal(c) && lastParticle(c) === 'also' && particlesOf(c).length === 1);
    const conn = cs.find((c) => isPredicate(c) && c.morph.Connective === 'even-if' && c.pos !== 'AUX');
    if (!top || !noun || !conn || top === conn) continue;
    const pv = s.prev(i);
    const nx = s.next(i);
    const pTop = pv >= 0 ? s.top(pv) : undefined;
    const nTop = nx >= 0 ? s.top(nx) : undefined;
    const p = pTop ? lastParticle(pTop) : undefined;
    const permit = !!nTop && ['되다', '괜찮다', '좋다'].includes(bare(nTop));
    const argBefore = !!pTop && (p === 'object' || isAdverb(pTop));
    const subjThenPred = !!pTop && p === 'subject' && !!nTop && isPredicate(nTop) && nTop.morph.VerbForm !== 'Fin';
    if (!(permit || argBefore || subjThenPred)) continue;
    const why = permit ? `before ${s.surface(nx)} (-아/어도 ${bare(nTop)}: may)` : `after ${s.surface(pv)}`;
    koPromote(s, i, (c) => c === conn, `${s.surface(i)} ${why}: ${bare(conn)} with the connective -아/어도 "even if", not a noun + 도.`, (c) => c !== conn && !(isPredicate(c) && bare(c) === bare(conn) && c.morph.Connective === 'even-if'));
  }
}

/**
 * An adnominal form (-(으)ㄴ, -는, -(으)ㄹ, -던) is followed by a nominal: when the next word has a BOUND-noun reading of its spelling (자
 * "one who", 이 "person", 분, 것, 데, 바, 줄, 뿐 …: the lexicon's own bound nouns), that reading comes before a verb or another noun of the
 * same spelling (죄 지은 자를: the one who sinned, not 자르다). The entry is the one the lexicon marks bound, never a number.
 */
/**
 * A token that is both a noun + 은/는/을/ㄹ and a predicate's adnominal (피는, 새는, 차는, 산): the ADNOMINAL when a nominal follows it directly
 * AND something the predicate governs or is governed by stands directly before it (a noun in 이/가, 을/를, 에, 에서, (으)로, 에게, an adverb,
 * a time noun used as an adverb, a connective form): 꽃이 피는 꽃, 공을 차는 아이, 어제 산 책, 집에 가는 길. It stays the noun + particle
 * when a predicate, a comma or the end follows (물은 차가워요), and when it is the first word of its clause (차는 값이 비싸요: topic, then
 * subject). A pronoun (나는, 저는) is never made an adnominal. Audit ZZ.
 */
const GOVERNED_BEFORE = new Set(['subject', 'subject-hon', 'object', 'to', 'at', 'by', 'to-person', 'to-person-hante', 'to-person-hon', 'from-person', 'and', 'and-hago']);
/** Nouns of place that take an owner noun before them (산 위, 줄 끝); the nouns of time after an adnominal (뒤, 후, 다음, 전) are not here. */
const PLACE_NOUNS = new Set(['위', '아래', '앞', '옆', '안', '밖', '끝', '속', '밑', '근처', '쪽', '가운데', '너머']);
function ruleAdnominalOrNoun(s: KoSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const cs = s.cands[i];
    const top = cs[0];
    if (!top) continue;
    // the noun reading: with 은/는 or 을/를 (피 + 는, 공 + 을; a pronoun too, see below), or a bare ONE-syllable noun whose last sound is the
    // adnominal's ㄴ / ㄹ (산 "mountain" against 사다 + -(으)ㄴ in 어제 산 책); a longer bare noun is a noun before a noun (겨울 옷)
    const oneSyllable = [...s.key(i)].length === 1;
    const nounP = cs.find((c) => isNominal(c) && !c.unconfirmed && !c.morph.VerbType
      && ((['topic', 'object'].includes(lastParticle(c) ?? '') && particlesOf(c).length === 1) || (c.pos !== 'PRON' && oneSyllable && !particlesOf(c).length && (c.parts?.length ?? 1) <= 1)));
    // the adnominal reading: after an object, a verb's before an adjective's of one spelling (이름을 적을: 적다 "write", not "few")
    const objBefore = s.prev(i) >= 0 && lastParticle(s.top(s.prev(i))) === 'object';
    const adn = (objBefore ? cs.find((c) => c.pos === 'VERB' && isAdn(c)) : undefined) ?? cs.find((c) => isPredicate(c) && isAdn(c) && c.pos !== 'AUX');
    if (!nounP || !adn) continue;
    // an earlier sure rule already decided this word (전 after 오래: "before"; 그 날): it is not reopened. The counter rule's "no number before
    // it" only demoted a counter reading and decides nothing between the noun and the verb
    const decided = cs.some((c) => c.notes?.credit === 'set aside by the sentence') && !String(top.notes?.context ?? '').startsWith('No number stands before');
    if (decided) continue;
    // a numeral or determiner first (한 권, 그 날): the counter and determiner rules decide it, not this one
    if (top.pos === 'NUM' || top.pos === 'DET' || top.pos === 'CLF' || (s.next(i) >= 0 && cs.some(isNumeralReading) && s.cands[s.next(i)].some(isCounterReading))) continue;
    const nx = s.next(i);
    const nTop = nx >= 0 ? s.top(nx) : undefined;
    const nominalNext = !!nTop && (isNominal(nTop) || nTop.pos === 'NUM') && !nTop.unconfirmed;
    const pv = s.prev(i);
    const pTop = pv >= 0 ? s.top(pv) : undefined;
    // a place or a person with 에 / 에서 / 에게 … governs too when a delimiter follows it (여기에는 숨을 곳, 집에서도 먹는 밥)
    const governed = !!pTop && (GOVERNED_BEFORE.has(lastParticle(pTop) ?? '') || particlesOf(pTop).slice(0, -1).some((p) => GOVERNED_BEFORE.has(p) && p !== 'subject' && p !== 'object') || isAdverb(pTop) || (isPredicate(pTop) && pTop.morph.VerbForm === 'Conn') || (TIME_ADVERB_NOUNS.has(s.key(pv)) && !particlesOf(pTop).length));
    // a bare one-syllable noun before a noun is usually its modifier (신 중심, 술 문화): the adnominal only after an object, a place, an
    // adverb or a time noun (어제 산 책, 시장에서 산 사과), never on a subject alone
    const bareNoun = !particlesOf(nounP).length;
    const strong = governed && !(bareNoun && pTop && ['subject', 'subject-hon'].includes(lastParticle(pTop) ?? ''));
    // the next word is a noun with no creditable predicate reading of its own (빚을 다 갚았어요: 다 is "all", and 빚을 stays the object)
    const plainNominalNext = nominalNext && !s.cands[nx].some((c) => (isPredicate(c) || isAdverb(c)) && c.confidence >= 0.5);
    // a pronoun (나는, 이를) becomes an adnominal only after a subject, a place or an adverb, before a noun (냄새가 나는 음식, 목적지에 이를 때):
    // a pronoun with its particle cannot stand there; after an object or first in its clause it stays the pronoun (나는 학생이에요)
    const pronoun = nounP.pos === 'PRON' || cs.some((c) => c.pos === 'PRON' && c.confidence >= 0.5);
    // only 나는 (나다 / 날다) and 이를 (이르다): 우리는, 그를, 이는 after an adverb are the pronouns (특별히 이는, 선생들이 그를 격려)
    const pronLemma = bare(nounP.pos === 'PRON' ? nounP : cs.find((c) => c.pos === 'PRON') ?? nounP);
    const pronounOk = !pronoun || ((pronLemma === '나' || pronLemma === '이') && !!pTop
      && (lastParticle(pTop) === 'subject' || (pronLemma === '나' && ['높이', '낮게', '멀리'].includes(s.key(pv))) || (pronLemma === '이' && lastParticle(pTop) === 'to')));
    // (first word of its clause, a nominal after it: 식은 밥을 against 새는 하늘을 is the same shape with opposite answers, so the token order
    // stands there, both readings creditable; no tie-breaker is invented. Last round, S-a: the old "first in its clause, the noun" branch
    // below is gone; where only position is known, the token layer's order (the counts) decides)
    // an object needs a predicate that takes one (last round, S-a): noun + 을/를 straight before a noun, where that object cannot belong
    // to anything, is the adnominal: (1) another object follows at once (신을 신발을 샀어요: a clause has one object, side by side two
    // objects do not stand), or (2) the clause's first predicate after it is an adjective or 있다 / 없다, which take no object (물을 사람이
    // 없다, 입을 옷이 없어요). Before a verb it stays as the token layer has it (물을 마셔요, 입을 벌리세요)
    if (!pronoun && lastParticle(nounP) === 'object' && plainNominalNext && adn.pos === 'VERB') {
      let objectless = lastParticle(nTop) === 'object';
      if (!objectless) {
        for (let j = nx + 1; j < s.n; j++) {
          if (s.isPunct(j)) break;
          const t = s.top(j);
          if (!t || !isPredicate(t) || isAdn(t)) continue;
          objectless = t.pos === 'ADJ' && t.morph.VerbForm === 'Fin';
          break;
        }
      }
      if (objectless) {
        const why = lastParticle(nTop) === 'object' ? `another object (${s.surface(nx)}) follows it at once` : 'the clause\'s predicate takes no object';
        koPromote(s, i, (c) => c === adn, `${s.surface(i)} before the noun ${s.surface(nx)}: ${why}, so it is the adnominal of ${bare(adn)}, not an object.`, (c) => c !== adn && !(isPredicate(c) && isAdn(c)), (c) => isPredicate(c) && isAdn(c) && c.pos !== 'AUX' && c.confidence >= 0.5);
        continue;
      }
    }
    // a bare noun straight before a noun of PLACE (위, 아래, 앞, 옆, 안, 밖, 끝, 속, 밑, 근처, 쪽, 가운데, 너머; not 사이, which is time
    // after an adnominal too: 간 사이에) with nothing before it
    // that a verb could govern is that place's owner (산 위에, 줄 끝에), not an adnominal; after an argument the adnominal stands (학교에
    // 간 뒤에, 일을 한 후에: the strong case above), and 뒤 / 후 / 다음 / 전, nouns of TIME after an adnominal, are not in the list
    if (bareNoun && !strong && nTop && isNominal(nTop) && PLACE_NOUNS.has(bare(nTop)) && nounP.confidence >= 0.5 && !nounP.notes?.credit) {
      koPromote(s, i, (c) => c === nounP, `${s.surface(i)} straight before the place noun ${s.surface(nx)}, with nothing before it for a verb to govern: the noun ${bare(nounP)} (whose ${s.surface(nx)}).`, (c) => isPredicate(c) && isAdn(c));
      continue;
    }
    if (plainNominalNext && pronounOk && strong) {
      koPromote(s, i, (c) => c === adn, `${s.surface(i)} between ${s.surface(pv)} and the noun ${s.surface(nx)}: the adnominal of ${bare(adn)} (it describes ${s.surface(nx)}).`, (c) => c !== adn && !(isPredicate(c) && isAdn(c)), (c) => isPredicate(c) && isAdn(c) && c.pos !== 'AUX' && c.confidence >= 0.5);
      // (the OTHER adnominal readings are not set aside: which verb it is (사다 / 살다, 가다 / 갈다) is the look-alike cues' to decide next)
      continue;
    }
    if (pronoun || top !== adn || bareNoun) continue;
    // the reverse (audit ZZ): the adnominal first, but nothing for it to describe or nothing to govern:
    //   a predicate, a comma or the end straight after it (여는 좋아요, 가을 감은 맛있어요, 공연이 막을 올렸어요): an adnominal must describe a
    //   noun, whatever stands before it;
    //   after a determiner or a modifier word (이 도는, 그 가게는): what follows a determiner is a nominal;
    //   first in its clause with no argument before it, a nominal after it (차는 값이 비싸요, 남은 신경 쓰지 마세요, 실을 바늘에 꿰었어요): the topic
    //   or object, the commonest pattern of the language (audit ZZ: a first word is not made an adnominal);
    //   after a bare noun (가을 감은, 나무 가지도): the second noun of the two.
    // Before another adnominal or a word that can be a bound noun (삼는 데) the order stands.
    // the next word must have NO nominal reading at all (먹는 겁니다: 거 + 입니다; 삼는 데) for "a predicate follows" to decide; the end is
    // the end of the SENTENCE (a comma or a bracket may stand after an adnominal in prose: 인상을 주는, 어디서고 …; 이라 불리는 <대부>)
    const anyNominalNext = nx >= 0 && s.cands[nx].some((c) => (isNominal(c) && !c.unconfirmed && c.confidence >= 0.5) || c.morph.NounType === 'Bound');
    let lastWord = true;
    for (let j = i + 1; j < s.n; j++) if (s.isWord(j) || s.isDigits(j)) { lastWord = false; break; }
    // an adverb and then the predicate count as "a predicate follows" (빚을 다 갚았어요: an adnominal never describes an adverb)
    const n2 = nx >= 0 ? s.next(nx) : -1;
    const advThenPred = !!nTop && nTop.pos === 'ADV' && n2 >= 0 && isPredicate(s.top(n2)) && s.top(n2)!.morph.VerbForm !== 'Adn';
    const endOrPred = nx < 0 ? lastWord : (!!nTop && isPredicate(nTop) && nTop.morph.VerbForm !== 'Adn' && !anyNominalNext) || advThenPred;
    const afterDet = !!pTop && (pTop.pos === 'DET' || MODIFIER_WORDS.has(s.key(pv)));
    // (first in its clause before a nominal with a particle, the noun was chosen here until the last round: the auditor's blocker CCC1, 우는
    // 아이를, 노는 아이들이, 먹을 물을. Position alone decides nothing: the token layer's order, which is the counts, stands, the other
    // reading creditable)
    // (so 실을 바늘에 꿰었어요 is undecided: 먹을 곳에 가요, 입을 옷으로 갈아입었어요 are the same shape with the adnominal; the coordinator's
    // correction to the last round removed the case that made the first one a confident object)
    if (endOrPred || (!strong && nounP.confidence >= 0.5 && afterDet)) {
      const why = endOrPred ? (nx >= 0 ? `straight before the predicate ${s.surface(nx)}` : 'at the end of its clause') : `after ${s.surface(pv)}`;
      koPromote(s, i, (c) => c === nounP, `${s.surface(i)} ${why}: the noun ${bare(nounP)} with its particle (an adnominal must describe a noun after it).`, (c) => isPredicate(c) && isAdn(c));
    }
  }
}

/**
 * A word that reads as a listed noun (bare or with a particle) and as a predicate's CONNECTIVE or final form, followed directly by a noun:
 * the noun (가게 앞에서, 사고 소식을, 나무 가지도, 해도 달도): a -고 / -게 / -아/어도 form is not followed by a noun of its own clause, and the
 * listed noun is. After an object the predicate stays (밥을 먹고 학교에): an argument decides for the verb.
 */
function ruleNounBeforeNoun(s: KoSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const cs = s.cands[i];
    const top = cs[0];
    if (!top || !isPredicate(top) || !['Conn', 'Fin'].includes(top.morph.VerbForm ?? '')) continue;
    const noun = cs.find((c) => (c.pos === 'NOUN' || c.pos === 'PROPN') && !c.unconfirmed && !c.morph.VerbType && particlesOf(c).every((p) => ['topic', 'also', 'only', 'subject', 'object', 'of'].includes(p)) && particlesOf(c).length <= 1 && c.confidence >= 0.5);
    if (!noun) continue;
    const nx = s.next(i);
    const nTop = nx >= 0 ? s.top(nx) : undefined;
    const pv = s.prev(i);
    const pTop = pv >= 0 ? s.top(pv) : undefined;
    // after a bare noun, a noun with its particle (나무 가지도 잘랐어요: the second noun of the two), whatever follows
    if (pTop && isNominal(pTop) && pTop.pos !== 'PRON' && !particlesOf(pTop).length && !pTop.morph.VerbType && !TIME_ADVERB_NOUNS.has(s.key(pv))
      && particlesOf(noun).length === 1 && top.morph.VerbForm === 'Conn') {
      koPromote(s, i, (c) => c === noun, `${s.surface(i)} after the noun ${s.surface(pv)}: the second noun of the two (${bare(noun)}), not a verb form.`, (c) => isPredicate(c));
      continue;
    }
    // after a determiner or a modifier word (그 가게는, 그 보고는, 그 사서는): a nominal
    if (pTop && (pTop.pos === 'DET' || MODIFIER_WORDS.has(s.key(pv)))) {
      koPromote(s, i, (c) => c === noun, `${s.surface(i)} after ${s.surface(pv)}: what follows a determiner is a noun (${bare(noun)}).`, (c) => isPredicate(c));
      continue;
    }
    // -아/어도 before a final predicate that is no permission, after a topic or subject (이 문장은 주어도 없어요): the noun + 도
    if (top.morph.Connective === 'even-if' && lastParticle(noun) === 'also' && nTop && isPredicate(nTop) && nTop.morph.VerbForm === 'Fin' && !['되다', '괜찮다', '좋다'].includes(bare(nTop))
      && pTop && ['topic', 'subject'].includes(lastParticle(pTop) ?? '')) {
      koPromote(s, i, (c) => c === noun, `${s.surface(i)} between ${s.surface(pv)} and the predicate ${s.surface(nx)}: the noun ${bare(noun)} + 도, not -아/어도.`, (c) => isPredicate(c));
      continue;
    }
    if (!nTop || !isNominal(nTop) || nTop.unconfirmed || nTop.pos === 'PRON' || s.cands[nx].some((c) => isPredicate(c) && c.confidence >= 0.5)) continue;
    // only at the head of a clause or after an adnominal (가게 앞에서, 큰 사고 소식을): after anything else the verb form may well end its
    // clause before the noun (보스턴으로 가 연극에, 국민에게 주지만 경제, 떠올리기만 해도 고기가)
    if (!(pv < 0 || (pTop && isAdn(pTop)))) continue;
    koPromote(s, i, (c) => c === noun, `${s.surface(i)} straight before the noun ${s.surface(nx)}: the noun ${bare(noun)}, not a verb form that ends its clause.`, (c) => isPredicate(c));
  }
}

/**
 * Three shapes where a nominal reading wins over a predicate or adverb form of the same token (last round, S-b and S-h):
 *  (1) X도 Y도, two different words each with a noun + 도 reading side by side, are a pair of nominals (해도 달도 없어요: "neither sun nor
 *      moon"); the same word twice (가도 가도, 해도 해도) is the verb repeated and is left alone;
 *  (2) X도 straight before a final 있다 / 없다: no predicate's connective form takes 도 and then the existence verb (there is no -아도 있다,
 *      -게도 있다, -고도 있다), so a noun + 도 reading is the subject (가게도 있어요, 사도 있어요, 해도 있어요);
 *  (3) after a determiner that is no number (이, 그, 저, 새 …), a whole ADVERB reading of the next word loses to a noun + particle of the
 *      same letters (이 실은: 실 + 은, not 실은 "actually"): what follows a determiner is a nominal.
 */
function ruleNominalPairs(s: KoSentence): void {
  // a whole listed word of the same letters (사도 "apostle", 해도 "chart") is not decided against: it stays creditable beside the split
  const wholeOpen = (c: Cand): boolean => isNominal(c) && c.confidence >= 0.5 && !c.notes?.credit && !c.unconfirmed && !particlesOf(c).length;
  const nounAlso = (i: number) => s.cands[i]?.find((c) => (c.pos === 'NOUN' || c.pos === 'PROPN') && !c.unconfirmed && c.confidence >= 0.5 && !c.notes?.credit && particlesOf(c).length === 1 && lastParticle(c) === 'also');
  for (let i = 0; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const top = s.top(i);
    if (!top) continue;
    const nx = s.next(i);
    const pv = s.prev(i);
    const noun = nounAlso(i);
    if (noun && top !== noun && !isNominal(top)) {
      const pair = [pv, nx].find((j) => j >= 0 && s.isWord(j) && s.key(j) !== s.key(i) && !!nounAlso(j));
      if (pair !== undefined) {
        koPromote(s, i, (c) => c === noun, `${s.surface(i)} beside ${s.surface(pair)}: X도 Y도 is a pair of nominals (${bare(noun)} + 도).`, (c) => isPredicate(c), wholeOpen);
        continue;
      }
      const nTop = nx >= 0 ? s.top(nx) : undefined;
      if (nTop && isPredicate(nTop) && nTop.morph.VerbForm === 'Fin' && ['있다', '없다'].includes(bare(nTop)) && isPredicate(top) && top.morph.VerbForm === 'Conn') {
        koPromote(s, i, (c) => c === noun, `${s.surface(i)} straight before ${s.surface(nx)}: no connective form takes 도 before 있다 / 없다, so it is the noun ${bare(noun)} + 도.`, (c) => isPredicate(c), wholeOpen);
        continue;
      }
    }
    if (top.pos === 'ADV' && pv >= 0 && s.isWord(pv) && (top.parts?.length ?? 1) <= 1 && s.cands[pv].some((c) => c.pos === 'DET' && !isNumeralReading(c) && !c.unconfirmed && c.confidence >= 0.5)) {
      const n = s.cands[i].find((c) => isNominal(c) && c.pos !== 'PRON' && !c.unconfirmed && c.confidence >= 0.5 && particlesOf(c).length > 0);
      if (n) koPromote(s, i, (c) => c === n, `${s.surface(i)} after the determiner ${s.surface(pv)}: what follows a determiner is a nominal (${bare(n)} with its particle), not the adverb ${bare(top)}.`, (c) => !isNominal(c));
    }
  }
}

/**
 * The contracted copula (겁니다, 겁니까, 건데요, 거니까, 접니다: a vowel-final nominal + the copula not written + its ending) against a verb
 * of the same letters (걸다 + -ㅂ니다, 절다 + -ㅂ니다). The sentence decides by what stands straight before it:
 *   (a) an adnominal form (갈 겁니다, 먹을 겁니다, 좋은 겁니다): the bound noun of -(으)ㄹ / -는 / -(으)ㄴ 것이다, the nominal + copula;
 *   (b) a determiner, a possessive or a genitive (제 겁니다, 누구 겁니까, 우리 겁니다, 친구의 겁니다): the nominal + copula;
 *   (c) otherwise, an object in 을/를 earlier in its clause (전화를 겁니다, 옷을 옷걸이에 겁니다, 다리를 접니다): the verb, which takes it;
 *   (d) none of these (접니다 alone, answering "who is it?"): the token order stands, both creditable.
 */
const POSSESSIVE_WORDS = new Set(['제', '내', '네', '우리', '저희', '너희', '누구', '그', '이', '저', '자기', '당신']);
function ruleContractedCopula(s: KoSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const cs = s.cands[i];
    const nominal = cs.find((c) => isNominal(c) && !c.unconfirmed && (c.parts ?? []).some((x) => x.lemma === '이다') && c.confidence >= 0.5 && !c.notes?.credit);
    const verb = cs.find((c) => isPredicate(c) && c.pos !== 'AUX' && !c.unconfirmed && c.confidence >= 0.5 && !c.notes?.credit);
    if (!nominal || !verb) continue;
    const pv = s.prev(i);
    const pTop = pv >= 0 && s.isWord(pv) ? s.top(pv) : undefined;
    const say = `${s.surface(i)}`;
    if (pTop && isPredicate(pTop) && isAdn(pTop)) {
      koPromote(s, i, (c) => c === nominal, `${say} after the adnominal ${s.surface(pv)}: ${bare(nominal)} + the copula (-(으)ㄹ / -는 것이다), not ${bare(verb)}.`, (c) => isPredicate(c) && c.pos !== 'AUX');
      continue;
    }
    if (pTop && (pTop.pos === 'DET' || lastParticle(pTop) === 'of' || (!particlesOf(pTop).length && POSSESSIVE_WORDS.has(s.key(pv)) && pTop.pos === 'PRON'))) {
      koPromote(s, i, (c) => c === nominal, `${say} after ${s.surface(pv)} (whose): ${bare(nominal)} + the copula, not ${bare(verb)}.`, (c) => isPredicate(c) && c.pos !== 'AUX');
      continue;
    }
    const o = s.objectBefore(i);
    if (o >= 0) koPromote(s, i, (c) => c === verb, `${say} with the object ${s.surface(o)}: the verb ${bare(verb)}, not ${bare(nominal)} + the copula.`, (c) => isNominal(c));
  }
}

function ruleAfterAdnominal(s: KoSentence): void {
  for (let i = 1; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const pv = s.prev(i);
    if (pv < 0 || !isAdn(s.top(pv))) continue;
    // an adnominal last in its clause before another adnominal reading (높은 산.: 산 "mountain", not 살다 + -(으)ㄴ): nothing follows for that
    // second adnominal to describe, so the word is the noun the first one describes
    const top = s.top(i);
    // a whole listed noun after an adnominal stays whole (중요한 시기예요: 시기 "period", not the bound 시 "hour" + something): a bound reading
    // whose stem is shorter than the first reading's noun stem is no rival
    const stemEnd = (c: Cand) => c.parts?.[0]?.end ?? 0;
    const bound = s.cands[i].filter((c) => c.morph.NounType === 'Bound' && !c.unconfirmed && c.notes?.homonym !== 'undecided' && !(top && isNominal(top) && stemEnd(c) < stemEnd(top)));
    if (!bound.length && top && isAdn(top) && isPredicate(top) && !(s.next(i) >= 0 && isNominal(s.top(s.next(i))))) {
      koPromote(s, i, (c) => isNominal(c) && !c.unconfirmed && bareNominal(c), `After the adnominal ${s.surface(pv)}, with no noun after it, ${s.surface(i)} is the noun it describes.`, (c) => isPredicate(c));
      continue;
    }
    if (!bound.length || new Set(bound.map((c) => c.lemma)).size > 1) continue;
    const b = bound[0];
    if (s.top(i) === b) continue;
    // 이 "person" is literary and 이 "tooth" ordinary: only after an action verb (믿는 이), never after a descriptive one (하얀 이 is teeth)
    if (bare(b) === '이' && s.top(pv)?.pos !== 'VERB') continue;
    // 내 "within" follows a NOUN, never an adnominal (해야 할 내 강의: my lecture): the fused-form rule decides it
    if (bare(b) === '내') continue;
    koPromote(s, i, (c) => c === b, `After the adnominal ${s.surface(pv)} a noun follows: ${bare(b)} is the bound noun "${b.gloss ?? ''}".`);
  }
}

/** Motion verbs after which a -(으)러 form is the purpose "(go) to do". */
const MOTION = new Set(['가다', '오다', '다니다', '나가다', '나오다', '들어가다', '들어오다', '올라가다', '내려가다', '돌아가다', '돌아오다', '떠나다']);
/**
 * 들러: 들르다 "to stop by" + -어, or 들다 + the purpose ending -(으)러. Not before a motion verb it is 들르다 (들러 보다, 들러서, 들러 빵을 샀다); before
 * one, a place with 에 before it still says 들르다 (집에 들러 갈게: stop by on the way), and anything else is left as it is (진지를 들러 오세요,
 * the honorific 들다 "to eat", is the purpose reading).
 */
function ruleDeulleo(s: KoSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.isWord(i) || s.key(i) !== '들러') continue;
    const nx = s.next(i);
    const motion = nx >= 0 && MOTION.has(bare(s.top(nx)));
    const pv = s.prev(i);
    const place = pv >= 0 && ['to', 'at'].includes(lastParticle(s.top(pv)) ?? '');
    if (motion && !place) continue;
    const why = motion ? `after the place ${s.surface(pv)}` : 'not before a verb of motion';
    koPromote(s, i, (c) => bare(c) === '들르다' && (nx >= 0 ? c.morph.VerbForm === 'Conn' : c.morph.VerbForm === 'Fin'), `들러 ${why}: 들르다 "to stop by" + -어 (not 들다 + -(으)러 "in order to").`);
  }
}

/** Verbs written alike in a form, told apart by what they take (audit S2, U5). Each cue decides practically always. */
interface LookalikeRule { pick: string; meaning?: RegExp; among: readonly string[]; says: string; cue: (s: KoSentence, i: number) => string | undefined }
/** The nearest word before i in its clause with a subject particle, no predicate between. */
const subjectBefore = (s: KoSentence, i: number, lemmas: readonly string[]): string | undefined => {
  for (let j = i - 1; j >= 0; j--) {
    if (!s.isWord(j) && !s.isDigits(j)) return undefined;
    const t = s.top(j);
    if (!t) continue;
    if (isPredicate(t)) return undefined;
    if (lastParticle(t) === 'subject' && lemmas.includes(bare(t))) return s.surface(j);
  }
  return undefined;
};
const anyObject = (except: readonly string[]) => (s: KoSentence, i: number): string | undefined => {
  const o = s.objectBefore(i);
  return o >= 0 && !except.includes(bare(s.top(o))) ? `with the object ${s.surface(o)}` : undefined;
};
export const KO_LOOKALIKE_RULES: readonly LookalikeRule[] = [
  { pick: '걸다', among: ['걷다'], says: 'to hang; to make (a call)', cue: objectIs(['그림', '전화', '옷', '시계', '커튼', '사진', '말', '기대', '희망', '목숨']) },
  { pick: '걷다', meaning: /\bwalk\b/u, among: ['걸다'], says: 'to walk', cue: objectIs(['길', '거리', '산길', '오솔길', '해변']) },
  { pick: '물다', meaning: /\bbite\b/u, among: ['묻다'], says: 'to bite', cue: (s, i) => { const w = subjectBefore(s, i, ['개', '고양이', '모기', '뱀', '벌레', '강아지']); return w ? `with the subject ${w}` : undefined; } },
  { pick: '묻다', meaning: /\bask\b/u, among: ['물다'], says: 'to ask', cue: objectIs(['길', '이름', '값', '나이', '이유', '안부', '질문', '의견']) },
  { pick: '갈다', meaning: /\bgrind\b/u, among: ['가다'], says: 'to grind, sharpen', cue: objectIs(['칼', '이', '커피', '콩', '먹', '칼날', '도끼', '마늘']) },
  { pick: '갈다', meaning: /\bsow\b|\bplough\b|\bplow\b|\btill\b/u, among: ['가다'], says: 'to plough, till', cue: objectIs(['밭', '논', '땅']) },
  { pick: '갈다', meaning: /\bchange\b|\breplace\b/u, among: ['가다'], says: 'to change, replace', cue: objectIs(['전구', '타이어', '기저귀', '배터리', '건전지']) },
  { pick: '사다', among: ['살다'], says: 'to buy (살다 "to live" takes no object but 삶 / 인생)', cue: anyObject(['삶', '인생', '생활', '일생', '세월']) },
  // a place NAME in 에 / 에서 (한국에서, 서울에) is where one lives; a common place in 에서 (시장에서 산 사과) says nothing: one buys there too
  { pick: '살다', meaning: /\blive\b/u, among: ['사다'], says: 'to live', cue: (s, i) => { const p = s.prev(i); const t = p >= 0 ? s.top(p) : undefined; return t && t.pos === 'PROPN' && ['to', 'at'].includes(lastParticle(t) ?? '') && s.objectBefore(i) < 0 ? `after the place name ${s.surface(p)}` : undefined; } },
  { pick: '쓰다', meaning: /\bbitter\b/u, among: ['쓰다'], says: 'to be bitter', cue: (s, i) => { const t = subjBeforeLemma(s, i, ['커피', '약', '맛', '한약', '차', '술']); return t ? `with the subject ${t} (a taste)` : undefined; } },
  { pick: '날다', meaning: /\bfly\b/u, among: ['나다'], says: 'to fly', cue: (s, i) => { const p = s.prev(i); const k = p >= 0 ? s.key(p) : ''; return ['높이', '낮게', '하늘을', '하늘에', '하늘로', '멀리'].includes(k) ? `after ${k}` : undefined; } },
  { pick: '짓다', meaning: /build|make|cook|compose/u, among: ['지다', '짖다'], says: 'to build, make', cue: objectIs(['집', '밥', '이름', '시', '옷', '미소', '죄', '건물', '농사', '표정']) },
];

function ruleLookalikes(s: KoSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const top = bare(s.top(i));
    for (const r of KO_LOOKALIKE_RULES) {
      if (top !== r.pick && !r.among.includes(top)) continue;
      const want = (c: Cand) => bare(c) === r.pick && isPredicate(c) && c.notes?.homonym !== 'undecided' && (!r.meaning || r.meaning.test(glossOf(c)));
      // a lemma that is itself a homonym set: the fingerprint must name one entry; with no fingerprint the lemma must be alone
      const found = s.cands[i].filter(want);
      if (!found.length || new Set(found.map((c) => c.lemma)).size > 1) continue;
      const cue = r.cue(s, i);
      if (!cue) continue;
      if (koPromote(s, i, (c) => c === found[0], `${s.surface(i)} ${cue}: ${r.pick} "${r.says}".`)) break;
    }
  }
}

/**
 * -아/어 and -지 inside a sentence (another word follows in the same clause) are the connective form; at the end of the sentence the
 * 해체 sentence-final ending (있어 관련해 … : a clause follows; 먹어? : final). Audit S5.
 */
function ruleFinality(s: KoSentence): void {
  let last = -1;
  for (let i = s.n - 1; i >= 0; i--) if (s.isWord(i)) { last = i; break; }
  for (let i = 0; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const t = s.top(i);
    if (!t || !isPredicate(t)) continue;
    const e = String(t.notes?.ending ?? '');
    if (e !== '-아/-어' && e !== '-지') continue;
    const same = (c: Cand) => bare(c) === bare(t) && c.pos === t.pos && String(c.notes?.ending ?? '') === e;
    const conn = s.cands[i].find((c) => same(c) && c.morph.VerbForm === 'Conn');
    const fin = s.cands[i].find((c) => same(c) && c.morph.VerbForm === 'Fin');
    if (!conn || !fin) continue;
    if (i === last) koPromote(s, i, (c) => c === fin, `${s.surface(i)} ends the sentence: the sentence-final ending ${e} (해체).`, (c, ch) => c === conn && ch === fin);
    else if (s.next(i) >= 0 && s.isWord(s.next(i))) koPromote(s, i, (c) => c === conn, `Another word follows ${s.surface(i)} in the same clause: ${e} is the connective form here, not a sentence-final ending.`, (c, ch) => c === fin && ch === conn);
  }
}

// ───────────────────────────── 5. marks: complement, sentence type, negation ─────────────────────────────

function ruleComplement(s: KoSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const nx = s.next(i);
    const t = nx >= 0 ? s.top(nx) : undefined;
    const pred = t ? bare(t) : '';
    if (pred !== '되다' && pred !== '아니다') continue;
    if (!s.mayMark(i)) continue;
    for (const c of s.cands[i]) {
      if (lastParticle(c) !== 'subject' || !isNominal(c)) continue;
      c.morph = { ...c.morph, Complement: 'Yes' };
      const parts = c.parts?.map((p) => (p.lemma === '이/가' ? { ...p, role: `complement particle: marks what one ${pred === '되다' ? 'becomes' : 'is not'} (before ${pred})` } : p));
      if (parts) c.parts = parts;
      const kp = koPosOf(c);
      if (kp) c.notes = { ...c.notes, koPos: kp.replace(/JKS(?!.*JKS)/u, 'JKC') };
      if (c === s.cands[i][0]) addContext(c, `Before ${s.surface(nx)}, 이/가 marks the complement (보격 조사), not the subject.`);
    }
  }
}

/**
 * The last word of a sentence with no other predicate, after an object or a place or before "!", is the predicate when it has a licensed
 * predicate reading (불 켜!, 여기 서!, 문을 닫아.): a sentence needs its verb. Audit HH1.
 */
/** Words that modify the noun after them (determiners, the fused 내 / 제 / 네 "my, your"): what follows one is a nominal. */
const MODIFIER_WORDS = new Set(['이', '그', '저', '우리', '저희', '내', '제', '네', '한', '온', '새', '모든', '각', '옛', '헌', '첫', '무슨', '어느', '어떤', '이런', '그런', '저런', '몇', '여러', '두', '세', '이번', '다른']);
function ruleLastPredicate(s: KoSentence, finalPunct: string | undefined): void {
  let last = -1;
  for (let i = s.n - 1; i >= 0; i--) if (s.isWord(i)) { last = i; break; }
  if (last < 0) return;
  // the sentence has no other FINAL predicate (a connective form before it is the cue, not a rival: 밥 먹고 자!)
  if (s.cands.some((cs, i) => i !== last && s.isWord(i) && isPredicate(cs[0]) && cs[0].morph.VerbForm !== 'Conn')) return;
  const t = s.top(last);
  if (!t || isPredicate(t)) return;
  // a noun with its particle is a nominal of the clause, never turned into the verb (audit YY1)
  if (particlesOf(t).length || (t.parts ?? []).some((x) => x.pos === 'ADP')) return;
  const pv = s.prev(last);
  const pTop = pv >= 0 ? s.top(pv) : undefined;
  // a modifier straight before it forbids the predicate: 우리 나라, 한국의 배, 온 배, 높은 산 (audit WW1)
  if (pTop && (isAdn(pTop) || lastParticle(pTop) === 'of' || pTop.pos === 'DET' || MODIFIER_WORDS.has(s.key(pv)))) return;
  const p = pTop ? lastParticle(pTop) ?? '' : '';
  const cue = pTop && ['object', 'to', 'at', 'by'].includes(p) ? `after ${s.surface(pv)}`
    : pTop && isAdverb(pTop) ? `after the adverb ${s.surface(pv)}`
    : pTop && isPredicate(pTop) && pTop.morph.VerbForm === 'Conn' ? `after the connective form ${s.surface(pv)}`
    : finalPunct && /[!！]/u.test(finalPunct) ? 'before "!"' : '';
  if (!cue) return;
  koPromote(s, last, (c) => isPredicate(c) && c.pos !== 'AUX' && c.morph.VerbForm === 'Fin', `${s.surface(last)} ends a sentence that has no other predicate (${cue}): it is the predicate.`, (c) => !isPredicate(c));
}

/** The sentence-final word before a question mark: a form that leaves the sentence type open becomes a question (`Mood=Int`). */
function ruleMood(s: KoSentence, finalPunct: string | undefined): void {
  if (!finalPunct || !/[?？]/u.test(finalPunct)) return; // a full stop does not decide: 앉으세요. is a request, 가요. a statement
  let last = -1;
  for (let i = s.n - 1; i >= 0; i--) if (s.isWord(i)) { last = i; break; }
  if (last < 0 || !s.mayMark(last)) return;
  for (const c of s.cands[last]) if (koMoodFromPunctuation(c, '?') && c === s.cands[last][0]) addContext(c, 'The sentence ends with a question mark: a question.');
}

function ruleNegation(s: KoSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const t = s.top(i);
    if (!t) continue;
    const nx = s.next(i);
    const nTop = nx >= 0 ? s.top(nx) : undefined;
    if (!s.mayMark(i) || (nx >= 0 && !s.mayMark(nx))) continue;
    if (t.pos === 'ADV' && (t.lemma === '안' || t.lemma === '못') && isPredicate(nTop)) {
      const kind = t.lemma === '안' ? 'short negation 안 + predicate' : 'short negation 못 + predicate (cannot)';
      t.notes = { ...t.notes, negation: `${kind}: negates ${s.surface(nx)}` };
      nTop!.notes = { ...nTop!.notes, negation: `negated by ${t.lemma} before it (${kind})` };
    }
    if (t.morph.VerbForm === 'Conn' && t.morph.Connective === 'neg' && nTop && isAuxReading(nTop)) {
      const a = bare(nTop);
      const kind = a === '않다' ? 'long negation -지 않다' : a === '못하다' ? 'long negation -지 못하다 (cannot)' : a === '말다' ? 'prohibition -지 말다 (do not …)' : '';
      if (!kind) continue;
      t.notes = { ...t.notes, negation: `negated by ${s.surface(nx)} after it (${kind})` };
      nTop.notes = { ...nTop.notes, negation: `${kind}: negates ${s.surface(i)}` };
    }
  }
}

// ───────────────────────────── the layer ─────────────────────────────

/** Sentence spans inside a token list: a run ends after a token holding . ! ? … 。 (and the closing marks after it). */
function sentenceRanges(tokens: RawToken[]): Array<{ start: number; end: number; final?: string }> {
  const out: Array<{ start: number; end: number; final?: string }> = [];
  let start = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.isWord || !/[.!?…。！？．]/u.test(t.surface) || /^[0-9]/u.test(t.surface)) continue;
    let end = i + 1;
    let final = t.surface;
    while (end < tokens.length && !tokens[end].isWord && !/^[0-9]/u.test(tokens[end].surface)) { final += tokens[end].surface; end++; }
    out.push({ start, end, final });
    start = end;
    i = end - 1;
  }
  if (start < tokens.length) out.push({ start, end: tokens.length });
  return out;
}

/** The readings of each token ordered and marked by its sentence (see the header). `base` is the token analysis, one list per token. */
export function koOrderSentences(tokens: RawToken[], base: Cand[][], frozen: ReadonlySet<number> = new Set()): Cand[][] {
  const out: Cand[][] = base.map((cs) => cs.map((c) => ({ ...c, morph: { ...c.morph }, ...(c.notes ? { notes: { ...c.notes } } : {}) })));
  for (const r of sentenceRanges(tokens)) {
    const local = new Set<number>();
    for (const f of frozen) if (f >= r.start && f < r.end) local.add(f - r.start);
    const s = new KoSentence(tokens.slice(r.start, r.end), out.slice(r.start, r.end), local);
    // a sentence of ONE word (a list item, a heading, a table cell) gives no context: the token order stands (batch 9). Only the question
    // mark still says what it says (먹어요? is a question).
    if (s.tokens.filter((t) => t.isWord).length <= 1) {
      ruleMood(s, r.final);
      for (let k = 0; k < s.n; k++) { koStrictlyFalling(s.cands[k]); out[r.start + k] = s.cands[k]; }
      continue;
    }
    ruleCopula(s);
    ruleComposedNumeral(s);
    ruleMonth(s);
    ruleCounters(s);
    ruleElapsed(s);
    ruleModifiedNumeral(s);
    ruleBareWords(s);
    ruleFused(s);
    ruleNe(s);
    ruleAuxiliaries(s);
    ruleObjectPredicate(s);
    ruleEvenIf(s);
    ruleSplitBeforePredicate(s);
    ruleAdnominalOrNoun(s);
    ruleNounBeforeNoun(s);
    ruleNominalPairs(s);
    ruleContractedCopula(s);
    ruleAfterAdnominal(s);
    ruleLookalikes(s);
    ruleDeulleo(s);
    closeKeptOpen(s);
    ruleHomonyms(s);
    ruleFinality(s);
    ruleDeterminers(s);
    ruleInterjections(s);
    ruleComplement(s);
    ruleNegation(s);
    ruleLastPredicate(s, r.final);
    ruleMood(s, r.final);
    for (let k = 0; k < s.n; k++) { koStrictlyFalling(s.cands[k]); out[r.start + k] = s.cands[k]; }
  }
  return out;
}

/** Two readings that are the same for a learner (lemma, class, features, parts): the first is kept (audit N15). */
export function koDedupe(cands: Cand[]): Cand[] {
  const seen = new Set<string>();
  const out: Cand[] = [];
  for (const c of cands) {
    const m = Object.keys(c.morph).sort().map((k) => `${k}=${c.morph[k]}`).join('|');
    const parts = (c.parts ?? []).map((p) => `${p.lemma ?? p.text}:${p.start}-${p.end}`).join(' ');
    const key = `${c.lemma ?? ''}|${c.pos ?? ''}|${String(c.notes?.koPos ?? '')}|${m}|${parts}|${c.unconfirmed ? 1 : 0}|${String(c.notes?.homonym ?? '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** The analyser: token analysis (korean/analyze.ts), then the sentence. */
export function koAnalyze(tokens: RawToken[]): AnalyzedToken[] {
  const token = koAnalyzeTokens(tokens);
  const base = token.map((a) => koDedupe(a.candidates));
  const ordered = koOrderSentences(tokens, base);
  return token.map((a, i) => ({ ...a, candidates: ordered[i] }));
}

/**
 * The adapter's `refine` (contract: core/adapters.ts): the same ordering after the importer put a dictionary's readings on some tokens.
 * The adapter's own tokens start again from their token analysis; other tokens' lists are taken as given and never touched beyond order.
 */
export function koRefine(tokens: RawToken[], analyzed: AnalyzedToken[], analyzers: ReadonlySet<string>, given?: ReadonlySet<number>): AnalyzedToken[] {
  const own = (i: number): boolean => analyzed[i].analyzer === KO_ANALYZER && analyzers.has(KO_ANALYZER) && !given?.has(i);
  const fresh = koAnalyzeTokens(tokens);
  const base = tokens.map((t, i) => (!t.isWord ? [] : own(i) ? koDedupe(fresh[i].candidates) : analyzed[i].candidates));
  const frozen = new Set(tokens.map((t, i) => (t.isWord && !own(i) ? i : -1)).filter((i) => i >= 0));
  const ordered = koOrderSentences(tokens, base, frozen);
  return tokens.map((t, i) => (!t.isWord || given?.has(i) || !analyzers.has(analyzed[i].analyzer) ? analyzed[i] : { ...analyzed[i], candidates: ordered[i] }));
}

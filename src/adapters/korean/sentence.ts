/**
 * The sentence layer of the Korean analyser (docs/korean/PLAN.md "Analysis", the last step): the readings of each word of ONE sentence,
 * ordered and marked by its neighbours. Token-local analysis is korean/analyze.ts (`koAnalyzeTokens`); this file only
 *   - MOVES a reading to the front, with the reason in `notes.context` (every change of order says why);
 *   - LOWERS the readings a sure rule sets aside (by 0.20, never below 0.30), so that the card no longer calls the word conflicted;
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
import { koBareLemma } from './index-store';
import { KO_ANALYZER } from './version';

type Cand = AnalysisCandidate;

// ───────────────────────────── confidence ─────────────────────────────

/** A reading moved up by a rule takes the token's best confidence, at most this (PLAN: 0.80–0.88 for several licensed readings). */
export const KO_CONTEXT_TOP = 0.88;
/** A reading a sure rule sets aside loses this much, never below the floor. */
const SET_ASIDE = 0.2;
const SET_ASIDE_FLOOR = 0.3;
const r2 = (x: number): number => Math.round(x * 100) / 100;

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
export function koPromote(s: KoSentence, i: number, want: (c: Cand) => boolean, reason: string, setAside?: (c: Cand, chosen: Cand) => boolean): boolean {
  const cs = s.cands[i];
  if (!cs?.length) return false;
  const k = cs.findIndex((c) => want(c) && !c.unconfirmed);
  if (k < 0) return false;
  const chosen = cs[k];
  const aside = setAside ?? ((c: Cand, ch: Cand) => c.lemma !== ch.lemma || c.pos !== ch.pos);
  const top = Math.max(...cs.map((c) => c.confidence));
  const others = cs.filter((_, j) => j !== k);
  // a list that is not the adapter's own is only reordered and lowered (refine's contract): the chosen reading keeps its number
  if (k > 0 && s.mayMark(i)) chosen.confidence = Math.max(chosen.confidence, Math.min(top, KO_CONTEXT_TOP));
  const lowered = others.filter((c) => aside(c, chosen));
  if (k === 0 && !lowered.length) return false;
  for (const c of lowered) {
    const v = r2(Math.max(SET_ASIDE_FLOOR, Math.min(c.confidence, chosen.confidence - SET_ASIDE)));
    if (v < c.confidence) c.confidence = v;
    addContext(c, `Set aside: ${reason}`);
  }
  // the chosen reading first, then the others in their own order: kept readings before the ones set aside
  const kept = others.filter((c) => !lowered.includes(c));
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
const SINO_COUNTERS = new Set(['년', '월', '일', '분', '초', '원', '층', '학년', '주일', '개월', '세']);
/** Numeral words that trigger the counter rule (the rare forms 서 석 너 넉 and the ambiguous 이 "this" are left out). */
const TRIGGER_NATIVE = new Set(['한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열', '스무', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔']);
const TRIGGER_SINO = new Set(['일', '삼', '사', '오', '육', '칠', '팔', '구', '십', '백', '천', '만']);

/** Words of quantity a counter follows besides a numeral (몇 개, 여러 명, 한두 번). */
const QUANTITY_WORDS = new Set(['몇', '여러', '수십', '수백', '수천', '서너', '두세', '한두', '두어', '대여섯', '예닐곱', '너덧', '댓']);

/**
 * 한 after an object (or an adverb) and before a word that can be a counter: 하다 + -(으)ㄴ "that did" (공부를 한 사람, 일을 한 시간이 길다) unless
 * the object has another verb to belong to: the counter written bare and an action verb later in the clause (운동장을 한 바퀴 돌았다, 책을 한
 * 권 샀다, 전화를 한 번 했다). A counter with a particle is the head of the clause (한 사람이, 한 시간이): 하다. Audit LL1.
 */
function hanIsDid(s: KoSentence, p: number, i: number): boolean {
  const pv = s.prev(p);
  const pt = pv >= 0 ? s.top(pv) : undefined;
  if (!pt || !(lastParticle(pt) === 'object' || isAdverb(pt))) return false;
  const ct = s.top(i);
  if (ct && particlesOf(ct).length) return true;
  for (let j = i + 1; j < s.n; j++) {
    if (s.isPunct(j)) break;
    const t = s.top(j);
    if (t?.pos === 'VERB' && t.morph.VerbForm !== 'Adn') return false;
  }
  return true;
}

function ruleCounters(s: KoSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const p = i - 1;
    // a counter with no number or word of quantity before it is not a counter: 이 개는 is "this dog", 그 명은 …
    const top0 = s.top(i);
    if (top0?.pos === 'CLF' && !(s.prev(i) === p && (s.isDigits(p) || QUANTITY_WORDS.has(s.key(p)) || (s.isWord(p) && s.cands[p].some((c) => c.pos === 'NUM') && (TRIGGER_NATIVE.has(s.key(p)) || TRIGGER_SINO.has(s.key(p)) || s.top(p)?.pos === 'NUM'))))) {
      const before = s.prev(i) === p && s.isWord(p) ? s.surface(p) : '';
      // the same cut as an ordinary noun first (개가: 개 "dog" + 가, not a rarer headword 개가), any other nominal only when there is none
      const sameCut = s.cands[i].find((c) => c.pos !== 'CLF' && isNominal(c) && !c.unconfirmed && bare(c) === bare(top0) && c.morph.Particle === top0.morph.Particle);
      koPromote(s, i, (c) => (sameCut ? c === sameCut : c.pos !== 'CLF' && isNominal(c)), `No number stands before ${s.surface(i)}${before ? ` (${before} is not one)` : ''}: it is not the counter here.`, (c) => c.pos === 'CLF');
    }
    if (p < 0 || s.prev(i) !== p) continue;
    const digits = s.isDigits(p);
    const pk = s.key(p);
    const numWord = s.isWord(p) && s.cands[p].some((c) => c.pos === 'NUM' && !c.unconfirmed && (c.parts?.length ?? 1) <= 1);
    if (!digits && !numWord) continue;
    const clf = s.cands[i].find((c) => c.pos === 'CLF' && !c.unconfirmed);
    if (!clf) continue;
    const counter = bare(clf);
    // a numeral WORD decides only where it is not also an everyday other word before this counter: 이 개 is "this dog" (Sino-Korean 이
    // does not count things), 너 is "you"; a Sino-Korean numeral counts only with a Sino-Korean counter (삼 년, 오 분)
    if (!digits && !(TRIGGER_NATIVE.has(pk) || (TRIGGER_SINO.has(pk) && SINO_COUNTERS.has(counter)))) continue;
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
    koPromote(s, i, (c) => c === clf, `After the number ${before}: ${counter} is a counter.${which}`, (c) => c.pos !== 'CLF');
    const first = s.cands[i][0];
    if (first === clf && which && s.mayMark(i)) first.notes = { ...first.notes, numeral: which.trim() };
    // the numeral word itself: its NUM reading (세 명 "three", not 세다; 한 개 "one", not 하다 + -ㄴ)
    if (numWord) {
      const k = s.key(p);
      const kind = KO_NATIVE_NUMERALS.has(k) ? 'native Korean numeral' : KO_SINO_NUMERALS.has(k) ? 'Sino-Korean numeral' : 'numeral';
      if (koPromote(s, p, (c) => c.pos === 'NUM' && (c.parts?.length ?? 1) <= 1, `Before the counter ${s.surface(i)}: ${before} is a number (${kind}).`, (c) => c.pos !== 'NUM') && s.mayMark(p)) {
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
      const counterNext = nx >= 0 && s.cands[nx]?.some((c) => c.pos === 'CLF' && !c.unconfirmed);
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
    koPromote(s, i, (c) => koPosOf(c).startsWith('VCN'), '아니다 is the negative copula "not to be" (부정 지정사).', (c, ch) => bare(c) === bare(ch) && koPosOf(c).startsWith('VA'));
  }
}

// ───────────────────────────── 3. auxiliaries after a connective form ─────────────────────────────

/** Which connective form licenses which auxiliary (보조 용언) straight after it. -아/어 + 가다 / 오다 is left out: 걸어 가다 is "walk there", not "keep on". */
const AUX_AFTER: ReadonlyArray<{ conn: (c: Cand) => boolean; form: string; aux: ReadonlySet<string> }> = [
  { conn: (c) => connective(c) === 'inf', form: '-아/어', aux: new Set(['보다', '주다', '드리다', '버리다', '놓다', '두다', '내다', '있다', '대다', '치우다', '보이다', '계시다']) },
  { conn: (c) => connective(c) === 'and' && c.notes?.ending === '-고', form: '-고', aux: new Set(['있다', '싶다', '계시다', '나다']) },
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
  { spelling: '저', pos: 'PRON', meaning: /\bI\b/u, says: 'I (polite)', cue: (s, i) => { const p = lastParticle(s.top(i)); return p && ['topic', 'also', 'object', 'of', 'only', 'subject'].includes(p) ? 'with a particle (저는, 저도, 저를)' : undefined; } },
  { spelling: '듣다', pos: 'VERB', meaning: /\bhear\b|\blisten\b/u, says: 'to hear, listen', cue: objectIs(['음악', '소리', '말', '이야기', '얘기', '노래', '강의', '수업', '뉴스', '라디오', '설명']) },
  { spelling: '들다', pos: 'VERB', meaning: /\bhold\b|\blift\b/u, says: 'to hold, lift', cue: objectIs(['가방', '손', '짐']) },
  { spelling: '들다', pos: 'VERB', meaning: /\benter\b/u, says: 'to enter (마음에 들다: to be to one’s liking)', cue: (s, i) => { const p = s.prev(i); const t = p >= 0 ? s.top(p) : undefined; return t && bare(t) === '마음' && lastParticle(t) === 'to' ? 'after 마음에 (마음에 들다)' : undefined; } },
];

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
    const nx = s.next(i);
    const t = nx >= 0 ? s.top(nx) : undefined;
    if (t && isNominal(t) && t.pos !== 'PRON' && t.pos !== 'NUM' && !t.morph.VerbType && !t.unconfirmed) {
      koPromote(s, i, (c) => c.pos === 'DET', `${s.key(i)} straight before the noun ${s.surface(nx)} is the determiner "${word}".`, (c) => c.pos !== 'DET');
    }
  }
}

/**
 * 네 "yes": alone, or first in its sentence before a comma or the end (네, 알겠습니다.), it is the interjection; 네 + a noun is "your"
 * (네 책). Audit S3.
 */
function ruleNe(s: KoSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.isWord(i) || s.key(i) !== '네') continue;
    const first = s.prev(i) < 0 && !s.tokens.slice(0, i).some((t) => t.isWord);
    if (first && s.next(i) < 0) koPromote(s, i, (c) => c.pos === 'INTJ', '네 standing alone at the head of the sentence is the answer "yes".', (c) => c.pos !== 'INTJ');
    else {
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
    if (!t || isPredicate(t) || !isNominal(t) || particlesOf(t).length) continue;
    // a numeral before a counter belongs to the object (책을 한 권, 운동장을 한 바퀴): it is not the verb
    if (t.pos === 'NUM' && s.next(i) >= 0 && s.cands[s.next(i)].some((c) => c.pos === 'CLF' && !c.unconfirmed)) continue;
    koPromote(s, i, (c) => isPredicate(c) && c.pos === 'VERB', `After the object ${s.surface(pv)}, ${s.surface(i)} is a verb: a noun takes no object.`, (c) => !isPredicate(c));
  }
}

/**
 * An adnominal form (-(으)ㄴ, -는, -(으)ㄹ, -던) is followed by a nominal: when the next word has a BOUND-noun reading of its spelling (자
 * "one who", 이 "person", 분, 것, 데, 바, 줄, 뿐 …: the lexicon's own bound nouns), that reading comes before a verb or another noun of the
 * same spelling (죄 지은 자를: the one who sinned, not 자르다). The entry is the one the lexicon marks bound, never a number.
 */
function ruleAfterAdnominal(s: KoSentence): void {
  for (let i = 1; i < s.n; i++) {
    if (!s.isWord(i)) continue;
    const pv = s.prev(i);
    if (pv < 0 || !isAdn(s.top(pv))) continue;
    const bound = s.cands[i].filter((c) => c.morph.NounType === 'Bound' && !c.unconfirmed && c.notes?.homonym !== 'undecided');
    if (!bound.length || new Set(bound.map((c) => c.lemma)).size > 1) continue;
    const b = bound[0];
    if (s.top(i) === b) continue;
    // 이 "person" is literary and 이 "tooth" ordinary: only after an action verb (믿는 이), never after a descriptive one (하얀 이 is teeth)
    if (bare(b) === '이' && s.top(pv)?.pos !== 'VERB') continue;
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
  { pick: '사다', among: ['살다'], says: 'to buy (살다 "to live" takes no object but 삶 / 인생)', cue: anyObject(['삶', '인생', '생활', '일생', '세월']) },
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
function ruleLastPredicate(s: KoSentence, finalPunct: string | undefined): void {
  let last = -1;
  for (let i = s.n - 1; i >= 0; i--) if (s.isWord(i)) { last = i; break; }
  if (last < 0) return;
  if (s.cands.some((cs, i) => i !== last && s.isWord(i) && isPredicate(cs[0]))) return;
  const t = s.top(last);
  if (!t || isPredicate(t)) return;
  const pv = s.prev(last);
  const pTop = pv >= 0 ? s.top(pv) : undefined;
  const cue = finalPunct && /[!！]/u.test(finalPunct) ? 'before "!"' : pTop && ['object', 'to', 'at'].includes(lastParticle(pTop) ?? '') ? `after ${s.surface(pv)}` : pTop && bareNominal(pTop) && pTop.pos !== 'NUM' ? `after ${s.surface(pv)}` : '';
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
    ruleCopula(s);
    ruleCounters(s);
    ruleBareWords(s);
    ruleNe(s);
    ruleAuxiliaries(s);
    ruleObjectPredicate(s);
    ruleAfterAdnominal(s);
    ruleLookalikes(s);
    ruleDeulleo(s);
    ruleHomonyms(s);
    ruleFinality(s);
    ruleDeterminers(s);
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

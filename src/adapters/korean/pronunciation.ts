/**
 * Korean standard pronunciation (표준 발음법) by rule, as a Hangul respelling.
 *
 * The respelling is worked on jamo, one boundary between two syllables at a time, left to right. At each boundary the order is:
 *   1. a vowel-initial syllable follows: liaison (the final moves; ㅎ is silent; of a compound final the second consonant
 *      moves), with palatalisation of ㄷ ㅌ before 이;
 *   2. a consonant-initial syllable follows: ㅎ aspiration in either order (and ㅎ in ㄶ ㅀ), then the compound final is cut to the
 *      consonant that is said, the final is neutralised to one of ㄱ ㄴ ㄷ ㄹ ㅁ ㅂ ㅇ, then nasal assimilation (with ㄹ → ㄴ after
 *      an obstruent), then ㄹ assimilation (ㄴ+ㄹ → ㄹㄹ, ㄹ+ㄴ → ㄹㄹ, ㄹ → ㄴ after ㅁ ㅇ), then tensification.
 *   At the end of a word only the cut and the neutralisation apply. A consonant before 의 is said 이.
 *
 * What the rules cannot give (Sino-Korean ㄹ tensification, ㄴ-insertion in compounds, a few stems) is the small table
 * `PRONUNCIATION_EXCEPTIONS`: only entries the standard itself names.
 *
 * Revised Romanization does not show tensification and writes ㅢ as ui whatever its sound, so the romanization path
 * (`koRomanizationRespelling`) runs the same rules with those two left out.
 */
import { COMPOUND_FINALS, FINALS, LEADS, NEUTRAL_FINAL, VOWELS, compose, decompose, isHangulSyllable, koKey, romanizeRespelling } from './hangul';
import type { PronunciationSupport } from '../../core';

/**
 * Compounds whose second part is a full morpheme beginning with a vowel (제15항, 제29항). Spelling alone cannot tell 겉옷 [거돋] from
 * 옷이 [오시]; the analyser passes `boundaries` and the rules then give these without a table. This table is the fallback for callers
 * that pass none, and is skipped when `boundaries` is given.
 */
const MORPHEME_EXCEPTIONS: Readonly<Record<string, string>> = {
  // 제29항: ㄴ added in compounds (and ㄹ where the base ends in ㄹ)
  솜이불: '솜니불', 홑이불: '혼니불', 막일: '망닐', 삯일: '상닐', 맨입: '맨닙', 꽃잎: '꼰닙', 내복약: '내봉냑', 한여름: '한녀름', 신여성: '신녀성',
  색연필: '생년필', 직행열차: '지캥녈차', 늑막염: '능망념', 콩엿: '콩녇', 담요: '담뇨', 눈요기: '눈뇨기', 영업용: '영엄뇽', 식용유: '시굥뉴',
  국민윤리: '궁민뉼리', 밤윷: '밤뉻',
  들일: '들릴', 솔잎: '솔립', 설익다: '설릭따', 물약: '물략', 불여우: '불려우', 서울역: '서울력', 물엿: '물렫', 휘발유: '휘발류',
  // 제15항: a final before a full morpheme that begins with ㅏ ㅓ ㅗ ㅜ ㅟ is neutralised, then carried over
  겉옷: '거돋', 헛웃음: '허두슴', 젖어미: '저더미', 값어치: '가버치',
};

/**
 * Words the rules cannot give. Every entry is one the 표준 발음법 itself names, under the article noted. Stem-type cases (밟- before a
 * consonant is said with ㅂ: 제10항 다만; 넓죽- and 넓둥글-; 맛없-/멋없- before ㅅ → ㄷ then carried: 제15항 붙임) are rules on the
 * STEM, applied to every form that begins with it (밟습니다 [밥씀니다], 맛없어요 [마덥써요]); 맛있-/멋있- give the accepted variant
 * [마싣따] by the ordinary rules ([마딛따] is the principle and also standard: give `boundaries` to get it).
 */
export const PRONUNCIATION_EXCEPTIONS: Readonly<Record<string, string>> = {
  // 제20항 다만: ㄴ + ㄹ said ㄴㄴ in these Sino-Korean words
  의견란: '의견난', 임진란: '임진난', 생산량: '생산냥', 결단력: '결딴녁', 공권력: '공꿘녁', 동원령: '동원녕', 상견례: '상견녜',
  횡단로: '횡단노', 이원론: '이원논', 입원료: '이붠뇨', 구근류: '구근뉴',
  // 제26항: tensification after ㄹ in these Sino-Korean words (the article's own list)
  갈등: '갈뜽', 발동: '발똥', 발전: '발쩐', 갈증: '갈쯩', 물질: '물찔', 말살: '말쌀', 불소: '불쏘', 일시: '일씨', 몰상식: '몰쌍식', 불세출: '불쎄출',
  ...MORPHEME_EXCEPTIONS,
};

/** The name of the romanisation scheme every `transliteration` here is in, for the card's label. */
export const KO_ROMANIZATION_SCHEME = 'Revised Romanization (2000)';

export interface PronounceOptions {
  /** The word that follows (a separate word): its first syllable decides the last final of this one. */
  nextWord?: string;
  /**
   * The word is a predicate stem + ending: the stem's last syllable is the FIRST syllable (true) or the one at this index (a number). ㄺ of the
   * stem before ㄱ is said ㄹ (읽고 [일꼬]) and its ㄴ ㅁ before ㄱ ㄷ ㅅ ㅈ tense (신고 [신꼬]); the endings' own ㄴ ㅁ do not (읽는다 [잉는다]).
   */
  verbStem?: boolean | number;
  /** Revised Romanization mode: no tensification, ㅢ kept, 져 쪄 쳐 kept. */
  romanization?: boolean;
  /**
   * Indexes (in the key's characters) of syllables whose final ㄹ is the prospective ending -(으)ㄹ: a following plain ㄱ ㄷ ㅂ ㅅ ㅈ is
   * tensed after it (갈게 [갈께]; 제27항). Spelling cannot say it (갈비 is not tensed), so the morphology package passes it. A closed list
   * of endings written at the END of a word (ㄹ게 ㄹ게요 ㄹ걸 ㄹ걸요 ㄹ수록 ㄹ지라도 ㄹ지언정 ㄹ진대) is applied when this option is ABSENT; a stem in ㄹ followed by the ending -게 (길게, 둥글게) looks the same, so the caller who knows it passes `tenseAfter: []` to switch the list off.
   */
  tenseAfter?: number[];
  /**
   * Indexes of syllables that START a new full morpheme (the second part of a compound, or what follows a prefix): 겉옷 [1], 꽃잎 [1].
   * Before a syllable that begins with ㅏ ㅓ ㅗ ㅜ ㅟ the final is neutralised and carried over (겉옷 [거돋], 헛웃음 [허두슴], 맛없다 [마덥따]);
   * before 이 ㅑ ㅕ ㅛ ㅠ ㄴ is added (솜이불 [솜니불], 색연필 [생년필], 서울역 [서울력]); 있 takes the carry, not the ㄴ (값있는 [가빈는]).
   * With this given the fallback table of compounds is not used. The analyser passes it; the code never guesses it.
   * ALL index options (`tenseAfter`, `boundaries`, a numeric `verbStem`) are indexes into the KEY (koKey(word)): one per Hangul syllable.
   */
  boundaries?: number[];
  /**
   * The word BEFORE this one is an adnominal in -(으)ㄹ (할, 갈, 먹을, 올): this word's first syllable, if it begins with ㄱ ㄷ ㅂ ㅅ ㅈ, is
   * tensed (제27항: 할 수 [할 쑤], 갈 데 [갈 떼], 먹을 것 [머글 껃], 올 사람 [올 싸람]). Not applied in romanization mode.
   */
  prevProspective?: boolean;
  /**
   * Revised Romanization only: the word is a nominal (noun, proper noun, pronoun, numeral). Default false = the GENERAL rule: a ㅎ merges
   * (좋고 joko, 놓다 nota, 잡혀 japyeo, 낳지 nachi, 않다 anta) and 닫히다 dachida, 굳히다 guchida, 붙이다 buchida, 같이 gachi. Only `nominal: true`
   * applies the 체언 exception of 제3장 제1항, which keeps the h after ㄱ ㄷ ㅂ (묵호 mukho, 집현전 jiphyeonjeon, 국화 gukhwa). The caller
   * passes it from the reading's part of speech; it is never inferred. A ㅎ final is always written aspirated.
   *
   * Checked against the examples printed in the 2000 rules (국어의 로마자 표기법): 좋고 joko, 놓다 nota, 잡혀 japyeo, 낳지 nachi, 묵호 Mukho,
   * 집현전 Jiphyeonjeon, 해돋이 haedoji, 같이 gachi, 굳히다 guchida, 신라 Silla, 종로 Jongno, 왕십리 Wangsimni, 백마 Baengma, 한국어 hangugeo,
   * 학교 hakgyo (tensification not shown), 압구정 Apgujeong, 낙동강 Nakdonggang. INFERRED by applying the same rules (not printed there): 닫히다
   * dachida, 붙이다 buchida, 않다 anta, 많다 manta, 국화 gukhwa, 입학 iphak (nominal). The scheme is "Revised Romanization (2000)".
   */
  nominal?: boolean;
  /** Phrase mode only: false leaves out the added ㄴ before 이 야 여 요 유. */
  insertN?: boolean;
}

const PROSPECTIVE_ENDINGS = ['게요', '걸요', '수록', '지라도', '지언정', '진대', '게', '걸'];
const IOTATED = new Set(['ㅣ', 'ㅑ', 'ㅕ', 'ㅛ', 'ㅠ']);
/** 제15항: the vowels after which a full morpheme's initial vowel takes the carried-over final. */
const CARRY = new Set(['ㅏ', 'ㅓ', 'ㅗ', 'ㅜ', 'ㅟ']);
/** The nouns after which a word ending in ㄹ is a prospective form (제27항): 할 것을, 갈 데가, 할 수는, 할 바를, 갈 적에, 할 줄. */
const DEPENDENT = /^(것|거|수|바|데|적|줄|걸)(은|는|이|가|을|를|도|만|의|에|으로|이다|이야|이었|입니다)?$/;

interface Syl { l: string; v: string; t: string; pros?: boolean; fixed?: boolean; stem?: boolean; bound?: boolean }
type Item = Syl | string;

const ASPIRATE: Readonly<Record<string, string>> = { ㄱ: 'ㅋ', ㄷ: 'ㅌ', ㅂ: 'ㅍ', ㅈ: 'ㅊ' };
const TENSE: Readonly<Record<string, string>> = { ㄱ: 'ㄲ', ㄷ: 'ㄸ', ㅂ: 'ㅃ', ㅅ: 'ㅆ', ㅈ: 'ㅉ' };
const COMPOUND_ASPIRATE: Readonly<Record<string, string>> = { ㄺ: 'ㅋ', ㄼ: 'ㅍ', ㄵ: 'ㅊ', ㄿ: 'ㅍ' };
const NASAL: Readonly<Record<string, string>> = { ㄱ: 'ㅇ', ㄷ: 'ㄴ', ㅂ: 'ㅁ' };
const L_IDX = new Map(LEADS.map((c, i) => [c, i]));
const V_IDX = new Map(VOWELS.map((c, i) => [c, i]));
const T_IDX = new Map(FINALS.map((c, i) => [c, i]));

function parse(key: string): Item[] {
  const out: Item[] = [];
  for (const ch of key) {
    const d = decompose(ch);
    out.push(d ? { l: LEADS[d.l], v: VOWELS[d.v], t: FINALS[d.t] } : ch);
  }
  return out;
}
const render = (items: readonly Item[]): string =>
  items.map((it) => (typeof it === 'string' ? it : compose(L_IDX.get(it.l) ?? 11, V_IDX.get(it.v) ?? 0, T_IDX.get(it.t) ?? 0))).join('');

/** What a final is said as at the end of a word (or before a consonant, absent any assimilation). */
const said = (t: string): string => NEUTRAL_FINAL[t] ?? t;

function boundary(a: Syl, b: Syl, ext: boolean, o: PronounceOptions, note: (s: string) => void, phrase = false): void {
  const t = a.t;
  if (!t) return;
  const tense = !o.romanization;
  const parts = COMPOUND_FINALS[t];

  // a full morpheme (compound part, word said together) that begins with a vowel (제15항, 제29항)
  const isIss = b.l === 'ㅇ' && b.v === 'ㅣ' && (b.t === 'ㅆ' || b.t === 'ㅅ'); // 있 / 잇 take the carry-over, not the ㄴ
  const joint = phrase || (!!b.bound && b.l === 'ㅇ' && (CARRY.has(b.v) || IOTATED.has(b.v)));
  // ㄴ is added before 이 야 여 요 유 (제29항: 솜이불 [솜니불]; 붙임 2: 한 일 [한닐], 할 일 [할릴])
  if (joint && o.insertN !== false && b.l === 'ㅇ' && IOTATED.has(b.v) && !isIss && t !== 'ㅎ') { b.l = 'ㄴ'; note('ㄴ is added before 이 야 여 요 유 of a full word or compound part: ㄴ-insertion'); }

  // ── a vowel follows ──
  if (b.l === 'ㅇ') {
    if (joint) {
      // 제15항: a separate word that begins with a vowel: the final is neutralised, then carried over (옷 안 [오단])
      if (t === 'ㅇ') return;
      if (t === 'ㅎ') { a.t = ''; note('ㅎ before a vowel is not said'); return; }
      const n = said(t);
      a.t = ''; b.l = n;
      note(`${t} before the vowel of the next word or compound part is said ${n} and carried over to it`);
      return;
    }
    if (ext) { a.t = said(t); if (a.t !== t) note(`${t} at the end of a word is said ${a.t}: final neutralisation`); return; }
    if (t === 'ㅇ') return;
    let moved: string;
    if (t === 'ㅎ') { a.t = ''; note('ㅎ before a vowel is not said'); return; }
    if (t === 'ㄶ' || t === 'ㅀ') { a.t = ''; moved = parts![0]; note(`ㅎ of ${t} is not said before a vowel; ${moved} moves to the next syllable: liaison`); }
    else if (parts) {
      a.t = parts[0];
      moved = parts[1] === 'ㅅ' && tense ? 'ㅆ' : parts[1];
      note(`${t} before a vowel: ${parts[0]} stays, ${moved} moves to the next syllable: liaison`);
    } else { a.t = ''; moved = t; note(`${t} before a vowel moves to the next syllable: liaison`); }
    if ((moved === 'ㄷ' || moved === 'ㅌ') && b.v === 'ㅣ') {
      const p = moved === 'ㄷ' ? 'ㅈ' : 'ㅊ';
      note(`${moved} before 이 is said ${p}: palatalisation`);
      moved = p;
    }
    b.l = moved;
    return;
  }

  // ── a consonant follows ──
  const hidden = t === 'ㅎ' || t === 'ㄶ' || t === 'ㅀ'; // a ㅎ that can aspirate the next consonant
  const rest = t === 'ㄶ' ? 'ㄴ' : t === 'ㅀ' ? 'ㄹ' : '';
  const lead = b.l;
  const setLead = (to: string) => { if (!ext) b.l = to; };
  if (lead === 'ㅎ') {
    if (parts && COMPOUND_ASPIRATE[t]) {
      const asp = COMPOUND_ASPIRATE[t];
      a.t = parts[0];
      setLead(asp);
      note(`${parts[1]} + ㅎ is said ${asp}: aspiration`);
      return;
    }
    if (!parts && t !== 'ㅎ' && !(o.romanization && o.nominal === true)) {
      const n = said(t);
      if (ASPIRATE[n]) {
        const palatal = b.v === 'ㅣ' && (t === 'ㄷ' || t === 'ㅌ');
        a.t = '';
        setLead(palatal ? 'ㅊ' : ASPIRATE[n]);
        note(palatal ? `${t} + 히 is said 치: palatalisation` : `${t} + ㅎ is said ${ASPIRATE[n]}: aspiration`);
        return;
      }
    }
  }
  if (hidden) {
    if (ASPIRATE[lead]) {
      a.t = rest;
      setLead(ASPIRATE[lead]);
      note(`ㅎ of ${t} + ${lead} is said ${ASPIRATE[lead]}: aspiration`);
      return;
    }
    if (lead === 'ㅅ' && tense) { a.t = rest; setLead('ㅆ'); note(`ㅎ of ${t} + ㅅ is said ㅆ`); return; }
    if (t === 'ㅎ') { a.t = 'ㄷ'; note('ㅎ at the end of a syllable is said ㄷ: final neutralisation'); }
    else { a.t = rest; note(`ㅎ of ${t} is not said before a consonant`); }
  }

  // a compound final is cut to the consonant that is said
  const t0 = a.t;
  if (COMPOUND_FINALS[t0]) {
    const cut = t0 === 'ㄺ' ? (a.stem && lead === 'ㄱ' ? 'ㄹ' : 'ㄱ') : said(t0);
    note(`${t0} before a consonant is said ${cut}: compound final`);
    a.t = cut;
  }
  const n = said(a.t);
  if (n !== a.t && !COMPOUND_FINALS[t0]) note(`${a.t} before a consonant is said ${n}: final neutralisation`);

  const obstruent = n === 'ㄱ' || n === 'ㄷ' || n === 'ㅂ';
  if (obstruent && (lead === 'ㄴ' || lead === 'ㅁ' || lead === 'ㄹ')) {
    const to = NASAL[n];
    if (lead === 'ㄹ') { setLead('ㄴ'); note(`ㄹ after ${n} is said ㄴ`); }
    note(`${n} before ${lead === 'ㅁ' ? 'ㅁ' : 'ㄴ'} is said ${to}: nasal assimilation`);
    a.t = to;
    return;
  }
  if ((n === 'ㅁ' || n === 'ㅇ') && lead === 'ㄹ') { setLead('ㄴ'); note(`ㄹ after ${n} is said ㄴ: liquid assimilation`); a.t = n; return; }
  if (n === 'ㄴ' && lead === 'ㄹ') { a.t = 'ㄹ'; note('ㄴ before ㄹ is said ㄹ: liquid assimilation'); return; }
  if (n === 'ㄹ' && lead === 'ㄴ') { setLead('ㄹ'); note('ㄴ after ㄹ is said ㄹ: liquid assimilation'); a.t = n; return; }
  a.t = n;
  if (!tense || !TENSE[lead]) return;
  const afterStem = (t0 === 'ㄵ' || t0 === 'ㄼ' || t0 === 'ㄾ' || t0 === 'ㄻ' || (!!a.stem && (t0 === 'ㄴ' || t0 === 'ㅁ' || (t0 === 'ㄺ' && lead === 'ㄱ')))) && lead !== 'ㅂ';
  const prospective = !!a.pros && n === 'ㄹ';
  if (prospective && !(obstruent || afterStem)) {
    setLead(TENSE[lead]);
    note(`${lead} after the prospective ending ㄹ is said ${TENSE[lead]}: tensification`);
    return;
  }
  if (phrase) return;
  if (obstruent || afterStem) {
    setLead(TENSE[lead]);
    note(`${lead} after ${t0} is said ${TENSE[lead]}: tensification`);
  }
}

/** The items of a key with the one-syllable rules applied (ㅢ, 져 쪄 쳐) and the prospective ㄹ marked. */
function prepare(key: string, o: PronounceOptions, note: (s: string) => void): Item[] {
  const ex = o.boundaries !== undefined && MORPHEME_EXCEPTIONS[key] !== undefined ? undefined : PRONUNCIATION_EXCEPTIONS[key];
  if (ex) {
    note(`${key} is said [${ex}]: listed in the standard`);
    const items = parse(o.romanization ? untenseLike(key, ex) : ex);
    for (const it of items) if (typeof it !== 'string') it.fixed = true;
    return items;
  }
  const items = parse(key);
  if (!o.romanization) {
    for (const it of items) {
      if (typeof it === 'string') continue;
      if (it.v === 'ㅢ' && it.l !== 'ㅇ') { it.v = 'ㅣ'; note('ㅢ after a consonant is said ㅣ'); }
      if (it.v === 'ㅕ' && (it.l === 'ㅈ' || it.l === 'ㅉ' || it.l === 'ㅊ')) { it.v = 'ㅓ'; note('져 쪄 쳐 are said 저 쩌 처: ㅕ after ㅈ ㅉ ㅊ is said ㅓ'); }
    }
  }
  if (o.verbStem !== undefined && o.verbStem !== false) {
    const st = items[o.verbStem === true ? 0 : o.verbStem];
    if (st !== undefined && typeof st !== 'string') st.stem = true;
  }
  // stem rules: 밟- and 넓죽- / 넓둥글- are said with ㅂ before a consonant (제10항 다만); 맛없- 멋없- begin a new morpheme at 없 (제15항 붙임)
  if (/^(밟|넓죽|넓둥글)/.test(key) && items[0] !== undefined && typeof items[0] !== 'string') {
    const nx = items[1];
    if (nx !== undefined && typeof nx !== 'string' && nx.l !== 'ㅇ' && nx.l !== 'ㅎ') { items[0].t = 'ㅂ'; note('ㅂ of 밟- / 넓죽- / 넓둥글- is said before a consonant: listed in the standard'); }
  }
  if (o.prevProspective && !o.romanization) {
    const f = items[0];
    if (f !== undefined && typeof f !== 'string' && !f.fixed && TENSE[f.l]) {
      note(`${f.l} after a word ending in the prospective -(으)ㄹ is said ${TENSE[f.l]}: tensification (제27항)`);
      f.l = TENSE[f.l];
    }
  }
  const bounds = new Set<number>(o.boundaries ?? []);
  if (/^(맛|멋)없/.test(key)) bounds.add(1);
  for (const i of bounds) { const it = items[i]; if (it && typeof it !== 'string') it.bound = true; }
  const pros = new Set<number>(o.tenseAfter ?? []);
  const chars = [...key];
  for (const e of o.tenseAfter === undefined ? PROSPECTIVE_ENDINGS : []) {
    const n = [...e].length;
    if (chars.length > n && chars.slice(-n).join('') === e) {
      const prev = items[chars.length - n - 1];
      if (prev !== undefined && typeof prev !== 'string' && prev.t === 'ㄹ') { pros.add(chars.length - n - 1); break; }
    }
  }
  for (const i of pros) { const it = items[i]; if (it && typeof it !== 'string') it.pros = true; }
  return items;
}

function run(items: Item[], o: PronounceOptions, note: (s: string) => void, next?: Syl): void {
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (typeof a === 'string') continue;
    const b = items[i + 1];
    if (typeof b !== 'string' && b !== undefined) {
      if (a.fixed && b.fixed) continue;
      boundary(a, b, false, o, note);
    } else if (b === undefined && next) boundary(a, { ...next }, true, o, note);
    else if (a.t) {
      const n = said(a.t);
      if (n !== a.t) note(`${a.t} at the end of a word is said ${n}: ${COMPOUND_FINALS[a.t] ? 'compound final' : 'final neutralisation'}`);
      a.t = n;
    }
  }
}

/**
 * The respelling and the plain-English notes of the sound changes that applied.
 *
 * `nextWord` is a separate word: its first syllable decides the last final of THIS word (a consonant: assimilation, aspiration;
 * a vowel: neutralisation only, no liaison). This word also changes the next one (after a prospective ㄹ its lead is tensed:
 * 할 수 [할 쑤]), but only this word's text is returned, so for this word nothing shows; `koPronouncePhrase` returns the neighbours' changes.
 */
export function koPronounce(word: string, o: PronounceOptions = {}): { text: string; notes: string[] } {
  const key = koKey(word);
  const notes = new Set<string>();
  const note = (s: string) => notes.add(s);
  const items = prepare(key, o, note);
  let next: Syl | undefined;
  if (o.nextWord) {
    const f = koKey(o.nextWord)[0];
    const d = f && isHangulSyllable(f) ? decompose(f) : undefined;
    if (d) next = { l: LEADS[d.l], v: VOWELS[d.v], t: FINALS[d.t] };
  }
  run(items, o, note, next);
  return { text: render(items), notes: [...notes] };
}

export interface PhraseOptions {
  /** One value for all words, or one per word: the word is a predicate. */
  verbStem?: boolean | number | (boolean | number | undefined)[];
  /** One value for all words, or one per word: the word is a noun (romanization only). */
  nominal?: boolean | boolean[];
  /** Per word: the word ends in the prospective -(으)ㄹ, so the next word's plain lead is tensed. Absent = a heuristic (see below). */
  prospective?: (boolean | undefined)[];
  /** Per word: syllable indexes after which a plain lead is tensed inside the word (as `tenseAfter`). */
  tenseAfter?: (number[] | undefined)[];
  /** Per word: key indexes where a new full morpheme starts (as `boundaries`). */
  boundaries?: (number[] | undefined)[];
  /** False to leave out the added ㄴ before 이 야 여 요 유 (default true). */
  insertN?: boolean;
  /** Revised Romanization respelling (no tensification). */
  romanization?: boolean;
}

/**
 * The pronunciation of several words said together, one respelling per word. Only the rules the standard says cross a space:
 * assimilation (제18항–제20항) and aspiration (제12항 붙임 2: 옷 한 벌 [오탄 벌]) before a consonant-initial word; neutralise-then-carry
 * before a vowel-initial word (제15항: 옷 안 → [오 단], the carried consonant is written at the start of the next word's respelling;
 * NOT the liaison of a suffix inside a word); added ㄴ before 이 야 여 요 유 (제29항 붙임 2: 할 일 [할 릴], 옷 입다 [온 닙따]); and
 * tensing after the prospective ㄹ (제27항: 할 수 [할 쑤]) when `prospective[i]` says so, or when the word ends in ㄹ and the next word
 * is 것 거 수 바 데 적 줄 걸 (with a particle). Tensing after an obstruent final is NOT applied across a space (학교 가다 stays 학교 가다).
 */
export function koPronouncePhrase(words: readonly string[], o: PhraseOptions = {}): string[] {
  const note = (_s: string) => undefined;
  const per = <T,>(v: T | T[] | undefined, i: number): T | undefined => (Array.isArray(v) ? v[i] : v);
  const keys = words.map((w) => koKey(w));
  const lists = keys.map((k, i) => prepare(k, { romanization: o.romanization, tenseAfter: o.tenseAfter?.[i], boundaries: o.boundaries?.[i], verbStem: per<boolean | number | undefined>(o.verbStem, i) }, note));
  const wordOf: number[] = [];
  const flat: Item[] = [];
  const breaks = new Set<number>();
  lists.forEach((items, wi) => {
    if (wi > 0 && flat.length) {
      const last = flat[flat.length - 1];
      const first = items[0];
      if (typeof last !== 'string' && typeof first !== 'string' && first) {
        breaks.add(flat.length - 1);
        if (last.t === 'ㄹ' && !o.romanization && (o.prospective?.[wi - 1] ?? DEPENDENT.test(keys[wi]))) last.pros = true;
      }
    }
    for (const it of items) { flat.push(it); wordOf.push(wi); }
  });
  for (let i = 0; i < flat.length; i++) {
    const a = flat[i];
    if (typeof a === 'string') continue;
    const b = flat[i + 1];
    const phrase = breaks.has(i);
    const wo: PronounceOptions = { romanization: o.romanization, verbStem: per<boolean | number | undefined>(o.verbStem, wordOf[i]), nominal: per(o.nominal, wordOf[i]), insertN: o.insertN };
    if (typeof b !== 'string' && b !== undefined) {
      if (a.fixed && b.fixed && !phrase) continue;
      boundary(a, b, false, wo, note, phrase);
    } else if (a.t) a.t = said(a.t);
  }
  return lists.map((items) => render(items));
}

/** The standard pronunciation of a word as a Hangul respelling (no brackets). */
export function koStandardPronunciation(word: string, opts?: { nextWord?: string; verbStem?: boolean | number; tenseAfter?: number[]; boundaries?: number[]; prevProspective?: boolean }): string {
  return koPronounce(word, opts).text;
}

/** The respelling Revised Romanization is read from: the same rules without tensification and without ㅢ → ㅣ. */
export function koRomanizationRespelling(word: string, opts?: { nextWord?: string; verbStem?: boolean | number; nominal?: boolean; boundaries?: number[]; prevProspective?: boolean }): string {
  return koPronounce(word, { ...opts, romanization: true }).text;
}

const PLAIN_OF_TENSE: Readonly<Record<string, string>> = { ㄲ: 'ㄱ', ㄸ: 'ㄷ', ㅃ: 'ㅂ', ㅆ: 'ㅅ', ㅉ: 'ㅈ' };

/**
 * A respelling with the tense leads that the spelling writes plain put back (학꾜 from 학교 → 학교), position by position, when
 * both have the same number of characters; otherwise the respelling unchanged. Used where a respelling comes from a table or a
 * dictionary rather than from the rules.
 */
export function untenseLike(spelling: string, respelling: string): string {
  const a = [...koKey(spelling)];
  const b = [...koKey(respelling)];
  if (a.length !== b.length) return respelling;
  return b.map((ch, i) => {
    const da = decompose(a[i]);
    const db = decompose(ch);
    if (!da || !db) return ch;
    const lb = LEADS[db.l];
    return PLAIN_OF_TENSE[lb] && PLAIN_OF_TENSE[lb] === LEADS[da.l] ? compose(da.l, db.v, db.t) : ch;
  }).join('');
}

/**
 * Pronunciation support for the word sheet: the respelling's notes and the Revised Romanization OF THE PRONUNCIATION. A dictionary's
 * own respelling (with or without brackets) wins over the rules; when it differs, the note says so.
 */
export function koPronunciation(surface: string, opts?: { dictionary?: string; nextWord?: string; verbStem?: boolean | number; tenseAfter?: number[]; nominal?: boolean; boundaries?: number[]; prevProspective?: boolean }): PronunciationSupport {
  const key = koKey(surface);
  if (![...key].some(isHangulSyllable)) return {};
  const rule = koPronounce(key, opts);
  const notes = [...rule.notes];
  const dict = opts?.dictionary ? koKey(opts.dictionary).replace(/[\[\]\s]/g, '') : '';
  let transliteration: string;
  if (dict && [...dict].some(isHangulSyllable)) {
    notes.length = 0;
    notes.push(`Pronunciation [${dict}] is the dictionary's.`);
    if (dict === rule.text) notes.push(...rule.notes);
    else notes.push(`Said differently from what the spelling rules give (dictionary): the rules alone give [${rule.text}].`);
    // a nominal keeps its h after ㄱ ㄷ ㅂ (국화 gukhwa): that needs the spelling, so it is romanised from the spelling-aware path
    transliteration = opts?.nominal === true ? romanizeRespelling(koRomanizationRespelling(key, opts)) : romanizeRespelling(untenseLike(key, dict));
  } else {
    transliteration = romanizeRespelling(koRomanizationRespelling(key, opts));
  }
  const out: PronunciationSupport = { transliteration };
  out.notes = [...notes.slice(0, 7), `Romanization: ${KO_ROMANIZATION_SCHEME}, of the pronunciation (tensification is not shown).`];
  return out;
}

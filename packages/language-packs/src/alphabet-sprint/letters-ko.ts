/**
 * Hangul for the Alphabet Sprint and the GoReview Alphabet deck: ONE source (the owner's brief XIX, seven stages, 2026-11-25).
 *
 * Nothing a program can derive is typed here. The jamo inventories, the Revised Romanization of each letter, the vowel letters' names (a
 * vowel's name is the vowel after a silent ㅇ), the block layout and every sound change come from the Korean adapter
 * (src/adapters/korean/hangul.ts, pronunciation.ts, translit.ts); what is written by hand is what no program knows: the consonants' names,
 * the English sound hints, the stage a unit belongs to, and the examples (each example's pronunciation is checked against the adapter by
 * test/language-packs/ko-alphabet.test.ts). The hints are approximations for an English speaker, not a description of Korean phonology.
 * MACHINE-DRAFTED: no Korean teacher or native speaker has checked any of it.
 *
 * The seven stages (brief XIX):
 *   1 essential consonants ㄱ ㄴ ㄷ ㄹ ㅁ ㅂ ㅅ ㅇ ㅈ ㅎ        2 essential vowels ㅏ ㅓ ㅗ ㅜ ㅡ ㅣ
 *   3 syllable composition 가 나 다 라 마 바 사 아 자 하        4 the other basic consonants ㅋ ㅌ ㅍ ㅊ and vowels ㅑ ㅕ ㅛ ㅠ
 *   5 final consonants (받침) 한 국 문 말 집 밥 책               6 double consonants and compound vowels
 *   7 real-word reading 사람 한국 학교 나라 친구 사랑 하나님, with the sound changes that real words show
 *
 * Where each sound change sits (the brief names no stage for them): neutralisation of the final and the simplified compound finals are
 * stage 5 (they come with the final consonants); linking, nasalisation, liquid assimilation, aspiration, tensing and palatalisation are
 * stage 7, because 한국어 [한구거] and 학교 [학꾜] are real words and nothing before real words needs them. None is required to start
 * reading a page.
 */
import {
  COMPOUND_FINALS, COMPOUND_VOWELS, DOUBLE_CONSONANTS, FINALS, LEADS, NEUTRAL_FINAL, RR_FINAL, RR_LEAD, RR_VOWEL, VOWELS, compose, decompose, finalOf,
} from '../../../../src/adapters/korean/hangul';
import { koStandardPronunciation } from '../../../../src/adapters/korean/pronunciation';
import { koRomanizeWord } from '../../../../src/adapters/korean/translit';

export type KoStage = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const KO_ROMANIZATION_LABEL = 'Revised Romanization';

// ───────────────────────────── the letters ─────────────────────────────

export interface KoLetter {
  glyph: string;
  kind: 'consonant' | 'vowel';
  group: 'basic' | 'double' | 'compound';
  stage: 1 | 2 | 4 | 6;
  /** The letter's name in Korean (a vowel's is the vowel after a silent ㅇ). */
  name: string;
  /** English sound hint: an approximation. */
  hint: string;
}

/** The names of the 14 basic consonants (a hand table; test/language-packs/ko-alphabet.test.ts checks each against the letter's own jamo). */
export const KO_CONSONANT_NAMES: Readonly<Record<string, string>> = {
  ㄱ: '기역', ㄴ: '니은', ㄷ: '디귿', ㄹ: '리을', ㅁ: '미음', ㅂ: '비읍', ㅅ: '시옷', ㅇ: '이응', ㅈ: '지읒', ㅊ: '치읓', ㅋ: '키읔', ㅌ: '티읕', ㅍ: '피읖', ㅎ: '히읗',
};

const HINT: Readonly<Record<string, string>> = {
  ㄱ: 'between g in “go” and k in “sky”',
  ㄴ: 'n as in “no”',
  ㄷ: 'between d in “do” and t in “sty”',
  ㄹ: 'a quick tap like tt in “butter”; l at the end',
  ㅁ: 'm as in “man”',
  ㅂ: 'between b in “be” and p in “spy”',
  ㅅ: 's as in “sun”; sh before ㅣ',
  ㅇ: 'silent at the start of a block; ng at the end',
  ㅈ: 'between j in “judge” and ch in “church”',
  ㅎ: 'h as in “hat”',
  ㅊ: 'ch as in “church”, with a puff of air',
  ㅋ: 'k as in “kick”, with a puff of air',
  ㅌ: 't as in “top”, with a puff of air',
  ㅍ: 'p as in “pot”, with a puff of air',
  ㄲ: 'tense k: tight throat, no puff of air',
  ㄸ: 'tense t: tight throat, no puff of air',
  ㅃ: 'tense p: tight throat, no puff of air',
  ㅆ: 'tense s: tighter and longer than ㅅ',
  ㅉ: 'tense j: tight throat, no puff of air',
  ㅏ: 'a as in “father”',
  ㅑ: 'ya as in “yacht”',
  ㅓ: 'like u in “cut”, mouth more open',
  ㅕ: 'like “yuh”: ㅓ after a y glide',
  ㅗ: 'o as in “go”, steady, no w glide',
  ㅛ: 'yo as in “yoke”',
  ㅜ: 'oo as in “moon”',
  ㅠ: 'yu as in “you”',
  ㅡ: 'no English match: “oo” with lips spread flat',
  ㅣ: 'ee as in “see”',
  ㅐ: 'like e in “bed”; today about as ㅔ',
  ㅒ: 'ye as in “yes”; rare, about as ㅖ',
  ㅔ: 'like e in “bed”; today about as ㅐ',
  ㅖ: 'ye as in “yes”',
  ㅘ: 'wa as in “want”: ㅗ then ㅏ',
  ㅙ: 'we as in “wet”',
  ㅚ: 'we as in “wet” in everyday speech',
  ㅝ: 'wo: “wuh”, ㅜ then ㅓ',
  ㅞ: 'we as in “wet”',
  ㅟ: 'wi: “wee”, ㅜ then ㅣ',
  ㅢ: 'ㅡ glided into ㅣ; said ㅣ after a consonant (희 is 히)',
};

/** A line only the Sprint's unit card carries (the deck's backs are short). */
export const KO_LETTER_NOTE: Readonly<Record<string, string>> = {
  ㅢ: 'the possessive particle 의 is usually said 에 in everyday speech',
  ㅚ: 'in careful or older speech it is a single vowel; most speakers today say it like ㅞ',
  ㅅ: 'before ㅣ and the y vowels it sounds like sh: 시 is “shi”',
};

/** Basic vowels are the ten whose shape is one stem and its short strokes; the eleven compound ones are written from more than one. */
const BASIC_VOWELS = [...'ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ'];

const vowelName = (v: string): string => compose(LEADS.indexOf('ㅇ'), VOWELS.indexOf(v));

/** The 40 letters in the standard alphabetical order of the Korean dictionary (consonants, then vowels), each with its stage. */
export const KO_LETTERS: readonly KoLetter[] = [
  ...LEADS.map((c): KoLetter => {
    const double = DOUBLE_CONSONANTS[c] !== undefined;
    return {
      glyph: c, kind: 'consonant', group: double ? 'double' : 'basic',
      stage: double ? 6 : ['ㅋ', 'ㅌ', 'ㅍ', 'ㅊ'].includes(c) ? 4 : 1,
      name: double ? `쌍${KO_CONSONANT_NAMES[DOUBLE_CONSONANTS[c]]}` : KO_CONSONANT_NAMES[c], hint: HINT[c],
    };
  }),
  ...VOWELS.map((v): KoLetter => {
    const basic = BASIC_VOWELS.includes(v);
    return { glyph: v, kind: 'vowel', group: basic ? 'basic' : 'compound', stage: basic ? (['ㅏ', 'ㅓ', 'ㅗ', 'ㅜ', 'ㅡ', 'ㅣ'].includes(v) ? 2 : 4) : 6, name: vowelName(v), hint: HINT[v] };
  }),
];

export const koLetter = (glyph: string): KoLetter | undefined => KO_LETTERS.find((l) => l.glyph === glyph);

/** Revised Romanization of a letter as an aid: the lead sound, and the sound as a final when it differs. ㅇ is silent as a lead. */
export function koLetterRomanization(l: KoLetter): string {
  if (l.kind === 'vowel') return RR_VOWEL[l.glyph];
  const lead = RR_LEAD[l.glyph];
  const fin = NEUTRAL_FINAL[l.glyph] !== undefined ? RR_FINAL[NEUTRAL_FINAL[l.glyph]] : undefined;
  if (!lead) return `silent as a lead; ${fin} as a final`;
  return fin && fin !== lead ? `${lead} (${fin} as a final)` : lead;
}

/** The back of a letter in the Alphabet deck (at most 140 characters, a deck rule): its name, its romanised name, the hint, and the Revised Romanization (RR) of the sound, labelled as an aid; the deck's notes spell RR out. */
export function koLetterBack(l: KoLetter): string {
  const named = `${l.name} (${koRomanizeWord(l.name)})`;
  return `${named}: ${l.hint}. RR, an aid: ${koLetterRomanization(l)}`;
}

/** The Alphabet deck's rows [glyph, back] (GoReview), in the order of the stages. */
export function koAlphabetRows(): ReadonlyArray<readonly [string, string]> {
  return KO_LETTERS.slice().sort((a, b) => a.stage - b.stage).map((l) => [l.glyph, koLetterBack(l)] as const);
}

// ───────────────────────────── the stages ─────────────────────────────

export interface KoStageSpec {
  stage: KoStage;
  id: string;
  title: string;
  /** The jamo the stage teaches, in the brief's order. */
  letters: readonly string[];
  /** Syllable blocks the stage teaches or reads (stage 3: composition; stage 5: with a final). */
  syllables: readonly string[];
  /** The real words of stage 7. */
  words: readonly string[];
  summary: string;
}

const S = (s: string): string[] => [...s.replace(/\s+/gu, '')];

/** The brief's stages, exactly as written there (test/language-packs/ko-alphabet.test.ts holds the brief's own lists and compares). */
export const KO_STAGES: readonly KoStageSpec[] = [
  { stage: 1, id: 'consonants', title: 'Essential consonants', letters: S('ㄱ ㄴ ㄷ ㄹ ㅁ ㅂ ㅅ ㅇ ㅈ ㅎ'), syllables: [], words: [], summary: 'Ten consonants carry most of the first words.' },
  { stage: 2, id: 'vowels', title: 'Essential vowels', letters: S('ㅏ ㅓ ㅗ ㅜ ㅡ ㅣ'), syllables: [], words: [], summary: 'Six vowels: a long stem with a short stroke, or a flat stem.' },
  { stage: 3, id: 'composition', title: 'Syllable composition', letters: [], syllables: S('가 나 다 라 마 바 사 아 자 하'), words: [], summary: 'Letters are stacked into square blocks, one block a syllable: the vowel goes to the right of the consonant (가) or below it (고).' },
  { stage: 4, id: 'more-basic', title: 'Remaining basic consonants and vowels', letters: S('ㅋ ㅌ ㅍ ㅊ ㅑ ㅕ ㅛ ㅠ'), syllables: [], words: [], summary: 'Four consonants said with a puff of air, and four vowels that add a y glide.' },
  { stage: 5, id: 'finals', title: 'Final consonants', letters: [], syllables: S('한 국 문 말 집 밥 책'), words: [], summary: 'A consonant under the vowel closes the syllable (받침); at the end of a syllable only seven sounds are said.' },
  { stage: 6, id: 'doubles-compounds', title: 'Double consonants and compound vowels', letters: S('ㄲ ㄸ ㅃ ㅆ ㅉ ㅐ ㅔ ㅘ ㅝ ㅚ ㅟ ㅢ ㅒ ㅖ ㅙ ㅞ'), syllables: [], words: [], summary: 'Five tense consonants and the eleven vowels written from more than one stroke group.' },
  { stage: 7, id: 'real-words', title: 'Real-word reading', letters: [], syllables: [], words: ['사람', '한국', '학교', '나라', '친구', '사랑', '하나님'], summary: 'Read whole words; the spelling stays the same while the sound sometimes changes between syllables.' },
];

export const KO_STAGE_OF_LETTER: Readonly<Record<string, KoStage>> = Object.fromEntries(KO_STAGES.flatMap((s) => s.letters.map((g) => [g, s.stage] as const)));

// ───────────────────────────── sound rules ─────────────────────────────

/** [spelling, pronunciation as the adapter gives it, gloss]: the pronunciation of each is checked against koStandardPronunciation by a test. */
export type KoExample = readonly [spelling: string, respelling: string, gloss: string];

export interface KoRuleSpec {
  key: string;
  stage: 3 | 5 | 7;
  display: string;
  name: string;
  sound: string;
  difficulty: 1 | 2 | 3;
  examples: readonly KoExample[];
}

export const KO_RULES: readonly KoRuleSpec[] = [
  { key: 'rule-block', stage: 3, display: '가 고', name: 'block layout', difficulty: 1,
    sound: 'the letters of one syllable are stacked in a square block: a vowel with a vertical stem (ㅏ ㅑ ㅓ ㅕ ㅣ ㅐ ㅔ ㅒ ㅖ) goes to the right of the consonant (ㄱ + ㅏ = 가), a flat vowel (ㅗ ㅛ ㅜ ㅠ ㅡ) goes below it (ㄱ + ㅗ = 고), and the compound vowels use both places (ㅇ + ㅘ = 와)',
    examples: [['가', '가', 'go (stem)'], ['고', '고', 'a syllable'], ['나', '나', 'I'], ['구', '구', 'nine']] },
  { key: 'rule-batchim', stage: 5, display: '한', name: 'final consonant (받침)', difficulty: 2,
    sound: 'a consonant written under the block closes the syllable: 한 is ㅎ + ㅏ + ㄴ, said han', examples: [['한', '한', 'one (before a noun)'], ['책', '책', 'book']] },
  { key: 'rule-batchim-neutral', stage: 5, display: '옷 → [옫]', name: 'every final is said as one of seven', difficulty: 2,
    sound: 'at the end of a syllable the many final letters are said as only seven sounds (ㄱ ㄴ ㄷ ㄹ ㅁ ㅂ ㅇ): ㅅ ㅈ ㅊ ㅌ ㅎ ㅆ are said ㄷ, ㅋ ㄲ ㄱ, ㅍ ㅂ',
    examples: [['옷', '옫', 'clothes'], ['꽃', '꼳', 'flower'], ['부엌', '부억', 'kitchen'], ['앞', '압', 'front']] },
  { key: 'rule-batchim-compound', stage: 5, display: '닭 → [닥]', name: 'two final letters: one is said', difficulty: 3,
    sound: 'two consonant letters can stand under one vowel; at the end of a word only one of them is said, and which one has to be learned with the word',
    examples: [['닭', '닥', 'chicken'], ['값', '갑', 'price'], ['삶', '삼', 'life'], ['여덟', '여덜', 'eight'], ['넓다', '널따', 'to be wide']] },
  { key: 'rule-linking', stage: 7, display: '한국어 → [한구거]', name: 'linking (연음)', difficulty: 2,
    sound: 'a final consonant followed by a syllable that begins with the silent ㅇ moves across and is said at the start of that syllable',
    examples: [['한국어', '한구거', 'the Korean language'], ['음악', '으막', 'music'], ['집이', '지비', 'the house (as a subject)']] },
  { key: 'rule-nasal', stage: 7, display: '국물 → [궁물]', name: 'nasalisation (비음화)', difficulty: 2,
    sound: 'a final ㄱ ㄷ ㅂ sound before ㄴ or ㅁ turns into its nasal partner (ㄱ → ㅇ, ㄷ → ㄴ, ㅂ → ㅁ); a ㄹ after ㅁ ㅇ ㄱ ㅂ is said ㄴ',
    examples: [['국물', '궁물', 'broth'], ['먹는', '멍는', 'eating (before a noun)'], ['독립', '동닙', 'independence']] },
  { key: 'rule-liquid', stage: 7, display: '신라 → [실라]', name: 'liquid assimilation (유음화)', difficulty: 2,
    sound: 'ㄴ next to ㄹ is said ㄹ, so ㄴ + ㄹ and ㄹ + ㄴ are both said ㄹㄹ (a few words keep ㄴ: 생산량 is said 생산냥)',
    examples: [['신라', '실라', 'Silla'], ['설날', '설랄', 'New Year’s Day']] },
  { key: 'rule-aspirate', stage: 7, display: '좋다 → [조타]', name: 'aspiration (격음화)', difficulty: 2,
    sound: 'ㅎ meeting ㄱ ㄷ ㅂ ㅈ, in either order, makes the puffed sound ㅋ ㅌ ㅍ ㅊ', examples: [['좋다', '조타', 'to be good'], ['입학', '이팍', 'entering a school'], ['놓고', '노코', 'putting, and …']] },
  { key: 'rule-tense', stage: 7, display: '학교 → [학꾜]', name: 'tensing (경음화)', difficulty: 2,
    sound: 'after a final ㄱ ㄷ ㅂ sound, a plain ㄱ ㄷ ㅂ ㅅ ㅈ at the start of the next syllable is said tense (ㄲ ㄸ ㅃ ㅆ ㅉ); the spelling does not change',
    examples: [['학교', '학꾜', 'school'], ['밥도', '밥또', 'rice too'], ['학생', '학쌩', 'student']] },
  { key: 'rule-palatal', stage: 7, display: '같이 → [가치]', name: 'palatalisation (구개음화)', difficulty: 2,
    sound: 'a final ㄷ or ㅌ before 이 is said ㅈ or ㅊ and carried over: ㄷ + 이 = 지, ㅌ + 이 = 치', examples: [['같이', '가치', 'together'], ['굳이', '구지', 'insistently'], ['해돋이', '해도지', 'sunrise']] },
];

/** The unit key of the final-consonant card of each of the seven final sounds: ㄱ받침 … */
export const KO_FINAL_SOUNDS: readonly string[] = [...new Set(Object.values(NEUTRAL_FINAL))];
export const koFinalKey = (jamo: string): string => `${jamo}받침`;

/** Examples of the seven final sounds (the pronunciation of each is the word's own and is checked). */
export const KO_FINAL_EXAMPLES: Readonly<Record<string, KoExample>> = {
  ㄱ: ['국', '국', 'soup'], ㄴ: ['문', '문', 'door'], ㄷ: ['곧', '곧', 'soon'], ㄹ: ['말', '말', 'horse; speech'], ㅁ: ['몸', '몸', 'body'], ㅂ: ['집', '집', 'house'], ㅇ: ['방', '방', 'room'],
};

// ───────────────────────────── reading a written form ─────────────────────────────

/** The ten syllable blocks of stage 3: each is a card of its own, a worked example of composition (no word needs one to be read: the course requires them before stage 4 — see profiles/ko.ts). */
export const KO_STAGE3_SYLLABLES: ReadonlySet<string> = new Set(KO_STAGES[2].syllables);

const VERTICAL = new Set([...'ㅏㅐㅑㅒㅓㅔㅕㅖㅣ']);
const HORIZONTAL = new Set([...'ㅗㅛㅜㅠㅡ']);

/** Where a vowel letter sits in the block: right of the consonant, below it, or both (the compound vowels written from a flat and a vertical part). */
export function koVowelPlace(v: string): { right: boolean; below: boolean } {
  const parts = COMPOUND_VOWELS[v];
  if (parts) return { right: true, below: true };
  return { right: VERTICAL.has(v), below: HORIZONTAL.has(v) };
}

const RULE_STAGE: Readonly<Record<string, number>> = Object.fromEntries(KO_RULES.map((r) => [r.key, r.stage]));

/** The stage a unit key belongs to (letters, syllable cards, final-sound cards, rules). */
export function koUnitStage(key: string): KoStage | undefined {
  if (KO_STAGE_OF_LETTER[key]) return KO_STAGE_OF_LETTER[key];
  if (KO_STAGE3_SYLLABLES.has(key)) return 3;
  if (key.endsWith('받침')) return 5;
  return RULE_STAGE[key] as KoStage | undefined;
}

const OBSTRUENT_FINAL = new Set(['ㄱ', 'ㄷ', 'ㅂ']);

/**
 * The unit keys a written form needs; undefined when the form is outside what the profile models (anything that is not a Hangul
 * syllable, or a sound change the adapter's pronunciation shows that no rule of the profile explains). A space or punctuation is skipped.
 */
export function koDependencies(form: string): readonly string[] | undefined {
  const text = form.normalize('NFC');
  const keys: string[] = [];
  const add = (k: string): void => { if (!keys.includes(k)) keys.push(k); };
  const words = text.split(/[\s.,!?…·]+/u).filter(Boolean);
  if (!words.length) return undefined;
  for (const word of words) {
    const sylls = [...word].map((ch) => ({ ch, d: decompose(ch) }));
    if (sylls.some((s) => !s.d)) return undefined;
    const spoken = [...koStandardPronunciation(word)];
    if (spoken.length !== sylls.length) return undefined;
    sylls.forEach(({ d }, i) => {
      const lead = LEADS[d!.l], vowel = VOWELS[d!.v], fin = FINALS[d!.t];
      add(lead); add(vowel);
      add('rule-block');
      if (fin) {
        add('rule-batchim');
        for (const part of COMPOUND_FINALS[fin] ?? [fin]) add(part);
        // the sound this final has at the end of a syllable: its own neutral sound, or (compound finals) the one the adapter says
        const said = COMPOUND_FINALS[fin] ? finalOf(spoken[i]) : NEUTRAL_FINAL[fin];
        if (said && KO_FINAL_SOUNDS.includes(said)) add(koFinalKey(said));
        if (COMPOUND_FINALS[fin]) add('rule-batchim-compound');
        else if (NEUTRAL_FINAL[fin] !== fin) add('rule-batchim-neutral');
      }
    });
    // sound changes between neighbouring syllables, by the conditions of each rule
    const touched = new Array<boolean>(sylls.length).fill(false);
    for (let i = 0; i + 1 < sylls.length; i++) {
      const a = sylls[i].d!, b = sylls[i + 1].d!;
      const fa = FINALS[a.t];
      if (!fa) continue;
      const lb = LEADS[b.l], vb = VOWELS[b.v];
      const na = NEUTRAL_FINAL[fa] ?? (COMPOUND_FINALS[fa] ? NEUTRAL_FINAL[COMPOUND_FINALS[fa][0]] : fa);
      const hit = (k: string): void => { add(k); touched[i] = touched[i + 1] = true; };
      if (lb === 'ㅇ') {
        if (fa === 'ㅇ') continue;
        if (fa === 'ㅎ' || fa === 'ㄶ' || fa === 'ㅀ') return undefined; // ㅎ is silent here: not modelled
        hit('rule-linking');
        if (vb === 'ㅣ' && (fa === 'ㄷ' || fa === 'ㅌ')) hit('rule-palatal');
        continue;
      }
      if (fa === 'ㅎ' || fa === 'ㄶ' || fa === 'ㅀ') {
        if (['ㄱ', 'ㄷ', 'ㅈ'].includes(lb)) { hit('rule-aspirate'); continue; }
        return undefined; // ㅎ before another consonant (놓는 [논는]): not modelled
      }
      if (lb === 'ㅎ' && ['ㄱ', 'ㄷ', 'ㅂ', 'ㅈ'].includes(fa)) {
        if (fa === 'ㄷ' && vb === 'ㅣ') return undefined; // 닫히다: aspiration and palatalisation together, not modelled
        hit('rule-aspirate'); continue;
      }
      if (OBSTRUENT_FINAL.has(na) && ['ㄴ', 'ㅁ'].includes(lb)) { hit('rule-nasal'); continue; }
      if (['ㄱ', 'ㅂ', 'ㅁ', 'ㅇ'].includes(na) && lb === 'ㄹ') { hit('rule-nasal'); continue; }
      if ((na === 'ㄴ' && lb === 'ㄹ') || (na === 'ㄹ' && lb === 'ㄴ')) { hit('rule-liquid'); continue; }
      // after a final obstruent; and after the compound finals of verb stems that end in a sonorant when said (앉다 [안따], 젊다 [점따], 짧다 [짤따], 핥다 [할따])
      if ((OBSTRUENT_FINAL.has(na) || ['ㄵ', 'ㄻ', 'ㄼ', 'ㄾ'].includes(fa)) && ['ㄱ', 'ㄷ', 'ㅂ', 'ㅅ', 'ㅈ'].includes(lb)) { hit('rule-tense'); continue; }
    }
    // a syllable whose lead or vowel is said differently from its spelling must be explained by a rule above
    for (let i = 0; i < sylls.length; i++) {
      const sp = decompose(spoken[i]);
      if (!sp) return undefined;
      const same = sp.l === sylls[i].d!.l && sp.v === sylls[i].d!.v;
      if (!same && !touched[i]) return undefined;
    }
  }
  return keys.length ? keys : undefined;
}

/** The highest stage of the units a form needs (0 when it cannot be modelled). */
export function koFormStage(form: string): number {
  const deps = koDependencies(form);
  return deps ? Math.max(1, ...deps.map((k) => koUnitStage(k) ?? 1)) : 0;
}

/**
 * What a word's back shows for its sound, which fades as the stages go on (brief XIX: gradually remove pronunciation and romanisation help):
 * stages 1–5 show the Revised Romanization of the standard pronunciation, labelled by the deck as an aid; from stage 6 on there is no
 * romanisation, and a Hangul respelling in brackets appears only where the spoken form differs from the spelling.
 */
export function koWordPronunciation(form: string, stage: number, nominal = true): string | undefined {
  const spoken = koStandardPronunciation(form);
  if (stage <= 5) return koRomanizeWord(form, { nominal });
  return spoken !== form.normalize('NFC') ? `[${spoken}]` : undefined;
}

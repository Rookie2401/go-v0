// @vitest-environment node
/**
 * The Korean Alphabet Sprint (brief XIX) and the Hangul rows of GoReview's Alphabet deck: every fact about Hangul is checked against the
 * Korean adapter (hangul.ts, pronunciation.ts, translit.ts), never against a second hand-typed table, and every practice word against the
 * pack's compiled lexicon. The engine checks every profile must pass are in test/alphabet/sprint-kit.ts and run here too.
 */
import { describe, expect, it } from 'vitest';
import {
  COMPOUND_VOWELS, DOUBLE_CONSONANTS, FINALS, LEADS, NEUTRAL_FINAL, RR_FINAL, RR_LEAD, RR_VOWEL, VOWELS, compose, decompose, finalOf, leadOf, vowelOf,
} from '../../src/adapters/korean/hangul';
import { koStandardPronunciation } from '../../src/adapters/korean/pronunciation';
import { koRomanizeWord } from '../../src/adapters/korean/translit';
import { installKoreanLexicon, lookupKoreanStem } from '../../src/adapters/korean/index-store';
import { KO_CORE } from '../../src/adapters/korean/generated/core';
import {
  KO_CONSONANT_NAMES, KO_FINAL_EXAMPLES, KO_FINAL_SOUNDS, KO_LETTERS, KO_RULES, KO_STAGES, KO_STAGE_OF_LETTER, koAlphabetRows, koDependencies, koFormStage, koLetterBack,
  koUnitStage, koVowelPlace, koWordPronunciation,
} from '../../packages/language-packs/src/alphabet-sprint/letters-ko';
import { KO_PROFILE, koCourseDependencies } from '../../packages/language-packs/src/alphabet-sprint/profiles/ko';
import { KO_WORD_ROWS, PHRASES, WORDS } from '../../packages/language-packs/src/alphabet-sprint/words/ko';
import { planSprint } from '../../packages/language-packs/src/alphabet-sprint/plan';
import { scriptKnowledge } from '../../packages/language-packs/src/alphabet-sprint/knowledge';
import { sprintOrder } from '../../packages/language-packs/src/alphabet-sprint/select';
import { ALPHABET_LANGUAGES, alphabetCards, alphabetDeckFor, alphabetLanguageOf } from '../../packages/goreview/app/alphabetDeck';
import { HAND_LETTERS } from '../../packages/goreview/app/alphabetLetters';
import { profileChecks } from '../alphabet/sprint-kit';

installKoreanLexicon(KO_CORE);

/** The owner's seven stages, copied from the brief (BRIEF.md XIX, 2026-11-25), one string a list. Stage 4 and stage 6 are given in full there; stage 6 adds "the remaining compound vowels". */
const BRIEF = {
  1: 'ㄱ ㄴ ㄷ ㄹ ㅁ ㅂ ㅅ ㅇ ㅈ ㅎ',
  2: 'ㅏ ㅓ ㅗ ㅜ ㅡ ㅣ',
  3: '가 나 다 라 마 바 사 아 자 하',
  4: 'ㅋ ㅌ ㅍ ㅊ ㅑ ㅕ ㅛ ㅠ',
  5: '한 국 문 말 집 밥 책',
  6: 'ㄲ ㄸ ㅃ ㅆ ㅉ ㅐ ㅔ ㅘ ㅝ ㅚ ㅟ ㅢ',
  7: '사람 한국 학교 나라 친구 사랑 하나님',
} as const;
const list = (s: string): string[] => s.split(' ');
/** The names the owner gave (task, R2): the fourteen basic consonants. */
const NAMES = '기역 니은 디귿 리을 미음 비읍 시옷 이응 지읒 치읓 키읔 티읕 피읖 히읗';

describe('Hangul as the adapter has it', () => {
  it('has 19 leads (14 basic + 5 double), 21 vowels (10 basic + 11 compound), 27 finals made of 7 final sounds, and 11,172 blocks', () => {
    expect(LEADS).toHaveLength(19);
    expect(Object.keys(DOUBLE_CONSONANTS)).toHaveLength(5);
    expect(VOWELS).toHaveLength(21);
    expect(FINALS.filter(Boolean)).toHaveLength(27);
    expect(new Set(Object.values(NEUTRAL_FINAL)).size).toBe(7);
    expect(Object.keys(RR_FINAL).sort()).toEqual([...KO_FINAL_SOUNDS].sort());
    expect(LEADS.length * VOWELS.length * FINALS.length).toBe(11172);
    expect(KO_LETTERS).toHaveLength(40);
    expect(new Set(KO_LETTERS.map((l) => l.glyph))).toEqual(new Set([...LEADS, ...VOWELS]));
    const by = (k: string, g: string): number => KO_LETTERS.filter((l) => l.kind === k && l.group === g).length;
    expect([by('consonant', 'basic'), by('consonant', 'double'), by('vowel', 'basic'), by('vowel', 'compound')]).toEqual([14, 5, 10, 11]);
  });

  it('names the fourteen basic consonants and builds every other name from the letters', () => {
    const basic = LEADS.filter((c) => !DOUBLE_CONSONANTS[c]);
    expect(basic.map((c) => KO_CONSONANT_NAMES[c]).join(' ')).toBe(NAMES);
    for (const c of basic) {
      const n = KO_CONSONANT_NAMES[c];
      expect(n, c).toHaveLength(2);
      expect(leadOf(n[0]), `${c} ${n}`).toBe(c);        // 기 begins with ㄱ, 니 with ㄴ …
      expect(finalOf(n[1]), `${c} ${n}`).toBe(c);       // 역 ends in ㄱ, 은 in ㄴ … (ㅇ: 이응)
    }
    for (const l of KO_LETTERS.filter((x) => x.group === 'double')) expect(l.name).toBe(`쌍${KO_CONSONANT_NAMES[DOUBLE_CONSONANTS[l.glyph]]}`);
    for (const l of KO_LETTERS.filter((x) => x.kind === 'vowel')) expect(l.name, l.glyph).toBe(compose(LEADS.indexOf('ㅇ'), VOWELS.indexOf(l.glyph)));
    expect(KO_LETTERS.filter((l) => l.kind === 'consonant' && l.group === 'basic').map((l) => l.name).join(' ')).toBe(NAMES);
  });

  it('places every vowel in the block: the five flat vowels below, the nine standing ones to the right, the seven compound ones in both places', () => {
    const flat = VOWELS.filter((v) => { const p = koVowelPlace(v); return p.below && !p.right; });
    const upright = VOWELS.filter((v) => { const p = koVowelPlace(v); return p.right && !p.below; });
    const both = VOWELS.filter((v) => { const p = koVowelPlace(v); return p.right && p.below; });
    expect(flat.join('')).toBe('ㅗㅛㅜㅠㅡ');
    expect(upright.join('')).toBe('ㅏㅐㅑㅒㅓㅔㅕㅖㅣ');
    expect(both.sort().join('')).toBe(Object.keys(COMPOUND_VOWELS).sort().join(''));
    expect(flat.length + upright.length + both.length).toBe(21);
  });
});

describe('the seven stages are the brief\'s, as written', () => {
  it('stages 1, 2 and 4 teach exactly the brief\'s letters; stage 6 the brief\'s and the remaining compound vowels', () => {
    expect(KO_STAGES).toHaveLength(7);
    expect(KO_STAGES.map((s) => s.stage)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const n of [1, 2, 4] as const) expect(KO_STAGES[n - 1].letters, `stage ${n}`).toEqual(list(BRIEF[n]));
    expect(KO_STAGES[5].letters.slice(0, 12)).toEqual(list(BRIEF[6]).filter((c) => !'ㅐㅔㅘㅝㅚㅟㅢ'.includes(c)).concat(list('ㅐ ㅔ ㅘ ㅝ ㅚ ㅟ ㅢ')));
    const compound = VOWELS.filter((v) => !'ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ'.includes(v));
    expect([...KO_STAGES[5].letters.filter((c) => VOWELS.includes(c))].sort()).toEqual([...compound].sort());
    expect(KO_STAGES[5].letters.filter((c) => DOUBLE_CONSONANTS[c])).toEqual(list('ㄲ ㄸ ㅃ ㅆ ㅉ'));
    expect(KO_STAGES[2].syllables).toEqual(list(BRIEF[3]));
    expect(KO_STAGES[4].syllables).toEqual(list(BRIEF[5]));
    expect(KO_STAGES[6].words).toEqual(list(BRIEF[7]));
    // every letter of the alphabet is taught in exactly one stage, and its own stage field says which
    const taught = KO_STAGES.flatMap((s) => s.letters);
    expect(new Set(taught).size).toBe(taught.length);
    expect(new Set(taught)).toEqual(new Set([...LEADS, ...VOWELS]));
    for (const l of KO_LETTERS) expect(KO_STAGE_OF_LETTER[l.glyph], l.glyph).toBe(l.stage);
  });

  it('builds stage 3 from stages 1 and 2: ten blocks, one for each stage-1 consonant, with a stage-2 vowel and no final', () => {
    const s1 = new Set(KO_STAGES[0].letters), s2 = new Set(KO_STAGES[1].letters);
    const leads = KO_STAGES[2].syllables.map((b) => leadOf(b));
    expect([...leads].sort()).toEqual([...s1].sort());
    for (const b of KO_STAGES[2].syllables) { expect(s2.has(vowelOf(b)), b).toBe(true); expect(finalOf(b), b).toBe(''); expect(compose(decompose(b)!.l, decompose(b)!.v)).toBe(b); }
  });

  it('builds stage 5 from blocks with a final consonant, and the stage-7 words are real Hangul words of the brief', () => {
    for (const b of KO_STAGES[4].syllables) expect(finalOf(b), b).not.toBe('');
    expect(KO_STAGES[4].syllables.map((b) => finalOf(b)).join('')).toBe('ㄴㄱㄴㄹㅂㅂㄱ');
    for (const w of KO_STAGES[6].words) expect(WORDS.some((x) => x.form === w), w).toBe(true);
    for (const b of KO_STAGES[4].syllables) expect(WORDS.some((x) => x.form === b), b).toBe(true);
  });
});

describe('sound: every example is checked against the adapter, and the aid is Revised Romanization', () => {
  it('says each rule example as koStandardPronunciation does', () => {
    for (const r of KO_RULES) for (const [spelling, respelling] of r.examples) expect(koStandardPronunciation(spelling), `${r.key} ${spelling}`).toBe(respelling);
    for (const [j, [spelling, respelling]] of Object.entries(KO_FINAL_EXAMPLES)) {
      expect(koStandardPronunciation(spelling), spelling).toBe(respelling);
      expect(finalOf(spelling.at(-1)!), spelling).toBe(j);   // the example really ends in that final
    }
    expect(Object.keys(KO_FINAL_EXAMPLES).sort()).toEqual([...KO_FINAL_SOUNDS].sort());
  });

  it('puts the sound changes where the brief\'s stages need them: finals at stage 5, the changes between syllables at stage 7', () => {
    const stage = (k: string): number => KO_RULES.find((r) => r.key === k)!.stage;
    expect(['rule-batchim', 'rule-batchim-neutral', 'rule-batchim-compound'].map(stage)).toEqual([5, 5, 5]);
    expect(['rule-linking', 'rule-nasal', 'rule-liquid', 'rule-aspirate', 'rule-tense', 'rule-palatal'].map(stage)).toEqual([7, 7, 7, 7, 7, 7]);
    // the neutralisation examples fold onto one of the seven finals, as NEUTRAL_FINAL says
    for (const [s, r] of KO_RULES.find((x) => x.key === 'rule-batchim-neutral')!.examples) expect(finalOf(r.at(-1)!), s).toBe(NEUTRAL_FINAL[finalOf(s.at(-1)!)]);
  });

  it('writes Revised Romanization of the letters from the adapter\'s own tables, labelled as an aid', () => {
    const g = KO_LETTERS.find((l) => l.glyph === 'ㄱ')!;
    expect(koLetterBack(g)).toContain('기역 (giyeok)');
    expect(koLetterBack(g)).toContain(`RR, an aid: ${RR_LEAD['ㄱ']} (${RR_FINAL['ㄱ']} as a final)`);
    expect(koLetterBack(KO_LETTERS.find((l) => l.glyph === 'ㅇ')!)).toContain('silent as a lead; ng as a final');
    expect(koLetterBack(KO_LETTERS.find((l) => l.glyph === 'ㅓ')!)).toContain(`RR, an aid: ${RR_VOWEL['ㅓ']}`);
    for (const l of KO_LETTERS) expect(koLetterBack(l), l.glyph).toMatch(/RR, an aid/);
    expect(koRomanizeWord('한국어')).toBe('hangugeo');
  });

  it('fades its help with the stages: romanization up to stage 5, none from stage 6, a Hangul respelling only where the sound differs', () => {
    for (const w of WORDS) {
      const stage = Math.max(koFormStage(w.form), KO_STAGES[6].words.includes(w.form) ? 7 : 0);
      if (stage <= 5) expect(w.pronunciation, w.form).toBe(koRomanizeWord(w.form, { nominal: !(w.form.length > 1 && w.form.endsWith('다')) }));
      else expect(w.pronunciation === undefined || /^\[[가-힣 ]+\]$/.test(w.pronunciation), `${w.form} ${w.pronunciation}`).toBe(true);
    }
    expect(WORDS.find((w) => w.form === '학교')!.pronunciation).toBe('[학꾜]');
    expect(WORDS.find((w) => w.form === '사람')!.pronunciation).toBeUndefined();
    expect(WORDS.find((w) => w.form === '나')!.pronunciation).toBe('na');
    expect(koWordPronunciation('한국어', 7)).toBe('[한구거]');
  });
});

describe('the Alphabet deck rows', () => {
  it('are the 40 letters, from the one source, and each back fits the deck\'s 140 characters', () => {
    expect(HAND_LETTERS.ko).toEqual(koAlphabetRows());
    expect(HAND_LETTERS.ko).toHaveLength(40);
    expect(new Set(HAND_LETTERS.ko.map(([g]) => g)).size).toBe(40);
    for (const [g, back] of HAND_LETTERS.ko) expect(back.length, `${g} ${back}`).toBeLessThanOrEqual(140);
    expect(HAND_LETTERS.ko.slice(0, 10).map(([g]) => g)).toEqual(list(BRIEF[1]));   // stage 1 first, in the brief's order
  });
  it('is a deck of its own with the right ids, a note that says it is unreviewed, and Korean aliases', () => {
    expect(ALPHABET_LANGUAGES).toContain('ko');
    expect(alphabetLanguageOf('ko-KR')).toBe('ko');
    const cards = alphabetCards('ko');
    expect(cards).toHaveLength(40);
    expect(cards.every((c) => c.unitId === `class:ko-alphabet:${c.glyph}`)).toBe(true);
    const deck = alphabetDeckFor('ko', undefined, '2026-11-25T00:00:00.000Z')!;
    expect(deck.items).toHaveLength(40);
    expect(deck.notes).toMatch(/not yet reviewed/);
    expect(deck.notes).toMatch(/never the spelling/);
  });
});

describe('the Sprint profile', () => {
  profileChecks(KO_PROFILE, {
    newKeys: [...KO_STAGES[2].syllables, ...KO_FINAL_SOUNDS.map((j) => `${j}받침`)],
  });

  it('lists its units in the order of the stages, each unit in a stage the brief names', () => {
    const stages = KO_PROFILE.units.map((u) => koUnitStage(u.key));
    expect(stages.every((s) => s !== undefined)).toBe(true);
    expect(stages).toEqual([...stages].sort((a, b) => a! - b!));
    expect(KO_PROFILE.units.filter((u) => u.kind === 'letter')).toHaveLength(40);
    expect(KO_PROFILE.units.filter((u) => u.kind === 'cluster').map((u) => u.key)).toEqual(list(BRIEF[3]));
    expect(KO_PROFILE.units.filter((u) => u.kind === 'final-form')).toHaveLength(7);
    expect(KO_PROFILE.scriptId).toBe('Hang');
    expect(KO_PROFILE.rtl).toBeUndefined();
  });

  it('teaches in the stage order the brief gives (stages 1 and 2 are one step: no syllable is readable with consonants alone)', () => {
    const step = (k: string): number => { const s = koUnitStage(k)!; return s <= 2 ? 1 : s - 1; };
    const order = sprintOrder(KO_PROFILE, KO_PROFILE.laterBatch);
    expect(order).toHaveLength(KO_PROFILE.units.length);
    // rule-block is the one exception: every syllable needs it, so the first words teach it with the first letters (it is still a stage-3 card)
    const steps = order.filter((k) => k !== 'rule-block').map(step);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    expect(order.indexOf('rule-block')).toBeLessThan(4);
    const first = planSprint({ profile: KO_PROFILE, knowledge: scriptKnowledge(KO_PROFILE, []), cards: [], now: '2026-11-25T12:00:00.000Z', size: 20 });
    expect(first.cards.filter((c) => c.kind === 'character' || c.kind === 'rule').every((c) => step(c.unitId.split(':').pop()!) === 1 || c.unitId.endsWith('rule-block'))).toBe(true);
  });

  it('is honest about a page: a form that is not a starter word needs only the letters it contains', () => {
    expect(KO_PROFILE.dependencies('키')).toEqual(['ㅋ', 'ㅣ', 'rule-block']);   // 키 (height) is on no starter list: the honest units only
    expect(KO_PROFILE.dependencies('코')).toEqual(expect.arrayContaining(['ㅋ', 'ㅗ', 'rule-block', 'ㄱ', '가']));   // 코 is a starter word: the stage gate comes with it
    expect(koDependencies('바나나')).toEqual(expect.arrayContaining(['ㅂ', 'ㅏ', 'ㄴ', 'rule-block']));
    expect(koDependencies('코')).toEqual(['ㅋ', 'ㅗ', 'rule-block']);
    // a starter word of a later stage carries the course's stage gate besides
    expect(koCourseDependencies('커피')).toEqual(expect.arrayContaining(['ㅋ', 'ㅓ', 'ㅍ', 'ㅣ', 'ㄱ', 'ㅏ', '가']));
    expect(koCourseDependencies('이')).toEqual(koDependencies('이'));
    expect(KO_PROFILE.dependencies('hello')).toBeUndefined();
    expect(KO_PROFILE.dependencies('')).toBeUndefined();
    expect(KO_PROFILE.dependencies('ㅋㅋ')).toBeUndefined();   // compatibility jamo standing alone are not blocks
  });

  it('names the units a word really needs: finals, neutralisation, compound finals and each sound change', () => {
    const dep = (w: string) => koDependencies(w)!;
    expect(dep('한')).toEqual(expect.arrayContaining(['rule-batchim', 'ㄴ받침']));
    expect(dep('옷')).toEqual(expect.arrayContaining(['ㅅ', 'ㄷ받침', 'rule-batchim-neutral']));
    expect(dep('닭')).toEqual(expect.arrayContaining(['ㄹ', 'ㄱ', 'ㄱ받침', 'rule-batchim-compound']));
    expect(dep('한국어')).toContain('rule-linking');
    expect(dep('국물')).toContain('rule-nasal');
    expect(dep('신라')).toContain('rule-liquid');
    expect(dep('좋다')).toContain('rule-aspirate');
    expect(dep('학교')).toContain('rule-tense');
    expect(dep('같이')).toEqual(expect.arrayContaining(['rule-palatal', 'rule-linking']));
    expect(dep('사람')).not.toContain('rule-linking');
    // what the adapter says changes the sound must be explained by a rule, or the word is not modelled
    expect(koDependencies('희')).toBeUndefined();
    expect(koDependencies('좋은')).toBeUndefined();
  });

  it('models every starter word and phrase, and each stage-7 word of the brief', () => {
    for (const w of WORDS) expect(koDependencies(w.form), w.form).toBeDefined();
    for (const p of PHRASES) expect(KO_PROFILE.dependencies(p.form), p.form).toBeDefined();
    expect(PHRASES.length).toBeGreaterThanOrEqual(8);
    for (const w of list(BRIEF[7])) expect(KO_PROFILE.words.some((x) => x.form === w && x.weight === 1), w).toBe(true);
    // any sound change the adapter shows between two blocks has a rule among the word's units
    const sound = ['rule-linking', 'rule-nasal', 'rule-liquid', 'rule-aspirate', 'rule-tense', 'rule-palatal'];
    for (const w of WORDS) {
      const spoken = [...koStandardPronunciation(w.form)], written = [...w.form];
      const changed = written.some((c, i) => leadOf(c) !== leadOf(spoken[i]) || vowelOf(c) !== vowelOf(spoken[i]));
      if (changed) expect(koDependencies(w.form)!.some((k) => sound.includes(k)), w.form).toBe(true);
    }
  });
});

describe('the practice words are real, in the lexicon, and glossed as it glosses them', () => {
  /** The lexicon's own first glosses are sometimes odd (앞 is "fore", 가족 "household"); a gloss may agree with one of them or name it. */
  const entries = (form: string) => {
    const stem = form.length > 1 && form.endsWith('다') ? form.slice(0, -1) : form;   // a predicate is filed under its stem, a noun under its headword
    return [...lookupKoreanStem(stem), ...lookupKoreanStem(form)].map((h) => h.entry).filter((e) => e.lemma === form);
  };
  it('has every word as a headword of the compiled core', () => {
    expect(WORDS.length).toBe(KO_WORD_ROWS.length);
    expect(new Set(WORDS.map((w) => w.form)).size).toBe(WORDS.length);
    expect(WORDS.length).toBeGreaterThanOrEqual(150);
    const missing = WORDS.filter((w) => entries(w.form).length === 0).map((w) => w.form);
    expect(missing).toEqual([]);
  });
  it('agrees with the lexicon on the meaning (a word of each gloss alternative appears in an entry of the headword)', () => {
    const bad: string[] = [];
    for (const [form, gloss] of KO_WORD_ROWS) {
      const lex = entries(form).map((e) => (e.gloss ?? '').toLowerCase()).join(' | ');
      const alts = gloss.toLowerCase().split(/[;,]/).map((a) => a.replace(/\(.*?\)/g, '').replace(/^to /, '').trim()).filter(Boolean);
      const content = (a: string): string[] => a.split(/\s+/).filter((t) => !['the', 'and', 'of', 'to', 'a', 'before', 'in'].includes(t));
      // at least one alternative must share a whole word with some entry of the lexicon
      if (!alts.some((a) => content(a).some((t) => new RegExp(`\\b${t.replace(/s$/, '')}s?\\b`).test(lex)))) bad.push(`${form}: "${gloss}" vs "${lex}"`);
    }
    expect(bad).toEqual([]);
  });
  it('keeps every weight a usefulness in (0, 1] and the list most useful first, with the brief\'s words on top', () => {
    for (const w of WORDS) { expect(w.weight).toBeGreaterThan(0); expect(w.weight).toBeLessThanOrEqual(1); expect(w.source).toMatch(/Wiktionary/); }
    expect(WORDS.map((w) => w.weight)).toEqual([...WORDS.map((w) => w.weight)].sort((a, b) => b - a));
    for (const p of PHRASES) { expect(p.gloss.length).toBeGreaterThan(0); expect(p.form.normalize('NFC')).toBe(p.form); }
  });
});

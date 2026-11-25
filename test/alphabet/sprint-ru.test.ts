import { describe, expect, it } from 'vitest';
import { RU_PROFILE } from '../../packages/language-packs/src/alphabet-sprint/profiles/ru';
import { loadSprintProfiles, sprintLanguageOf } from '../../packages/language-packs/src/alphabet-sprint/profiles';
import { scriptKnowledge } from '../../packages/language-packs/src/alphabet-sprint/knowledge';
import { planSprint } from '../../packages/language-packs/src/alphabet-sprint/plan';
import { decodableAfter, sprintOrder, wordDependencies } from '../../packages/language-packs/src/alphabet-sprint/select';
import { unitCountsFromCharacters } from '../../packages/goreview/app/alphabetPage';
import { profileChecks } from './sprint-kit';

const RULES = ['rule-stress', 'rule-final-devoicing', 'rule-g-as-v', 'rule-tsya', 'rule-zhi-shi'];
profileChecks(RU_PROFILE, { newKeys: RULES });

describe('Russian sprint specifics', () => {
  it('is registered: ru loads this profile', async () => {
    expect(sprintLanguageOf('ru-RU')).toBe('ru');
    expect(await loadSprintProfiles('ru')).toEqual([RU_PROFILE]);
  });

  it('has the 33 letters as the Alphabet deck writes them, five of them familiar, and five rules', () => {
    const letters = RU_PROFILE.units.filter((u) => u.kind === 'letter');
    expect(letters).toHaveLength(33);
    expect(letters.filter((u) => u.familiar).map((u) => u.key)).toEqual(['А а', 'К к', 'М м', 'О о', 'Т т']);
    expect(RU_PROFILE.units.filter((u) => u.kind === 'rule').map((u) => u.key)).toEqual(RULES);
  });

  it('reads a word of familiar letters with no new unit, so the first word needs nothing taught', () => {
    expect(RU_PROFILE.dependencies('как')).toEqual(['К к', 'А а']);
    expect(RU_PROFILE.dependencies('Кто')).toEqual(['К к', 'Т т', 'О о']);
    const familiar = new Set(RU_PROFILE.units.filter((u) => u.familiar).map((u) => u.key));
    expect(wordDependencies(RU_PROFILE).filter(({ deps }) => deps.every((d) => familiar.has(d))).length).toBeGreaterThanOrEqual(5);
  });

  it('needs the stress rule for a word of two or more vowels, and only for those', () => {
    expect(RU_PROFILE.dependencies('молоко')).toContain('rule-stress');
    expect(RU_PROFILE.dependencies('мама')).toContain('rule-stress');
    expect(RU_PROFILE.dependencies('дом')).not.toContain('rule-stress');
    expect(RU_PROFILE.dependencies('в')).toEqual(['В в']);
  });

  it('reads a stress mark as no letter, and keeps ё and й apart from е and и', () => {
    expect(RU_PROFILE.dependencies('молоко́')).toEqual(RU_PROFILE.dependencies('молоко'));
    expect(RU_PROFILE.dependencies('ёлка')).toContain('Ё ё');
    expect(RU_PROFILE.dependencies('ёлка')).not.toContain('Е е');
    expect(RU_PROFILE.dependencies('мой')).toContain('Й й');
    expect(RU_PROFILE.dependencies('мой')).not.toContain('И и');
  });

  it('needs the final-consonant rule for год and кровь, not for a preposition said with the next word or a word ending elsewhere', () => {
    expect(RU_PROFILE.dependencies('год')).toContain('rule-final-devoicing');
    expect(RU_PROFILE.dependencies('кровь')).toContain('rule-final-devoicing');
    expect(RU_PROFILE.dependencies('из')).not.toContain('rule-final-devoicing');
    expect(RU_PROFILE.dependencies('в')).not.toContain('rule-final-devoicing');
    expect(RU_PROFILE.dependencies('дом')).not.toContain('rule-final-devoicing');
  });

  it('needs the г-as-v rule for -ого, -его and сегодня, not for много', () => {
    for (const w of ['его', 'нового', 'ничего', 'сегодня']) expect(RU_PROFILE.dependencies(w), w).toContain('rule-g-as-v');
    for (const w of ['много', 'дорого', 'город', 'книга']) expect(RU_PROFILE.dependencies(w), w).not.toContain('rule-g-as-v');
  });

  it('needs the -тся rule and the жи ши rule where the spelling shows them', () => {
    expect(RU_PROFILE.dependencies('учиться')).toContain('rule-tsya');
    expect(RU_PROFILE.dependencies('учится')).toContain('rule-tsya');
    expect(RU_PROFILE.dependencies('учить')).not.toContain('rule-tsya');
    expect(RU_PROFILE.dependencies('жить')).toContain('rule-zhi-shi');
    expect(RU_PROFILE.dependencies('машина')).toContain('rule-zhi-shi');
    expect(RU_PROFILE.dependencies('школа')).not.toContain('rule-zhi-shi');
  });

  it('reads each word of a phrase and a hyphenated word; does not model Latin or Ukrainian letters', () => {
    expect(RU_PROFILE.dependencies('Как дела?')).toEqual(expect.arrayContaining(['К к', 'Д д', 'Е е', 'Л л', 'rule-stress']));
    expect(RU_PROFILE.dependencies('по-русски')).toEqual(expect.arrayContaining(['П п', 'Р р', 'У у', 'С с', 'И и']));
    expect(RU_PROFILE.dependencies('hello')).toBeUndefined();
    expect(RU_PROFILE.dependencies('їжа')).toBeUndefined();
    expect(RU_PROFILE.dependencies('2026')).toBeUndefined();
  });

  it('writes its starter words as ordinary text does (lower case, no stress mark) and gives the stress on the back', () => {
    for (const w of RU_PROFILE.words) expect(w.form, w.form).toMatch(/^[а-яё]+$/u);
    const moloko = RU_PROFILE.words.find((w) => w.form === 'молоко')!;
    expect(moloko.gloss).toBe('milk');
    expect(moloko.pronunciation).toBe('molokó'.normalize('NFC'));
    expect(RU_PROFILE.phrases.map((p) => p.form)).toContain('Как дела?');
  });

  it('gives a beginner a real word on the second card, read with letters already familiar plus the first new one', () => {
    const plan = planSprint({ profile: RU_PROFILE, knowledge: scriptKnowledge(RU_PROFILE, []), cards: [], now: '2026-11-18T12:00:00.000Z', size: 20 });
    expect(plan.cards[0].kind).toBe('character');
    expect(plan.cards[1].kind).toBe('word');
    expect(plan.cards.filter((c) => c.kind === 'word' || c.kind === 'phrase').length).toBeGreaterThanOrEqual(10);
    expect(plan.progress.totalUnits).toBe(33); // 28 letters that are not familiar and five rules
  });

  it('after ten units a learner reads far more starter words than after the first ten letters of the alphabet', () => {
    const order = sprintOrder(RU_PROFILE, RU_PROFILE.laterBatch);
    const alphabet = RU_PROFILE.units.filter((u) => !u.familiar).map((u) => u.key);
    expect(order).toHaveLength(alphabet.length);
    expect(decodableAfter(RU_PROFILE, order, 10)).toBeGreaterThan(2 * decodableAfter(RU_PROFILE, alphabet, 10));
  });

  it('turns the letters counted on a page into unit counts', async () => {
    const counts = await unitCountsFromCharacters('ru', { 'б': 4, 'Ё': 1, 'ё': 2, 'о': 9 });
    expect(counts!.get('Б б')).toBe(4);
    expect(counts!.get('Ё ё')).toBe(3);
    expect(counts!.get('О о')).toBe(9);
  });
});

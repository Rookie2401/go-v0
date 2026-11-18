/**
 * The Alphabet Sprint engine against the brief's workflows (docs/goreview-app/ALPHABET-SPRINT.md), on the Spanish reference profile:
 * evidence-based script levels, no false mastery, due work first, no repetition of a mastered letter, no filler, page-driven selection,
 * and readiness figures with honest denominators.
 */
import { describe, expect, it } from 'vitest';
import { sprintUnitId, parseSprintUnitId, isSprintUnitId, contrastKey } from '../../src/alphabet/sprint/ids';
import { scriptKnowledge, readyUnits, type SprintCardState } from '../../src/alphabet/sprint/knowledge';
import { planSprint, sprintCardFor } from '../../src/alphabet/sprint/plan';
import { scriptReadiness, tokensOf, unitCounts } from '../../src/alphabet/sprint/readiness';
import { selectNextUnits, sprintOrder, decodableAfter, SELECT_WEIGHTS } from '../../src/alphabet/sprint/select';
import { ES_PROFILE as p } from '../../src/alphabet/sprint/profiles/es';
import { isVocabularyUnitId } from '../../packages/repository-contract/src';

const NOW = '2026-11-17T12:00:00.000Z';
const day = (n: number, h = 12) => new Date(Date.parse('2026-11-01T00:00:00.000Z') + n * 86_400_000 + h * 3_600_000).toISOString();
const card = (unitId: string, ratings: Array<[number, number]>, extra: Partial<SprintCardState> = {}): SprintCardState => ({
  unitId, status: 'active', due: '2026-12-31T00:00:00.000Z', stability: 5, lapses: ratings.filter(([, r]) => r === 1).length, phase: 'review',
  history: ratings.map(([d, rating]) => ({ at: day(d), rating })), ...extra,
});
const ch = (key: string) => sprintUnitId('es', 'character', key);
const word = (form: string) => sprintUnitId('es', 'word', form);

describe('ids', () => {
  it('keep the old Alphabet deck letter ids and give every other card kind its own, all class: units outside the vocabulary', () => {
    expect(ch('Ñ ñ')).toBe('class:es-alphabet:Ñ ñ');
    expect(word('niño')).toBe('class:es-alphabet-word:niño');
    expect(sprintUnitId('el', 'character', 'Β β', 'classical')).toBe('class:el-alphabet~classical:Β β');
    expect(parseSprintUnitId(sprintUnitId('es', 'contrast', contrastKey('V v', 'B b')))).toMatchObject({ kind: 'contrast', key: 'B b|V v' });
    for (const id of [ch('J j'), word('casa'), sprintUnitId('es', 'rule', 'rule-accent')]) { expect(isSprintUnitId(id)).toBe(true); expect(isVocabularyUnitId(id)).toBe(false); }
    expect(isVocabularyUnitId('lemma:es:casa:NOUN')).toBe(true);
    expect(() => sprintUnitId('es', 'word', 'a:b')).toThrow();
  });
});

describe('script knowledge: evidence, never assumption', () => {
  it('starts new; a card shown but not answered is seen; one right answer is recognized, not known', () => {
    expect(scriptKnowledge(p, []).get('J j')!.level).toBe('new');
    expect(scriptKnowledge(p, [card(ch('J j'), [])]).get('J j')!.level).toBe('seen');
    expect(scriptKnowledge(p, [card(ch('J j'), [[1, 3]])]).get('J j')!.level).toBe('recognized');
  });

  it('needs right answers on two days AND a real word decoded with it to be known; a miss caps it at recognized', () => {
    const three = card(ch('J j'), [[1, 3], [1, 3], [3, 3]]);
    expect(scriptKnowledge(p, [three]).get('J j')!.level).toBe('familiar'); // never applied in a word yet
    const hijo = p.words.find((w) => p.dependencies(w.form)!.includes('J j'))!;
    const k = scriptKnowledge(p, [three, card(word(hijo.form), [[4, 3]])]).get('J j')!;
    expect(k.level).toBe('known');
    expect(scriptKnowledge(p, [card(ch('J j'), [[1, 3], [2, 3], [3, 3], [4, 1]]), card(word(hijo.form), [[4, 3]])]).get('J j')!.level).toBe('recognized');
  });

  it('counts a decoded word once per review for each unit it needs (no double counting), and a word missed is no evidence against a unit', () => {
    const w = p.words.find((x) => (x.form.match(/a/g) ?? []).length >= 2)!; // a word with a repeated letter
    const k = scriptKnowledge(p, [card(word(w.form), [[1, 3]])]);
    expect(k.get('A a')!.applied).toBe(1);
    const missed = scriptKnowledge(p, [card(ch('A a'), [[1, 3]]), card(word(w.form), [[2, 1]])]);
    expect(missed.get('A a')!.level).toBe('recognized');
  });

  it('a decoded word alone never makes its letters known (decoding is weaker evidence than the letter itself)', () => {
    const w = p.words.find((x) => p.dependencies(x.form)!.includes('O o'))!;
    const k = scriptKnowledge(p, [card(word(w.form), [[1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4]])]);
    expect(['recognized', 'seen']).toContain(k.get('O o')!.level);
  });

  it('familiar shapes count as ready without evidence, and say so', () => {
    expect(scriptKnowledge(p, []).get('M m')).toMatchObject({ level: 'known', basis: 'familiar-shape' });
  });
});

describe('the plan', () => {
  const k0 = scriptKnowledge(p, []);

  it('Workflow A: a beginner gets a handful of new letters, each followed at once by a real word it unlocks', () => {
    const plan = planSprint({ profile: p, knowledge: k0, cards: [], now: NOW, size: 12 });
    expect(plan.cards[0].kind).toBe('character');
    expect(plan.cards[1].kind).toBe('word');
    expect(plan.cards.filter((c) => c.kind === 'character' || c.kind === 'rule').length).toBeLessThanOrEqual(p.firstBatch);
    expect(plan.cards.length).toBeLessThanOrEqual(12);
    for (const c of plan.cards.filter((x) => x.kind === 'word')) expect(p.words.some((w) => w.form === parseSprintUnitId(c.unitId)!.key)).toBe(true);
  });

  it('Workflow B/D: letters the learner already reads are not introduced again; due cards come first, oldest due first', () => {
    const knownCards = ['E e', 'A a', 'R r', 'O o', 'I i'].map((k) => card(ch(k), [[1, 4], [2, 4], [3, 4]]));
    const due = card(ch('C c'), [[1, 3]], { due: '2026-11-10T00:00:00.000Z' });
    const dueLater = card(ch('G g'), [[1, 3]], { due: '2026-11-15T00:00:00.000Z' });
    const cards = [...knownCards, due, dueLater];
    const plan = planSprint({ profile: p, knowledge: scriptKnowledge(p, cards), cards, now: NOW, size: 15 });
    expect(plan.cards.slice(0, 2).map((c) => c.unitId)).toEqual([due.unitId, dueLater.unitId]);
    const introduced = plan.cards.filter((c) => c.reason.startsWith('next letter') || c.reason.startsWith('first letters')).map((c) => parseSprintUnitId(c.unitId)!.key);
    for (const k of ['E e', 'A a', 'R r', 'O o', 'I i']) expect(introduced).not.toContain(k);
  });

  it('a card answered Easy and not yet due is not asked again (the scheduler decides when it returns)', () => {
    const easy = card(ch('E e'), [[16, 4]], { due: '2026-11-25T00:00:00.000Z' });
    const plan = planSprint({ profile: p, knowledge: scriptKnowledge(p, [easy]), cards: [easy], now: NOW, size: 20 });
    expect(plan.cards.some((c) => c.unitId === easy.unitId)).toBe(false);
  });

  it('never fills: with every word used and nothing due, fewer cards than the deck size', () => {
    const tiny = { ...p, words: p.words.slice(0, 3), phrases: [] };
    const plan = planSprint({ profile: tiny, knowledge: scriptKnowledge(tiny, []), cards: [], now: NOW, size: 40 });
    expect(plan.cards.length).toBeLessThan(40);
    expect(new Set(plan.cards.map((c) => c.unitId)).size).toBe(plan.cards.length);
  });

  it('introduces fewer new letters while earlier ones are still shaky', () => {
    const shaky = ['E e', 'A a', 'R r', 'O o'].map((k) => card(ch(k), []));
    const plan = planSprint({ profile: p, knowledge: scriptKnowledge(p, shaky), cards: shaky, now: NOW, size: 20 });
    expect(plan.cards.filter((c) => c.reason.startsWith('next letter')).length).toBe(0);
  });

  it('adds a contrast once the learner has missed one of a confusable pair', () => {
    const cards = [card(ch('J j'), [[1, 3], [2, 1]]), card(ch('H h'), [[1, 3]])];
    const plan = planSprint({ profile: p, knowledge: scriptKnowledge(p, cards), cards, now: NOW, size: 20 });
    const contrast = plan.cards.find((c) => c.kind === 'contrast');
    expect(contrast?.unitId).toBe(sprintUnitId('es', 'contrast', contrastKey('J j', 'H h')));
    expect(sprintCardFor(p, contrast!.unitId)?.front).toBe(contrast!.front);
  });

  it('reports practical progress, not a completion percentage', () => {
    const plan = planSprint({ profile: p, knowledge: k0, cards: [], now: NOW, size: 10 });
    expect(plan.progress.message).toMatch(/first word/);
    expect(plan.progress.nextUnits).toHaveLength(3);
  });
});

describe('selection by reading utility', () => {
  const familiar = new Set(p.units.filter((u) => u.familiar).map((u) => u.key));

  it('beats alphabet order and pure single-letter frequency at every early step', () => {
    const order = sprintOrder(p, 4);
    const alphabet = p.units.filter((u) => !u.familiar).map((u) => u.key);
    for (const n of [3, 5, 8]) expect(decodableAfter(p, order, n)).toBeGreaterThan(decodableAfter(p, alphabet, n));
  });

  it('Workflow C: the letters of the learner\'s own pages move up', () => {
    const plain = selectNextUnits(p, { count: 3, ready: familiar });
    const page = selectNextUnits(p, { count: 3, ready: familiar, pageCounts: new Map([['Ñ ñ', 500], ['ll', 400]]) });
    expect(page.filter((k) => k === 'Ñ ñ' || k === 'll').length).toBeGreaterThan(plain.filter((k) => k === 'Ñ ñ' || k === 'll').length);
  });

  it('is deterministic and records its weights', () => {
    expect(selectNextUnits(p, { count: 4, ready: familiar })).toEqual(selectNextUnits(p, { count: 4, ready: familiar }));
    expect(Object.keys(SELECT_WEIGHTS).sort()).toEqual(['CONFUSION', 'COST', 'PAGE', 'PARTIAL', 'UNLOCK', 'USE']);
  });
});

describe('readiness: denominators stated, unsupported never counted as decodable', () => {
  it('counts tokens and unit occurrences, keeps unsupported tokens in the denominator, and is undefined with no tokens', () => {
    const k = scriptKnowledge(p, ['E e', 'A a', 'L l', 'S s'].map((key) => card(ch(key), [[1, 3]])));
    const r = scriptReadiness(p, ['la', 'la', 'casa', 'ж'], k);
    expect(r).toMatchObject({ tokens: 4, decodable: 2, unsupported: 1 });
    expect(r.decodableShare).toBeCloseTo(0.5);
    expect(r.missing[0].key).toBe('C c');
    expect(scriptReadiness(p, [], k).decodableShare).toBeUndefined();
    expect(tokensOf(p, '¡Hola, mamá! 2026')).toEqual(['Hola', 'mamá']);
    expect(unitCounts(p, ['mamá']).get('rule-accent')).toBe(1);
    expect(readyUnits(k).has('M m')).toBe(true);
  });
});

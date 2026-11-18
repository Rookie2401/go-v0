/**
 * Alphabet Sprint integrity outside GoReview: the Repository's vocabulary figures never count a built-in deck's practice card (a class:
 * id), and the extension keeps only single-character counts of the learner's pages, which only an extension page may read back.
 */
import { describe, expect, it } from 'vitest';
import { isVocabularyUnitId, type UnitKnowledge } from '../../packages/repository-contract/src';
import { createMemoryStore } from '../../packages/repository-store/src/memory';
import { createPageScriptStore, PAGE_SCRIPT_KEY } from '../../packages/golearn-extension/src/background/pageScript';
import { unitCountsFromCharacters } from '../../packages/goreview/app/alphabetPage';
import type { StorageArea } from '../../packages/golearn-extension/src/platform';

const row = (unitId: string, level: UnitKnowledge['level'], encounters: number): UnitKnowledge => ({
  learnerId: 'L1', unitId, languageId: 'es', modelVersion: 'projection@8', level, encounters, dimensions: {},
} as unknown as UnitKnowledge);

describe('the Repository: decoding is never vocabulary (Gate 5, Gate 8)', () => {
  it('leaves class: ids out of the encountered-words counts', async () => {
    const store = createMemoryStore();
    await store.putKnowledge([
      row('lemma:es:casa:NOUN', 'known', 3),
      row('class:es-alphabet-word:casa', 'known', 5), // the Sprint word card "casa": decoded, not known as a word
      row('class:es-alphabet:Ñ ñ', 'familiar', 4),
      row('class:es-essentials:¿Cómo estás?', 'seen', 1),
    ]);
    const stats = await store.getEncounteredKnowledgeStats!('L1', 'es');
    expect(stats.total).toBe(1);
    expect(stats.counts.known).toBe(1);
  });

  it('names the rule once, for every store and view', () => {
    expect(isVocabularyUnitId('class:th-alphabet:ก')).toBe(false);
    expect(isVocabularyUnitId('form:th:กา')).toBe(true);
  });
});

function memoryArea(): StorageArea & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    async get(keys) { const ks = keys == null ? Object.keys(data) : Array.isArray(keys) ? keys : [keys]; return Object.fromEntries(ks.filter((k) => k in data).map((k) => [k, structuredClone(data[k])])); },
    async set(items) { Object.assign(data, structuredClone(items)); },
    async remove(keys) { for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k]; },
  };
}

describe('the extension keeps letter counts only (privacy)', () => {
  it('stores single characters and numbers; drops words, digits, malformed entries and bad language ids', async () => {
    const area = memoryArea();
    const s = createPageScriptStore(area, () => 1000);
    expect(await s.add('he', { 'ש': 10, 'שלום': 3, '5': 4, ' ': 2, 'ל': -1, 'ם': 'x' })).toEqual({ ok: true });
    expect(await s.add('../etc', { a: 1 })).toEqual({ ok: false });
    expect(await s.add('he', { 'hello world': 1 })).toEqual({ ok: false });
    const kept = area.data[PAGE_SCRIPT_KEY] as Record<string, { counts: Record<string, number> }>;
    expect(Object.keys(kept)).toEqual(['he']);
    expect(kept.he.counts).toEqual({ 'ש': 10 });
    expect(JSON.stringify(area.data)).not.toMatch(/שלום|http|title|url/);
  });

  it('lets older pages fade, answers one language (or its base), and is cleared with local data', async () => {
    const area = memoryArea();
    const s = createPageScriptStore(area);
    await s.add('el', { 'α': 10 });
    await s.add('el', { 'β': 10 });
    const got = await s.get('el-koi');
    expect(got.ok).toBe(true);
    expect(got.counts!['β']).toBe(10);
    expect(got.counts!['α']).toBeCloseTo(9);
    expect(got.pages).toBe(2);
    expect(await s.get('th')).toEqual({ ok: true });
    await s.clear();
    expect(area.data[PAGE_SCRIPT_KEY]).toBeUndefined();
  });

  it('turns character counts into Sprint unit counts with the language profile (Hebrew letters, Spanish letters and accents)', async () => {
    const he = await unitCountsFromCharacters('he', { 'ש': 5, 'ם': 2 });
    expect(he).toBeDefined();
    expect([...he!.values()].reduce((a, b) => a + b, 0)).toBe(7);
    const es = await unitCountsFromCharacters('es', { 'ñ': 4, 'j': 3 });
    expect(es!.get('Ñ ñ')).toBe(4);
    expect(es!.get('J j')).toBe(3);
  });
});

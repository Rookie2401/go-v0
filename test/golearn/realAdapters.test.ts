/** GoLearn against the real adapters and the bundled corpus (ingested through src/ingest). */
import { beforeAll, describe, expect, it } from 'vitest';
import { StoreEventBus, createMemoryStore, ids } from '../../src/core';
import type { LanguageCode } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { ingestAll, loadBundledCorpus } from '../../src/ingest';
import { createGoLearn } from '../../src/golearn';

const U = 'real-user';

async function setup() {
  const store = createMemoryStore();
  const registry = createAdapterRegistry();
  const docs = loadBundledCorpus().filter((d) => d.lang === 'es' || d.lang === 'th');
  await ingestAll(store, registry, docs);
  let n = 0;
  const clock = () => new Date(Date.UTC(2026, 0, 1) + 1000 * n++).toISOString();
  const bus = new StoreEventBus(store, clock);
  const golearn = createGoLearn({ store, bus, adapters: registry, clock });
  golearn.attach();
  return { store, bus, golearn, registry };
}

async function readAll(ctx: Awaited<ReturnType<typeof setup>>, lang: LanguageCode, textId: string, session: string) {
  const sentences = (await ctx.store.sentences.where('textId', textId)).sort((a, b) => a.index - b.index);
  for (const s of sentences) {
    await ctx.bus.emit({
      type: 'SentenceViewed', userId: U, lang, surface: 'corpus', session, dedupeKey: `view:${U}:${session}:${s.id}`,
      textId, sentenceId: s.id, tokenIds: [],
    } as never);
  }
  return sentences;
}

const CASES: Array<{ lang: LanguageCode; word: string }> = [
  { lang: 'es', word: 'pecado' },
  { lang: 'th', word: 'บาป' },
];

describe.each(CASES)('real adapters — $lang', ({ lang, word }) => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  const story = ids.text(lang, 'story-01');
  const bible = ids.text(lang, 'bible-1john-1');
  beforeAll(async () => { ctx = await setup(); });

  it('the bundled story and Bible text are ingested', async () => {
    expect(await ctx.store.texts.get(story)).toBeDefined();
    expect(await ctx.store.texts.get(bible)).toBeDefined();
  });

  it('after reading the story, queryItem finds the story word through the adapter normalizer', async () => {
    const sentences = await readAll(ctx, lang, story, 'sess-1');
    expect(sentences.length).toBeGreaterThanOrEqual(6);
    const k = await ctx.golearn.queryItem(U, { surface: word, lang });
    expect(k.exists).toBe(true);
    expect(k.exactFormSeen).toBe(true);
    expect(k.encounterCount).toBeGreaterThanOrEqual(1);
    expect(k.textIds).toContain(story);
    expect(k.reading.level).not.toBe('unseen');
  });

  it('coverage of the Bible passage is > 0 after reading the story', async () => {
    const cov = await ctx.golearn.coverage(U, bible);
    expect(cov.wordTokens).toBeGreaterThan(0);
    expect(cov.knownLexicalCoverage + cov.partialCoverage).toBeGreaterThan(0);
    expect(cov.knownLexicalCoverage).toBeGreaterThan(0);
  });

  it('reading more sessions raises (never lowers) Bible coverage, and readiness is coherent', async () => {
    const before = (await ctx.golearn.coverage(U, bible)).knownLexicalCoverage;
    await readAll(ctx, lang, story, 'sess-2');
    await readAll(ctx, lang, story, 'sess-3');
    const after = await ctx.golearn.coverage(U, bible);
    expect(after.knownLexicalCoverage).toBeGreaterThanOrEqual(before);
    const r = await ctx.golearn.scriptureReadiness(U, bible);
    expect(r.familiarItems.length).toBeGreaterThan(0);
    expect(r.preparatoryTexts.every((t) => !t.textId.includes('bible'))).toBe(true);
    const enc = await ctx.store.encounters.where('userId', U);
    expect(enc.every((e) => e.weight > 0)).toBe(true);
  });
});

describe('real adapters — shared items between story and Bible', () => {
  it('reports lemma/form sharing across story and Bible (informational, asserts only what must hold)', async () => {
    const ctx = await setup();
    for (const lang of ['es', 'th'] as const) {
      const story = ids.text(lang, 'story-01');
      const bible = ids.text(lang, 'bible-1john-1');
      await readAll(ctx, lang, story, `share-${lang}`);
      await readAll(ctx, lang, bible, `share-${lang}`);
      const rows = await ctx.store.learnerItems.where('userId', U);
      const shared = rows.filter((r) => r.lang === lang && r.textIds.includes(story) && r.textIds.includes(bible));
      // at least one form or lemma item must be shared by the two texts (function words at minimum)
      expect(shared.length, `${lang}: items shared by story and Bible`).toBeGreaterThan(0);
      // one LearnerItemState per (user, item) even though the item occurs in both texts
      for (const r of shared) {
        expect((await ctx.store.learnerItems.where('itemId', r.itemId)).filter((x) => x.userId === U)).toHaveLength(1);
      }
    }
  });
});


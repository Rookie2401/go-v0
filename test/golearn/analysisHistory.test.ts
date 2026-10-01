/** A reviewed override keeps history: dictionary analysis → hand override → second override; nothing is deleted. */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import type { TokenAnalysis } from '../../src/core';
import { analysisHistory } from '../../src/golearn/queries';
import type { Ctx } from '../../src/golearn/state';
import { createHarness } from './harness';
import { ES_STORY, buildSpanish } from './fixtures';

const U = 'u1';
const CREO = `${ES_STORY}/s0/t1`;

describe('analysisHistory', () => {
  it('keeps the dictionary row and both overrides; the latest wins; origins are right; a rebuild changes nothing', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    const ctx = { store: h.store } as unknown as Ctx;
    // the analysis a dictionary produced (replaces the fixture's lexicon row as the only live one)
    await h.store.analyses.put({
      id: 'an:dict', tokenId: CREO, lang: 'es', lemmaId: ids.lemma('es', 'creer', 'VERB'), pos: 'VERB', morph: {}, confidence: 0.6,
      provenance: 'lexicon', origin: 'dictionary', sourceId: 'kaikki-es@2026-09-28', analyzer: 'dict:kaikki-es', createdAt: '2026-01-01T00:00:00.000Z',
    } as TokenAnalysis);
    await h.view(U, 'es', ES_STORY, 0);

    const first = await h.golearn.overrideAnalysis(CREO, { pos: 'AUX' }, 'cj');
    const second = await h.golearn.overrideAnalysis(CREO, { morph: { Person: '1' } }, 'cj');
    expect(first).toMatchObject({ origin: 'reviewed', sourceId: 'human:cj', provenance: 'human' });
    expect(second).toMatchObject({ origin: 'reviewed', sourceId: 'human:cj', supersedes: first.id });
    expect(second.id).not.toBe(first.id);

    const history = await analysisHistory(ctx, CREO);
    const fixture = (await h.store.analyses.where('tokenId', CREO)).find((r) => r.analyzer === 'fixture@1')!;
    expect(history).toHaveLength(4); // the fixture row, the dictionary row, the two overrides — nothing deleted
    expect(history[0]).toMatchObject({ status: 'current', analysis: { id: second.id } });
    expect(history.filter((x) => x.status === 'current')).toHaveLength(1);
    expect(history.find((x) => x.analysis.id === first.id)!.status).toBe('superseded');
    expect(history.find((x) => x.analysis.id === 'an:dict')).toMatchObject({ status: 'superseded', analysis: { origin: 'dictionary', sourceId: 'kaikki-es@2026-09-28' } });
    expect(history.find((x) => x.analysis.id === fixture.id)!.status).toBe('superseded');
    expect(history.map((x) => x.analysis.createdAt)).toEqual([...history.map((x) => x.analysis.createdAt)].sort().reverse()); // newest first
    expect((await h.golearn.resolveAnalysis(CREO))!.id).toBe(second.id);

    const rows = JSON.stringify((await h.store.analyses.where('tokenId', CREO)).sort((a, b) => (a.id < b.id ? -1 : 1)));
    const items = JSON.stringify((await h.store.learnerItems.where('userId', U)).sort((a, b) => (a.id < b.id ? -1 : 1)));
    await h.golearn.rebuild(U);
    expect(JSON.stringify((await h.store.analyses.where('tokenId', CREO)).sort((a, b) => (a.id < b.id ? -1 : 1)))).toBe(rows);
    expect(JSON.stringify((await h.store.learnerItems.where('userId', U)).sort((a, b) => (a.id < b.id ? -1 : 1)))).toBe(items);
    expect(await analysisHistory(ctx, CREO)).toEqual(history);
  });
});

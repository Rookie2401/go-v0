// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { openLocalRepository } from '../../packages/repository-local/src';
import { createMemoryArea } from '../../packages/repository-sync/src';
import { heAdapter } from '../../src/adapters/he';
import { CONTRACT_VERSION, type GoEvent } from '../../packages/repository-contract/src';
import { createReviewEngine } from '../../packages/goreview/app/engine';
import { packFactsFor } from '../../packages/goreview/app/packFacts';
import { evidenceFor, ratingFor, registry } from '../../packages/goreview/src';
import { createApp } from '../../packages/goreview/app/app';
import { planCurrentDeck } from '../../packages/goreview/app/deckModel';
import { loadReviewModel } from '../../packages/goreview/app/workspace';
import { installHebrewIndex, resetHebrewIndexes, type HebrewFormIndex } from '../../src/adapters/hebrew/index-store';

const requests: string[] = [];
let failPathOnce: string | undefined;
const fileFetch = (async (input: RequestInfo | URL) => {
  const fs = await import('node:fs'); const path = await import('node:path');
  const pathname = decodeURIComponent(new URL(String(input), 'http://assets.local/').pathname);
  const file = path.join(path.resolve(__dirname, '../../public'), pathname);
  requests.push(pathname);
  if (failPathOnce === pathname) { failPathOnce = undefined; return new Response('temporary failure', { status: 503 }); }
  return fs.existsSync(file) ? new Response(fs.readFileSync(file)) : new Response('not found', { status: 404 });
}) as unknown as typeof fetch;
afterEach(() => { failPathOnce = undefined; resetHebrewIndexes((id) => id === 'oshb-tanakh-core'); });

describe('real Hebrew GoReview deck', () => {
  it('installs full Biblical and Modern shards before analysing units and proposes review cards', async () => {
    const clock = () => '2026-10-31T10:00:00.000Z';
    const fs = await import('node:fs'); const path = await import('node:path');
    const biblical = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/lexicon/he/biblical-index.json'), 'utf8')) as HebrewFormIndex;
    installHebrewIndex(biblical); // Biblia has already installed its full index when these Repository rows are created.
    const repo = await openLocalRepository({ area: createMemoryArea(), now: clock, adapters: { he: heAdapter } });
    try {
      const identity = await repo.identity();
      const enrolled = await repo.api.enrol({ languageId: 'he', packId: 'pack:he', packVersion: '1', varietyId: 'he-bib', goals: [{ kind: 'reading' }] });
      if (!enrolled.ok) throw new Error(enrolled.message);
      const surfaces = ['בָּרָא', 'חֹשֶׁךְ', 'תֹּהוּ', 'תְּהוֹם'];
      const expectedLemmaIds = [
        'lemma:he:בָּרָא:VERB', 'lemma:he:חֹשֶׁךְ:NOUN', 'lemma:he:תֹּהוּ:NOUN', 'lemma:he:תְּהוֹם:NOUN',
      ];
      let n = 0;
      for (let i = 0; i < surfaces.length; i++) {
        const surface = surfaces[i];
        const looked = await repo.api.lookup({ languageId: 'he', surface });
        expect(looked.ok).toBe(true);
        // Biblia records the source's chosen Hebrew reading for each selected word. In particular בָּרָא also
        // has an Aramaic homograph row בַּר; that alternative is not part of this Hebrew-source fixture.
        const itemIds = looked.ok ? looked.data.units.filter((u) => u.unitId === expectedLemmaIds[i]).map((u) => u.unitId) : [];
        expect(itemIds).toEqual([expectedLemmaIds[i]]);
        const event: GoEvent = {
          id: `he-debug-${++n}`, v: CONTRACT_VERSION, learnerId: identity.learnerId, enrolmentId: enrolled.data.enrolment.enrolmentId,
          languageId: 'he', at: clock(), producer: { app: 'golearn-ext', version: 'test', deviceId: identity.deviceId }, kind: 'SelectionLookedUp',
          subject: { itemIds }, payload: { surface, tokenCount: 1, contextKind: 'none', contextConfidence: 0, readerId: 'test', helpShown: [] }, dedupeKey: `he-debug-${n}`,
        };
        expect((await repo.api.appendEvents([event])).ok).toBe(true);
      }
      // A new GoReview page starts with its compiled core only; the provider must install its own per-page assets.
      resetHebrewIndexes((id) => id === 'oshb-tanakh-core');
      const engine = createReviewEngine({ builders: registry, evidenceFor, ratingFor, factsFor: packFactsFor({ fetch: fileFetch, baseUrl: 'http://assets.local/' }), now: clock, random: () => .5 });
      const candidates = await repo.api.candidates(enrolled.data.enrolment.enrolmentId, 50);
      expect(candidates.ok && candidates.data.candidates.length).toBeGreaterThan(0);
      const glossFacts = [];
      const candidateRows = candidates.ok ? candidates.data.candidates : [];
      const factsRows = await Promise.all(candidateRows.map((c) => engine.factsFor?.(c.unitId, 'he', repo.api)));
      for (const facts of factsRows) {
        expect(facts, `missing Hebrew facts; requests ${requests.join(', ')}`).toBeDefined();
        if (facts?.glosses.length) glossFacts.push(facts);
      }
      expect(glossFacts.length).toBeGreaterThan(0);
      expect(requests.filter((r) => r.endsWith('/manifest.json')).sort()).toEqual([
        '/lexicon/he/biblical/manifest.json', '/lexicon/he/modern/manifest.json',
      ]);
      expect(new Set(requests).size).toBe(requests.length); // concurrent facts share both manifests and overlapping shards
      const root = document.createElement('div'); document.body.append(root);
      const app = createApp(root, {
        win: window, doc: document, fetch: fileFetch, area: createMemoryArea(), config: { serviceUrl: 'https://repository.invalid' },
        createApi: () => repo.api, local: async () => repo, engine, audio: null, now: () => new Date(clock()), newId: () => 'id', random: () => .5, appVersion: 'test', autoSync: false,
      });
      await app.ready();
      const model = await loadReviewModel(app.ctx);
      expect(model).toBeDefined();
      const planned = await planCurrentDeck(app.ctx, model!);
      const plannedUnitIds = planned.plan.items.map((x) => x.item.unitId).sort();
      expect(plannedUnitIds).toEqual(expectedLemmaIds.sort());
      app.destroy();
    } finally { resetHebrewIndexes((id) => id === 'oshb-tanakh-core'); await repo.close(); }
  });

  it('retries a transient Hebrew asset failure without poisoning the next facts request', async () => {
    requests.length = 0;
    const provider = packFactsFor({ fetch: fileFetch, baseUrl: 'http://assets.local/' })('he', { unit: async () => ({ ok: false }) } as never);
    expect(provider).toBeDefined();
    failPathOnce = '/lexicon/he/biblical/manifest.json';
    expect(await provider!.factsFor('form:he:בָּרָא', 'he')).toBeUndefined();
    expect(requests.filter((r) => r === '/lexicon/he/biblical/manifest.json')).toHaveLength(1);
    const recovered = await provider!.factsFor('form:he:בָּרָא', 'he');
    expect(recovered).toBeDefined();
    expect(recovered?.unit.label).toBe('בָּרָא');
    expect(requests.filter((r) => r === '/lexicon/he/biblical/manifest.json')).toHaveLength(2);
    resetHebrewIndexes((id) => id === 'oshb-tanakh-core');
  });
});

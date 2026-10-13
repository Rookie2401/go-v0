// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { openLocalRepository } from '../../packages/repository-local/src';
import { createMemoryArea } from '../../packages/repository-sync/src';
import { hiAdapter } from '../../src/adapters/hi';
import { CONTRACT_VERSION, type GoEvent } from '../../packages/repository-contract/src';
import { createReviewEngine } from '../../packages/gopractice/engine';
import { packFactsFor } from '../../packages/gopractice/packFacts';
import { evidenceFor, ratingFor, registry } from '../../packages/goreview/src';
import { createApp } from '../../packages/gopractice/app';
import { beginSession, loadReviewModel } from '../../packages/gopractice/workspace';

const fileFetch = (async (input: RequestInfo | URL) => {
  const fs = await import('node:fs'); const path = await import('node:path');
  const file = path.join(path.resolve(__dirname, '../../public'), new URL(String(input), 'http://assets.local/').pathname);
  return fs.existsSync(file) ? new Response(fs.readFileSync(file)) : new Response('not found', { status: 404 });
}) as unknown as typeof fetch;

describe('real Hindi automatic deck', () => {
  it('builds dictionary-backed surfaces and keeps the deck durable', async () => {
    const clock = () => '2026-10-12T10:00:00.000Z';
    const area = createMemoryArea();
    const repo = await openLocalRepository({ area, now: clock, adapters: { hi: hiAdapter } });
    const id = await repo.identity();
    const enrol = await repo.api.enrol({ languageId: 'hi', packId: 'pack:hi', packVersion: '6', goals: [{ kind: 'reading' }] });
    if (!enrol.ok) throw new Error(enrol.message);
    const words = ['आधीन', 'उत्पत्ति', 'कोमल', 'क्योंकर', 'गम्भीरता'];
    let n = 0;
    for (const surface of words) {
      const lookup = await repo.api.lookup({ languageId: 'hi', surface });
      expect(lookup.ok).toBe(true);
      const unitIds = lookup.ok ? lookup.data.units.map((u) => u.unitId) : [`form:hi:${surface}`];
      const event: GoEvent = {
        id: `hi-debug-${++n}`, v: CONTRACT_VERSION, learnerId: id.learnerId, enrolmentId: enrol.data.enrolment.enrolmentId,
        languageId: 'hi', at: clock(), producer: { app: 'golearn-ext', version: 'test', deviceId: id.deviceId }, kind: 'SelectionLookedUp',
        subject: { itemIds: unitIds }, payload: { surface, tokenCount: 1, contextKind: 'none', contextConfidence: 0, readerId: 'test', helpShown: [] }, dedupeKey: `hi-debug-${n}`,
      };
      const appended = await repo.api.appendEvents([event]);
      expect(appended.ok).toBe(true);
    }
    const candidates = await repo.api.candidates(enrol.data.enrolment.enrolmentId, 50);
    expect(candidates.ok && candidates.data.candidates.length).toBeGreaterThan(0);
    const factsFor = packFactsFor({ fetch: fileFetch, baseUrl: 'http://assets.local/' });
    const engine = createReviewEngine({ builders: registry, evidenceFor, ratingFor, factsFor, now: clock, random: () => .5 });
    const availability = new Map<string, boolean>();
    for (const unitId of ['form:hi:आधीन', 'form:hi:उत्पत्ति', 'form:hi:कोमल', 'form:hi:क्योंकर', 'form:hi:गम्भीरता']) {
      const facts = await engine.factsFor?.(unitId, 'hi', repo.api);
      const available = await engine.exerciseAvailable?.({ unitId, unitKind: 'form', languageId: 'hi', dimension: 'written-recognition', family: 'written-recognition', api: repo.api, now: clock() });
      availability.set(unitId, Boolean(available));
      expect(facts).toBeDefined();
      if (unitId === 'form:hi:उत्पत्ति' || unitId === 'form:hi:कोमल') {
        expect(facts?.glosses.length).toBeGreaterThan(0);
      } else {
        expect(facts?.glosses.length).toBe(0);
      }
    }
    expect(availability.get('form:hi:उत्पत्ति')).toBe(true);
    expect(availability.get('form:hi:कोमल')).toBe(true);
    expect(availability.get('form:hi:आधीन')).toBe(false);
    expect(availability.get('form:hi:क्योंकर')).toBe(false);
    expect(availability.get('form:hi:गम्भीरता')).toBe(false);
    const root = document.createElement('div'); document.body.append(root);
    const app = createApp(root, {
      win: window, doc: document, fetch: fileFetch, area: createMemoryArea(), config: { serviceUrl: 'https://repository.invalid' },
      createApi: () => repo.api,
      local: async () => repo, engine, audio: null, now: () => new Date(clock()), newId: () => 'id', random: () => .5, appVersion: 'test', autoSync: false,
    });
    await app.ready();
    const firstModel = await loadReviewModel(app.ctx);
    expect(firstModel?.deck.length).toBeGreaterThan(0);
    const firstCardIds = firstModel?.deck.map((x) => x.itemId).sort();
    expect(firstCardIds).toEqual(['card:written-recognition:form:hi:कोमल', 'card:written-recognition:form:hi:उत्पत्ति'].sort());
    const stored = (await app.ctx.events('hi')).filter((e) => e.kind === 'CardAdded');
    expect(stored.length).toBe(firstModel?.deck.length);
    const secondModel = await loadReviewModel(app.ctx);
    expect(secondModel?.deck.map((x) => x.itemId).sort()).toEqual(firstCardIds);
    const session = await beginSession(app.ctx, secondModel!);
    expect(session.ok).toBe(true);
    if (session.ok) {
      app.ctx.run.active = session.run;
      await app.go('review/session');
      expect(root.querySelector('.flashcard[data-side="front"]')).not.toBeNull();
      expect(root.querySelector('#answer-input')).toBeNull();
      (root.querySelector('#reveal') as HTMLButtonElement).click();
      expect(root.querySelector('.flashcard[data-side="back"]')).not.toBeNull();
      expect(root.querySelector('#revealed-answer')?.textContent).toBeTruthy();
      expect((await app.ctx.events('hi')).filter((event) => event.kind === 'CardReviewed')).toEqual([]);
    }
    app.destroy();
    await repo.close();
  });
});

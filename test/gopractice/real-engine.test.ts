// @vitest-environment jsdom
/**
 * The shell on GoReview's REAL builders, evidence builder, runner and the REAL Albanian pack facts (word list, adapter,
 * dictionary read from public/dict/sq): a smoke test that the adapter in engine.ts matches the modules it adapts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { evidenceFor, ratingFor, registry } from '../../packages/goreview/src';
import type { LinguisticUnit } from '../../packages/repository-contract/src';
import { createReviewEngine } from '../../packages/gopractice/engine';
import { packFactsFor } from '../../packages/gopractice/packFacts';
import { buildCardAdded, itemIdFor } from '../../packages/goreview/src';
import { destroyRigs, ids, reviewed, key, makeRig, queued, reopen, seed, type, until, T0, FakeService, defaultService, type Rig } from './helpers';
import { createApp } from '../../packages/gopractice/app';
import { createMemoryArea } from '../../packages/repository-sync/src';

afterEach(() => destroyRigs());

const DICT = path.resolve(__dirname, '../../public');
const fileFetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://assets.local/');
  const file = path.join(DICT, decodeURIComponent(url.pathname));
  if (!fs.existsSync(file)) return new Response('not found', { status: 404 });
  return new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': 'application/json' } });
}) as unknown as typeof fetch;

const unitId = 'lemma:sq:shkollë:NOUN';
const unit: LinguisticUnit = {
  unitId, kind: 'lexeme', languageId: 'sq', label: 'shkollë', pos: 'NOUN', packId: 'pack:sq', packVersion: '9', status: 'high-confidence',
  provenance: { source: 'hand-lexicon', ref: 'pack:sq:9', confidence: 1 }, createdAt: T0,
};

async function realRig(service: FakeService): Promise<Rig> {
  const rig = await makeRig({ service, signedIn: true });
  // swap in the real engine: a second app on the same storage, signed in already
  const { area } = rig;
  rig.app.destroy();
  document.body.innerHTML = '';
  const root = document.createElement('div');
  document.body.append(root);
  const engine = createReviewEngine({
    builders: registry, evidenceFor, ratingFor, factsFor: packFactsFor({ fetch: fileFetch, baseUrl: 'http://assets.local/' }),
    now: () => T0, random: () => 0.5,
  });
  const app = createApp(root, { ...rig.deps, area: area ?? createMemoryArea(), engine, createApi: (_u, token) => { const a = service.api(token) as unknown as { unit: unknown }; a.unit = async () => ({ ok: true, status: 200, data: { unit, relations: [], analyses: [] } }); return a as never; } });
  await app.ready();
  const next: Rig = { ...rig, root, app, q: (s) => { const e = root.querySelector(s); if (!e) throw new Error(`no ${s}`); return e as never; }, qa: (s) => [...root.querySelectorAll(s)] as never };
  return next;
}

describe('GoReview\'s real modules behind the shell', () => {
  it('asks a real Albanian retrieval question from pack facts and records a real CardReviewed', async () => {
    const service = defaultService();
    const rig = await realRig(service);
    const a = ids('L1', 'sq');
    await seed(rig, [
      buildCardAdded({ ...a, at: '2026-09-01T09:00:00.000Z', deviceId: 'dev-old', unitId, unitKind: 'lexeme', dimension: 'meaning-to-target-retrieval', family: 'meaning-to-form', addedBy: 'intake' }),
      reviewed(a, 'shkollë', 'meaning-to-form', 1, '2026-09-01T10:00:00.000Z'),
    ]);
    expect(itemIdFor(unitId, 'meaning-to-target-retrieval')).toContain(unitId);
    await reopen(rig);
    rig.q('#start-session').click();
    await until(() => !!rig.root.querySelector('#session .exercise') || !!rig.root.querySelector('#summary'), 'an exercise or a summary', 200);
    expect(rig.root.querySelector('.exercise'), rig.root.textContent ?? '').not.toBeNull();
    expect(rig.q('.exercise').getAttribute('data-family')).toBe('meaning-to-form');
    expect(rig.q('#meaning').textContent!.length).toBeGreaterThan(0);
    const input = rig.q<HTMLInputElement>('#answer-input');
    type(input, 'shkollë');
    key('Enter', input);
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    expect(rig.q('#outcome').textContent).toBe('Correct');
    rig.q('#next').click();
    await until(() => !!rig.root.querySelector('#summary'), 'the summary');
    const [ev] = await queued(rig);
    expect(ev.kind).toBe('CardReviewed');
    expect(ev.producer.app).toBe('gopractice-review');
    expect(ev.payload).toMatchObject({ rating: 3 });
  });
});

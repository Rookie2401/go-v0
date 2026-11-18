// The GoReview card for a Latin word leads with its Vulgate sense (docs/latin/GOREVIEW-CHECK.md, finding 1: gratia showed
// "popularity/esteem/credit" and credo "trust, entrust" first; 2cd8872d gave the 520 commonest lemmas curated leads). Built here the way GoReview
// builds a card: the real Latin pack's facts provider, then the written-recognition exercise, so what is asserted is what the card would show.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packFactsFor } from '../../packages/goreview/app/packFacts';
import { writtenRecognition } from '../../packages/goreview/src/exercises/written-recognition';
import type { ReviewFacts } from '../../packages/goreview/src/facts/review-facts';
import type { RepositoryApi } from '../../packages/repository-service/src/api';

const PUBLIC = path.resolve(__dirname, '../../public');
// the assets a card may ask for; a file not on disk answers 404, as on a device without it
const fetchAssets = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://assets.local/');
  const file = path.join(PUBLIC, decodeURIComponent(url.pathname));
  return fs.existsSync(file) && fs.statSync(file).isFile() ? new Response(fs.readFileSync(file)) : new Response('not found', { status: 404 });
}) as typeof fetch;
const api = { async unit() { return { ok: false, status: 404, error: 'not-found', message: 'missing', body: {} }; } } as unknown as RepositoryApi;

async function card(surface: string) {
  const provider = packFactsFor({ fetch: fetchAssets, baseUrl: 'http://assets.local/' })('la', api)!;
  const unitId = `form:la:${surface}`;
  const facts = await provider.factsFor(unitId, 'la', 'la-eccl') as ReviewFacts | undefined;
  expect(facts, `facts for ${surface}`).toBeDefined();
  const built = await writtenRecognition.build({ unitId, unitKind: 'form', languageId: 'la', varietyId: 'la-eccl', dimension: 'written-recognition' }, facts!, { now: '2026-11-13T00:00:00.000Z', random: () => 0 });
  const key = (built as { answerKey?: { accepted?: string[]; explanation?: string } }).answerKey ?? {};
  return { facts: facts!, accepted: key.accepted ?? [], explanation: key.explanation ?? '' };
}

describe('Latin GoReview cards lead with the Vulgate sense (2cd8872d, checked 2026-11-13)', () => {
  it.each([
    ['gratia', /^grace\b/i, 'grace'],
    ['pax', /^peace\b/i, 'peace'],
    ['peccatum', /^sin\b/i, 'sin'],
  ])('%s: the facts lead with the Vulgate sense, and the card accepts and explains it', async (surface, lead, answer) => {
    const { facts, accepted, explanation } = await card(surface);
    expect(facts.glosses[0]).toMatch(lead);
    expect(facts.glosses[0]).not.toMatch(/popularity|esteem/i);
    expect(accepted).toContain(answer);
    expect(explanation).toContain(`means “${answer}`);
  });

  it('credo: the facts lead with "to believe"', async () => {
    const { facts } = await card('credo');
    expect(facts.glosses[0]).toMatch(/^(?:to )?believe\b/i);
  });

  // Was a known defect (found 2026-11-13): the shared builder judged whole dictionary senses by length before splitting them, so credo's
  // card accepted only "to lend, to loan". Fixed in packages/goreview/src/exercises/shared.ts (79426158, on master 7fa5efb4).
  it('credo: the card accepts "to believe" and says so', async () => {
    const { accepted, explanation } = await card('credo');
    expect(accepted).toContain('to believe');
    expect(explanation).toContain('means “to believe');
  });
});

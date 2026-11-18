// A dictionary file that fails once is asked again before it counts as a failed source (2026-11-17). The candidate recovery of one Hindi
// visit on the owner's phone read about 130 dictionary files, and any single failure left the whole recovery incomplete, so it never
// completed there. Built with the real Hindi pack and its dictionary on disk; the word is read from the shard, never typed here.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packFactsFor } from '../../packages/goreview/app/packFacts';
import type { RepositoryApi } from '../../packages/repository-service/src/api';

const PUBLIC = path.resolve(__dirname, '../../public');
const SHARD = 'dict/hi/s-08.json';
const hasDictionary = fs.existsSync(path.join(PUBLIC, SHARD));
const api = {
  async unit() { return { ok: false, status: 404, error: 'not-found', message: 'missing', body: {} }; },
  async units(ids: string[]) { return { ok: true, status: 200, data: { units: {}, missing: ids } }; },
} as unknown as RepositoryApi;

/** Serves the files on disk; `fail` decides, per call of a path, whether it fails (a thrown network error) or answers. */
function assets(fail: (pathname: string, call: number) => 'throw' | '503' | undefined) {
  const calls = new Map<string, number>();
  const fetchAssets = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://assets.local/');
    const n = (calls.get(url.pathname) ?? 0) + 1;
    calls.set(url.pathname, n);
    const verdict = fail(url.pathname, n);
    if (verdict === 'throw') throw new TypeError('Load failed');
    if (verdict === '503') return new Response('busy', { status: 503 });
    const file = path.join(PUBLIC, decodeURIComponent(url.pathname));
    return fs.existsSync(file) && fs.statSync(file).isFile() ? new Response(fs.readFileSync(file)) : new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { fetchAssets, calls };
}

const word = (): string => Object.keys(JSON.parse(fs.readFileSync(path.join(PUBLIC, SHARD), 'utf8')) as Record<string, unknown>)[0]!;
const factsOf = async (fetchAssets: typeof fetch, unitId: string) =>
  packFactsFor({ fetch: fetchAssets, baseUrl: 'http://assets.local/' })('hi', api)!.factsFor(unitId, 'hi', undefined);

describe.skipIf(!hasDictionary)('GoReview pack facts ask a failed dictionary file once more', () => {
  it('a shard whose first read drops the connection is read again, and the word gets its facts', async () => {
    const { fetchAssets, calls } = assets((p, n) => (p.endsWith('/s-08.json') && n === 1 ? 'throw' : undefined));
    const facts = await factsOf(fetchAssets, `form:hi:${word()}`);
    expect(facts?.glosses.length).toBeGreaterThan(0);
    expect(calls.get('/dict/hi/s-08.json')).toBe(2);
  });

  it('a server error is asked again too', async () => {
    const { fetchAssets, calls } = assets((p, n) => (p.endsWith('/s-08.json') && n === 1 ? '503' : undefined));
    const facts = await factsOf(fetchAssets, `form:hi:${word()}`);
    expect(facts?.glosses.length).toBeGreaterThan(0);
    expect(calls.get('/dict/hi/s-08.json')).toBe(2);
  });

  // Before the second read, one dropped connection on this shard already ended here: the word had no facts and was passed over in silence
  it('a shard that fails twice is given up after the second read: the word gets no facts from it', async () => {
    const { fetchAssets, calls } = assets((p) => (p.endsWith('/s-08.json') ? 'throw' : undefined));
    const facts = await factsOf(fetchAssets, `form:hi:${word()}`).catch(() => undefined);
    expect(facts?.glosses.length ?? 0).toBe(0);
    expect(calls.get('/dict/hi/s-08.json')).toBe(2);
  });

  it('a missing file (404) is an answer and is asked only once', async () => {
    const { fetchAssets, calls } = assets(() => undefined);
    await factsOf(fetchAssets, `form:hi:${word()}`).catch(() => undefined);
    const missing = [...calls.entries()].filter(([p]) => !fs.existsSync(path.join(PUBLIC, decodeURIComponent(p))));
    for (const [, n] of missing) expect(n).toBe(1);
  });
});

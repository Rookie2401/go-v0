// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore, ids } from '../../src/core';
import type { RankCandidate } from '../../src/core';
import { bootstrap } from '../../src/app/bootstrap';
import { setCorpusFrequencySource } from '../../src/golearn/rank';
import { buildFrequencyFile, frequencyText } from '../../src/dict/frequency-node';
import { profile } from '../golearn/profiles';
import { resetPrefsForTests } from '../../src/ui/prefs';

// R9: bootstrap registers the corpus frequency source, so the live usefulUnknown reads <dict>/<lang>/frequency.json through the language's
// lexicon source - and falls back to the in-shortlist rule where there is none. Only the dictionary route answers; the rest is 404.
vi.mock('../../src/ladder/bundle', async (orig) => ({ ...(await orig<typeof import('../../src/ladder/bundle')>()), ladderUnitDocuments: () => [] }));

const realFetch = globalThis.fetch;
beforeEach(() => { resetPrefsForTests(); localStorage.clear(); });
afterEach(() => { globalThis.fetch = realFetch; setCorpusFrequencySource(undefined); resetPrefsForTests(); localStorage.clear(); });

const sidecar = frequencyText(buildFrequencyFile({
  lang: 'es', date: '2026-10-07', counts: new Map([['raro', 500], ['rio', 1]]), words: 1000, sources: [{ id: 'test', kind: 'library', texts: 1, words: 1000 }],
}));
const serve = (files: Record<string, string>, log: string[]) => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost').pathname;
    log.push(url);
    return url in files ? new Response(files[url], { status: 200 }) : new Response('not found', { status: 404 });
  }) as typeof fetch;
};
const idOf = (s: string) => ids.text('es', s);
const shared: Array<[string, number]> = [['rio:NOUN', 6]];
const cands = (): RankCandidate[] => [['a1', [['raro:NOUN', 6]] as Array<[string, number]>], ['z1', shared], ['m1', shared], ['m2', shared]]
  .map(([id, lemmas]) => ({ profile: profile(idOf(id as string), [['sol', 93], ['otra', 7]], { lemmas: lemmas as Array<[string, number]> }), published: true, rights: 'verified-public-domain' }));
const rank = async (store = createMemoryStore()) => {
  const boot = await bootstrap({ store, courseId: 'honduras-es' });
  const r = await boot.services.golearn.rankLibrary(boot.user!.id, cands(), { limit: 10, signals: {} } as object) as Array<{ textId: string; extra?: Record<string, number> }>;
  return r;
};
const part = (r: Awaited<ReturnType<typeof rank>>, id: string) => r.find((x) => x.textId === idOf(id))!.extra!.usefulUnknown;

describe('bootstrap registers the corpus frequency source', () => {
  it('a served frequency.json decides usefulUnknown (the common lemma counts, the merely recurring rare one does not)', async () => {
    const log: string[] = [];
    serve({ '/dict/es/frequency.json': sidecar }, log);
    const r = await rank();
    expect(log).toContain('/dict/es/frequency.json');
    expect(part(r, 'a1')).toBeGreaterThan(0);
    for (const id of ['z1', 'm1', 'm2']) expect(part(r, id)).toBe(0);
  }, 60_000);

  it('with no sidecar the old in-shortlist rule runs', async () => {
    const log: string[] = [];
    serve({}, log);
    const r = await rank();
    expect(part(r, 'a1')).toBe(0);
    for (const id of ['z1', 'm1', 'm2']) expect(part(r, id)).toBeGreaterThan(0);
  }, 60_000);
});

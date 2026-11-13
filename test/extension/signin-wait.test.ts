// @vitest-environment node
/**
 * Signing in when the service is waking up or redeploying (the owner, 2026-11-12): GoReview gave up after 8 s and told the learner to check
 * "that the address is right". Now a sign-in waits 45 s, retries once on a quick failure or a 502/503/504, and what the learner reads never
 * names the service address or hints that where the app connects could be changed. Both apps' helpers behave the same.
 */
import { describe, expect, it } from 'vitest';
import * as golearn from '../../packages/golearn-extension/src/signin';
import * as goreview from '../../packages/goreview/app/signin';
import { createSessionManager } from '../../packages/golearn-extension/src/background/session';

type R = { ok: boolean; status?: number };

for (const [name, m] of [['GoLearn', golearn], ['GoReview', goreview]] as const) {
  describe(`${name}: one more try when the service is waking`, () => {
    const noPause = async (): Promise<void> => undefined;

    it('a 503 (or 502, 504) is tried once more, and the second answer is the one returned', async () => {
      for (const status of [502, 503, 504]) {
        const answers: R[] = [{ ok: false, status }, { ok: true, status: 201 }];
        let calls = 0;
        const r = await m.signInOnce(async () => answers[calls++]!, noPause);
        expect(r, String(status)).toEqual({ ok: true, status: 201 });
        expect(calls).toBe(2);
      }
    });

    it('a quick network failure is tried once more; a failure after the full wait is not (it would only double the wait)', async () => {
      let calls = 0;
      const quick = await m.signInOnce(async () => { calls++; if (calls === 1) throw new TypeError('Failed to fetch'); return { ok: true }; }, noPause);
      expect(quick).toEqual({ ok: true });
      expect(calls).toBe(2);

      let t = 0;
      calls = 0;
      await expect(m.signInOnce(async () => { calls++; t += 45_000; throw new DOMException('Request timed out', 'TimeoutError'); }, noPause, () => t)).rejects.toThrow('timed out');
      expect(calls).toBe(1);
    });

    it('a real answer is never repeated: a wrong password (401) or a refused email (409) comes back at once, and so does success', async () => {
      for (const first of [{ ok: false, status: 401 }, { ok: false, status: 409 }, { ok: true, status: 200 }] as R[]) {
        let calls = 0;
        const r = await m.signInOnce(async () => { calls++; return first; }, noPause);
        expect(r).toEqual(first);
        expect(calls).toBe(1);
      }
    });

    it('waits 45 s for a sign-in, and what it says names no address and suggests nothing about where the app connects', () => {
      expect(m.SIGN_IN_TIMEOUT_MS).toBe(45_000);
      for (const message of [m.UNREACHABLE_SIGN_IN, m.CANNOT_SIGN_IN]) {
        expect(message).not.toMatch(/https?:|address|onrender|running|server/i);
        expect(message).toMatch(new RegExp(`^${name}`));
      }
      expect(m.UNREACHABLE_SIGN_IN).toMatch(/internet connection and try again\.$/);
    });
  });
}

describe('GoLearn background: the sign-in requests carry the longer wait, the others keep the usual one', () => {
  it('POST /sessions asks for 45 s; an unusable built-in address is said without the address', async () => {
    const seen: Array<{ url: string; method: string; timeoutMs?: number }> = [];
    const store = new Map<string, unknown>();
    const area = {
      get: async (k?: string | string[] | null) => { if (k == null) return Object.fromEntries(store); const keys = Array.isArray(k) ? k : [k]; return Object.fromEntries(keys.filter((x) => store.has(x)).map((x) => [x, store.get(x)])); },
      set: async (o: Record<string, unknown>) => { for (const [k, v] of Object.entries(o)) store.set(k, v); },
      remove: async (k: string | string[]) => { for (const x of Array.isArray(k) ? k : [k]) store.delete(x); },
    };
    const fetchSpy = (async (input: RequestInfo | URL, init?: RequestInit & { timeoutMs?: number }) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      seen.push({ url, method: (init?.method ?? 'GET').toUpperCase(), timeoutMs: init?.timeoutMs });
      return new Response(JSON.stringify({ error: 'invalid-credentials', message: 'no' }), { status: 401, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const session = createSessionManager({ area: area as never, fetch: fetchSpy });
    const r = await session.connect({ baseUrl: 'https://repo.example', email: 'ana@example.org', password: 'x', deviceId: 'd1' });
    expect(r.ok).toBe(false);
    const post = seen.find((s) => s.method === 'POST' && s.url.endsWith('/sessions'));
    expect(post?.timeoutMs).toBe(45_000);

    const insecure = await session.connect({ baseUrl: 'http://repo.example', email: 'ana@example.org', password: 'x', deviceId: 'd1' });
    expect(insecure).toMatchObject({ ok: false, error: 'insecure-url', message: golearn.CANNOT_SIGN_IN });
  });
});

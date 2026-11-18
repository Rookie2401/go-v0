// An argument that crosses extension messaging (JSON) arrives as null where the caller passed undefined. GoReview inside the extension
// asked for the first page of candidates with an undefined cursor; it reached the API as null and went out as `after=null`, which the
// service refused (422 invalid-query), so GoReview built no card for any language there (found by the French session's real-browser run,
// 2026-11-18). A null query value is left out exactly as undefined is.
import { describe, expect, it } from 'vitest';
import { createRepositoryApi } from '../../../packages/repository-service/src/api';

function capture() {
  const urls: string[] = [];
  const fetch = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ candidates: [], vocabulary: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof globalThis.fetch;
  return { urls, api: createRepositoryApi({ baseUrl: 'http://service.test', fetch, token: 't' }) };
}

describe('the Repository API leaves null query values out', () => {
  it('a candidates call whose cursor arrived as null (JSON messaging) asks for the first page', async () => {
    const { urls, api } = capture();
    await (api.candidates as (...a: unknown[]) => Promise<unknown>)('e1', 200, null, ['readingRecognition'], null);
    expect(urls).toHaveLength(1);
    const url = new URL(urls[0]!);
    expect(url.pathname).toBe('/candidates');
    expect(url.searchParams.has('after')).toBe(false);
    expect(url.searchParams.has('varieties')).toBe(false);
    expect(url.searchParams.get('enrolmentId')).toBe('e1');
    expect(url.searchParams.get('limit')).toBe('200');
    expect(url.searchParams.get('objectives')).toBe('readingRecognition');
  });

  it('a real cursor is still sent', async () => {
    const { urls, api } = capture();
    await api.candidates('e1', 200, 'c-42');
    expect(new URL(urls[0]!).searchParams.get('after')).toBe('c-42');
  });
});

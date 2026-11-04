import { describe, expect, it } from 'vitest';
import { withRequestTimeout } from '../../packages/repository-service/src/requestTimeout';

describe('withRequestTimeout', () => {
  it('aborts a fetch that has not returned response headers by the deadline', async () => {
    let signal: AbortSignal | undefined;
    const stalled = ((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => signal?.addEventListener('abort', () => reject(signal?.reason), { once: true }));
    }) as typeof fetch;

    await expect(withRequestTimeout(stalled, 5)('https://repo.invalid/health'))
      .rejects.toMatchObject({ name: 'TimeoutError' });
    expect(signal?.aborted).toBe(true);
  });

  it('does not accept headers returned after a deadline by a fetcher that ignored abort', async () => {
    const ignoresAbort = (async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return new Response(new ReadableStream<Uint8Array>({ start() { /* stays open */ } }), { status: 200 });
    }) as typeof fetch;
    await expect(withRequestTimeout(ignoresAbort, 5)('https://repo.invalid/health'))
      .rejects.toMatchObject({ name: 'TimeoutError' });
  });
  it('keeps the deadline active until the returned response body is consumed', async () => {
    let signal: AbortSignal | undefined;
    const stalledBody = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Response(new ReadableStream<Uint8Array>({ start() { /* remains open until aborted */ } }), { status: 200 });
    }) as typeof fetch;

    const response = await withRequestTimeout(stalledBody, 5)('https://repo.invalid/health');
    await expect(response.text()).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(signal?.aborted).toBe(true);
  });

  it('forwards caller cancellation and tears down the wrapped body', async () => {
    let signal: AbortSignal | undefined;
    const stalled = ((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => signal?.addEventListener('abort', () => reject(signal?.reason), { once: true }));
    }) as typeof fetch;
    const caller = new AbortController();
    const pending = withRequestTimeout(stalled, 10_000)('https://repo.invalid/health', { signal: caller.signal });
    caller.abort(new DOMException('Caller stopped request', 'AbortError'));

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(signal?.aborted).toBe(true);
  });

  it('rejects immediately when the caller signal was already aborted before fetch starts', async () => {
    const caller = new AbortController();
    caller.abort(new DOMException('Caller stopped request', 'AbortError'));
    const fetcher = (async () => new Response('must not be returned')) as typeof fetch;
    await expect(withRequestTimeout(fetcher, 10_000)('https://repo.invalid/health', { signal: caller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
  });

  it('uses a Request input signal when init.signal is absent', async () => {
    let signal: AbortSignal | undefined;
    const stalled = ((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => signal?.addEventListener('abort', () => reject(signal?.reason), { once: true }));
    }) as typeof fetch;
    const caller = new AbortController();
    const request = new Request('https://repo.invalid/health', { signal: caller.signal });
    const pending = withRequestTimeout(stalled, 10_000)(request);
    caller.abort(new DOMException('Caller stopped request', 'AbortError'));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(signal?.aborted).toBe(true);
  });

  it('aborts a body when the caller cancels after headers but before consumption', async () => {
    let signal: AbortSignal | undefined;
    const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Response(new ReadableStream<Uint8Array>({ start() { /* caller abort will cancel this body */ } }), { status: 200 });
    }) as typeof fetch;
    const caller = new AbortController();
    const response = await withRequestTimeout(fetcher, 10_000)('https://repo.invalid/health', { signal: caller.signal });
    const body = response.text();
    caller.abort(new DOMException('Caller stopped request', 'AbortError'));
    await expect(body).rejects.toMatchObject({ name: 'AbortError' });
    expect(signal?.aborted).toBe(true);
  });

  it('preserves standard response metadata and allows a configured long-poll margin', async () => {
    const fetcher = (async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      const response = new Response('ok', { status: 200 });
      Object.defineProperties(response, {
        url: { configurable: true, value: 'https://repo.invalid/sync/wait' },
        redirected: { configurable: true, value: true },
      });
      return response;
    }) as typeof fetch;
    const response = await withRequestTimeout(fetcher, 40)('https://repo.invalid/sync/wait'); // scaled test: 20ms wait + margin
    expect(response.url).toBe('https://repo.invalid/sync/wait');
    expect(response.redirected).toBe(true);
    await expect(response.text()).resolves.toBe('ok');
  });

  it.each([
    ['HEAD', 200], ['GET', 204], ['GET', 205], ['GET', 304],
  ])('returns bodyless %s/%s responses unchanged and clears the deadline', async (method, status) => {
    let signal: AbortSignal | undefined;
    const original = {
      status, statusText: 'bodyless', headers: new Headers(), body: new ReadableStream<Uint8Array>(),
      url: 'https://repo.invalid/conditional', redirected: false, type: 'basic',
    } as unknown as Response;
    const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return original;
    }) as typeof fetch;
    const response = await withRequestTimeout(fetcher, 15)('https://repo.invalid/conditional', { method });
    expect(response).toBe(original);
    await new Promise(resolve => setTimeout(resolve, 25));
    expect(signal?.aborted).toBe(false);
  });
});

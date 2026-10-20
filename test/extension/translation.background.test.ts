import { afterEach, describe, expect, it } from 'vitest';
import { createBackground } from '../../packages/golearn-extension/src/background/core';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { createBridge } from '../../packages/golearn-extension/src/content/services';
import { LOCAL_TRANSLATION_LANGUAGES, localModelFor } from '../../packages/golearn-extension/src/translation/models';
import { createChromeFake, EXT_ID } from './chromeFake';

const ENDPOINT = 'http://127.0.0.1:8792/translate';
const LOOPBACK_PERMISSION = 'http://127.0.0.1:8792/*';
const TOKEN = 'a'.repeat(64);
const REQUEST = { type: MSG.translateSentence, explicitlyRequested: true, text: 'Unë po lexoj.', sourceLanguage: 'sq', targetLanguage: 'en' };
const CONTENT = { id: EXT_ID, tab: { id: 9 }, url: 'https://reader.example/book' };
const reply = (sourceLanguage = 'sq', text = 'I am reading.', overrides: Record<string, unknown> = {}) => {
  const model = localModelFor(sourceLanguage)!;
  return new Response(JSON.stringify({ text, model: model.id, revision: model.revision, sourceLanguage, targetLanguage: 'en', ...overrides }), { status: 200, headers: { 'content-type': 'application/json' } });
};
let bg: ReturnType<typeof createBackground> | undefined;

afterEach(() => { bg = undefined; });

describe('background local translation bridge', () => {
  it('loads private config only after explicit request, uses the fixed loopback endpoint, and never returns the token', async () => {
    const chrome = createChromeFake();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch: typeof globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith('/translation.local.json')) return new Response(JSON.stringify({ endpoint: ENDPOINT, token: TOKEN }), { status: 200 });
      if (url === ENDPOINT) return reply('sq');
      throw new Error('unexpected URL');
    }) as typeof fetch;
    bg = createBackground(chrome, { fetch });
    bg.register();
    chrome.grantOrigins([LOOPBACK_PERMISSION]);
    expect(calls).toHaveLength(0);

    const result = await createBridge(chrome.contentChrome(9)).translateSentence!({
      text: REQUEST.text, sourceLanguage: 'sq', targetLanguage: 'en', explicitlyRequested: true,
    });
    expect(result).toEqual({ ok: true, text: 'I am reading.', model: 'Helsinki-NLP/opus-mt-sq-en', revision: localModelFor('sq')!.revision, sourceLanguage: 'sq', targetLanguage: 'en' });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(calls.map((c) => c.url)).toEqual([`chrome-extension://${EXT_ID}/translation.local.json`, ENDPOINT]);
    expect(calls[1].init?.method).toBe('POST');
    expect(calls[1].init?.redirect).toBe('error');
    expect(calls[1].init?.credentials).toBe('omit');
    expect(calls[1].init?.cache).toBe('no-store');
    expect(new Headers(calls[1].init?.headers).get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ text: REQUEST.text, sourceLanguage: 'sq', targetLanguage: 'en' });
    const stored = JSON.stringify(await chrome.local.get(null));
    expect(stored).not.toContain(REQUEST.text);
    expect(stored).not.toContain('I am reading.');
    expect(stored).not.toContain(TOKEN);
  });

  it('returns unavailable when config is absent and rejects non-fixed endpoints', async () => {
    const chrome = createChromeFake();
    let postCount = 0;
    const fetch: typeof globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/translation.local.json')) return new Response('', { status: 404 });
      postCount++;
      return reply();
    }) as typeof fetch;
    bg = createBackground(chrome, { fetch }); bg.register();
    chrome.grantOrigins([LOOPBACK_PERMISSION]);
    expect(await chrome.dispatch(REQUEST, CONTENT)).toEqual({ ok: false, reason: 'not-configured' });
    expect(postCount).toBe(0);

    const chrome2 = createChromeFake();
    const fetch2: typeof globalThis.fetch = (async (input: RequestInfo | URL) => String(input).endsWith('/translation.local.json')
      ? new Response(JSON.stringify({ endpoint: 'https://attacker.example/translate', token: TOKEN }), { status: 200 })
      : (postCount++, reply())) as typeof fetch;
    bg = createBackground(chrome2, { fetch: fetch2 }); bg.register(); chrome2.grantOrigins([LOOPBACK_PERMISSION]);
    expect(await chrome2.dispatch(REQUEST, CONTENT)).toEqual({ ok: false, reason: 'not-configured' });
    expect(postCount).toBe(0);
  });

  it('fails safely without the fixed loopback host permission and does not even read the config', async () => {
    const chrome = createChromeFake();
    const calls: string[] = [];
    const fetch: typeof globalThis.fetch = (async (input: RequestInfo | URL) => { calls.push(String(input)); return reply(); }) as typeof fetch;
    bg = createBackground(chrome, { fetch }); bg.register();
    expect(await chrome.dispatch(REQUEST, CONTENT)).toEqual({ ok: false, reason: 'host-permission-unavailable' });
    expect(calls).toHaveLength(0);
  });

  it('requires a same-extension content sender, explicit request, and the supported language pair', async () => {
    const chrome = createChromeFake();
    const calls: string[] = [];
    const fetch: typeof globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ endpoint: ENDPOINT, token: TOKEN }), { status: 200 });
    }) as typeof fetch;
    bg = createBackground(chrome, { fetch }); bg.register();
    expect(await chrome.dispatch(REQUEST, { id: 'foreign', tab: { id: 9 }, url: 'https://reader.example' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await chrome.dispatch({ ...REQUEST, explicitlyRequested: false }, CONTENT)).toEqual({ ok: false, reason: 'invalid-request' });
    expect(await chrome.dispatch({ ...REQUEST, sourceLanguage: 'xx' }, CONTENT)).toEqual({ ok: false, reason: 'invalid-request' });
    expect(await chrome.dispatch({ ...REQUEST, text: 'x'.repeat(2_001) }, CONTENT)).toEqual({ ok: false, reason: 'invalid-request' });
    expect(calls).toHaveLength(0);
  });

  it('validates the service response and reports only a bounded natural result', async () => {
    const chrome = createChromeFake();
    const fetch: typeof globalThis.fetch = (async (input: RequestInfo | URL) => String(input).endsWith('/translation.local.json')
      ? new Response(JSON.stringify({ endpoint: ENDPOINT, token: TOKEN }), { status: 200 })
      : new Response(JSON.stringify({ text: 'something else', model: 'untrusted-model', revision: 'x' }), { status: 200 })) as typeof fetch;
    bg = createBackground(chrome, { fetch }); bg.register(); chrome.grantOrigins([LOOPBACK_PERMISSION]);
    expect(await chrome.dispatch(REQUEST, CONTENT)).toEqual({ ok: false, reason: 'service-error' });
  });

  it('sends every approved source code and binds each response to the pinned model and revision', async () => {
    const chrome = createChromeFake();
    const bodies: Array<Record<string, unknown>> = [];
    const fetch: typeof globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/translation.local.json')) return new Response(JSON.stringify({ endpoint: ENDPOINT, token: TOKEN }), { status: 200 });
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      return reply(String(body.sourceLanguage), `English for ${String(body.sourceLanguage)}`);
    }) as typeof fetch;
    bg = createBackground(chrome, { fetch }); bg.register(); chrome.grantOrigins([LOOPBACK_PERMISSION]);
    for (const sourceLanguage of LOCAL_TRANSLATION_LANGUAGES) {
      const result = await chrome.dispatch({ ...REQUEST, sourceLanguage, text: `fixture ${sourceLanguage}` }, CONTENT);
      const model = localModelFor(sourceLanguage)!;
      expect(result).toEqual({ ok: true, text: `English for ${sourceLanguage}`, model: model.id, revision: model.revision, sourceLanguage, targetLanguage: 'en' });
    }
    expect(bodies.map(({ sourceLanguage, targetLanguage }) => [sourceLanguage, targetLanguage])).toEqual(LOCAL_TRANSLATION_LANGUAGES.map((language) => [language, 'en']));
    expect(localModelFor('nb')?.id).toBe(localModelFor('nn')?.id);
    expect(localModelFor('nb')?.revision).toBe(localModelFor('nn')?.revision);
  });

  it('rejects a wrong pinned model, revision, or language echo for a valid language request', async () => {
    for (const overrides of [
      { model: 'Helsinki-NLP/opus-mt-xx-en' },
      { revision: 'latest' },
      { sourceLanguage: 'sq' },
      { targetLanguage: 'de' },
    ]) {
      const chrome = createChromeFake();
      const fetch: typeof globalThis.fetch = (async (input: RequestInfo | URL) => String(input).endsWith('/translation.local.json')
        ? new Response(JSON.stringify({ endpoint: ENDPOINT, token: TOKEN }), { status: 200 })
        : reply('hi', 'spoofed result', overrides)) as typeof fetch;
      bg = createBackground(chrome, { fetch }); bg.register(); chrome.grantOrigins([LOOPBACK_PERMISSION]);
      expect(await chrome.dispatch({ ...REQUEST, sourceLanguage: 'hi', targetLanguage: 'en' }, CONTENT)).toEqual({ ok: false, reason: 'service-error' });
    }
  });

  it('requires new-language responses to echo their source and pinned revision, while keeping the legacy sq reply compatible', async () => {
    for (const overrides of [{ sourceLanguage: undefined }, { revision: undefined }]) {
      const chrome = createChromeFake();
      const fetch: typeof globalThis.fetch = (async (input: RequestInfo | URL) => String(input).endsWith('/translation.local.json')
        ? new Response(JSON.stringify({ endpoint: ENDPOINT, token: TOKEN }), { status: 200 })
        : reply('hi', 'missing trusted metadata', overrides)) as typeof fetch;
      bg = createBackground(chrome, { fetch }); bg.register(); chrome.grantOrigins([LOOPBACK_PERMISSION]);
      expect(await chrome.dispatch({ ...REQUEST, sourceLanguage: 'hi' }, CONTENT)).toEqual({ ok: false, reason: 'service-error' });
    }

    const chrome = createChromeFake();
    const fetch: typeof globalThis.fetch = (async (input: RequestInfo | URL) => String(input).endsWith('/translation.local.json')
      ? new Response(JSON.stringify({ endpoint: ENDPOINT, token: TOKEN }), { status: 200 })
      : reply('sq', 'legacy compatible', { sourceLanguage: undefined, revision: undefined })) as typeof fetch;
    bg = createBackground(chrome, { fetch }); bg.register(); chrome.grantOrigins([LOOPBACK_PERMISSION]);
    expect(await chrome.dispatch(REQUEST, CONTENT)).toMatchObject({ ok: true, text: 'legacy compatible', sourceLanguage: 'sq' });
  });
});

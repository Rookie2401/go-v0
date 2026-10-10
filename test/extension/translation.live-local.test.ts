import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBackground } from '../../packages/golearn-extension/src/background/core';
import { createBridge } from '../../packages/golearn-extension/src/content/services';
import { createTranslationEngine } from '../../packages/golearn-extension/src/translation/provider';
import { createLocalAlbanianTranslationProvider } from '../../packages/golearn-extension/src/translation/localProvider';
import { createChromeFake } from './chromeFake';

/** Explicit live opt-in: uses only a user-supplied title and generated text, with a local model. */
describe.skipIf(process.env.GO_LOCAL_TRANSLATION_LIVE !== '1')('real local model through the extension bridge', () => {
  it('translates via a privileged worker without persisting the source, output or token', async () => {
    const id = 'ckjmiefophlhjlobnidnclkiimbjalfo';
    const origin = `chrome-extension://${id}`;
    const configPath = path.resolve('data/translation.local/extension-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { endpoint: string; token: string };
    const chrome = createChromeFake();
    chrome.runtime.id = id;
    chrome.runtime.getURL = (file) => `${origin}/${file}`;
    chrome.grantOrigins(['http://127.0.0.1:8792/*']);
    const requests: string[] = [];
    const liveFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push(url);
      if (url === `${origin}/translation.local.json`) return new Response(JSON.stringify(config));
      if (url !== config.endpoint) throw new Error('Unexpected network destination.');
      return fetch(input, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), Origin: origin } });
    };
    const background = createBackground(chrome, { fetch: liveFetch });
    background.register();
    const bridge = createBridge({ runtime: { ...chrome.runtime, sendMessage: (message) => chrome.dispatch(message, { id, tab: { id: 7 }, url: 'http://127.0.0.1/test' }) } });
    const engine = createTranslationEngine({ providers: [createLocalAlbanianTranslationProvider((r) => bridge.translateSentence!(r))] });
    const sentence = 'Sokrat i vuejtun apo derr i kënaqun?';
    const request = { text: sentence, sourceLanguage: { languageId: 'sq', dialectId: 'aln', source: 'user' as const }, targetLanguage: { languageId: 'en', source: 'user' as const }, explicitlyRequested: false };
    await engine.translate(request);
    expect(requests).toHaveLength(0);
    const result = await engine.translate({ ...request, explicitlyRequested: true });
    expect(result.status).toBe('translated');
    if (result.status !== 'translated') throw new Error('The local model did not answer.');
    expect(result.text.length).toBeGreaterThan(10);
    expect(result.sourceLanguage.uncertaintyNotes?.join(' ')).toContain('vuejtun → vuajtur');
    expect(new Set(requests)).toEqual(new Set([`${origin}/translation.local.json`, config.endpoint]));
    const stored = JSON.stringify(await chrome.local.get(null));
    expect(stored).not.toContain(sentence);
    expect(stored).not.toContain(result.text);
    expect(stored).not.toContain(config.token);
  }, 60_000);
});

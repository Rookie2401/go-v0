/**
 * Loading an analyser from its prebuilt chunk, `analysers/<id>.js`, by a dynamic import of a URL. This is how the content script
 * (a single classic script, which cannot be split) and the extension's setup page (a classic script too) get the languages they
 * do not carry: the manifest lists `analysers/*.js` under `web_accessible_resources`. Where there is no `chrome.runtime`
 * (the harness pages), the chunk is read from the `dist/analysers/` folder the harness is served beside.
 *
 * Idempotent; a load in flight is shared; a failed import rejects and is not remembered, so the next lookup tries again.
 */
import type { LanguageAdapter } from '../../../../src/core';
import { hasAnalyser, registerAnalyser, type AnalyserExtras } from '../parser/registry';

/** The part of the extension API this needs. */
export interface UrlLoaderApi { runtime: { getURL?(path: string): string } }

/** Where an analyser chunk is read from: the extension's own file, or (no `chrome.runtime`: a harness page) `/dist/analysers/<id>.js` on the page's origin. */
export function analyserUrl(chromeApi: UrlLoaderApi | undefined, base: string | undefined, languageId: string): string {
  return chromeApi?.runtime.getURL
    ? chromeApi.runtime.getURL(`analysers/${languageId}.js`)
    : new URL(`/dist/analysers/${languageId}.js`, base).href;
}

export function createAnalyserLoader(chromeApi: UrlLoaderApi | undefined, base: string | undefined = typeof location === 'undefined' ? undefined : location.href): (languageId: string) => Promise<void> {
  const inflight = new Map<string, Promise<void>>();
  const urlOf = (id: string): string => analyserUrl(chromeApi, base, id);
  return (languageId) => {
    if (hasAnalyser(languageId)) return Promise.resolve();
    let p = inflight.get(languageId);
    if (!p) {
      p = (async () => {
        const mod = (await import(/* @vite-ignore */ urlOf(languageId))) as { adapter?: LanguageAdapter; createShardLoader?: AnalyserExtras['createShardLoader'] };
        if (!mod.adapter) throw new Error(`the ${languageId} analyser chunk has no adapter`);
        registerAnalyser(languageId, mod.adapter, mod.createShardLoader ? { createShardLoader: mod.createShardLoader } : undefined);
      })().finally(() => { inflight.delete(languageId); });
      inflight.set(languageId, p);
    }
    return p;
  };
}

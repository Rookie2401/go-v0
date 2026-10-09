/**
 * Regression for the first real-browser run (2026-10-08): an ordinary Chrome page exposes `window.chrome` (csi,
 * loadTimes, …) without the extension APIs; the content script must treat that as "no extension API" and fall back to
 * the in-memory store instead of throwing on `chrome.storage.local`.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { getChrome } from '../../packages/golearn-extension/src/platform';

const g = globalThis as { chrome?: unknown };

describe('getChrome', () => {
  afterEach(() => { delete g.chrome; });

  it('returns undefined when there is no chrome object', () => {
    delete g.chrome;
    expect(getChrome()).toBeUndefined();
  });

  it('returns undefined for the page-side chrome object of an ordinary Chrome tab', () => {
    g.chrome = { csi() { return {}; }, loadTimes() { return {}; } };
    expect(getChrome()).toBeUndefined();
  });

  it('returns undefined when storage exists but runtime messaging does not', () => {
    g.chrome = { storage: { local: {} }, runtime: {} };
    expect(getChrome()).toBeUndefined();
  });

  it('returns the api when storage.local and runtime.onMessage are present', () => {
    const api = { storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } }, runtime: { onMessage: { addListener() {}, removeListener() {} }, sendMessage: async () => undefined } };
    g.chrome = api;
    expect(getChrome()).toBe(api);
  });
});

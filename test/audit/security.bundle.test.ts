// @vitest-environment node
/**
 * Security audit (5) extension privilege boundary, the BUILT files: what each bundle can do is read off its text. Skipped
 * for the bundles when packages/golearn-extension/dist is absent (run `npm run ext:build`); the manifest source checks
 * always run. A browser is needed to prove the Chrome side (storage access levels, real isolated worlds): see SECURITY.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const base = path.resolve(__dirname, '../../packages/golearn-extension');
const dist = path.join(base, 'dist');
const have = fs.existsSync(path.join(dist, 'content.js')) && fs.existsSync(path.join(dist, 'background.js')) && fs.existsSync(path.join(dist, 'action/popup.js'));
const read = (f: string): string => fs.readFileSync(path.join(dist, f), 'utf8');
// These literals identify an SVG namespace and the required OSHB data credit; neither is a service endpoint.
const withoutIdentifiers = (code: string): string => code
  .replaceAll('http://www.w3.org/2000/svg', '')
  .replaceAll('https://github.com/openscriptures/morphhb', '');

const NETWORK = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|navigator\.connection|\.connect\(\s*['"`]?(?:http|ws)/;
const WEB_STORAGE = /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|document\.cookie|\bcaches\.(open|match)|openDatabase/;
// The background worker alone may use IndexedDB: since 2026-11-10 (278ed67f, f19034ab) the device Repository is kept there, in the extension's own
// origin (databases golearn-repository and golearn-repository-kv; docs/ecosystem/LOADING-ARCHITECTURE-2026-11-10.md). Every other web storage stays
// forbidden to it, and the content script and the popup may still use none at all.
const WORKER_STORAGE = /\blocalStorage\b|\bsessionStorage\b|document\.cookie|\bcaches\.(open|match)|openDatabase/;
const EXT_STORAGE = /chrome\.storage|browser\.storage|\.storage\.(local|session|sync|managed)\b/;
const DYNAMIC_CODE = /\beval\s*\(|new Function\s*\(|setTimeout\s*\(\s*['"`]|setInterval\s*\(\s*['"`]|document\.write|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|createContextualFragment|setHTMLUnsafe|srcdoc/;
const CREDENTIAL = /Authorization|Bearer|\bapiKey\b|\.password\b|`golearn:session`|"golearn:session"|'golearn:session'|createSession|syncPush|syncPull|deleteSession|\/sessions\b|\/sync\//;
const PAGE_CHANNELS = /window\.postMessage|\.postMessage\(|addEventListener\(\s*[`'"]message[`'"]|BroadcastChannel|window\.name|window\.open|location\.(href|assign|replace)\s*=|document\.domain/;
// unlimitedStorage is not in this list: it only lifts the quota of the extension's OWN storage (the on-device Repository and the dictionary cache, added 2026-10-17) and reaches no other tab, site or browser store.
const FORBIDDEN_PERMISSIONS = ['tabs', 'cookies', 'webRequest', 'webRequestBlocking', 'webNavigation', 'history', 'bookmarks', 'downloads', 'clipboardRead', 'clipboardWrite', 'nativeMessaging', 'debugger', 'management', 'proxy', 'declarativeNetRequest', 'identity', 'geolocation', 'background', 'privacy', 'system.storage', 'topSites', '<all_urls>', '*://*/*', 'http://*/*', 'https://*/*'];

describe('manifest (source)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8'));

  it('asks for exactly six permissions, no host access, nothing that reaches other tabs, cookies, history, the network layer or other extensions', () => {
    expect(manifest.manifest_version).toBe(3);
    // unlimitedStorage (2026-10-17): the on-device Repository and the dictionary cache outgrow the default quota; it reaches no other tab or site
    expect(manifest.permissions).toEqual(['activeTab', 'scripting', 'storage', 'unlimitedStorage', 'contextMenus', 'alarms']);
    for (const p of FORBIDDEN_PERMISSIONS) expect(manifest.permissions ?? [], p).not.toContain(p);
    for (const key of ['host_permissions', 'optional_permissions']) expect(manifest[key], key).toBeUndefined();
    // GoLearn Active (2026-10-09): the one optional host permission, never granted at install; the popup asks the browser inside the learner's click
    // and the learner can withdraw it (test/extension/active.background.test.ts, active.popup.test.ts)
    expect(manifest.optional_host_permissions).toEqual(['https://*/*', 'http://*/*']);
  });

  it('declares no automatic injection, no external connections, no page-visible resources, no weakened CSP, no remote update', () => {
    for (const key of ['content_scripts', 'externally_connectable', 'content_security_policy', 'update_url', 'key', 'sandbox', 'declarative_net_request', 'devtools_page', 'chrome_url_overrides', 'incognito', 'oauth2', 'omnibox', 'nacl_modules', 'storage', 'file_browser_handlers', 'browser_specific_settings']) {
      expect(manifest[key], key).toBeUndefined();
    }
    // the page-visible resources: the analyser chunks the content script imports on demand (German, Hindi, Thai, Spanish, Latin, Hebrew, Greek) and,
    // since 2026-10-22, the sharded Hebrew and Greek form indexes under lexicon/ (gzip JSON built from Open Scriptures, MorphGNT and Wiktionary tables:
    // public dictionary data, no code, no learner data) that the content script fetches through chrome.runtime.getURL before a lookup. They are
    // readable by any page because the script is injected, per gesture, on any reading site; both expose the extension's presence and nothing else.
    expect(manifest.web_accessible_resources).toEqual([{ resources: ['analysers/*.js', 'lexicon/*'], matches: ['<all_urls>'] }]);
    const { web_accessible_resources: _exposed, ...rest } = manifest;
    expect(JSON.stringify(rest)).not.toMatch(/unsafe-eval|unsafe-inline|<all_urls>|\*:\/\//);
  });

  it('is a service-worker extension (no persistent background page) whose only commands and menus are user gestures', () => {
    expect(manifest.background).toEqual({ service_worker: 'background.js' });
    expect(Object.keys(manifest.commands ?? {})).toEqual(['lookup-selection']);
    expect(manifest.action.default_popup).toBe('action/popup.html');
  });
});

describe.skipIf(!have)('the built extension', () => {
  it('the manifest copied into dist is the source manifest', () => {
    expect(JSON.parse(read('manifest.json'))).toEqual(JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8')));
  });

  it('the content script can do nothing but run in the page and send messages: no network, no web storage, no extension storage, no credential, no dynamic code, no page channel', () => {
    const code = read('content.js');
    // its only fetches are the extension's own packaged files (analyser chunks, lexicon shards) by chrome.runtime.getURL, through an injected fetcher
    // (lexicon/prepare.ts); the regexes below hold because no bundle code calls fetch() by name and no address is named
    expect(code).not.toMatch(NETWORK);
    expect(code).toMatch(/runtime.getURL/);
    expect(code).not.toMatch(WEB_STORAGE);
    expect(code).not.toMatch(EXT_STORAGE);
    expect(code).not.toMatch(CREDENTIAL);
    expect(code).not.toMatch(DYNAMIC_CODE);
    expect(code).not.toMatch(PAGE_CHANNELS);
    expect(code).not.toMatch(/chrome\.(tabs|scripting|cookies|downloads|history|webRequest|management|identity)/);
    // no address to call: the SVG namespace (popup/card.ts speakerIcon) and the OSHB credit are identifiers, removed before the check.
    expect(withoutIdentifiers(code)).not.toMatch(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(code).not.toMatch(/console\.(log|info|debug|warn|error|trace)/); // nothing is logged, so nothing sensitive can be
  });

  it('the action popup is a pure view: no network, no web storage, no credential, no dynamic code', () => {
    const code = read('action/popup.js');
    expect(code).not.toMatch(NETWORK);
    expect(code).not.toMatch(WEB_STORAGE);
    expect(code).not.toMatch(DYNAMIC_CODE);
    expect(code).not.toMatch(/Authorization|Bearer|createSession|syncPush|syncPull/);
    expect(code).not.toMatch(/console\./);
  });

  it('the background worker is the only bundle with a network call, uses no XHR/beacon/socket, no dynamic code, logs nothing, and names no service address', () => {
    const code = read('background.js');
    expect(code).toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
    expect(code).not.toMatch(DYNAMIC_CODE);
    expect(code).not.toMatch(WORKER_STORAGE);
    expect(code).not.toMatch(/console\./);
    expect(withoutIdentifiers(code)).not.toMatch(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(code).toMatch(/not-your-data/); // the service's handler runs in the worker for the device-local Repository (no network; see REPOSITORY-LOCAL.md); the other scripts have the stub
    for (const f of ['content.js', 'action/popup.js']) expect(read(f), f).not.toMatch(/not-your-data|invalid-json|too-many-attempts/);
  });

  it('the setup page (an extension page, trusted) has no dynamic code and no XHR/beacon/socket/eval', () => {
    if (!fs.existsSync(path.join(dist, 'app/app.js'))) return;
    const code = read('app/app.js');
    expect(code).not.toMatch(/XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
    expect(code).not.toMatch(DYNAMIC_CODE);
    expect(code).not.toMatch(/console\.(log|info|debug)/);
  });

  it('no bundle carries a secret-looking literal (keys, tokens, passwords, private keys)', () => {
    for (const f of ['content.js', 'background.js', 'action/popup.js']) {
      const code = read(f);
      expect(code, f).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
      expect(code, f).not.toMatch(/\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{10,}/);
      expect(code, f).not.toMatch(/AKIA[0-9A-Z]{16}/);
      expect(code, f).not.toMatch(/eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\./); // a JWT
      expect(code, f).not.toMatch(/[?&](key|token|apikey|api_key|access_token)=[A-Za-z0-9_-]{8,}/i);
    }
  });

  it('the pages\' HTML load only their own scripts: no inline script, no remote script or frame, no inline event handler', () => {
    for (const f of ['action/popup.html', 'app/index.html']) {
      if (!fs.existsSync(path.join(dist, f))) continue;
      const html = read(f);
      expect(html, f).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i); // an inline script with content
      expect(html, f).not.toMatch(/<(script|link|iframe|img|embed|object)[^>]*\b(src|href|data)=["']?(https?:)?\/\//i);
      expect(html, f).not.toMatch(/\son[a-z]+\s*=/i);
      expect(html, f).not.toMatch(/javascript:/i);
    }
  });
});

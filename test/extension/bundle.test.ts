// @vitest-environment jsdom
/**
 * Smoke test of the BUILT files (run `npm run ext:build` first; skipped when dist/ is absent). The scripts are
 * evaluated as classic scripts in jsdom, the way the browser runs them: the background worker first, then the content
 * script, which is made to do a real lookup whose events the background records.
 *
 * The security properties of the bundles are checked on the text of the files:
 *   content.js    no network call of any kind, no storage, no token key, no service address
 *   popup.js      no network call
 *   background.js the only file with a network call (the API client and the dictionary fetch), no eval, no URL
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createChromeFake } from './chromeFake';
import { flush, selectText, setBody, stubLayout } from './dom';
import { MSG } from '../../packages/golearn-extension/src/platform';

const dist = path.resolve(__dirname, '../../packages/golearn-extension/dist');
const have = fs.existsSync(path.join(dist, 'content.js')) && fs.existsSync(path.join(dist, 'background.js'));
const read = (f: string): string => fs.readFileSync(path.join(dist, f), 'utf8');

const KB = 1024;
/** Every file under a folder, relative, with its size. */
const sizesIn = (dir: string, rel = ''): Array<{ file: string; bytes: number }> =>
  fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sizesIn(dir, path.posix.join(rel, e.name)) : [{ file: path.posix.join(rel, e.name), bytes: fs.statSync(path.join(dir, rel, e.name)).size }]));

describe.skipIf(!have)('the built extension', () => {
  it('keeps bounded bundles with Hindi available for on-device Repository analysis', () => {
    const sizes = new Map(sizesIn(dist).filter((f) => /\.js$/.test(f.file)).map((f) => [f.file, f.bytes]));
    const table = [...sizes].map(([f, b]) => `  ${f.padEnd(34)} ${(b / KB).toFixed(1).padStart(8)} KB`).join('\n');
    // eslint-disable-next-line no-console
    console.info(`[bundle] dist/ JavaScript, minified:\n${table}`);
    expect(sizes.get('content.js')!, 'content.js').toBeLessThanOrEqual(520 * KB);
    // Hindi reading must resolve in the offline Repository too. Its real analyser adds
    // about 460 KB to the former Albanian-only worker; classic workers cannot import
    // the page's analyser chunk. Keep an explicit ceiling rather than dropping analysis.
    // 2026-10-20: 1,050 -> 1,100 KB for the speech proxy client, the GoListen device registry and the encounter recorder
    // (background.js measured 1,078 KB when that work was committed).
    expect(sizes.get('background.js')!, 'background.js').toBeLessThanOrEqual(1100 * KB);
    if (sizes.has('app/app.js')) expect(sizes.get('app/app.js')!, 'app/app.js').toBeLessThanOrEqual(650 * KB);
    for (const id of ['sq', 'es', 'de', 'hi', 'th', 'nb', 'nn']) expect(sizes.has(`analysers/${id}.js`), `analysers/${id}.js`).toBe(true);
  });

  it('each analyser chunk is an ES module that exports the adapter, and the manifest makes the chunks readable from the page', () => {
    for (const id of ['sq', 'es', 'de', 'hi', 'th', 'nb', 'nn']) {
      const code = read(`analysers/${id}.js`);
      expect(code, id).toMatch(/\bexport\s*\{[^}]*\bas adapter\b[^}]*\}|\bexport\s*\{\s*adapter\b/);
      expect(code, id).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|StoredSourceRef|importScripts/);
      expect(code, id).not.toMatch(/\beval\s*\(|new Function\s*\(/);
    }
    const m = JSON.parse(read('manifest.json'));
    expect(m.web_accessible_resources).toEqual([{ resources: ['analysers/*.js'], matches: ['<all_urls>'] }]);
    // every shared chunk the analysers import sits in analysers/ too, so the one pattern covers it
    for (const id of ['sq', 'es', 'de', 'hi', 'th', 'nb', 'nn']) for (const [, spec] of read(`analysers/${id}.js`).matchAll(/from\s*"(\.[^"]+)"/g)) expect(spec, id).toMatch(/^\.\/[^/]+\.js$/);
  });

  it('keeps Hindi out of the content script and unrelated analysers out of both scripts', () => {
    for (const f of ['content.js', 'background.js']) {
      const code = read(f);
      expect(code, f).not.toContain('adapter-de@');
      expect(code, f).not.toContain('adapter-th@');
      expect(code, f).not.toContain('Reference realisation of East Norwegian speech'); // the Norwegian engine (its ids are built at run time, so a literal from its text is checked)
    }
    expect(read('content.js')).not.toContain('adapter-hi@');
    expect(read('background.js')).toContain('adapter-hi@');
    expect(read('analysers/de.js')).toContain('adapter-de@');
    // Bokmål and Nynorsk share one engine, so the chunk that holds it (imported by both nb.js and nn.js) is the only place its text appears
    const shared = fs.readdirSync(path.join(dist, 'analysers')).filter((n) => /^shared-.*\.js$/.test(n)).map((n) => read(`analysers/${n}`)).join('\n');
    expect(shared).toContain('Reference realisation of East Norwegian speech');
    expect(read('analysers/nb.js').length + read('analysers/nn.js').length, 'nb.js and nn.js are thin entries over the shared engine').toBeLessThan(2048);
  });

  it('has the files the manifest names, and the manifest copied is the source manifest', () => {
    const m = JSON.parse(read('manifest.json'));
    // unlimitedStorage (2026-10-16): the device event log (GoLearn Active records every page scan) outgrew chrome.storage.local's
    // default 10 MB; a full store refused every new write (level presses) while duplicate lookups still 'succeeded'
    expect(m.permissions).toEqual(['activeTab', 'scripting', 'storage', 'unlimitedStorage', 'contextMenus', 'alarms']);
    expect(m.host_permissions).toBeUndefined();
    expect(m.options_page).toBe('app/index.html');
    expect(fs.existsSync(path.join(dist, m.background.service_worker))).toBe(true);
    expect(fs.existsSync(path.join(dist, m.action.default_popup))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'content.js'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'action/popup.js'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../packages/golearn-extension/manifest.json'), 'utf8'))).toEqual(m);
    // the setup page is built by its own config (packages/golearn-extension/app); when it has been built it is where the manifest says
    if (fs.existsSync(path.join(dist, 'app'))) expect(fs.existsSync(path.join(dist, m.options_page))).toBe(true);
  });

  it('the scripts are self-contained classic scripts: no module syntax, no eval, no hard-wired URL', () => {
    for (const f of ['content.js', 'background.js', 'action/popup.js']) {
      const code = read(f);
      expect(code, f).not.toMatch(/^\s*(import|export)\s/m);
      expect(code, f).not.toMatch(/\beval\s*\(|new Function\s*\(/);
      expect(code, f).not.toMatch(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i); // no address the code could call: the service is configured by the learner
    }
  });

  it('the production scripts have no fixture hook: neither the attribute name nor the harness flag is in them (the hook is compiled only into the harness build)', () => {
    for (const f of ['content.js', 'background.js', 'action/popup.js', ...fs.readdirSync(path.join(dist, 'analysers')).filter((n) => n.endsWith('.js')).map((n) => `analysers/${n}`)]) {
      const code = read(f);
      expect(code, f).not.toContain('data-fixture-url');
      expect(code, f).not.toContain('__GOLEARN_HARNESS__');
      expect(code, f).not.toMatch(/fixture-url/);
    }
    // the harness build is the same script with the hook compiled in, and it is not part of what the manifest names
    if (fs.existsSync(path.join(dist, 'content.harness.js'))) {
      const harness = read('content.harness.js');
      expect(harness).toContain('data-fixture-url');
      expect(harness).not.toContain('__GOLEARN_HARNESS__'); // the build's define replaced the flag with true
      expect(JSON.stringify(JSON.parse(read('manifest.json')))).not.toContain('content.harness');
    }
  });

  it('the content script and the popup contain no network call at all', () => {
    for (const f of ['content.js', 'action/popup.js']) {
      const code = read(f);
      expect(code, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|StoredSourceRef|importScripts|navigator\.connection/);
    }
  });

  it('the content script holds no token key, no storage and no service address', () => {
    // the contract's address check reads `url.username || url.password` (an address without credentials); that is not a password held by this script
    const code = read('content.js').replace(/\w+\.username\|\|\w+\.password/g, '');
    expect(code).not.toMatch(/`golearn:(session|service)`|Authorization|Bearer|\bapiKey\b|\.password\b/);
    expect(code).not.toMatch(/storage\.(local|session|sync)|chrome\.storage|\.storage\b/);
    expect(code).not.toMatch(/createSession|syncPush|syncPull|deleteSession|\/sessions|\/sync\//);
  });

  it('the background is the only bundle that can reach a network, and it does so through one fetch', () => {
    const code = read('background.js');
    expect(code).not.toMatch(/XMLHttpRequest|sendBeacon|WebSocket|StoredSourceRef|importScripts/);
    expect(code).toMatch(/\bfetch\s*\(/);
    // the service's request handler IS in the worker since the device-local Repository (packages/repository-local) runs it in-process; the other scripts have the stub
    expect(code).toMatch(/not-your-data/);
    for (const f of ['content.js', 'action/popup.js']) expect(read(f), f).not.toMatch(/not-your-data|invalid-json|too-many-attempts/);
  });

  it('background and content script, evaluated as the browser would, perform a lookup end to end: the background records it', async () => {
    const restore = stubLayout();
    setBody('<p id="p">Unë po lexoj një libër të bukur në shtëpinë time.</p>');
    const fake = createChromeFake();
    const g = globalThis as { chrome?: unknown };
    g.chrome = fake; // the worker's global
    (0, eval)(read('background.js'));
    await flush(10);
    expect(fake.events.onMessage.listeners.size).toBe(1);
    expect(fake.alarmsCreated.map((a) => a.name)).toContain('golearn-sync');

    const content = fake.contentChrome();
    g.chrome = content; // the page's global: messaging only
    delete (globalThis as Record<string, unknown>).__goLearnExtension;
    (0, eval)(read('content.js'));
    await flush(20);
    expect(fake.tabListeners.size).toBe(1);
    selectText(document.getElementById('p')!, 'shtëpinë');
    const reply = await fake.tabs!.sendMessage(7, { type: MSG.lookup, trigger: 'command' });
    expect(reply).toEqual({ ok: true, status: 'shown' });
    expect(document.querySelectorAll('[data-golearn-host]')).toHaveLength(1);
    const stored = await fake.local.get(null);
    const kinds = Object.entries(stored).filter(([k]) => k.startsWith('golearn:event:')).map(([, v]) => (v as { kind: string }).kind).sort();
    expect(kinds).toEqual(['AnalysisShown', 'SelectionLookedUp']);
    expect(Object.keys(stored).filter((k) => k.startsWith('golearn:metric:'))).toHaveLength(1);
    // not signed in: the events carry a local pseudonymous learner, never a placeholder and never an account
    const sel = Object.values(stored).find((v) => (v as { kind?: string })?.kind === 'SelectionLookedUp') as { learnerId: string; enrolmentId: string };
    expect(sel.learnerId).toMatch(/^local:dev-/);
    expect(sel.enrolmentId).toBe('local-enrolment:sq');
    expect(Object.keys(stored)).not.toContain('golearn:session');

    (0, eval)(read('content.js')); // a second injection
    expect(fake.tabListeners.size).toBe(1);
    g.chrome = undefined;
    document.querySelector('[data-golearn-host]')?.remove();
    restore();
  });
});

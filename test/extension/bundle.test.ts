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
  it('keeps bounded bundles with Hindi available for on-device Repository analysis (Biblical Aramaic stays in its analyser chunk)', () => {
    // The worker links src/background/arcStub.ts, not the Aramaic corpus seed (vite.config.ts leanAramaic): it would add about 200 KB.
    expect(fs.readFileSync(path.join(dist, 'background.js'), 'utf8')).not.toContain('מַלְכָּא');
    const sizes = new Map(sizesIn(dist).filter((f) => /\.js$/.test(f.file)).map((f) => [f.file, f.bytes]));
    const table = [...sizes].map(([f, b]) => `  ${f.padEnd(34)} ${(b / KB).toFixed(1).padStart(8)} KB`).join('\n');
    // eslint-disable-next-line no-console
    console.info(`[bundle] dist/ JavaScript, minified:\n${table}`);
    // 2026-11-08: 520 -> 560 KB; master's build already measured 528 KB (the card's word-analysis and verb work since the last fit),
    // and the orphaned-script guard adds 0.2 KB. A ceiling, not a target.
    // 2026-11-13: 560 -> 564 KB; the Greek sentence splitter now keeps an abbreviation's full stop inside the sentence (π.χ., δηλ.:
    // src/adapters/greek/abbreviations.ts, ~3 KB, merge dcffa49e), and the content script splits sentences; the build measured 560.3 KB.
    // 2026-11-17: 564 -> 580 KB for Reading Analysis (docs/ecosystem/READING-ANALYSIS.md): the page reads its whole text, names and counts its words and
    // runs the analysis (src/reading/{extract,lexical,session,coverage}.ts), and needs the variety registry to know which languages must state a
    // variety. content.js measured 575.5 KB (589,359 bytes; 560.3 KB before).
    // 2026-11-18: 580 -> 585 KB for Russian: Cyrillic is shared by several languages, so the content script now tells Russian from Ukrainian,
    // Belarusian, Bulgarian and Serbian text (language/cyrillic.ts, the Cyrillic branches of language/resolve.ts and active/pageLanguages.ts)
    // and loads the Russian form index's shards before a lookup (russian/shards.ts with its text helpers). content.js measured 581.4 KB
    // (575.5 KB on master 22be2d7e, which this branch has merged in).
    // 2026-11-25 (Arabic pack): 585 -> 599 KB (fix batch 1: 605 -> 599 once the root came with the reading and the content script stopped linking the form index). The Arabic script is shared by Persian, Urdu, Pashto, Kurdish and Uyghur, so the content script tells Arabic
    // from them by the printed letters and the commonest Arabic function words (language/arabic.ts, the Arabic branches of language/resolve.ts and
    // active/pageLanguages.ts, with arabic/text.ts for the letters) and loads the Arabic form index's shards before a lookup (arabic/shards.ts with its
    // clitic rules). Measured by `npm run ext:build`: content.js 612,501 bytes = 598.1 KB (597,766 bytes = 583.8 KB at the same tree without the pack; 618,659 before the fix).
    expect(sizes.get('content.js')!, 'content.js').toBeLessThanOrEqual(599 * KB);
    // Hindi reading must resolve in the offline Repository too. Its real analyser adds
    // about 460 KB to the former Albanian-only worker; classic workers cannot import
    // the page's analyser chunk. Keep an explicit ceiling rather than dropping analysis.
    // 2026-10-20: 1,050 -> 1,100 KB for the speech proxy client, the GoListen device registry and the encounter recorder
    // (background.js measured 1,078 KB when that work was committed).
    // 2026-11-10: 1,100 -> 1,180 KB for the device Repository's IndexedDB store, its one-time verified migration and the split store
    // (background.js measured 1,131 KB; in exchange the worker's cold open of a 12,000-event history goes from 3.4 s to about 1 ms).
    // 2026-11-17: 1,180 -> 1,190 KB for language varieties (6aa02507): the device's own Repository runs the same projection as the service, so
    // the worker now carries the variety registry and rules (repository-contract/src/varieties.ts), the per-variety fold (projection@8), the
    // scoped candidates and the variety a reader's events record. background.js measured 1,181.2 KB (1,209,578 bytes; 1,200,438 before).
    // 2026-11-17: 1,190 -> 1,200 KB for Reading Analysis: the worker's verified knowledge lookup (src/background/reading.ts, src/reading/classify.ts), and
    // what keeps the device's Repository level with the account (localRepo catchUp, the accounts a device has taken in, a pull that knows whether it
    // reached the account's head, remembers the events it could not store and carries out the account's deletions: repository-local/src/transfer.ts).
    // background.js measured 1,195.8 KB (1,224,510 bytes; 1,181.2 KB before).
    // 2026-11-18: 1,200 -> 1,230 KB for the Russian pack: every pack's manifest and orientation tutorial is in the worker (it answers the card's
    // "explain" from them), and Russian's has thirteen features and twenty-six sentence patterns with their explanations (14 KB), twenty-eight
    // validation cases and the tutorial; plus the Russian voice registry. background.js measured 1,225.4 KB (1,195.8 KB on master
    // 22be2d7e, which this branch has merged in).
    // 2026-11-19 (French pack, after merging master 22be2d7e): 1,200 -> 1,240 KB. French adds the text the worker serves to the card and the
    // setup page: the pack manifest with its ten feature explanations and honest limits (about 9 KB), the 43 construction explanations the
    // card's "why this form" asks the worker for (about 14 KB), and the orientation, which the catalogue reaches like every other language's
    // (about 12 KB). Measured 1,263,600 bytes = 1,234.0 KB on the merged tree (1,195.8 KB on 22be2d7e). No French analyser, word list or
    // lemma list is in the worker.
    // 2026-11-19 (release/ru-fr, both packs on master 3d92b264): 1,240 -> 1,270 KB. background.js measured 1,291,753 bytes = 1,261.5 KB with Russian and French.
    // 2026-11-25 (Arabic pack): 1,270 -> 1,294 KB. Like every pack the worker holds the manifest with its thirteen feature and 27 pattern explanations,
    // the validation cases and the orientation, and the Arabic voice registry; the adapter registry reaches arabic/text.ts for the headword check
    // (`headMatches`) and the language ladder for the letters. No Arabic analyser, core or word list is in the worker. Measured by `npm run ext:build`:
    // background.js 1,324,503 bytes = 1,293.5 KB (1,293,470 bytes = 1,263.1 KB at the same tree without the pack).
    expect(sizes.get('background.js')!, 'background.js').toBeLessThanOrEqual(1294 * KB);
    // 2026-10-21: 650 -> 760 KB; the GoTell redesign (aec73a36) and the GoListen playback refactor (9aae9cb0) brought app.js to 723 KB
    // (measured with the Biblia card of the reader screen, 0.8 KB, reverted). A ceiling again, not a target.
    // 2026-11-08: 760 -> 800 KB; master's build already measured 779 KB.
    // 2026-11-13: 800 -> 840 KB; master's build of 24bdc6b3 already measured 820 KB (unnoticed: this test needs a local build), and the
    // packs' self-report (evidence.ts, merge 467d2b6c) adds 8 KB so the setup page can say what stands behind each language: 828 KB.
    // 2026-11-19 (Russian pack): 840 -> 870 KB. The setup page lists every pack with its manifest, evidence and orientation, and Russian's
    // (thirteen features and twenty-six sentence patterns with their explanations, twenty-eight validation cases, the tutorial) reaches it
    // the same way it reaches the worker. app.js measured 887,822 bytes = 867.0 KB on this branch (master 22be2d7e merged in), built with
    // GOLEARN_APP_DICT=sq,ru. This ceiling is checked only when the setup page has been built (npm run ext:build alone does not).
    // 2026-11-19 (French pack, after merging master 22be2d7e): 840 -> 880 KB. The same French text reaches the setup page (manifest,
    // construction explanations, orientation: 37.6 KB on 985c742b). Measured 896,583 bytes = 875.6 KB on the merged tree.
    // 2026-11-19 (release/ru-fr, both packs on master 3d92b264): 880 -> 910 KB. app.js measured 926,340 bytes = 904.6 KB with Russian and French (setup page built with GOLEARN_APP_DICT=sq,ru,fr).
    if (sizes.has('app/app.js')) expect(sizes.get('app/app.js')!, 'app/app.js').toBeLessThanOrEqual(947 * KB); // 2026-11-25: 910 -> 947 KB for the Arabic pack's manifest (thirteen feature and 27 pattern explanations), validation cases and orientation, like every pack's. Measured: app.js 969,426 bytes = 946.7 KB (setup page built by the extension build test)
    for (const id of ['sq', 'es', 'de', 'hi', 'th', 'nb', 'nn', 'ru', 'fr', 'ar']) expect(sizes.has(`analysers/${id}.js`), `analysers/${id}.js`).toBe(true);
  });

  it('each analyser chunk is an ES module that exports the adapter, and the manifest makes the chunks readable from the page', () => {
    for (const id of ['sq', 'es', 'de', 'hi', 'th', 'nb', 'nn', 'ru', 'ar']) {
      const code = read(`analysers/${id}.js`);
      expect(code, id).toMatch(/\bexport\s*\{[^}]*\bas adapter\b[^}]*\}|\bexport\s*\{\s*adapter\b/);
      expect(code, id).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|StoredSourceRef|importScripts/);
      expect(code, id).not.toMatch(/\beval\s*\(|new Function\s*\(/);
    }
    const m = JSON.parse(read('manifest.json'));
    // lexicon/* (2026-10-22): the sharded Hebrew and Greek form indexes the content script loads before a lookup
    expect(m.web_accessible_resources).toEqual([{ resources: ['analysers/*.js', 'lexicon/*'], matches: ['<all_urls>'] }]);
    // every shared chunk the analysers import sits in analysers/ too, so the one pattern covers it
    for (const id of ['sq', 'es', 'de', 'hi', 'th', 'nb', 'nn', 'ru', 'ar']) for (const [, spec] of read(`analysers/${id}.js`).matchAll(/from\s*"(\.[^"]+)"/g)) expect(spec, id).toMatch(/^\.\/[^/]+\.js$/);
  });

  it('keeps Hindi out of the content script and unrelated analysers out of both scripts', () => {
    for (const f of ['content.js', 'background.js']) {
      const code = read(f);
      expect(code, f).not.toContain('adapter-de@');
      expect(code, f).not.toContain('adapter-th@');
      expect(code, f).not.toContain('adapter-ru@'); // nor the Russian analyser and its 760 KB core: a chunk of its own
      expect(code, f).not.toContain('kaikki-ru-tables');
      expect(code, f).not.toContain('adapter-ar@'); // nor the Arabic analyser and its core: a chunk of its own (the content script holds only the letters that tell Arabic from Persian, from arabic/text.ts)
      expect(code, f).not.toContain('kaikki-ar-tables');
      expect(code, f).not.toContain('Reference realisation of East Norwegian speech'); // the Norwegian engine (its ids are built at run time, so a literal from its text is checked)
    }
    expect(read('content.js')).not.toContain('adapter-hi@');
    expect(read('background.js')).toContain('adapter-hi@');
    expect(read('analysers/de.js')).toContain('adapter-de@');
    expect(read('analysers/ru.js')).toContain('adapter-ru@');
    expect(read('analysers/ar.js')).toContain('adapter-ar@');
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
      // no address the code could call: the service is configured by the learner. The SVG namespace is an identifier, never fetched
      // (the card's drawn speaker, 2026-10-25), so it is taken out before the check
      // The SVG namespace and required OSHB data credit identify resources, not a network destination.
      expect(code.replaceAll('http://www.w3.org/2000/svg', '').replaceAll('https://github.com/openscriptures/morphhb', ''), f).not.toMatch(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i);
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

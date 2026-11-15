// @vitest-environment jsdom
/**
 * Biblia's loading mark (the owner, 2026-11-05: "an open book with pages flipping", not GoReview's globe): the markup, its copy in
 * index.html for the first paint, the stylesheet's turning leaves, and the router showing it while a book is fetched.
 */
import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOADING_AFTER_MS, createBibliaApp, type BibliaApp } from '../../packages/biblia/src/app';
import type { DataSource } from '../../packages/biblia/src/data';
import { BOOK_MARK_INNER, OPENING_LABEL, bookMark } from '../../packages/biblia/src/loading';
import type { Recorder } from '../../packages/biblia/src/repo';
import { setBody, stubLayout } from '../extension/dom';

const css = fs.readFileSync('packages/biblia/styles.css', 'utf8');
const page = fs.readFileSync('packages/biblia/index.html', 'utf8');
const DATA = 'packages/biblia/public/data';

describe('Biblia loading mark: the open book', () => {
  it('is a status with a label, and a book of two pages, a spine and three leaves that turn; nothing of GoReview\'s globe', () => {
    const el = bookMark(document, 'Loading the text…');
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.querySelector('.bk')!.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelectorAll('.bk > .bk-page')).toHaveLength(2);
    expect(el.querySelectorAll('.bk > .bk-leaf')).toHaveLength(3);
    expect(el.querySelector('.bk > .bk-spine')).not.toBeNull();
    expect(el.querySelector('.bk > .bk-board')).not.toBeNull();
    expect(el.querySelector('.bk-label')!.textContent).toBe('Loading the text…');
    expect(el.innerHTML).not.toMatch(/globe/);
    expect(css).not.toMatch(/go-globe/);
  });

  it('index.html carries the same mark, so it paints before any script runs', () => {
    const el = bookMark(document, OPENING_LABEL);
    expect(page).toContain(`<div id="app">${el.outerHTML}</div>`);
    expect(el.innerHTML.startsWith(BOOK_MARK_INNER)).toBe(true);
  });

  it('turns a leaf about the spine by a transform, each leaf visible only while it turns, slower under reduced motion', () => {
    expect(css).toMatch(/^\.bk-leaf \{ transform-origin: left center;[^}]*animation: bk-turn 2\.7s [^}]*infinite; \}$/m);
    expect(css).toMatch(/@keyframes bk-turn \{ 0% \{ transform: rotateY\(0deg\); opacity: 1; \} 40% \{ transform: rotateY\(-180deg\); opacity: 1; \} 40\.01%, 100% \{ transform: rotateY\(-180deg\); opacity: 0; \} \}/);
    // the three leaves are a third of a turn apart, by negative delays: all of them are mid-cycle from the first frame
    expect(css).toMatch(/\.bk-leaf:nth-of-type\(5\) \{ animation-delay: -1\.8s; \}/);
    expect(css).toMatch(/\.bk-leaf:nth-of-type\(6\) \{ animation-delay: -\.9s; \}/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.bk-leaf, \.bk-leaf::after \{ animation-duration: 6s; \}/);
    expect(css).toMatch(/\.bk \{[^}]*perspective: 560px; \}/);
  });
});

describe.skipIf(!fs.existsSync(`${DATA}/canon.json`))('Biblia loading mark: while a book is fetched', () => {
  let restore: () => void;
  let app: BibliaApp | undefined;
  beforeEach(() => { restore = stubLayout(); setBody('<div id="app"></div>'); window.location.hash = ''; });
  afterEach(() => { app?.destroy(); app = undefined; restore(); });
  const recorder: Recorder = { mode: 'extension', async identity() { return { learnerId: 'L1', enrolmentId: 'enr', deviceId: 'D1' }; }, async record() { return { ok: true }; } };
  /** The imported texts, with every book file arriving `delay` ms late. */
  const source = (delay: number): DataSource => ({
    async fetchJson(path) {
      const file = path.startsWith('lexicon/') ? `public/${path}` : `${DATA}/${path.replace(/^data\//, '')}`;
      if (!fs.existsSync(file)) throw new Error(`no such file ${file}`);
      if (/^data\/(he|el)\//.test(path)) await new Promise((r) => setTimeout(r, delay));
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    },
  });

  it('a slow book shows the open book in place of the page, then the chapter replaces it', async () => {
    app = await createBibliaApp({ win: window, doc: document, source: source(LOADING_AFTER_MS + 260), recorder, now: () => new Date() });
    const going = app.go('#/read/Gen/1');
    await new Promise((r) => setTimeout(r, LOADING_AFTER_MS + 80));
    expect(document.querySelector('#app .bk-loading')).not.toBeNull();
    expect(document.querySelector('#app .bk-label')!.textContent).toBe('Loading the text…');
    expect(document.querySelector('#app .reader')).toBeNull();
    await going;
    expect(document.querySelector('#app .bk-loading')).toBeNull();
    expect(document.querySelector('#app .reader')).not.toBeNull();
  });

  it('a book that arrives at once never shows the mark', async () => {
    app = await createBibliaApp({ win: window, doc: document, source: source(0), recorder, now: () => new Date() });
    let seen = false;
    const watch = new MutationObserver(() => { if (document.querySelector('#app .bk-loading')) seen = true; });
    watch.observe(document.getElementById('app')!, { childList: true, subtree: true });
    await app.go('#/read/Gen/1');
    await new Promise((r) => setTimeout(r, LOADING_AFTER_MS + 60));
    watch.disconnect();
    expect(seen).toBe(false);
    expect(document.querySelector('#app .reader')).not.toBeNull();
  });
});

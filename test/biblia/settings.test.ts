// @vitest-environment jsdom
/**
 * Biblia's Settings (#/settings), simpler since 2026-11-25 (the owner): a live sample of the reading text, plain groups of controls (the sliders kept
 * with their values), the familiarity switch only while signed in, one row to About (#/about: offline reading, sources and licences, the legal pages)
 * and Reset as a quiet link.
 */
import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccountService, type AccountService } from '../../packages/biblia/src/account';
import { createBibliaApp, READING_DEFAULTS, type BibliaApp } from '../../packages/biblia/src/app';
import type { DataSource } from '../../packages/biblia/src/data';
import type { Recorder } from '../../packages/biblia/src/repo';
import { SAMPLE_VERSE } from '../../packages/biblia/src/sample';
import { setBody, stubLayout } from '../extension/dom';

const DATA = 'packages/biblia/public/data';
const localSource: DataSource = {
  async fetchJson(path) {
    const file = path.startsWith('lexicon/') ? `public/${path}` : `${DATA}/${path.replace(/^data\//, '')}`;
    if (!fs.existsSync(file)) throw new Error(`no such file ${file}`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  },
  async fetchBytes(path) {
    const file = `public/${path}`;
    if (!fs.existsSync(file)) throw new Error(`no such file ${file}`);
    return new Uint8Array(fs.readFileSync(file));
  },
};
const recorder: Recorder = { mode: 'extension', identity: async () => undefined, record: async () => ({ ok: true }) };
function memoryStorage(initial: Record<string, string> = {}): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => { data.delete(k); },
    setItem: (k, v) => { data.set(k, String(v)); },
  };
}

const SERVICE = 'https://repo.example.org';
const PASSWORD = 'correct horse battery';
const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = new URL(String(input));
  const key = `${(init?.method ?? 'GET').toUpperCase()} ${url.pathname}`;
  const json = (status: number, body?: unknown): Response => (status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body ?? {}), { status, headers: { 'Content-Type': 'application/json' } }));
  if (key === 'POST /sessions') return json(201, { token: 'tok-1', learnerId: 'L1', expiresAt: '2099-01-01T00:00:00.000Z' });
  if (key === 'DELETE /sessions/current') return json(204);
  if (key === 'GET /me') return json(200, { learner: null, account: { accountId: 'A1', email: 'ana@example.org', createdAt: '2026-09-01T00:00:00.000Z' }, enrolments: [], devices: [], consents: [] });
  return json(404, { error: 'not-found' });
}) as typeof fetch;

let restore: () => void;
let app: BibliaApp | undefined;
beforeEach(() => { restore = stubLayout(); setBody('<div id="app"></div>'); window.location.hash = ''; window.scrollTo = (() => undefined) as typeof window.scrollTo; });
afterEach(() => { app?.destroy(); app = undefined; restore(); document.head.querySelectorAll('meta[name="biblia-edition"]').forEach((m) => m.remove()); });

const q = <T extends Element>(sel: string): T => document.querySelector(sel) as T;
const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const root = document.documentElement;
async function open(opts: { storage?: Storage; account?: AccountService; syncStatus?: HTMLElement } = {}): Promise<BibliaApp> {
  app = await createBibliaApp({ win: window, doc: document, source: localSource, recorder, ...(opts.storage ? { storage: opts.storage } : {}), ...(opts.account ? { account: opts.account } : {}), ...(opts.syncStatus ? { syncStatus: opts.syncStatus } : {}), now: () => new Date('2026-10-24T12:00:00Z') });
  return app;
}
const pill = (group: string, value: string): HTMLButtonElement => q<HTMLButtonElement>(`.pills[aria-label="${group}"] button[data-value="${value}"]`);
const setSlider = (id: string, value: number): void => { const el = q<HTMLInputElement>(`#${id}`); el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true })); };

describe.skipIf(!fs.existsSync(`${DATA}/canon.json`))('Biblia settings', () => {
  it('is one short page: the sample, two plain groups, one row to About and Reset; no box in a box, no drop-downs, no Speech, Account or Service', async () => {
    const a = await open({ storage: memoryStorage() });
    await a.go('#/settings');
    expect(a.route).toBe('settings');
    expect(text(q('.screen > h1'))).toBe('Settings');
    expect([...q('.screen').children].map((c) => c.id || c.tagName.toLowerCase())).toEqual(['h1', 'settings-sample', 'settings-text', 'settings-verses', 'settings-about', 'p']);
    expect([...document.querySelectorAll('.settings-group > h2')].map(text)).toEqual(['Text', 'Hebrew and verses']);
    expect(document.querySelector('.screen .card, .screen details, .settings-disclosure')).toBeNull();
    expect(document.querySelector('#settings-speech, #settings-account, #settings-service, #settings-remote-speech, #settings-svc-url')).toBeNull();
    // the sliders stay as they were, each with its caption and its value (the owner: "I like the accessibility this provides")
    expect([...document.querySelectorAll('#settings-text .field--slider label')].map(text)).toEqual(['Hebrew text size26 px', 'Greek text size22 px', 'Line spacing1.85']);
    expect([...document.querySelectorAll('#settings-text input[type="range"]')].map((i) => i.id)).toEqual(['set-hebrew-size', 'set-greek-size', 'set-line-height']);
    // signed out (here: no account at all) there is no familiarity switch, and nothing says "available when signed in"
    expect(document.querySelector('#set-level-marks, #settings-marks')).toBeNull();
    expect(text(q('.screen'))).not.toMatch(/signed in/i);
    // the bar: back to the library, the wordmark, the settings icon marked as the current page
    expect(q('.topbar a.iconbtn[aria-label="Library"]').getAttribute('href')).toBe('#/');
    expect(q('.topbar a.iconbtn[aria-label="Settings"]').getAttribute('aria-current')).toBe('page');
    // one row leads to About; Reset is a quiet link, not a button beside a checkbox
    expect(q('#settings-about').getAttribute('href')).toBe('#/about');
    expect(text(q('#settings-about'))).toBe('About BibliaOffline reading, sources and licences');
    expect(q('#settings-reset').classList.contains('linklike')).toBe(true);
    expect(text(q('#settings-reset'))).toBe('Reset to defaults');
  });

  it('shows a live sample: the first verse in Hebrew and in Greek, following the Hebrew marks and the verse numbers at once', async () => {
    const a = await open({ storage: memoryStorage() });
    await a.go('#/settings');
    const lines = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('#settings-sample .prose')];
    const words = (el: HTMLElement): string => text(el.querySelector('.verse')).slice(text(el.querySelector('.vn')).length);
    expect(lines().map((l) => [l.lang, l.dir])).toEqual([['he', 'rtl'], ['el', 'ltr']]);
    // set by the reader's own classes, so the sizes, the spacing and the theme reach it through the same custom properties
    expect(q('#settings-sample').classList.contains('reader')).toBe(true);
    expect(words(lines()[0])).toBe(SAMPLE_VERSE.he);
    expect(words(lines()[1])).toBe(SAMPLE_VERSE.el);
    expect(lines().map((l) => text(l.querySelector('.vn')))).toEqual(['א׳', 'αʹ']);
    pill('Verse numbers', 'decimal').click();
    expect(lines().map((l) => text(l.querySelector('.vn')))).toEqual(['1', '1']);
    pill('Hebrew marks', 'niqqud').click();
    expect(words(lines()[0])).not.toMatch(/[֑-֯]/u); // the accents are gone
    expect(words(lines()[0])).toMatch(/[ְ-ֻ]/u);      // the vowels stay
    pill('Hebrew marks', 'consonants').click();
    expect(words(lines()[0])).not.toMatch(/[֑-ׇ]/u);
    expect(words(lines()[1])).toBe(SAMPLE_VERSE.el);    // the Greek is not touched by a Hebrew choice
    // nothing on the page has to say that a choice waits for the next chapter
    expect(text(q('.screen'))).not.toMatch(/next time you open/i);
  });

  it('the sample verses are the data’s own first verses, mark for mark', () => {
    const he = JSON.parse(fs.readFileSync(`${DATA}/he/Gen.json`, 'utf8')) as { chapters: Array<{ verses: Array<{ t: string }> }> };
    const el = JSON.parse(fs.readFileSync(`${DATA}/el/John.json`, 'utf8')) as { chapters: Array<{ verses: Array<{ w: string[][] }> }> };
    expect(SAMPLE_VERSE.he).toBe(he.chapters[0].verses[0].t);
    expect(SAMPLE_VERSE.el).toBe(el.chapters[0].verses[0].w.map((t) => t[0]).join(' '));
  });

  it('About (#/about) holds what Settings carried in two drop-downs: offline reading, the sources and the font licences', async () => {
    const a = await open({ storage: memoryStorage() });
    await a.go('#/about');
    expect(a.route).toBe('about');
    expect(text(q('.screen > h1'))).toBe('About');
    expect([...document.querySelectorAll('.settings-group')].map((s) => s.id)).toEqual(['about-offline', 'about-sources']);
    expect(q('.topbar a.iconbtn[aria-label="Back"]').getAttribute('href')).toBe('#/settings');
    expect(text(q('#about-sources'))).toContain('Miqra according to the Masorah');
    expect(text(q('#about-sources'))).toContain('SIL Open Font License');
    expect(q('#link-ofl-garamond').getAttribute('href')).toBe('./fonts/EB-Garamond-OFL.txt');
    expect(q('#link-ofl-frank').getAttribute('href')).toBe('./fonts/frank-ruhl-libre-OFL.txt');
    // "Sources and limits" is linked once, from the sources note; the legal pages exist only with an account
    expect([...document.querySelectorAll('.screen a[href="#/sources"]')]).toHaveLength(1);
    expect(document.querySelector('.settings-links')).toBeNull();
  });

  it('keeps each reading preference under biblia:<name> and applies it to the page at once', async () => {
    const storage = memoryStorage();
    const a = await open({ storage });
    await a.go('#/settings');
    expect(pill('Theme', 'auto').getAttribute('aria-pressed')).toBe('true');
    expect(root.hasAttribute('data-theme')).toBe(false);
    pill('Theme', 'dark').click();
    expect(storage.getItem('biblia:theme')).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(pill('Theme', 'dark').getAttribute('aria-pressed')).toBe('true');
    expect(pill('Theme', 'auto').getAttribute('aria-pressed')).toBe('false');
    pill('Theme', 'auto').click();
    expect(root.hasAttribute('data-theme')).toBe(false);

    expect(q<HTMLInputElement>('#set-hebrew-size').value).toBe(String(READING_DEFAULTS.hebrewSize));
    setSlider('set-hebrew-size', 32);
    expect(storage.getItem('biblia:hebrewSize')).toBe('32');
    expect(root.style.getPropertyValue('--reading-font-size')).toBe('32px');
    expect(text(q('#set-hebrew-size').previousElementSibling)).toContain('32 px');
    setSlider('set-greek-size', 28);
    expect(root.style.getPropertyValue('--greek-font-size')).toBe('28px');
    setSlider('set-line-height', 2.1);
    expect(storage.getItem('biblia:lineHeight')).toBe('2.1');
    expect(root.style.getPropertyValue('--reading-line-height')).toBe('2.1');

    expect(pill('Verse numbers', 'native').getAttribute('aria-pressed')).toBe('true');
    pill('Verse numbers', 'decimal').click();
    expect(root.getAttribute('data-verse-numbers')).toBe('decimal');
    expect(storage.getItem('biblia:verseNumbers')).toBe('decimal');
    await a.go('#/read/Gen/1');
    expect(document.querySelector('.verse[data-v="1"] .vn')?.textContent).toBe('1');
    await a.go('#/settings');
    pill('Verse numbers', 'hidden').click();
    expect(storage.getItem('biblia:verseNumbers')).toBe('hidden');
    expect(root.getAttribute('data-verse-numbers')).toBe('hidden');
  });

  it('the Hebrew marks choice (the preference the app always had, in plainer words) changes what the next chapter shows', async () => {
    const storage = memoryStorage();
    const a = await open({ storage });
    await a.go('#/settings');
    expect([...document.querySelectorAll('.pills[aria-label="Hebrew marks"] button')].map(text)).toEqual(['All', 'Vowels', 'None']);
    expect(pill('Hebrew marks', 'full').getAttribute('aria-pressed')).toBe('true');
    pill('Hebrew marks', 'consonants').click();
    expect(storage.getItem('biblia:hebrewDisplay')).toBe('consonants');
    await a.go('#/read/Gen/1');
    const first = q('.reader .prose button.word').textContent ?? '';
    expect(first).toBe('בראשית');
    expect(first).not.toMatch(/[֑-ׇ]/u);
  });

  it('starts from the kept preferences, refuses values out of range, and Reset settings puts the defaults back', async () => {
    const storage = memoryStorage({ 'biblia:theme': 'dark', 'biblia:hebrewSize': '30', 'biblia:greekSize': '999', 'biblia:verseNumbers': 'hidden', 'biblia:hebrewDisplay': 'niqqud' });
    const a = await open({ storage });
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.style.getPropertyValue('--reading-font-size')).toBe('30px');
    expect(root.style.getPropertyValue('--greek-font-size')).toBe(`${READING_DEFAULTS.greekSize}px`); // 999 is not a size
    expect(root.getAttribute('data-verse-numbers')).toBe('hidden');
    await a.go('#/read/Gen/1');
    expect(document.querySelector('.verse[data-v="1"] .vn')?.textContent).toBe('');
    expect(document.querySelectorAll('.verse[data-v="1"] button.word').length).toBeGreaterThan(0);
    expect(document.querySelector('.verse[data-v="1"]')?.getAttribute('data-v')).toBe('1');
    await a.go('#/settings');
    expect(pill('Hebrew marks', 'niqqud').getAttribute('aria-pressed')).toBe('true');
    q<HTMLButtonElement>('#settings-reset').click();
    await vi.waitFor(() => expect(pill('Theme', 'auto').getAttribute('aria-pressed')).toBe('true'));
    expect([...storage.data.keys()].filter((k) => k.startsWith('biblia:') && k !== 'biblia:last')).toEqual([]);
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(root.getAttribute('data-verse-numbers')).toBe('native');
    expect(root.style.getPropertyValue('--reading-font-size')).toBe(`${READING_DEFAULTS.hebrewSize}px`);
    expect(pill('Hebrew marks', 'full').getAttribute('aria-pressed')).toBe('true');
    await a.go('#/read/John/1');
    expect(document.querySelector('.verse[data-v="1"] .vn')?.textContent).toBe('αʹ');
  });

  it('migrates the former on/off values to native/hidden', async () => {
    const storage = memoryStorage({ 'biblia:verseNumbers': 'off' });
    const a = await open({ storage });
    expect(root.getAttribute('data-verse-numbers')).toBe('hidden');
    await a.go('#/settings');
    expect(pill('Verse numbers', 'hidden').getAttribute('aria-pressed')).toBe('true');

    app?.destroy(); app = undefined;
    const nativeStorage = memoryStorage({ 'biblia:verseNumbers': 'on' });
    await open({ storage: nativeStorage });
    expect(root.getAttribute('data-verse-numbers')).toBe('native');
  });

  it('says what the device keeps: the installed edition keeps what is read; another copy does not install itself', async () => {
    const a = await open({ storage: memoryStorage() });
    await a.go('#/about');
    expect(text(q('#about-offline > h2'))).toBe('Offline reading');
    expect(text(q('#about-offline'))).toContain('It is not installed for offline use.');
    const meta = document.createElement('meta');
    meta.name = 'biblia-edition'; meta.content = 'standalone';
    document.head.append(meta);
    await a.go('#/settings');
    await a.go('#/about');
    expect(text(q('#about-offline'))).toContain('This installed edition keeps the app itself');
    expect(text(q('#about-offline'))).toContain('available offline after you open it once');
    expect(text(q('#about-offline'))).toContain('your place');
  });

  describe('account integration', () => {
    const make = (): { account: AccountService; storage: ReturnType<typeof memoryStorage> } => {
      const storage = memoryStorage();
      return { storage, account: createAccountService({ serviceUrl: SERVICE, storage, fetch: fakeFetch }) };
    };

    it('keeps sign-in on the account route and omits account and service details from Settings', async () => {
      const { account, storage } = make();
      const a = await open({ storage, account });
      await a.go('#/settings');
      expect(document.querySelector('#settings-account, #settings-service, #settings-svc-url')).toBeNull();
      expect([...document.querySelectorAll('.topbar .iconbtn')].map((x) => x.getAttribute('aria-label'))).toEqual(['Library', 'Account', 'Settings']);
      // Settings itself carries no legal links; About does, and each legal page opened from there leads back to it
      expect(document.querySelector('.settings-links')).toBeNull();
      await a.go('#/about');
      expect([...document.querySelectorAll('.settings-links a')].map((x) => x.getAttribute('href'))).toEqual(['#/terms/about', '#/privacy/about']);
      await a.go('#/terms/about');
      expect(a.route).toBe('terms');
      expect(q('.legal .screen > p a').getAttribute('href')).toBe('#/about');
      expect(q('.topbar a.iconbtn[aria-label="Back"]').getAttribute('href')).toBe('#/about');
      // a link kept from the former page (#/terms/settings) still opens the page, with the same way back
      await a.go('#/privacy/settings');
      expect(a.route).toBe('privacy');
      expect(q('.legal .screen > p a').getAttribute('href')).toBe('#/about');
      await a.go('#/account');
      expect(a.route).toBe('account');
      expect(document.querySelector('.account')).not.toBeNull();
    });

    it('shows the familiarity switch only to a signed-in reader; it is a switch, and it keeps and applies its choice', async () => {
      const { account, storage } = make();
      const a = await open({ storage, account });
      await a.go('#/settings');
      expect(document.querySelector('#settings-marks, #set-level-marks')).toBeNull(); // signed out: not shown at all
      expect(await account.signIn('ana@example.org', PASSWORD)).toEqual({ ok: true });
      await vi.waitFor(() => expect(document.querySelector('#set-level-marks')).not.toBeNull()); // signing in redraws the page
      expect(text(q('#settings-marks > h2'))).toBe('Your words');
      const marks = q<HTMLInputElement>('#set-level-marks');
      expect(marks.getAttribute('role')).toBe('switch');
      expect(marks.checked).toBe(true);
      expect(text(marks.closest('label'))).not.toBe('');
      marks.click();
      expect(storage.getItem('biblia:levelMarks')).toBe('off');
      expect(root.getAttribute('data-level-marks')).toBe('off');
    });

    it('signs out from the account screen', async () => {
      const { account, storage } = make();
      expect(await account.signIn('ana@example.org', PASSWORD)).toEqual({ ok: true });
      const a = await open({ storage, account });
      await a.go('#/account');
      q<HTMLButtonElement>('#account-signout').click();
      await vi.waitFor(() => expect(account.state().signedIn).toBe(false));
    });

    it('shows the sync notice on the account screen and nowhere on Settings or the library', async () => {
      const { account, storage } = make();
      expect(await account.signIn('ana@example.org', PASSWORD)).toEqual({ ok: true });
      const syncStatus = document.createElement('aside');
      syncStatus.className = 'sync-status';
      syncStatus.textContent = 'Uploads complete · Last sent at 9:41 AM.';
      const a = await open({ storage, account, syncStatus });
      await a.go('#/');
      expect(document.querySelector('.sync-status')).toBeNull();
      await a.go('#/settings');
      expect(document.querySelector('.sync-status')).toBeNull();
      await a.go('#/account');
      expect(document.querySelector('.account .sync-status')).toBe(syncStatus);
      expect(text(syncStatus)).toContain('Uploads complete');
      expect(document.querySelectorAll('.sync-status').length).toBe(1);
    });

    it('does not show a sync notice to a signed-out learner', async () => {
      const { account, storage } = make();
      const syncStatus = document.createElement('aside');
      syncStatus.className = 'sync-status';
      const a = await open({ storage, account, syncStatus });
      await a.go('#/account');
      expect(document.querySelector('.sync-status')).toBeNull();
    });
  });
});

describe('the fonts shipped with Biblia', () => {
  it('are on disk beside their licences, and the stylesheet names each file', () => {
    const dir = 'packages/biblia/public/fonts';
    const css = fs.readFileSync('packages/biblia/styles.css', 'utf8');
    const woff = fs.readdirSync(dir).filter((f) => f.endsWith('.woff2'));
    expect(woff.length).toBe(11);
    for (const f of woff) { expect(f).not.toMatch(/-[A-Za-z0-9_-]{8}\.woff2$/); expect(css, f).toContain(`/fonts/${f}`); }
    expect(woff.filter((f) => f.startsWith('frank-ruhl-libre-hebrew')).length).toBe(2);
    expect(css).toContain("font-family: 'EB Garamond'");
    expect(css).toContain("font-family: 'Frank Ruhl Libre'");
    for (const f of ['EB-Garamond-OFL.txt', 'frank-ruhl-libre-OFL.txt']) expect(fs.readFileSync(`${dir}/${f}`, 'utf8')).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/);
    expect(fs.readFileSync(`${dir}/FONTS.md`, 'utf8')).toMatch(/Frank Ruhl Libre/);
  });
});

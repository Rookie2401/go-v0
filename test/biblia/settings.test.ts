// @vitest-environment jsdom
/**
 * Biblia's Settings (#/settings) in GoReview's design — the title with its rule and the cards with a tracked-capitals kicker: READING, ACCOUNT,
 * SERVICE, OFFLINE, SOURCES & LICENCES. Each reading preference is kept under biblia:<name> and applied to the page at once; Reset removes them.
 * The account card shows who is signed in with Sign out, or the way to sign in; the service address is read-only. The fonts shipped with the app
 * are on disk with their licences.
 */
import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccountService, type AccountService } from '../../packages/biblia/src/account';
import { createBibliaApp, READING_DEFAULTS, type BibliaApp } from '../../packages/biblia/src/app';
import type { DataSource } from '../../packages/biblia/src/data';
import type { Recorder } from '../../packages/biblia/src/repo';
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
async function open(opts: { storage?: Storage; account?: AccountService } = {}): Promise<BibliaApp> {
  app = await createBibliaApp({ win: window, doc: document, source: localSource, recorder, ...(opts.storage ? { storage: opts.storage } : {}), ...(opts.account ? { account: opts.account } : {}), now: () => new Date('2026-10-24T12:00:00Z') });
  return app;
}
const pill = (group: string, value: string): HTMLButtonElement => q<HTMLButtonElement>(`.pills[aria-label="${group}"] button[data-value="${value}"]`);
const setSlider = (id: string, value: number): void => { const el = q<HTMLInputElement>(`#${id}`); el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true })); };

describe.skipIf(!fs.existsSync(`${DATA}/canon.json`))('Settings in GoReview\'s design', () => {
  it('is a centred column with the title and its rule, and one card per kicker', async () => {
    const a = await open({ storage: memoryStorage() });
    await a.go('#/settings');
    expect(a.route).toBe('settings');
    expect(text(q('.screen > h1'))).toBe('Settings');
    expect([...document.querySelectorAll('.screen > section.card > h2')].map((h) => text(h))).toEqual(['Reading', 'Account', 'Service', 'Offline', 'Sources & licences']);
    expect([...document.querySelectorAll('.screen > section.card')].map((s) => s.id)).toEqual(['settings-reading', 'settings-account', 'settings-service', 'settings-offline', 'settings-sources']);
    // the bar: back to the library, the wordmark, the settings icon marked as the current page
    expect(q('.topbar a.iconbtn[aria-label="Library"]').getAttribute('href')).toBe('#/');
    expect(q('.topbar a.iconbtn[aria-label="Settings"]').getAttribute('aria-current')).toBe('page');
    // an edition without an account service says so, and shows no address
    expect(text(q('#settings-account'))).toContain('no sign-in of its own');
    expect(text(q('#settings-service'))).toContain('No Repository service');
    expect(document.querySelector('#settings-svc-url')).toBeNull();
    // the attribution and the fonts, with the licences of the fonts
    expect(text(q('#settings-sources'))).toContain('Miqra according to the Masorah');
    expect(text(q('#settings-sources'))).toContain('SIL Open Font License');
    expect(q('#link-ofl-garamond').getAttribute('href')).toBe('./fonts/EB-Garamond-OFL.txt');
    expect(q('#link-ofl-frank').getAttribute('href')).toBe('./fonts/frank-ruhl-libre-OFL.txt');
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
    expect(text(q('#set-hebrew-size').previousElementSibling)).toContain('32px');
    setSlider('set-greek-size', 28);
    expect(root.style.getPropertyValue('--greek-font-size')).toBe('28px');
    setSlider('set-line-height', 2.1);
    expect(storage.getItem('biblia:lineHeight')).toBe('2.1');
    expect(root.style.getPropertyValue('--reading-line-height')).toBe('2.1');

    q<HTMLInputElement>('#set-verse-numbers').click();
    expect(storage.getItem('biblia:verseNumbers')).toBe('off');
    expect(root.getAttribute('data-verse-numbers')).toBe('off');
    q<HTMLInputElement>('#set-level-marks').click();
    expect(storage.getItem('biblia:levelMarks')).toBe('off');
    expect(root.getAttribute('data-level-marks')).toBe('off');
  });

  it('the Hebrew text choice (the preference the app always had) changes what the next chapter shows', async () => {
    const storage = memoryStorage();
    const a = await open({ storage });
    await a.go('#/settings');
    expect(pill('Hebrew text', 'full').getAttribute('aria-pressed')).toBe('true');
    pill('Hebrew text', 'consonants').click();
    expect(storage.getItem('biblia:hebrewDisplay')).toBe('consonants');
    await a.go('#/read/Gen/1');
    const first = q('.reader .prose button.word').textContent ?? '';
    expect(first).toBe('בראשית');
    expect(first).not.toMatch(/[֑-ׇ]/u);
  });

  it('starts from the kept preferences, refuses values out of range, and Reset settings puts the defaults back', async () => {
    const storage = memoryStorage({ 'biblia:theme': 'dark', 'biblia:hebrewSize': '30', 'biblia:greekSize': '999', 'biblia:verseNumbers': 'off', 'biblia:hebrewDisplay': 'niqqud' });
    const a = await open({ storage });
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.style.getPropertyValue('--reading-font-size')).toBe('30px');
    expect(root.style.getPropertyValue('--greek-font-size')).toBe(`${READING_DEFAULTS.greekSize}px`); // 999 is not a size
    expect(root.getAttribute('data-verse-numbers')).toBe('off');
    await a.go('#/settings');
    expect(pill('Hebrew text', 'niqqud').getAttribute('aria-pressed')).toBe('true');
    q<HTMLButtonElement>('#settings-reset').click();
    await vi.waitFor(() => expect(pill('Theme', 'auto').getAttribute('aria-pressed')).toBe('true'));
    expect([...storage.data.keys()].filter((k) => k.startsWith('biblia:') && k !== 'biblia:last')).toEqual([]);
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(root.getAttribute('data-verse-numbers')).toBe('on');
    expect(root.style.getPropertyValue('--reading-font-size')).toBe(`${READING_DEFAULTS.hebrewSize}px`);
    expect(pill('Hebrew text', 'full').getAttribute('aria-pressed')).toBe('true');
  });

  it('says what the device keeps: the installed edition keeps what is read; another copy does not install itself', async () => {
    const a = await open({ storage: memoryStorage() });
    await a.go('#/settings');
    expect(text(q('#settings-offline'))).toContain('does not install itself for offline use');
    const meta = document.createElement('meta');
    meta.name = 'biblia-edition'; meta.content = 'standalone';
    document.head.append(meta);
    await a.go('#/settings');
    expect(text(q('#settings-offline'))).toContain('This installed edition keeps the app itself');
    expect(text(q('#settings-offline'))).toContain('your place');
  });

  describe('with an account', () => {
    const make = (): { account: AccountService; storage: ReturnType<typeof memoryStorage> } => {
      const storage = memoryStorage();
      return { storage, account: createAccountService({ serviceUrl: SERVICE, storage, fetch: fakeFetch }) };
    };

    it('signed out: the service address (read-only) and a gold Sign in that leads to #/account, then the drafts', async () => {
      const { account, storage } = make();
      const a = await open({ storage, account });
      await a.go('#/settings');
      expect(text(q('#settings-signed-out'))).toBe('Not signed in.');
      const signIn = q<HTMLAnchorElement>('#settings-signin');
      expect(signIn.getAttribute('href')).toBe('#/account');
      expect(signIn.classList.contains('primary')).toBe(true);
      const url = q<HTMLInputElement>('#settings-svc-url');
      expect(url.value).toBe(SERVICE);
      expect(url.readOnly).toBe(true);
      expect([...document.querySelectorAll('#settings-account .legal-links a')].map((x) => [x.textContent, x.getAttribute('href')])).toEqual([['Terms', '#/terms'], ['Privacy Policy', '#/privacy']]);
      // the bar carries the account icon beside the settings icon
      expect([...document.querySelectorAll('.topbar .iconbtn')].map((x) => x.getAttribute('aria-label'))).toEqual(['Library', 'Account', 'Settings']);
    });

    it('signed in: who, and Sign out, which signs out and shows the way back in', async () => {
      const { account, storage } = make();
      expect(await account.signIn('ana@example.org', PASSWORD)).toEqual({ ok: true });
      const a = await open({ storage, account });
      await a.go('#/settings');
      expect(text(q('#settings-email'))).toBe('Signed in as ana@example.org');
      expect(document.querySelector('#settings-signin')).toBeNull();
      q<HTMLButtonElement>('#settings-signout').click();
      await vi.waitFor(() => expect(account.state().signedIn).toBe(false));
      await vi.waitFor(() => expect(document.querySelector('#settings-signin')).not.toBeNull());
      expect(document.querySelector('#settings-email')).toBeNull();
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

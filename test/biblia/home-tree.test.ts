// @vitest-environment jsdom
/**
 * Biblia's library as the Biblia app drew it (packages/biblia/src/app.ts, renderLibrary): the three-line masthead, then testament → division →
 * book → chapters as nested disclosures. The counts, the chapter entries (a link to #/read/<Book>/<n>, "Chapter n", the native heading, the verse
 * count), which levels are open (remembered under 'biblia:home-open'; the testaments open by default) and the "Continue reading" entry.
 */
import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBibliaApp, HOME_OPEN_KEY, type BibliaApp } from '../../packages/biblia/src/app';
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

let restore: () => void;
let app: BibliaApp | undefined;
beforeEach(() => { restore = stubLayout(); setBody('<div id="app"></div>'); window.location.hash = ''; window.scrollTo = (() => undefined) as typeof window.scrollTo; });
afterEach(() => { app?.destroy(); app = undefined; restore(); });

const q = <T extends Element>(sel: string): T => document.querySelector(sel) as T;
const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const group = (id: string): HTMLElement => q<HTMLElement>(`.lib__group[data-id="${id}"]`);
const head = (id: string): HTMLButtonElement => group(id).querySelector(':scope > .lib__head') as HTMLButtonElement;
const collapsible = (id: string): HTMLElement => group(id).querySelector(':scope > .collapsible') as HTMLElement;
const open = async (storage?: Storage): Promise<void> => { app = await createBibliaApp({ win: window, doc: document, source: localSource, recorder, ...(storage ? { storage } : {}), now: () => new Date('2026-10-24T12:00:00Z') }); };

describe.skipIf(!fs.existsSync(`${DATA}/canon.json`))('the library tree', () => {
  it('opens with the three-line masthead, the tagline and the short rule', async () => {
    await open(memoryStorage());
    const title = q('h1.home__title');
    expect(text(q('.home__title .he'))).toBe('תַּנַ״ךְ');
    expect(text(q('.home__title .gr'))).toBe('Ἡ Καινὴ Διαθήκη');
    expect(text(title)).toBe('תַּנַ״ךְἩ Καινὴ ΔιαθήκηBiblia Sacra');
    expect(text(q('.home__subtitle'))).toBe('The holy scripture in the original language with a linguistic apparatus underneath.');
    expect(q('.home__rule')).not.toBeNull();
    // the bar: the BIBLIA wordmark at the left, icon buttons at the right (no account service here: the settings icon alone)
    expect(text(q('.topbar .topbar__title'))).toBe('Biblia');
    expect([...document.querySelectorAll('.topbar .iconbtn')].map((a) => [a.getAttribute('aria-label'), a.getAttribute('href')])).toEqual([['Settings', '#/settings']]);
  });

  it('is a tree of two testaments, five divisions and 66 books, each head carrying the native name and its count', async () => {
    await open(memoryStorage());
    expect([...document.querySelectorAll('.lib__group--1')].map((g) => g.getAttribute('data-id'))).toEqual(['tanakh', 'nt']);
    const row = (id: string): string[] => [text(head(id).querySelector('.lib__title')), text(head(id).querySelector('.lib__native')), text(head(id).querySelector('.lib__meta'))];
    expect(row('tanakh')).toEqual(['Tanakh', 'תַּנַ״ךְ', '39 books']);
    expect(row('nt')).toEqual(['New Testament', 'Ἡ Καινὴ Διαθήκη', '27 books']);
    expect(row('Torah')).toEqual(['Torah', 'תּוֹרָה', '5 books']);
    expect(row('Neviim')).toEqual(['Neviʾim · Prophets', 'נְבִיאִים', '21 books']);
    expect(row('Ketuvim')).toEqual(['Ketuvim · Writings', 'כְּתוּבִים', '13 books']);
    expect(row('Histories')[2]).toBe('5 books');
    expect(row('Epistles')[2]).toBe('22 books');
    expect(row('Gen')).toEqual(['Genesis', 'בְּרֵאשִׁית', '50 ch']);
    expect(row('John')[2]).toBe('21 ch');
    expect(row('Ps')[2]).toBe('150 ch');
    // levels nest: a testament holds divisions, a division holds books, a book holds its chapters
    expect(group('tanakh').querySelectorAll('.lib__group--2').length).toBe(3);
    expect(group('Torah').querySelectorAll('.lib__group--3').length).toBe(5);
    expect(group('nt').querySelectorAll('.lib__group--3').length).toBe(27);
    expect(document.querySelectorAll('.lib__group--3').length).toBe(66);
  });

  it('lists the chapters as entries: a link to the chapter, "Chapter n", the native heading, the verse count', async () => {
    await open(memoryStorage());
    const gen = [...group('Gen').querySelectorAll('a.entry')] as HTMLAnchorElement[];
    expect(gen).toHaveLength(50);
    expect(gen[0].getAttribute('href')).toBe('#/read/Gen/1');
    expect(text(gen[0].querySelector('.entry__num'))).toBe('Chapter 1');
    expect(text(gen[0].querySelector('.entry__native'))).toBe('פֶּרֶק א׳');
    expect(gen[0].querySelector('.entry__native')!.getAttribute('lang')).toBe('he');
    expect(text(gen[0].querySelector('.entry__preview'))).toBe('31 verses');
    expect(text(gen[1].querySelector('.entry__preview'))).toBe('25 verses');
    expect(text(gen[49].querySelector('.entry__num'))).toBe('Chapter 50');
    const john3 = q<HTMLAnchorElement>('a.entry[href="#/read/John/3"]');
    expect(text(john3.querySelector('.entry__num'))).toBe('Chapter 3');
    expect(text(john3.querySelector('.entry__native'))).toBe('Κεφάλαιον γʹ');
    expect(john3.querySelector('.entry__native')!.getAttribute('lang')).toBe('el');
    expect(text(john3.querySelector('.entry__preview'))).toBe('36 verses');
    // every chapter of every book is one entry
    expect(document.querySelectorAll('a.entry').length).toBe(929 + 260);
  });

  it('opens the two testaments by default and remembers what the learner opens and closes under biblia:home-open', async () => {
    const storage = memoryStorage();
    await open(storage);
    expect(HOME_OPEN_KEY).toBe('biblia:home-open');
    expect(head('tanakh').getAttribute('aria-expanded')).toBe('true');
    expect(head('nt').getAttribute('aria-expanded')).toBe('true');
    expect(head('Torah').getAttribute('aria-expanded')).toBe('false');
    expect(collapsible('tanakh').getAttribute('data-open')).toBe('true');
    expect(collapsible('Torah').getAttribute('data-open')).toBe('false');
    expect(collapsible('Torah').querySelector('.collapsible__inner')!.hasAttribute('inert')).toBe(true);

    head('Torah').click();
    expect(head('Torah').getAttribute('aria-expanded')).toBe('true');
    expect(collapsible('Torah').getAttribute('data-open')).toBe('true');
    expect(collapsible('Torah').querySelector('.collapsible__inner')!.hasAttribute('inert')).toBe(false);
    expect(head('Torah').querySelector('.lib__chev')!.classList.contains('lib__chev--open')).toBe(true);
    head('nt').click();
    expect(head('nt').getAttribute('aria-expanded')).toBe('false');
    expect(new Set(JSON.parse(storage.getItem(HOME_OPEN_KEY)!) as string[])).toEqual(new Set(['tanakh', 'Torah']));

    // the next visit (a new page load) finds the library as it was left
    app!.destroy(); app = undefined;
    setBody('<div id="app"></div>');
    await open(storage);
    expect(head('Torah').getAttribute('aria-expanded')).toBe('true');
    expect(head('tanakh').getAttribute('aria-expanded')).toBe('true');
    expect(head('nt').getAttribute('aria-expanded')).toBe('false');
    head('Torah').click();
    head('Gen').click();
    expect(new Set(JSON.parse(storage.getItem(HOME_OPEN_KEY)!) as string[])).toEqual(new Set(['tanakh', 'Gen']));
  });

  it('falls back to the testaments open when the remembered state is unreadable, and works without any storage', async () => {
    await open(memoryStorage({ [HOME_OPEN_KEY]: '{not json' }));
    expect(head('tanakh').getAttribute('aria-expanded')).toBe('true');
    expect(head('nt').getAttribute('aria-expanded')).toBe('true');
    app!.destroy(); app = undefined;
    setBody('<div id="app"></div>');
    await open();
    expect(head('nt').getAttribute('aria-expanded')).toBe('true');
    head('nt').click(); // no storage: nothing throws
    expect(head('nt').getAttribute('aria-expanded')).toBe('false');
  });

  it('offers "Continue reading" only when a last position exists, and marks that chapter in its book', async () => {
    await open(memoryStorage());
    expect(document.querySelector('.home__continue')).toBeNull();
    app!.destroy(); app = undefined;

    setBody('<div id="app"></div>');
    await open(memoryStorage({ 'biblia:last': 'John/3' }));
    const link = q<HTMLAnchorElement>('a.home__continue');
    expect(link.getAttribute('href')).toBe('#/read/John/3');
    expect(text(link.querySelector('.home__continue-label'))).toBe('Continue reading');
    expect(text(link.querySelector('.home__continue-ref'))).toBe('John 3');
    expect(text(link.querySelector('.home__continue-sub'))).toContain('γʹ');
    expect(q('a.entry[href="#/read/John/3"]').classList.contains('entry--at')).toBe(true);
    expect(q('a.entry[href="#/read/John/2"]').classList.contains('entry--at')).toBe(false);
    expect(group('John').classList.contains('lib__group--current')).toBe(true);
    // it comes before the tree
    expect(link.compareDocumentPosition(q('nav.lib')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    app!.destroy(); app = undefined;

    // a position that is not in the canon is not offered
    setBody('<div id="app"></div>');
    await open(memoryStorage({ 'biblia:last': 'Gen/99' }));
    expect(document.querySelector('.home__continue')).toBeNull();
  });

  it('reading a chapter makes it the position the library offers next time', async () => {
    const storage = memoryStorage();
    await open(storage);
    await app!.go('#/read/Ps/23');
    expect(storage.getItem('biblia:last')).toBe('Ps/23');
    await app!.go('#/');
    expect(q('a.home__continue').getAttribute('href')).toBe('#/read/Ps/23');
    expect(text(q('.home__continue-ref'))).toBe('Psalms 23');
  });
});

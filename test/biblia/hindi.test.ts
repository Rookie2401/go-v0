// @vitest-environment jsdom
/**
 * Biblia's Hindi edition (packages/biblia/src/edition.ts, src/irv.ts; docs/ecosystem/BIBLIA-HINDI.md): the Indian Revised Version read from the
 * committed USFM (data/sources/hi/usfm), checked verse by verse against the verified copy of the same edition (data/verified/scripture.json);
 * the same app over it — the library, the reader, the GoLearn card, the events — with only what Hindi needs changed: the hi analyser (the one the
 * GoLearn extension loads for Hindi pages), a Hindi enrolment with no variety, Devanagari, the edition's own preference keys; and its build.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBibliaApp, HOME_OPEN_KEY, type BibliaApp } from '../../packages/biblia/src/app';
import { HINDI_EDITION, ORIGINAL_EDITION, editionOf, namespacedStorage } from '../../packages/biblia/src/edition';
import { IRV_BOOKS, buildIrv, cleanIrv, parseIrvBook, type HiBook } from '../../packages/biblia/src/irv';
import { devanagariNumeral, numeral } from '../../packages/biblia/src/canon';
import type { DataSource } from '../../packages/biblia/src/data';
import type { Recorder } from '../../packages/biblia/src/repo';
import { SAMPLE_VERSE } from '../../packages/biblia/src/sample';
import { formUnitId } from '../../packages/biblia/src/levels';
import { adapter as extensionHindi } from '../../packages/golearn-extension/src/analysers/hi';
import { hiAdapter } from '../../src/adapters/hi';
import type { GoEvent } from '../../packages/repository-contract/src';
import { setBody, stubLayout } from '../extension/dom';

const root = path.resolve(__dirname, '../..');
const USFM = path.join(root, 'data', 'sources', 'hi', 'usfm');

function readIrv(): ReturnType<typeof buildIrv> {
  const files = new Map<string, string>();
  for (const f of fs.readdirSync(USFM)) {
    const m = /^\d\d-([0-9A-Z]{3})hin2017\.usfm$/.exec(f);
    if (m) files.set(m[1], fs.readFileSync(path.join(USFM, f), 'utf8'));
  }
  return buildIrv(files);
}
const irv = readIrv();
const bookOf = (id: string): HiBook => irv.books.find((b) => b.book === id)!;

/** The Hindi texts as the build writes them (data/hi/…), from memory. */
const hindiSource: DataSource = {
  async fetchJson(p) {
    if (p === 'data/hi/canon.json') return irv.canon;
    const m = /^data\/hi\/([0-9A-Za-z]+)\.json$/.exec(p);
    if (m) { const b = irv.books.find((x) => x.book === m[1]); if (b) return { lang: 'hi', ...b }; }
    throw new Error(`no such file ${p}`);
  },
  async fetchBytes(p) { throw new Error(`no such file ${p}`); },
};
function fakeRecorder(): Recorder & { events: GoEvent[]; enrolments: string[] } {
  const events: GoEvent[] = [];
  const enrolments: string[] = [];
  return {
    mode: 'extension', events, enrolments,
    async identity(lang, varietyId) { const key = `${lang}|${varietyId ?? ''}`; if (!enrolments.includes(key)) enrolments.push(key); return { learnerId: 'L1', enrolmentId: `enr:${key}`, deviceId: 'D1' }; },
    async record(evs) { events.push(...evs); return { ok: true }; },
  };
}
function memoryStorage(): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map, get length() { return map.size; }, clear: () => map.clear(), key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, String(v)); }, removeItem: (k: string) => { map.delete(k); },
  };
}
const words = (sel = '.reader .prose button.word'): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>(sel)];
const settle = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('the IRV as Biblia reads it', () => {
  it('has the 66 books of the Protestant canon, 31,104 verses, and every verse is the verified text of the edition', () => {
    expect(irv.books).toHaveLength(66);
    expect(irv.canon.map((r) => r.id)).toEqual(IRV_BOOKS.map((b) => b.id));
    let n = 0;
    const verified = (JSON.parse(fs.readFileSync(path.join(root, 'data', 'verified', 'scripture.json'), 'utf8')) as { translations: Array<{ lang: string; verses: Record<string, { text: string }> }> })
      .translations.find((t) => t.lang === 'hi')!.verses;
    const usfmOf = new Map(IRV_BOOKS.map((b) => [b.id, b.usfm]));
    let compared = 0;
    for (const b of irv.books) for (const c of b.chapters) for (const v of c.verses) {
      n++;
      const want = verified[`${usfmOf.get(b.book)}.${c.n}.${v.n}`];
      if (want) { compared++; expect(v.t, `${b.book} ${c.n}:${v.n}`).toBe(want.text); }
    }
    expect(n).toBe(31_104);
    expect(compared).toBe(31_104);
    // the canon rows are the books' own verse counts
    for (const r of irv.canon) expect(r.verses).toEqual(bookOf(r.id).chapters.map((c) => c.verses.length));
  });

  it('keeps the Psalm titles before verse 1 and the letters of Psalm 119, and leaves out notes, headings and cross-references', () => {
    const ps = bookOf('Ps');
    expect(ps.chapters[2].verses[0].d).toBe('दाऊद का भजन। जब वह अपने पुत्र अबशालोम के सामने से भागा जाता था');
    expect(ps.chapters[118].verses[8].d).toBe('बेथ');
    expect(ps.chapters[0].verses[0].d).toBeUndefined(); // Psalm 1 has none
    const titles = irv.books.flatMap((b) => b.chapters.flatMap((c) => c.verses.filter((v) => v.d)));
    // 139 \d lines; Psalm 88 has two, kept as two lines of one title
    expect(titles.length).toBe(138);
    expect(ps.chapters[87].verses[0].d).toBe('कोरहवंशियों का भजन\nप्रधान बजानेवाले के लिये: महलतलग्नोत राग में एज्रावंशी हेमान का मश्कील');
    expect(irv.books.every((b) => b.book === 'Ps' || b.chapters.every((c) => c.verses.every((v) => !v.d)))).toBe(true);
    // nothing of the apparatus is left in a verse
    for (const b of irv.books) for (const c of b.chapters) for (const v of c.verses) expect(v.t, `${b.book} ${c.n}:${v.n}`).not.toMatch(/\\|\*/);
    // the references the IRV sets apart (\bdit) are gone; 16 printed inside the verse stay, as in eBible.org's text (and the verified copy above)
    const kept = irv.books.flatMap((b) => b.chapters.flatMap((c) => c.verses.filter((v) => /\([^)]*\d+:\d+[^)]*\)/.test(v.t))));
    expect(kept).toHaveLength(16);
    expect(cleanIrv('मैं\\wj*\\it \\+wj व्यवस्था\\+wj*\\it* \\f + \\fr 1:1 \\ft a note\\f* को \\bdit (रोम. 10:4) \\bdit*।')).toBe('मैं व्यवस्था को।');
  });

  it('refuses a book that does not parse rather than shipping a broken text', () => {
    expect(() => parseIrvBook('\\id GEN\n\\v 1 no chapter', 'Gen')).toThrow();
    expect(() => parseIrvBook('\\id GEN\n\\c 1\n\\v 2 two\n\\v 1 one', 'Gen')).toThrow();
  });

  it('numerals: Devanagari digits for the Hindi edition, the original edition unchanged', () => {
    expect(devanagariNumeral(119)).toBe('११९');
    expect(numeral('hi', 3)).toBe('३');
    expect(numeral('he', 1)).toBe('א׳');
  });
});

describe('the Hindi edition of the app', () => {
  let restore: () => void;
  let app: BibliaApp | undefined;
  beforeEach(() => { restore = stubLayout(); setBody('<div id="app"></div>'); window.location.hash = ''; });
  afterEach(() => { app?.destroy(); app = undefined; restore(); });

  it('is chosen by the build: editionOf("hi") is the Hindi edition, anything else the original', () => {
    expect(editionOf('hi')).toBe(HINDI_EDITION);
    expect(editionOf('original')).toBe(ORIGINAL_EDITION);
    expect(editionOf(undefined)).toBe(ORIGINAL_EDITION);
  });

  it('shows the library as Biblia does, over the Hindi canon: the testaments and divisions with their Hindi names, chapters as अध्याय', async () => {
    app = await createBibliaApp({ win: window, doc: document, edition: HINDI_EDITION, source: hindiSource, recorder: fakeRecorder(), now: () => new Date('2026-11-21T12:00:00Z') });
    expect(app.route).toBe('library');
    expect(document.querySelector('.home__title .hi')?.textContent).toBe('पवित्र बाइबल');
    expect(document.querySelector('.home__title')?.textContent).toContain('Biblia Sacra');
    const t = document.body.textContent ?? '';
    for (const s of ['Old Testament', 'पुराना नियम', 'New Testament', 'नया नियम', 'Law', 'व्यवस्था', 'Prophets', 'Epistles']) expect(t).toContain(s);
    expect(t).not.toContain('Tanakh');
    expect(document.querySelector('a[href="#/read/Gen/1"] .entry__native')?.textContent).toBe('अध्याय १');
    expect(document.querySelector('a[href="#/read/Rev/22"] .entry__native')?.textContent).toBe('अध्याय २२');
    expect(document.querySelector('.sources')?.textContent).toMatch(/Bridge Connectivity Solutions/);
    expect(document.querySelector('.sources a[rel~="license"]')?.getAttribute('href')).toBe('https://creativecommons.org/licenses/by-sa/4.0/');
  });

  it('reads Genesis 1 left to right in Devanagari, every word a button, verse numbers 1, 2, 3, the IRV paragraphs as breaks', async () => {
    app = await createBibliaApp({ win: window, doc: document, edition: HINDI_EDITION, source: hindiSource, recorder: fakeRecorder(), now: () => new Date() });
    await app.go('#/read/Gen/1');
    const prose = document.querySelector('.reader .prose')!;
    expect(prose.getAttribute('lang')).toBe('hi');
    expect(prose.getAttribute('dir')).toBe('ltr');
    expect(words().slice(0, 4).map((b) => b.textContent)).toEqual(['आदि', 'में', 'परमेश्वर', 'ने']);
    expect(document.querySelector('.verse[data-v="1"] .vn')!.textContent).toBe('1');
    expect(document.querySelector('.period')!.textContent).toMatch(/Modern Standard Hindi \(the Indian Revised Version, 2019\)/);
    expect(document.querySelector('.reader__chapter')!.textContent).toBe('उत्पत्ति १');
    // the punctuation and spacing between words are the IRV's: the verse reads back as the text
    const v1 = document.querySelector('.verse[data-v="1"]')!.textContent!.replace(/^1/, '');
    expect(v1).toBe(bookOf('Gen').chapters[0].verses[0].t);
    // Genesis 1:3 begins a paragraph in the IRV
    expect(document.querySelectorAll('.reader .prose .para-break').length).toBeGreaterThan(0);
    expect(document.querySelector('.verse[data-v="3"]')!.previousElementSibling?.classList.contains('para-break')).toBe(true);
  });

  it('a word keeps the punctuation touching it (span.wg): a line never begins with a comma or ends with an opening quote', async () => {
    app = await createBibliaApp({ win: window, doc: document, edition: HINDI_EDITION, source: hindiSource, recorder: fakeRecorder(), now: () => new Date() });
    await app.go('#/read/Gen/1');
    const verse3 = document.querySelector('.verse[data-v="3"]')!;
    expect(verse3.textContent!.replace(/^3/, '')).toBe(bookOf('Gen').chapters[0].verses[2].t);
    const groups = [...verse3.querySelectorAll('.wg')].map((g) => g.textContent);
    expect(groups).toContain('कहा,');
    expect(groups).toContain('“उजियाला');
    expect(groups).toContain('हो,”');
    // everywhere in the chapter: what stands outside a group between two boxes is only space, so a break can fall only there
    for (const n of document.querySelectorAll('.reader .prose .verse')) {
      for (const c of n.childNodes) if (c.nodeType === 3 && c.previousSibling && c.nextSibling) expect(c.textContent, n.getAttribute('data-v') ?? '').toMatch(/^[\s​]+$/);
    }
  });

  it('a Psalm title stands on its own line before verse 1, its words tappable; Psalms are set as poetry', async () => {
    app = await createBibliaApp({ win: window, doc: document, edition: HINDI_EDITION, source: hindiSource, recorder: fakeRecorder(), now: () => new Date() });
    await app.go('#/read/Ps/3');
    const title = document.querySelector('.verse.superscription')!;
    expect(title.getAttribute('data-part')).toBe('title');
    expect(title.textContent).toBe('दाऊद का भजन। जब वह अपने पुत्र अबशालोम के सामने से भागा जाता था');
    expect(title.querySelector('.vn')).toBeNull();
    expect(title.querySelectorAll('button.word').length).toBe(14);
    expect(title.nextElementSibling?.getAttribute('data-v')).toBe('1');
    expect(document.querySelector('.reader .prose')!.classList.contains('poetry')).toBe(true);
  });

  it('a tap is parsed by the hi analyser and recorded for the Hindi enrolment with no variety, as GoLearn records a Hindi page; the verse is recorded as read once', async () => {
    const rec = fakeRecorder();
    app = await createBibliaApp({ win: window, doc: document, edition: HINDI_EDITION, source: hindiSource, recorder: rec, now: () => new Date('2026-11-21T12:00:00Z') });
    await app.go('#/read/Gen/1');
    const word = words().find((b) => b.textContent === 'परमेश्वर')!;
    word.click();
    await settle();
    expect(word.classList.contains('sel')).toBe(true);
    const card = app.cardRoot()!;
    expect(card.textContent).toContain('Hindi');
    expect(card.textContent).toContain('Genesis 1:1');
    expect(rec.enrolments).toEqual(['hi|']);
    expect(rec.events.map((e) => e.kind)).toEqual(['SelectionLookedUp', 'EncounterRecorded']);
    const [sel, enc] = rec.events;
    expect(sel.languageId).toBe('hi');
    expect(sel.producer.app).toBe('golearn-ext');
    const payload = sel.payload as { readerId?: string; language?: { languageId?: string; varietyId?: string; source?: string } };
    expect(payload.readerId).toBe('biblia');
    expect(payload.language).toMatchObject({ languageId: 'hi', source: 'biblia:Gen.1.1' });
    expect(payload.language && 'varietyId' in payload.language).toBe(false);
    expect(enc.payload).toMatchObject({ contextKind: 'sentence', readerId: 'biblia' });
    // a second tap in the verse records only the selection
    words().find((b) => b.textContent === 'आकाश')!.click();
    await settle();
    expect(rec.events.map((e) => e.kind)).toEqual(['SelectionLookedUp', 'EncounterRecorded', 'SelectionLookedUp']);
  });

  it('a Psalm title and its verse are read separately: each gets its own encounter', async () => {
    const rec = fakeRecorder();
    app = await createBibliaApp({ win: window, doc: document, edition: HINDI_EDITION, source: hindiSource, recorder: rec, now: () => new Date() });
    await app.go('#/read/Ps/3');
    (document.querySelector('.verse.superscription button.word') as HTMLButtonElement).click();
    await settle();
    (document.querySelector('.verse[data-v="1"]:not(.superscription) button.word') as HTMLButtonElement).click();
    await settle();
    expect(rec.events.map((e) => e.kind)).toEqual(['SelectionLookedUp', 'EncounterRecorded', 'SelectionLookedUp', 'EncounterRecorded']);
    expect((rec.events[0].payload as { language?: { source?: string } }).language?.source).toBe('biblia:Ps.3.1');
  });

  it('the analyser is the GoLearn extension\'s own Hindi analyser, so the units Biblia records and paints are the ones GoLearn and GoReview know', () => {
    expect(extensionHindi).toBe(hiAdapter);
    expect(formUnitId('hi', 'परमेश्वर')).toBe(`form:hi:${hiAdapter.normalize('परमेश्वर')}`);
  });

  it('keeps its place and settings under its own keys (biblia-hi:…), so the original edition on the same site keeps its own', async () => {
    const storage = memoryStorage();
    storage.setItem('biblia:last', 'John/3');
    storage.setItem(HOME_OPEN_KEY, '["tanakh"]');
    app = await createBibliaApp({ win: window, doc: document, edition: HINDI_EDITION, source: hindiSource, recorder: fakeRecorder(), storage, now: () => new Date() });
    // the original edition's place is not offered here (John 3 is no Hindi place yet)
    expect(document.querySelector('.home__continue')).toBeNull();
    await app.go('#/read/Mark/2');
    expect(storage.getItem('biblia-hi:last')).toBe('Mark/2');
    expect(storage.getItem('biblia:last')).toBe('John/3');
    await app.go('#/settings');
    expect(document.querySelector('#set-hindi-size')).not.toBeNull();
    expect(document.querySelector('#set-hebrew-size')).toBeNull();
    expect(document.body.textContent).not.toContain('Hebrew');
    // the sample is this edition's own first verse, in Hindi alone
    expect([...document.querySelectorAll<HTMLElement>('#settings-sample .prose')].map((p) => p.lang)).toEqual(['hi']);
    expect(document.querySelector('#settings-sample .verse')?.textContent).toContain(SAMPLE_VERSE.hi);
    expect([...document.querySelectorAll('.settings-group > h2')].map((x) => x.textContent)).toEqual(['Text', 'Verses']);
    // the type and its licence moved to About with the rest of the sources
    await app.go('#/about');
    expect(document.body.textContent).toContain('Tiro Devanagari Hindi');
    await app.go('#/settings');
    const slider = document.querySelector('#set-hindi-size') as HTMLInputElement;
    slider.value = '30';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    expect(storage.getItem('biblia-hi:hindiSize')).toBe('30');
    expect(document.documentElement.style.getPropertyValue('--hindi-font-size')).toBe('30px');
    expect(storage.getItem(HOME_OPEN_KEY)).toBe('["tanakh"]');
    expect([...storage.map.keys()].filter((k) => k.startsWith('biblia:')).sort()).toEqual(['biblia:home-open', 'biblia:last']);
  });

  it('is a separate system on the same site: everything it keeps is under biblia-hindi/, and Biblia\'s sign-in, queue and settings are never read, written or cleared', async () => {
    const page = memoryStorage();
    const biblia = { 'biblia:session': '{"token":"T","learnerId":"L1"}', 'biblia:queue': '[{"id":"e1"}]', 'biblia:device': 'biblia:web:abc', 'biblia:last': 'John/3', 'biblia:theme': 'dark' };
    for (const [k, v] of Object.entries(biblia)) page.setItem(k, v);
    expect(namespacedStorage(page, ORIGINAL_EDITION.storageNamespace)).toBe(page); // Biblia's storage is the page's own, untouched
    const hindi = namespacedStorage(page, HINDI_EDITION.storageNamespace);
    expect(hindi.getItem('biblia:session')).toBeNull(); // not signed in through Biblia's session
    app = await createBibliaApp({ win: window, doc: document, edition: HINDI_EDITION, source: hindiSource, recorder: fakeRecorder(), storage: hindi, now: () => new Date() });
    await app.go('#/read/Gen/2');
    await app.go('#/settings');
    (document.querySelector('#settings-reset, button[data-action="reset"]') as HTMLButtonElement | null)?.click();
    hindi.setItem('biblia:queue', '[{"id":"h1"}]');
    hindi.clear();
    for (const [k, v] of Object.entries(biblia)) expect(page.getItem(k), k).toBe(v);
    expect([...page.map.keys()].filter((k) => !(k in biblia)).every((k) => k.startsWith('biblia-hindi/'))).toBe(true);
    hindi.setItem('biblia:queue', '[{"id":"h2"}]');
    expect(page.getItem('biblia-hindi/biblia:queue')).toBe('[{"id":"h2"}]');
    expect(hindi.length).toBe(1);
    expect(hindi.key(0)).toBe('biblia:queue');
  });

  it('the Sources page names the IRV, its licence and the changes, and the limits', async () => {
    app = await createBibliaApp({ win: window, doc: document, edition: HINDI_EDITION, source: hindiSource, recorder: fakeRecorder(), now: () => new Date() });
    await app.go('#/sources');
    const t = document.body.textContent ?? '';
    expect(t).toContain('Copyright © 2017, 2018, 2019 Bridge Connectivity Solutions');
    expect(t).toContain('not endorsed by the original licensor');
    expect(t).toMatch(/reviewed by a Hindi scholar or a native speaker/);
    expect(t).not.toMatch(/SBLGNT|Westminster Leningrad|Masoretic/);
  });
});

describe('the Hindi edition build', () => {
  const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'biblia-hi-'));
  afterAll(() => { fs.rmSync(scratch, { recursive: true, force: true }); });
  const out = path.join(scratch, 'standalone-hi');
  const read = (f: string): string => fs.readFileSync(path.join(out, f), 'utf8');

  it('builds the installable Hindi edition: its texts, page, manifest and a worker with its own caches', () => {
    execFileSync(process.execPath, [vite, 'build', '-c', 'packages/biblia/vite.config.ts', '--mode', 'standalone-hi'], {
      cwd: root, stdio: 'pipe', timeout: 120_000, env: { ...process.env, BIBLIA_OUT: out, BIBLIA_SERVICE_URL: 'https://repo.golearn-global-languages.com' },
    });
    // the texts: the 66 books, the canon and the attribution; none of the original edition's texts or lexicon
    expect(fs.readdirSync(path.join(out, 'data', 'hi')).filter((f) => f.endsWith('.json')).length).toBe(66 + 2);
    expect(JSON.parse(read('data/hi/canon.json'))).toEqual(irv.canon);
    expect(JSON.parse(read('data/hi/Gen.json'))).toEqual({ lang: 'hi', ...bookOf('Gen') });
    expect(JSON.parse(read('data/hi/SOURCES.json')).text.licenceUrl).toBe('https://creativecommons.org/licenses/by-sa/4.0/');
    expect(fs.existsSync(path.join(out, 'data', 'canon.json'))).toBe(false);
    expect(fs.existsSync(path.join(out, 'lexicon'))).toBe(false);
    // the page
    const html = read('index.html');
    expect(html).toContain('<title>Biblia — हिंदी</title>');
    expect(html).toContain('<link rel="stylesheet" href="./edition-hi.css">');
    expect(html).toContain('<meta name="biblia-edition" content="standalone">');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Biblia हिंदी">');
    expect(read('edition-hi.css')).toContain("url('./fonts/tiro-devanagari-hindi-devanagari-400-normal.woff2')");
    for (const f of ['tiro-devanagari-hindi-devanagari-400-normal.woff2', 'tiro-devanagari-hindi-OFL.txt', 'EB-Garamond-OFL.txt']) expect(fs.existsSync(path.join(out, 'fonts', f)), f).toBe(true);
    expect(fs.readdirSync(path.join(out, 'fonts')).some((f) => f.startsWith('frank-ruhl'))).toBe(true); // public/ as it is; the Hebrew face is simply never asked for
    const m = JSON.parse(read('manifest.webmanifest')) as { name: string; short_name: string };
    expect(m.name).toBe('Biblia — हिंदी');
    expect(JSON.parse(read('config.json')).serviceUrl).toBe('https://repo.golearn-global-languages.com');
    // the worker: its own cache names, the shell precached, the texts not
    const sw = read('sw.js');
    expect(sw).not.toMatch(/__[A-Z_]+__/);
    expect(sw).toContain("var SHELL_PREFIX = 'biblia-hindi-shell-';");
    expect(sw).toContain("var DATA_PREFIX = 'biblia-hindi-data-';");
    const list = JSON.parse(/var PRECACHE = (\[[\s\S]*?\n\]);/.exec(sw)?.[1] ?? 'null') as string[];
    expect(list).toContain('./edition-hi.css');
    expect(list.filter((f) => f.startsWith('./data/'))).toEqual([]);
    // the app inside is the Hindi edition
    const js = fs.readdirSync(path.join(out, 'assets')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(out, 'assets', f), 'utf8')).join('\n');
    expect(js).toContain('data/hi/canon.json');
  }, 150_000);
});

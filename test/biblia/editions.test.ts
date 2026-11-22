// @vitest-environment jsdom
/**
 * Biblia's Thai, German and Spanish editions (packages/biblia/src/edition.ts, src/usfm.ts; docs/ecosystem/BIBLIA-EDITIONS.md): each Bible read
 * from its committed USFM and held to an independent copy where the repository has one (data/verified/scripture.json: the OTCV and the
 * Reina-Valera 1909); the same app over it with only what the language needs changed; its build. The Hindi edition has its own file
 * (hindi.test.ts) and Biblia itself its own (app.test.ts and the rest): neither changes here.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBibliaApp, type BibliaApp } from '../../packages/biblia/src/app';
import { GERMAN_EDITION, SPANISH_EDITION, THAI_EDITION, TRANSLATION_EDITIONS, editionOf, namespacedStorage, type Edition } from '../../packages/biblia/src/edition';
import { PROTESTANT_BOOKS, buildEditionText, cleanUsfm, parseUsfmBook, type TextBook } from '../../packages/biblia/src/usfm';
import { numeral, thaiNumeral } from '../../packages/biblia/src/canon';
import type { DataSource } from '../../packages/biblia/src/data';
import type { Recorder } from '../../packages/biblia/src/repo';
import { formUnitId } from '../../packages/biblia/src/levels';
import { languageMeta } from '../../packages/golearn-extension/src/parser/registry';
import { adapter as extTh } from '../../packages/golearn-extension/src/analysers/th';
import { adapter as extDe } from '../../packages/golearn-extension/src/analysers/de';
import { adapter as extEs } from '../../packages/golearn-extension/src/analysers/es';
import { thAdapter } from '../../src/adapters/th';
import { deAdapter } from '../../src/adapters/de';
import { esAdapter } from '../../src/adapters/es';
import type { GoEvent } from '../../packages/repository-contract/src';
import { setBody, stubLayout } from '../extension/dom';

const root = path.resolve(__dirname, '../..');

function readEdition(e: Edition): ReturnType<typeof buildEditionText> {
  const tr = e.translation!;
  const files = new Map<string, string>();
  for (const f of fs.readdirSync(path.join(root, tr.usfm.dir))) { const m = tr.usfm.file.exec(f); if (m) files.set(m[1], fs.readFileSync(path.join(root, tr.usfm.dir, f), 'utf8')); }
  return buildEditionText(files, tr.lang, tr.usfm.options);
}
const TEXT = new Map(([THAI_EDITION, GERMAN_EDITION, SPANISH_EDITION] as const).map((e) => [e.id, readEdition(e)]));
const bookOf = (e: Edition, id: string): TextBook => TEXT.get(e.id)!.books.find((b) => b.book === id)!;
const verified = (JSON.parse(fs.readFileSync(path.join(root, 'data', 'verified', 'scripture.json'), 'utf8')) as { translations: Array<{ lang: string; verses: Record<string, { text: string }> }> }).translations;
const usfmOf = new Map(PROTESTANT_BOOKS.map((b) => [b.id, b.usfm]));
const allVerses = (e: Edition) => TEXT.get(e.id)!.books.flatMap((b) => b.chapters.flatMap((c) => c.verses.map((v) => ({ key: `${usfmOf.get(b.book)}.${c.n}.${v.n}`, ...v }))));

describe('the texts', () => {
  it('the Thai OTCV: 66 books, 31,087 verses, every one the verified text of the edition; the Psalm titles kept before verse 1', () => {
    const v = verified.find((t) => t.lang === 'th')!.verses;
    const ours = allVerses(THAI_EDITION);
    expect(TEXT.get('th')!.books).toHaveLength(66);
    expect(ours).toHaveLength(31_087);
    for (const x of ours) expect(x.t, x.key).toBe(v[x.key]?.text);
    expect(Object.keys(v)).toHaveLength(31_087);
    expect(bookOf(THAI_EDITION, 'Ps').chapters[2].verses[0].d).toBe('(บท​สดุดี​ของ​ดาวิด เมื่อ​หนี​จาก​อับซาโลม​ลูก​ชาย​ของ​เขา)');
    // the sixteen verses modern texts omit, which the OTCV numbers with only a note, are left out (Matthew 17:21)
    expect(bookOf(THAI_EDITION, 'Matt').chapters[16].verses.map((x) => x.n)).not.toContain(21);
    // the strict USFM rule: the space after an opening marker separates, it is not text ("รวม\litl 12 คน")
    expect(cleanUsfm('รวม\\litl 12 คน\\litl*', { markerSpace: 'delimiter' })).toBe('รวม12 คน');
  });

  it('the Reina-Valera 1909: 31,084 verses, every one the verified text but two where the verified copy itself kept Strong’s markup', () => {
    const v = verified.find((t) => t.lang === 'es')!.verses;
    const ours = allVerses(SPANISH_EDITION);
    expect(ours).toHaveLength(31_084);
    const differ = ours.filter((x) => x.t !== v[x.key]?.text);
    expect(differ.map((x) => x.key)).toEqual(['2CH.3.3', 'JOB.41.15']);
    for (const x of differ) { expect(v[x.key].text).toContain('|strong='); expect(v[x.key].text.replace(/\|strong="[^"]*"/g, '')).toBe(x.t); }
    for (const x of ours) expect(x.t, x.key).not.toMatch(/[\\|]|strong=/);
    // eighteen empty verse numbers of the source (where the Spanish numbering differs) are left out; Jonah 1 ends at 16
    expect(bookOf(SPANISH_EDITION, 'Jonah').chapters[0].verses.at(-1)!.n).toBe(16);
  });

  it('the Schlachter 1951: 31,101 verses, no markup, the source’s bracketed German verse numbers left out, its own brackets and “Pause” kept', () => {
    const ours = allVerses(GERMAN_EDITION);
    expect(ours).toHaveLength(31_101);
    for (const x of ours) expect(x.t, x.key).not.toMatch(/\\|\(\d{1,3}-\d{1,3}\)/);
    expect(bookOf(GERMAN_EDITION, 'Ps').chapters[2].verses[0].t).toBe('Ein Psalm Davids, als er vor seinem Sohne Absalom floh. Ach, HERR, wie zahlreich sind meine Feinde! Viele stehen wider mich auf;');
    expect(bookOf(GERMAN_EDITION, 'Matt').chapters[20].verses.map((x) => x.n)).not.toContain(44); // empty in the source
    expect(ours.some((x) => x.t.includes('(Pause.)'))).toBe(true);
    expect(ours.some((x) => /\[[^\]]+\]/.test(x.t))).toBe(true);
    expect(bookOf(GERMAN_EDITION, 'Gen').chapters[0].verses[0].t).toBe('Im Anfang schuf Gott den Himmel und die Erde.');
  });

  it('a book that does not parse stops the build', () => {
    expect(() => parseUsfmBook('\\id GEN\n\\c 1\n\\v 2 two\n\\v 1 one', 'Gen')).toThrow();
    expect(() => parseUsfmBook('\\id GEN\n\\c 1\n\\v 1 \\f + \\ft only a note\\f*', 'Gen')).toThrow(/all empty/);
  });

  it('numerals: Thai digits for the Thai edition; German and Spanish write 1, 2, 3', () => {
    expect(thaiNumeral(119)).toBe('๑๑๙');
    expect(numeral('th', 3)).toBe('๓');
    expect(numeral('de', 3)).toBe('3');
    expect(numeral('es', 12)).toBe('12');
  });

  it('each analyser is the GoLearn extension’s own, so the units Biblia records are the ones GoLearn and GoReview know', () => {
    expect(extTh).toBe(thAdapter);
    expect(extDe).toBe(deAdapter);
    expect(extEs).toBe(esAdapter);
    expect(formUnitId('de', 'Anfang')).toBe(`form:de:${deAdapter.normalize('Anfang')}`);
  });
});

function sourceOf(e: Edition): DataSource {
  const { canon, books } = TEXT.get(e.id)!;
  const lang = e.translation!.lang;
  return {
    async fetchJson(p) {
      if (p === `data/${lang}/canon.json`) return canon;
      const m = new RegExp(`^data/${lang}/([0-9A-Za-z]+)\\.json$`).exec(p);
      if (m) { const b = books.find((x) => x.book === m[1]); if (b) return { lang, ...b }; }
      throw new Error(`no such file ${p}`);
    },
    async fetchBytes(p) { throw new Error(`no such file ${p}`); },
  };
}
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
const settle = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms));

const CASES = [
  { e: THAI_EDITION, masthead: 'พระคริสตธรรมคัมภีร์', testaments: ['พันธสัญญาเดิม', 'พันธสัญญาใหม่'], chapter1: 'บทที่ 1', gen1: 'ปฐมกาล', adapter: thAdapter, period: /Standard Thai/, size: 'thai' },
  { e: GERMAN_EDITION, masthead: 'Die Heilige Schrift', testaments: ['Altes Testament', 'Neues Testament'], chapter1: 'Kapitel 1', gen1: 'Das 1. Buch Mose (Genesis)', adapter: deAdapter, period: /Schlachter Bible, 1951/, size: 'german' },
  { e: SPANISH_EDITION, masthead: 'Santa Biblia', testaments: ['Antiguo Testamento', 'Nuevo Testamento'], chapter1: 'Capítulo 1', gen1: 'Génesis', adapter: esAdapter, period: /Reina-Valera revision of 1909/, size: 'spanish' },
] as const;

describe.each(CASES)('the $e.translation.languageName edition of the app', ({ e, masthead, testaments, chapter1, gen1, adapter, period, size }) => {
  let restore: () => void;
  let app: BibliaApp | undefined;
  beforeEach(() => { restore = stubLayout(); setBody('<div id="app"></div>'); window.location.hash = ''; });
  afterEach(() => { app?.destroy(); app = undefined; restore(); });
  const lang = e.translation!.lang;

  it('is chosen by the build', () => { expect(editionOf(e.id)).toBe(e); expect(TRANSLATION_EDITIONS).toContain(e); });

  it('shows the library as Biblia does, with the testaments and chapters named in the language', async () => {
    app = await createBibliaApp({ win: window, doc: document, edition: e, source: sourceOf(e), recorder: fakeRecorder(), now: () => new Date('2026-11-21T12:00:00Z') });
    expect(document.querySelector(`.home__title .${lang}`)?.textContent).toBe(masthead);
    expect(document.querySelector('.home__title')?.textContent).toContain('Biblia Sacra');
    const t = document.body.textContent ?? '';
    for (const s of testaments) expect(t).toContain(s);
    expect(t).not.toContain('Tanakh');
    expect(document.querySelector('a[href="#/read/Gen/1"] .entry__native')?.textContent).toBe(`${chapter1.replace(/ 1$/, '')} ${numeral(lang, 1)}`);
    expect(document.querySelector('.sources')?.textContent).toContain(e.translation!.attribution.copyright);
  });

  it('reads Genesis 1 with every word a button, cut by the language’s analyser, the edition’s own text between them', async () => {
    app = await createBibliaApp({ win: window, doc: document, edition: e, source: sourceOf(e), recorder: fakeRecorder(), now: () => new Date() });
    await app.go('#/read/Gen/1');
    const prose = document.querySelector('.reader .prose')!;
    expect(prose.getAttribute('lang')).toBe(lang);
    expect(prose.getAttribute('dir')).toBe('ltr');
    const v1 = bookOf(e, 'Gen').chapters[0].verses[0].t;
    const expected = adapter.tokenize(v1).filter((x) => x.isWord).map((x) => v1.slice(x.start, x.end));
    const verse = document.querySelector('.verse[data-v="1"]')!;
    expect([...verse.querySelectorAll('button.word')].map((b) => b.textContent)).toEqual(expected);
    expect(verse.textContent!.replace(/^1/, '')).toBe(v1);
    expect(document.querySelector('.period')!.textContent).toMatch(period);
    expect(document.querySelector('.reader__chapter')!.textContent).toBe(`${gen1} ${numeral(lang, 1)}`);
  });

  it('a tap is recorded for the language’s enrolment with no variety, as GoLearn records a web page in it', async () => {
    const rec = fakeRecorder();
    app = await createBibliaApp({ win: window, doc: document, edition: e, source: sourceOf(e), recorder: rec, now: () => new Date('2026-11-21T12:00:00Z') });
    await app.go('#/read/John/3');
    const word = document.querySelector('.verse[data-v="16"] button.word') as HTMLButtonElement;
    word.click();
    await settle();
    expect(app.cardRoot()!.textContent).toContain(`${e.translation!.languageName} · John 3:16`);
    expect(rec.enrolments).toEqual([`${lang}|`]);
    expect(rec.events.map((x) => x.kind)).toEqual(['SelectionLookedUp', 'EncounterRecorded']);
    const payload = rec.events[0].payload as { readerId?: string; language?: Record<string, unknown> };
    expect(rec.events[0].languageId).toBe(lang);
    expect(payload.readerId).toBe('biblia');
    expect(payload.language).toMatchObject({ languageId: lang, source: 'biblia:John.3.16' });
    expect(payload.language && 'varietyId' in payload.language).toBe(false);
  });

  it('keeps everything under its own storage namespace and its own preference keys; Settings has its text size and no Hebrew row', async () => {
    const page = memoryStorage();
    page.setItem('biblia:session', 'B'); page.setItem('biblia-hindi/biblia:session', 'H');
    const storage = namespacedStorage(page, e.storageNamespace);
    app = await createBibliaApp({ win: window, doc: document, edition: e, source: sourceOf(e), recorder: fakeRecorder(), storage, now: () => new Date() });
    await app.go('#/read/Mark/2');
    await app.go('#/settings');
    expect(document.querySelector(`#set-${size}-size`)).not.toBeNull();
    expect(document.querySelector('#set-hebrew-size')).toBeNull();
    expect(document.body.textContent).not.toContain('Hebrew text');
    const slider = document.querySelector(`#set-${size}-size`) as HTMLInputElement;
    slider.value = '30';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.documentElement.style.getPropertyValue(`--${size}-font-size`)).toBe('30px');
    expect(page.getItem(`${e.storageNamespace}${e.prefix}last`)).toBe('Mark/2');
    expect(page.getItem(`${e.storageNamespace}${e.prefix}${size}Size`)).toBe('30');
    expect(page.getItem('biblia:session')).toBe('B');
    expect(page.getItem('biblia-hindi/biblia:session')).toBe('H');
    expect([...page.map.keys()].filter((k) => k !== 'biblia:session' && k !== 'biblia-hindi/biblia:session').every((k) => k.startsWith(e.storageNamespace))).toBe(true);
    // the native-numeral choice only where the text has numerals of its own
    expect(document.body.textContent!.includes('๑, ๒, ๓')).toBe(lang === 'th');
  });

  it('the Sources page gives the attribution the licence asks for, the changes, and the limits', async () => {
    app = await createBibliaApp({ win: window, doc: document, edition: e, source: sourceOf(e), recorder: fakeRecorder(), now: () => new Date() });
    await app.go('#/sources');
    const a = e.translation!.attribution;
    const t = document.body.textContent ?? '';
    expect(t).toContain(a.copyright);
    expect(t).toContain(a.changes);
    if (a.notice) expect(t).toContain(a.notice);
    expect(t.includes("shared under the same licence")).toBe(a.shareAlike);
    const link = document.querySelector('a[rel~="license"]');
    expect(link?.getAttribute('href') ?? null).toBe(a.licenceUrl ?? null);
    expect(t).toMatch(new RegExp(`reviewed by a ${e.translation!.languageName} scholar`));
    // GoLearn's own word on an experimental analyser (Thai, German) is repeated there
    const experimental = languageMeta(lang)?.experimental;
    if (experimental) expect(t).toContain(experimental);
    expect(!!experimental).toBe(lang === 'th' || lang === 'de');
    expect(t).not.toMatch(/SBLGNT|Masoretic|Indian Revised/);
  });
});

describe('the editions’ builds', () => {
  const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'biblia-editions-'));
  afterAll(() => { fs.rmSync(scratch, { recursive: true, force: true }); });

  it.each(CASES)('builds the installable $e.translation.languageName edition: its texts, page, manifest and its own caches', ({ e }) => {
    const out = path.join(scratch, e.id);
    const lang = e.translation!.lang;
    execFileSync(process.execPath, [vite, 'build', '-c', 'packages/biblia/vite.config.ts', '--mode', `standalone-${e.id}`], {
      cwd: root, stdio: 'pipe', timeout: 120_000, env: { ...process.env, BIBLIA_OUT: out, BIBLIA_SERVICE_URL: 'https://repo.golearn-global-languages.com', BIBLIA_EDITION: '' },
    });
    const read = (f: string): string => fs.readFileSync(path.join(out, f), 'utf8');
    expect(fs.readdirSync(path.join(out, 'data', lang)).filter((f) => f.endsWith('.json'))).toHaveLength(66 + 2);
    expect(JSON.parse(read(`data/${lang}/canon.json`))).toEqual(TEXT.get(e.id)!.canon);
    const sources = JSON.parse(read(`data/${lang}/SOURCES.json`));
    expect(sources.text.copyright).toBe(e.translation!.attribution.copyright);
    expect(fs.existsSync(path.join(out, 'data', 'canon.json'))).toBe(false);
    expect(fs.existsSync(path.join(out, 'data', 'hi'))).toBe(false);
    expect(fs.existsSync(path.join(out, 'lexicon'))).toBe(false);
    const html = read('index.html');
    expect(html).toContain(`<title>${e.site.title}</title>`);
    expect(html).toContain(`<meta name="apple-mobile-web-app-title" content="${e.site.appName}">`);
    expect(html).not.toContain('edition-hi.css');
    const m = JSON.parse(read('manifest.webmanifest')) as { name: string; short_name: string; description: string };
    expect([m.name, m.short_name, m.description]).toEqual([e.site.title, e.site.appName, e.site.description]);
    const sw = read('sw.js');
    expect(sw).toContain(`var SHELL_PREFIX = '${e.site.slug}-shell-';`);
    expect(sw).toContain(`var DATA_PREFIX = '${e.site.slug}-data-';`);
    expect(fs.readdirSync(path.join(out, 'fonts')).some((f) => f.startsWith('tiro-'))).toBe(false);
    const js = fs.readdirSync(path.join(out, 'assets')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(out, 'assets', f), 'utf8')).join('\n');
    expect(js).toContain(`data/${lang}/canon.json`);
  }, 150_000);
});

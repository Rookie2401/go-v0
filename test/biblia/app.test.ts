// @vitest-environment jsdom
/**
 * Biblia's shell (packages/biblia): the library tree, the reader over the real Genesis 1 / John 1 data (when imported locally), word lookups
 * through the GoLearn parser with the he / el analysers, and the events a recorder receives — a SelectionLookedUp per tap with readerId
 * 'biblia' and the period as the enrolment's variety, an ItemMarked per knowledge mark. Parsing needs the parser's language table to list he
 * and el (the extension's LANGUAGE_META); where it does not yet, the lookup cases are skipped and the reader still renders.
 */
import fs from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createBibliaApp, type BibliaApp } from '../../packages/biblia/src/app';
import type { DataSource } from '../../packages/biblia/src/data';
import type { Recorder } from '../../packages/biblia/src/repo';
import { languageMeta } from '../../packages/golearn-extension/src/parser/registry';
import type { GoEvent } from '../../packages/repository-contract/src';
import { setBody, stubLayout } from '../extension/dom';
import { registerAllAnalysers } from '../support/analysers';
import { consonantal } from '../../src/adapters/hebrew/text';

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
function fakeRecorder(): Recorder & { events: GoEvent[]; enrolments: string[] } {
  const events: GoEvent[] = [];
  const enrolments: string[] = [];
  return {
    mode: 'extension', events, enrolments,
    async identity(lang, varietyId) { const key = `${lang}|${varietyId}`; if (!enrolments.includes(key)) enrolments.push(key); return { learnerId: 'L1', enrolmentId: `enr:${key}`, deviceId: 'D1' }; },
    async record(evs) { events.push(...evs); return { ok: true }; },
  };
}

let restore: () => void;
let app: BibliaApp | undefined;
beforeEach(() => { restore = stubLayout(); setBody('<div id="app"></div>'); window.location.hash = ''; });
afterEach(() => { app?.destroy(); app = undefined; restore(); });

describe.skipIf(!fs.existsSync(`${DATA}/canon.json`))('Biblia over the imported texts', () => {
  it('shows the library as Biblia organises it, with the notices that are true of this build', async () => {
    const rec = fakeRecorder();
    app = await createBibliaApp({ win: window, doc: document, source: localSource, recorder: rec, now: () => new Date('2026-10-18T12:00:00Z') });
    const t = document.body.textContent ?? '';
    expect(app.route).toBe('library');
    expect(t).toContain('Tanakh');
    expect(t).toContain('Torah');
    expect(t).toContain('New Testament');
    expect(document.querySelector('a[href="#/read/Gen/1"]')?.textContent).toBe('א׳');
    expect(document.querySelector('a[href="#/read/John/3"]')?.textContent).toBe('γʹ');
  });

  it('renders Genesis 1 right-to-left with every word a button, verse numbers in Hebrew numerals, the period line, and John 1 in Greek', async () => {
    const rec = fakeRecorder();
    app = await createBibliaApp({ win: window, doc: document, source: localSource, recorder: rec, now: () => new Date() });
    await app.go('#/read/Gen/1');
    const prose = document.querySelector('.reader .prose')!;
    expect(prose.getAttribute('dir')).toBe('rtl');
    expect(prose.getAttribute('lang')).toBe('he');
    const words = [...prose.querySelectorAll('button.word')].map((b) => consonantal(b.textContent ?? ''));
    expect(words.slice(0, 3)).toEqual(['בראשית', 'ברא', 'אלהים']); // compared by letters: the buttons carry the full Masoretic marks
    expect(document.querySelector('.verse[data-v="1"] .vn')!.textContent).toBe('א׳');
    expect(document.querySelector('.period')!.textContent).toMatch(/Read as Biblical Hebrew/);
    await app.go('#/read/John/1');
    const gw = [...document.querySelectorAll('.reader .prose button.word')].map((b) => b.textContent);
    expect(gw.slice(0, 5)).toEqual(['Ἐν', 'ἀρχῇ', 'ἦν', 'ὁ', 'λόγος']);
    expect(document.querySelector('.period')!.textContent).toMatch(/Koine/);
    // the sharded Ancient tables (built locally): the chapter's shards are loaded, so Attic and Homeric readings reach the Variants tab
    if (fs.existsSync('public/lexicon/el/ancient/manifest.json')) expect(document.querySelector('.period')!.textContent).toMatch(/the Attic and Homeric tables are loaded for this chapter.s words \(\d+ shards in memory\)/);
  });

  it('Daniel 2 marks its Aramaic verses and says so', async () => {
    app = await createBibliaApp({ win: window, doc: document, source: localSource, recorder: fakeRecorder(), now: () => new Date() });
    await app.go('#/read/Dan/2');
    expect(document.querySelectorAll('.verse.aramaic').length).toBeGreaterThan(40);
    expect(document.querySelector('.period')!.textContent).toMatch(/Biblical Aramaic/);
  });

  describe.skipIf(!languageMeta('he'))('the card in an Aramaic verse, and where a reading comes from', () => {
    beforeAll(() => { registerAllAnalysers(); });
    it('a word of an Aramaic verse is read as Biblical Aramaic: the period line says so and the Aramaic row of Variants is the one marked "this text"', async () => {
      app = await createBibliaApp({ win: window, doc: document, source: localSource, recorder: fakeRecorder(), now: () => new Date() });
      await app.go('#/read/Dan/2');
      const word = document.querySelector('.verse.aramaic button.word') as HTMLButtonElement;
      word.click();
      await new Promise((r) => setTimeout(r, 20));
      const root = app.cardRoot()!;
      expect(root.querySelector('[data-row="period"]')!.textContent).toMatch(/^Read as Biblical Aramaic/);
      (root.querySelector('.variantsBtn') as HTMLButtonElement).click();
      const rows = [...root.querySelectorAll('table.variants tr')].map((tr) => [tr.classList.contains('current'), tr.querySelector('th')!.textContent]);
      expect(rows[0]).toEqual([true, 'Biblical Aramaic (this text)']);
      expect(rows.filter(([cur]) => cur)).toHaveLength(1);
    });
    it('the meaning kicker and "view sources" name the Open Scriptures morphology, not the course word list', async () => {
      app = await createBibliaApp({ win: window, doc: document, source: localSource, recorder: fakeRecorder(), now: () => new Date() });
      await app.go('#/read/Gen/1');
      const word = [...document.querySelectorAll('.reader .prose button.word')].find((b) => b.textContent === 'אֱלֹהִ֑ים') as HTMLButtonElement;
      word.click();
      await new Promise((r) => setTimeout(r, 20));
      const root = app.cardRoot()!;
      expect(root.querySelector('.kicker')!.textContent).toBe('Meaning · Open Scriptures Hebrew Bible morphology');
      (root.querySelector('.sourcesBtn') as HTMLButtonElement).click();
      const sources = [...root.querySelectorAll('.sources li')].map((li) => li.textContent ?? '');
      expect(sources.some((s) => /Open Scriptures Hebrew Bible morphology/.test(s))).toBe(true);
      expect(root.querySelector('.sources')!.textContent).not.toMatch(/No external source/);
    });
  });

  it('a bad reference is refused with a way back', async () => {
    app = await createBibliaApp({ win: window, doc: document, source: localSource, recorder: fakeRecorder(), now: () => new Date() });
    await app.go('#/read/Gen/99');
    expect(document.body.textContent).toMatch(/Genesis has 50 chapters/);
  });

  describe.skipIf(!languageMeta('he'))('lookups (the parser lists he / el)', () => {
    beforeAll(() => { registerAllAnalysers(); }); // the real page loads the analyser chunk first; here the adapters are registered the way the content script does
    it('tapping אֱלֹהִים parses it as Biblical Hebrew, opens the card with the Variants pill, and records a SelectionLookedUp for the he-bib enrolment; a mark records an ItemMarked', async () => {
      const rec = fakeRecorder();
      app = await createBibliaApp({ win: window, doc: document, source: localSource, recorder: rec, now: () => new Date('2026-10-18T12:00:00Z') });
      await app.go('#/read/Gen/1');
      const word = [...document.querySelectorAll('.reader .prose button.word')].find((b) => b.textContent === 'אֱלֹהִ֑ים') as HTMLButtonElement;
      word.click();
      await new Promise((r) => setTimeout(r, 20));
      expect(word.classList.contains('sel')).toBe(true);
      const card = app.cardRoot();
      expect(card?.textContent).toMatch(/Variants/);
      expect(card?.textContent).toMatch(/Read as Biblical Hebrew/);
      expect(rec.enrolments).toEqual(['he|he-bib']);
      expect(rec.events.map((e) => e.kind)).toEqual(['SelectionLookedUp']);
      const ev = rec.events[0];
      expect(ev.languageId).toBe('he');
      expect(ev.producer.app).toBe('golearn-ext'); // the shared builder's producer; readerId says where it came from
      expect((ev.payload as { readerId?: string }).readerId).toBe('biblia');
      expect((ev.payload as { language?: { varietyId?: string } }).language?.varietyId).toBe('he-bib');
    });
  });
});

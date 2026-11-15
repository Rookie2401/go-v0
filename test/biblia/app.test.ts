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
import { LEVEL_ATTR } from '../../packages/biblia/src/levels';
import type { AccountService } from '../../packages/biblia/src/account';
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
  it('keeps account speech off until explicit consent is recorded, then records withdrawal immediately', async () => {
    const rec = fakeRecorder();
    app = await createBibliaApp({ win: window, doc: document, source: localSource, recorder: rec,
      speechAccount: async () => ({ serviceUrl: 'https://repo.example', token: 'session', learnerId: 'L1' }), now: () => new Date('2026-10-18T12:00:00Z') });
    await app.go('#/settings');
    const toggle = document.querySelector<HTMLInputElement>('#settings-remote-speech')!;
    expect(toggle.disabled).toBe(false);
    expect(toggle.checked).toBe(false);
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rec.events.at(-1)).toMatchObject({ kind: 'ConsentGiven', payload: { consent: 'remote-speech', scope: 'remote-speech' } });
    expect(toggle.checked).toBe(true);
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rec.events.at(-1)).toMatchObject({ kind: 'ConsentWithdrawn', payload: { consent: 'remote-speech', scope: 'remote-speech' } });
    expect(toggle.checked).toBe(false);
  });

  it('shows the library as Biblia organises it, with the notices that are true of this build', async () => {
    const rec = fakeRecorder();
    app = await createBibliaApp({ win: window, doc: document, source: localSource, recorder: rec, now: () => new Date('2026-10-18T12:00:00Z') });
    const t = document.body.textContent ?? '';
    expect(app.route).toBe('library');
    expect(t).toContain('Tanakh');
    expect(t).toContain('Torah');
    expect(t).toContain('New Testament');
    expect(document.querySelector('a[href="#/read/Gen/1"] .entry__native')?.textContent).toBe('פֶּרֶק א׳'); // the chapter entry: "Chapter 1", the native heading, the verse count
    expect(document.querySelector('a[href="#/read/John/3"] .entry__native')?.textContent).toBe('Κεφάλαιον γʹ');
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
      expect(root.querySelector('#panel-variants')!.textContent).toMatch(/This text is read as Biblical Aramaic/);
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
      expect(root.querySelector('.kicker')!.textContent).toBe('Meaning · Lemma meaning');
      (root.querySelector('.sourcesBtn') as HTMLButtonElement).click();
      const sources = [...root.querySelectorAll('.sources li')].map((li) => li.textContent ?? '');
      expect(sources.some((s) => /Open Scriptures Hebrew Bible morphology/.test(s))).toBe(true);
      expect(root.querySelector('.sources')!.textContent).not.toMatch(/No external source/);
    });
    it('a verb card says the form\'s own English, not the citation: וַיֹּאמֶר is "And he said" (the owner, 2026-11-03)', async () => {
      app = await createBibliaApp({ win: window, doc: document, source: localSource, recorder: fakeRecorder(), now: () => new Date() });
      await app.go('#/read/Gen/1');
      const word = [...document.querySelectorAll('.reader .prose button.word')].find((b) => consonantal(b.textContent ?? '') === 'ויאמר') as HTMLButtonElement;
      expect(word).toBeDefined();
      word.click();
      await new Promise((r) => setTimeout(r, 20));
      const root = app.cardRoot()!;
      expect(root.querySelector('[data-row="meaning"]')!.textContent).toContain('And he said');
      expect(root.querySelector('.kicker')!.textContent).not.toBe('Meaning · Lemma meaning');
    });
    it('Isaiah 1:2: וְרוֹמַמְתִּי is "And I brought up", with its root, its pieces and why, and the card no longer says a dictionary service is missing (the owner, 2026-11-05)', async () => {
      app = await createBibliaApp({ win: window, doc: document, source: localSource, recorder: fakeRecorder(), now: () => new Date() });
      await app.go('#/read/Isa/1');
      const word = [...document.querySelectorAll('.reader .prose button.word')].find((b) => consonantal(b.textContent ?? '') === 'ורוממתי') as HTMLButtonElement;
      expect(word).toBeDefined();
      word.click();
      await new Promise((r) => setTimeout(r, 20));
      const root = app.cardRoot()!;
      expect(root.querySelector('[data-row="meaning"]')!.textContent).toContain('And I brought up');
      expect(root.textContent).not.toMatch(/exalteded/);
      // the compact card stays compact: the form analysis waits behind "analysis"
      expect((root.querySelector('#panel-analysis') as HTMLElement).hasAttribute('hidden')).toBe(true);
      expect(root.querySelector('[data-row="form-components"]')!.getAttribute('aria-label')).toBe('Parts of the word: וְ: and; רוֹמַמְ: Polel verbal base; תִּי: perfect first person common singular ending');
      expect(root.querySelector('[data-row="form-root"]')!.textContent).toContain('רום');
      expect(root.querySelector('[data-row="form-stem"]')!.textContent).toContain('hollow root');
      expect(root.querySelector('[data-row="form-context"]')!.textContent).toContain('children');
      expect(root.textContent).not.toMatch(/No dictionary service/);
      expect(root.textContent).toContain('attested in the sources'); // the forms of the lemma are the Tanakh's, not the rules'
      expect(root.textContent).toContain('Biblia does not carry full dictionary entries');
    });
  });

  describe.skipIf(!languageMeta('he'))('levels: met only in passing (2026-11-05)', () => {
    beforeAll(() => { registerAllAnalysers(); });
    it('a tap records the other words as met, but they keep reading New; only the tapped word reads Seen', async () => {
      const rec = fakeRecorder();
      // a signed-in service whose rows say Seen for every unit (what the Repository's rule makes of a bare encounter), with nothing but exposure behind it
      const passing = (unitId: string) => ({ learnerId: 'L1', unitId, languageId: 'he', level: 'seen', encounters: 1, dimensions: { exposure: { observations: 1, negative: 0, positive: 0 } } });
      const api = { knowledge: async (ids?: string[]) => ({ ok: true as const, status: 200, data: { knowledge: (ids ?? []).map(passing) } }) };
      const account = {
        serviceUrl: 'https://repo.example', state: () => ({ signedIn: true }), session: () => undefined, api: () => api, start: async () => undefined,
        subscribe: () => () => undefined, onAppended: () => () => undefined, emitAppended: () => undefined, expire: () => undefined, signOut: async () => undefined,
      } as unknown as AccountService;
      app = await createBibliaApp({ win: window, doc: document, source: localSource, recorder: rec, account, now: () => new Date('2026-10-18T12:00:00Z') });
      await app.go('#/read/Gen/1');
      // wait for the page's levels to be painted, however busy the machine is (a fixed 30 ms failed once in a whole-suite run, 2026-11-11)
      const waitFor = async (ok: () => boolean): Promise<void> => { for (let i = 0; i < 250 && !ok(); i++) await new Promise((r) => setTimeout(r, 20)); };
      await waitFor(() => { const w = [...document.querySelectorAll<HTMLElement>('.reader .prose button.word')]; return w.length > 0 && w.every((b) => b.hasAttribute(LEVEL_ATTR)); });
      const words = [...document.querySelectorAll<HTMLElement>('.reader .prose button.word')];
      const first = words.find((b) => b.textContent === 'אֱלֹהִ֑ים')!;
      const verse = first.closest('.verse')!;
      const others = [...verse.querySelectorAll<HTMLElement>('button.word')].filter((b) => b !== first && b.textContent !== first.textContent);
      expect(others.length).toBeGreaterThan(2);
      expect(others.every((b) => b.getAttribute(LEVEL_ATTR) === 'new')).toBe(true); // rows say Seen (bare encounters), shown New
      first.click();
      await waitFor(() => first.getAttribute(LEVEL_ATTR) === 'seen' && rec.events.some((e) => e.kind === 'EncounterRecorded'));
      await new Promise((r) => setTimeout(r, 40)); // and anything that would repaint the other words after the tap has run
      expect(rec.events.some((e) => e.kind === 'EncounterRecorded')).toBe(true); // the exposures ARE recorded
      expect(first.getAttribute(LEVEL_ATTR)).toBe('seen'); // the tapped word is Seen at once
      expect(others.every((b) => b.getAttribute(LEVEL_ATTR) === 'new')).toBe(true); // the other words of the verse stay New
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
      expect(card?.querySelector('#panel-variants')!.textContent).toMatch(/This text is read as Biblical Hebrew/);
      expect(rec.enrolments).toEqual(['he|he-bib']);
      expect(rec.events.map((e) => e.kind)).toEqual(['SelectionLookedUp', 'EncounterRecorded']); // the tap, and the verse's other words as read
      const ev = rec.events[0];
      expect(ev.languageId).toBe('he');
      expect(ev.producer.app).toBe('golearn-ext'); // the shared builder's producer; readerId says where it came from
      expect((ev.payload as { readerId?: string }).readerId).toBe('biblia');
      expect((ev.payload as { language?: { varietyId?: string } }).language?.varietyId).toBe('he-bib');
    });

    describe('the verse as read (an EncounterRecorded beside the first tap in a verse)', () => {
      const tap = async (verse: number, index: number): Promise<HTMLButtonElement> => {
        const b = document.querySelectorAll(`.reader .prose .verse[data-v="${verse}"] button.word`)[index] as HTMLButtonElement;
        b.click();
        await new Promise((r) => setTimeout(r, 20));
        return b;
      };
      it('the first tap in a verse records the selection and one EncounterRecorded for the verse’s other words; a second tap there records only the selection; another verse gets its own', async () => {
        const rec = fakeRecorder();
        app = await createBibliaApp({ win: window, doc: document, source: localSource, recorder: rec, now: () => new Date('2026-10-30T12:00:00Z') });
        await app.go('#/read/Gen/1');
        const verseWords = document.querySelectorAll('.reader .prose .verse[data-v="1"] button.word').length;
        expect(verseWords).toBeGreaterThan(3);
        await tap(1, 2);
        expect(rec.events.map((e) => e.kind)).toEqual(['SelectionLookedUp', 'EncounterRecorded']);
        const [sel, enc] = rec.events;
        const tapped = new Set(sel.subject.itemIds ?? []);
        const ids = enc.subject.itemIds ?? [];
        expect(ids.length).toBeGreaterThan(3);
        expect(ids.length).toBeLessThanOrEqual(100);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) expect(tapped.has(id), id).toBe(false);
        expect(ids.some((id) => id.startsWith('form:he:'))).toBe(true);
        expect(enc.languageId).toBe('he');
        expect(enc.enrolmentId).toBe(sel.enrolmentId);
        expect(enc.producer).toMatchObject({ app: 'golearn-ext', surface: 'biblia-reading', deviceId: 'D1' });
        expect(enc.payload).toMatchObject({ contextKind: 'sentence', tokenCount: verseWords, readerId: 'biblia' });
        expect((enc.payload as { language?: { varietyId?: string } }).language?.varietyId).toBe('he-bib');
        expect(enc.dedupeKey!.length).toBeLessThanOrEqual(300);
        // a second tap in the same verse: the lookup only
        await tap(1, 0);
        expect(rec.events.map((e) => e.kind)).toEqual(['SelectionLookedUp', 'EncounterRecorded', 'SelectionLookedUp']);
        // a tap in the next verse: its own exposure
        await tap(2, 1);
        expect(rec.events.map((e) => e.kind)).toEqual(['SelectionLookedUp', 'EncounterRecorded', 'SelectionLookedUp', 'SelectionLookedUp', 'EncounterRecorded']);
        expect(rec.events[4].subject.itemIds).not.toEqual(ids);
      });
      it('works in Greek, and with no identity (nothing is recorded) there is no exposure either', async () => {
        const rec = fakeRecorder();
        app = await createBibliaApp({ win: window, doc: document, source: localSource, recorder: rec, now: () => new Date() });
        await app.go('#/read/John/1');
        await tap(1, 1);
        expect(rec.events.map((e) => e.kind)).toEqual(['SelectionLookedUp', 'EncounterRecorded']);
        expect(rec.events[1]).toMatchObject({ languageId: 'el', payload: { contextKind: 'sentence' } });
        expect(rec.events[1].subject.itemIds!.some((id) => id.startsWith('form:el:'))).toBe(true);
        app.destroy();
        const none: ReturnType<typeof fakeRecorder> = { ...fakeRecorder(), mode: 'none', reason: 'not signed in', async identity() { return undefined; } };
        app = await createBibliaApp({ win: window, doc: document, source: localSource, recorder: none, now: () => new Date() });
        await app.go('#/read/John/1');
        await tap(1, 1);
        expect(none.events).toEqual([]);
      });
    });
  });
});

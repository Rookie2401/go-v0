// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ComprehensionReported, DomainEvent, EventInput, Sentence, SentenceViewed, Text, TextCompleted, TextViewed } from '../../src/core';
import { createMemoryStore, hash, ids } from '../../src/core';
import { bootstrap } from '../../src/app/bootstrap';
import type { BootstrapResult } from '../../src/app/bootstrap';
import { loadBundledCorpus } from '../../src/ingest';
import type { CorpusDocument } from '../../src/ingest';
import { AppRoutes, Shell } from '../../src/ui/App';
import { AppProvider } from '../../src/ui/context';
import { FINISHED_EXPLANATION } from '../../src/ui/coverage';
import { resetPrefsForTests, setPref } from '../../src/ui/prefs';
import { resetSittingsForTests } from '../../src/ui/sitting';
import { flush, installMediaStubs, q, qa } from './harness';

/**
 * ONE store, the REAL GoLearn, the real importer and the bundled Spanish story: for the same learner and text, Home (the
 * Continue card and every recommendation row), the library and the reader must show the SAME progress string in every
 * audited state. This is the regression test for "Seen 0 of 10 · Finished" on one screen and "Seen 4 of 10 · Finished" on another.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LANG = 'es' as const;
const STORY = ids.text(LANG, 'story-01');
const EARLIER = 'Finished an earlier version — the text has changed since';

let boot: BootstrapResult;
let unmount: (() => Promise<void>) | undefined;
let n = 0;

beforeEach(async () => {
  resetPrefsForTests(); resetSittingsForTests(); localStorage.clear(); installMediaStubs();
  setPref('preview', true); // the bundled story is machine-drafted and unreviewed: only preview mode lists it
  boot = await bootstrap({ store: createMemoryStore(), courseId: 'honduras-es', skipCorpus: true, speechProxy: false });
});
afterEach(async () => { await unmount?.(); unmount = undefined; resetPrefsForTests(); localStorage.clear(); });

const doc = (): CorpusDocument => structuredClone(loadBundledCorpus().find((d) => d.lang === LANG && d.id === 'story-01')!);
const importDocs = async (docs: CorpusDocument[]) => {
  const r = await boot.services.ingest.import(docs);
  expect(r.flatMap((d) => d.issues.filter((x) => x.severity === 'error').map((x) => `${x.code}: ${x.message}`))).toEqual([]);
  expect(r.map((d) => d.action)).not.toContain('rejected');
  return r;
};
const live = async (): Promise<Sentence[]> => (await boot.services.store.sentences.where('textId', STORY)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
const text = async (): Promise<Text> => (await boot.services.store.texts.get(STORY))!;

const base = () => ({ userId: boot.user!.id, lang: LANG, surface: 'corpus' as const, session: 'ses-consistency' });
const emit = async <E extends DomainEvent>(e: Omit<EventInput<E>, 'userId' | 'lang' | 'surface' | 'session'>) => {
  await boot.services.bus.emit({ ...base(), ...e } as never);
  await boot.services.golearn.settled();
};
const open = (version: number) => emit<TextViewed>({ type: 'TextViewed', dedupeKey: `tv:${++n}`, textId: STORY, mode: 'open', contentVersion: version });
const view = async (sentences: Array<Pick<Sentence, 'id'>>, version: number) => {
  for (const s of sentences) await emit<SentenceViewed>({ type: 'SentenceViewed', dedupeKey: `sv:${++n}`, textId: STORY, sentenceId: s.id, tokenIds: [], dwellMs: 2000, contentVersion: version });
};
const finish = (version: number) => emit<TextCompleted>({ type: 'TextCompleted', dedupeKey: `done:${++n}`, textId: STORY, contentVersion: version });

async function render(route: string): Promise<HTMLElement> {
  await unmount?.();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <AppProvider services={boot.services} user={boot.user!} course={boot.course!} session="ses-consistency">
        <MemoryRouter initialEntries={[route]}><Shell><AppRoutes /></Shell></MemoryRouter>
      </AppProvider>,
    );
  });
  await flush(14);
  unmount = async () => { await act(async () => root.unmount()); container.remove(); };
  return container;
}

interface Shown { line: string; why?: string }
/** What each surface shows for the text: the progress string(s), and its "why" explanation when it has one. */
async function surfaces(): Promise<{ home: Shown[]; library: Shown[]; reader: Shown[] }> {
  const read = (root: ParentNode, testIds: string[]): Shown[] => testIds.flatMap((id) => qa(root, `[data-testid="${id}"]`).map((el): Shown => {
    const why = q(root, `[data-testid="${id}-why"]`);
    return { line: el.textContent ?? '', ...(why ? { why: why.getAttribute('title') ?? why.textContent ?? '' } : {}) };
  }));
  const home = await render('/');
  const h = read(home, ['continue-progress', 'item-progress']);
  const lib = await render('/read');
  const l = read(lib, ['library-progress']);
  const rd = await render(`/read/${encodeURIComponent(STORY)}`);
  const r = read(rd, ['reading-progress']);
  return { home: h, library: l, reader: r };
}

async function expectIdentical(expected: string, opts: { why: boolean }) {
  const s = await surfaces();
  expect(s.library, 'the library row').toHaveLength(1);
  expect(s.reader, 'the reader block').toHaveLength(1);
  expect(s.home.length, 'Home shows the text (Continue card and/or recommendation rows)').toBeGreaterThanOrEqual(1);
  for (const [name, shown] of [['Home', s.home], ['library', s.library], ['reader', s.reader]] as const) {
    for (const x of shown) {
      expect(x.line, name).toBe(expected);
      if (opts.why) expect(x.why, `${name} explains why Seen and Finished differ`).toBe(FINISHED_EXPLANATION);
      else expect(x.why, `${name} has nothing to explain`).toBeUndefined();
    }
  }
  expect(s.home.map((x) => x.line)).toEqual(s.home.map(() => expected)); // the Continue card AND every row agree
  expect(s.library[0].line).toBe(s.reader[0].line);
  return s;
}

describe('one canonical record, rendered identically by Home, the library and the reader (real GoLearn, real importer, bundled story)', () => {
  it('(a) four sentences seen + explicit finish', async () => {
    await importDocs([doc()]);
    const S = await live();
    expect(S.length).toBeGreaterThanOrEqual(8);
    await open(1); await view(S.slice(0, 4), 1); await finish(1);
    await expectIdentical(`Seen 4 of ${S.length} sentences · Finished (your mark)`, { why: true }); // finished, yet only 4 seen: both facts, and why they differ
  });

  it('(b) finished with zero seen', async () => {
    await importDocs([doc()]);
    const S = await live();
    await open(1); await finish(1);
    const s = await expectIdentical(`Seen 0 of ${S.length} sentences · Finished (your mark)`, { why: true });
    // the explanation is on every surface: a disclosure in the reader, a title on the line inside Home / library links
    expect(s.reader[0].why).toBe(FINISHED_EXPLANATION);
    expect(q(document.body, '[data-testid="reading-progress-why"]')!.closest('details')).not.toBeNull();
    const home = await render('/');
    expect(qa(home, '[data-testid="continue-progress-why"], [data-testid="item-progress-why"]').every((el) => el.getAttribute('title') === FINISHED_EXPLANATION)).toBe(true);
    const lib = await render('/read');
    expect(q(lib, '[data-testid="library-progress-why"]')!.getAttribute('title')).toBe(FINISHED_EXPLANATION);
  });

  it('(c) finished, then the text revised: "Finished an earlier version" everywhere and the retired sentences reported as seen in an earlier version', async () => {
    await importDocs([doc()]);
    const S = await live();
    await open(1); await view(S.slice(0, 4), 1); await finish(1);
    await expectIdentical(`Seen 4 of ${S.length} sentences · Finished (your mark)`, { why: true });

    // The text is revised: two of the four seen sentences are replaced (import a changed copy).
    const revised = doc();
    const para = revised.sections[0].paragraphs[0] as { sentences: Array<{ text: string; english?: string }> };
    para.sentences[0] = { text: 'Cuando era joven, yo no entendía nada.', english: 'When I was young, I understood nothing.' };
    para.sentences[1] = { text: 'Yo tenía pecado en mi corazón.', english: 'I had sin in my heart.' };
    const report = await importDocs([revised]);
    expect(report[0]).toMatchObject({ action: 'updated', contentVersion: 2, sentencesRetired: 2 });
    expect((await text()).contentVersion).toBe(2);
    const S2 = await live();

    const s = await expectIdentical(`Seen 2 of ${S2.length} sentences · ${EARLIER} · 2 more seen in an earlier version`, { why: true });
    expect(s.reader[0].line).not.toMatch(/(^| · )Finished( · |$)/); // never plain "Finished" for a version he did not finish

    // Finishing the new version is a new, explicit act, and the reader offers it (no "Marked as finished")
    const rd = await render(`/read/${encodeURIComponent(STORY)}`);
    expect(qa(rd, 'button').some((b) => /finished reading/.test(b.textContent ?? ''))).toBe(true);
    await finish(2);
    await expectIdentical(`Seen 2 of ${S2.length} sentences · Finished (your mark) · 2 more seen in an earlier version`, { why: true });
  });

  it('(e) a whole-text report about the earlier wording is history: the same words on Home, the library and the reader, never a claim about the new wording', async () => {
    await importDocs([doc()]);
    const S = await live();
    await open(1); await view(S.slice(0, 4), 1);
    await emit<ComprehensionReported>({ type: 'ComprehensionReported', dedupeKey: `cr:${++n}`, textId: STORY, sentenceIds: [], modality: 'reading', scope: 'text', degree: 'most', contentVersion: 1 });
    await expectIdentical(`Seen 4 of ${S.length} sentences`, { why: false }); // about this version: the line itself says nothing more

    const revised = doc();
    const para = revised.sections[0].paragraphs[0] as { sentences: Array<{ text: string; english?: string }> };
    para.sentences[0] = { text: 'Cuando era joven, yo no entendía nada.', english: 'When I was young, I understood nothing.' };
    para.sentences[1] = { text: 'Yo tenía pecado en mi corazón.', english: 'I had sin in my heart.' };
    await importDocs([revised]);
    const S2 = await live();
    const s = await expectIdentical(`Seen 2 of ${S2.length} sentences · you said you understood most of an earlier version · 2 more seen in an earlier version`, { why: false });
    expect(s.reader[0].line).not.toMatch(/you said you understood most( of it)?( ·|$)/);
    // the reader's own extras do not repeat the old report as if it were about this wording
    expect(q(document.body, '[data-testid="reading-extras"]')).toBeNull();
  });

  it('(d) views recorded against legacy index-id sentences that the importer retired', async () => {
    // A database from before stable keys: the text at version 1 with index-id sentences (`<text>/s0`, no key), four of them seen.
    const store = boot.services.store;
    await store.texts.put({
      id: STORY, corpusId: 'ci-es', lang: LANG, kind: 'story', title: 'Story 1', sourceId: doc().source.id, importedAt: '2025-01-01T00:00:00.000Z', tags: [], editorialTags: [],
      prepTargets: [], reviewStatus: 'unreviewed', published: false, unpublishedReasons: [], schemaVersion: 1, generated: false, transformations: [], contentVersion: 1,
    });
    const legacyText = ['Hola.', 'Yo creo.', 'Dios es bueno.', 'Gracias.'];
    for (let i = 0; i < legacyText.length; i++) {
      await store.sentences.put({ id: `${STORY}/s${i}`, textId: STORY, paragraphId: `${STORY}/p0`, lang: LANG, index: i, text: legacyText[i], normalizedText: legacyText[i].toLowerCase(), textHash: hash(legacyText[i]) } as unknown as Sentence);
    }
    await open(1); await view(legacyText.map((_, i) => ({ id: `${STORY}/s${i}` })), 1);

    const report = await importDocs([doc()]); // the first import of the real document retires every legacy row
    expect(report[0]).toMatchObject({ action: 'updated', sentencesRetired: 4 });
    const S = await live();
    await expectIdentical(`Seen 0 of ${S.length} sentences · 4 more seen in an earlier version`, { why: false });
  });
});

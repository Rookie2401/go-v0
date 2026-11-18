// @vitest-environment jsdom
/**
 * Reading Analysis through the real stack, nothing faked between the page and the worker: the real content script (install), the message
 * bridge, the real background worker with the device-local Repository, the fake chrome. The popup's part is played by the messages it
 * sends (grant to the worker, start/status to the tab).
 *
 * The learner's workflow of the brief: open a page, analyse it, get the share of its word occurrences that are Known; change a word's
 * level through GoLearn's own control (the card's level row); analyse again; the share moves by exactly that word's occurrences, the text
 * is not read a second time, and nothing but the learner's own mark was recorded.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { wordInScript } from '../../packages/golearn-extension/src/active/pageLanguages';
import { wordsOfText } from '../../packages/golearn-extension/src/active/scan';
import { getAnalyser } from '../../packages/golearn-extension/src/parser';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { formatPercent } from '../../packages/golearn-extension/src/reading/coverage';
import { presentResult } from '../../packages/golearn-extension/src/reading/present';
import type { ReadingStatus } from '../../packages/golearn-extension/src/reading/protocol';
import { flush, selectText, setBody, stubLayout } from './dom';
import { createRig, type Rig } from './rig';

const g = globalThis as unknown as Record<string, unknown>;
const RUNNING = ['extracting', 'resolving', 'verifying', 'calculating'];

const PARAGRAPHS = [
  'Unë po lexoj një libër të bukur në shtëpinë time.',
  'Beni shkon në shtëpinë e Anës.',
  'Beni shkon në shtëpi dhe lexon një libër.',
];
const PAGE = `
  <nav id="nav"><a href="#">Kreu</a> <a href="#">Lajme</a> <a href="#">Libra</a></nav>
  <main id="content"><h1>Libri</h1>${PARAGRAPHS.map((p, i) => `<p id="p${i}">${p}</p>`).join('')}</main>
  <aside>Lexo edhe: libra të tjerë</aside>
  <footer>Të gjitha të drejtat</footer>`;

let install: (chromeApi: unknown, doc: Document) => Promise<{ lookup(req: { trigger: 'command' | 'click' }): Promise<{ status: string; settled?: Promise<void> }>; dispose(): void } | undefined>;
let restore: () => void;
let rig: Rig;

beforeAll(async () => {
  g.__GOLEARN_NO_AUTOINSTALL = true;
  install = (await import('../../packages/golearn-extension/src/content/index')).install as typeof install;
});
beforeEach(() => {
  restore = stubLayout();
  setBody(PAGE);
  document.title = 'Libri i Benit';
  document.documentElement.lang = 'sq';
  delete g.__goLearnExtension;
  rig = createRig();
});
afterEach(() => {
  const marker = g.__goLearnExtension as { controller: { dispose(): void }; active: { stop(): void } } | undefined;
  marker?.active.stop(); marker?.controller.dispose();
  delete g.__goLearnExtension;
  restore(); document.documentElement.removeAttribute('lang');
});

const wait = async (f: () => boolean | Promise<boolean>, ms = 8000): Promise<void> => { const t0 = Date.now(); while (!(await f())) { if (Date.now() - t0 > ms) throw new Error('timeout'); await flush(20); } };
const toTab = (op: 'start' | 'status' | 'cancel', extra: Record<string, unknown> = {}): Promise<ReadingStatus> =>
  rig.fake.tabs!.sendMessage(7, { type: MSG.readingAnalysis, op, ...extra }) as Promise<ReadingStatus>;
/** What the popup's button does: the grant, the start, then the status until the run ends. */
async function analyse(extra: Record<string, unknown> = {}): Promise<ReadingStatus> {
  expect(await rig.page({ type: MSG.readingKnowledge, op: 'grant', tabId: 7 })).toEqual({ ok: true, op: 'grant' });
  let s = await toTab('start', { languageId: 'sq', ...extra });
  expect(s.ok).toBe(true);
  await wait(async () => { s = await toTab('status'); return !RUNNING.includes(s.stage); });
  return s;
}
const deviceEvents = async (): Promise<Array<{ id: string; kind: string; payload: { mark?: string } }>> => (await rig.page({ type: MSG.localRepo, op: 'export' })).events;

/** The words of the main content, counted here and not by the code under test: the three paragraphs and the heading, read with the real Albanian analyser. */
function expectedWords(): { total: number; of(lemmaId: string): number } {
  const sq = getAnalyser('sq')!;
  const all = ['Libri', ...PARAGRAPHS].flatMap((t) => wordsOfText(t, sq, 'sq').filter((w) => wordInScript(w.surface, 'sq')));
  return { total: all.length, of: (lemmaId) => all.filter((w) => w.ids.includes(lemmaId)).length };
}

async function markKnown(paragraphId: string, word: string): Promise<void> {
  const controller = (g.__goLearnExtension as { controller: { lookup(req: { trigger: 'command' }): Promise<{ status: string; settled?: Promise<void> }>; d: { ui: { root(): ShadowRoot | undefined } } } }).controller;
  selectText(document.getElementById(paragraphId)!, word);
  const out = await controller.lookup({ trigger: 'command' });
  expect(out.status).toBe('shown');
  await out.settled; await flush(60);
  const host = document.querySelector('[data-golearn-host]') as HTMLElement;
  const root = host.shadowRoot ?? controller.d.ui.root()!;
  await wait(() => root.querySelectorAll('.rateBtn').length === 6);
  (root.querySelector('.rateBtn[data-mark="known"]') as HTMLButtonElement).click();
  await wait(async () => (await deviceEvents()).some((e) => e.kind === 'ItemMarked' && e.payload.mark === 'known'));
  await flush(40);
}

describe('Reading Analysis, real page to real worker (no account)', () => {
  it('a content script with no grant is refused; a grant comes only from an extension page', async () => {
    await install(rig.fake.contentChrome(7), document);
    await flush(20);
    expect(await rig.content({ type: MSG.readingKnowledge, op: 'snapshot', languageId: 'sq' })).toEqual({ ok: false, error: 'not-granted' });
    expect(await rig.content({ type: MSG.readingKnowledge, op: 'grant', tabId: 7 })).toEqual({ ok: false, error: 'not-granted' });
    expect(await rig.content({ type: MSG.readingKnowledge, op: 'classify', languageId: 'sq', snapshot: 'x', words: [['form:sq:libër']] })).toEqual({ ok: false, error: 'not-granted' });
    // and a run started without the popup's grant fails with that reason, never with a figure
    let s = await toTab('start', { languageId: 'sq' });
    await wait(async () => { s = await toTab('status'); return !RUNNING.includes(s.stage); });
    expect(s).toMatchObject({ stage: 'failed', error: { code: 'not-granted' } });
    expect(s.result).toBeUndefined();
  });

  it('the whole main content is counted, by occurrence; marking a word Known on its card moves the figure by exactly its occurrences; the text is read once; nothing else is recorded', async () => {
    await install(rig.fake.contentChrome(7), document);
    await flush(20);
    const want = expectedWords();
    expect(want.total).toBeGreaterThan(20);

    // 1. nothing is known yet
    const first = await analyse();
    expect(first.stage).toBe('done');
    const r1 = first.result!;
    expect(r1.languageId).toBe('sq');
    expect(r1.scope).toMatchObject({ kind: 'main', title: 'Libri i Benit', complete: true, foreignBlocks: 0 });
    expect(r1.coverage.counts.total).toBe(want.total); // the navigation, the sidebar and the footer are not in it
    expect(r1.coverage.knownOccurrences).toBe(0);
    expect(r1.coverage.knownPercent).toBe(0);
    expect(r1.snapshot).toMatchObject({ authority: 'device', state: 'verified', unsent: 0 });
    expect(r1.lookups.asked).toBeGreaterThan(0);
    expect(r1.lookups.answered).toBe(r1.lookups.asked);
    expect(r1.reusedText).toBe(false);
    const sum = (c: typeof r1.coverage.counts): number => c.known + c.automatic + c.familiar + c.recognized + c.seen + c.new + c.unsettled + c.ambiguous + c.unidentified;
    expect(sum(r1.coverage.counts)).toBe(want.total);
    expect(presentResult(r1).figure).toBe('0.0% Known');
    // an analysis records nothing: no encounter, no lookup, no mark
    expect(await deviceEvents()).toEqual([]);
    expect(rig.log.filter((l) => !l.path.includes('/dict/'))).toEqual([]); // and the service was never asked (no account)

    // 2. the learner marks "shkon" Known on its card (GoLearn's own control)
    await markKnown('p1', 'shkon');
    const afterMark = await deviceEvents();
    expect(afterMark.filter((e) => e.kind === 'ItemMarked').map((e) => e.payload.mark)).toEqual(['known']);
    const shkoj = want.of('lemma:sq:shkoj:VERB');
    expect(shkoj).toBe(2);

    // 3. the same text again: only the knowledge is read again, and the figure moved by that word's two occurrences
    const second = await analyse();
    expect(second.stage).toBe('done');
    const r2 = second.result!;
    expect(r2.reusedText).toBe(true);
    expect(r2.coverage.counts.total).toBe(want.total);
    expect(r2.coverage.knownOccurrences).toBe(shkoj);
    expect(r2.coverage.counts.known).toBe(shkoj);
    expect(r2.coverage.knownPercent).toBeCloseTo((shkoj / want.total) * 100, 10);
    expect(presentResult(r2).figure).toBe(`${formatPercent(shkoj, want.total)} Known`);
    expect(presentResult(r2).count).toBe(`${shkoj} of ${want.total} words`);
    expect(r2.snapshot.id).not.toBe(r1.snapshot.id); // the Repository took in events between the two: another state
    // the second analysis itself recorded nothing: the device holds exactly what it held before it
    expect((await deviceEvents()).map((e) => e.id)).toEqual(afterMark.map((e) => e.id));

    // 4. the page's text changes in place (a reader that swaps its chapter): the old table is not used for the new text
    document.getElementById('p2')!.textContent = 'Ana lexon.';
    const third = await analyse();
    expect(third.stage).toBe('done');
    expect(third.result!.reusedText).toBe(false);
    expect(third.result!.coverage.counts.total).toBeLessThan(want.total);
  }, 60_000);

  it('a page of another script has no word of the language: no figure, and it says why', async () => {
    setBody('<main><p>Το βιβλίο είναι στο σπίτι.</p></main>');
    await install(rig.fake.contentChrome(7), document);
    await flush(20);
    const s = await analyse();
    expect(s).toMatchObject({ stage: 'failed', error: { code: 'no-text' } });
    expect(s.result).toBeUndefined();
  });

  it('Greek needs the variety of the text: without one the run stops and asks, with nothing counted', async () => {
    document.documentElement.lang = 'el'; // a bare el states no variety
    setBody('<main><p>ὁ δὲ λόγον εἶπεν πρὸς αὐτούς.</p></main>');
    await install(rig.fake.contentChrome(7), document);
    await flush(20);
    const s = await analyse({ languageId: 'el' });
    expect(s).toMatchObject({ stage: 'failed', error: { code: 'variety-required' } });
  });
});

describe('Reading Analysis, signed in', () => {
  it('the snapshot is checked against the account, and says so', async () => {
    await rig.signUp();
    await rig.connect();
    await install(rig.fake.contentChrome(7), document);
    await flush(20);
    const s = await analyse();
    expect(s.stage).toBe('done');
    expect(s.result!.snapshot).toMatchObject({ authority: 'account', state: 'verified' });
    expect(presentResult(s.result!).notes.at(-1)!.text).toMatch(/^Checked against your account just now\./);
    // what went to the service for it: the learner's own events after a cursor, never a word of the page
    const asked = rig.log.filter((l) => !l.path.includes('/dict/')).map((l) => `${l.method} ${l.path}`);
    for (const a of asked) expect(a).not.toMatch(/knowledge|vocabulary|lookup/);
  }, 60_000);

  it('offline: the figure is given from the device and marked not verified, with the reason', async () => {
    await rig.signUp();
    await rig.connect();
    await install(rig.fake.contentChrome(7), document);
    await flush(20);
    rig.offline.value = true;
    const s = await analyse();
    expect(s.stage).toBe('done');
    expect(s.result!.snapshot.state).toBe('unverified');
    const p = presentResult(s.result!);
    expect(p.figure).toMatch(/Known \(not verified\)$/);
    expect(p.notes.at(-1)).toMatchObject({ warn: true });
    expect(p.notes.at(-1)!.text).toMatch(/^A definitive current figure is not available\./);
  }, 60_000);
});

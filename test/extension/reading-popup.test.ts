// @vitest-environment jsdom
/**
 * Reading Analysis in the popup: one button, one number, and every qualification of the number said in words. The tab's content script is
 * played by a listener that answers with scripted states (the real one is exercised in reading-integration.test.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { initPopup } from '../../packages/golearn-extension/action/popup';
import { initReadingPanel } from '../../packages/golearn-extension/action/reading';
import { createBackground } from '../../packages/golearn-extension/src/background/core';
import { GRANT_PREFIX } from '../../packages/golearn-extension/src/background/reading';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { coverageOf } from '../../packages/golearn-extension/src/reading/coverage';
import { presentProgress, presentResult } from '../../packages/golearn-extension/src/reading/present';
import type { KnowledgeSnapshot, ReadingResult, ReadingStatus, WireVerdict } from '../../packages/golearn-extension/src/reading/protocol';
import { createChromeFake, type ChromeFake } from './chromeFake';
import { flush } from './dom';
import { fakePacks } from './rig';

const html = fs.readFileSync(path.resolve(__dirname, '../../packages/golearn-extension/action/popup.html'), 'utf8');
const body = /<body>([\s\S]*)<\/body>/.exec(html)![1].replace(/<script[\s\S]*?<\/script>/g, '');
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const VERIFIED: KnowledgeSnapshot = { id: 'b:1', authority: 'account', state: 'verified', verifiedAt: 1_700_000_000_000, unsent: 0 };
function result(counts: Array<[number, WireVerdict]>, over: Partial<ReadingResult> = {}): ReadingResult {
  const coverage = coverageOf(counts.map(([occurrences, verdict]) => ({ occurrences, verdict })));
  return {
    languageId: 'es', coverage,
    scope: { kind: 'main', title: 'Cien años', complete: true, characters: 60_000, analysedCharacters: 60_000, foreignBlocks: 0, frames: 0 },
    snapshot: VERIFIED, lookups: { asked: 4000, answered: 4000 }, dictionary: 'asked', reusedText: false, at: 1_700_000_000_000, ...over,
  };
}
const TEN_THOUSAND = result([[7000, ['known', 'known']], [1760, ['known', 'automatic']], [900, ['below', 'familiar']], [300, ['below', 'recognized']], [40, ['below', 'new']]]);

let fake: ChromeFake;
/** What the tab answers to each Reading Analysis message, in order; the last one repeats. */
let script: ReadingStatus[];
let toTab: Array<Record<string, unknown>>;
beforeEach(() => {
  document.body.innerHTML = body;
  fake = createChromeFake();
  script = [];
  toTab = [];
  createBackground(fake, { packs: fakePacks(), fetch: (async () => { throw new TypeError('no network'); }) as typeof fetch }).register();
  fake.tabs!.query = async () => [{ id: 7, url: 'https://example.org/libro' }] as never;
  fake.tabListeners.add((m, _s, send) => {
    const msg = m as { type?: string; op?: string };
    if (msg.type !== MSG.readingAnalysis) { send({ ok: true, enabled: false, active: false }); return true; }
    toTab.push(msg as Record<string, unknown>);
    send(script.length > 1 ? script.shift() : script[0] ?? { ok: true, stage: 'idle' });
    return true;
  });
});
const panel = (languageId = 'es', pollMs = 5) => initReadingPanel(document, fake, { languageId: () => languageId, tab: async () => (await fake.tabs!.query({ active: true, currentWindow: true }))[0], pollMs });
const settle = async (f: () => boolean): Promise<void> => { for (let i = 0; i < 200 && !f(); i++) await flush(10); expect(f()).toBe(true); };

describe('the popup part', () => {
  it('is one button under its name, with no figure until a page was analysed; it is wired into the popup', async () => {
    await initPopup(document, fake);
    expect($('reading-name').textContent).toBe('Reading Analysis');
    expect($('reading-run').textContent).toBe('Analyse this page');
    expect($('reading-figure').textContent).toBe('');
    expect($('reading-variety-row').hidden).toBe(true); // the popup's language here has no varieties
    expect(document.querySelectorAll('#reading button')).toHaveLength(1);
    expect(document.querySelectorAll('#reading canvas, #reading svg, #reading meter, #reading progress')).toHaveLength(0); // no chart, no gauge
  });

  it('a press grants the tab, starts the run with the popup language, shows the stages, then the one number', async () => {
    const p = panel('es', 80); // slow enough to see each stage's line
    await p.restore();
    script = [
      { ok: true, stage: 'idle' }, // the status asked before the start: the page's script is there
      { ok: true, stage: 'resolving', runId: 'r1', progress: { done: 15_000, total: 60_000 } }, // the reply to start
      { ok: true, stage: 'verifying', runId: 'r1', progress: { done: 400, total: 4000 } },
      { ok: true, stage: 'done', runId: 'r1', result: TEN_THOUSAND },
    ];
    toTab.length = 0;
    $('reading-run').click();
    await settle(() => toTab.some((m) => m.op === 'start'));
    expect(toTab.find((m) => m.op === 'start')).toMatchObject({ type: MSG.readingAnalysis, op: 'start', languageId: 'es' });
    expect(typeof (await fake.storage.session!.get(GRANT_PREFIX + 7))[GRANT_PREFIX + 7]).toBe('number'); // the worker was told this tab may ask
    expect($('reading-run').textContent).toBe('Cancel');
    expect($('reading-line').textContent).toBe('Identifying the words… 25%');
    await settle(() => $('reading-figure').textContent !== '');
    expect($('reading-figure').textContent).toBe('87.6% Known');
    expect($('reading-count').textContent).toBe('8,760 of 10,000 words');
    expect($('reading-scope').textContent).toBe('The main content of “Cien años” · Spanish');
    expect([...$('reading-notes').children].map((n) => n.textContent)).toEqual(['Checked against your account just now.']);
    expect($('reading-line').textContent).toBe('');
    expect($('reading-run').textContent).toBe('Analyse again');
    expect($('reading-result').getAttribute('aria-live')).toBe('polite');
  });

  it('a failed run shows its reason in the warning colour and no number; a page that cannot be read says so without asking it anything', async () => {
    const p = panel();
    await p.restore();
    script = [{ ok: true, stage: 'idle' }, { ok: true, stage: 'failed', runId: 'r1', error: { code: 'lookup-incomplete', message: 'Some words could not be checked against your vocabulary, so no figure is shown. Try again.' } }];
    $('reading-run').click();
    await settle(() => $('reading-line').classList.contains('warn'));
    expect($('reading-line').textContent).toBe('Some words could not be checked against your vocabulary, so no figure is shown. Try again.');
    expect($('reading-figure').textContent).toBe('');
    expect($('reading-count').textContent).toBe('');

    fake.tabs!.query = async () => [{ id: 7, url: 'chrome://settings' }] as never;
    toTab.length = 0;
    $('reading-run').click();
    await settle(() => /works on web pages/.test($('reading-line').textContent ?? ''));
    expect(toTab).toEqual([]);
  });

  it('Greek and Hebrew ask which variety the text is in, offer the contract\'s selectable ones, and do not start without one', async () => {
    const p = panel('el');
    await p.restore();
    expect($('reading-variety-row').hidden).toBe(false);
    expect([...$<HTMLSelectElement>('reading-variety').options].map((o) => [o.value, o.textContent])).toEqual([
      ['', 'Choose…'], ['el-hom', 'Homeric Greek'], ['el-att', 'Classical (Attic) Greek'], ['el-koi', 'Koine Greek'], ['el-mod', 'Modern Greek'],
    ]);
    toTab.length = 0;
    $('reading-run').click();
    await flush(30);
    expect(toTab).toEqual([]);
    expect($('reading-line').textContent).toBe('Choose which variety of the language this text is in.');
    script = [{ ok: true, stage: 'idle' }, { ok: true, stage: 'extracting', runId: 'r1' }];
    $<HTMLSelectElement>('reading-variety').value = 'el-koi';
    $('reading-run').click();
    await settle(() => toTab.some((m) => m.op === 'start'));
    expect(toTab.find((m) => m.op === 'start')).toMatchObject({ languageId: 'el', varietyId: 'el-koi' });
  });

  it('a popup opened on a page that was analysed shows that result again; a result of another language is not shown', async () => {
    script = [{ ok: true, stage: 'done', runId: 'r1', result: TEN_THOUSAND }];
    await panel('es').restore();
    expect($('reading-figure').textContent).toBe('87.6% Known');
    document.body.innerHTML = body;
    await panel('de').restore();
    expect($('reading-figure').textContent).toBe('');
  });
});

describe('what is said about a result', () => {
  it('exact: the number, the count, the scope, and how it was checked; nothing else', () => {
    expect(presentResult(TEN_THOUSAND)).toEqual({
      figure: '87.6% Known', count: '8,760 of 10,000 words', scope: 'The main content of “Cien años” · Spanish',
      notes: [{ text: 'Checked against your account just now.' }],
    });
  });

  it('words that could not be decided are counted in the total, named, and give a range; never added to Known', () => {
    const r = result([[850, ['known', 'known']], [100, ['below', 'new']], [30, ['unidentified', 'new']], [20, ['ambiguous', 'known']]]);
    const p = presentResult(r);
    expect(p.figure).toBe('85.0% Known');
    expect(p.count).toBe('850 of 1,000 words');
    expect(p.notes[0].text).toBe('30 words could not be identified, and 20 words can be read as more than one word, of which you know only some. Counting them, Known is between 85.0% and 90.0%.');
    expect(r.coverage.exact).toBe(false);
  });

  it('a Greek text: Known in the chosen variety; what is Known with no variety recorded is said separately and not counted', () => {
    const r = result([[620, ['known', 'known']], [214, ['unsettled', 'known']], [166, ['below', 'seen']]], { languageId: 'el', varietyId: 'el-koi' });
    const p = presentResult(r);
    expect(p.figure).toBe('62.0% Known in Koine Greek');
    expect(p.notes[0].text).toBe('A further 21.4% (214 words) are Known in your Greek record with no variety recorded. They are not counted as Known in Koine Greek.');
  });

  it('not verified: the figure is marked so and the reason is the last line, in the warning colour', () => {
    const cases: Array<[KnowledgeSnapshot, RegExp]> = [
      [{ id: 'b:1', authority: 'account', state: 'unverified', reason: 'offline', lastVerifiedAt: 1_700_000_000_000, unsent: 0 }, /^A definitive current figure is not available\. This device is offline, so your account could not be checked\. The figure uses the vocabulary on this device\. It was last level with your account on /],
      [{ id: 'b:1', authority: 'account', state: 'unverified', reason: 'timeout', unsent: 2 }, /Your account did not answer in time\. The figure uses the vocabulary on this device\. It has not been checked against your account on this device\. 2 of your latest changes on this device have not reached your account yet; they are counted here\.$/],
      [{ id: 'b:1', authority: 'account', state: 'unverified', reason: 'needs-sign-in', unsent: 0 }, /Sign in again in GoLearn setup\./],
      [{ id: 'b:1', authority: 'account', state: 'unverified', reason: 'refused-events', unsent: 0 }, /Part of your account’s history could not be stored on this device\./],
      [{ id: 'b:1', authority: 'account', state: 'unverified', reason: 'incomplete', unsent: 0 }, /could not be read to its end\./],
      [{ id: 'b:1', authority: 'account', state: 'unverified', reason: 'mixed-accounts', unsent: 0 }, /holds the history of more than one account/],
    ];
    for (const [snapshot, text] of cases) {
      const p = presentResult({ ...TEN_THOUSAND, snapshot });
      expect(p.figure, snapshot.reason).toBe('87.6% Known (not verified)');
      expect(p.notes.at(-1)!.warn, snapshot.reason).toBe(true);
      expect(p.notes.at(-1)!.text, snapshot.reason).toMatch(text);
    }
    expect(presentResult({ ...TEN_THOUSAND, snapshot: { id: 'b:1', authority: 'device', state: 'verified', unsent: 0 } }).notes).toEqual([{ text: 'Not signed in: counted from the vocabulary kept on this device.' }]);
  });

  it('a text read in part says which part; a text that changed since says so; passages in another language are counted as left out', () => {
    const partial = presentResult({ ...TEN_THOUSAND, scope: { ...TEN_THOUSAND.scope, complete: false, characters: 60_000, analysedCharacters: 15_000, foreignBlocks: 2 } }, true);
    expect(partial.notes.map((x) => x.text)).toEqual([
      'The text on the page has changed since this analysis. Analyse the page again.',
      'Only the first 25.0% of this text was read (it is too long to read whole), so the figure is for that part, not for the whole text.',
      '2 passages marked as another language were left out.',
      'Checked against your account just now.',
    ]);
    expect(partial.notes[0].warn).toBe(true);
    expect(partial.notes[1].warn).toBe(true);
  });

  it('the stages have plain names', () => {
    expect(presentProgress('extracting')).toBe('Reading the text of the page…');
    expect(presentProgress('resolving', { done: 1, total: 3 })).toBe('Identifying the words… 33%');
    expect(presentProgress('verifying', { done: 0, total: 0 })).toBe('Checking your vocabulary…');
    expect(presentProgress('calculating')).toBe('Counting…');
    expect(presentProgress('canceled')).toBe('Analysis cancelled.');
  });
});

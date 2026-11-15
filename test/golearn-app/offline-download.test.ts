// @vitest-environment jsdom
/**
 * "Download for offline use" on a language row (2026-11-11): the states the row shows, the controls each state offers, and what the page
 * sends the worker. The worker itself is tested in test/loading/golearn.offline.test.ts; here it is a scripted stand-in.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { KEYS } from '../../packages/golearn-extension/app/state';
import { destroyRigs, downloadLanguage, makeRig as baseRig, until, type Rig, type RigOptions } from './helpers';

afterEach(() => destroyRigs());

interface Status { languageId: string; state: string; outOfDate: boolean; done: number; total: number; bytes: number; error?: string }
const NONE = (languageId = 'sq'): Status => ({ languageId, state: 'none', outOfDate: false, done: 0, total: 0, bytes: 0 });

/** A worker that answers `golearn:dictionary-download` from a script the test changes, and records what it was asked. */
function fakeOffline(rig: Rig) {
  const w = { asked: [] as Array<Record<string, unknown>>, status: new Map<string, Status>(), onStart: undefined as undefined | ((s: Status) => Status) };
  rig.chrome!.events.onMessage.addListener((m, _s, respond) => {
    const msg = m as Record<string, any>;
    if (msg.type !== 'golearn:dictionary-download') return undefined;
    w.asked.push(msg);
    const cur = w.status.get(msg.languageId) ?? NONE(msg.languageId);
    let next = cur;
    if (msg.op === 'start') next = w.onStart ? w.onStart(cur) : { ...cur, state: 'running', done: 0, total: 0 };
    if (msg.op === 'cancel') next = { ...cur, state: 'cancelled' };
    if (msg.op === 'remove') next = NONE(msg.languageId);
    w.status.set(msg.languageId, next);
    respond({ ok: true, status: next });
    return true;
  });
  return w;
}

const makeRig = (o: RigOptions = {}): Promise<Rig> => baseRig({ startRoute: 'languages', extension: true, ...o });
const block = (rig: Rig, lang = 'sq'): HTMLElement => rig.q(`#language-cards [data-language="${lang}"] .offline[data-offline="${lang}"]`);
const stateOf = (rig: Rig, lang = 'sq'): string | null => rig.root.querySelector(`#language-cards [data-language="${lang}"] .offline[data-offline="${lang}"]`)?.getAttribute('data-offline-state') ?? null;
const clickAction = (rig: Rig, action: string, lang = 'sq'): void => rig.q<HTMLButtonElement>(`#language-cards [data-language="${lang}"] .offline [data-action="${action}"]`).click();
const noteOf = (rig: Rig, lang = 'sq'): string => block(rig, lang).querySelector('.offline-note')!.textContent ?? '';

async function chosenAlbanian(opts: { status?: Status } = {}) {
  const rig = await makeRig({ config: {} });
  const w = fakeOffline(rig);
  if (opts.status) w.status.set('sq', opts.status);
  rig.deps.offlinePollMs = 5;
  await downloadLanguage(rig, 'sq');
  await until(() => stateOf(rig) !== null);
  return { rig, w };
}

describe('a language row: Download for offline use', () => {
  it('a chosen language that is not downloaded says the true thing and offers the button, with an accessible name; it promises no size', async () => {
    const { rig } = await chosenAlbanian();
    expect(stateOf(rig)).toBe('none');
    expect(noteOf(rig)).toBe('Meanings load as you read. The first time you meet a word needs a connection.');
    const btn = rig.q<HTMLButtonElement>('#language-cards [data-language="sq"] .offline [data-action="offline-start"]');
    expect(btn.textContent).toBe('Download for offline use');
    expect(btn.getAttribute('aria-label')).toBe('Download Albanian for offline use');
    const text = block(rig).textContent ?? '';
    expect(text).toMatch(/meanings and word forms/);
    expect(text).toMatch(/full dictionary entries are not part of it/);
    expect(text).toMatch(/size is shown as it downloads/);
    expect(text).not.toMatch(/\d+(\.\d+)? ?MB/);
    // no engineering words reach the learner
    expect(block(rig).textContent).not.toMatch(/shard|IndexedDB|manifest|revision|cache/i);
  });

  it('the row is not offered where there is no worker (the hosted page), and is hidden when the worker does not answer', async () => {
    const hosted = await baseRig({ startRoute: 'languages' });
    await downloadLanguage(hosted, 'sq');
    expect(hosted.root.querySelector('.offline')).toBeNull();
    const rig = await makeRig();
    rig.chrome!.events.onMessage.addListener(() => undefined); // listens, answers nothing
    await downloadLanguage(rig, 'sq');
    await Promise.resolve();
    expect(block(rig).hidden).toBe(true);
  });

  it('Download asks the worker, then shows "n of N files · X MB" with a progress bar and Cancel; the figures follow what the worker reports', async () => {
    const { rig, w } = await chosenAlbanian();
    w.onStart = (s) => ({ ...s, state: 'running', done: 3, total: 1026, bytes: 1.5 * 1024 * 1024 });
    clickAction(rig, 'offline-start');
    await until(() => stateOf(rig) === 'running');
    expect(w.asked.filter((m) => m.op === 'start')).toEqual([{ type: 'golearn:dictionary-download', op: 'start', languageId: 'sq' }]);
    expect(noteOf(rig)).toBe('3 of 1,026 files · 1.5 MB');
    const bar = block(rig).querySelector('progress') as HTMLProgressElement;
    expect(bar.hidden).toBe(false);
    expect(bar.value).toBeCloseTo(3 / 1026, 5);
    expect(bar.getAttribute('aria-label')).toBe('Downloading Albanian for offline use');
    const cancel = block(rig).querySelector<HTMLButtonElement>('[data-action="offline-cancel"]')!;
    expect(cancel.getAttribute('aria-label')).toBe('Cancel the offline download of Albanian');
    expect(block(rig).querySelector('[data-action="offline-start"]')).toBeNull();
    // the page keeps asking while it runs
    w.status.set('sq', { ...NONE(), state: 'running', done: 700, total: 1026, bytes: 40 * 1024 * 1024 });
    await until(() => /700 of 1,026 files · 40\.0 MB/.test(noteOf(rig)));
    // and says so before the first figures are in
    w.status.set('sq', { ...NONE(), state: 'queued' });
    await until(() => noteOf(rig) === 'Getting ready…');
    // Cancel
    clickAction(rig, 'offline-cancel');
    await until(() => stateOf(rig) === 'cancelled');
    expect(w.asked.some((m) => m.op === 'cancel')).toBe(true);
    expect(noteOf(rig)).toBe('The download was stopped. What was saved is kept.');
    expect(block(rig).querySelector('[data-action="offline-start"]')).not.toBeNull();
  });

  it('stops asking when the learner leaves the page', async () => {
    const { rig, w } = await chosenAlbanian({ status: { ...NONE(), state: 'running', done: 1, total: 10, bytes: 100 } });
    await until(() => stateOf(rig) === 'running');
    await rig.go('privacy');
    const n = w.asked.length;
    await new Promise((r) => setTimeout(r, 40));
    expect(w.asked.length).toBe(n);
  });

  it('complete: the measured figures and Remove download; Remove asks the worker and the row goes back to the true line', async () => {
    const { rig, w } = await chosenAlbanian({ status: { ...NONE(), state: 'complete', done: 515, total: 515, bytes: 9.76 * 1024 * 1024 } });
    await until(() => stateOf(rig) === 'complete');
    expect(noteOf(rig)).toBe('Downloaded for offline use · 515 files · 9.8 MB');
    expect(block(rig).querySelector('[data-action="offline-remove"]')!.getAttribute('aria-label')).toBe('Remove the offline download of Albanian');
    // the first look at a complete download also checks, with a short wait, whether a newer dictionary exists
    expect(w.asked.find((m) => m.op === 'status')).toMatchObject({ check: true });
    clickAction(rig, 'offline-remove');
    await until(() => stateOf(rig) === 'none');
    expect(w.asked.some((m) => m.op === 'remove')).toBe(true);
    expect(noteOf(rig)).toBe('The offline copy is removed. Meanings load as you read.');
  });

  it('out of date: "A newer dictionary is available" with Update download', async () => {
    const { rig, w } = await chosenAlbanian({ status: { ...NONE(), state: 'complete', outOfDate: true, done: 10, total: 10, bytes: 2048 } });
    await until(() => stateOf(rig) === 'outdated');
    expect(noteOf(rig)).toBe('A newer dictionary is available.');
    const update = block(rig).querySelector<HTMLButtonElement>('[data-action="offline-update"]')!;
    expect(update.textContent).toBe('Update download');
    expect(update.getAttribute('aria-label')).toBe('Update the offline download of Albanian');
    w.onStart = (s) => ({ ...s, state: 'running', outOfDate: false, done: 1, total: 12, bytes: 4096 });
    update.click();
    await until(() => stateOf(rig) === 'running');
    expect(w.asked.some((m) => m.op === 'start')).toBe(true);
  });

  it('failed: the plain reason and Try again (and Remove when something was saved); Try again starts it again', async () => {
    const reason = 'There is not enough room on this device for the whole dictionary. What was saved still works.';
    const { rig, w } = await chosenAlbanian({ status: { ...NONE(), state: 'failed', done: 40, total: 515, bytes: 1_000_000, error: reason } });
    await until(() => stateOf(rig) === 'failed');
    expect(noteOf(rig)).toBe(reason);
    const retry = block(rig).querySelector<HTMLButtonElement>('[data-action="offline-retry"]')!;
    expect(retry.textContent).toBe('Try again');
    expect(retry.getAttribute('aria-label')).toBe('Try the offline download of Albanian again');
    expect(block(rig).querySelector('[data-action="offline-remove"]')).not.toBeNull();
    w.onStart = (s) => ({ ...s, state: 'running', done: 41, total: 515, error: undefined });
    retry.click();
    await until(() => stateOf(rig) === 'running');
  });

  it('a language with no dictionary in its pack (experimental Norwegian) gets no offline block', async () => {
    const rig = await makeRig();
    fakeOffline(rig);
    await downloadLanguage(rig, 'nb', 'nn');
    expect(rig.root.querySelector('#language-cards [data-language="nb"] .offline')?.getAttribute('data-offline-state') ?? 'none').not.toBe('running');
  });
});

describe('Delete this device\'s data, on the setup page', () => {
  it('asks the worker, then forgets which packs were installed: the row says "Download not finished" and offers Retry to set it up again', async () => {
    const { rig } = await chosenAlbanian();
    const sent: Array<Record<string, unknown>> = [];
    rig.chrome!.events.onMessage.addListener((m, _s, respond) => {
      const msg = m as Record<string, unknown>;
      if (msg.type !== 'golearn:clear-local') return undefined;
      sent.push(msg);
      respond({ ok: true, events: 2, metrics: 0, queued: 1 });
      return true;
    });
    const records = async () => ((await rig.area.get(KEYS.app))[KEYS.app] as { packs: Record<string, unknown> } | undefined)?.packs ?? {};
    expect(Object.keys(await records())).toContain('pack:sq');
    const n = await rig.app.ctx.clearLocal();
    expect(n).toBe(3);
    expect(sent).toHaveLength(1);
    expect(await records()).toEqual({});
    // (the page's own choice is dropped here so that visiting the languages page does not install the active language again by itself, as it does for a choice with no pack record; the enrolment still shows)
    await rig.app.ctx.state.clearChoice();
    await rig.go('privacy');
    await rig.go('languages');
    const row = rig.q('#language-cards [data-language="sq"]');
    await until(() => row.isConnected && rig.root.querySelector('#language-cards [data-language="sq"] .dl-state'));
    expect(rig.q('#language-cards [data-language="sq"] .dl-state').textContent).toBe('Download not finished');
    expect(rig.q('#language-cards [data-language="sq"]').getAttribute('data-state')).toBe('chosen');
    expect(rig.root.querySelector('#language-cards [data-language="sq"] [data-action="retry"]')).not.toBeNull();
  });

  it('the Privacy screen says the dictionaries go too', async () => {
    const rig = await makeRig();
    fakeOffline(rig);
    await rig.go('privacy');
    rig.q<HTMLButtonElement>('#clear-local').click();
    expect(rig.q('#priv-clear').closest('section')!.textContent).toMatch(/the meanings saved as you read and any offline downloads/);
  });
});

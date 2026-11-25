/**
 * The popup's Reading Analysis part: one button, one number.
 *
 * "Analyse this page" reads the whole readable text of the page in front (not only what is on screen) and says what share of its words the
 * learner already Knows. The press is the permission: the popup's own opening gives GoLearn the page (activeTab), the content script is put
 * there if it is not, and the background is told that this tab may ask about its words for a few minutes (src/background/reading.ts).
 * The run goes on in the page; this part asks for its state until it ends, so a popup closed and opened again finds the result.
 */
import { hasSharedCore, selectableVarietiesOf } from '../../repository-contract/src/varieties';

/**
 * The varieties the learner must choose between before a page can be analysed. None for a language whose varieties are dialects with
 * a shared core (Albanian): an undeclared page is read in the written standard, as it always was, and nothing is asked.
 */
const varietiesToChoose = (languageId: string): ReturnType<typeof selectableVarietiesOf> => (hasSharedCore(languageId) ? [] : selectableVarietiesOf(languageId));
import { MSG, type ChromeApi } from '../src/platform';
import { presentProgress, presentResult } from '../src/reading/present';
import type { ReadingStatus } from '../src/reading/protocol';

export const READING_VARIETY_KEY = 'golearn:reading-variety';
const POLL_MS = 300;
const RUNNING = new Set(['extracting', 'resolving', 'verifying', 'calculating']);

export interface ReadingPanelOptions {
  /** The language the popup's select shows. */
  languageId(): string;
  /** Asked again on each press: the popup may have been opened on another tab since. */
  tab(): Promise<{ id?: number; url?: string } | undefined>;
  pollMs?: number;
}

export function initReadingPanel(doc: Document, chrome: ChromeApi, o: ReadingPanelOptions) {
  const $ = <T extends HTMLElement>(id: string): T => doc.getElementById(id) as T;
  const button = $<HTMLButtonElement>('reading-run');
  const varietyRow = $('reading-variety-row');
  const varietySelect = $<HTMLSelectElement>('reading-variety');
  const figure = $('reading-figure');
  const count = $('reading-count');
  const scope = $('reading-scope');
  const notes = $('reading-notes');
  const line = $('reading-line');
  let polling: ReturnType<typeof setTimeout> | undefined;
  let tabId: number | undefined;
  let remembered: Record<string, string> = {};

  const say = (text: string, warn = false): void => { line.textContent = text; line.classList.toggle('warn', warn); };
  const clearResult = (): void => { figure.textContent = ''; count.textContent = ''; scope.textContent = ''; notes.replaceChildren(); };

  /** Hebrew and Greek: which variety the TEXT is in must be said, because a word's knowledge is kept per variety. */
  function renderVarieties(): void {
    const languageId = o.languageId();
    const list = varietiesToChoose(languageId);
    varietyRow.hidden = list.length === 0;
    const keep = varietySelect.value || remembered[languageId] || '';
    const empty = doc.createElement('option');
    empty.value = '';
    empty.textContent = 'Choose…';
    varietySelect.replaceChildren(empty, ...list.map((v) => { const opt = doc.createElement('option'); opt.value = v.id; opt.textContent = v.name; return opt; }));
    varietySelect.value = list.some((v) => v.id === keep) ? keep : '';
  }

  function show(s: ReadingStatus | undefined): void {
    if (!s || s.ok !== true) return;
    const running = RUNNING.has(s.stage);
    button.textContent = running ? 'Cancel' : s.stage === 'done' || s.stage === 'failed' || s.stage === 'canceled' ? 'Analyse again' : 'Analyse this page';
    button.dataset.state = running ? 'running' : 'idle';
    if (s.stage === 'done' && s.result) {
      const p = presentResult(s.result, s.stale === true);
      figure.textContent = p.figure;
      count.textContent = p.count;
      scope.textContent = p.scope;
      notes.replaceChildren(...p.notes.map((note) => { const el = doc.createElement('p'); el.className = `status-line${note.warn ? ' warn' : ''}`; el.textContent = note.text; return el; }));
      say('');
      return;
    }
    clearResult();
    if (s.stage === 'failed') { say(s.error?.message ?? 'GoLearn could not analyse this page.', true); return; }
    say(presentProgress(s.stage, s.progress));
  }

  const send = async (id: number, op: 'start' | 'status' | 'cancel', extra: Record<string, unknown> = {}): Promise<ReadingStatus | undefined> => {
    try {
      const r = (await chrome.tabs?.sendMessage(id, { type: MSG.readingAnalysis, op, ...extra }, { frameId: 0 })) as ReadingStatus | undefined;
      return r && r.ok === true ? r : undefined;
    } catch { return undefined; }
  };

  function poll(id: number): void {
    clearTimeout(polling);
    polling = setTimeout(() => {
      void send(id, 'status').then((s) => {
        if (!s) { button.textContent = 'Analyse this page'; button.dataset.state = 'idle'; say('The page stopped answering. Reload it and analyse again.', true); return; }
        show(s);
        if (RUNNING.has(s.stage)) poll(id);
      });
    }, o.pollMs ?? POLL_MS);
  }

  async function start(): Promise<void> {
    const languageId = o.languageId();
    const varieties = varietiesToChoose(languageId);
    if (varieties.length && !varietySelect.value) { clearResult(); say('Choose which variety of the language this text is in.', true); varietySelect.focus(); return; }
    const tab = await o.tab();
    if (tab?.id === undefined || !tab.url || !/^https?:\/\//i.test(tab.url)) { clearResult(); say('Reading Analysis works on web pages. This page cannot be read.', true); return; }
    const id = tab.id;
    tabId = id;
    clearResult();
    say('Reading the text of the page…');
    button.textContent = 'Cancel';
    button.dataset.state = 'running';
    // the page's own script, if GoLearn is not on this page yet (the popup's opening gave access to this tab)
    if (!(await send(id, 'status'))) {
      try { await chrome.scripting?.executeScript({ target: { tabId: id }, files: ['content.js'] }); } catch { /* said below */ }
      if (!(await send(id, 'status'))) { button.textContent = 'Analyse this page'; button.dataset.state = 'idle'; say('GoLearn cannot read this page. Browser pages and extension stores cannot be read; on any other page, reload it and try again.', true); return; }
    }
    let granted: { ok?: boolean } | undefined;
    try { granted = (await chrome.runtime.sendMessage({ type: MSG.readingKnowledge, op: 'grant', tabId: id })) as typeof granted; } catch { granted = undefined; }
    if (!granted?.ok) { button.textContent = 'Analyse this page'; button.dataset.state = 'idle'; say('The background worker did not answer. Reload the extension.', true); return; }
    if (varietySelect.value) {
      remembered = { ...remembered, [languageId]: varietySelect.value };
      try { await chrome.storage.local.set({ [READING_VARIETY_KEY]: remembered }); } catch { /* a convenience */ }
    }
    const s = await send(id, 'start', { languageId, ...(varietySelect.value ? { varietyId: varietySelect.value } : {}) });
    if (!s) { button.textContent = 'Analyse this page'; button.dataset.state = 'idle'; say('The page did not answer. Reload it and analyse again.', true); return; }
    show(s);
    if (RUNNING.has(s.stage)) poll(id);
  }

  button.addEventListener('click', () => {
    if (button.dataset.state === 'running' && tabId !== undefined) {
      clearTimeout(polling);
      void send(tabId, 'cancel').then((s) => { if (s) show(s); else { button.textContent = 'Analyse this page'; button.dataset.state = 'idle'; say('Analysis cancelled.'); } });
      return;
    }
    void start();
  });

  /** The popup's language changed: the variety choices are that language's, and a result shown is another language's. */
  function languageChanged(): void {
    varietySelect.value = '';
    renderVarieties();
    clearTimeout(polling);
    clearResult();
    say('');
    button.textContent = 'Analyse this page';
    button.dataset.state = 'idle';
  }

  /** When the popup opens: the last result of this page, if a run was made here (a popup closed during a run finds it finished). */
  async function restore(): Promise<void> {
    try {
      const kept = (await chrome.storage.local.get(READING_VARIETY_KEY))[READING_VARIETY_KEY];
      if (kept && typeof kept === 'object') remembered = Object.fromEntries(Object.entries(kept as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'));
    } catch { remembered = {}; }
    renderVarieties();
    const tab = await o.tab().catch(() => undefined);
    if (tab?.id === undefined) return;
    tabId = tab.id;
    const s = await send(tab.id, 'status');
    if (!s || s.stage === 'idle') return;
    if (s.result && s.result.languageId !== o.languageId()) return; // the result of another language: not this panel's to show
    if (s.result?.varietyId) varietySelect.value = s.result.varietyId;
    show(s);
    if (RUNNING.has(s.stage)) poll(tab.id);
  }

  return { restore, languageChanged, renderVarieties };
}

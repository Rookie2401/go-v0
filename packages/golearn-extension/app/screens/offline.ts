/**
 * "Download for offline use" on a language row (2026-11-11). Meanings load as the learner reads; this keeps the whole dictionary of a
 * language on the device so that a word never met before still has its meaning with no connection. The worker does the work
 * (src/background/dictionaryDownload.ts); this page asks, shows the progress it polls, and offers Cancel, Remove and Update.
 *
 * Only in the extension (there is no worker in the hosted page). The dictionary's full entries (card level 2) are not part of it.
 */
import { MSG } from '../../src/platform';
import type { AppContext } from '../context';
import { button, clear, h } from '../dom';
import type { PackView } from '../ports';
import type { View } from './view';

/** The reply of the worker's `golearn:dictionary-download` (see DownloadStatus in the worker). */
export interface OfflineStatus {
  languageId: string;
  state: 'none' | 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';
  outOfDate: boolean;
  done: number;
  total: number;
  bytes: number;
  error?: string;
}

export const OFFLINE_POLL_MS = 1000;
const LONG_ASK_MS = 20_000;

export const megabytes = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const files = (n: number): string => `${n.toLocaleString('en')} file${n === 1 ? '' : 's'}`;

/** Whether the pack has a dictionary to keep (a pack that declares none, experimental Norwegian, has nothing to download). */
export function hasDictionary(pack: PackView): boolean {
  const lexical = (pack.manifest as { lexical?: { dictionary?: unknown } } | undefined)?.lexical;
  return !lexical || !!lexical.dictionary;
}

export const NOT_DOWNLOADED = 'Meanings load as you read. The first time you meet a word needs a connection.';

/** One pack's offline block: a status line and its controls. `paint(status)` redraws it; `poll()` asks the worker. */
export function createOfflineBlock(ctx: AppContext, view: View, pack: PackView, opts: { onChange?: () => void } = {}) {
  const el = h('div', { class: 'offline', 'data-offline': pack.languageId, 'data-offline-state': 'unknown', hidden: true });
  const note = h('p', { class: 'muted offline-note', role: 'status', 'aria-live': 'polite' });
  const bar = h('progress', { max: '1', value: '0', hidden: true, 'aria-label': `Downloading ${pack.name} for offline use` }) as HTMLProgressElement;
  const controls = h('span', { class: 'offline-controls' });
  el.append(note, bar, controls);
  let timer: number | undefined;
  let polling = false;
  let message = '';
  let first = true;

  const ask = async (op: 'start' | 'status' | 'cancel' | 'remove', extra: Record<string, unknown> = {}, timeout?: number): Promise<OfflineStatus | undefined> => {
    const r = await ctx.ask<{ ok?: boolean; status?: OfflineStatus }>({ type: MSG.dictionaryDownload, op, languageId: pack.languageId, ...extra }, timeout);
    const v = r.value;
    return r.answered && v && v.ok === true && v.status ? v.status : undefined;
  };

  const act = (op: 'start' | 'cancel' | 'remove', after?: string): (() => void) => () => {
    void (async () => {
      controls.querySelectorAll('button').forEach((b) => { (b as HTMLButtonElement).disabled = true; });
      const s = await ask(op, {}, op === 'start' ? undefined : LONG_ASK_MS);
      message = after ?? '';
      if (!view.alive()) return;
      if (s) paint(s);
      else { message = 'GoLearn could not reach its background service. Try again.'; controls.querySelectorAll('button').forEach((b) => { (b as HTMLButtonElement).disabled = false; }); note.textContent = message; }
      opts.onChange?.();
      schedule(s);
    })();
  };

  function paint(s: OfflineStatus): void {
    el.hidden = false;
    el.setAttribute('data-offline-state', s.outOfDate && s.state === 'complete' ? 'outdated' : s.state);
    clear(controls);
    bar.hidden = true;
    const name = pack.name;
    const btn = (text: string, action: string, onClick: () => void, label: string, primary = false): HTMLButtonElement =>
      button(text, onClick, { class: 'btn small', 'data-action': action, 'data-emphasis': primary ? 'main' : 'other', 'aria-label': label }); // quiet: a row has no filled button (docs/golearn/DESIGN-SYSTEM.md)
    if (s.state === 'queued' || s.state === 'running') {
      bar.hidden = false;
      bar.value = s.total > 0 ? Math.min(1, s.done / s.total) : 0;
      note.textContent = s.total > 0 ? `${s.done.toLocaleString('en')} of ${s.total.toLocaleString('en')} files · ${megabytes(s.bytes)}` : 'Getting ready…';
      controls.append(btn('Cancel', 'offline-cancel', act('cancel', 'The download was stopped. What was saved is kept.'), `Cancel the offline download of ${name}`));
    } else if (s.state === 'complete') {
      if (s.outOfDate) {
        note.textContent = 'A newer dictionary is available.';
        controls.append(btn('Update download', 'offline-update', act('start'), `Update the offline download of ${name}`, true), btn('Remove download', 'offline-remove', act('remove', 'The offline copy is removed. Meanings load as you read.'), `Remove the offline download of ${name}`));
      } else {
        note.textContent = `Downloaded for offline use · ${files(s.total)} · ${megabytes(s.bytes)}`;
        controls.append(btn('Remove download', 'offline-remove', act('remove', 'The offline copy is removed. Meanings load as you read.'), `Remove the offline download of ${name}`));
      }
    } else if (s.state === 'failed') {
      note.textContent = s.error || 'The download did not finish.';
      controls.append(btn('Try again', 'offline-retry', act('start'), `Try the offline download of ${name} again`, true));
      if (s.done > 0) controls.append(btn('Remove download', 'offline-remove', act('remove', 'The offline copy is removed. Meanings load as you read.'), `Remove the offline download of ${name}`));
    } else {
      note.textContent = message || (s.state === 'cancelled' ? `${NOT_DOWNLOADED} A stopped download is carried on from where it stopped.` : NOT_DOWNLOADED);
      controls.append(
        btn('Download for offline use', 'offline-start', act('start'), `Download ${name} for offline use`, true),
        h('span', { class: 'muted offline-help' }, ' Keeps the meanings and word forms of the dictionary on this device, so every word works with no connection. The full dictionary entries are not part of it. The size is shown as it downloads.'));
    }
    if (s.state !== 'none' && s.state !== 'cancelled') message = '';
  }

  function schedule(s: OfflineStatus | undefined): void {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
    if (!s || (s.state !== 'queued' && s.state !== 'running') || !view.alive()) return;
    timer = ctx.deps.win.setTimeout(() => { timer = undefined; void poll(); }, ctx.deps.offlinePollMs ?? OFFLINE_POLL_MS);
  }

  /** Ask the worker; the first ask of a complete download also checks, with a short wait, whether a newer dictionary exists. */
  async function poll(): Promise<OfflineStatus | undefined> {
    if (polling || !view.alive()) return undefined;
    polling = true;
    try {
      const s = await ask('status', first ? { check: true } : {}, first ? 7000 : undefined);
      first = false;
      if (!view.alive()) return s;
      if (s) paint(s); else { el.hidden = true; }
      schedule(s);
      return s;
    } finally { polling = false; }
  }

  view.onDispose(() => { if (timer !== undefined) clearTimeout(timer); timer = undefined; });
  return { el, poll };
}

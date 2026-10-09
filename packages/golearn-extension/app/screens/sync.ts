/**
 * 7. Sync. The extension’s background worker owns synchronisation; this screen reads its status (`golearn:status`, which
 * answers extension pages with the sync view) and can ask for a run (`golearn:sync-now`). In the hosted web app there is
 * nothing to synchronise: the screen says so.
 */
import type { AppContext } from '../context';
import { append, button, clear, h, p, setStatus, shortDate, statusLine } from '../dom';
import { MSG } from '../../src/platform';
import type { PageStatus, SyncView } from '../../src/protocol';
import { createStorageEncounterStore } from '../../src/store';
import type { View } from './view';

export interface SyncStatus {
  pending?: number;
  rejected?: number;
  lastSyncAt?: string;
  lastError?: string;
  online?: boolean;
  needsSignIn?: boolean;
  connected?: boolean;
}

/** The worker’s reply (PageStatus with a nested `sync`, or a bare sync view) as one flat record; `lastPushAt` is epoch milliseconds. */
export function normaliseStatus(raw: unknown): SyncStatus | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<PageStatus> & Partial<SyncView> & { lastSyncAt?: string };
  const s: Partial<SyncView> & { lastSyncAt?: string } = r.sync && typeof r.sync === 'object' ? r.sync : r;
  const at = typeof s.lastPushAt === 'number' ? new Date(s.lastPushAt).toISOString() : typeof s.lastSyncAt === 'string' ? s.lastSyncAt : undefined;
  return {
    pending: typeof s.pending === 'number' ? s.pending : undefined, rejected: typeof s.rejected === 'number' ? s.rejected : undefined,
    lastSyncAt: at, lastError: typeof s.lastError === 'string' ? s.lastError : undefined,
    online: typeof s.online === 'boolean' ? s.online : undefined, needsSignIn: s.needsSignIn === true,
    connected: typeof r.connected === 'boolean' ? r.connected : undefined,
  };
}

export async function readStatus(ctx: AppContext): Promise<{ answered: boolean; status?: SyncStatus }> {
  const r = await ctx.ask<unknown>({ type: MSG.status });
  const s = r.answered ? normaliseStatus(r.value) : undefined;
  return s ? { answered: true, status: s } : { answered: false };
}

const SKIPPED: Record<string, string> = {
  'not-connected': 'You are not signed in, so there is nothing to send.',
  'needs-sign-in': 'The service no longer accepts your sign-in. Sign in again on the Account screen.',
  offline: 'The browser is offline; events wait on this device.',
  backoff: 'A recent attempt failed; the extension is waiting before trying again.',
};

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const box = h('section', { class: 'card', id: 'sync-box', 'aria-labelledby': 'sync-h' });
  const out = statusLine();
  el.append(box, out);

  async function paint(): Promise<void> {
    const [session, local] = await Promise.all([ctx.state.getSession(), createStorageEncounterStore(ctx.deps.area).count().catch(() => 0)]);
    const reply: { answered: boolean; status?: SyncStatus } = ctx.inExtension ? await readStatus(ctx) : { answered: false };
    if (!view.alive()) return;
    clear(box);
    box.append(h('h2', { id: 'sync-h' }, 'Synchronisation'));
    const online = ctx.deps.win.navigator.onLine;
    if (!ctx.inExtension) {
      append(box, [
        p('Synchronisation runs inside the extension. This page is running as a website, so there is nothing here to synchronise.'),
        h('p', { id: 'sync-local' }, `Rows kept on this origin (from the orientation): ${local}.`),
        p(`This browser is ${online ? 'online' : 'offline'}.`, 'muted'),
      ]);
      return;
    }
    const s = reply.status;
    const rows: Array<[string, string]> = [
      ['Account', session ? `connected as ${session.email}${s?.needsSignIn ? ' (the service asks you to sign in again)' : ''}` : 'not connected — nothing is sent anywhere'],
      ['Connection', (s?.online ?? online) ? 'online' : 'offline (events wait on this device and are sent later)'],
      ['Rows stored on this device', String(local)],
    ];
    if (reply.answered && s) {
      rows.push(['Waiting to send', s.pending === undefined ? 'unknown' : String(s.pending)]);
      rows.push(['Last sync', shortDate(s.lastSyncAt)]);
      if (s.rejected) rows.push(['Refused by the service', String(s.rejected)]);
      rows.push(['Last error', s.lastError ?? 'none']);
    } else {
      rows.push(['Background status', 'the extension’s background worker did not answer; its sync status is not available']);
    }
    box.append(h('dl', { class: 'facts', id: 'sync-facts' }, ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])));
    box.append(h('div', { class: 'row' }, button('Sync now', async () => {
      setStatus(out, 'Asking the extension to sync…', 'info');
      const r = await ctx.ask<{ ok?: boolean; skipped?: string; message?: string; error?: string }>({ type: MSG.syncNow }, 30_000);
      const v = r.value;
      if (!r.answered) setStatus(out, 'The extension’s background worker did not answer, so no sync was started.', 'error');
      else if (v?.skipped) setStatus(out, SKIPPED[v.skipped] ?? `Nothing was sent (${v.skipped}).`, v.ok === false ? 'error' : 'info');
      else if (v?.ok === false) setStatus(out, v.error ?? v.message ?? 'The sync did not complete; the extension will try again.', 'error');
      else setStatus(out, v?.message ?? 'Synchronised.', 'ok');
      await paint();
    }, { id: 'sync-now', class: 'btn primary' })));
  }
  await paint();
}

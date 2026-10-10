/**
 * The GoPractice shell: the one active language, the three workspaces (GoReview | GoTell | Settings), the sync
 * indicator and the hash router. The shell holds no review or writing logic: GoReview and GoTell are separate packages
 * rendered into the same main area. No streaks, no points, no badges.
 *
 * An account is optional where the app runs inside the GoLearn extension: it then works on the device (the on-device Repository) and offers
 * the account any time (#/signin). The hosted copy has no such repository and shows #/signin first, explaining that.
 *
 * Routes:  #/review[/session | /history/<item> | /transfer]   #/tell   #/settings   #/signin
 */
import { append, clear, h, p } from './dom';
import { languageName } from './format';
import { createContext, type AppContext, type Mode, type SyncView } from './context';
import type { Deps } from './ports';
import * as reviewScreen from './screens/review';
import * as settingsScreen from './screens/settings';
import * as signinScreen from './screens/signin';
import * as tellScreen from './screens/tell';
import type { View } from './screens/view';
import { shortDate } from './dom';

export interface RouteDef {
  id: 'review' | 'tell' | 'settings' | 'signin';
  title: string;
  render(el: HTMLElement, ctx: AppContext, view: View, params: string[]): void | Promise<void>;
}

export const ROUTES: readonly RouteDef[] = [
  { id: 'review', title: 'GoReview', render: reviewScreen.render },
  { id: 'tell', title: 'GoTell', render: tellScreen.render },
  { id: 'settings', title: 'Settings', render: settingsScreen.render },
  { id: 'signin', title: 'Sign in', render: signinScreen.render },
];
export const NAV = ROUTES.filter((r) => r.id !== 'signin');

export interface ParsedRoute { id: RouteDef['id']; params: string[]; path: string }

/** `#/review/history/card%3Ax` → { id: 'review', params: ['history', 'card%3Ax'] }; undefined for an unknown route. */
export function parseHash(hash: string): ParsedRoute | undefined {
  const m = /^#\/?([a-z-]*)(?:\/(.*))?$/.exec(hash);
  if (!m) return undefined;
  const def = ROUTES.find((r) => r.id === m[1]);
  if (!def) return undefined;
  const params = m[2] ? m[2].split('/').filter(Boolean) : [];
  return { id: def.id, params, path: [def.id, ...params].join('/') };
}

export interface AppHandle {
  ctx: AppContext;
  /** The route currently shown, e.g. `review/session`. */
  current(): string;
  go(route: string): Promise<void>;
  /** Resolves when the current screen has finished rendering. */
  ready(): Promise<void>;
  destroy(): void;
}

export function createApp(root: HTMLElement, deps: Deps): AppHandle {
  const win = deps.win;
  let seq = 0;
  let route = '';
  let renderDone: Promise<void> = Promise.resolve();
  let disposers: Array<() => void> = [];
  let destroyed = false;

  const navEl = h('nav', { class: 'topnav', 'aria-label': 'GoPractice' });
  const langWrap = h('div', { class: 'language' });
  const syncEl = h('p', { id: 'sync-indicator', class: 'sync', role: 'status', 'aria-live': 'polite' });
  const acctEl = h('p', { class: 'account', id: 'account' });
  const header = h('header', { class: 'topbar' }, h('span', { class: 'brand' }, 'GoPractice'), navEl, langWrap, syncEl, acctEl);
  const main = h('main', { id: 'screen', class: 'screen', tabindex: '-1' });
  clear(root);
  root.append(h('div', { class: 'shell' }, header, main));

  const ctx = createContext(deps, { go: (r) => { void go(r); }, changed: () => { void refreshHeader(); } });

  // ───────────── header ─────────────

  function syncText(v: SyncView, mode: Mode): { text: string; kind: 'ok' | 'info' | 'error' } {
    if (mode === 'none') return { text: 'Not signed in', kind: 'info' };
    if (mode === 'device') return { text: 'On this device only', kind: 'info' };
    if (v.authExpired) return { text: 'Sign in again to sync. Nothing on this device was lost.', kind: 'error' };
    const s = v.status;
    if (!s) return { text: 'Sync not started', kind: 'info' };
    const waiting = s.pending ? `${s.pending} waiting` : 'nothing waiting';
    if (!s.online) return { text: `Offline · ${waiting} on this device`, kind: 'info' };
    if (s.lastError) return { text: `Sync problem: ${s.lastError} · ${waiting} · will retry`, kind: 'error' };
    if (v.syncing) return { text: `Syncing · ${waiting}`, kind: 'info' };
    const last = s.lastPullAt ?? s.lastPushAt;
    return { text: `Online · ${waiting} · ${last ? `last sync ${shortDate(new Date(last).toISOString())}` : 'not synced yet'}`, kind: 'ok' };
  }

  function paintSync(v: SyncView, mode: Mode): void {
    const t = syncText(v, mode);
    syncEl.textContent = t.text;
    syncEl.setAttribute('data-kind', t.kind);
  }

  async function refreshHeader(): Promise<void> {
    if (destroyed) return;
    const mode = await ctx.mode();
    if (destroyed) return;
    clear(navEl);
    for (const r of NAV) {
      const active = route === r.id || route.startsWith(`${r.id}/`);
      navEl.append(h('a', { href: `#/${r.id}`, 'data-route': r.id, ...(active ? { 'aria-current': 'page' } : {}) }, r.title));
    }
    navEl.hidden = mode === 'none';
    // read first, then replace the switcher in one synchronous step: two header refreshes in flight must not both append to it
    const list = mode !== 'none' ? await ctx.enrolments() : [];
    const id = mode !== 'none' ? await ctx.identity() : undefined;
    if (destroyed) return;
    clear(langWrap);
    if (list.length) {
      const select = h('select', { id: 'language-select', name: 'language', 'aria-label': 'Language' },
        ...list.map((e) => h('option', { value: e.enrolmentId, ...(id?.enrolmentId === e.enrolmentId ? { selected: true } : {}) }, `${e.languageId}${e.varietyId ? ` (${e.varietyId})` : ''}`))) as HTMLSelectElement;
      select.value = id?.enrolmentId ?? list[0].enrolmentId;
      select.addEventListener('change', () => { void switchLanguage(select.value); });
      langWrap.append(h('label', { class: 'language-label' }, h('span', { class: 'sr' }, 'Language '), select));
      // none was picked here: say which one was chosen for the learner, and why, in one line
      if (id?.chosenBy === 'recent-reading') langWrap.append(h('span', { class: 'language-note', id: 'language-note' }, `${languageName(id.languageId)}: the language you read most recently`));
    }
    paintSync(await ctx.syncView(), mode);
    // the account is offered any time, never required
    clear(acctEl);
    if (mode === 'device') acctEl.append(h('a', { href: '#/signin', id: 'account-link', class: 'account-link' }, 'Keep your progress across devices (optional)'));
    else if (mode === 'account') acctEl.append(h('span', { id: 'account-state', class: 'account-state' }, 'Synced to your account'));
  }

  async function switchLanguage(enrolmentId: string): Promise<void> {
    const ok = await ctx.setLanguage(enrolmentId);
    if (!ok) return;
    // the deck of the other language is folded afresh from the same local log
    const top = route.split('/')[0];
    if (top === 'review' || top === 'tell') {
      if (win.location.hash !== `#/${top}`) win.location.hash = `#/${top}`;
      renderDone = show(top, []);
      await renderDone;
    } else await refreshHeader();
  }

  const offSync = ctx.onSync((v) => { void ctx.mode().then((m) => { if (!destroyed) paintSync(v, m); }); });

  // ───────────── routing ─────────────

  async function show(id: RouteDef['id'], params: string[]): Promise<void> {
    const my = ++seq;
    for (const d of disposers) { try { d(); } catch { /* a screen's cleanup must not stop the next screen */ } }
    disposers = [];
    const mode = await ctx.mode();
    let target: RouteDef['id'] = id;
    let subs = params;
    // the hosted copy needs an account for anything but the sign-in page; inside the extension nothing is behind it
    if (mode === 'none' && target !== 'signin') { target = 'signin'; subs = []; if (win.location.hash !== '#/signin') win.location.hash = '#/signin'; }
    if (my !== seq) return;
    const def = ROUTES.find((r) => r.id === target)!;
    route = [def.id, ...subs].join('/');
    deps.doc.title = `GoPractice — ${def.title}`;
    clear(main);
    main.setAttribute('data-route', route);
    const idn = await ctx.identity();
    if (my !== seq) return;
    if (idn) main.setAttribute('data-language', idn.varietyId ?? idn.languageId); else main.removeAttribute('data-language');
    const body = h('div', { class: 'body' });
    main.append(h('h1', {}, def.title), body);
    const view: View = { alive: () => my === seq && !destroyed, onDispose: (fn) => { disposers.push(fn); } };
    try { await def.render(body, ctx, view, subs); } catch (e) {
      if (view.alive()) { clear(body); append(body, [p(`This screen could not be shown: ${e instanceof Error ? e.message : String(e)}`, 'error')]); }
    }
    if (!view.alive()) return;
    await refreshHeader();
    // a screen that put focus on a control of its own (the answer box of a session's first item) keeps it; otherwise the screen itself takes focus
    const held = deps.doc.activeElement;
    if (held && held !== main && main.contains(held)) return;
    try { main.focus({ preventScroll: true }); } catch { /* focus is a convenience */ }
  }

  async function go(next: string): Promise<void> {
    const parsed = parseHash(`#/${next.replace(/^#?\/?/, '')}`);
    const target = parsed ?? { id: 'review' as const, params: [], path: 'review' };
    const wanted = `#/${target.path}`;
    if (win.location.hash !== wanted) win.location.hash = wanted;
    if (route === target.path) return;
    renderDone = show(target.id, target.params);
    await renderDone;
  }

  const onHash = (): void => {
    const r = parseHash(win.location.hash);
    if (r && r.path !== route) renderDone = show(r.id, r.params);
  };
  win.addEventListener('hashchange', onHash);

  renderDone = (async () => {
    const initial = parseHash(win.location.hash);
    const open = (await ctx.mode()) !== 'none';
    const first = initial ?? { id: (open ? 'review' : 'signin') as RouteDef['id'], params: [], path: open ? 'review' : 'signin' };
    if (win.location.hash !== `#/${first.path}` && !initial) win.location.hash = `#/${first.path}`;
    await show(first.id, first.params);
  })();

  return {
    ctx,
    current: () => route,
    go,
    ready: () => renderDone,
    destroy() {
      destroyed = true;
      win.removeEventListener('hashchange', onHash);
      offSync();
      for (const d of disposers) { try { d(); } catch { /* */ } }
      disposers = [];
      ctx.destroy();
      clear(root);
    },
  };
}

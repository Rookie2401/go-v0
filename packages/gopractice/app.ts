/**
 * The GoPractice shell: the one active language, the three workspaces (GoReview | GoTell | Settings), the sync
 * indicator and the hash router. The shell holds no review or writing logic: GoReview and GoTell are separate packages
 * rendered into the same main area. No streaks, no points, no badges.
 *
 * An account is optional where the app runs inside the GoLearn extension: it then works on the device (the on-device Repository) and offers
 * the account any time (#/signin). The hosted copy has no such repository and shows #/signin first, explaining that.
 *
 * The header is quiet: the active language (with its variety) and the Settings cog. Review, GoTell and the rest are reached from the
 * GoReview home, which shows four things only; the sync state is spoken for assistive technology and shown only when it needs attention.
 *
 * Live updates (./live.ts) keep the data current while the app is visible, and the "Update ready — reload" link appears when the GoReview build's
 * service worker has a newer version waiting.
 *
 * Routes:  #/review[/session | /history/<item> | /transfer | /decks | /vocab | /details]   #/tell   #/vocabulary   #/settings   #/signin
 *           #/privacy and #/terms (the legal drafts; open without an account)
 */
import { append, clear, h, p } from './dom';
import { languageName } from './format';
import { createContext, type AppContext, type Mode, type SyncView } from './context';
import type { Deps } from './ports';
import * as legalScreen from './screens/legal';
import * as reviewScreen from './screens/review';
import * as settingsScreen from './screens/settings';
import * as signinScreen from './screens/signin';
import * as tellScreen from './screens/tell';
import * as vocabularyScreen from './screens/vocabulary';
import { createLive, type Live } from './live';
import type { View } from './screens/view';
import { shortDate } from './dom';
import { dismissSplash } from './splash';

export interface RouteDef {
  id: 'review' | 'tell' | 'vocabulary' | 'settings' | 'signin' | 'privacy' | 'terms';
  title: string;
  render(el: HTMLElement, ctx: AppContext, view: View, params: string[]): void | Promise<void>;
}

export const ROUTES: readonly RouteDef[] = [
  { id: 'review', title: 'GoReview', render: reviewScreen.render },
  { id: 'tell', title: 'GoTell', render: tellScreen.render },
  { id: 'vocabulary', title: 'My Vocabulary', render: vocabularyScreen.render },
  { id: 'settings', title: 'Settings', render: settingsScreen.render },
  { id: 'signin', title: 'Sign in', render: signinScreen.render },
  { id: 'privacy', title: 'Privacy Policy', render: legalScreen.renderPrivacy },
  { id: 'terms', title: 'Terms of use', render: legalScreen.renderTerms },
];
/** The routes that get a quiet way back to the GoReview home above their title. */
const HAS_BACK = new Set<RouteDef['id']>(['tell', 'vocabulary', 'settings', 'privacy', 'terms']);

/** The Settings cog: a plain SVG (no icon font, nothing fetched), named for assistive technology by the link. */
function cogIcon(doc: Document): Element {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: '20', height: '20', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(k, v);
  const circle = doc.createElementNS(ns, 'circle');
  for (const [k, v] of Object.entries({ cx: '12', cy: '12', r: '3' })) circle.setAttribute(k, v);
  const path = doc.createElementNS(ns, 'path');
  path.setAttribute('d', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z');
  svg.append(circle, path);
  return svg;
}

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

  const langWrap = h('div', { class: 'language' });
  const syncEl = h('p', { id: 'sync-indicator', class: 'sync', role: 'status', 'aria-live': 'polite' });
  const acctEl = h('p', { class: 'account', id: 'account' });
  // the Go mark (the G and the globe, packages/shared-brand) as a silhouette filled with the accent colour: the Western Canon brown on paper, the lighter brown of the dark theme
  const logoUrl = new URL('../shared-brand/go-logo.png', import.meta.url).href;
  // the top bar carries the Go mark alone (the launch screen showed the full GO / REVIEW wordmark); the link's label says the name
  const brandLink = h('a', { class: 'go-brand', href: '#/review', 'aria-label': 'GoReview home' },
    h('span', { class: 'go-brand-mark', 'aria-hidden': 'true', style: `--go-brand-mask: url("${logoUrl}")` }));
  const header = h('header', { class: 'topbar' }, brandLink, langWrap, syncEl, acctEl);
  /**
   * The language switcher lives in ONE element. On the home it stands where the page title used to be (the slot the home's
   * shell renders, #home-language); on every other screen it sits in the top bar beside the wordmark.
   */
  function placeLanguage(): void {
    const slot = main.querySelector('#home-language');
    if (slot) { if (langWrap.parentElement !== slot) slot.append(langWrap); }
    else if (langWrap.parentElement !== header) header.insertBefore(langWrap, syncEl);
  }
  const main = h('main', { id: 'screen', class: 'screen', tabindex: '-1' });
  clear(root);
  root.append(h('div', { class: 'shell' }, header, main));

  const brand = deps.edition === 'review' ? 'GoReview' : 'GoPractice';
  if (deps.edition === 'review') deps.doc.documentElement.setAttribute('data-edition', 'review');
  let live: Live | undefined;
  const ctx = createContext(deps, { go: (r) => { void go(r); }, changed: () => { void safeRefreshHeader(); live?.kick(); } });

  // ───────────── a newer build is waiting (the GoReview service worker) ─────────────

  /** Built when a worker is waiting (the header carries nothing else until then): a quiet text button in the link style, before the sync line. */
  let updateEl: HTMLElement | undefined;
  const onUpdateClick = (ev: Event): void => {
    ev.preventDefault();
    const apply = (win as unknown as { __goreviewApplyUpdate?: () => boolean }).__goreviewApplyUpdate;
    // the page reloads itself when the new worker takes over; without a worker to tell, a plain reload does it
    if (!(apply && apply())) { try { win.location.reload(); } catch { /* */ } }
  };
  const showUpdate = (): void => {
    if (updateEl || destroyed) return;
    updateEl = h('button', { type: 'button', id: 'update-ready', class: 'linklike update-link' }, 'Update ready — reload');
    updateEl.addEventListener('click', onUpdateClick);
    header.insertBefore(updateEl, syncEl);
  };
  const onUpdateReady = (): void => showUpdate();
  win.addEventListener('goreview:update-ready', onUpdateReady);
  if ((win as unknown as { __goreviewUpdate?: unknown }).__goreviewUpdate) showUpdate();

  // ───────────── live updates ─────────────

  if (deps.live !== false && (deps.autoSync || deps.live)) {
    const lv = deps.live ?? {};
    live = createLive({
      win, doc: deps.doc, fetch: deps.fetch, ...lv,
      auth: async () => { const a = await ctx.api(); return a.session ? { baseUrl: a.baseUrl, token: a.session.token } : undefined; },
      pull: async (reason) => {
        // a live update outdates the cached profile (a language added in GoLearn) before the pull that may bring its first events
        if (reason === 'wait') ctx.invalidateProfile();
        const r = await ctx.syncNow({ force: true });
        return r ? { appended: r.pull?.appended ?? 0, ...(r.pull?.cursor !== undefined ? { cursor: r.pull.cursor } : {}) } : undefined;
      },
      onChanged: () => { void safeRefreshHeader(); },
    });
    live.kick();
  }
  const onResume = (): void => live?.kick();
  const onSuspend = (): void => live?.stop();
  win.addEventListener('resume', onResume);
  win.addEventListener('suspend', onSuspend);

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
    // quiet unless it needs the learner: the text stays in the page for assistive technology
    syncEl.classList.toggle('sr', t.kind !== 'error');
  }

  async function refreshHeader(): Promise<void> {
    if (destroyed) return;
    const mode = await ctx.mode();
    if (destroyed) return;
    // read first, then replace the switcher in one synchronous step: two header refreshes in flight must not both append to it
    const list = mode !== 'none' ? await ctx.enrolments() : [];
    const id = mode !== 'none' ? await ctx.identity() : undefined;
    if (destroyed) return;
    clear(langWrap);
    if (list.length) {
      // a quiet kicker: the language's name only; a select (same quiet style, a tiny arrow) only when there is more than one to choose from
      const nameOf = (e: (typeof list)[number]): string => {
        const sameLanguage = list.filter((x) => x.languageId === e.languageId).length > 1;
        return languageName(e.languageId) + (sameLanguage && e.varietyId ? ` (${e.varietyId})` : '');
      };
      const current = list.find((e) => e.enrolmentId === id?.enrolmentId) ?? list[0];
      const tip = id?.chosenBy === 'recent-reading' ? `${languageName(current.languageId)}: the language you read most recently` : `${languageName(current.languageId)}${current.varietyId ? ` (${current.varietyId})` : ''}`;
      if (list.length > 1) {
        const select = h('select', { id: 'language-select', name: 'language', class: 'language-kicker', 'aria-label': 'Language', title: tip },
          ...list.map((e) => h('option', { value: e.enrolmentId, ...(id?.enrolmentId === e.enrolmentId ? { selected: true } : {}) }, nameOf(e)))) as HTMLSelectElement;
        select.value = id?.enrolmentId ?? list[0].enrolmentId;
        select.addEventListener('change', () => { void switchLanguage(select.value); });
        langWrap.append(h('span', { class: 'language-picker' }, select, h('span', { class: 'language-caret', 'aria-hidden': 'true' }, '▾')));
      } else {
        langWrap.append(h('span', { id: 'language-name', class: 'language-kicker', title: tip }, nameOf(current)));
      }
    }
    paintSync(await ctx.syncView(), mode);
    // the account is offered any time, never required
    clear(acctEl);
    if (mode !== 'none') {
      const cog = h('a', { href: '#/settings', id: 'settings-link', class: 'cog', 'aria-label': 'Settings', title: 'Settings', ...(route === 'settings' ? { 'aria-current': 'page' } : {}) });
      cog.append(cogIcon(deps.doc));
      acctEl.append(cog);
    }
  }

  async function safeRefreshHeader(): Promise<void> {
    try { await refreshHeader(); }
    catch {
      if (!destroyed) { syncEl.textContent = 'Account status could not be loaded'; syncEl.setAttribute('data-kind', 'error'); syncEl.classList.remove('sr'); }
    }
  }

  async function switchLanguage(enrolmentId: string): Promise<void> {
    const ok = await ctx.setLanguage(enrolmentId);
    if (!ok) return;
    // the deck of the other language is folded afresh from the same local log
    const top = route.split('/')[0];
    if (top === 'review' || top === 'tell' || top === 'vocabulary') {
      if (win.location.hash !== `#/${top}`) win.location.hash = `#/${top}`;
      renderDone = show(top, []);
      await renderDone;
    } else await safeRefreshHeader();
  }

  const offSync = ctx.onSync((v) => { void ctx.mode().then((m) => { if (!destroyed) paintSync(v, m); }); });

  // ───────────── routing ─────────────

  async function show(id: RouteDef['id'], params: string[]): Promise<void> {
    const my = ++seq;
    for (const d of disposers) { try { d(); } catch { /* a screen's cleanup must not stop the next screen */ } }
    disposers = [];
    clear(main);
    main.setAttribute('data-route', [id, ...params].join('/'));
    append(main, [p('Opening GoReview…', 'muted')]);
    const recovery = (message: string, retry: () => void): HTMLElement => {
      const button = h('button', { type: 'button', class: 'btn primary' }, 'Try again') as HTMLButtonElement;
      button.addEventListener('click', retry);
      return h('section', { class: 'card error', role: 'alert' }, p(message), button);
    };
    let mode: Mode;
    try { mode = await ctx.mode(); }
    catch {
      if (my === seq && !destroyed) {
        clear(main);
        append(main, [h('h1', {}, 'GoReview'), recovery('GoReview could not open your saved account data. Try again.', () => { renderDone = show(id, params); })]);
      }
      return;
    }
    let target: RouteDef['id'] = id;
    let subs = params;
    // the hosted copy needs an account for anything but the sign-in page; inside the extension nothing is behind it
    if (mode === 'none' && target !== 'signin' && target !== 'privacy' && target !== 'terms') { target = 'signin'; subs = []; if (win.location.hash !== '#/signin') win.location.hash = '#/signin'; }
    if (my !== seq) return;
    const def = ROUTES.find((r) => r.id === target)!;
    route = [def.id, ...subs].join('/');
    deps.doc.title = brand === 'GoReview' && def.id === 'review' ? 'GoReview' : `${brand} — ${def.title}`;
    clear(main);
    main.setAttribute('data-route', route);
    const body = h('div', { class: 'body' });
    // the home has no visible title: the wordmark is in the top bar and the language dropdown takes the title's place (the h1 stays for assistive technology)
    // every review screen keeps its 'GoReview' h1 for assistive technology only (the wordmark is in the top bar); the home alone shows the dropdown in the title's place
    const review = def.id === 'review' && mode !== 'none';
    const home = review && subs.length === 0;
    main.append(...(mode !== 'none' && HAS_BACK.has(def.id) ? [h('p', { class: 'crumb' }, h('a', { href: '#/review', id: 'back-home' }, '← GoReview'))] : []),
      ...(review ? [h('h1', { class: 'sr' }, def.title)] : [h('h1', {}, def.title)]), ...(home ? [h('div', { class: 'home-language', id: 'home-language' })] : []), body);
    placeLanguage();
    body.append(p('Loading your saved account data…', 'muted'));
    let idn: Awaited<ReturnType<AppContext['identity']>>;
    try { idn = await ctx.identity(); }
    catch {
      if (my === seq && !destroyed) {
        clear(body);
        append(body, [recovery('GoReview could not load your saved account data. Try again.', () => { renderDone = show(target, subs); })]);
      }
      return;
    }
    if (my !== seq) return;
    if (idn) main.setAttribute('data-language', idn.varietyId ?? idn.languageId); else main.removeAttribute('data-language');
    clear(body);
    const view: View = { alive: () => my === seq && !destroyed, onDispose: (fn) => { disposers.push(fn); } };
    try { await def.render(body, ctx, view, subs); } catch (e) {
      if (view.alive()) { clear(body); append(body, [p(`This screen could not be shown: ${e instanceof Error ? e.message : String(e)}`, 'error')]); }
    }
    if (!view.alive()) return;
    await safeRefreshHeader();
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
    // the launch screen (review build) fades once the first screen is there, whatever that screen is
    try { await show(first.id, first.params); } finally { dismissSplash(deps.doc, win); }
  })();

  return {
    ctx,
    current: () => route,
    go,
    ready: () => renderDone,
    destroy() {
      destroyed = true;
      win.removeEventListener('hashchange', onHash);
      win.removeEventListener('goreview:update-ready', onUpdateReady);
      win.removeEventListener('resume', onResume);
      win.removeEventListener('suspend', onSuspend);
      updateEl?.removeEventListener('click', onUpdateClick);
      live?.destroy();
      offSync();
      for (const d of disposers) { try { d(); } catch { /* */ } }
      disposers = [];
      ctx.destroy();
      clear(root);
    },
  };
}

/**
 * The application shell: a slim top bar (the brand, the page title, a link to Status and a cog wheel for Settings at the top right),
 * one hash router, one content area, and the “Done — back to reading” button at the foot of each screen. Setup is two pages: Sign in
 * (the first page on a first run; an account is optional) and Languages (download one or several). Everything else, the account
 * and the advanced screens, is under Settings. The same code runs as the extension’s options page and as the hosted web app; the
 * difference is only `deps` (see main.ts).
 */
import { append, button, clear, h, p } from './dom';
import { createContext, type AppContext } from './context';
import type { Deps } from './ports';
import * as diagnosticsScreen from './screens/diagnostics';
import * as homeScreen from './screens/home';
import * as languagesScreen from './screens/languages';
import * as legalScreen from './screens/legal';
import * as privacyScreen from './screens/privacy';
import * as readerScreen from './screens/reader';
import * as resetScreen from './screens/reset';
import * as settingsScreen from './screens/settings';
import * as shareScreen from './screens/share';
import * as signinScreen from './screens/signin';
import * as syncScreen from './screens/sync';
import * as verifyScreen from './screens/verify';
import type { View } from './screens/view';
import { computeCompletion, setupComplete, SETUP_IDS } from './completion';

export { computeCompletion, setupComplete, SETUP_IDS };
export type { Completion } from './completion';

export interface ScreenDef {
  id: string;
  title: string;
  group: 'status' | 'setup' | 'settings' | 'advanced';
  render(el: HTMLElement, ctx: AppContext, view: View): void | Promise<void>;
}

export const SCREENS: readonly ScreenDef[] = [
  // setup: an optional account first, then the languages (each downloads and installs its pack by itself)
  { id: 'signin', title: 'Sign in', group: 'setup', render: signinScreen.render },
  { id: 'languages', title: 'Choose your languages', group: 'setup', render: languagesScreen.render },
  // the cog: the account and the way to the advanced screens
  { id: 'settings', title: 'Settings', group: 'settings', render: settingsScreen.render },
  { id: 'sync', title: 'Sync', group: 'advanced', render: syncScreen.render },
  { id: 'privacy', title: 'Privacy', group: 'advanced', render: privacyScreen.render },
  { id: 'diagnostics', title: 'Diagnostics and updates', group: 'advanced', render: diagnosticsScreen.render },
  // the old reader-integration screen; the learner reaches it from the footer link on the languages page
  { id: 'reader', title: 'How GoLearn reads pages', group: 'advanced', render: readerScreen.render },
];
/** Links from before setup was two pages: all of them lead to the languages page. */
export const ALIASES: Readonly<Record<string, string>> = { welcome: 'languages', language: 'languages', pack: 'languages', account: 'languages', tutorial: 'languages', team: 'languages' };
export const HOME: ScreenDef = { id: 'home', title: 'Status', group: 'status', render: homeScreen.render };
/** Reached from the web share target, a deep link or the status page; not part of setup, so it has no place in the navigation. */
export const SHARE: ScreenDef = { id: 'share', title: 'Look up shared text', group: 'status', render: shareScreen.render };
/**
 * Pages reached from a link, not from the navigation: #/verify?token=… and #/reset?token=… (the links in the emails the service sends)
 * and #/terms (linked from sign-up and Settings). The Privacy Policy is on #/privacy.
 */
export const VERIFY: ScreenDef = { id: 'verify', title: 'Confirm your email', group: 'status', render: verifyScreen.render };
export const RESET: ScreenDef = { id: 'reset', title: 'Reset your password', group: 'status', render: resetScreen.render };
export const TERMS: ScreenDef = { id: 'terms', title: 'Terms of use', group: 'status', render: legalScreen.render };
const LINKED: readonly ScreenDef[] = [SHARE, VERIFY, RESET, TERMS];
export const ROUTE_IDS = [HOME.id, ...SCREENS.map((s) => s.id), ...LINKED.map((l) => l.id)];
const defOf = (id: string): ScreenDef | undefined => (id === HOME.id ? HOME : LINKED.find((l) => l.id === id) ?? SCREENS.find((x) => x.id === id));
const canonical = (id: string): string => ALIASES[id] ?? id;

export interface AppHandle {
  ctx: AppContext;
  /** The route currently shown. */
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

  // the slim top bar: brand · page title · Status · cog
  const titleEl = h('span', { class: 'page-title', id: 'page-title', 'aria-hidden': 'true' });
  const statusLink = h('a', { href: '#/home', id: 'status-link', class: 'top-link' }, 'Status');
  const cog = h('a', { href: '#/settings', id: 'settings-link', class: 'cog', 'aria-label': 'Settings', title: 'Settings' }, h('span', { 'aria-hidden': 'true' }, '⚙'));
  const bar = h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#/languages' }, 'GoLearn'), titleEl,
    h('nav', { class: 'top-actions', 'aria-label': 'GoLearn' }, statusLink, cog));
  const main = h('main', { id: 'screen', class: 'screen', tabindex: '-1' });
  const shell = h('div', { class: 'shell' }, bar, main);
  clear(root);
  root.append(shell);

  const ctx = createContext(deps, { go: (r) => { void go(r); }, changed: () => { paintBar(); } });

  const rawId = (): string => /^#\/?([a-z-]+)/.exec(win.location.hash)?.[1] ?? '';
  const parse = (): string => {
    const id = canonical(rawId());
    return ROUTE_IDS.includes(id) ? id : '';
  };

  /**
   * Where the application opens: the sign-in page on a first run (no language chosen and nobody signed in), the languages page after.
   * The sign-in page stays reachable from the cog.
   */
  async function defaultRoute(): Promise<string> {
    const [active, session] = await Promise.all([ctx.activeLanguage(), ctx.state.getSession()]);
    return active || session ? 'languages' : 'signin';
  }

  const titleOf = (id: string): string => defOf(id)?.title ?? '';

  function paintBar(): void {
    if (destroyed) return;
    titleEl.textContent = titleOf(route);
    const mark = (a: HTMLElement, on: boolean): void => { if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); };
    mark(statusLink, route === HOME.id);
    mark(cog, SCREENS.some((s) => (s.group === 'settings' || s.group === 'advanced') && s.id === route));
  }

  async function show(id: string): Promise<void> {
    const my = ++seq;
    for (const d of disposers) { try { d(); } catch { /* a screen’s cleanup must not stop the next screen */ } }
    disposers = [];
    route = id;
    const def = defOf(id)!;
    deps.doc.title = `GoLearn — ${def.title}`;
    paintBar();
    clear(main);
    const body = h('div', { class: 'body' });
    main.append(h('h1', {}, def.title), body);
    const view: View = { alive: () => my === seq && !destroyed, onDispose: (fn) => { disposers.push(fn); } };
    try {
      if (def.group === 'advanced') await ctx.state.markVisited(def.id);
      await def.render(body, ctx, view);
    } catch (e) {
      if (view.alive()) { clear(body); append(body, [p(`This screen could not be shown: ${e instanceof Error ? e.message : String(e)}`, 'error')]); }
    }
    if (!view.alive()) return;
    main.append(footer(def));
    try { main.focus({ preventScroll: true }); } catch { /* focus is a convenience */ }
  }

  /** No pager between screens: the foot of a screen holds the way back (where there is one) and the way back to reading. */
  function footer(def: ScreenDef): HTMLElement {
    if (def.id === SHARE.id) return h('footer', {}, h('div', { class: 'pager' }, h('a', { class: 'btn', href: '#/home' }, '← Status')));
    if (def.id === VERIFY.id || def.id === RESET.id) return h('footer', {}, h('div', { class: 'pager' }, h('a', { class: 'btn', href: '#/languages' }, '← Languages')));
    if (def.id === TERMS.id) return h('footer', {}, h('div', { class: 'pager' }, h('a', { class: 'btn', href: '#/settings' }, '← Settings')));
    const done = h('p', { class: 'finish-note', role: 'status', 'aria-live': 'polite' });
    const pager = h('div', { class: 'pager' });
    if (def.group === 'advanced') pager.append(h('a', { class: 'btn', href: '#/settings' }, '← Settings'));
    else if (def.id === HOME.id || def.group === 'settings') pager.append(h('a', { class: 'btn', href: '#/languages' }, '← Languages'));
    pager.append(button('Done — back to reading', () => {
      done.textContent = deps.closeWindow() ? '' : 'You can close this tab now and go back to your reading. GoLearn is switched on per tab from the toolbar button.';
    }, { class: 'btn primary', id: 'done-reading' }));
    return h('footer', {}, pager, done);
  }

  async function go(next: string): Promise<void> {
    const wanted0 = canonical(next);
    const target = ROUTE_IDS.includes(wanted0) ? wanted0 : await defaultRoute();
    const wanted = `#/${target}`;
    if (win.location.hash !== wanted) win.location.hash = wanted;
    if (route === target) return;
    renderDone = show(target);
    await renderDone;
  }

  const onHash = (): void => {
    const raw = rawId();
    const r = parse();
    // an old link (#/welcome, #/language, #/pack, #/account, #/tutorial) is rewritten to the screen that replaced it
    if (r && raw !== r && !win.location.hash.startsWith(`#/${r}?`)) { win.location.hash = `#/${r}`; return; }
    // a link from an email opened in the tab that is already on that page (#/verify?token=…) runs again with its token
    const again = (r === VERIFY.id || r === RESET.id) && win.location.hash.startsWith(`#/${r}?`);
    if (r && (r !== route || again)) { renderDone = show(r); }
  };
  win.addEventListener('hashchange', onHash);

  renderDone = (async () => {
    const initial = parse() || await defaultRoute();
    // a query after the route (#/share?text=…) is the share screen's to read: keep it
    const h = win.location.hash;
    if (h !== `#/${initial}` && !h.startsWith(`#/${initial}?`)) win.location.hash = `#/${initial}`;
    await show(initial);
  })();

  return {
    ctx,
    current: () => route,
    go,
    ready: () => renderDone,
    destroy() { destroyed = true; win.removeEventListener('hashchange', onHash); for (const d of disposers) { try { d(); } catch { /* */ } } disposers = []; ctx.destroy(); clear(root); },
  };
}

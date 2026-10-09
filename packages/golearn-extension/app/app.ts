/**
 * The application shell: a left list of screens with completion marks, one hash router, one content area, and the
 * “Done — back to reading” button at the end. The same code runs as the extension’s options page and as the hosted
 * web app; the difference is only `deps` (see main.ts).
 */
import { append, button, clear, h, p } from './dom';
import { createContext, type AppContext } from './context';
import type { Deps } from './ports';
import * as accountScreen from './screens/account';
import * as diagnosticsScreen from './screens/diagnostics';
import * as homeScreen from './screens/home';
import * as packScreen from './screens/pack';
import * as privacyScreen from './screens/privacy';
import * as readerScreen from './screens/reader';
import * as shareScreen from './screens/share';
import * as syncScreen from './screens/sync';
import * as teamScreen from './screens/team';
import * as tutorialScreen from './screens/tutorial';
import * as welcomeScreen from './screens/welcome';
import type { View } from './screens/view';
import { computeCompletion, setupComplete, SETUP_IDS } from './completion';

export { computeCompletion, setupComplete, SETUP_IDS };
export type { Completion } from './completion';

export interface ScreenDef {
  id: string;
  title: string;
  group: 'status' | 'setup' | 'settings';
  render(el: HTMLElement, ctx: AppContext, view: View): void | Promise<void>;
}

export const SCREENS: readonly ScreenDef[] = [
  { id: 'welcome', title: 'Welcome', group: 'setup', render: welcomeScreen.render },
  { id: 'account', title: 'Account', group: 'setup', render: accountScreen.render },
  { id: 'team', title: 'Team and language', group: 'setup', render: teamScreen.render },
  { id: 'pack', title: 'Language pack', group: 'setup', render: packScreen.render },
  { id: 'reader', title: 'Reader integration', group: 'setup', render: readerScreen.render },
  { id: 'tutorial', title: 'Orientation', group: 'setup', render: tutorialScreen.render },
  { id: 'sync', title: 'Sync', group: 'settings', render: syncScreen.render },
  { id: 'privacy', title: 'Privacy', group: 'settings', render: privacyScreen.render },
  { id: 'diagnostics', title: 'Diagnostics and updates', group: 'settings', render: diagnosticsScreen.render },
];
export const HOME: ScreenDef = { id: 'home', title: 'Status', group: 'status', render: homeScreen.render };
/** Reached from the web share target, a deep link or the status page; not part of setup, so it has no place in the navigation or the pager. */
export const SHARE: ScreenDef = { id: 'share', title: 'Look up shared text', group: 'status', render: shareScreen.render };
export const ROUTE_IDS = [HOME.id, ...SCREENS.map((s) => s.id), SHARE.id];

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

  const navList = h('ol', { class: 'steps' });
  const main = h('main', { id: 'screen', class: 'screen', tabindex: '-1' });
  const nav = h('nav', { class: 'rail', 'aria-label': 'GoLearn setup' }, h('p', { class: 'brand' }, 'GoLearn'), navList);
  const shell = h('div', { class: 'shell' }, nav, main);
  clear(root);
  root.append(shell);

  const ctx = createContext(deps, { go: (r) => { void go(r); }, changed: () => { void refreshNav(); } });

  const parse = (): string => {
    const m = /^#\/?([a-z-]+)/.exec(win.location.hash);
    return m && ROUTE_IDS.includes(m[1]) ? m[1] : '';
  };

  async function defaultRoute(): Promise<string> {
    const c = await computeCompletion(ctx);
    if (setupComplete(c)) return HOME.id;
    return SETUP_IDS.find((id) => !c[id]) ?? HOME.id;
  }

  async function refreshNav(): Promise<void> {
    if (destroyed) return;
    const c = await computeCompletion(ctx);
    if (destroyed) return;
    clear(navList);
    const item = (def: ScreenDef, mark: boolean | undefined): HTMLElement => {
      const a = h('a', { href: `#/${def.id}`, ...(def.id === route ? { 'aria-current': 'page' } : {}) },
        mark === undefined ? null : h('span', { class: mark ? 'mark done' : 'mark todo', 'aria-hidden': 'true' }, mark ? '✓' : '○'),
        h('span', { class: 'label' }, def.title),
        mark === undefined ? null : h('span', { class: 'sr' }, mark ? ' (done)' : ' (not yet)'));
      return h('li', { 'data-route': def.id }, a);
    };
    navList.append(item(HOME, undefined));
    navList.append(h('li', { class: 'group' }, 'Set up'));
    for (const s of SCREENS.filter((x) => x.group === 'setup')) navList.append(item(s, c[s.id]));
    navList.append(h('li', { class: 'group' }, 'Settings'));
    for (const s of SCREENS.filter((x) => x.group === 'settings')) navList.append(item(s, c[s.id]));
  }

  async function show(id: string): Promise<void> {
    const my = ++seq;
    for (const d of disposers) { try { d(); } catch { /* a screen’s cleanup must not stop the next screen */ } }
    disposers = [];
    route = id;
    const def = id === HOME.id ? HOME : id === SHARE.id ? SHARE : SCREENS.find((s) => s.id === id)!;
    deps.doc.title = `GoLearn — ${def.title}`;
    clear(main);
    const body = h('div', { class: 'body' });
    main.append(h('h1', {}, def.title), body);
    const view: View = { alive: () => my === seq && !destroyed, onDispose: (fn) => { disposers.push(fn); } };
    try {
      if (def.group === 'settings') await ctx.state.markVisited(def.id);
      if (def.id === 'welcome') await ctx.state.markVisited('welcome');
      await def.render(body, ctx, view);
    } catch (e) {
      if (view.alive()) { clear(body); append(body, [p(`This screen could not be shown: ${e instanceof Error ? e.message : String(e)}`, 'error')]); }
    }
    if (!view.alive()) return;
    main.append(pager(def));
    await refreshNav();
    try { main.focus({ preventScroll: true }); } catch { /* focus is a convenience */ }
  }

  function pager(def: ScreenDef): HTMLElement {
    if (def.id === SHARE.id) return h('footer', {}, h('div', { class: 'pager' }, h('a', { class: 'btn', href: '#/home' }, '← Status')));
    const order = [HOME, ...SCREENS];
    const i = order.findIndex((s) => s.id === def.id);
    const prev = i > 0 ? order[i - 1] : undefined;
    const next = def.id !== HOME.id && i < order.length - 1 ? order[i + 1] : undefined;
    const done = h('p', { class: 'finish-note', role: 'status', 'aria-live': 'polite' });
    const bar = h('div', { class: 'pager' });
    if (prev && prev.id !== HOME.id) bar.append(h('a', { class: 'btn', href: `#/${prev.id}` }, `← ${prev.title}`));
    if (next) bar.append(h('a', { class: 'btn primary', href: `#/${next.id}` }, `${next.title} →`));
    if (!next) {
      bar.append(button('Done — back to reading', () => {
        done.textContent = deps.closeWindow() ? '' : 'You can close this tab now and go back to your reading. GoLearn is switched on per tab from the toolbar button.';
      }, { class: 'btn primary', id: 'done-reading' }));
    }
    return h('footer', {}, bar, done);
  }

  async function go(next: string): Promise<void> {
    const target = ROUTE_IDS.includes(next) ? next : await defaultRoute();
    const wanted = `#/${target}`;
    if (win.location.hash !== wanted) win.location.hash = wanted;
    if (route === target) return;
    renderDone = show(target);
    await renderDone;
  }

  const onHash = (): void => {
    const r = parse();
    if (r && r !== route) { renderDone = show(r); }
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
    destroy() { destroyed = true; win.removeEventListener('hashchange', onHash); for (const d of disposers) { try { d(); } catch { /* */ } } disposers = []; clear(root); },
  };
}

/**
 * The application shell: a left list (Status, Welcome, and an Advanced group that starts collapsed), one hash router, one
 * content area, and the “Done — back to reading” button at the foot of each screen. Welcome is the whole of setup. The same
 * code runs as the extension’s options page and as the hosted web app; the difference is only `deps` (see main.ts).
 */
import { append, button, clear, h, p } from './dom';
import { createContext, type AppContext } from './context';
import type { Deps } from './ports';
import * as diagnosticsScreen from './screens/diagnostics';
import * as homeScreen from './screens/home';
import * as privacyScreen from './screens/privacy';
import * as readerScreen from './screens/reader';
import * as shareScreen from './screens/share';
import * as syncScreen from './screens/sync';
import * as welcomeScreen from './screens/welcome';
import type { View } from './screens/view';
import { computeCompletion, setupComplete, SETUP_IDS } from './completion';

export { computeCompletion, setupComplete, SETUP_IDS };
export type { Completion } from './completion';

export interface ScreenDef {
  id: string;
  title: string;
  group: 'status' | 'setup' | 'advanced';
  render(el: HTMLElement, ctx: AppContext, view: View): void | Promise<void>;
}

export const SCREENS: readonly ScreenDef[] = [
  // the whole of setup: choose a language (its pack installs by itself) and, if wanted, sign in
  { id: 'welcome', title: 'Welcome', group: 'setup', render: welcomeScreen.render },
  { id: 'sync', title: 'Sync', group: 'advanced', render: syncScreen.render },
  { id: 'privacy', title: 'Privacy', group: 'advanced', render: privacyScreen.render },
  { id: 'diagnostics', title: 'Diagnostics and updates', group: 'advanced', render: diagnosticsScreen.render },
  // the old reader-integration screen; the learner reaches it from the footer link on Welcome
  { id: 'reader', title: 'How GoLearn reads pages', group: 'advanced', render: readerScreen.render },
];
/** Links from before setup was one page: all of them lead to Welcome. */
export const ALIASES: Readonly<Record<string, string>> = { language: 'welcome', pack: 'welcome', account: 'welcome', tutorial: 'welcome', team: 'welcome' };
export const HOME: ScreenDef = { id: 'home', title: 'Status', group: 'status', render: homeScreen.render };
/** Reached from the web share target, a deep link or the status page; not part of setup, so it has no place in the navigation. */
export const SHARE: ScreenDef = { id: 'share', title: 'Look up shared text', group: 'status', render: shareScreen.render };
export const ROUTE_IDS = [HOME.id, ...SCREENS.map((s) => s.id), SHARE.id];
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
  /** The Advanced group starts collapsed; it opens when the learner opens it or when one of its screens is showing. */
  let advancedOpen = false;

  const navList = h('ol', { class: 'steps' });
  const main = h('main', { id: 'screen', class: 'screen', tabindex: '-1' });
  const nav = h('nav', { class: 'rail', 'aria-label': 'GoLearn' }, h('p', { class: 'brand' }, 'GoLearn'), navList);
  const shell = h('div', { class: 'shell' }, nav, main);
  clear(root);
  root.append(shell);

  const ctx = createContext(deps, { go: (r) => { void go(r); }, changed: () => { void refreshNav(); } });

  const rawId = (): string => /^#\/?([a-z-]+)/.exec(win.location.hash)?.[1] ?? '';
  const parse = (): string => {
    const id = canonical(rawId());
    return ROUTE_IDS.includes(id) ? id : '';
  };

  async function defaultRoute(): Promise<string> {
    const c = await computeCompletion(ctx);
    return setupComplete(c) ? HOME.id : 'welcome';
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
    // Welcome is the whole of setup: it is done once a language is chosen with its pack installed
    for (const s of SCREENS.filter((x) => x.group === 'setup')) navList.append(item(s, c[s.id]));
    const inAdvanced = SCREENS.some((x) => x.group === 'advanced' && x.id === route);
    const details = h('details', { class: 'advanced', id: 'advanced-nav', ...(advancedOpen || inAdvanced ? { open: true } : {}) },
      h('summary', {}, 'Advanced'),
      h('ol', { class: 'steps sub' }, ...SCREENS.filter((x) => x.group === 'advanced').map((s) => item(s, undefined))));
    details.addEventListener('toggle', () => { if (!inAdvanced) advancedOpen = (details as HTMLDetailsElement).open; });
    navList.append(h('li', { class: 'group-box' }, details));
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
      if (def.group === 'advanced') await ctx.state.markVisited(def.id);
      await def.render(body, ctx, view);
    } catch (e) {
      if (view.alive()) { clear(body); append(body, [p(`This screen could not be shown: ${e instanceof Error ? e.message : String(e)}`, 'error')]); }
    }
    if (!view.alive()) return;
    main.append(footer(def));
    await refreshNav();
    try { main.focus({ preventScroll: true }); } catch { /* focus is a convenience */ }
  }

  /** No pager between screens any more: the foot of a screen holds only the way back to reading. */
  function footer(def: ScreenDef): HTMLElement {
    if (def.id === SHARE.id) return h('footer', {}, h('div', { class: 'pager' }, h('a', { class: 'btn', href: '#/home' }, '← Status')));
    const done = h('p', { class: 'finish-note', role: 'status', 'aria-live': 'polite' });
    const bar = h('div', { class: 'pager' });
    if (def.id !== HOME.id && def.id !== 'welcome') bar.append(h('a', { class: 'btn', href: '#/welcome' }, '← Welcome'));
    bar.append(button('Done — back to reading', () => {
      done.textContent = deps.closeWindow() ? '' : 'You can close this tab now and go back to your reading. GoLearn is switched on per tab from the toolbar button.';
    }, { class: 'btn primary', id: 'done-reading' }));
    return h('footer', {}, bar, done);
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
    // an old link (#/language, #/pack, #/account, #/tutorial) is rewritten to the screen that replaced it
    if (r && raw !== r && !win.location.hash.startsWith(`#/${r}?`)) { win.location.hash = `#/${r}`; return; }
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
    destroy() { destroyed = true; win.removeEventListener('hashchange', onHash); for (const d of disposers) { try { d(); } catch { /* */ } } disposers = []; ctx.destroy(); clear(root); },
  };
}

/**
 * The application shell (redesigned 2026-11-11, docs/golearn/DESIGN-SYSTEM.md): a slim top bar with the brand and the TWO places a learner
 * goes, Languages (the home: what you read in, what else you can download) and Settings (the account and everything that is set once);
 * one hash router; one content area with ONE heading per page and, on a page under Settings, a way back above it; and the quiet
 * “Done — back to reading” bar at the foot. Setup is two pages: Sign in (the first page on a first run; an account is optional) and
 * Languages. The old Status page said again what Languages says and is gone (#/home leads to Languages). The same code runs as the
 * extension’s options page and as the hosted web app; the difference is only `deps` (see main.ts).
 */
import { append, button, clear, h, p } from './dom';
import { createContext, type AppContext } from './context';
import type { Deps } from './ports';
import * as audioScreen from './screens/audio';
import * as diagnosticsScreen from './screens/diagnostics';
import * as languagesScreen from './screens/languages';
import * as legalScreen from './screens/legal';
import * as helpScreen from './screens/help';
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
  { id: 'languages', title: 'Languages', group: 'setup', render: languagesScreen.render },
  // Settings: the account, then the pages under it (each leads back to Settings)
  { id: 'settings', title: 'Settings', group: 'settings', render: settingsScreen.render },
  { id: 'audio', title: 'Audio', group: 'advanced', render: audioScreen.render },
  { id: 'privacy', title: 'Privacy and data', group: 'advanced', render: privacyScreen.render },
  { id: 'sync', title: 'Sync', group: 'advanced', render: syncScreen.render },
  { id: 'diagnostics', title: 'Diagnostics and updates', group: 'advanced', render: diagnosticsScreen.render },
  // the reader-integration screen; also linked from the foot of the languages page
  { id: 'reader', title: 'How GoLearn reads pages', group: 'advanced', render: readerScreen.render },
];
/** Links from before setup was two pages: all of them lead to the languages page. */
export const ALIASES: Readonly<Record<string, string>> = { welcome: 'languages', language: 'languages', pack: 'languages', account: 'languages', tutorial: 'languages', team: 'languages', home: 'languages', status: 'languages' };
/** The home of the application: the Languages page. */
export const HOME_ID = 'languages';
/** Reached from the web share target, a deep link or Settings; not part of setup. */
export const SHARE: ScreenDef = { id: 'share', title: 'Look up pasted text', group: 'status', render: shareScreen.render };
/**
 * Pages reached from a link, not from the navigation: #/verify?token=… and #/reset?token=… (the links in the emails the service sends)
 * and #/terms (linked from sign-up and Settings). The Privacy Policy is on #/privacy.
 */
export const VERIFY: ScreenDef = { id: 'verify', title: 'Confirm your email', group: 'status', render: verifyScreen.render };
export const RESET: ScreenDef = { id: 'reset', title: 'Reset your password', group: 'status', render: resetScreen.render };
export const TERMS: ScreenDef = { id: 'terms', title: 'Terms of use', group: 'status', render: legalScreen.render };
export const HELP: ScreenDef = { id: 'help', title: 'Help', group: 'status', render: helpScreen.render };
const LINKED: readonly ScreenDef[] = [SHARE, VERIFY, RESET, TERMS, HELP];
export const ROUTE_IDS = [...SCREENS.map((s) => s.id), ...LINKED.map((l) => l.id)];
const defOf = (id: string): ScreenDef | undefined => LINKED.find((l) => l.id === id) ?? SCREENS.find((x) => x.id === id);
/** Where a page's way back leads, and what it is called; none for the two places of the top bar and the sign-in page. */
export function backOf(def: ScreenDef): { href: string; label: string } | undefined {
  if (def.group === 'advanced' || def.id === TERMS.id || def.id === SHARE.id) return { href: '#/settings', label: 'Settings' };
  if (def.id === VERIFY.id || def.id === RESET.id || def.id === HELP.id) return { href: '#/languages', label: 'Languages' };
  return undefined;
}
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

/**
 * The Go mark's image for the top bar: app/icons/go-logo.png (a copy of packages/shared-brand/go-logo.png, kept by scripts/sync-go-brand.ps1),
 * resolved against the page itself so the absolute URL holds wherever the stylesheet lives (the web build bundles it under assets/).
 * Never import.meta.url: the extension's options page is one classic script, where that is undefined and the constructor throws
 * (2026-10-28: the setup page opened blank from the toolbar).
 */
export function brandMarkUrl(doc: Document): string {
  const rel = 'icons/go-logo.png';
  try { return new URL(rel, doc.baseURI || undefined).href; } catch { return `./${rel}`; }
}

export function createApp(root: HTMLElement, deps: Deps): AppHandle {
  const win = deps.win;
  let seq = 0;
  let route = '';
  let renderDone: Promise<void> = Promise.resolve();
  let disposers: Array<() => void> = [];
  let destroyed = false;

  // the slim top bar: the brand, then the two places, named in words (an icon alone would have to be guessed)
  const languagesLink = h('a', { href: '#/languages', id: 'languages-link', class: 'top-link' }, 'Languages');
  const settingsLink = h('a', { href: '#/settings', id: 'settings-link', class: 'top-link' }, 'Settings');
  const bar = h('header', { class: 'topbar' },
    // the Go mark (the G and the globe, packages/shared-brand) as a silhouette filled with the accent colour, beside the name
    h('a', { class: 'brand go-brand', href: '#/languages', 'aria-label': 'GoLearn home' },
      h('span', { class: 'go-brand-mark', 'aria-hidden': 'true', style: `--go-brand-mask: url("${brandMarkUrl(deps.doc)}")` }), h('span', {}, 'GoLearn')),
    h('nav', { class: 'top-actions', 'aria-label': 'GoLearn' }, languagesLink, settingsLink));
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

  function paintBar(): void {
    if (destroyed) return;
    const mark = (a: HTMLElement, on: boolean): void => { if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); };
    const def = defOf(route);
    mark(languagesLink, route === HOME_ID);
    // Settings and every page whose way back is Settings
    mark(settingsLink, !!def && (def.group === 'settings' || backOf(def)?.href === '#/settings'));
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
    main.setAttribute('data-route', id);
    const body = h('div', { class: 'body' });
    // a page under Settings (or reached from a link) says where it belongs, above its heading: the way back is where the eye starts
    const back = backOf(def);
    if (back) main.append(h('nav', { class: 'crumb', 'aria-label': 'Back' }, h('a', { href: back.href, id: 'back-link', 'aria-label': `Back to ${back.label}` }, h('span', { 'aria-hidden': 'true' }, '‹ '), back.label)));
    main.append(h('h1', { id: 'page-title' }, def.title), body);
    const view: View = { alive: () => my === seq && !destroyed, onDispose: (fn) => { disposers.push(fn); } };
    try {
      if (def.group === 'advanced') await ctx.state.markVisited(def.id);
      await def.render(body, ctx, view);
    } catch (e) {
      if (view.alive()) { clear(body); append(body, [p(`This screen could not be shown: ${e instanceof Error ? e.message : String(e)}`, 'error')]); }
    }
    if (!view.alive()) return;
    const foot = footer(def);
    if (foot) main.append(foot);
    try { main.focus({ preventScroll: true }); } catch { /* focus is a convenience */ }
  }

  /**
   * The foot of a screen: the way back to reading, a bar across the screen with its words centred (the owner, 2026-10-28). It is the quiet
   * kind of button: a page's own action (Continue, Download) is the one filled button on it. A page reached from an email link
   * (confirm, reset) or holding a text to read (the terms) has no bar; its way back is above its heading.
   */
  function footer(def: ScreenDef): HTMLElement | null {
    if (def.id === VERIFY.id || def.id === RESET.id || def.id === TERMS.id) return null;
    const done = h('p', { class: 'finish-note', role: 'status', 'aria-live': 'polite' });
    const pager = h('div', { class: 'pager' });
    pager.append(button('Done — back to reading', () => {
      done.textContent = deps.closeWindow() ? '' : 'You can close this tab now and go back to your reading.';
    }, { class: 'btn bar', id: 'done-reading' }));
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

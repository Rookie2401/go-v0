/**
 * The action popup (the owner's cut of 2026-10-28): a greeting ("Welcome, <name>" when the account carries a name), the brand as the one way
 * to the setup page (GOLEARN →, `chrome.runtime.openOptionsPage()`), the ONE switch "GoLearn Active" (underlines the words on the pages the
 * learner reads and opens a word's card on a selection; switching on asks the browser for the page access inside the learner's click,
 * switching off withdraws it), one line about the page in front, the one-line legend Biblia's reader shows, and the language switch.
 * Nothing else: no Practise button, no sync line or button (the worker syncs by itself: after every event, every minute, when the
 * connection returns), no voices line, no explanations. Housekeeping (export, deletion, the speech backend) lives in the setup page.
 * Everything about the connection comes from the background as text: this page never holds a token.
 */
import { ACTIVE_LEVELS, LEVEL_LEGEND, type ActiveLevel } from '../src/active/levels';
import { MSG, getChrome, type ChromeApi } from '../src/platform';
import { ACTIVE_ORIGINS, languageNameOf, type ActiveReply, type ActiveSettings, type PageStatus } from '../src/protocol';
import type { ActiveState } from '../src/content/active';

export interface PopupHandle { refresh(): Promise<void> }

/** What the content script answers to a ping while Active runs on its page. */
interface PingReply { ok: boolean; active?: boolean; activeState?: ActiveState }

/** The levels that carry a mark on the page, in the legend's order; known and automatic words carry none. */
const MARKED_LEVELS: readonly ActiveLevel[] = ['new', 'seen', 'recognized', 'familiar'];

export async function initPopup(doc: Document, chrome: ChromeApi): Promise<PopupHandle> {
  const $ = <T extends HTMLElement>(id: string): T => doc.getElementById(id) as T;
  const errorEl = $('error');

  let tabId: number | undefined;
  try { tabId = (await chrome.tabs?.query({ active: true, currentWindow: true }))?.[0]?.id; } catch { tabId = undefined; }

  async function status(): Promise<PageStatus | undefined> {
    try {
      const s = (await chrome.runtime.sendMessage({ type: MSG.status })) as PageStatus | undefined;
      return s && s.ok === true ? s : undefined;
    } catch { return undefined; }
  }

  /**
   * The language switch (2026-10-25): the chosen languages (downloaded in GoLearn setup) as a select, the one GoLearn reads in selected;
   * a change asks the background to make it the active one on the device and on the account, and every Active page starts again in it.
   */
  const langSelect = $<HTMLSelectElement>('language-select');
  const langLine = $('language');
  function renderLanguages(s: PageStatus): void {
    const chosen = s.chosenLanguages?.length ? s.chosenLanguages : [s.languageId];
    const list = chosen.includes(s.languageId) ? chosen : [s.languageId, ...chosen];
    langSelect.replaceChildren(...list.map((l) => {
      const o = doc.createElement('option');
      o.value = l;
      o.textContent = languageNameOf(l);
      if (l === s.languageId) o.selected = true;
      return o;
    }));
    langSelect.value = s.languageId;
    langSelect.disabled = list.length < 2;
    langLine.classList.remove('warn');
    // one language only: say why, truthfully. With the account unreadable (its service cannot be reached, nothing kept from before) the
    // account's languages are simply not known here yet; that is not "others are added in GoLearn setup" (2026-10-27)
    const accountUnread = s.connected && s.accountLanguagesFresh === false;
    langLine.textContent = list.length < 2
      ? accountUnread
        ? `${s.languageName} is the only language on this device; the languages of your account will be listed once the service can be reached.`
        : `${s.languageName} is the only language downloaded here; others are added in GoLearn setup.${s.packAvailable ? '' : ' No pack yet.'}`
      : `${s.languageName}${s.packAvailable ? '' : ' (no pack yet)'}`;
    if (accountUnread) langLine.classList.add('warn');
  }
  langSelect.addEventListener('change', async () => {
    const languageId = langSelect.value;
    if (!languageId) return;
    langSelect.disabled = true;
    langLine.textContent = `Switching to ${languageNameOf(languageId)}…`;
    let r: { ok?: boolean; message?: string; where?: string } | undefined;
    try { r = (await chrome.runtime.sendMessage({ type: MSG.useLanguage, languageId })) as typeof r; } catch { r = undefined; }
    if (!r || r.ok !== true) {
      langLine.textContent = r?.message ?? 'GoLearn could not switch the language.';
      langLine.classList.add('warn');
    }
    await refresh();
  });

  /** The greeting and, only when something needs the learner, one line under the brand. */
  function renderStatus(s: PageStatus | undefined): void {
    const welcome = $('welcome');
    const conn = $('connection');
    conn.classList.remove('warn');
    if (!s) {
      welcome.textContent = 'Welcome';
      conn.textContent = 'The background worker did not answer. Reload the extension.';
      conn.classList.add('warn');
      return;
    }
    renderLanguages(s);
    const name = typeof s.displayName === 'string' ? s.displayName.trim() : '';
    welcome.textContent = s.connected && name ? `Welcome, ${name}` : 'Welcome';
    if (!s.connected) { conn.textContent = 'Not signed in: your progress stays on this device.'; return; }
    if (s.needsSignIn) { conn.textContent = 'Your sign-in is no longer accepted. Sign in again in GoLearn setup.'; conn.classList.add('warn'); return; }
    // the worker syncs by itself; the one thing worth a line is a service it cannot reach (nothing is lost: the events wait on this device)
    if (s.sync.lastError) { conn.textContent = 'GoLearn cannot reach its service right now; it keeps trying by itself and nothing is lost.'; conn.classList.add('warn'); return; }
    conn.textContent = '';
  }

  // ── GoLearn Active: the one switch, what it found on this page, and the one-line legend ──
  const activeToggle = $<HTMLInputElement>('active');
  const activeStatus = $('active-status');
  const pageLine = $('active-page');
  const legend = $('active-legend');
  legend.replaceChildren('How well you know each word: ');
  MARKED_LEVELS.forEach((level, i) => {
    const item = doc.createElement('span');
    item.className = 'legend-item';
    const sample = doc.createElement('span');
    sample.className = `sw sw-${level}`;
    sample.setAttribute('aria-hidden', 'true');
    sample.textContent = 'Aa';
    item.append(sample, ` ${LEVEL_LEGEND[level].title}`);
    legend.append(item, i < MARKED_LEVELS.length - 1 ? ' · ' : '; known words carry no mark.');
  });
  const isActiveReply = (v: unknown): v is ActiveReply => !!v && typeof v === 'object' && typeof (v as { ok?: unknown }).ok === 'boolean' && typeof (v as { settings?: unknown }).settings === 'object';
  async function activeCall(op: 'get' | 'set', patch?: Partial<ActiveSettings>): Promise<ActiveReply | undefined> {
    try { const r = await chrome.runtime.sendMessage({ type: MSG.active, op, ...(patch ? { patch } : {}) }); return isActiveReply(r) ? r : undefined; } catch { return undefined; }
  }
  function showActive(r: ActiveReply | undefined): void {
    activeStatus.classList.remove('warn');
    if (!r) { activeToggle.disabled = true; activeStatus.textContent = 'The background worker did not answer about Active.'; return; }
    activeToggle.disabled = false;
    activeToggle.checked = r.settings.active;
    if (!r.ok && r.message) { activeStatus.textContent = r.message; activeStatus.classList.add('warn'); return; }
    if (r.settings.active && r.registered) activeStatus.textContent = 'On.';
    else if (r.settings.active) { activeStatus.textContent = 'On, but GoLearn is not ready to scan pages; switch it off and on again.'; activeStatus.classList.add('warn'); }
    else activeStatus.textContent = 'Off.';
  }
  /** One line about the page in front: its words, how many carry a mark (per level), how many are known; or why nothing was read. */
  async function showPage(on: boolean): Promise<void> {
    if (!on || tabId === undefined) { pageLine.textContent = ''; return; }
    let ping: PingReply | undefined;
    try { ping = (await chrome.tabs?.sendMessage(tabId, { type: MSG.ping })) as PingReply | undefined; } catch { ping = undefined; }
    if (!ping || !ping.ok) { pageLine.textContent = 'This page: GoLearn is not running here yet. Reload the page. Browser settings pages and extension stores cannot be read.'; return; }
    const s = ping.activeState;
    if (!ping.active || !s) { pageLine.textContent = 'This page: GoLearn is here but Active has not started on it. Reload the page.'; return; }
    if (s.reason) { pageLine.textContent = `This page: ${s.reason}`; return; }
    const marked = MARKED_LEVELS.reduce((n, k) => n + (s.marked[k] ?? 0), 0);
    const known = (ACTIVE_LEVELS.filter((l) => !MARKED_LEVELS.includes(l))).reduce((n, k) => n + (s.marked[k] ?? 0), 0);
    const parts = MARKED_LEVELS.filter((l) => s.marked[l]).map((l) => `${LEVEL_LEGEND[l].title.toLowerCase()} ${s.marked[l]}`).join(', ');
    const lang = s.languageId ? languageNameOf(s.languageId) : 'language unknown';
    pageLine.textContent = `This page (${lang}): ${s.scanned} words; ${marked} underlined${parts ? ` (${parts})` : ''}; ${known} known.`;
  }
  activeToggle.addEventListener('change', async () => {
    activeToggle.disabled = true;
    if (activeToggle.checked) {
      // the browser's own prompt, inside this click; a "no" keeps everything as it was
      let granted = false;
      try { granted = (await chrome.permissions?.request({ origins: [...ACTIVE_ORIGINS] })) === true; } catch { granted = false; }
      if (!granted) { activeToggle.checked = false; activeToggle.disabled = false; activeStatus.textContent = 'Site access was not allowed, so Active stays off.'; activeStatus.classList.add('warn'); return; }
      const r = await activeCall('set', { active: true });
      showActive(r);
      await showPage(!!r?.settings.active);
    } else {
      // off = off: the page access the learner granted is withdrawn too, so nothing can read a page until they switch on again
      try { await chrome.permissions?.remove({ origins: [...ACTIVE_ORIGINS] }); } catch { /* the reply below says what the browser still allows */ }
      showActive(await activeCall('set', { active: false }));
      await showPage(false);
    }
  });

  $('open-setup').addEventListener('click', () => {
    try { void chrome.runtime.openOptionsPage?.(); } catch { errorEl.textContent = 'GoLearn could not open the setup page.'; }
  });

  async function refresh(): Promise<void> {
    const s = await status();
    renderStatus(s);
    const a = await activeCall('get');
    showActive(a);
    await showPage(!!a?.settings.active);
  }

  await refresh();
  return { refresh };
}

if (typeof document !== 'undefined' && document.getElementById('golearn-popup') && getChrome()) {
  void initPopup(document, getChrome()!);
}

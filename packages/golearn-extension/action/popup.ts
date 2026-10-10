/**
 * The action popup: connection status (connected as <email> / not connected -> "Open GoLearn setup"; an account is optional and
 * the extension works without one), the "Practise" link to GoPractice (the extension's own page, no account needed), the ONE
 * switch "GoLearn Active" (reads each page before the learner, underlines the words met, opens a word's card on a click, speaks it
 * when a voice exists; switching on asks the browser for the page access inside the learner's click, switching off withdraws it),
 * what Active found on the page in front, the language of the enrolment and the sync status. Nothing here needs a learner's hand
 * for housekeeping: export and deletion are in the setup page under Privacy. Everything about the connection comes from the
 * background as text: this page never holds a token.
 */
import { ACTIVE_LEVELS, LEVEL_LEGEND, type ActiveLevel } from '../src/active/levels';
import { MSG, getChrome, type ChromeApi } from '../src/platform';
import { ACTIVE_ORIGINS, type ActiveReply, type ActiveSettings, type PageStatus } from '../src/protocol';
import type { ActiveState } from '../src/content/active';

export interface PopupHandle { refresh(): Promise<void> }

const ago = (t: number | undefined, now = Date.now()): string => {
  if (t === undefined) return 'never';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86_400)} d ago`;
};

/** What the content script answers to a ping while Active runs on its page. */
interface PingReply { ok: boolean; active?: boolean; activeState?: ActiveState }

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

  function renderStatus(s: PageStatus | undefined): void {
    const conn = $('connection');
    const setup = $<HTMLButtonElement>('open-setup');
    const syncLine = $('sync');
    const detail = $('sync-detail');
    const syncBtn = $<HTMLButtonElement>('sync-now');
    conn.classList.remove('warn');
    if (!s) {
      conn.textContent = 'The background worker did not answer. Reload the extension.';
      conn.classList.add('warn');
      syncLine.textContent = ''; detail.textContent = ''; syncBtn.disabled = true;
      return;
    }
    $('language').textContent = `${s.languageName} (${s.languageId})${s.packAvailable ? '' : ' - no pack yet'}`;
    if (s.connected) {
      conn.textContent = s.needsSignIn ? `Signed in as ${s.email ?? 'your account'}, but the service no longer accepts the sign-in.` : `Connected as ${s.email ?? 'your account'}`;
      if (s.needsSignIn) conn.classList.add('warn');
      setup.textContent = s.needsSignIn ? 'Sign in again' : s.hasEnrolment ? 'Open GoLearn setup' : 'Finish setup (choose a language)';
    } else {
      conn.textContent = 'Not connected. Your lookups are kept on this device.';
      setup.textContent = 'Open GoLearn setup';
    }
    const y = s.sync;
    syncBtn.disabled = !s.connected || s.needsSignIn;
    if (!s.connected) { syncLine.textContent = y.localOnly ? `${y.localOnly} event${y.localOnly === 1 ? '' : 's'} waiting for an account` : 'Nothing to sync.'; syncLine.classList.remove('warn'); detail.textContent = ''; return; }
    syncLine.textContent = `Sync: ${y.pending} pending · last sync ${ago(y.lastPushAt)}${y.online ? '' : ' · offline'}${y.rejected ? ` · ${y.rejected} refused by the service` : ''}`;
    syncLine.classList.toggle('warn', !!y.lastError);
    detail.textContent = y.lastError ?? '';
  }

  // ── GoLearn Active: the one switch, what it found on this page, and the legend ──
  const activeToggle = $<HTMLInputElement>('active');
  const activeStatus = $('active-status');
  const pageLine = $('active-page');
  const legend = $('active-legend');
  for (const level of ACTIVE_LEVELS) {
    const li = doc.createElement('li');
    const sample = doc.createElement('span');
    sample.className = `sw sw-${level}`;
    sample.textContent = LEVEL_LEGEND[level].title;
    li.append(sample, `: ${LEVEL_LEGEND[level].detail} (${LEVEL_LEGEND[level].style})`);
    legend.append(li);
  }
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
    if (r.settings.active && r.registered) activeStatus.textContent = `On. Every page you open is read on this device and the words you have met are underlined (${r.excluded} refusing readers excluded). A page that was already open gets it when you reload it.`;
    else if (r.settings.active) { activeStatus.textContent = 'On, but GoLearn is not registered for pages; switch it off and on again.'; activeStatus.classList.add('warn'); }
    else activeStatus.textContent = 'Off. Nothing is read before you select a word.';
  }
  /** What Active did on the page in front: words read, words underlined per level, or why it read nothing. */
  async function showPage(on: boolean): Promise<void> {
    if (!on || tabId === undefined) { pageLine.textContent = ''; return; }
    let ping: PingReply | undefined;
    try { ping = (await chrome.tabs?.sendMessage(tabId, { type: MSG.ping })) as PingReply | undefined; } catch { ping = undefined; }
    if (!ping || !ping.ok) { pageLine.textContent = 'This page: GoLearn is not running here yet. Reload the page (Brave\'s own pages and the store cannot be read).'; return; }
    const s = ping.activeState;
    if (!ping.active || !s) { pageLine.textContent = 'This page: GoLearn is here but Active has not started on it. Reload the page.'; return; }
    if (s.reason) { pageLine.textContent = `This page: ${s.reason}`; return; }
    const marked = (Object.keys(s.marked) as ActiveLevel[]).reduce((n, k) => n + s.marked[k], 0);
    const parts = ACTIVE_LEVELS.filter((l) => s.marked[l]).map((l) => `${LEVEL_LEGEND[l].title.toLowerCase()} ${s.marked[l]}`).join(', ');
    pageLine.textContent = `This page (${s.languageId ?? 'language unknown'}): ${s.scanned} words read, ${marked} underlined${parts ? ` (${parts})` : ''}${s.clicks ? `; ${s.clicks} click${s.clicks === 1 ? '' : 's'} looked up` : ''}.`;
  }
  activeToggle.addEventListener('change', async () => {
    activeToggle.disabled = true;
    if (activeToggle.checked) {
      // the browser's own prompt, inside this click; a "no" keeps everything as it was
      let granted = false;
      try { granted = (await chrome.permissions?.request({ origins: [...ACTIVE_ORIGINS] })) === true; } catch { granted = false; }
      if (!granted) { activeToggle.checked = false; activeToggle.disabled = false; activeStatus.textContent = 'Brave did not allow GoLearn to read pages, so Active stays off.'; activeStatus.classList.add('warn'); return; }
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

  // GoPractice is a page of this extension (the build writes it to practice/); it needs no account
  $('practise').addEventListener('click', () => {
    const api = chrome as unknown as { runtime: { getURL?(path: string): string }; tabs?: { create?(p: { url: string }): Promise<unknown> } };
    const url = api.runtime.getURL?.('practice/index.html');
    if (!url) { errorEl.textContent = 'GoLearn could not find the practice page.'; return; }
    try {
      if (api.tabs?.create) void api.tabs.create({ url }); else window.open(url, '_blank', 'noopener');
    } catch { errorEl.textContent = 'GoLearn could not open the practice page.'; }
  });

  $('sync-now').addEventListener('click', async () => {
    const btn = $<HTMLButtonElement>('sync-now');
    btn.disabled = true;
    try { await chrome.runtime.sendMessage({ type: MSG.syncNow }); } catch { /* the status below says what happened */ }
    await refresh();
  });

  async function refresh(): Promise<void> {
    renderStatus(await status());
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

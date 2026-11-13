/**
 * The action popup (the owner's cut of 2026-10-28): a greeting ("Welcome, <name>" when the account carries a name), the brand as the one way
 * to the setup page (GOLEARN →, `chrome.runtime.openOptionsPage()`), the ONE switch "GoLearn Active" (underlines the words on the pages the
 * learner reads and opens a word's card on a selection; switching on asks the browser for the page access inside the learner's click,
 * switching off withdraws it), one line about the page in front, the one-line legend Biblia's reader shows, and the language switch.
 * Nothing else: no Practise button, no sync line or button (the worker syncs by itself: after every event, every minute, when the
 * connection returns), no voices line, no explanations. Housekeeping (export, deletion, the speech backend) lives in the setup page.
 * Everything about the connection comes from the background as text: this page never holds a token.
 *
 * Presentation (2026-11-11, docs/golearn/DESIGN-SYSTEM.md): a line that only repeats what the control beside it shows ("On.", "Off.", the
 * language already in the select) is kept for assistive technology and hidden from sight (.sr); the line about the page says how many
 * words are marked and keeps the counts per level behind "Word counts", which opens on a press. Anything that needs the learner is shown, in the warning colour.
 */
import { ACTIVE_LEVELS, LEVEL_LEGEND, type ActiveLevel } from '../src/active/levels';
import { MSG, getChrome, type ChromeApi } from '../src/platform';
import { ACTIVE_ORIGINS, languageNameOf, type ActiveReply, type ActiveSettings, type PageStatus } from '../src/protocol';
import { READING_ANALYSIS, type ReadingAnalysisReply } from '../src/reading/protocol';
import { TEXT_VARIETIES } from '../src/reading/varieties';
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
    renderTextVarieties();
    langLine.classList.remove('warn', 'sr');
    // one language only: say why, truthfully. With the account unreadable (its service cannot be reached, nothing kept from before) the
    // account's languages are simply not known here yet; that is not "others are added in GoLearn setup" (2026-10-27)
    const accountUnread = s.connected && s.accountLanguagesFresh === false;
    langLine.textContent = list.length < 2
      ? accountUnread
        ? `${s.languageName} is the only language on this device; the languages of your account will be listed once the service can be reached.`
        : `${s.languageName} is the only language downloaded here; others are added in GoLearn setup.${s.packAvailable ? '' : ' No pack yet.'}`
      : `${s.languageName}${s.packAvailable ? '' : ' (no pack yet)'}`;
    if (accountUnread) langLine.classList.add('warn');
    // the select already names the language: the line is seen only when it has more to say (one language only, no pack yet, a warning)
    if (list.length >= 2 && s.packAvailable) langLine.classList.add('sr');
  }
  langSelect.addEventListener('change', async () => {
    const languageId = langSelect.value;
    if (!languageId) return;
    langSelect.disabled = true;
    langLine.classList.remove('sr');
    langLine.textContent = `Switching to ${languageNameOf(languageId)}…`;
    let r: { ok?: boolean; message?: string; where?: string } | undefined;
    try { r = (await chrome.runtime.sendMessage({ type: MSG.useLanguage, languageId })) as typeof r; } catch { r = undefined; }
    if (!r || r.ok !== true) {
      langLine.textContent = r?.message ?? 'GoLearn could not switch the language.';
      langLine.classList.add('warn');
    }
    await refresh();
  });

  const analysisButton = doc.getElementById('analyze-page') as HTMLButtonElement | null;
  const analysisOutput = doc.getElementById('reading-result');
  const varietyBox = doc.getElementById('reading-variety');
  const varietySelect = doc.getElementById('reading-variety-select') as HTMLSelectElement | null;
  function renderTextVarieties(): void {
    if (!varietyBox || !varietySelect) return;
    const list = TEXT_VARIETIES[langSelect.value] ?? [];
    varietyBox.hidden = list.length === 0;
    const prev = varietySelect.value;
    varietySelect.replaceChildren();
    const empty = doc.createElement('option');
    empty.value = '';
    empty.textContent = 'Choose text variety…';
    varietySelect.append(empty);
    for (const v of list) {
      const option = doc.createElement('option');
      option.value = v.id;
      option.textContent = v.label;
      varietySelect.append(option);
    }
    varietySelect.value = list.some((v) => v.id === prev) ? prev : '';
  }
  langSelect.addEventListener('change', renderTextVarieties);
  renderTextVarieties();
  let analysisRequest: string | undefined;
  function invalidateAnalysis(): void {
    if (analysisRequest && tabId !== undefined) {
      void chrome.tabs?.sendMessage(tabId, { type: READING_ANALYSIS, requestId: analysisRequest, cancel: true }, { frameId: 0 }).catch(() => {});
    }
    analysisRequest = undefined;
    if (analysisButton) analysisButton.textContent = 'Analyze this page';
    analysisOutput?.replaceChildren();
  }
  langSelect.addEventListener('change', invalidateAnalysis);
  varietySelect?.addEventListener('change', invalidateAnalysis);
  if (analysisButton && analysisOutput) {
    const setResult = (message: string) => { analysisOutput.textContent = message; };
    const appendLine = (message: string, strong = false) => {
      const line = doc.createElement('p');
      const label = strong ? doc.createElement('strong') : line;
      label.textContent = message;
      if (strong) line.append(label);
      analysisOutput.append(line);
    };
    analysisButton.addEventListener('click', async () => {
      if (analysisRequest) {
        invalidateAnalysis();
        setResult('Analysis canceled.');
        return;
      }
      const requestId = crypto.randomUUID();
      analysisRequest = requestId;
      analysisButton.textContent = 'Cancel analysis';
      setResult('Analyzing this page…');
      const message = { type: READING_ANALYSIS, requestId, languageId: langSelect.value || undefined,
        ...(varietySelect?.value && !varietyBox?.hidden ? { varietyId: varietySelect.value } : {}) };
      const send = (id: number, payload: unknown) => chrome.tabs?.sendMessage(id, payload, { frameId: 0 });
      try {
        const tab = (await chrome.tabs?.query({ active: true, currentWindow: true }))?.[0];
        if (analysisRequest !== requestId) return;
        if (tab?.id === undefined || !tab.url || !/^https?:\/\//i.test(tab.url)) {
          setResult('Reading Analysis is unavailable on this page.');
          return;
        }
        const id = tab.id;
        tabId = id;
        let ready = false;
        try { ready = (await send(id, { type: MSG.ping }) as PingReply | undefined)?.ok === true; } catch { /* One-shot access below. */ }
        if (analysisRequest !== requestId) return;
        if (!ready) {
          try {
            if (!chrome.scripting) throw new Error('Scripting unavailable');
            await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content.js'] });
          } catch {
            if (analysisRequest === requestId) setResult('GoLearn could not access the text on this page.');
            return;
          }
        }
        if (analysisRequest !== requestId) return;
        const reply = await send(id, message) as ReadingAnalysisReply | undefined;
        if (analysisRequest !== requestId) return;
        const currentTab = (await chrome.tabs?.query({ active: true, currentWindow: true }))?.[0];
        if (analysisRequest !== requestId) return;
        if (currentTab?.id !== id || currentTab.url !== tab.url) {
          setResult('The page changed. Analyze it again.');
          return;
        }
        if (!reply?.ok) {
          const errors: Record<string, string> = {
            'no-text': 'No readable text was found on this page.',
            'page-changed': 'The text changed while being analyzed. Analyze this page again.',
            'unsupported-page': 'This reader does not permit Reading Analysis.',
            'variety-required': 'Choose a text variety to avoid mixing vocabulary from different periods.',
            'unsupported-language': 'This language cannot be classified reliably yet.',
            unavailable: 'Your vocabulary could not be loaded. Try again.',
            canceled: 'Analysis canceled.',
          };
          setResult(errors[reply?.code ?? ''] ?? 'GoLearn could not analyze this page. Try again.');
          return;
        }
        const result = reply.coverage;
        if (result.familiarCoverage === null || result.confidentCoverage === null) {
          setResult('No eligible words were found for this language.');
          return;
        }
        analysisOutput.replaceChildren();
        appendLine(`${Math.round(result.familiarCoverage)}% ${result.varietyId ? 'verified familiar' : 'familiar'}`, true);
        appendLine(`${Math.round(result.confidentCoverage)}% ${result.varietyId ? 'verified confidently known' : 'confidently known'}`);
        const meter = doc.createElement('div');
        meter.className = 'reading-meter';
        meter.setAttribute('aria-hidden', 'true');
        for (const share of [result.confidentCoverage, result.familiarCoverage - result.confidentCoverage]) {
          const segment = doc.createElement('span');
          segment.style.width = `${share}%`;
          meter.append(segment);
        }
        analysisOutput.append(meter);
        const scope = result.sourceScope === 'primary' ? 'main content' : 'page text';
        appendLine(`${result.totalOccurrences.toLocaleString()} words analyzed · ${scope} · ${languageNameOf(result.languageId)}${result.varietyId ? ' · ' + result.varietyId : ''}`);
        if (reply.truncated) appendLine('This result covers part of the page.');
        if (result.occurrences.unresolved) appendLine(`${result.occurrences.unresolved.toLocaleString()} words could not be resolved.`);
        if (result.occurrences.legacyShared) appendLine(`${result.occurrences.legacyShared.toLocaleString()} words have older, language-wide records. Not credited until their variety can be verified.`);
        if (result.varietyId) appendLine('Period-specific coverage: older shared records are not treated as known.');
        appendLine(result.freshness === 'cached' || result.freshness === 'stale'
          ? 'Using on-device vocabulary (it may not be fully synced).'
          : 'Using vocabulary stored on this device.');
      } catch {
        if (analysisRequest === requestId) setResult('GoLearn could not analyze this page. Try again.');
      } finally {
        if (analysisRequest === requestId) {
          analysisRequest = undefined;
          analysisButton.textContent = 'Analyze again';
        }
      }
    });
    doc.defaultView?.addEventListener('pagehide', invalidateAnalysis);
  }

  /** The foot line: the build the worker runs, and for 10 minutes after a self-reload that it updated itself (plain text, no control). */
  function renderBuild(s: PageStatus | undefined): void {
    const el = doc.getElementById('build');
    if (!el) return;
    const at = (iso: string | undefined): string => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? new Date(t).toLocaleString() : ''; };
    if (!s?.build?.id) { el.textContent = ''; return; }
    el.textContent = s.updatedAt && at(s.updatedAt)
      ? `Updated to build ${s.build.id} at ${at(s.updatedAt)}`
      : `Build ${s.build.id}${at(s.build.builtAt) ? ` · ${at(s.build.builtAt)}` : ''}`;
  }

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
  const pageDetail = $('active-detail');
  const pageCounts = $('active-counts');
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
    activeStatus.classList.remove('warn', 'sr');
    if (!r) { activeToggle.disabled = true; activeStatus.textContent = 'The background worker did not answer about Active.'; return; }
    activeToggle.disabled = false;
    activeToggle.checked = r.settings.active;
    if (!r.ok && r.message) { activeStatus.textContent = r.message; activeStatus.classList.add('warn'); return; }
    // plain On and Off are the switch's own to show: the words stay for a screen reader only
    if (r.settings.active && r.registered) { activeStatus.textContent = 'On.'; activeStatus.classList.add('sr'); }
    else if (r.settings.active) { activeStatus.textContent = 'On, but GoLearn is not ready to scan pages; switch it off and on again.'; activeStatus.classList.add('warn'); }
    else if (r.settings.offBy === 'browser') {
      // the browser withdrew GoLearn's site access (its extension menu, an update or a reload of the extension): say so, never a bare "Off"
      const when = r.settings.offAt && Number.isFinite(Date.parse(r.settings.offAt)) ? ` on ${new Date(r.settings.offAt).toLocaleString()}` : '';
      activeStatus.textContent = `Off: the browser withdrew GoLearn's access to web pages${when}, so Active stopped. It comes back by itself when the browser allows access again; or switch it on here.`;
      activeStatus.classList.add('warn');
    } else { activeStatus.textContent = 'Off.'; activeStatus.classList.add('sr'); }
  }
  /** One line about the page in front: how many of its words carry a mark (the counts per level open under it, on request); or why nothing was read. */
  async function showPage(on: boolean): Promise<void> {
    const say = await pageText(on);
    pageLine.textContent = say.line;
    pageCounts.textContent = say.counts ?? '';
    pageDetail.hidden = !say.counts;
  }
  async function pageText(on: boolean): Promise<{ line: string; counts?: string }> {
    if (!on || tabId === undefined) return { line: '' };
    let ping: PingReply | undefined;
    try { ping = (await chrome.tabs?.sendMessage(tabId, { type: MSG.ping })) as PingReply | undefined; } catch { ping = undefined; }
    if (!ping || !ping.ok) return { line: 'This page: GoLearn is not running here yet. Reload the page. Browser settings pages and extension stores cannot be read.' };
    const s = ping.activeState;
    if (!ping.active || !s) return { line: 'This page: GoLearn is here but Active has not started on it. Reload the page.' };
    if (s.reason) return { line: `This page: ${s.reason}` };
    const marked = MARKED_LEVELS.reduce((n, k) => n + (s.marked[k] ?? 0), 0);
    const known = (ACTIVE_LEVELS.filter((l) => !MARKED_LEVELS.includes(l))).reduce((n, k) => n + (s.marked[k] ?? 0), 0);
    const parts = MARKED_LEVELS.filter((l) => s.marked[l]).map((l) => `${LEVEL_LEGEND[l].title.toLowerCase()} ${s.marked[l]}`).join(', ');
    // every language of the learner's found on the page, the one with the most words first (2026-11-09)
    const lang = s.languages?.length ? s.languages.map((l) => languageNameOf(l)).join(', ') : s.languageId ? languageNameOf(s.languageId) : 'none of your languages';
    return {
      line: marked ? `This page (${lang}): ${marked} ${marked === 1 ? 'word' : 'words'} marked.` : `This page (${lang}): no words to mark.`,
      counts: `${s.scanned} words read${parts ? `: ${parts}` : ''}; ${known} known.`,
    };
  }
  activeToggle.addEventListener('change', async () => {
    activeToggle.disabled = true;
    if (activeToggle.checked) {
      // the browser's own prompt, inside this click; a "no" keeps everything as it was
      let granted = false;
      try { granted = (await chrome.permissions?.request({ origins: [...ACTIVE_ORIGINS] })) === true; } catch { granted = false; }
      if (!granted) { activeToggle.checked = false; activeToggle.disabled = false; activeStatus.textContent = 'Site access was not allowed, so Active stays off.'; activeStatus.classList.remove('sr'); activeStatus.classList.add('warn'); return; }
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

  /**
   * The switch is read FIRST and on its own (2026-10-31): the status waits on the service for up to a few seconds, and while it did the
   * switch was drawn unticked and enabled, which looked as if Active had switched itself off (and a click there acted on a state nobody
   * had read). Until the worker answers, the switch stays disabled with "Checking…" (popup.html).
   */
  async function refresh(): Promise<void> {
    const switchShown = activeCall('get').then(async (a) => { showActive(a); await showPage(!!a?.settings.active); });
    const statusShown = status().then((s) => { renderStatus(s); renderBuild(s); });
    await Promise.all([switchShown, statusShown]);
  }

  await refresh();
  return { refresh };
}

if (typeof document !== 'undefined' && document.getElementById('golearn-popup') && getChrome()) {
  void initPopup(document, getChrome()!);
}

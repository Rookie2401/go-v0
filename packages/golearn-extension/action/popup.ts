/**
 * The action popup: the per-tab on/off switch, the language (Albanian only), the encounter counter, and the export
 * buttons. Opening the popup is the user gesture that grants activeTab; the background worker injects the content
 * script when the switch is turned on.
 */
import { createStorageMetricsStore, exportMetrics } from '../src/metrics';
import { MSG, getChrome, type ChromeApi, type TabState } from '../src/platform';
import { createStorageEncounterStore } from '../src/store';

export interface PopupHandle { refresh(): Promise<void> }

export async function initPopup(doc: Document, chrome: ChromeApi): Promise<PopupHandle> {
  const $ = <T extends HTMLElement>(id: string): T => doc.getElementById(id) as T;
  const toggle = $<HTMLInputElement>('enabled');
  const errorEl = $('error');
  const countEl = $('count');
  const out = $<HTMLTextAreaElement>('output');
  const events = createStorageEncounterStore(chrome.storage.local);
  const metrics = createStorageMetricsStore(chrome.storage.local);

  let tabId: number | undefined;
  try { tabId = (await chrome.tabs?.query({ active: true, currentWindow: true }))?.[0]?.id; } catch { tabId = undefined; }

  const show = (state: TabState | undefined) => {
    toggle.checked = !!state?.enabled;
    errorEl.textContent = state?.error ?? '';
  };

  async function refresh(): Promise<void> {
    countEl.textContent = String(await events.count().catch(() => 0));
    if (tabId === undefined) { toggle.disabled = true; errorEl.textContent = 'No active tab.'; return; }
    try { show((await chrome.runtime.sendMessage({ type: MSG.getState, tabId })) as TabState | undefined); } catch { show(undefined); }
  }

  toggle.addEventListener('change', async () => {
    if (tabId === undefined) return;
    toggle.disabled = true;
    try { show((await chrome.runtime.sendMessage({ type: MSG.setEnabled, tabId, enabled: toggle.checked })) as TabState | undefined); }
    catch { toggle.checked = false; errorEl.textContent = 'GoLearn could not change this tab.'; }
    toggle.disabled = false;
  });

  const print = (text: string) => { out.hidden = false; out.value = text; out.focus(); out.select(); };
  $('export-events').addEventListener('click', async () => print(await events.exportRows()));
  $('export-metrics').addEventListener('click', async () => print(await exportMetrics(metrics)));
  const del = $<HTMLButtonElement>('delete-all');
  let armed = false;
  del.addEventListener('click', async () => {
    if (!armed) { armed = true; del.textContent = 'Click again to delete'; return; }
    armed = false; del.textContent = 'Delete all rows';
    await events.clear(); await metrics.clear();
    out.hidden = true; out.value = '';
    await refresh();
  });

  await refresh();
  return { refresh };
}

if (typeof document !== 'undefined' && document.getElementById('golearn-popup') && getChrome()) {
  void initPopup(document, getChrome()!);
}

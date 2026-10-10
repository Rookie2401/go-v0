/**
 * 9. Diagnostics and updates: versions, service health, counts, a copyable report (no token, no email, no text of
 * anything read), and the comparison of installed versions with the available ones. There are no automatic updates.
 */
import { CONTRACT_VERSION } from '../../../repository-contract/src';
import type { AppContext } from '../context';
import { append, button, clear, h, p, setStatus, shortDate, statusLine } from '../dom';
import { createStorageEncounterStore } from '../../src/store';
import { dictionaryCard } from '../packInstall';
import type { View } from './view';

export interface PackUpdate { packId: string; name: string; installed?: string; available: string; state: 'not-installed' | 'current' | 'update-available' | 'planned' | 'unverified' }

export function comparePacks(ctx: AppContext, records: Record<string, { version: string; ok: boolean }>): PackUpdate[] {
  return ctx.deps.packs.packs().map((pk): PackUpdate => {
    const rec = records[pk.packId];
    const base = { packId: pk.packId, name: pk.name, installed: rec?.version, available: pk.version };
    if (pk.status !== 'installable') return { ...base, state: 'planned' };
    if (!rec) return { ...base, state: 'not-installed' };
    if (rec.version !== pk.version) return { ...base, state: 'update-available' };
    return { ...base, state: rec.ok ? 'current' : 'unverified' };
  });
}

const STATE_TEXT: Record<PackUpdate['state'], string> = {
  'not-installed': 'not installed',
  current: 'up to date',
  'update-available': 'update available',
  planned: 'planned, not installable',
  unverified: 'installed but did not verify',
};

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const { deps } = ctx;
  const [progress, session, profile, active, rows, baseUrl, settings] = await Promise.all([
    ctx.state.getProgress(), ctx.state.getSession(), ctx.state.getProfile(), ctx.activeLanguage(),
    createStorageEncounterStore(deps.area).count().catch(() => 0), ctx.serviceUrl(), ctx.state.getSettings(),
  ]);
  if (!view.alive()) return;
  const extVersion = deps.chrome ? (deps.chrome.runtime.getManifest?.().version ?? 'unknown') : undefined;
  const updates = comparePacks(ctx, progress.packs);
  const dictService = await ctx.state.getService();

  const health = h('p', { id: 'health' }, 'Checking the service…');
  const lines: string[] = [];
  const report = h('textarea', { id: 'report', readonly: true, rows: '14', 'aria-label': 'Diagnostic report' }) as HTMLTextAreaElement;
  const updatesBox = h('div', { id: 'updates' });
  const copyStatus = statusLine();

  let healthLine = 'service: not checked';
  let serviceUpdate = 'service version: not checked';
  function rebuild(): void {
    lines.length = 0;
    lines.push(
      `GoLearn diagnostics, ${deps.now().toISOString()}`,
      `application: ${deps.appVersion} (${deps.chrome ? 'extension options page' : 'web app'})`,
      `extension: ${extVersion ? `installed, version ${extVersion}` : 'not running as an extension'}`,
      `repository contract: version ${CONTRACT_VERSION}`,
      `service address: ${baseUrl}`,
      healthLine,
      `signed in: ${session ? 'yes' : 'no'}`,
      `active language: ${active?.languageId || 'none'}`,
      `progress kept: ${session ? 'synced to an account' : 'on this device only'}`,
      `enrolments cached: ${profile ? profile.enrolments.length : 'not loaded'}`,
      `local rows on this device: ${rows}`,
      `explanation depth: ${settings.explanationDepth ?? 'automatic'}`,
      'packs:',
      ...updates.map((u) => `  ${u.packId}: installed ${u.installed ?? 'none'}, available ${u.available}, ${STATE_TEXT[u.state]}`),
      serviceUpdate,
      'automatic updates: none in this build',
    );
    report.value = lines.join('\n');
  }

  async function checkHealth(): Promise<void> {
    setStatus(health, 'Checking the service…');
    try {
      const { api } = await ctx.api();
      const r = await api.health();
      if (!view.alive()) return;
      if (r.ok) {
        healthLine = `service: ${r.data.service} answered ok, version ${r.data.version}`;
        setStatus(health, `Service reachable at ${baseUrl}: ${r.data.service}, version ${r.data.version}.`, 'ok');
        // the service's own version number and the contract version it speaks are different things: compare like with like
        const spoken = r.data.contractVersion;
        serviceUpdate = spoken === undefined
          ? `service version: ${r.data.version}; it did not report which contract version it speaks (this app speaks ${CONTRACT_VERSION})`
          : spoken === CONTRACT_VERSION
            ? `service version: ${r.data.version}, speaking contract version ${spoken}, the version this app speaks`
            : `service version: ${r.data.version}, speaking contract version ${spoken}, but this app speaks ${CONTRACT_VERSION}: ${spoken > CONTRACT_VERSION ? 'update the extension and this app' : 'the service is older than this app'}`;
      } else {
        healthLine = `service: answered ${r.status}`;
        serviceUpdate = 'service version: unknown';
        setStatus(health, `The service answered ${r.status}${r.message ? `: ${r.message}` : ''}.`, 'error');
      }
    } catch {
      healthLine = 'service: not reachable';
      serviceUpdate = 'service version: unknown (not reachable)';
      setStatus(health, `The service at ${baseUrl} could not be reached.`, 'error');
    }
    if (!view.alive()) return;
    paintUpdates();
    rebuild();
  }

  function paintUpdates(): void {
    clear(updatesBox);
    append(updatesBox, [
      h('table', { class: 'plain' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Pack'), h('th', {}, 'Installed'), h('th', {}, 'Available'), h('th', {}, 'State'))),
        h('tbody', {}, ...updates.map((u) => h('tr', { 'data-pack': u.packId, 'data-state': u.state }, h('th', { scope: 'row' }, u.name), h('td', {}, u.installed ?? '—'), h('td', {}, u.available), h('td', {}, STATE_TEXT[u.state]))))),
      p(serviceUpdate.charAt(0).toUpperCase() + serviceUpdate.slice(1) + '.', 'muted'),
      p('There are no automatic updates in this build. A newer pack is installed by pressing Reinstall under its language on the Welcome page; a newer extension is installed the way the first one was.', 'notice'),
    ]);
  }

  append(el, [
    h('section', { class: 'card' }, h('h2', {}, 'Versions'),
      h('dl', { class: 'facts', id: 'versions' },
        h('dt', {}, 'Extension'), h('dd', { id: 'v-ext' }, extVersion ? `installed, version ${extVersion}` : 'not running as an extension'),
        h('dt', {}, 'This application'), h('dd', { id: 'v-app' }, deps.appVersion),
        h('dt', {}, 'Repository contract'), h('dd', { id: 'v-contract' }, String(CONTRACT_VERSION)),
        h('dt', {}, 'Language packs'), h('dd', { id: 'v-packs' }, updates.map((u) => `${u.name} ${u.available}${u.installed ? ` (installed ${u.installed})` : ''}`).join('; ') || 'none'))),
    h('section', { class: 'card' }, h('h2', {}, 'Service'), health,
      h('div', { class: 'row' }, button('Check again', () => { void checkHealth(); }, { id: 'health-again' }))),
    h('section', { class: 'card' }, h('h2', {}, 'Counts'),
      h('dl', { class: 'facts', id: 'counts' },
        h('dt', {}, 'Rows stored on this device'), h('dd', {}, String(rows)),
        h('dt', {}, 'Enrolments (cached)'), h('dd', {}, profile ? String(profile.enrolments.length) : 'not loaded'),
        h('dt', {}, 'Packs installed here'), h('dd', {}, String(Object.keys(progress.packs).length)),
        h('dt', {}, 'Last profile refresh'), h('dd', {}, shortDate(profile?.fetchedAt)))),
    h('section', { class: 'card', id: 'updates-card' }, h('h2', {}, 'Updates'), updatesBox),
    dictionaryCard(ctx, dictService?.assetBase),
    h('section', { class: 'card' }, h('h2', {}, 'Report'),
      p('Copy this when you ask for help. It contains versions and counts only: no password, no token, no email and nothing you read.', 'muted'),
      report,
      h('div', { class: 'row' }, button('Copy report', async () => {
        const ok = await deps.copyText(report.value);
        if (!ok) { report.focus(); report.select(); }
        setStatus(copyStatus, ok ? 'Copied.' : 'Copying was not allowed here; the text is selected, press Ctrl+C.', ok ? 'ok' : 'info');
      }, { id: 'copy-report' })), copyStatus),
  ]);
  paintUpdates();
  rebuild();
  void checkHealth();
}

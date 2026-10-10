/**
 * 4. Language pack: install, verification results (dictionary manifest, sample shard, every validation case), version,
 * licences and the CC BY-SA attribution; re-verify. A planned pack says “planned, not installable” and why.
 */
import type { AppContext } from '../context';
import { validateServiceUrl } from '../config';
import { append, button, clear, field, h, p, setStatus, shortDate, statusLine } from '../dom';
import { recordPackInstalled } from '../packEvent';
import type { PackView, VerifyView } from '../ports';
import type { View } from './view';

export function assetBase(ctx: AppContext): string {
  const base = ctx.deps.config.assetBaseUrl ?? './';
  try { return new URL(base, ctx.deps.doc.baseURI || ctx.deps.win.location.href).href; } catch { return base; }
}

/** Where the installer fetches the dictionary from: the learner’s dictionary address when set, else this application’s own files. */
export async function installBase(ctx: AppContext): Promise<string> {
  return (await ctx.state.getService())?.assetBase ?? assetBase(ctx);
}

function dictionaryCard(ctx: AppContext, current: string | undefined): HTMLElement {
  const input = h('input', { type: 'url', id: 'asset-base', name: 'asset-base', autocomplete: 'off', spellcheck: 'false', value: current ?? '' }) as HTMLInputElement;
  const status = statusLine();
  const own = assetBase(ctx);
  const useOwn = validateServiceUrl(own).ok;
  return h('section', { class: 'card', 'aria-labelledby': 'dict-h' },
    h('h2', { id: 'dict-h' }, 'Dictionary address'),
    p('The extension’s card fetches dictionary meanings from this address (a folder that holds dict/<language>/…). It must be https, or http on localhost. Leave it empty to use this application’s own files for the install check; the card then has no dictionary meanings until an address is set.'),
    field('Dictionary files', input),
    h('div', { class: 'row' },
      button('Save', async () => {
        const raw = input.value.trim();
        const r = await ctx.saveService(await ctx.serviceUrl(), raw === '' ? null : raw);
        if (!r.ok) { setStatus(status, r.message, 'error'); return; }
        setStatus(status, raw ? 'Dictionary address saved.' : 'Dictionary address cleared.', 'ok');
      }, { id: 'asset-save' }),
      useOwn ? button('Use this application’s files', () => { input.value = own; }, { id: 'asset-own' }) : null),
    status);
}

export function renderChecks(result: VerifyView): HTMLElement {
  const failed = result.checks.filter((c) => !c.ok).length;
  const box = h('div', { class: 'verify', 'data-ok': String(result.ok) });
  box.append(h('p', { class: result.ok ? 'ok' : 'error', role: 'status' },
    result.ok ? `Verified: all ${result.checks.length} checks passed.` : `Not verified: ${failed} of ${result.checks.length} checks failed.${result.message ? ' ' + result.message : ''}`));
  if (result.checks.length) {
    const list = h('ul', { class: 'checks' });
    for (const c of result.checks) {
      list.append(h('li', { 'data-check': c.id, 'data-ok': String(c.ok) },
        h('span', { class: c.ok ? 'mark done' : 'mark fail', 'aria-hidden': 'true' }, c.ok ? '✓' : '✗'),
        h('span', { class: 'sr' }, c.ok ? 'pass ' : 'fail '),
        c.label, c.detail ? h('span', { class: 'muted' }, ` — ${c.detail}`) : null));
    }
    box.append(list);
  }
  return box;
}

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const { packs } = ctx.deps;
  const [choice, progress] = await Promise.all([ctx.activeLanguage(), ctx.state.getProgress()]);
  if (!view.alive()) return;
  const active = choice?.languageId ? packs.packFor(choice.languageId) : undefined;
  append(el, [
    p('A language pack is the versioned bundle GoLearn reads a language with: its analyser, word list, dictionary and pronunciation notes. It is installed on this device and checked against its own validation cases.'),
    active ? p(`Your active language is ${active.name}.`, 'muted') : h('p', { class: 'muted' }, h('a', { href: '#/language' }, 'Choose your language'), ' first, or look at what exists below.'),
  ]);
  el.append(dictionaryCard(ctx, (await ctx.state.getService())?.assetBase));
  const all = packs.packs();
  const ordered = [...all].sort((a, b) => Number(b === active) - Number(a === active) || Number(b.status === 'installable') - Number(a.status === 'installable') || a.name.localeCompare(b.name));
  for (const pack of ordered) el.append(packCard(pack, ctx, progress.packs[pack.packId], pack === active, view));
}

function packCard(pack: PackView, ctx: AppContext, record: { version: string; ok: boolean; verifiedAt: string } | undefined, isActive: boolean, view: View): HTMLElement {
  const card = h('section', { class: 'card pack', 'data-pack': pack.packId, 'data-status': pack.status, 'data-level': pack.level, 'aria-labelledby': `h-${pack.languageId}` });
  const installable = pack.status === 'installable';
  card.append(
    h('h2', { id: `h-${pack.languageId}` }, `${pack.name}`, pack.nativeName && pack.nativeName !== pack.name ? h('span', { class: 'native', lang: pack.languageId }, ` ${pack.nativeName}`) : null),
    h('p', { class: 'muted' }, `${pack.packId} · version ${pack.version} · ${pack.levelLabel} · review status: ${pack.reviewStatus}${isActive ? ' · your active language' : ''}`),
  );

  const results = h('div', { class: 'results' });
  const status = statusLine();
  const progress = h('progress', { max: '1', value: '0', hidden: true, 'aria-label': 'Installing' }) as HTMLProgressElement;

  if (!installable) {
    card.append(p('Planned, not installable. Nothing of this pack can be installed or used yet.', 'notice'));
  } else {
    card.append(h('p', { class: 'installed', id: `installed-${pack.languageId}` }, record
      ? `Installed here: version ${record.version}, ${record.ok ? 'verified' : 'verification failed'} on ${shortDate(record.verifiedAt)}.`
      : 'Not installed on this device.'));
    const finish = async (r: VerifyView, verb: string): Promise<void> => {
      await ctx.state.recordPack(pack.packId, { version: r.version ?? pack.version, ok: r.ok, verifiedAt: ctx.deps.now().toISOString() });
      if (!view.alive()) return;
      clear(results);
      results.append(renderChecks(r));
      setStatus(status, r.ok ? `${verb} ${pack.name} ${r.version ?? pack.version}.` : `${pack.name} ${verb.toLowerCase()} did not pass verification.`, r.ok ? 'ok' : 'error');
      const line = card.querySelector('.installed');
      if (line) line.textContent = `Installed here: version ${r.version ?? pack.version}, ${r.ok ? 'verified' : 'verification failed'} on ${shortDate(ctx.deps.now().toISOString())}.`;
      ctx.changed();
    };
    const install = button(record ? 'Reinstall' : 'Install', async () => {
      install.disabled = true; verify.disabled = true;
      progress.hidden = false; progress.value = 0;
      setStatus(status, 'Installing…', 'info');
      try {
        const r = await ctx.deps.packs.install(pack, {
          fetch: ctx.deps.fetch, baseUrl: await installBase(ctx), storage: ctx.deps.area,
          onProgress: (done, total, label) => { progress.value = total > 0 ? Math.min(1, done / total) : 0; if (label) status.textContent = `Installing… ${label}`; },
        });
        // the install completed (the pack is on this device, even when a validation case did not match): record it with its level and validation
        if (r.version !== undefined) await recordPackInstalled(ctx, pack, !r.ok);
        await finish(r, 'Installed');
      } catch (e) {
        setStatus(status, `The install did not complete: ${e instanceof Error ? e.message : String(e)}`, 'error');
      } finally {
        progress.hidden = true; install.disabled = false; verify.disabled = false;
      }
    }, { class: 'btn primary', 'data-action': 'install', 'aria-label': `${record ? 'Reinstall' : 'Install'} ${pack.name}` });
    const verify = button('Re-verify', async () => {
      verify.disabled = true;
      setStatus(status, 'Checking…', 'info');
      try { await finish(await ctx.deps.packs.verify(pack, ctx.deps.area), 'Verified'); }
      catch (e) { setStatus(status, `The check did not complete: ${e instanceof Error ? e.message : String(e)}`, 'error'); }
      finally { verify.disabled = false; }
    }, { 'data-action': 'verify', 'aria-label': `Re-verify ${pack.name}` });
    card.append(h('div', { class: 'row' }, install, verify), progress, status, results);
  }

  // licences and attribution are shown for every pack, installed or not
  const lic = h('div', { class: 'licences' }, h('h3', {}, 'Licences and attribution'));
  if (pack.attribution.length) lic.append(h('ul', { class: 'attribution' }, ...pack.attribution.map((a) => h('li', {}, a))));
  if (pack.licences.length) lic.append(h('ul', {}, ...pack.licences.map((l) => h('li', {}, h('strong', {}, l.resource), ` — ${l.licence}`, l.notice ? h('span', { class: 'muted' }, ` (${l.notice})`) : null))));
  else lic.append(p('This pack states no licence information.', 'muted'));
  card.append(lic);
  if (pack.provenance.length) card.append(h('details', {}, h('summary', {}, 'Where it comes from and what has not been checked'), h('ul', {}, ...pack.provenance.map((x) => h('li', {}, x)))));
  return card;
}


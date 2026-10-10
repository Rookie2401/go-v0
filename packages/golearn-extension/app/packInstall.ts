/**
 * Installing a language pack, shared by the Welcome screen (which installs the pack of the language the learner just chose)
 * and Diagnostics (which holds the dictionary address). The install, its verification and its record are one operation here:
 * the installer's result, the learner's progress record (`golearn:pack:installed:<packId>`) and the `PackInstalled` event.
 */
import type { AppContext } from './context';
import { validateServiceUrl } from './config';
import { button, field, h, p, setStatus, statusLine } from './dom';
import { recordPackInstalled } from './packEvent';
import type { PackView, VerifyView } from './ports';

export function assetBase(ctx: AppContext): string {
  const base = ctx.deps.config.assetBaseUrl ?? './';
  try { return new URL(base, ctx.deps.doc.baseURI || ctx.deps.win.location.href).href; } catch { return base; }
}

/** Where the installer fetches the dictionary from: the learner’s dictionary address when set, else this application’s own files. */
export async function installBase(ctx: AppContext): Promise<string> {
  return (await ctx.state.getService())?.assetBase ?? assetBase(ctx);
}

/** Install `pack`, record the result and return the verification. Throws when the install could not run at all. */
export async function installAndRecord(ctx: AppContext, pack: PackView, onProgress?: (fraction: number, label: string | undefined) => void): Promise<VerifyView> {
  const r = await ctx.deps.packs.install(pack, {
    fetch: ctx.deps.fetch, baseUrl: await installBase(ctx), storage: ctx.deps.area,
    onProgress: (done, total, label) => onProgress?.(total > 0 ? Math.min(1, done / total) : 0, label),
  });
  // the install completed (the pack is on this device, even when a validation case did not match): record it with its level and validation
  if (r.version !== undefined) await recordPackInstalled(ctx, pack, !r.ok);
  await recordVerified(ctx, pack, r);
  return r;
}

/** Re-check an installed pack and record the outcome. */
export async function verifyAndRecord(ctx: AppContext, pack: PackView): Promise<VerifyView> {
  const r = await ctx.deps.packs.verify(pack, ctx.deps.area);
  await recordVerified(ctx, pack, r);
  return r;
}

async function recordVerified(ctx: AppContext, pack: PackView, r: VerifyView): Promise<void> {
  await ctx.state.recordPack(pack.packId, { version: r.version ?? pack.version, ok: r.ok, verifiedAt: ctx.deps.now().toISOString() });
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

/** The dictionary address (an advanced setting): where the extension’s card fetches dictionary meanings from. */
export function dictionaryCard(ctx: AppContext, current: string | undefined): HTMLElement {
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

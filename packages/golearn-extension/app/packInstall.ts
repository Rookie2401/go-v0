/**
 * Installing a language pack, shared by the languages page (which installs the pack of the language the learner just downloaded)
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

/** Where a language’s dictionary is read from: the learner’s dictionary address, this extension’s (or application’s) own files, or the hosted copy named in config.json. */
export type DictionarySource = 'configured' | 'extension' | 'hosted';
export interface DictionaryLocation { source: DictionarySource; base: string; ok: boolean }
export interface DictionaryResolution { chosen?: DictionaryLocation; checked: DictionaryLocation[] }
export type InstallResult = VerifyView & { dictionarySource?: DictionarySource };

export function sourceLabel(ctx: AppContext, source: DictionarySource): string {
  return source === 'configured' ? 'your dictionary address' : source === 'extension' ? (ctx.deps.chrome ? 'this extension’s own files' : 'this application’s own files') : 'the hosted copy';
}

/** The directory of the pack’s dictionary relative to a location ('dict/sq'), or undefined when the pack declares no dictionary. */
function dictionaryDir(pack: PackView): string | undefined {
  const lexical = (pack.manifest as { lexical?: { dictionary?: { baseUrl?: string } } } | undefined)?.lexical;
  if (!lexical) return `dict/${pack.languageId}`; // a manifest this code cannot read: the standard place
  const rel = lexical.dictionary?.baseUrl?.replace(/^\/+|\/+$/g, '');
  return rel || undefined;
}

async function answers(ctx: AppContext, base: string, dir: string): Promise<boolean> {
  try {
    const r = await ctx.deps.fetch(`${base.replace(/\/+$/, '')}/${dir}/manifest.json`, { cache: 'no-store' });
    return !!r && r.ok;
  } catch { return false; }
}

/** The candidates in order: the learner’s dictionary address, this application’s own folder, the hosted copy (config.json `dictionaryFallbackUrl`). */
async function candidatesFor(ctx: AppContext): Promise<Array<{ source: DictionarySource; base: string }>> {
  const out: Array<{ source: DictionarySource; base: string }> = [];
  const add = (source: DictionarySource, base: string | undefined): void => {
    if (!base) return;
    const norm = base.replace(/\/+$/, '');
    if (!out.some((c) => c.base.replace(/\/+$/, '') === norm)) out.push({ source, base });
  };
  add('configured', (await ctx.state.getService())?.assetBase);
  add('extension', assetBase(ctx));
  add('hosted', ctx.deps.config.dictionaryFallbackUrl);
  return out;
}

/** Which location serves this pack’s dictionary: the first candidate whose `dict/<language>/manifest.json` answers. `all` checks every candidate (Diagnostics). */
export async function resolveDictionary(ctx: AppContext, pack: PackView, all = false): Promise<DictionaryResolution | undefined> {
  const dir = dictionaryDir(pack);
  if (!dir) return undefined;
  const checked: DictionaryLocation[] = [];
  let chosen: DictionaryLocation | undefined;
  for (const c of await candidatesFor(ctx)) {
    if (chosen && !all) break;
    const loc = { ...c, ok: await answers(ctx, c.base, dir) };
    checked.push(loc);
    if (loc.ok && !chosen) chosen = loc;
  }
  return { ...(chosen ? { chosen } : {}), checked };
}

/** Install `pack`, record the result and return the verification. Throws when the install could not run at all. */
export async function installAndRecord(ctx: AppContext, pack: PackView, onProgress?: (fraction: number, label: string | undefined) => void): Promise<InstallResult> {
  // the dictionary is read from the first location that has it; when none answers the install runs against today’s base and says why it failed
  const found = await resolveDictionary(ctx, pack);
  const r = await ctx.deps.packs.install(pack, {
    fetch: ctx.deps.fetch, baseUrl: found?.chosen?.base ?? await installBase(ctx), storage: ctx.deps.area,
    onProgress: (done, total, label) => onProgress?.(total > 0 ? Math.min(1, done / total) : 0, label),
  });
  // the install completed (the pack is on this device, even when a validation case did not match): record it with its level and validation
  if (r.version !== undefined) await recordPackInstalled(ctx, pack, !r.ok);
  await recordVerified(ctx, pack, r);
  return found?.chosen ? { ...r, dictionarySource: found.chosen.source } : r;
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
export function dictionaryCard(ctx: AppContext, current: string | undefined, locations?: HTMLElement): HTMLElement {
  const input = h('input', { type: 'url', id: 'asset-base', name: 'asset-base', autocomplete: 'off', spellcheck: 'false', value: current ?? '' }) as HTMLInputElement;
  const status = statusLine();
  const own = assetBase(ctx);
  const useOwn = validateServiceUrl(own).ok;
  return h('section', { class: 'card', 'aria-labelledby': 'dict-h' },
    h('h2', { id: 'dict-h' }, 'Dictionary address'),
    p('Meanings for each language are read from the first of three places that has it: this address (a folder that holds dict/<language>/…, https or http on localhost) if you set one; then this ' + (ctx.deps.chrome ? 'extension’s own files (Albanian only)' : 'application’s own files') + '; then the hosted copy named in config.json. Leave the address empty to use the other two.'),
    locations ?? null,
    field('Dictionary files', input),
    h('div', { class: 'row' },
      button('Save', async () => {
        const raw = input.value.trim();
        const r = await ctx.saveDictionaryAddress(raw === '' ? null : raw);
        if (!r.ok) { setStatus(status, r.message, 'error'); return; }
        setStatus(status, raw ? 'Dictionary address saved.' : 'Dictionary address cleared.', 'ok');
      }, { id: 'asset-save' }),
      useOwn ? button('Use this application’s files', () => { input.value = own; }, { id: 'asset-own' }) : null),
    status);
}

/**
 * Helpers for the per-site fixture tests: load a harness/sites page into jsdom (scripts stay inert; templates and
 * srcdoc frames are filled by the test exactly as the page's own script would), point `location` at the page the
 * fixture models, and select text in the top document or in a same-origin frame.
 */
import fs from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';
import { SiteAdapter, registryEntry, type ReaderRegistryEntry } from '../../packages/golearn-extension/src/adapters';
import type { ReaderSelection } from '../../packages/golearn-extension/src/contract/readerAdapter';
import { applyRange } from './dom';

const SITES = path.resolve(__dirname, '../../packages/golearn-extension/harness/sites');
export const fixtureText = (name: string): string => fs.readFileSync(path.join(SITES, name), 'utf8');
export const fixtureNames = (): string[] => fs.readdirSync(SITES).filter((f) => f.endsWith('.html')).sort();

const HOME = 'http://localhost:3000/';
type JsdomLike = { reconfigure(o: { url: string }): void };
const jsdom = (): JsdomLike => (globalThis as unknown as { jsdom: JsdomLike }).jsdom;

/** Point the document at a page address (the host decides the registry entry). */
export function setUrl(url: string): void { jsdom().reconfigure({ url }); }
export function resetUrl(): void { try { jsdom().reconfigure({ url: HOME }); } catch { /* the window is gone */ } }

export interface Mounted { url: string; frames: Map<string, HTMLIFrameElement> }

/** Replace the document with a fixture: lang, head, body, same-origin srcdoc frames, and the address the fixture models. */
export function mount(name: string): Mounted {
  const parsed = new DOMParser().parseFromString(fixtureText(name), 'text/html');
  const url = parsed.documentElement.getAttribute('data-fixture-url') ?? HOME;
  setUrl(url);
  const root = document.documentElement;
  for (const a of Array.from(root.attributes)) root.removeAttribute(a.name);
  for (const a of Array.from(parsed.documentElement.attributes)) root.setAttribute(a.name, a.value);
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
  document.getSelection()?.removeAllRanges();
  const frames = new Map<string, HTMLIFrameElement>();
  for (const f of Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe'))) {
    frames.set(f.id, f);
    const srcdoc = f.getAttribute('srcdoc');
    if (srcdoc && f.contentDocument) { const fd = f.contentDocument; fd.open(); fd.write(srcdoc); fd.close(); }
  }
  return { url, frames };
}

export function unmount(): void {
  resetUrl();
  const root = document.documentElement;
  for (const a of Array.from(root.attributes)) root.removeAttribute(a.name);
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.title = '';
}

/** A site adapter for a registry id, optionally with the entry changed (a TEST-ONLY override, e.g. to exercise a refused site's markup). */
export function siteAdapter(readerId: string, over: Partial<ReaderRegistryEntry> = {}, extra: Partial<ConstructorParameters<typeof SiteAdapter>[0]> = {}): SiteAdapter {
  const entry = registryEntry(readerId);
  if (!entry) throw new Error(`no registry entry ${readerId}`);
  return new SiteAdapter({ doc: document, entry: { ...entry, ...over }, ...extra });
}

/** Select `needle` (first occurrence in one text node under `root`) in `doc`, which may be a frame's document. */
export function selectIn(doc: Document, root: Node, needle: string): Range {
  const w = doc.createTreeWalker(root, 4);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n as Text;
    const at = t.data.indexOf(needle);
    if (at < 0) continue;
    const r = doc.createRange();
    r.setStart(t, at); r.setEnd(t, at + needle.length);
    const s = doc.getSelection()!;
    s.removeAllRanges(); s.addRange(r);
    return r;
  }
  throw new Error(`text not found: ${needle}`);
}

/** The learner works inside a same-origin frame: the top document's active element is the frame. */
export function focusFrame(frame: HTMLIFrameElement): void {
  vi.spyOn(document, 'activeElement', 'get').mockReturnValue(frame);
}

export function selectTop(root: Node, needle: string): Range {
  const r = selectIn(document, root, needle);
  applyRange(r);
  return r;
}

export function ok(r: unknown): ReaderSelection {
  const s = r as { ok?: boolean; reason?: string; message?: string };
  if (!s || s.ok !== true) throw new Error(`selection failed: ${JSON.stringify(r)}`);
  return r as ReaderSelection;
}

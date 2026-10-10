/**
 * GoLearn Active: the underlines, through the CSS Custom Highlight API only (`CSS.highlights`, `Highlight`,
 * `::highlight(name)`). Ranges are decorated without wrapping, editing or re-flowing any node: the page's DOM is
 * unchanged, screen readers see the same text, the page's scripts are unaffected. The style rules go in through
 * `document.adoptedStyleSheets` (no element is added). Where the API is absent the highlighter says so and does
 * nothing: there is no fallback to wrapping words in elements, by rule.
 */
import { ACTIVE_LEVELS, type ActiveLevel } from './levels';

export const HIGHLIGHT_NAMES: Record<ActiveLevel, string> = { new: 'golearn-new', seen: 'golearn-seen', recognized: 'golearn-recognized', familiar: 'golearn-familiar', known: 'golearn-known', automatic: 'golearn-automatic' };

/** The six underline styles: dashed for a word not met yet, dotted and faint for one only seen, solid for a familiar one, down to a barely visible hairline for one that is automatic. */
export const ACTIVE_CSS = [
  `::highlight(${HIGHLIGHT_NAMES.new}) { text-decoration: underline dashed; text-decoration-thickness: 1px; text-underline-offset: 0.2em; text-decoration-color: rgba(120, 100, 70, 0.55); text-decoration-color: color-mix(in srgb, currentColor 55%, transparent); }`,
  `::highlight(${HIGHLIGHT_NAMES.seen}) { text-decoration: underline dotted; text-decoration-thickness: 1.5px; text-underline-offset: 0.2em; text-decoration-color: rgba(120, 100, 70, 0.4); text-decoration-color: color-mix(in srgb, currentColor 40%, transparent); }`,
  `::highlight(${HIGHLIGHT_NAMES.recognized}) { text-decoration: underline dotted; text-decoration-thickness: 1.5px; text-underline-offset: 0.2em; text-decoration-color: rgba(120, 100, 70, 0.65); text-decoration-color: color-mix(in srgb, currentColor 65%, transparent); }`,
  `::highlight(${HIGHLIGHT_NAMES.familiar}) { text-decoration: underline solid; text-decoration-thickness: 1px; text-underline-offset: 0.2em; text-decoration-color: rgba(120, 100, 70, 0.35); text-decoration-color: color-mix(in srgb, currentColor 35%, transparent); }`,
  `::highlight(${HIGHLIGHT_NAMES.known}) { text-decoration: underline solid; text-decoration-thickness: 0.5px; text-underline-offset: 0.2em; text-decoration-color: rgba(120, 100, 70, 0.22); text-decoration-color: color-mix(in srgb, currentColor 22%, transparent); }`,
  `::highlight(${HIGHLIGHT_NAMES.automatic}) { text-decoration: underline solid; text-decoration-thickness: 0.5px; text-underline-offset: 0.2em; text-decoration-color: rgba(120, 100, 70, 0.1); text-decoration-color: color-mix(in srgb, currentColor 10%, transparent); }`,
].join('\n');

/** The slice of the Highlight API this module uses (typed locally: tests pass a fake, and the DOM lib may lack it). */
export interface HighlightLike { add(range: Range): unknown; delete(range: Range): unknown; clear(): void; readonly size: number }
export interface HighlightRegistryLike { set(name: string, highlight: HighlightLike): unknown; delete(name: string): boolean; has(name: string): boolean; get(name: string): HighlightLike | undefined }
export type HighlightCtor = new (...ranges: Range[]) => HighlightLike;

interface StyleSheetLike { replaceSync(text: string): void }
interface WindowWithHighlights {
  CSS?: { highlights?: HighlightRegistryLike };
  Highlight?: HighlightCtor;
  CSSStyleSheet?: new () => StyleSheetLike;
}

export interface Highlighter {
  /** The API exists in this document's window. */
  readonly supported: boolean;
  /** Replace the ranges of every level at once (an empty map clears). */
  apply(byLevel: ReadonlyMap<ActiveLevel, Range[]>): void;
  /** Ranges currently decorated, per level (for tests and the popup's count). */
  counts(): Record<ActiveLevel, number>;
  clear(): void;
  /** Clear and remove the style sheet. */
  dispose(): void;
}

export function createHighlighter(doc: Document): Highlighter {
  const win = (doc.defaultView ?? {}) as unknown as WindowWithHighlights;
  const registry = win.CSS?.highlights;
  const Ctor = win.Highlight;
  const supported = !!registry && typeof Ctor === 'function';
  const highlights = new Map<ActiveLevel, HighlightLike>();
  let sheet: StyleSheetLike | undefined;
  let styled = false;

  function ensureStyle(): void {
    if (styled || !supported) return;
    styled = true;
    try {
      if (!win.CSSStyleSheet) return;
      sheet = new win.CSSStyleSheet();
      sheet.replaceSync(ACTIVE_CSS);
      const d = doc as unknown as { adoptedStyleSheets?: unknown[] };
      if (Array.isArray(d.adoptedStyleSheets)) d.adoptedStyleSheets = [...d.adoptedStyleSheets, sheet];
    } catch { sheet = undefined; /* the underlines then take the browser's default highlight style, still without touching the DOM */ }
  }

  function highlightFor(level: ActiveLevel): HighlightLike | undefined {
    if (!supported) return undefined;
    let h = highlights.get(level);
    if (!h) {
      h = new Ctor!();
      highlights.set(level, h);
      registry!.set(HIGHLIGHT_NAMES[level], h);
    }
    return h;
  }

  return {
    supported,
    apply(byLevel) {
      if (!supported) return;
      ensureStyle();
      for (const level of ACTIVE_LEVELS) {
        const ranges = byLevel.get(level) ?? [];
        // a level with no ranges is not registered (the registry names only what is on screen); an existing one is emptied
        const h = ranges.length ? highlightFor(level) : highlights.get(level);
        if (!h) continue;
        h.clear();
        for (const r of ranges) { try { h.add(r); } catch { /* a range of a detached node: skipped */ } }
      }
    },
    counts() {
      const out: Record<ActiveLevel, number> = { new: 0, seen: 0, recognized: 0, familiar: 0, known: 0, automatic: 0 };
      for (const level of ACTIVE_LEVELS) out[level] = highlights.get(level)?.size ?? 0;
      return out;
    },
    clear() { for (const h of highlights.values()) h.clear(); },
    dispose() {
      for (const [level, h] of highlights) { h.clear(); try { registry?.delete(HIGHLIGHT_NAMES[level]); } catch { /* gone */ } }
      highlights.clear();
      const d = doc as unknown as { adoptedStyleSheets?: unknown[] };
      if (sheet && Array.isArray(d.adoptedStyleSheets)) { try { d.adoptedStyleSheets = d.adoptedStyleSheets.filter((s) => s !== sheet); } catch { /* read-only in some engines */ } }
      sheet = undefined; styled = false;
    },
  };
}

/**
 * site — the configurable reader adapter. It is `web-generic` plus the options of one registry entry (registry.ts):
 *
 *   containers   where a selection is accepted; a selection outside them is refused (`unsupported`, with a message)
 *   ignore       reader chrome, menus, footnote markers and the site's own lookup popup: never read as sentence text,
 *                and a selection that starts or ends inside one is refused
 *   frames       top-only | same-origin-frames | declare-cross-origin
 *   scripture    BibleGateway / YouVersion: a Scripture reference built from the URL (and a verse wrapper), never from text
 *   dynamic      chapters are loaded or replaced by script: the live range is re-checked against the text that was selected,
 *                nothing is prefetched, and the context is re-read from the live DOM on every call
 *
 * An entry that refuses (blocked, permission-required, unsupported, or switched off) reads nothing: `selection()` and
 * `context()` say why, with the entry's own words. The adapter never injects CSS or script into the page and never
 * overrides a site's copy protection.
 */
import { describePage } from './page';
import type { AdapterLanguageEvidence } from '../contract/language';
import type {
  AnySourceReference, ContextOptions, PageDescriptor, ReaderContext, ScriptureSourceReference, SelectionResult, SourceReference, SourceRestrictions,
} from '../contract/readerAdapter';
import { noCapabilities, type ReaderCapabilities } from '../contract/readerCapabilities';
import { documentLanguageOf } from './languageMeta';
import { entryMatches, entryRefuses, type ReaderRegistryEntry, type SiteOptions } from './registry';
import { parseScriptureUrl, parseUsfmRef, versionLanguage, youVersionLocale } from './scripture';
import { WebGenericAdapter, type WebGenericOptions } from './webGeneric';

export interface SiteAdapterOptions extends Omit<WebGenericOptions, 'readerId' | 'declinedHosts'> {
  entry: ReaderRegistryEntry;
  /** The page address (tests give one; the content script uses the document's own). Only host, path and, for Scripture, the query are read. */
  pageUrl?: () => string;
}

const NO_SITE: SiteOptions = { containers: [], ignore: [], frames: 'same-origin-frames', dynamicContent: false, nativeLookupCoexistence: 'None known.' };

/** The query parameters that name a passage (BibleGateway's `search` and `version`); everything else of a query (a tracker, a session) is dropped. */
const PASSAGE_PARAMS: ReadonlySet<string> = new Set(['search', 'version']);
const MAX_ADDRESS = 200;

/**
 * The address as far as it names the passage: origin and path plus the passage parameters of the query as written, never the fragment,
 * credentials or any other parameter. Contract v3 asks for an http(s) address (not a bare path); the origin is the Scripture site's own.
 */
function passageAddress(url: URL): string | undefined {
  const kept = url.search.replace(/^\?/, '').split('&').filter((pair) => {
    const key = pair.split('=')[0] ?? '';
    let decoded = key;
    try { decoded = decodeURIComponent(key.replace(/\+/g, ' ')); } catch { /* an undecodable key is not a passage parameter */ }
    return PASSAGE_PARAMS.has(decoded.toLowerCase());
  });
  const address = `${url.origin}${url.pathname}${kept.length ? `?${kept.join('&')}` : ''}`;
  return /^https?:\/\//.test(address) && url.pathname.length > 1 ? address.slice(0, MAX_ADDRESS) : undefined;
}

const elementOf = (n: Node): Element | null => (n.nodeType === 1 ? (n as Element) : n.parentElement);

export class SiteAdapter extends WebGenericAdapter {
  readonly entry: ReaderRegistryEntry;
  readonly site: SiteOptions;
  /** Chapters load or are replaced by script. */
  readonly dynamicContent: boolean;
  readonly nativeLookupCoexistence: string;
  private readonly pageUrl: () => string;
  private readonly ignoreSel: string;
  private readonly containerSel: string;
  private sawReadable = false;
  private liveText: string | undefined;

  constructor(o: SiteAdapterOptions) {
    super({ ...o, readerId: o.entry.readerId, declinedHosts: [] });
    this.entry = o.entry;
    this.site = o.entry.site ?? NO_SITE;
    this.dynamicContent = this.site.dynamicContent;
    this.nativeLookupCoexistence = this.site.nativeLookupCoexistence;
    this.ignoreSel = this.site.ignore.join(', ');
    this.containerSel = this.site.containers.join(', ');
    this.pageUrl = o.pageUrl ?? (() => describePage(this.doc).href);
  }

  /** True when this entry reads nothing (refusing status, or switched off). */
  get refuses(): boolean { return entryRefuses(this.entry); }

  /** The words the learner sees when this adapter refuses. */
  refusalMessage(): string {
    return this.entry.refusal ?? 'GoLearn does not support this reader yet. It was not read.';
  }

  matches(page: PageDescriptor): boolean {
    if (this.entry.adapter !== 'site') return false;
    if (page.contentType && !/^(text\/html|application\/xhtml\+xml|text\/plain)/i.test(page.contentType)) return false;
    return entryMatches(this.entry, page);
  }

  capabilities(): ReaderCapabilities {
    const declared = this.entry.capabilities;
    if (this.refuses) return { ...noCapabilities(this.id, declared.contentAccessRestrictions), platform: declared.platform };
    if (this.lastFrameState === 'cross-origin-frame') return super.capabilities();
    // a reader whose text is expected in a cross-origin frame declares that up front, until a top-document selection proves readable
    if (this.site.frames === 'declare-cross-origin' && !this.sawReadable) return { ...declared };
    const base = super.capabilities();
    return {
      ...base,
      platform: declared.platform,
      contentAccessRestrictions: declared.contentAccessRestrictions,
      contextConfidence: Math.min(base.contextConfidence, declared.contextConfidence),
    };
  }

  // ─────────────────────────────── selection ───────────────────────────────

  selection(): SelectionResult {
    this.liveText = undefined;
    if (this.refuses) return { ok: false, reason: 'unsupported', message: this.refusalMessage() };
    const frame = this.activeFrame();
    if (!frame.crossOrigin) {
      if (frame.frameEl && this.site.frames === 'top-only') {
        return { ok: false, reason: 'unsupported', message: `GoLearn reads only the page itself on ${this.entry.title}, not text inside a frame.` };
      }
      const sel = frame.doc.getSelection?.();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        const problem = this.outOfBounds(sel.getRangeAt(0));
        if (problem) { this.located = undefined; return { ok: false, reason: 'unsupported', message: problem }; }
      }
    }
    const res = super.selection();
    if (res.ok) {
      this.sawReadable = true;
      if (this.dynamicContent) this.liveText = res.range.toString();
    }
    return res;
  }

  /** A refusal message when either end of the range is in reader chrome or outside the reading area; undefined when it is fine. */
  private outOfBounds(range: Range): string | undefined {
    for (const node of [range.startContainer, range.endContainer]) {
      const el = elementOf(node);
      if (this.ignoreSel && el?.closest(this.ignoreSel)) return 'That is part of the reader\'s own controls, not the text. Select inside the text.';
      if (this.containerSel && !el?.closest(this.containerSel)) return `That is outside the reading area of ${this.entry.title}. Select inside the text.`;
    }
    return undefined;
  }

  protected isSkipped(el: Element): boolean {
    if (super.isSkipped(el)) return true;
    if (!this.ignoreSel) return false;
    try { return el.matches(this.ignoreSel); } catch { return false; }
  }

  isRangeLive(range: Range): boolean {
    if (!super.isRangeLive(range)) return false;
    // on a page that re-renders chapters in place, the same nodes may now hold other text: the range must still read what was selected
    return !this.dynamicContent || this.liveText === undefined || range.toString() === this.liveText;
  }

  // ─────────────────────────────── context ───────────────────────────────

  context(range: Range, options: ContextOptions = {}): ReaderContext {
    if (this.refuses) return { kind: 'none', confidence: 0, reason: `disabled: ${this.refusalMessage()}` };
    return super.context(range, options);
  }

  // ─────────────────────────────── source and language ───────────────────────────────

  /**
   * What is being read, never its text. Every reference carries the entry's `restrictions` (trusted configuration: the registry
   * object, copied, never anything the page says about itself).
   */
  sourceRef(): AnySourceReference | undefined {
    if (this.refuses) return undefined;
    const restrictions: SourceRestrictions = { ...this.entry.restrictions };
    let url: URL | undefined;
    try { url = new URL(this.pageUrl()); } catch { url = undefined; }
    if (this.site.scripture) {
      const ref = this.scriptureRef(url, restrictions);
      // the page title of a Scripture page may quote the verse: it is never used here
      return ref ?? { kind: 'web', locator: url?.pathname || undefined, restrictions };
    }
    const title = (this.doc.title ?? '').trim().slice(0, 120);
    const out: SourceReference = { kind: 'web', title: title || undefined, locator: url?.pathname || undefined, restrictions };
    return out;
  }

  /**
   * The Scripture reference of the selection. `confidence` is 0.9 only when the URL and the page's own verse markup both gave a
   * reference and agree (same book and chapter; for BibleGateway also a verse at or after the URL's), else 0.6: the URL alone, or
   * the markup against the URL (the markup's numbers are then used, as the page's own label of what is on screen).
   */
  private scriptureRef(url: URL | undefined, restrictions: SourceRestrictions): ScriptureSourceReference | undefined {
    const kind = this.site.scripture;
    if (!kind) return undefined;
    const fromUrl = url ? parseScriptureUrl(kind, url.href) : undefined;
    const start = this.located ? elementOf(this.located.range.startContainer) : null;
    let ref: ScriptureSourceReference | undefined = fromUrl;
    let confidence = 0.6;
    if (kind === 'youversion') {
      const wrapper = start?.closest('[data-usfm]')?.getAttribute('data-usfm');
      const w = wrapper ? parseUsfmRef(wrapper) : undefined;
      if (w) {
        const t = fromUrl?.translationId ?? 'unknown';
        const hint = fromUrl?.languageHint ?? versionLanguage(t);
        ref = { kind: 'scripture', translationId: t, book: w.book, chapter: w.chapter, ...(w.verse !== undefined ? { verse: w.verse } : fromUrl?.verse !== undefined && fromUrl.book === w.book && fromUrl.chapter === w.chapter ? { verse: fromUrl.verse } : {}), ...(hint ? { languageHint: hint } : {}) };
        if (fromUrl && fromUrl.book === w.book && fromUrl.chapter === w.chapter) confidence = 0.9;
      }
    } else if (fromUrl && this.located) {
      const n = this.verseMarkerBefore(this.located.range);
      if (n) {
        ref = { ...fromUrl, chapter: n.chapter ?? fromUrl.chapter, verse: n.verse };
        if ((n.chapter ?? fromUrl.chapter) === fromUrl.chapter && (fromUrl.verse === undefined || n.verse >= fromUrl.verse)) confidence = 0.9;
      }
    }
    if (!ref) return undefined;
    const address = url ? passageAddress(url) : undefined;
    return { ...ref, confidence, ...(address ? { url: address } : {}), restrictions };
  }

  /** The nearest verse-number marker (`sup.versenum`, or `sup.chapternum` = verse 1) before the selection: a number, never text. */
  private verseMarkerBefore(range: Range): { verse: number; chapter?: number } | undefined {
    const doc = range.startContainer.ownerDocument ?? this.doc;
    const root = (this.containerSel ? elementOf(range.startContainer)?.closest(this.containerSel) : null) ?? doc.body;
    let best: Element | undefined;
    for (const el of Array.from(root.querySelectorAll('sup.versenum, sup.chapternum'))) {
      // the marker precedes the selection start when the start follows it
      if (el.compareDocumentPosition(range.startContainer) & 4 /* FOLLOWING */) best = el;
      else break;
    }
    if (!best) return undefined;
    const n = parseInt((best.textContent ?? '').replace(/\D+/g, ' ').trim().split(' ')[0] ?? '', 10);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return best.classList.contains('chapternum') ? { verse: 1, chapter: n } : { verse: n };
  }

  languageEvidence(): AdapterLanguageEvidence {
    const doc = this.located?.frameDoc ?? this.doc;
    let url: URL | undefined;
    try { url = new URL(this.pageUrl()); } catch { url = undefined; }
    let hint: string | undefined;
    if (url) {
      if (this.site.pathLocale && this.site.scripture === 'youversion') hint = youVersionLocale(url);
      if (!hint && this.site.urlLanguageParam) hint = url.searchParams.get(this.site.urlLanguageParam) ?? undefined;
    }
    const out: AdapterLanguageEvidence = {};
    const documentLanguage = documentLanguageOf(doc, this.located?.block ?? null, hint);
    if (documentLanguage) out.documentLanguage = documentLanguage;
    const ref = this.site.scripture && url ? parseScriptureUrl(this.site.scripture, url.href) : undefined;
    const bookId = ref ? versionLanguage(ref.translationId) : undefined;
    if (bookId) out.bookLanguage = { languageId: bookId, source: 'scripture-translation', confidence: 0.85 };
    return out;
  }

  dispose(): void {
    super.dispose();
    this.liveText = undefined;
  }
}

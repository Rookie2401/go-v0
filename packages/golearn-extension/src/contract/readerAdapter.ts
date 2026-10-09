/**
 * ReaderAdapter — the extension's contract with one reading environment (docs/ecosystem/GOLEARN-EXTENSION-STRATEGY.md §2).
 *
 * Rules every adapter obeys (charter 10-13): read only what the learner is looking at and has selected; never scroll,
 * fetch or cache pages to extract text; never defeat an access control; never persist page text (the context lives
 * in memory for one lookup). Anything the environment does not permit is declared in `capabilities()` and returned
 * as `none` — the parser then works from the selected word alone and says so.
 */
import type { ReaderCapabilities } from './readerCapabilities';
import type { AdapterLanguageEvidence } from './language';
import type { Span } from '../text';

/** Where a page is, without its content. */
export interface PageDescriptor {
  href: string;
  protocol: string;
  host: string;
  pathname: string;
  title?: string;
  contentType?: string;
}

export type SelectionFailureReason =
  | 'no-selection'      // nothing selected
  | 'empty'             // only whitespace selected
  | 'multi-block'       // the selection crosses paragraphs/blocks: not a word or phrase lookup
  | 'too-long'          // more than a word or short passage
  | 'cross-origin-frame'// the selection lives in a frame this script cannot read
  | 'unsupported'       // the reader is not supported
  | 'unreadable';       // the selection exists but its text cannot be read

export type TextDirection = 'ltr' | 'rtl' | 'unknown';

export interface ReaderSelection {
  ok: true;
  /** The selected text, NFC, trimmed, snapped outward to whole grapheme clusters, internal whitespace collapsed. */
  surface: string;
  /** A private copy of the range; live DOM changes may collapse it, `isRangeLive` tells. */
  range: Range;
  direction: TextDirection;
  directionSource: 'attribute' | 'style' | 'text' | 'none';
  /** The selection edges were moved to whole characters (combining marks kept with their base). */
  snapped: boolean;
  /** Where the text was read: the top document, or a same-origin frame. */
  frame: 'top' | 'same-origin-frame';
  /** The page's own declared language near the selection (lang attribute), if any. Informational. */
  pageLanguage?: string;
}

export interface SelectionFailure { ok: false; reason: SelectionFailureReason; message: string }
export type SelectionResult = ReaderSelection | SelectionFailure;

export type ContextKind = 'sentence' | 'fragment' | 'none';

/** What `context()` returns. Offsets are into `sentence` (NFC) and delimit the selection. */
export interface ReaderContext {
  kind: ContextKind;
  confidence: number; // 0..1; 0 when kind is 'none'
  sentence?: string;
  selStart?: number;
  selEnd?: number;
  before?: string;
  after?: string;
  /** Why the context is not a full sentence, when it is not. */
  reason?: string;
}

/** What the terms of a reading environment allow, per use. `unknown` is what nobody has reviewed; consumers treat it as `forbidden`. */
export type Permission = 'allowed' | 'forbidden' | 'unknown';

/**
 * The restrictions a source carries, from TRUSTED CONFIGURATION only (the reader registry's entry for the environment), never from
 * the page's own metadata: a page cannot grant itself a permission.
 */
export interface SourceRestrictions {
  textRetention: Permission;
  remoteProcessing: Permission;
  audioRetention: Permission;
  export: Permission;
  sharing: Permission;
  reviewExamples: Permission;
}

export const PERMISSION_KEYS = ['textRetention', 'remoteProcessing', 'audioRetention', 'export', 'sharing', 'reviewExamples'] as const;

export interface SourceReference {
  kind: 'web' | 'ebook' | 'file' | 'demo';
  title?: string;
  /** For the web: the URL path only. Never the query, the fragment, or any text. */
  locator?: string;
  /** From the registry entry of the environment that produced the reference (the site adapter attaches it); absent when the adapter has no entry. */
  restrictions?: SourceRestrictions;
}

/**
 * A Scripture reference: metadata about WHERE in a translation a selection is, never the verse text. Parsed only from
 * documented page facts (the URL, a verse wrapper's data attribute); `book` is a USFM code (`JHN`).
 */
export interface ScriptureSourceReference {
  kind: 'scripture';
  /** The translation as the site names it in the URL (`NIV`, `ESV`); `unknown` when the page does not say. */
  translationId: string;
  /** USFM book code (`GEN`, `JHN`, `1JN`). */
  book: string;
  chapter: number;
  verse?: number;
  /** Primary language of the translation when a documented fact gives it (a locale in the path, a known version code). */
  languageHint?: string;
  /**
   * How sure the reference is: 0.9 when the URL and the page's verse markup both gave it and agree, 0.6 when only the URL gave it (or
   * the markup disagrees with it). Absent on a bare URL parse (`parseScriptureUrl`); the site adapter sets it.
   */
  confidence?: number;
  /** The page address as far as it names the passage: origin, path and the `search`/`version` query only (an http(s) address, as the contract asks), never anything else of the query, nor the fragment. */
  url?: string;
  /** From the registry entry (see SourceReference.restrictions). */
  restrictions?: SourceRestrictions;
}

/** What `sourceRef()` may return: an ordinary source, or a Scripture reference. */
export type AnySourceReference = SourceReference | ScriptureSourceReference;

export interface Rect { top: number; left: number; right: number; bottom: number; width: number; height: number }

/** Where to show the card without disturbing the page. */
export interface PopupAnchor {
  rect: Rect;
  viewport: { width: number; height: number };
  rtl: boolean;
  /** 'range' = taken from the live selection; 'fallback' = a fixed corner because no rect was available. */
  source: 'range' | 'fallback';
}

export interface LayoutChange { reason: 'resize' | 'scroll' | 'mutation' | 'font' }

export interface ContextOptions {
  /** Also return the sentence before and after. Off by default (data minimisation). */
  adjacent?: boolean;
  /** The language the selection was resolved to; lets the adapter pick that language's sentence cutter. */
  languageId?: string;
  /** The sentence cutter of that language (the language pack's). Absent = the adapter's own default (Intl.Segmenter). */
  segmenter?: (text: string) => Span[];
}

type MaybePromise<T> = T | Promise<T>;

export interface ReaderAdapter {
  readonly id: string;
  matches(location: PageDescriptor): boolean;
  /** Evaluated at call time: it may differ per selection (a cross-origin frame has no sentence context). */
  capabilities(): ReaderCapabilities;
  selection(): MaybePromise<SelectionResult>;
  context(range: Range, options?: ContextOptions): MaybePromise<ReaderContext>;
  /** Kind, title and locator of what is being read — never its text. */
  sourceRef(): MaybePromise<AnySourceReference | undefined>;
  /** What the page or the reader declares about the language near the current selection. Metadata only; optional. */
  languageEvidence?(): AdapterLanguageEvidence;
  anchor(range: Range | undefined): PopupAnchor;
  /** Call back when the layout moved under a shown card. Returns the unsubscribe function. */
  onLayoutChange(cb: (change: LayoutChange) => void): () => void;
  /** True while the range still points into the live document and selects something. */
  isRangeLive(range: Range): boolean;
  dispose(): void;
}

/** Attribute the card's host element carries; adapters ignore DOM mutations inside it. */
export const GOLEARN_HOST_ATTR = 'data-golearn-host';

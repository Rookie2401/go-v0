/**
 * The lookup controller: adapter.selection -> context -> parser -> card -> encounter record, with every failure path
 * ending in a one-line message and never an exception into the page. Only the newest lookup may show a card or write
 * a record; older ones are superseded. It listens for layout changes only while a card is open.
 */
import type { LayoutChange, PopupAnchor, ReaderAdapter, ReaderContext, ReaderSelection, SelectionFailure } from '../contract/readerAdapter';
import { describePage } from '../adapters';
import { chooseAdapter } from '../adapters';
import type { CardModel } from '../parser/cardModel';
import type { ParseContext, ParseInput } from '../parser';
import type { CardUI, DismissReason } from '../popup/card';
import { LookupTimer, type MetricsRow, type MetricsStore, type PerfLike } from '../metrics';
import { buildSelectionEvent, type EncounterStore, type Identity } from '../store';
import type { LookupTrigger } from '../platform';

export interface ControllerDeps {
  doc: Document;
  adapters: ReaderAdapter[];
  parse: (input: ParseInput) => CardModel;
  ui: CardUI;
  store: EncounterStore;
  metrics: MetricsStore;
  identity: Identity;
  /** Resolves when the identity is complete (device id loaded). */
  ready?: Promise<void>;
  version: string;
  sessionId: string;
  now?: () => Date;
  perf?: PerfLike;
  /** performance.now() at the end of this script's module evaluation (reported once, on the first row). */
  moduleLoadMs?: number;
  /** Resolves on the next paint (or soon after); tests pass an immediate promise. */
  nextFrame?: () => Promise<void>;
}

export interface LookupRequest {
  trigger: LookupTrigger;
  /** The browser's own copy of the selected text (context-menu lookups), used only when the page's selection cannot be read. */
  selectionText?: string;
  focus?: boolean;
}

export type LookupOutcome =
  | { status: 'shown'; card: CardModel; recorded: 'recorded' | 'duplicate' | 'failed' }
  | { status: 'message'; reason: string; message: string }
  | { status: 'silent'; reason: string }
  | { status: 'superseded' };

const MESSAGES = {
  parserFailed: 'GoLearn could not analyse that selection.',
  generic: 'GoLearn could not complete that lookup.',
} as const;

export class LookupController {
  private seq = 0;
  private enabled = false;
  private lookupsDone = 0;
  private currentRange: Range | undefined;
  private currentAdapter: ReaderAdapter | undefined;
  private unsubscribe: (() => void) | undefined;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private listeners: Array<() => void> = [];
  private disposed = false;

  constructor(private readonly d: ControllerDeps) {}

  get isEnabled(): boolean { return this.enabled; }

  // ─────────────────────────── activation ───────────────────────────

  /** "GoLearn on" for this tab: user-made selections are looked up. Nothing is read until the learner selects. */
  enable(): void {
    if (this.enabled || this.disposed) return;
    this.enabled = true;
    const doc = this.d.doc;
    const trigger = () => {
      clearTimeout(this.debounce);
      this.debounce = setTimeout(() => { void this.lookup({ trigger: 'selection' }); }, 120);
    };
    const fromCard = (e: Event): boolean => { const h = this.d.ui.host(); return !!h && (e.composedPath?.().includes(h) ?? false); };
    const onUp = (e: MouseEvent) => { if (!fromCard(e)) trigger(); };
    const onKeyUp = (e: KeyboardEvent) => { if (!fromCard(e) && e.shiftKey && /^Arrow|^Home$|^End$/.test(e.key)) trigger(); };
    doc.addEventListener('mouseup', onUp, true);
    doc.addEventListener('keyup', onKeyUp, true);
    this.listeners.push(() => doc.removeEventListener('mouseup', onUp, true), () => doc.removeEventListener('keyup', onKeyUp, true));
  }

  disable(): void {
    this.enabled = false;
    clearTimeout(this.debounce);
    for (const off of this.listeners) off();
    this.listeners = [];
    this.seq++; // anything in flight is dropped
    this.closeCard('disposed');
  }

  dispose(): void {
    this.disable();
    this.disposed = true;
    this.d.ui.destroy();
    this.currentAdapter?.dispose();
    for (const a of this.d.adapters) a.dispose();
  }

  // ─────────────────────────── the lookup ───────────────────────────

  async lookup(req: LookupRequest): Promise<LookupOutcome> {
    if (this.disposed) return { status: 'silent', reason: 'disposed' };
    const my = ++this.seq;
    const timer = new LookupTimer(this.d.perf);
    const loud = req.trigger !== 'selection'; // passive selections stay quiet when there is nothing to look up
    const live = () => my === this.seq && !this.disposed;
    const fixed = this.fallbackAnchor();
    const say = (reason: string, message: string, anchor: PopupAnchor = fixed): LookupOutcome => {
      if (!loud) return { status: 'silent', reason };
      this.closeCard('replaced');
      this.d.ui.showMessage(message, anchor, 'info');
      void this.pushMetric(timer, { readerId: this.currentAdapter?.id ?? 'none', contextKind: 'n/a', tokenCount: 0, contextChars: 0, outcome: 'failed', failure: reason });
      return { status: 'message', reason, message };
    };

    try {
      const adapter = this.pickAdapter();
      this.currentAdapter = adapter;
      const caps = safe(() => adapter.capabilities());
      if (!caps || adapter.id === 'unsupported') {
        const fail = await safeAsync(() => adapter.selection());
        const message = fail && !fail.ok ? fail.message : 'GoLearn does not support this reader yet. It was not read.';
        return say('unsupported', message);
      }

      let sel: ReaderSelection | SelectionFailure | undefined = await safeAsync(() => adapter.selection());
      if (!live()) return { status: 'superseded' };
      if (!sel) return say('selection-error', MESSAGES.generic);
      let usedFallbackText = false;
      if (!sel.ok) {
        const text = req.selectionText?.normalize('NFC').replace(/\s+/gu, ' ').trim();
        if (sel.reason === 'cross-origin-frame' && text) {
          // the browser handed over the text the learner selected in a frame we cannot read: a word-only lookup
          sel = { ok: true, surface: text, range: this.doc().createRange(), direction: 'unknown', directionSource: 'none', snapped: false, frame: 'top' };
          usedFallbackText = true;
        } else return say(sel.reason, sel.message);
      }
      timer.mark('selectionObtained');

      // context: only as much as the adapter's declaration allows, and never more than it claims
      const capsNow = safe(() => adapter.capabilities()) ?? caps;
      let ctx: ReaderContext = { kind: 'none', confidence: 0, reason: 'the reader does not provide sentence context' };
      if (!usedFallbackText && capsNow.sentenceContext !== 'none') {
        const got = await safeAsync(() => adapter.context(sel.range));
        if (!live()) return { status: 'superseded' };
        ctx = got ? this.reconcile(got, capsNow.sentenceContext, capsNow.contextConfidence) : { kind: 'none', confidence: 0, reason: 'context extraction failed' };
      } else if (usedFallbackText) ctx = { kind: 'none', confidence: 0, reason: 'the selection is inside a frame this script cannot read' };
      timer.mark('contextExtracted');

      const parseCtx: ParseContext = {
        kind: ctx.kind, confidence: ctx.confidence, reason: ctx.reason, sentence: ctx.sentence, selStart: ctx.selStart, selEnd: ctx.selEnd,
        direction: sel.direction, pageLanguage: sel.pageLanguage,
      };
      let card: CardModel;
      try { card = this.d.parse({ surface: sel.surface, context: parseCtx }); } catch { return say('parser-error', MESSAGES.parserFailed); }
      timer.mark('parsed');
      if (!live()) return { status: 'superseded' };

      const anchor = usedFallbackText ? fixed : safe(() => adapter.anchor(sel.range)) ?? fixed;
      this.closeCard('new-lookup');
      this.currentRange = usedFallbackText ? undefined : sel.range;
      this.d.ui.show(card, anchor, { focus: req.focus });
      timer.mark('popupPositioned');
      if (this.currentRange) this.watchLayout(adapter, my);

      // first information on screen = next paint; the record is written in parallel
      const frame = (this.d.nextFrame ?? defaultFrame(this.d.doc))().then(() => { timer.mark('firstInfoShown'); });
      try { await this.d.ready; } catch { /* the identity keeps its placeholder device id */ }
      const source = await safeAsync(() => adapter.sourceRef());
      if (!live()) { await frame; return { status: 'superseded' }; }
      const event = buildSelectionEvent({
        card, source, readerId: adapter.id, identity: this.d.identity, version: this.d.version, sessionId: this.d.sessionId,
        now: (this.d.now ?? (() => new Date()))(), direction: sel.direction,
      });
      const res = await this.d.store.append(event);
      await frame;
      const recorded = res.ok ? (res.duplicate ? 'duplicate' : 'recorded') : 'failed';
      if (live()) this.d.ui.setRecorded(recorded);
      await this.pushMetric(timer, {
        readerId: adapter.id, contextKind: card.context.kind, tokenCount: card.tokenCount, contextChars: card.context.sentenceChars ?? card.surface.length,
        outcome: 'shown',
      });
      return { status: 'shown', card, recorded };
    } catch {
      // nothing may leak into the page
      if (my !== this.seq) return { status: 'superseded' };
      return say('unexpected', MESSAGES.generic);
    }
  }

  // ─────────────────────────── internals ───────────────────────────

  /** The card was dismissed by the learner (Escape, outside click, close button): stop watching the layout. */
  onCardDismissed(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.currentRange = undefined;
  }

  private doc(): Document { return this.d.doc; }

  private pickAdapter(): ReaderAdapter {
    return chooseAdapter(describePage(this.d.doc), this.d.adapters);
  }

  /** An adapter may not claim more than it declared: a sentence is downgraded to a fragment when it only declared partial context. */
  private reconcile(got: ReaderContext, level: 'full' | 'partial' | 'none', declaredConfidence: number): ReaderContext {
    if (level === 'none' || got.kind === 'none' || !got.sentence) return { kind: 'none', confidence: 0, reason: got.reason };
    let kind = got.kind;
    const note: string[] = got.reason ? [got.reason] : [];
    if (level === 'partial' && kind === 'sentence') { kind = 'fragment'; note.push('the reader declares only partial context'); }
    return { ...got, kind, confidence: Math.min(got.confidence, declaredConfidence), reason: note.join('; ') || undefined };
  }

  private fallbackAnchor(): PopupAnchor {
    const v = this.d.doc.defaultView;
    const w = v?.innerWidth || 1024;
    return { rect: { top: 16, left: w - 16, right: w - 16, bottom: 16, width: 0, height: 0 }, viewport: { width: w, height: v?.innerHeight || 768 }, rtl: false, source: 'fallback' };
  }

  private watchLayout(adapter: ReaderAdapter, my: number): void {
    this.unsubscribe?.();
    this.unsubscribe = adapter.onLayoutChange((_c: LayoutChange) => {
      if (my !== this.seq || !this.d.ui.isOpen()) return;
      const range = this.currentRange;
      if (!range || !adapter.isRangeLive(range)) { this.closeCard('page-changed'); return; }
      const anchor = safe(() => adapter.anchor(range));
      if (anchor) this.d.ui.reposition(anchor);
    });
  }

  private closeCard(reason: DismissReason): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.currentRange = undefined;
    if (this.d.ui.isOpen()) this.d.ui.dismiss(reason);
  }

  private async pushMetric(timer: LookupTimer, part: Pick<MetricsRow, 'readerId' | 'contextKind' | 'tokenCount' | 'contextChars' | 'outcome'> & { failure?: string }): Promise<void> {
    const first = this.lookupsDone === 0;
    this.lookupsDone++;
    const row: MetricsRow = {
      id: `m:${Date.now().toString(36)}:${this.lookupsDone}:${Math.random().toString(36).slice(2, 6)}`,
      at: (this.d.now ?? (() => new Date()))().toISOString(),
      ...part,
      coldStart: first,
      t: timer.t,
      dt: timer.dt,
      memory: timer.memory(),
      ...(first && this.d.moduleLoadMs !== undefined ? { moduleLoadMs: this.d.moduleLoadMs } : {}),
    };
    try { await this.d.metrics.append(row); } catch { /* metrics are best effort */ }
  }
}

function safe<T>(fn: () => T): T | undefined { try { return fn(); } catch { return undefined; } }
async function safeAsync<T>(fn: () => T | Promise<T>): Promise<T | undefined> { try { return await fn(); } catch { return undefined; } }

function defaultFrame(doc: Document): () => Promise<void> {
  return () => new Promise<void>((resolve) => {
    const view = doc.defaultView;
    const done = () => resolve();
    if (view && typeof view.requestAnimationFrame === 'function') {
      let settled = false;
      const t = setTimeout(() => { if (!settled) { settled = true; done(); } }, 100);
      view.requestAnimationFrame(() => { if (!settled) { settled = true; clearTimeout(t); done(); } });
    } else setTimeout(done, 0);
  });
}

/**
 * GoLearn Active, the page half. When it is on, GoLearn reads the visible text before the learner does, asks the
 * learner model (through the background) about the words it finds, underlines the ones the learner has met with a
 * subtlety that follows how well the word is known, and turns a single click on a word into the ordinary lookup
 * (the same card, the same events, `trigger: 'click'`), with GoListen speaking the word when the learner asked for
 * that and a device voice exists.
 *
 * What it keeps to (docs/ecosystem/GOLEARN-ACTIVE-DESIGN.md):
 *  - the registry decides: an unsupported page or a refusing reader is never scanned, whatever the switch says;
 *  - only the viewport (plus one screen) is scanned, through the same readability rules as a lookup; frames only
 *    when the entry allows them, and only same-origin ones;
 *  - nothing leaves the device but unit ids (normalised single words), nothing is kept beyond the tab, and a scan
 *    records no event: seeing an underline is not an encounter; a click is;
 *  - the page's DOM is never changed: underlines are CSS custom highlights, and where that API is missing there are
 *    none (click-to-look-up still works and the state says so).
 */
import type { LanguageAdapter } from '../../../../src/core';
import { chooseAdapter, describePage, entryRefuses, registryEntry, type ReaderRegistryEntry } from '../adapters';
import { createHighlighter, type Highlighter } from '../active/highlight';
import { levelOfRows, type ActiveLevel } from '../active/levels';
import { createScanner, type ScanToken, type Scanner } from '../active/scan';
import { GOLEARN_HOST_ATTR, type ReaderAdapter } from '../contract/readerAdapter';
import type { KnowledgeView, ProfileReply } from '../protocol';
import type { CardUI } from '../popup/card';
import type { LookupController } from './controller';

export interface ActiveDeps {
  doc: Document;
  controller: LookupController;
  adapters: ReaderAdapter[];
  ui: CardUI;
  /** The learner model, through the background. Absent (no extension context): nothing is underlined and the state says why. */
  profile?: (unitIds: string[], languageId: string) => Promise<ProfileReply | undefined>;
  adapterOf(languageId: string): LanguageAdapter | undefined;
  loadAnalyser?(languageId: string): Promise<void>;
  /** The background answers at most this many ids per request (profile.ts MAX_IDS_PER_REQUEST). */
  batchSize?: number;
  debounceMs?: number;
  viewport?: 'visible' | 'all';
  perf?: { now(): number };
}

export interface ActiveState {
  on: boolean;
  speak: boolean;
  /** The CSS Custom Highlight API exists here (underlines are possible). */
  supported: boolean;
  languageId?: string;
  /** Why nothing is scanned or marked, when that is so. */
  reason?: string;
  /** Word tokens found in the last scan, and how many are marked per level. */
  scanned: number;
  marked: Record<ActiveLevel, number>;
  /** Milliseconds the last scan spent on the page (reading and tokenising), without the learner-model wait. */
  scanMs?: number;
  /** Milliseconds waiting for the learner model in the last scan. */
  profileMs?: number;
  /** Lookups made by clicking a word. */
  clicks: number;
}

const SAMPLE_CHARS = 400;
const CONTROL_SEL = 'a[href], button, input, textarea, select, label, summary, [role="button"], [role="link"], [role="menuitem"], [contenteditable]:not([contenteditable="false"])';

export class ActiveMode {
  private on = false;
  private speak = true;
  private languageId: string | undefined;
  private reason: string | undefined;
  private scanner: Scanner | undefined;
  private entry: ReaderRegistryEntry | undefined;
  private readonly highlighters = new Map<Document, Highlighter>();
  private readonly rows = new Map<string, KnowledgeView | null>();
  private readonly tokensByDoc = new WeakMap<Document, ScanToken[]>();
  private listeners: Array<() => void> = [];
  private observers: MutationObserver[] = [];
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private scanning: Promise<void> | undefined;
  private rescanWanted = false;
  private last: Pick<ActiveState, 'scanned' | 'marked' | 'scanMs' | 'profileMs'> = { scanned: 0, marked: { met: 0, assisted: 0, known: 0, produced: 0 } };
  private clicks = 0;

  constructor(private readonly d: ActiveDeps) {}

  get state(): ActiveState {
    const top = this.highlighters.get(this.d.doc);
    const supported = top ? top.supported : createHighlighter(this.d.doc).supported;
    return { on: this.on, speak: this.speak, supported, languageId: this.languageId, reason: this.reason, clicks: this.clicks, ...this.last };
  }

  /** Switch Active on for this page (idempotent; a second call only updates `speak`). */
  async start(opts: { speak: boolean }): Promise<ActiveState> {
    this.speak = opts.speak;
    if (this.on) return this.state;
    this.on = true;
    this.reason = undefined;
    // one switch: with Active on, a selection the learner makes is looked up too (the per-tab switch folded into Active, 2026-10-09)
    this.d.controller.enable();

    const adapter = chooseAdapter(describePage(this.d.doc), this.d.adapters);
    const entry = registryEntry(adapter.id);
    if (adapter.id === 'unsupported' || !entry || entryRefuses(entry)) {
      this.reason = entry?.refusal ?? 'GoLearn does not read this page. Nothing was scanned.';
      return this.state;
    }
    this.entry = entry;
    this.scanner = createScanner({ doc: this.d.doc, adapterOf: this.d.adapterOf, containers: entry.site?.containers, ignore: entry.site?.ignore, viewport: this.d.viewport ?? 'visible' });

    // the language of the page, decided the way a lookup decides it (override, book, page metadata, detection; never a guess)
    const sample = this.sampleText();
    const res = await this.d.controller.resolvePageLanguage(sample);
    if (!this.on) return this.state;
    if (!res.languageId) {
      const why = res.reasons.slice(-2).join('; ');
      this.reason = `GoLearn cannot tell which language this page is in, and will not guess. Choose a language in the setup page.${why ? ` Why: ${why}.` : ''}`;
      this.attachClick(); // a click still looks up (the lookup says the same thing, with the choice)
      return this.state;
    }
    this.languageId = res.languageId;
    if (!this.d.adapterOf(res.languageId) && this.d.loadAnalyser) { try { await this.d.loadAnalyser(res.languageId); } catch { /* said below */ } }
    if (!this.on) return this.state;
    if (!this.d.adapterOf(res.languageId)) {
      this.reason = `The ${res.languageId} analyser is not loaded, so the page was not read.`;
      this.attachClick();
      return this.state;
    }
    this.attachClick();
    this.attachWatchers();
    await this.rescan();
    return this.state;
  }

  setSpeak(speak: boolean): void { this.speak = speak; }

  stop(): void {
    if (!this.on) return;
    this.on = false;
    this.d.controller.disable();
    clearTimeout(this.debounce);
    for (const off of this.listeners) off();
    this.listeners = [];
    for (const o of this.observers) o.disconnect();
    this.observers = [];
    for (const h of this.highlighters.values()) h.dispose();
    this.highlighters.clear();
    this.rows.clear();
    this.languageId = undefined;
    this.scanner = undefined;
    this.last = { scanned: 0, marked: { met: 0, assisted: 0, known: 0, produced: 0 } };
  }

  /** Read the viewport again (scroll, resize, a page change). Runs one scan at a time; a request during a scan runs once after it. */
  rescan(): Promise<void> {
    if (!this.on || !this.scanner || !this.languageId) return Promise.resolve();
    if (this.scanning) { this.rescanWanted = true; return this.scanning; }
    this.scanning = this.scanOnce().catch(() => undefined).then(async () => {
      this.scanning = undefined;
      if (this.rescanWanted) { this.rescanWanted = false; await this.rescan(); }
    });
    return this.scanning;
  }

  // ─────────────────────────── internals ───────────────────────────

  private roots(): Document[] {
    const out: Document[] = [this.d.doc];
    const frames = this.entry?.site?.frames;
    if (frames === 'top-only' || frames === 'declare-cross-origin') return out;
    for (const f of this.d.doc.querySelectorAll('iframe, frame')) {
      let inner: Document | null = null;
      try { inner = (f as HTMLIFrameElement).contentDocument; } catch { inner = null; }
      if (inner && inner.body) out.push(inner);
    }
    return out;
  }

  private sampleText(): string {
    if (!this.scanner) return '';
    let s = '';
    for (const root of this.roots()) {
      for (const n of this.scanner.textNodes(root)) {
        s += (s ? ' ' : '') + n.data.replace(/\s+/gu, ' ').trim();
        if (s.length >= SAMPLE_CHARS) return s.slice(0, SAMPLE_CHARS);
      }
    }
    return s;
  }

  private async scanOnce(): Promise<void> {
    const scanner = this.scanner!;
    const languageId = this.languageId!;
    const clock = this.d.perf ?? performance;
    const t0 = clock.now();
    const byDoc = new Map<Document, ScanToken[]>();
    for (const root of this.roots()) {
      const tokens = scanner.tokensIn(scanner.textNodes(root), languageId);
      byDoc.set(root, tokens);
      this.tokensByDoc.set(root, tokens);
    }
    const scanMs = clock.now() - t0;

    // the learner model, for the ids not asked about yet on this tab
    const want = new Set<string>();
    for (const tokens of byDoc.values()) for (const t of tokens) for (const id of t.ids) if (!this.rows.has(id)) want.add(id);
    const t1 = clock.now();
    await this.consult([...want], languageId);
    const profileMs = clock.now() - t1;
    if (!this.on) return;

    let scanned = 0;
    const marked = { met: 0, assisted: 0, known: 0, produced: 0 };
    for (const [root, tokens] of byDoc) {
      const byLevel = new Map<ActiveLevel, Range[]>();
      for (const t of tokens) {
        scanned++;
        const level = levelOfRows(t.ids.map((id) => this.rows.get(id) ?? undefined));
        if (!level) continue;
        let range: Range;
        try { range = root.createRange(); range.setStart(t.node, t.start); range.setEnd(t.node, t.end); } catch { continue; }
        (byLevel.get(level) ?? byLevel.set(level, []).get(level)!).push(range);
        marked[level]++;
      }
      this.highlighterFor(root).apply(byLevel);
    }
    this.last = { scanned, marked, scanMs: Math.round(scanMs * 100) / 100, profileMs: Math.round(profileMs * 100) / 100 };
    if (!this.d.profile) this.reason = 'The learner model is not reachable from this page, so nothing is underlined; clicking a word still looks it up.';
    else if (!this.highlighterFor(this.d.doc).supported) this.reason = 'This browser cannot draw the underlines (no CSS highlight API); clicking a word still looks it up.';
    else this.reason = undefined;
  }

  private highlighterFor(root: Document): Highlighter {
    let h = this.highlighters.get(root);
    if (!h) { h = createHighlighter(root); this.highlighters.set(root, h); }
    return h;
  }

  /** Ask the background in batches; an answer that failed is not cached (asked again next scan). */
  private async consult(ids: string[], languageId: string): Promise<void> {
    const ask = this.d.profile;
    if (!ask || !ids.length) return;
    const size = Math.max(1, Math.min(this.d.batchSize ?? 60, 60));
    for (let i = 0; i < ids.length; i += size) {
      const batch = ids.slice(i, i + size);
      let reply: ProfileReply | undefined;
      try { reply = await ask(batch, languageId); } catch { reply = undefined; }
      if (!this.on) return;
      if (!reply || !reply.ok) continue;
      if (reply.error && !Object.keys(reply.rows ?? {}).length) continue; // the model was not consulted: no evidence of "never met"
      for (const id of batch) this.rows.set(id, reply.rows?.[id] ?? null);
    }
  }

  private attachWatchers(): void {
    const view = this.d.doc.defaultView;
    const later = () => { clearTimeout(this.debounce); this.debounce = setTimeout(() => { void this.rescan(); }, this.d.debounceMs ?? 150); };
    if (view) {
      view.addEventListener('scroll', later, { capture: true, passive: true });
      view.addEventListener('resize', later, { passive: true });
      view.addEventListener('pageshow', later);
      this.listeners.push(() => view.removeEventListener('scroll', later, { capture: true }), () => view.removeEventListener('resize', later), () => view.removeEventListener('pageshow', later));
    }
    // a tab shown for the first time (or again) gets its viewport then: scan once it is visible
    const onVisible = () => { if (this.d.doc.visibilityState !== 'hidden') later(); };
    this.d.doc.addEventListener('visibilitychange', onVisible);
    this.listeners.push(() => this.d.doc.removeEventListener('visibilitychange', onVisible));
    const MO = (view as unknown as { MutationObserver?: typeof MutationObserver } | null)?.MutationObserver ?? (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver;
    if (MO) {
      for (const root of this.roots()) {
        if (!root.body) continue;
        const mo = new MO((records) => {
          // the card's own host is the one node GoLearn adds: its changes are not the page's
          if (records.every((r) => (r.target as Element | null)?.nodeType === 1 && (r.target as Element).closest?.(`[${GOLEARN_HOST_ATTR}]`))) return;
          later();
        });
        try { mo.observe(root.body, { childList: true, characterData: true, subtree: true }); this.observers.push(mo); } catch { /* a document that cannot be observed */ }
      }
    }
  }

  private attachClick(): void {
    for (const root of this.roots()) {
      const onClick = (e: MouseEvent) => { void this.onClick(e, root); };
      root.addEventListener('click', onClick, true);
      this.listeners.push(() => root.removeEventListener('click', onClick, true));
    }
  }

  private async onClick(e: MouseEvent, root: Document): Promise<void> {
    if (!this.on || e.button !== 0 || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const target = e.target as Element | null;
    if (!target) return;
    const host = this.d.ui.host();
    if (host && (e.composedPath?.().includes(host) || host.contains(target))) return;
    const el = target.nodeType === 1 ? (target as Element) : target.parentElement;
    if (el?.closest?.(CONTROL_SEL)) return;
    const sel = root.getSelection?.();
    if (sel && sel.rangeCount && !sel.isCollapsed) return; // a drag: the learner selected a phrase; the per-tab switch handles that
    const point = caretAt(root, e.clientX, e.clientY);
    if (!point || point.node.nodeType !== 3) return;
    const languageId = this.languageId;
    if (!languageId || !this.scanner) {
      if (!languageId) { void this.d.controller.lookup({ trigger: 'click' }); } // the lookup says the language is undetermined, with the choice
      return;
    }
    const token = this.scanner.tokenAt(point.node as Text, point.offset, languageId);
    if (!token) return;
    let range: Range;
    try { range = root.createRange(); range.setStart(token.node, token.start); range.setEnd(token.node, token.end); } catch { return; }
    try { sel?.removeAllRanges(); sel?.addRange(range); } catch { return; }
    this.clicks++;
    this.d.controller.cancelPendingLookup();
    const out = await this.d.controller.lookup({ trigger: 'click' });
    if (out.status === 'shown' && this.speak) this.d.ui.pronounce();
  }
}

/** The text node and offset under a point, through whichever API the engine has. */
function caretAt(doc: Document, x: number, y: number): { node: Node; offset: number } | undefined {
  const d = doc as Document & { caretRangeFromPoint?(x: number, y: number): Range | null; caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null };
  try {
    if (typeof d.caretPositionFromPoint === 'function') { const p = d.caretPositionFromPoint(x, y); if (p) return { node: p.offsetNode, offset: p.offset }; }
    if (typeof d.caretRangeFromPoint === 'function') { const r = d.caretRangeFromPoint(x, y); if (r) return { node: r.startContainer, offset: r.startOffset }; }
  } catch { /* no caret under the point */ }
  return undefined;
}

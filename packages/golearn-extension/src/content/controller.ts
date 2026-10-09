/**
 * The lookup controller. The pipeline, in order, each step marked with performance.now() (metrics.ts):
 *
 *   capture -> NFC/original form kept -> normalize for analysis -> tokenize -> lemma candidates -> morphology -> senses
 *   -> contextual disambiguation -> phrases -> syntax notes        (all inside `parse`, the bundled analyser)
 *   -> CARD SHOWN (layer 1)
 *   -> beside it, never blocking it: the dictionary gloss, the learner-model consultation, the pack's explanations (each
 *      through the background), and the pronunciation check (the card's own)
 *   -> event generation: SelectionLookedUp + AnalysisShown at once; AssistanceRequested / PronunciationPlayed / ItemMarked /
 *      AnalysisCorrected when the learner does those things.
 *
 * Every failure path ends in a one-line message and never an exception into the page. Only the newest lookup may show a
 * card or write a record; older ones are superseded. It listens for layout changes only while a card is open. It holds
 * no token and no learner id: events carry a placeholder identity and the background replaces it.
 */
import type { LayoutChange, PopupAnchor, ReaderAdapter, ReaderContext, ReaderSelection, SelectionFailure } from '../contract/readerAdapter';
import { describePage } from '../adapters';
import { chooseAdapter } from '../adapters';
import type { CardModel } from '../parser/cardModel';
import type { ParseContext, ParseInput } from '../parser';
import type { CardUI, DismissReason } from '../popup/card';
import { initialView, type CardActions, type CardView, type CorrectionInput, type LayerName, type PlayOutcome } from '../popup/view';
import { LookupTimer, type MetricsRow, type PerfLike } from '../metrics';
import {
  buildAnalysisShownEvent, buildAssistanceEvent, buildCorrectionEvent, buildNoPackEvent, buildPronunciationEvent, buildSavedEvent, buildSelectionEvent,
  type Identity, type InteractionContext,
} from '../store';
import type { LookupTrigger } from '../platform';
import { languageNameOf, type ProfileReply, type PublicStatus } from '../protocol';
import { unitIds } from '../../../repository-contract/src';
import type { ContentServices, EventSink, MetricSink } from './services';
import type { GoEvent } from '../../../repository-contract/src';

export interface ControllerDeps {
  doc: Document;
  adapters: ReaderAdapter[];
  parse: (input: ParseInput) => CardModel;
  ui: CardUI;
  /** Where events go: the background (through the bridge) in the real script, a memory store in tests. */
  store: EventSink;
  metrics: MetricSink;
  /** The background's services (profile, gloss, explanations, status, corrections). Absent = a card with the analyser's own information only. */
  services?: ContentServices;
  /** The languages this build can analyse. */
  analysers?: string[];
  /** The placeholder identity written into events; the background replaces it. */
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
  | { status: 'shown'; card: CardModel; recorded: 'recorded' | 'duplicate' | 'failed'; settled: Promise<void> }
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
  private currentDepth: 'label' | 'brief' | 'explanatory' = 'brief';

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

      // the extension's state (language of the enrolment, whether a pack exists) is asked for while the selection is read
      const statusP: Promise<PublicStatus | undefined> = this.d.services ? this.d.services.status().catch(() => undefined) : Promise.resolve(undefined);
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

      // the language of the enrolment decides whether there is anything to analyse with; with no answer the default (Albanian) stands
      const status = await statusP;
      if (!live()) return { status: 'superseded' };
      const languageId = status?.languageId ?? 'sq';
      const analysers = this.d.analysers ?? ['sq'];
      if (!analysers.includes(languageId)) {
        return await this.noAnalysis({ languageId, packAvailable: status?.packAvailable === true, adapter, sel, timer, anchor: usedFallbackText ? fixed : safe(() => adapter.anchor(sel.range)) ?? fixed, my });
      }

      const parseCtx: ParseContext = {
        kind: ctx.kind, confidence: ctx.confidence, reason: ctx.reason, sentence: ctx.sentence, selStart: ctx.selStart, selEnd: ctx.selEnd,
        direction: sel.direction, pageLanguage: sel.pageLanguage,
      };
      let card: CardModel;
      try { card = this.d.parse({ surface: sel.surface, context: parseCtx }); } catch { return say('parser-error', MESSAGES.parserFailed); }
      timer.mark('parsed');
      if (!live()) return { status: 'superseded' };

      // the source of the selection is read before the card is built so that every interaction can name it
      const sourceP = safeAsync(() => adapter.sourceRef());
      const services = this.d.services;
      const languageName = status?.languageName ?? languageNameOf(languageId);
      const askGloss = !!services && !!card.lemma && !card.unconfirmed && card.tokenCount === 1;
      const view: Partial<CardView> = {
        languageName,
        gloss: askGloss ? { state: 'loading', senses: [] } : { state: 'idle', senses: [] },
        profile: services ? { state: 'loading', weak: [] } : { state: 'idle', weak: [] },
        explain: services && (card.features.length || card.constructions.length) ? { state: 'loading', features: [], constructions: [] } : { state: 'idle', features: [], constructions: [] },
      };

      // ── the learner's own interactions with this card ──
      const holder: { ictx?: InteractionContext } = {};
      const record = async (build: (c: InteractionContext) => GoEvent): Promise<boolean> => {
        if (!holder.ictx || this.disposed) return false;
        const res = await this.d.store.append(build({ ...holder.ictx, now: this.now() }));
        return res.ok;
      };
      const layerOf = (l: LayerName) => (c: InteractionContext) => buildAssistanceEvent(c, l, this.currentDepth);
      this.currentDepth = 'brief';
      const actions: CardActions = {
        onLayer: (l) => { void record(layerOf(l)); },
        onPronounced: (p: PlayOutcome) => { void record((c) => buildPronunciationEvent(c, p)); },
        onSave: () => {
          void record((c) => buildSavedEvent(c)).then((ok) => {
            if (my !== this.seq) return;
            if (ok) { this.d.ui.update({ saved: true }); this.d.ui.setFeedback('Saved for review.'); } else this.d.ui.setFeedback('Could not save that. Try again.');
          });
        },
        onCorrect: (c) => { void this.correct(my, card, languageId, holder.ictx, c, record); },
      };

      const anchor = usedFallbackText ? fixed : safe(() => adapter.anchor(sel.range)) ?? fixed;
      this.closeCard('new-lookup');
      this.currentRange = usedFallbackText ? undefined : sel.range;
      this.d.ui.show(card, anchor, { focus: req.focus, view: { ...initialView(languageName), ...view }, actions });
      timer.mark('popupPositioned');
      if (this.currentRange) this.watchLayout(adapter, my);

      // ── beside the card, never blocking it ──
      const metricRef: { row?: MetricsRow; base?: Pick<MetricsRow, 'readerId' | 'contextKind' | 'tokenCount' | 'contextChars' | 'outcome'> } = {};
      const arrived = (phase: 'profileArrived' | 'glossArrived'): void => {
        timer.mark(phase);
        if (metricRef.row) void this.updateMetric(timer, metricRef.row); // the row is already written: add the late mark
      };
      const pending: Array<Promise<void>> = [];
      if (services) {
        pending.push(
          services.profile({ unitIds: card.unitIds, languageId }).then((reply) => {
            if (!live()) return;
            const profile = profileViewFrom(card, reply);
            if (reply?.depth) this.currentDepth = reply.depth;
            this.d.ui.update({ profile, ...(reply?.depth ? { depth: reply.depth, depthOrigin: reply.depthOrigin } : {}) });
            arrived('profileArrived');
          }).catch(() => { if (live()) this.d.ui.update({ profile: { state: 'unavailable', weak: [] } }); }),
        );
        if (askGloss) {
          pending.push(
            services.gloss({ lemma: card.lemma!, pos: card.pos, languageId }).then((reply) => {
              if (!live()) return;
              const gloss: CardView['gloss'] = reply?.found
                ? { state: 'ready', senses: reply.senses, attribution: reply.attribution }
                : reply ? { state: 'none', senses: [], message: reply.message } : { state: 'error', senses: [] };
              this.d.ui.update({ gloss });
              arrived('glossArrived');
            }).catch(() => { if (live()) this.d.ui.update({ gloss: { state: 'error', senses: [] } }); }),
          );
        }
        if (view.explain?.state === 'loading') {
          pending.push(
            services.explain({ languageId, pos: card.pos, features: Object.fromEntries(card.features.map((f) => [f.key, f.value])), constructionIds: card.constructions.map((c) => c.id) }).then((reply) => {
              if (!live()) return;
              this.d.ui.update({ explain: reply && reply.ok ? { state: reply.source === 'pack' ? 'ready' : 'none', features: reply.features, constructions: reply.constructions } : { state: 'none', features: [], constructions: [] } });
            }).catch(() => { /* the analyser's own labels stay */ }),
          );
        }
      }
      const settled = Promise.allSettled(pending).then(() => undefined);

      // first information on screen = next paint; the events are written in parallel
      const frame = (this.d.nextFrame ?? defaultFrame(this.d.doc))().then(() => { timer.mark('firstInfoShown'); });
      try { await this.d.ready; } catch { /* the identity keeps its placeholder */ }
      const source = await sourceP;
      if (!live()) { await frame; return { status: 'superseded' }; }
      const base: InteractionContext = {
        card, source, readerId: adapter.id, identity: this.d.identity, version: this.d.version, sessionId: this.d.sessionId,
        now: this.now(), direction: sel.direction,
      };
      const event = buildSelectionEvent(base);
      holder.ictx = { ...base, selectionEventId: event.id };
      const res = await this.d.store.append(event);
      // layer 1 was shown: the second event of every card
      await this.d.store.append(buildAnalysisShownEvent({ ...holder.ictx, now: this.now() }, ['identification']));
      timer.mark('eventQueued');
      await frame;
      const recorded = res.ok ? (res.duplicate ? 'duplicate' : 'recorded') : 'failed';
      if (live()) this.d.ui.setRecorded(recorded);
      metricRef.base = { readerId: adapter.id, contextKind: card.context.kind, tokenCount: card.tokenCount, contextChars: card.context.sentenceChars ?? card.surface.length, outcome: 'shown' };
      metricRef.row = await this.pushMetric(timer, metricRef.base, (row) => { metricRef.row = row; });
      if (Object.keys(timer.t).length > Object.keys(metricRef.row.t).length) await this.updateMetric(timer, metricRef.row);
      return { status: 'shown', card, recorded, settled };
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
  private now(): Date { return (this.d.now ?? (() => new Date()))(); }

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

  /** The enrolment's language has no analyser or pack in this build: say so, and record only the lookup. */
  private async noAnalysis(p: { languageId: string; packAvailable: boolean; sel: ReaderSelection; adapter: ReaderAdapter; timer: LookupTimer; anchor: PopupAnchor; my: number }): Promise<LookupOutcome> {
    const name = languageNameOf(p.languageId);
    const reason = p.packAvailable ? 'no-analyser' : 'no-pack';
    const message = p.packAvailable
      ? `The ${name} pack exists, but this version of the reader bundles only the Albanian analyser, so there is no analysis to show. The lookup was counted; nothing else was recorded.`
      : `There is no GoLearn pack for ${name} yet, so there is no analysis to show. The lookup was counted; nothing else was recorded.`;
    this.closeCard('replaced');
    this.d.ui.showMessage(message, p.anchor, 'info');
    const source = await safeAsync(() => p.adapter.sourceRef());
    if (p.my !== this.seq) return { status: 'superseded' };
    const ev = buildNoPackEvent({ surface: p.sel.surface, languageId: p.languageId, readerId: p.adapter.id, identity: this.d.identity, version: this.d.version, sessionId: this.d.sessionId, now: this.now(), source, direction: p.sel.direction, reason });
    await this.d.store.append(ev);
    p.timer.mark('eventQueued');
    await this.pushMetric(p.timer, { readerId: p.adapter.id, contextKind: 'n/a', tokenCount: 0, contextChars: p.sel.surface.length, outcome: 'failed', failure: reason });
    return { status: 'message', reason, message };
  }

  /** "This analysis is wrong": the correction event first (durable, works offline), then the proposal to the shared word list through the background. */
  private async correct(my: number, card: CardModel, languageId: string, ictx: InteractionContext | undefined, c: CorrectionInput, record: (build: (x: InteractionContext) => GoEvent) => Promise<boolean>): Promise<void> {
    const ui = this.d.ui;
    if (!ictx || !card.formId) return;
    const lexemeId = unitIds.lexeme(languageId, c.lemma, c.pos);
    const reason = c.fromAlternative ? 'chose another reading of this form' : 'typed the lemma';
    ui.update({ correction: { state: 'sending' } });
    const stored = await record((x) => buildCorrectionEvent(x, { formId: card.formId!, correctedLexemeId: lexemeId, reason }));
    let reply: Awaited<ReturnType<ContentServices['correct']>>;
    try { reply = await this.d.services?.correct({ formId: card.formId, languageId, lexemeId, reason, ...(card.context.sentenceKey ? { sentenceKey: card.context.sentenceKey } : {}) }); } catch { reply = undefined; }
    if (my !== this.seq) return;
    if (!stored && !reply?.posted) { ui.update({ correction: { state: 'error', message: 'Could not save your correction. Try again.' } }); return; }
    if (reply?.posted) { ui.update({ correction: { state: 'sent', message: 'Correction sent. It is a proposal until a reviewer checks it.' } }); return; }
    const why = reply?.reason === 'not-connected' ? ' Connect GoLearn to send it.' : reply?.reason === 'needs-sign-in' ? ' Sign in again to send it.' : reply?.reason === 'offline' ? ' It could not be sent now.' : reply?.reason === 'refused' ? ' The service did not accept it.' : '';
    ui.update({ correction: { state: 'saved-locally', message: `Saved on this device.${why}` } });
  }

  private closeCard(reason: DismissReason): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.currentRange = undefined;
    if (this.d.ui.isOpen()) this.d.ui.dismiss(reason);
  }

  private async pushMetric(timer: LookupTimer, part: Pick<MetricsRow, 'readerId' | 'contextKind' | 'tokenCount' | 'contextChars' | 'outcome'> & { failure?: string }, onRow?: (row: MetricsRow) => void): Promise<MetricsRow> {
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
    onRow?.(row); // known before the write starts, so a mark that arrives during the write is not lost
    try { await this.d.metrics.append(row); } catch { /* metrics are best effort */ }
    return row;
  }

  /** A mark that arrived after the row was written (the learner model, the dictionary): the same row, rewritten with the new marks. */
  private async updateMetric(timer: LookupTimer, row: MetricsRow): Promise<void> {
    row.t = timer.t;
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

/** The learner-model line and the weak constructions, from the background's reply. */
export function profileViewFrom(card: CardModel, reply: ProfileReply | undefined): CardView['profile'] {
  if (!reply || !reply.ok) return { state: 'unavailable', weak: [] };
  if (!reply.connected) return { state: 'not-connected', weak: [] };
  const rows = reply.rows ?? {};
  const primary = card.itemIds.find((i) => i.startsWith('lemma:')) ?? card.formId ?? card.itemIds[0];
  const row = (primary ? rows[primary] : undefined) ?? (card.formId ? rows[card.formId] : undefined);
  const met = row?.dimensions.exposure?.observations ?? 0;
  const rr = row?.dimensions.readingRecognition;
  const recognition: NonNullable<CardView['profile']['recognition']> = rr && rr.observations > 0
    ? { level: rr.score < 0.4 ? 'low' : rr.score < 0.7 ? 'medium' : 'high', confidence: rr.confidence }
    : 'not-assessed';
  const weak = card.constructions.filter((c) => { const g = rows[c.unitId]?.dimensions.grammaticalUnderstanding; return !!g && g.negative > g.positive; }).map((c) => c.id);
  // an answer that carries an error is not evidence of "never met": without a cached row for the word, the model was not consulted
  if (reply.error && !row) return { state: 'unavailable', weak, reason: reply.error === 'needs-sign-in' ? 'needs-sign-in' : reply.error === 'offline' ? 'offline' : 'error' };
  return { state: 'ready', met, recognition, weak, ...(reply.stale ? { stale: true } : {}) };
}

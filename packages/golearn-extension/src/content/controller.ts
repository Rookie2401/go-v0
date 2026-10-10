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
import type { AnySourceReference, LayoutChange, PopupAnchor, ReaderAdapter, ReaderContext, ReaderSelection, SelectionFailure } from '../contract/readerAdapter';
import { WORD_LIST_MISSING, type LanguageEvidence, type LanguageResolution, type ResolveLanguage, type SegmentFor } from '../contract/language';
import { describePage } from '../adapters';
import { chooseAdapter, registryEntry } from '../adapters';
import type { CardModel } from '../parser/cardModel';
import type { ParseContext, ParseInput } from '../parser';
import type { CardUI, DismissReason } from '../popup/card';
import { initialView, type CardActions, type CardView, type CorrectionInput, type LayerName, type PlayOutcome } from '../popup/view';
import { LookupTimer, type MetricsRow, type PerfLike } from '../metrics';
import {
  buildAnalysisShownEvent, buildAssistanceEvent, buildCorrectionEvent, buildMarkEvent, buildNoPackEvent, buildPronunciationEvent, buildSavedEvent, buildSelectionEvent,
  type StoredSourceRef, type Identity, type InteractionContext,
} from '../store';
import type { LookupTrigger } from '../platform';
import { languageNameOf as knownLanguageName, type KnowledgeView, type ProfileReply, type PublicStatus, type SelfMark } from '../protocol';
import { unitIds } from '../../../repository-contract/src';
import type { ContentServices, EventSink, MetricSink } from './services';
import type { GoEvent } from '../../../repository-contract/src';
import type { LanguageAdapter, PartOfSpeech } from '../../../../src/core';
import { buildParadigm, etymologyOf, pickRecord, pronunciationOf, relationsOf, sensesOf, type LexicalRecord } from './enrich';

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
  /** Decides the language of a selection from evidence (src/language implements it; content/index.ts injects it). Absent: `defaultResolveLanguage`, which trusts declared metadata only. */
  resolveLanguage?: ResolveLanguage;
  /**
   * Brings a language's analyser into memory (content/index.ts imports `analysers/<id>.js`). Absent = every analyser is already
   * linked in (tests, a harness without chunks). Must be idempotent; a rejection is shown to the learner as a failed load.
   */
  loadAnalyser?: (languageId: string) => Promise<void>;
  /** True when the language's analyser is already in memory (no load, no "loading" message). Absent with a `loadAnalyser` = not loaded. */
  hasAnalyser?: (languageId: string) => boolean;
  /** The dictionary spellings of a lemma in a loaded language (normalised, with the analyser's variants), sent with the gloss request because the worker does not carry that analyser. */
  glossForms?: (lemma: string, pos: string | undefined, languageId: string) => string[];
  /** The sentence cutter of a language (its pack's). Absent or undefined for a language = the adapter's own default. */
  segmenterFor?: SegmentFor;
  /** The loaded analyser of a language (its generation and tag map feed the deeper sections). Absent = no generated paradigm. */
  analyserOf?: (languageId: string) => LanguageAdapter | undefined;
}

/** What the controller knows about how the language of a lookup was decided. Metadata only. */
export interface LanguageInfo {
  languageId?: string;
  varietyId?: string;
  basis: LanguageResolution['basis'];
  confidence: number;
  reasons: string[];
  /** Which declaration decided it (`html-lang`, `opf` ...), when the basis is a declaration. Recorded as `payload.language.source`. */
  source?: string;
  /** Only when the language is undetermined: the installed languages the learner may choose from. */
  languageChoice?: Array<{ languageId: string; name: string }>;
}

/** The card model plus how its language was decided. */
export type LookupCard = CardModel & { language?: LanguageInfo };

/**
 * The fallback resolver, used only when none is injected (content/index.ts injects `src/language`'s real one). It trusts
 * declared metadata only: the learner's override, then what the book declares, then what the page declares near the
 * selection, then the enrolment's language; with none of those it says `undetermined` rather than guess.
 */
export const defaultResolveLanguage: ResolveLanguage = (e: LanguageEvidence): LanguageResolution => {
  if (e.override) return { languageId: e.override, confidence: 1, basis: 'override', reasons: ['chosen by the learner'] };
  if (e.bookLanguage && e.bookLanguage.confidence >= 0.5) {
    return { languageId: e.bookLanguage.languageId, confidence: e.bookLanguage.confidence, basis: 'book-metadata', reasons: [`the book declares it (${e.bookLanguage.source})`] };
  }
  if (e.documentLanguage && e.documentLanguage.confidence >= 0.5) {
    return { languageId: e.documentLanguage.languageId, confidence: e.documentLanguage.confidence, basis: 'document-metadata', reasons: [`the page declares it (${e.documentLanguage.source})`] };
  }
  if (e.teamDefault) return { languageId: e.teamDefault, confidence: 0.4, basis: 'team-default', reasons: ['nothing declares the language; the enrolment language was used'] };
  return { confidence: 0, basis: 'undetermined', reasons: ['nothing declares the language and no default is set'] };
};

export interface LookupRequest {
  trigger: LookupTrigger;
  /** The browser's own copy of the selected text (context-menu lookups), used only when the page's selection cannot be read. */
  selectionText?: string;
  focus?: boolean;
  /** The learner's explicit language for this lookup (wins over every other evidence). */
  languageOverride?: string;
}

export type LookupOutcome =
  | { status: 'shown'; card: LookupCard; recorded: 'recorded' | 'duplicate' | 'failed'; settled: Promise<void> }
  | { status: 'message'; reason: string; message: string; language?: LanguageInfo; languageChoice?: Array<{ languageId: string; name: string }> }
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
  private languageOverride: string | undefined;

  constructor(private readonly d: ControllerDeps) {}

  get isEnabled(): boolean { return this.enabled; }

  /** The learner chose a language for what they read here ("this is Albanian"): used by every later lookup until cleared with `undefined`. */
  setLanguageOverride(languageId: string | undefined): void { this.languageOverride = languageId; }

  /** GoLearn Active: a selection lookup still waiting in the debounce is dropped (a click lookup of the same word is about to run). */
  cancelPendingLookup(): void { clearTimeout(this.debounce); }

  private readonly recordListeners = new Set<(event: GoEvent) => void>();
  /** Be told of every event this controller recorded successfully (GoLearn Active refreshes a word's underline after the learner marks it). Returns the unsubscribe. */
  onRecorded(fn: (event: GoEvent) => void): () => void { this.recordListeners.add(fn); return () => { this.recordListeners.delete(fn); }; }
  private notifyRecorded(event: GoEvent): void { for (const fn of this.recordListeners) { try { fn(event); } catch { /* a listener never breaks a lookup */ } } }

  /**
   * GoLearn Active: the language of the page, decided exactly as a lookup decides it (the learner's override, the book's or the
   * page's declaration, detection against the installed packs, never a guess) from a short sample of its visible text. The sample
   * is evidence for the resolver only; it is not kept and not sent. A language this build cannot analyse is reported as undetermined.
   */
  async resolvePageLanguage(sample: string): Promise<LanguageResolution> {
    const adapter = this.pickAdapter();
    if (adapter.id === 'unsupported') return { basis: 'undetermined', confidence: 0, reasons: ['the reader is not supported'] };
    const status: PublicStatus | undefined = this.d.services ? await this.d.services.status().catch(() => undefined) : undefined;
    const analysers = this.d.analysers ?? ['sq'];
    const installed = status?.installedLanguages ? analysers.filter((l) => status.installedLanguages!.includes(l) || l === status.languageId) : analysers;
    const surface = sample.normalize('NFC').replace(/\s+/gu, ' ').trim();
    const sel: ReaderSelection = { ok: true, surface, range: this.doc().createRange(), direction: 'unknown', directionSource: 'none', snapped: false, frame: 'top' };
    const res = await this.resolveLanguageOf(adapter, sel, status, installed, undefined);
    if (res.languageId && !analysers.includes(res.languageId)) return { ...res, languageId: undefined, varietyId: undefined, basis: 'undetermined', reasons: [...res.reasons, `this build has no analyser for ${res.languageId}`] };
    return res;
  }

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

      // the language of THIS selection: the learner's choice, what the book or the page declares, the enrolment's language
      const status = await statusP;
      if (!live()) return { status: 'superseded' };
      const analysers = this.d.analysers ?? ['sq'];
      const installed = status?.installedLanguages ? analysers.filter((l) => status.installedLanguages!.includes(l) || l === status.languageId) : analysers;
      const resolution = await this.resolveLanguageOf(adapter, sel, status, installed, req.languageOverride);
      if (!live()) return { status: 'superseded' };
      const language: LanguageInfo = { languageId: resolution.languageId, varietyId: resolution.varietyId, basis: resolution.basis, confidence: resolution.confidence, reasons: resolution.reasons, ...(resolution.source ? { source: resolution.source } : {}) };
      if (resolution.basis === 'undetermined' || !resolution.languageId) {
        return await this.undetermined({ language, analysers: installed, adapter, timer, anchor: usedFallbackText ? fixed : safe(() => adapter.anchor(sel.range)) ?? fixed, my });
      }
      const languageId = resolution.languageId;
      const langMetric = { languageId, languageBasis: resolution.basis, languageConfidence: resolution.confidence };

      // the analyser: Albanian is linked in; any other language is loaded now (once per page), and the learner is told while it loads
      let analyserLoadMs: number | undefined;
      if (analysers.includes(languageId) && this.d.loadAnalyser && !(this.d.hasAnalyser?.(languageId) ?? false)) {
        const name = languageNameOf(languageId);
        const at = usedFallbackText ? fixed : safe(() => adapter.anchor(sel.range)) ?? fixed;
        this.closeCard('replaced');
        this.d.ui.showMessage(`Loading the ${name} analyser…`, at, 'info');
        const clock = this.d.perf ?? performance;
        const t0 = clock.now();
        let loadError = false;
        try { await this.d.loadAnalyser(languageId); } catch { loadError = true; }
        if (!live()) return { status: 'superseded' };
        analyserLoadMs = Math.round((clock.now() - t0) * 100) / 100;
        if (loadError || !(this.d.hasAnalyser?.(languageId) ?? true)) {
          const message = `GoLearn could not load the ${name} analyser, so it will not guess. Check your connection to the extension (reload the page) and select again.`;
          this.closeCard('replaced');
          this.d.ui.showMessage(message, at, 'info');
          this.stampLanguage(language);
          void this.pushMetric(timer, { readerId: adapter.id, contextKind: 'n/a', tokenCount: 0, contextChars: 0, outcome: 'failed', failure: 'analyser-load-failed', analyserLoadMs, ...langMetric });
          return { status: 'message', reason: 'analyser-load-failed', message, language };
        }
      }

      // context: only as much as the adapter's declaration allows, and never more than it claims
      const capsNow = safe(() => adapter.capabilities()) ?? caps;
      let ctx: ReaderContext = { kind: 'none', confidence: 0, reason: 'the reader does not provide sentence context' };
      if (!usedFallbackText && capsNow.sentenceContext !== 'none') {
        const segmenter = safe(() => this.d.segmenterFor?.(languageId));
        const got = await safeAsync(() => adapter.context(sel.range, { languageId, ...(segmenter ? { segmenter } : {}) }));
        if (!live()) return { status: 'superseded' };
        ctx = got ? this.reconcile(got, capsNow.sentenceContext, capsNow.contextConfidence) : { kind: 'none', confidence: 0, reason: 'context extraction failed' };
      } else if (usedFallbackText) ctx = { kind: 'none', confidence: 0, reason: 'the selection is inside a frame this script cannot read' };
      timer.mark('contextExtracted');

      if (!analysers.includes(languageId)) {
        return await this.noAnalysis({ languageId, language, packAvailable: status?.packAvailable === true, adapter, sel, timer, anchor: usedFallbackText ? fixed : safe(() => adapter.anchor(sel.range)) ?? fixed, my, langMetric });
      }

      const parseCtx: ParseContext = {
        kind: ctx.kind, confidence: ctx.confidence, reason: ctx.reason, sentence: ctx.sentence, selStart: ctx.selStart, selEnd: ctx.selEnd,
        direction: sel.direction, pageLanguage: sel.pageLanguage,
      };
      let card: LookupCard;
      try { card = this.d.parse({ surface: sel.surface, context: parseCtx, languageId }); } catch { return say('parser-error', MESSAGES.parserFailed); }
      card.language = language;
      timer.mark('parsed');
      if (!live()) return { status: 'superseded' };

      // the source of the selection is read before the card is built so that every interaction can name it
      const sourceP = safeAsync(() => adapter.sourceRef());
      const append = async (ev: GoEvent) => { const r = await this.d.store.append(ev); if (r.ok) this.notifyRecorded(ev); return r; };
      const services = this.d.services;
      const languageName = status && status.languageId === languageId ? status.languageName : languageNameOf(languageId);
      // the dictionary is asked for EVERY single-word selection (2026-10-10): a word the small word list does not know is exactly the
      // word a learner looks up, and the dictionary follows an inflected form to its headword itself; the guessed lemma is a hint, not a gate
      const askGloss = !!services && card.tokenCount === 1 && !!card.surface.trim();
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
        const res = await append(build({ ...holder.ictx, now: this.now() }));
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
        onRate: (mark: SelfMark) => {
          void record((c) => buildMarkEvent(c, mark)).then((ok) => {
            if (my !== this.seq) return;
            if (ok) { this.d.ui.update({ rated: mark }); this.d.ui.setFeedback(mark === 'learning' ? 'Marked as new to you.' : mark === 'known' ? 'Marked as recognised.' : 'Marked as one you can use.'); }
            else this.d.ui.setFeedback('Could not save that. Try again.');
          });
        },
      };

      const anchor = usedFallbackText ? fixed : safe(() => adapter.anchor(sel.range)) ?? fixed;
      this.closeCard('new-lookup');
      this.currentRange = usedFallbackText ? undefined : sel.range;
      this.d.ui.show(card, anchor, { focus: req.focus, view: { ...initialView(languageName), ...view }, actions });
      this.stampLanguage(language);
      timer.mark('popupPositioned');
      if (this.currentRange) this.watchLayout(adapter, my);

      // ── beside the card, never blocking it ──
      const metricRef: { row?: MetricsRow; base?: Pick<MetricsRow, 'readerId' | 'contextKind' | 'tokenCount' | 'contextChars' | 'outcome'> & { analyserLoadMs?: number } & LanguageMetric } = {};
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
            this.d.ui.update({ profile, ...(profile.selfMark ? { rated: profile.selfMark } : {}), ...(reply?.depth ? { depth: reply.depth, depthOrigin: reply.depthOrigin } : {}) });
            arrived('profileArrived');
          }).catch(() => { if (live()) this.d.ui.update({ profile: { state: 'unavailable', weak: [] } }); }),
        );
        // the forms the dictionary should try: the lemma's spellings when there is a confident lemma, then the surface as written and lower-cased
        const surfaceForms = [...new Set([card.surface.trim(), card.surface.trim().toLowerCase()])].filter(Boolean);
        const lemmaForms = askGloss && card.lemma ? safe(() => this.d.glossForms?.(card.lemma!, card.pos, languageId)) ?? [] : [];
        const forms = askGloss ? [...new Set([...(card.lemma && !card.unconfirmed ? lemmaForms : []), ...surfaceForms, ...(card.lemma && card.unconfirmed ? lemmaForms : [])])].slice(0, 8) : [];
        if (askGloss) {
          pending.push(
            services.gloss({ lemma: card.lemma && !card.unconfirmed ? card.lemma : card.surface.trim(), pos: card.pos, languageId, ...(forms.length ? { forms } : {}) }).then((reply) => {
              if (!live()) return;
              const gloss: CardView['gloss'] = reply?.found
                ? { state: 'ready', senses: reply.senses, attribution: reply.attribution }
                : reply ? { state: 'none', senses: [], message: reply.message } : { state: 'error', senses: [] };
              this.d.ui.update({ gloss });
              arrived('glossArrived');
            }).catch(() => { if (live()) this.d.ui.update({ gloss: { state: 'error', senses: [] } }); }),
          );
        }
        // Level 2 (Linguistic Engine V2): the dictionary's full record, merged with the analyser's generation into the deeper sections; never blocks the card
        if (services.entry && card.tokenCount === 1) {
          this.d.ui.update({ enrichment: { state: 'loading' } });
          pending.push(
            services.entry({ lemma: card.lemma && !card.unconfirmed ? card.lemma : card.surface.trim(), pos: card.pos, languageId, ...(forms.length ? { forms } : {}) }).then((reply) => {
              if (!live()) return;
              if (!reply || !reply.ok) { this.d.ui.update({ enrichment: { state: 'unavailable', message: reply?.message ?? 'The dictionary could not be asked for the full entry.' } }); return; }
              const adapter = this.d.analyserOf?.(languageId);
              const record = pickRecord(reply.found ? (reply.records as LexicalRecord[]) : [], card.pos);
              const hint = { features: Object.fromEntries(card.features.map((f) => [f.key, f.value])), surface: card.surface };
              const paradigm = card.lemma && card.pos ? buildParadigm(adapter, languageId, card.lemma, card.pos as PartOfSpeech, record, hint) : undefined;
              this.d.ui.update({ enrichment: {
                state: 'ready', paradigm, etymology: etymologyOf(record), pronunciation: pronunciationOf(record, card.pronunciation), relations: relationsOf(record), senses: sensesOf(record),
                ...(reply.attribution ? { attribution: reply.attribution } : {}), ...(reply.reason && !reply.found ? { message: reply.message ?? reply.reason } : {}),
              } });
            }).catch(() => { if (live()) this.d.ui.update({ enrichment: { state: 'unavailable', message: 'The dictionary could not be asked for the full entry.' } }); }),
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
      const gotSource = await sourceP;
      const source = sourceRefForEvent(gotSource, adapter.id);
      if (!live()) { await frame; return { status: 'superseded' }; }
      const base: InteractionContext = {
        card, source, readerId: adapter.id, identity: this.d.identity, version: this.d.version, sessionId: this.d.sessionId,
        now: this.now(), direction: sel.direction, language,
      };
      const event = buildSelectionEvent(base);
      holder.ictx = { ...base, selectionEventId: event.id };
      const res = await append(event);
      // layer 1 was shown: the second event of every card
      await append(buildAnalysisShownEvent({ ...holder.ictx, now: this.now() }, ['identification']));
      timer.mark('eventQueued');
      await frame;
      const recorded = res.ok ? (res.duplicate ? 'duplicate' : 'recorded') : 'failed';
      if (live()) this.d.ui.setRecorded(recorded);
      metricRef.base = { readerId: adapter.id, contextKind: card.context.kind, tokenCount: card.tokenCount, contextChars: card.context.sentenceChars ?? card.surface.length, outcome: 'shown', ...(analyserLoadMs !== undefined ? { analyserLoadMs } : {}), ...langMetric };
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
  private async noAnalysis(p: { languageId: string; language: LanguageInfo; packAvailable: boolean; sel: ReaderSelection; adapter: ReaderAdapter; timer: LookupTimer; anchor: PopupAnchor; my: number; langMetric?: LanguageMetric }): Promise<LookupOutcome> {
    const name = languageNameOf(p.languageId);
    const reason = p.packAvailable ? 'no-analyser' : 'no-pack';
    const message = p.packAvailable
      ? `The ${name} pack exists, but this version of the reader does not bundle its analyser, so there is no analysis to show. The lookup was counted; nothing else was recorded.`
      : `There is no GoLearn pack for ${name} yet, so there is no analysis to show. The lookup was counted; nothing else was recorded.`;
    this.closeCard('replaced');
    this.d.ui.showMessage(message, p.anchor, 'info');
    this.stampLanguage(p.language);
    const got = await safeAsync(() => p.adapter.sourceRef());
    if (p.my !== this.seq) return { status: 'superseded' };
    const ev = buildNoPackEvent({ surface: p.sel.surface, languageId: p.languageId, readerId: p.adapter.id, identity: this.d.identity, version: this.d.version, sessionId: this.d.sessionId, now: this.now(), source: sourceRefForEvent(got, p.adapter.id), direction: p.sel.direction, reason, language: p.language });
    await this.d.store.append(ev);
    p.timer.mark('eventQueued');
    await this.pushMetric(p.timer, { readerId: p.adapter.id, contextKind: 'n/a', tokenCount: 0, contextChars: p.sel.surface.length, outcome: 'failed', failure: reason, ...p.langMetric });
    return { status: 'message', reason, message, language: p.langMetric ? { languageId: p.langMetric.languageId, basis: p.langMetric.languageBasis, confidence: p.langMetric.languageConfidence, reasons: [] } : undefined };
  }

  /** Ask the resolver which language the selection is in, from the page's and the book's declarations plus the enrolment's language. */
  private async resolveLanguageOf(adapter: ReaderAdapter, sel: ReaderSelection, status: PublicStatus | undefined, installed: string[], requestOverride: string | undefined): Promise<LanguageResolution> {
    const declared = safe(() => adapter.languageEvidence?.()) ?? {};
    const override = requestOverride ?? this.languageOverride;
    const evidence: LanguageEvidence = {
      ...declared,
      ...(override ? { override } : {}),
      sample: sampleAround(sel),
      teamDefault: status?.languageId ?? 'sq',
      installed: [...installed],
    };
    const resolve = this.d.resolveLanguage ?? defaultResolveLanguage;
    let out = safe(() => resolve(evidence));
    // detection compares the sample with the word lists of the installed packs; a list that is not loaded yet is loaded and the resolver asked again
    if (out && out.basis !== 'override' && out.reasons.some((r) => WORD_LIST_MISSING.test(r)) && this.d.loadAnalyser) {
      const missing = installed.filter((l) => !(this.d.hasAnalyser?.(l) ?? true));
      if (missing.length) {
        await Promise.allSettled(missing.map((l) => this.d.loadAnalyser!(l)));
        out = safe(() => resolve(evidence)) ?? out;
      }
    }
    const result: LanguageResolution = out ?? { basis: 'undetermined', confidence: 0, reasons: ['the language resolver failed'] };
    // which declaration decided it, when one did: the evidence's own label (never page text)
    const source = result.source ?? (result.basis === 'book-metadata' ? evidence.bookLanguage?.source : result.basis === 'document-metadata' ? evidence.documentLanguage?.source : undefined);
    return source ? { ...result, source } : result;
  }

  /** Say how the language was decided on the card's host element, for the popup layer and for tests; nothing else of the page is touched. */
  private stampLanguage(info: LanguageInfo): void {
    const h = this.d.ui.host();
    if (!h) return;
    h.setAttribute('data-language-basis', info.basis);
    if (info.languageId) h.setAttribute('data-language-id', info.languageId); else h.removeAttribute('data-language-id');
  }

  /** Nothing declared the language and there is no default: say so honestly and offer the installed languages. Never guess. */
  private async undetermined(p: { language: LanguageInfo; analysers: string[]; adapter: ReaderAdapter; timer: LookupTimer; anchor: PopupAnchor; my: number }): Promise<LookupOutcome> {
    const languageChoice = p.analysers.map((id) => ({ languageId: id, name: languageNameOf(id) }));
    const names = languageChoice.map((c) => c.name).join(', ');
    // the resolver's reasons are plain words about the evidence (never page text): shown so a learner can tell why, and tell us
    const why = p.language.reasons.slice(-2).map((r) => r.replace(/\s+/g, ' ').trim()).filter(Boolean).join('; ');
    const message = `GoLearn cannot tell which language this is, and will not guess. Choose one${names ? ` (${names})` : ''} and select again.${why ? ` Why: ${why}.` : ''}`;
    this.closeCard('replaced');
    this.d.ui.showMessage(message, p.anchor, 'info');
    this.stampLanguage(p.language);
    await this.pushMetric(p.timer, { readerId: p.adapter.id, contextKind: 'n/a', tokenCount: 0, contextChars: 0, outcome: 'failed', failure: 'language-undetermined', languageBasis: 'undetermined', languageConfidence: p.language.confidence });
    if (p.my !== this.seq) return { status: 'superseded' };
    return { status: 'message', reason: 'language-undetermined', message, language: { ...p.language, languageChoice }, languageChoice };
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

  private async pushMetric(timer: LookupTimer, part: Pick<MetricsRow, 'readerId' | 'contextKind' | 'tokenCount' | 'contextChars' | 'outcome'> & { failure?: string; analyserLoadMs?: number } & Partial<LanguageMetric>, onRow?: (row: MetricsRow) => void): Promise<MetricsRow> {
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

/** The language fields a metrics row carries beside MetricsRow's own: how the language was decided, never the text. */
export interface LanguageMetric { languageId: string; languageBasis: LanguageResolution['basis']; languageConfidence: number }

/**
 * What the adapter says about the source, as the source an event carries. A Scripture reference becomes the `scripture` member:
 * `provider` from the registry id of the adapter, `languageId` from the translation's language hint, `url` (path and passage query,
 * Scripture sites only) and `confidence` from the adapter (0.9 when the URL and the verse markup agreed, 0.6 otherwise). Every member
 * carries the registry entry's `restrictions` (the adapter's, else the entry's by adapter id): trusted configuration, never the page's.
 * Metadata only, never the verse text.
 */
export function sourceRefForEvent(got: AnySourceReference | undefined, adapterId: string): StoredSourceRef | undefined {
  if (!got) return undefined;
  const entryRestrictions = registryEntry(adapterId)?.restrictions;
  if (got.kind === 'scripture') {
    const restrictions = got.restrictions ?? entryRestrictions;
    return {
      kind: 'scripture',
      provider: adapterId === 'biblegateway' || adapterId === 'youversion' ? adapterId : 'other',
      translationId: got.translationId,
      ...(got.languageHint ? { languageId: got.languageHint } : {}),
      book: got.book, chapter: got.chapter,
      ...(got.verse !== undefined ? { verse: got.verse } : {}),
      ...(got.url ? { url: got.url } : {}),
      confidence: got.confidence ?? 0.6,
      ...(restrictions ? { restrictions: { ...restrictions } } : {}),
    };
  }
  if (got.restrictions || !entryRestrictions) return got;
  return { ...got, restrictions: { ...entryRestrictions } };
}

/** The protocol's name for a language, else the browser's English name for it (`en` -> English), else the id. */
function languageNameOf(id: string): string {
  const known = knownLanguageName(id);
  if (known !== id) return known;
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(id) ?? id; } catch { return id; }
}

const SAMPLE_CHARS = 400;
const SAMPLE_BLOCKS = new Set(['P', 'LI', 'DD', 'DT', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'FIGCAPTION', 'CAPTION', 'TD', 'TH', 'ARTICLE', 'SECTION', 'MAIN', 'DIV', 'BODY']);

/**
 * The text the language resolver detects from: the selected word plus up to 400 characters of the block around it, so that one
 * clicked word on a mislabelled page can still be recognised from its neighbours. Read from the page for this purpose only,
 * never kept, never sent (the resolver is pure). A selection with no live range (the browser's own copy of a frame's text, or
 * the page-level sample) gives its own surface.
 */
function sampleAround(sel: ReaderSelection): string {
  const start = sel.range?.startContainer;
  if (!start || start.nodeType === 9 /* a document: no live range */) return sel.surface;
  let el: Element | null = start.nodeType === 1 ? (start as Element) : start.parentElement;
  let best: Element | null = null;
  for (let depth = 0; el && depth < 8; el = el.parentElement, depth++) {
    if (SAMPLE_BLOCKS.has(el.tagName.toUpperCase())) { best = el; if ((el.textContent ?? '').length >= 80) break; }
  }
  const text = (best?.textContent ?? '').replace(/\s+/gu, ' ').trim();
  if (text.length < sel.surface.length + 20) return sel.surface;
  if (text.length <= SAMPLE_CHARS) return text;
  // keep the window around the selected word when the block is long
  const at = text.indexOf(sel.surface);
  const from = Math.max(0, (at < 0 ? 0 : at) - Math.floor(SAMPLE_CHARS / 2));
  return text.slice(from, from + SAMPLE_CHARS);
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
  // no account: the device's own Repository answered (`source: 'device'`); its rows count exactly as the account's would
  if (!reply.connected && reply.source !== 'device') return { state: 'not-connected', weak: [] };
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
  // the learner's own latest mark, over the word's rows (lemma and form)
  const marks = [primary, card.formId].filter((id): id is string => !!id).map((id) => rows[id]?.selfMark).filter((m): m is NonNullable<KnowledgeView['selfMark']> => !!m).sort((a, b) => (a.at < b.at ? 1 : -1));
  return { state: 'ready', met, recognition, weak, ...(reply.stale ? { stale: true } : {}), ...(marks[0] ? { selfMark: marks[0].mark } : {}) };
}

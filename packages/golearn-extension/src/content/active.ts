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
 *  - nothing leaves the device but unit ids (normalised single words), nothing is kept beyond the tab; after a short
 *    stable visible dwell, each newly exposed word is recorded as a weak encounter, while seeing an underline alone is not;
 *  - the page's DOM is never changed: underlines are CSS custom highlights, and where that API is missing there are
 *    none (click-to-look-up still works and the state says so).
 */
import type { LanguageAdapter } from '../../../../src/core';
import { chooseAdapter, describePage, entryRefuses, registryEntry, type ReaderRegistryEntry } from '../adapters';
import { createHighlighter, type Highlighter } from '../active/highlight';
import { levelOfRows, type ActiveLevel } from '../active/levels';
import { applyConfirmations, createScanner, formsToConfirm, type Confirmations, type ScanToken, type Scanner } from '../active/scan';
import { LANGUAGE_SCRIPT, planPage, wordInScript, type LatinVerdict } from '../active/pageLanguages';
import { languageNameOf } from '../protocol';
import { GOLEARN_HOST_ATTR, type ReaderAdapter } from '../contract/readerAdapter';
import { MAX_CONFIRM_FORMS, isUnitId, type ConfirmFormsReply, type KnowledgeView, type ProfileReply } from '../protocol';
import type { GoEvent } from '../../../repository-contract/src';
import type { CardUI } from '../popup/card';
import type { LookupController } from './controller';

export interface ActiveDeps {
  doc: Document;
  controller: LookupController;
  adapters: ReaderAdapter[];
  ui: CardUI;
  /** The learner model, through the background. Absent (no extension context): nothing is underlined and the state says why. */
  profile?: (unitIds: string[], languageId: string) => Promise<ProfileReply | undefined>;
  /**
   * The dictionary's forms index, through the background (2026-10-27): which of these normalised forms (the words the analyser could not
   * confirm) does the language's dictionary have? Absent: the analyser's word list alone decides, as before.
   */
  confirmForms?: (forms: string[], languageId: string) => Promise<ConfirmFormsReply | undefined>;
  /** Records the units newly seen in an explicitly enabled Active scan. */
  recordEncounter?: (event: GoEvent) => Promise<unknown>;
  buildEncounter?: (ids: string[], languageId: string, readerId: string) => GoEvent;
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
  /** The language with the most words read on the page (kept for older callers); `languages` lists every language found, most words first. */
  languageId?: string;
  languages?: string[];
  /** Why nothing is scanned or marked, when that is so. */
  reason?: string;
  /** Word tokens found in the last scan, and how many are marked per level. */
  scanned: number;
  marked: Record<ActiveLevel, number>;
  /** Words of the last scan the active language's analyser did not know (another language's words, names): left alone, neither underlined nor recorded (2026-10-25). */
  skipped?: number;
  /** Of the last scan's words, those the analyser did not know but the dictionary did (they are marked and recorded like any analysed word), and those the dictionary was asked about and did not have (they stay in `skipped`). */
  confirmed?: number;
  unconfirmed?: number;
  /** Milliseconds the last scan spent on the page (reading and tokenising), without the learner-model wait. */
  scanMs?: number;
  /** Milliseconds waiting for the learner model in the last scan. */
  profileMs?: number;
  /** Lookups made by clicking a word. */
  clicks: number;
  /** Distinct visible word forms acknowledged by the recorder in this activation. */
  recordedWords?: number;
}

const SAMPLE_CHARS = 1200;
interface PendingEncounter { groups: string[][]; languageId: string; readerId: string; tokens: ScanToken[] }
/** The language a scanned token was read in (its form id says it: `form:<language>:<form>`). */
const langOf = (t: ScanToken): string => t.ids[0]?.split(':')[1] ?? '';
/** After a question the dictionary could not answer (unreachable), the next one waits this long. */
const CONFIRM_RETRY_MS = 15_000;
const CONFIRM_OFFLINE = 'The dictionary could not be reached, so only the course word list underlines words.';
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
  /** Unit ids looked up on this page (a clicked word): shown at least Seen at once, before the model has folded the lookup. */
  private readonly looked = new Set<string>();
  private readonly tokensByDoc = new WeakMap<Document, ScanToken[]>();
  private listeners: Array<() => void> = [];
  private observers: MutationObserver[] = [];
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private encounterTimer: ReturnType<typeof setTimeout> | undefined;
  /** Words waiting for the dwell before they are recorded as met, per language (a page may hold several). */
  private readonly pendingEncounters = new Map<string, PendingEncounter>();
  /** The learner's languages this page may be read in, the page's Latin-script language when it rests on evidence, and what the last scan found. */
  private installed: string[] = [];
  private pageLatin: string | undefined;
  private languages: string[] = [];
  private ready = false;
  private planCache = new WeakMap<Element, { text: string; verdict: LatinVerdict }>();
  private nodeLanguages = new WeakMap<Text, string[]>();
  private scanning: Promise<void> | undefined;
  private rescanWanted = false;
  private last: Pick<ActiveState, 'scanned' | 'marked' | 'skipped' | 'confirmed' | 'unconfirmed' | 'scanMs' | 'profileMs'> = { scanned: 0, marked: noMarks() };
  private clicks = 0;
  private readonly encountered = new Set<string>();
  private offRecord: (() => void) | undefined;
  /** Counts the events recorded from this page; an answer asked for before one of them was recorded may not include it (see `consult`). */
  private epoch = 0;
  private readonly refetch = new Set<string>();
  /** What the dictionary said about each form id asked on this tab: the lemma id, or null = not in the dictionary. Never asked twice. */
  private readonly confirmed = new Map<string, string | null>();
  /** Languages whose dictionary can say nothing on this tab (no pack, no forms index there): not asked again. */
  private readonly confirmOff = new Set<string>();
  /** The dictionary could not be reached: shown as the tab's reason until a question gets through; asked again after `confirmRetryAt` (per language). */
  private confirmReason: string | undefined;
  private readonly confirmRetryAt = new Map<string, number>();

  constructor(private readonly d: ActiveDeps) {}

  get state(): ActiveState {
    const top = this.highlighters.get(this.d.doc);
    const supported = top ? top.supported : createHighlighter(this.d.doc).supported;
    return { on: this.on, speak: this.speak, supported, languageId: this.languageId, ...(this.languages.length ? { languages: [...this.languages] } : {}), reason: this.reason, clicks: this.clicks, recordedWords: [...this.encountered].filter((id) => id.startsWith('form:')).length, ...this.last };
  }

  /** Switch Active on for this page (idempotent; a second call only updates `speak`). */
  async start(opts: { speak: boolean }): Promise<ActiveState> {
    this.speak = opts.speak;
    if (this.on) return this.state;
    this.on = true;
    this.reason = undefined;
    // one switch: with Active on, a selection the learner makes is looked up too (the per-tab switch folded into Active, 2026-10-09)
    this.d.controller.enable();
    // the learner pressed a level on a word's card: forget what the model said about it and read the page again at once. A word looked up
    // (the click that opened its card) has just been met: a New word is Seen now, so the page is read again a moment later (a few quick
    // clicks are one scan). The device holds the event before this is called, so the new answer includes it.
    this.offRecord = this.d.controller.onRecorded((e) => {
      if (e.kind !== 'ItemMarked' && e.kind !== 'SelectionLookedUp') return;
      // a clicked word is Seen at once, whatever the answer says until the model has folded the lookup (met only in passing is shown as New)
      // (a mark made afterwards supersedes it: a New mark is released only by a LATER meeting)
      if (e.kind === 'ItemMarked') for (const id of e.subject?.itemIds ?? []) this.looked.delete(id);
      if (e.kind === 'SelectionLookedUp') for (const id of e.subject?.itemIds ?? []) { this.looked.delete(id); this.looked.add(id); if (this.looked.size > 500) this.looked.delete(this.looked.values().next().value as string); }
      this.epoch++;
      for (const id of e.subject?.itemIds ?? []) this.rows.delete(id);
      if (e.kind === 'ItemMarked') { clearTimeout(this.debounce); void this.rescan(); }
      else { clearTimeout(this.debounce); this.debounce = setTimeout(() => { void this.rescan(); }, Math.min(this.d.debounceMs ?? 150, 100)); }
    });

    const adapter = chooseAdapter(describePage(this.d.doc), this.d.adapters);
    const entry = registryEntry(adapter.id);
    if (adapter.id === 'unsupported' || !entry || entryRefuses(entry)) {
      this.reason = entry?.refusal ?? 'GoLearn does not read this page. Nothing was scanned.';
      return this.state;
    }
    this.entry = entry;
    this.scanner = createScanner({ doc: this.d.doc, adapterOf: this.d.adapterOf, containers: entry.site?.containers, ignore: entry.site?.ignore, viewport: this.d.viewport ?? 'visible' });

    // every language of the learner's that the page holds is read (2026-11-09): which words are in which language is decided per word and
    // per block (active/pageLanguages.ts). The page's own Latin-script language, when it rests on evidence (the page declares it, the learner
    // chose it here, the text shows it; never the selected language alone), is what a block too short to tell is read in.
    this.installed = await this.d.controller.pageLanguages();
    if (!this.on) return this.state;
    const latinSample = this.latinSample();
    if (latinSample && this.installed.some((l) => LANGUAGE_SCRIPT[l] === 'Latn')) {
      const res = await this.d.controller.resolvePageLanguage(latinSample);
      if (!this.on) return this.state;
      if (res.languageId && res.basis !== 'team-default' && LANGUAGE_SCRIPT[res.languageId] === 'Latn') this.pageLatin = res.languageId;
    }
    this.ready = true;
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
    this.offRecord?.(); this.offRecord = undefined;
    clearTimeout(this.debounce);
    clearTimeout(this.encounterTimer);
    this.encounterTimer = undefined;
    this.pendingEncounters.clear();
    for (const off of this.listeners) off();
    this.listeners = [];
    for (const o of this.observers) o.disconnect();
    this.observers = [];
    for (const h of this.highlighters.values()) h.dispose();
    this.highlighters.clear();
    this.rows.clear();
    this.looked.clear();
    this.encountered.clear();
    this.refetch.clear();
    this.confirmed.clear(); this.confirmOff.clear(); this.confirmReason = undefined; this.confirmRetryAt.clear();
    this.languageId = undefined;
    this.languages = [];
    this.installed = [];
    this.pageLatin = undefined;
    this.ready = false;
    this.planCache = new WeakMap();
    this.nodeLanguages = new WeakMap();
    this.scanner = undefined;
    this.last = { scanned: 0, marked: noMarks() };
  }

  /** Read the viewport again (scroll, resize, a page change). Runs one scan at a time; a request during a scan runs once after it. */
  rescan(): Promise<void> {
    if (!this.on || !this.scanner || !this.ready) return Promise.resolve();
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

  /** The page's Latin-script words, as the evidence for its Latin-script language (other scripts are decided by their script). */
  private latinSample(): string {
    if (!this.scanner) return '';
    let s = '';
    for (const root of this.roots()) {
      for (const n of this.scanner.textNodes(root)) {
        const words = n.data.match(/[\p{Script=Latin}\p{M}'’-]+/gu);
        if (!words) continue;
        s += (s ? ' ' : '') + words.join(' ');
        if (s.length >= SAMPLE_CHARS) return s.slice(0, SAMPLE_CHARS);
      }
    }
    return s;
  }

  private async scanOnce(): Promise<void> {
    const scanner = this.scanner!;
    const clock = this.d.perf ?? performance;
    const t0 = clock.now();
    const rootsNodes = this.roots().map((root) => [root, scanner.textNodes(root)] as const);
    const allNodes = rootsNodes.flatMap(([, nodes]) => nodes);
    const planOpts = { installed: this.installed, adapterOf: (l: string) => this.d.adapterOf(l), pageLatin: this.pageLatin };
    let plan = planPage(allNodes, planOpts, this.planCache);
    if (plan.missing.size && this.d.loadAnalyser) {
      // a language of the learner's appears on the page and its analyser is not loaded yet: load it, then decide again
      await Promise.allSettled([...plan.missing].map((l) => this.d.loadAnalyser!(l)));
      if (!this.on) return;
      plan = planPage(allNodes, planOpts, this.planCache);
    }
    this.nodeLanguages = plan.nodeLanguages;
    const byDoc = new Map<Document, ScanToken[]>();
    for (const [root, nodes] of rootsNodes) {
      const here = new Set(nodes);
      const tokens: ScanToken[] = [];
      for (const [lang, langNodes] of plan.byLanguage) {
        // a mixed-script node is read in each of its scripts' languages; each keeps only its own script's words
        tokens.push(...scanner.tokensIn(langNodes.filter((n) => here.has(n)), lang).filter((t) => wordInScript(t.surface, lang)));
      }
      byDoc.set(root, tokens);
      this.tokensByDoc.set(root, tokens);
    }
    const scanMs = clock.now() - t0;

    // the words the analyser could not confirm are asked of the dictionary BEFORE the learner model is consulted, so a word it has is
    // treated exactly like an analysed one from here on (levels, highlights, encounters)
    // each language's words go to that language's dictionary and learner model
    const all = [...byDoc.values()].flat();
    const byLang = new Map<string, ScanToken[]>();
    for (const t of all) (byLang.get(langOf(t)) ?? byLang.set(langOf(t), []).get(langOf(t))!).push(t);
    const counts = { confirmed: 0, unconfirmed: 0 };
    for (const [lang, tokens] of byLang) {
      const c = await this.confirm(tokens, lang, clock);
      if (!this.on) return;
      counts.confirmed += c.confirmed; counts.unconfirmed += c.unconfirmed;
    }

    // the learner model, for the ids not asked about yet on this tab
    for (const id of this.refetch) this.rows.delete(id); // answers that were asked for before an event of this page was recorded
    this.refetch.clear();
    const t1 = clock.now();
    for (const [lang, tokens] of byLang) {
      const want = new Set<string>();
      for (const t of tokens) if (t.known) for (const id of t.ids) if (!this.rows.has(id)) want.add(id);
      await this.consult([...want], lang);
      if (!this.on) return;
    }
    const profileMs = clock.now() - t1;
    // the languages found, most read words first; the first is the page's main language
    const knownBy = [...byLang].map(([lang, tokens]) => [lang, tokens.filter((t) => t.known).length] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    this.languages = knownBy.map(([lang]) => lang);
    this.languageId = this.languages[0];

    let scanned = 0;
    let skipped = 0;
    const marked = noMarks();
    // with no learner model at all, nothing is marked (every word would be "new" for the wrong reason)
    const modelKnown = !!this.d.profile && [...this.rows.values()].length > 0 || this.rows.size > 0;
    for (const [root, tokens] of byDoc) {
      const byLevel = new Map<ActiveLevel, Range[]>();
      for (const t of tokens) {
        scanned++;
        // a word the active language's analyser does not know (another language's word on the same page, a name) is left alone:
        // not underlined as "new", not recorded as met (2026-10-25: a Hebrew-and-English page read as German underlined every word)
        if (!t.known) { skipped++; continue; }
        if (!modelKnown) continue;
        const level = levelOfRows(t.ids.map((id) => this.rows.get(id) ?? undefined), t.ids.some((id) => this.looked.has(id)));
        let range: Range;
        try { range = root.createRange(); range.setStart(t.node, t.start); range.setEnd(t.node, t.end); } catch { continue; }
        (byLevel.get(level) ?? byLevel.set(level, []).get(level)!).push(range);
        marked[level]++;
      }
      this.highlighterFor(root).apply(byLevel);
    }
    if (this.d.recordEncounter) {
      const groups = [...new Map([...byDoc.values()].flatMap((xs) => xs).filter((t) => t.known).map((t) => {
        const ids = [...new Set(t.ids)].filter((id) => !this.encountered.has(id));
        return [ids.join(','), ids] as const;
      }).filter(([, ids]) => ids.length))].map(([, ids]) => ids);
      if (groups.length) {
        // one encounter event per language (an event names its language)
        for (const lang of new Set(groups.map((g) => g[0]?.split(':')[1] ?? ''))) {
          const mine = groups.filter((g) => (g[0]?.split(':')[1] ?? '') === lang);
          const tokens = all.filter((t) => t.known && langOf(t) === lang && t.ids.some((id) => mine.some((g) => g.includes(id))));
          const old = this.pendingEncounters.get(lang);
          const oldKeys = new Set((old?.groups ?? []).map((g) => g.join(',')));
          this.pendingEncounters.set(lang, { groups: [...(old?.groups ?? []), ...mine.filter((g) => !oldKeys.has(g.join(',')))], languageId: lang, readerId: this.entry?.readerId ?? 'active', tokens: [...(old?.tokens ?? []), ...tokens] });
        }
        clearTimeout(this.encounterTimer);
        this.encounterTimer = setTimeout(() => {
          this.encounterTimer = undefined;
          const pending = [...this.pendingEncounters.values()];
          this.pendingEncounters.clear();
          if (!this.on || this.d.doc.visibilityState === 'hidden') return;
          for (const p of pending) if (p.tokens.some((t) => this.tokenVisible(t))) void this.persistEncounter(p);
        }, 800);
      }
    }
    this.last = { scanned, marked, skipped, confirmed: counts.confirmed, unconfirmed: counts.unconfirmed, scanMs: Math.round(scanMs * 100) / 100, profileMs: Math.round(profileMs * 100) / 100 };
    if (!this.d.profile) this.reason = 'The learner model is not reachable from this page, so nothing is underlined; clicking a word still looks it up.';
    else if (!this.highlighterFor(this.d.doc).supported) this.reason = 'This browser cannot draw the underlines (no CSS highlight API); clicking a word still looks it up.';
    else if (!this.languages.length && scanned === 0) {
      const names = this.installed.map((l) => languageNameOf(l)).join(', ');
      this.reason = `GoLearn found no words in your languages${names ? ` (${names})` : ''} on this page, so nothing is underlined.`;
    } else this.reason = this.confirmReason;
  }

  /**
   * Ask the background's dictionary about the unconfirmed words not asked about yet (once per form per tab, at most MAX_CONFIRM_FORMS to a
   * message), then apply every answer held so far to the tokens (a re-scan, or a node whose text changed, asks nothing). A hit becomes
   * a known word with a lemma id; a form the index lacks is remembered as `null` and stays skipped. A reply with a `reason` is
   * not an answer about the words: no `null` is remembered (they are asked again later), and the reason is kept for the tab's reason text.
   */
  private async confirm(tokens: ScanToken[], languageId: string, clock: { now(): number }): Promise<{ confirmed: number; unconfirmed: number }> {
    const ask = this.d.confirmForms;
    if (ask && !this.confirmOff.has(languageId) && clock.now() >= (this.confirmRetryAt.get(languageId) ?? 0)) {
      const prefix = `form:${languageId}:`;
      const want = formsToConfirm(tokens, languageId, this.confirmed);
      for (let i = 0; i < want.length; i += MAX_CONFIRM_FORMS) {
        const ids = want.slice(i, i + MAX_CONFIRM_FORMS);
        let reply: ConfirmFormsReply | undefined;
        try { reply = await ask(ids.map((id) => id.slice(prefix.length)), languageId); } catch { reply = undefined; }
        if (!this.on) return { confirmed: 0, unconfirmed: 0 };
        if (!reply || !reply.ok || typeof reply.forms !== 'object' || !reply.forms) { this.confirmRetryAt.set(languageId, clock.now() + CONFIRM_RETRY_MS); break; }
        for (const id of ids) {
          // a form missing from the reply was not answered (the worker's compound budget did not reach it): it is asked again on a later scan, not remembered as absent
          if (!Object.prototype.hasOwnProperty.call(reply.forms, id.slice(prefix.length))) continue;
          const row = reply.forms[id.slice(prefix.length)];
          const lemma = Array.isArray(row) && typeof row[0] === 'string' && row[0] ? row[0] : undefined;
          const pos = Array.isArray(row) && typeof row[1] === 'string' && /^[A-Za-z]{1,8}$/.test(row[1]) ? row[1] : undefined;
          const lemmaId = lemma ? `lemma:${languageId}:${lemma}${pos ? ':' + pos : ''}` : undefined;
          if (lemmaId && isUnitId(lemmaId)) this.confirmed.set(id, lemmaId);
          else if (!reply.reason) this.confirmed.set(id, null); // the index answered and does not have the word
        }
        if (reply.reason) {
          if (reply.reason === 'no-pack' || reply.reason === 'no-index') this.confirmOff.add(languageId); // nothing to ask for this language here: today's behaviour, quietly
          else { this.confirmReason = CONFIRM_OFFLINE; this.confirmRetryAt.set(languageId, clock.now() + CONFIRM_RETRY_MS); }
          break;
        }
        this.confirmReason = undefined;
      }
    }
    return applyConfirmations(tokens, this.confirmed as Confirmations);
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
      const epoch = this.epoch;
      let reply: ProfileReply | undefined;
      try { reply = await ask(batch, languageId); } catch { reply = undefined; }
      if (!this.on) return;
      if (!reply || !reply.ok) continue;
      if (reply.error && !Object.keys(reply.rows ?? {}).length) continue; // the model was not consulted: no evidence of "never met"
      for (const id of batch) this.rows.set(id, reply.rows?.[id] ?? null);
      // an event was recorded while this question was out: the answer may not hold it, so these words are asked again next scan
      if (epoch !== this.epoch) for (const id of batch) this.refetch.add(id);
    }
  }

  private attachWatchers(): void {
    const view = this.d.doc.defaultView;
    const later = () => {
      clearTimeout(this.encounterTimer); this.encounterTimer = undefined; this.pendingEncounters.clear();
      clearTimeout(this.debounce); this.debounce = setTimeout(() => { void this.rescan(); }, this.d.debounceMs ?? 150);
    };
    if (view) {
      view.addEventListener('scroll', later, { capture: true, passive: true });
      view.addEventListener('resize', later, { passive: true });
      view.addEventListener('pageshow', later);
      this.listeners.push(() => view.removeEventListener('scroll', later, { capture: true }), () => view.removeEventListener('resize', later), () => view.removeEventListener('pageshow', later));
    }
    // a tab shown for the first time (or again) gets its viewport then: scan once it is visible
    const onVisible = () => { if (this.d.doc.visibilityState !== 'hidden') later(); else { clearTimeout(this.encounterTimer); this.encounterTimer = undefined; this.pendingEncounters.clear(); } };
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

  private tokenVisible(t: ScanToken): boolean {
    try {
      const doc = t.node.ownerDocument;
      const r = doc.createRange(); r.setStart(t.node, t.start); r.setEnd(t.node, t.end);
      const rects = [...r.getClientRects()];
      if (!rects.length) return false;
      const view = doc.defaultView;
      const h = view?.innerHeight ?? 0; const w = view?.innerWidth ?? 0;
      return rects.some((x) => x.width > 0 && x.height > 0 && (h <= 0 || (x.bottom > 0 && x.top < h)) && (w <= 0 || (x.right > 0 && x.left < w)));
    } catch { return false; }
  }

  private async persistEncounter(pending: PendingEncounter): Promise<void> {
    const record = this.d.recordEncounter;
    const build = this.d.buildEncounter;
    if (!record || !build) return;
    for (let i = 0; i < pending.groups.length; i++) {
      if (!this.on || this.d.doc.visibilityState === 'hidden') return;
      const ids = pending.groups[i];
      if (!pending.tokens.some((t) => t.ids.some((id) => ids.includes(id)) && this.tokenVisible(t))) continue;
      let result: unknown;
      try { result = await record(build(ids, pending.languageId, pending.readerId)); } catch { this.retryEncounter(pending, i); return; }
      if (!result || (typeof result === 'object' && 'ok' in result && (result as { ok?: unknown }).ok !== true)) { this.retryEncounter(pending, i); return; }
      for (const id of ids) this.encountered.add(id);
    }
  }

  private retryEncounter(pending: PendingEncounter, from: number): void {
    if (!this.on || this.d.doc.visibilityState === 'hidden') return;
    this.pendingEncounters.set(pending.languageId, { ...pending, groups: pending.groups.slice(from) });
    clearTimeout(this.encounterTimer);
    this.encounterTimer = setTimeout(() => {
      this.encounterTimer = undefined;
      const next = [...this.pendingEncounters.values()]; this.pendingEncounters.clear();
      if (this.on && this.d.doc.visibilityState !== 'hidden') for (const p of next) void this.persistEncounter(p);
    }, 1000);
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
    if (!this.scanner || !this.ready) return;
    // the word is looked up in the language it was read in on this page (a Hebrew word on an Albanian page is Hebrew)
    let token: ScanToken | undefined;
    let languageId: string | undefined;
    for (const lang of this.nodeLanguages.get(point.node as Text) ?? []) {
      const t = this.scanner.tokenAt(point.node as Text, point.offset, lang);
      if (t && wordInScript(t.surface, lang)) { token = t; languageId = lang; break; }
    }
    if (!token || !languageId) {
      // nothing on the page is in one of the learner's languages: the lookup says the language is undetermined, with the choice
      if (!this.languages.length) void this.d.controller.lookup({ trigger: 'click' });
      return;
    }
    let range: Range;
    try { range = root.createRange(); range.setStart(token.node, token.start); range.setEnd(token.node, token.end); } catch { return; }
    try { sel?.removeAllRanges(); sel?.addRange(range); } catch { return; }
    this.clicks++;
    this.d.controller.cancelPendingLookup();
    const out = await this.d.controller.lookup({ trigger: 'click', languageOverride: languageId });
    if (out.status === 'shown' && this.speak) this.d.ui.pronounce();
  }
}

const noMarks = (): Record<ActiveLevel, number> => ({ new: 0, seen: 0, recognized: 0, familiar: 0, known: 0, automatic: 0 });

/** The text node and offset under a point, through whichever API the engine has. */
function caretAt(doc: Document, x: number, y: number): { node: Node; offset: number } | undefined {
  const d = doc as Document & { caretRangeFromPoint?(x: number, y: number): Range | null; caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null };
  try {
    if (typeof d.caretPositionFromPoint === 'function') { const p = d.caretPositionFromPoint(x, y); if (p) return { node: p.offsetNode, offset: p.offset }; }
    if (typeof d.caretRangeFromPoint === 'function') { const r = d.caretRangeFromPoint(x, y); if (r) return { node: r.startContainer, offset: r.startOffset }; }
  } catch { /* no caret under the point */ }
  return undefined;
}

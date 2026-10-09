/**
 * The orientation’s lookup: the REAL parser (`parseSelection`) and the REAL card (`createCardUI`) of the extension,
 * driven on a demonstration paragraph the way the extension drives them on a page (src/content/controller.ts):
 * selection → sentence context → card model → card → encounter event → recorded. Nothing here imitates a popup.
 *
 * The encounter is recorded through the same path as the extension’s own (`AppContext.record`: the message
 * `golearn:record` in the extension, whose recorder attributes it to the learner, else the same event store on this
 * origin), with `producer.surface = 'tutorial'` and evidence quality ‘none’: a demonstration lookup is not evidence of
 * anything about the learner.
 */
import { CONTRACT_VERSION, type GoEvent } from '../../repository-contract/src';
import type { PopupAnchor } from '../src/contract/readerAdapter';
import { parseSelection, type CardModel } from '../src/parser';
import { createCardUI, type CardUI } from '../src/popup/card';
import { buildSelectionEvent } from '../src/store';
import type { AppContext, RecordResult } from './context';

export const TUTORIAL_SURFACE = 'tutorial';
export const TUTORIAL_READER_ID = 'demo-reader';
/** A selection longer than this many words is not a word or phrase lookup. */
const MAX_WORDS = 4;

export interface LookupOutcome {
  card: CardModel;
  recorded: RecordResult;
  event: GoEvent;
  /** The word that was looked up, as the learner selected it. */
  surface: string;
}

export interface TutorialLookup {
  /** Make double-clicking a word inside `paragraph` look it up. Returns the detach function. */
  attach(paragraph: HTMLElement): () => void;
  /** Look up the current selection if it lies inside `paragraph`. The same path the double-click takes. */
  lookup(paragraph: HTMLElement): Promise<LookupOutcome | undefined>;
  /** Select `word` inside `paragraph` programmatically (the keyboard route) and look it up. */
  selectAndLookup(paragraph: HTMLElement, word: string): Promise<LookupOutcome | undefined>;
  ui: CardUI;
  destroy(): void;
}

export interface TutorialLookupOptions {
  ctx: AppContext;
  languageId: string;
  onOutcome(outcome: LookupOutcome): void;
  onMessage?(text: string): void;
}

const TRIM_EDGES = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

export function createTutorialLookup(opts: TutorialLookupOptions): TutorialLookup {
  const { ctx } = opts;
  const doc = ctx.deps.doc;
  const ui = createCardUI({ doc, speech: ctx.deps.speech });
  const sessionId = `tutorial-${ctx.deps.now().getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  let seq = 0;
  const detach: Array<() => void> = [];

  function anchorFor(range: Range): PopupAnchor {
    const w = doc.defaultView;
    const viewport = { width: w?.innerWidth || 1024, height: w?.innerHeight || 768 };
    let r: { top: number; left: number; right: number; bottom: number; width: number; height: number } | undefined;
    try { const b = range.getBoundingClientRect(); r = { top: b.top, left: b.left, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; } catch { r = undefined; }
    if (r && (r.width > 0 || r.height > 0)) return { rect: r, viewport, rtl: false, source: 'range' };
    return { rect: { top: 16, left: viewport.width - 16, right: viewport.width - 16, bottom: 16, width: 0, height: 0 }, viewport, rtl: false, source: 'fallback' };
  }

  async function lookup(paragraph: HTMLElement): Promise<LookupOutcome | undefined> {
    const sel = doc.getSelection();
    if (!sel || sel.rangeCount === 0) return undefined;
    const range = sel.getRangeAt(0);
    if (!paragraph.contains(range.startContainer) || !paragraph.contains(range.endContainer)) return undefined;
    const raw = range.toString().normalize('NFC').replace(/\s+/gu, ' ');
    const surface = raw.replace(TRIM_EDGES, '');
    if (!surface) return undefined;
    if (surface.split(' ').length > MAX_WORDS) { opts.onMessage?.('Select a single word or a short phrase.'); return undefined; }

    const sentence = (paragraph.textContent ?? '').normalize('NFC');
    const pre = doc.createRange();
    pre.selectNodeContents(paragraph);
    pre.setEnd(range.startContainer, range.startOffset);
    const lead = raw.length - raw.replace(/^[^\p{L}\p{N}]+/u, '').length;
    const selStart = pre.toString().normalize('NFC').length + lead;
    const selEnd = selStart + surface.length;

    const my = ++seq;
    const card = parseSelection({
      surface,
      context: { kind: 'sentence', confidence: 1, reason: 'the demonstration passage is shown whole', sentence, selStart, selEnd, direction: 'ltr', pageLanguage: opts.languageId },
    });
    ui.show(card, anchorFor(range));

    const id = await ctx.identity();
    const base = buildSelectionEvent({
      card, source: { kind: 'demo', title: 'GoLearn orientation', locator: '#/tutorial' }, readerId: TUTORIAL_READER_ID,
      identity: { learnerId: id.learnerId, enrolmentId: id.enrolmentId, deviceId: id.deviceId },
      version: ctx.deps.appVersion, sessionId, now: ctx.deps.now(), direction: 'ltr',
    });
    const event: GoEvent = {
      ...base,
      v: CONTRACT_VERSION,
      // the extension’s recorder admits only its own producer (and replaces the identity and device); the web app is its own
      producer: { ...base.producer, app: ctx.inExtension ? 'golearn-ext' : 'golearn-app', surface: TUTORIAL_SURFACE },
      evidence: { quality: 'none', assisted: true },
    };
    const recorded = await ctx.record(event);
    if (my === seq) ui.setRecorded(recorded);
    const outcome: LookupOutcome = { card, recorded, event, surface };
    opts.onOutcome(outcome);
    return outcome;
  }

  function attach(paragraph: HTMLElement): () => void {
    const on = (): void => { void lookup(paragraph); };
    paragraph.addEventListener('dblclick', on);
    const off = (): void => paragraph.removeEventListener('dblclick', on);
    detach.push(off);
    return off;
  }

  async function selectAndLookup(paragraph: HTMLElement, word: string): Promise<LookupOutcome | undefined> {
    const walker = doc.createTreeWalker(paragraph, 4 /* NodeFilter.SHOW_TEXT */);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n as Text;
      const at = text.data.normalize('NFC') === text.data ? text.data.indexOf(word) : text.data.indexOf(word.normalize('NFD'));
      if (at < 0) continue;
      const range = doc.createRange();
      range.setStart(text, at);
      range.setEnd(text, at + (text.data.normalize('NFC') === text.data ? word.length : word.normalize('NFD').length));
      const sel = doc.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      return lookup(paragraph);
    }
    return undefined;
  }

  return {
    attach, lookup, selectAndLookup, ui,
    destroy() { for (const off of detach.splice(0)) off(); ui.destroy(); },
  };
}

/** Whether a looked-up word is the practice target (case- and composition-insensitive). */
export const sameWord = (a: string, b: string): boolean =>
  a.normalize('NFC').replace(TRIM_EDGES, '').toLocaleLowerCase() === b.normalize('NFC').replace(TRIM_EDGES, '').toLocaleLowerCase();

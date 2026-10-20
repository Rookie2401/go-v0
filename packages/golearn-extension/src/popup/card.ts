/**
 * The card: a Shadow DOM popup on a fixed-position host appended to <body>. No page style reaches it and none of its
 * style reaches the page; it never changes the page's text, colours or layout (position: fixed, no reflow). All text
 * that reaches the DOM is set with textContent, never as markup: page text, dictionary glosses and every reply from the
 * background are rendered as text. Dismissed by Escape, a click outside, or the close button. Tab cycles inside the card.
 *
 * THE LOOK is Biblia's word card (the dark Western Canon theme): a "WORD · <language>" kicker with the close, the word large with a quiet speaker
 * after it (GoListen's device provider speaks it; with no device voice the speaker's title says so and nothing else is shown), the meaning in
 * curly quotes with a kicker naming its source, the lemma line when it differs, a quiet "view sources" link-button that opens the list of pages
 * the information came from, then the level meter (six circles, filled up to the current level, its name beside them), the kicker
 * "· N× encounters", and the pills: "Go deeper" ("Less" when open) and the quiet "Report" (the correction form). "Go deeper" opens every
 * grammatical section at once, in this order: Form, Grammar, Syntax, All forms, Meanings, Origin, Word structure, Sentence (the word-by-word
 * list with optional on-demand sentence translation), and last "About this analysis". Opening it is reported through `CardActions`, one call per section.
 *
 * LATER ARRIVALS. The card is shown with what the parser had. The dictionary gloss, the learner-model line and the
 * pack's explanations arrive through `update()`; nothing waits for them. When the learner's grammatical understanding of
 * a construction the form realizes is weak, its hint is moved above the gloss; otherwise the gloss comes first.
 */
import { GOLEARN_HOST_ATTR, type PopupAnchor } from '../contract/readerAdapter';
import { cellOf, cellsWithForm, featureKey, type ParadigmCell, type SegmentationCut } from '../../../../src/core/paradigm';
import { contextLine, type CardModel, type EvidenceLabel } from '../parser/cardModel';
import { languageNameOf, type SelfMark } from '../protocol';
import { KNOWLEDGE_LEVELS, KNOWLEDGE_LEVEL_WORDS } from '../../../repository-contract/src/knowledge-levels';
import { cognateText, etymologyStepText, type StructurePart } from '../content/enrich';
import {
  initialView, LAYER_ORDER, type CardActions, type CardView, type LayerName, type PlayResult, type PronounceAvailability, type Pronouncer,
} from './view';

export type DismissReason = 'escape' | 'outside' | 'close' | 'replaced' | 'page-changed' | 'disposed' | 'new-lookup';
export type RecordStatus = 'pending' | 'recorded' | 'duplicate' | 'failed';

export interface VoiceLike { lang: string; name: string; localService?: boolean }
export interface SpeechLike {
  getVoices(): VoiceLike[];
  speak(utterance: unknown): void;
  cancel(): void;
  addEventListener?(type: 'voiceschanged', cb: () => void): void;
  removeEventListener?(type: 'voiceschanged', cb: () => void): void;
}

export interface CardUIOptions {
  doc?: Document;
  /** The device's speech synthesis, used by the built-in local-voice pronouncer when no `pronouncer` is given. */
  speech?: SpeechLike | null;
  makeUtterance?: (text: string, voice: VoiceLike) => unknown;
  /** The pronouncer (GoListen's device provider in the real content script). */
  pronouncer?: Pronouncer;
  onDismiss?: (reason: DismissReason) => void;
}

export interface Placement { top: number; left: number; placement: 'below' | 'above' }

export interface ShowOptions { focus?: boolean; view?: Partial<CardView>; actions?: CardActions }

export interface CardUI {
  show(card: CardModel, anchor: PopupAnchor, opts?: ShowOptions): Placement;
  /** Merge later-arriving information into the open card. Does nothing when no card is open. */
  update(patch: Partial<CardView>): void;
  showMessage(text: string, anchor: PopupAnchor, kind?: 'info' | 'error'): Placement;
  reposition(anchor: PopupAnchor): Placement | undefined;
  setRecorded(status: RecordStatus): void;
  /** A one-line note about something the learner just did ("Saved for review."). */
  setFeedback(text: string): void;
  /** Speak the open card's word once through its pronouncer, as the Pronounce button would; nothing when no voice exists (GoLearn Active). */
  pronounce(): void;
  dismiss(reason: DismissReason): void;
  isOpen(): boolean;
  host(): HTMLElement | undefined;
  /** The (closed) shadow root, for tests and for the content script's own use only. */
  root(): ShadowRoot | undefined;
  destroy(): void;
}

const MARGIN = 8;
const GAP = 8;
const CARD_WIDTH = 340;
const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Pure placement: below the anchor, flipped above when it does not fit and there is more room above; clamped to the viewport. */
export function computePosition(anchor: PopupAnchor, size: { width: number; height: number }): Placement {
  const { rect, viewport } = anchor;
  const preferred = anchor.rtl ? rect.right - size.width : rect.left;
  const left = clamp(preferred, MARGIN, viewport.width - size.width - MARGIN);
  const below = viewport.height - rect.bottom - GAP - MARGIN;
  const above = rect.top - GAP - MARGIN;
  const placement: 'below' | 'above' = size.height > below && above > below ? 'above' : 'below';
  const rawTop = placement === 'below' ? rect.bottom + GAP : rect.top - GAP - size.height;
  const top = clamp(rawTop, MARGIN, viewport.height - size.height - MARGIN);
  return { top, left, placement };
}

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
/* The lookup card, in the look of Biblia's word card (the dark Western Canon theme): paper, hairline rules, tracked small kickers, gold accent.
   Tokens are Biblia's (src/index.css): paper #16130f, raised #1e1a15, ink #d9cfbe, ink-soft #a89c86, ink-faint #7d7059 (borders and decoration only: it is
   below 4.5:1 on paper, so no text uses it), rule #322b22, rule-strong #453c2f, accent #c8a06a, accent-soft #b98f57. No font file is shipped: the stack
   names EB Garamond (used where the reader has it installed) and falls back to Georgia. Sizes are em, so they follow the card's own 1.05 base, not the page's. */
.card {
  position: fixed; width: min(23em, calc(100vw - ${MARGIN * 2}px)); max-height: min(72vh, 540px); overflow: auto;
  font: 1.05em/1.5 'EB Garamond', Georgia, 'Times New Roman', serif; color: #d9cfbe; background: #16130f;
  -webkit-font-smoothing: antialiased; font-feature-settings: 'kern' 1, 'liga' 1, 'locl' 0;
  border: 1px solid #453c2f; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,.35), 0 12px 32px rgba(0,0,0,.55); padding: 0.7em 1em 0.9em; text-align: start;
  scrollbar-color: #453c2f #16130f; color-scheme: dark;
}
.card:focus { outline: none; }
.label { letter-spacing: 0.16em; text-transform: uppercase; color: #a89c86; font-size: 0.69em; font-weight: 600; }
.top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.wordline { display: flex; align-items: center; gap: 0.35em; margin: 0.2em 0 0.1em; }
.word { font-size: 1.85em; font-weight: 400; line-height: 1.2; margin: 0; overflow-wrap: anywhere; min-width: 0; color: #d9cfbe; }
.say { flex: none; border: 0; background: none; color: #c8a06a; padding: 0.15em 0.3em; line-height: 1; font-size: 1em; }
.say:disabled { opacity: .55; }
.card__gloss { font-size: 1.1em; line-height: 1.4; margin: 0.1em 0 0; color: #d9cfbe; overflow-wrap: anywhere; }
.card__gloss--quote::before { content: '\\201C'; color: #a89c86; }
.card__gloss--quote::after { content: '\\201D'; color: #a89c86; }
.card__gloss.muted { font-size: 0.95em; color: #a89c86; }
.kicker { letter-spacing: 0.12em; text-transform: uppercase; color: #a89c86; font-size: 0.66em; font-weight: 600; margin-top: 0.1em; }
.lemmaLine { display: flex; gap: 0.6em; align-items: baseline; flex-wrap: wrap; margin-top: 0.5em; }
.lemmaLine .lv { font-size: 1.05em; color: #d9cfbe; }
.translit { font-style: italic; color: #a89c86; font-size: 0.95em; line-height: 1.3; }
.wordTranslit { margin: 0 0 0.1em; }
.lemmaLine .translit { font-size: 0.9em; }
.pcell .rom { display: block; font-style: italic; color: #a89c86; font-size: 0.85em; }
.sentenceRom { color: #a89c86; font-style: italic; }
.lemmaLine .pos { font-variant: small-caps; letter-spacing: 0.06em; color: #a89c86; font-size: 0.85em; margin-inline-start: 0.35em; }
.card__text { font-size: 0.9em; line-height: 1.5; color: #a89c86; font-style: italic; margin-top: 0.4em; }
.sub { font-size: 0.78em; line-height: 1.3; margin: 2px 0 0; }
button.sub, .sourcesBtn, .analysisBtn { border: 0; background: none; color: #c8a06a; padding: 0.2em 0; margin-top: 0.35em; letter-spacing: 0.1em; text-transform: uppercase; font-size: 0.74em; font-weight: 600; }
button.sub:hover:not(:disabled), .analysisBtn:hover:not(:disabled) { color: #d9cfbe; }
.sources { margin: 0.3em 0 0; font-size: 0.88em; color: #d9cfbe; }
.sources[hidden], .deeper[hidden] { display: none; }
.sources ul { margin: 0; padding-inline-start: 1.2em; }
.sources a { color: #c8a06a; }
.row.noRule { border-bottom: 0; padding-bottom: 0; }
.row.analysisRow { border-bottom: 0; padding: 0; margin-top: 0.2rem; }
.row.analysisRow .analysisBtn { margin-top: 0; }
.analysis { margin-top: 0.4em; }
.analysis[hidden] { display: none; }
.analysis .layer { margin-top: 0.2em; }
.analysis .label { display: block; margin: 0.3em 0 0.2em; }
details.feat { margin-top: 0.5em; }
details.feat > summary { cursor: pointer; list-style: none; display: block; border: 1px solid #453c2f; border-radius: 6px; background: #1e1a15; color: #d9cfbe; padding: 0.3em 0.7em; }
details.feat > summary::-webkit-details-marker { display: none; }
details.feat > summary::after { content: ' \\25BE'; float: right; color: #a89c86; }
details.feat[open] > summary::after { content: ' \\25B4'; }
details.feat > summary:hover { border-color: #b98f57; }
details.feat > summary:focus-visible { outline: 2px solid #c8a06a; outline-offset: 2px; }
details.feat > .muted { margin: 0.3em 0 0 0.2em; font-size: 0.92em; }
.rate { display: flex; flex-wrap: wrap; gap: 0.4em 0.3em; margin-top: 0.8em; align-items: center; }
.rate .label { flex: 0 0 100%; }
.rateBtn { width: 1.6em; height: 1.6em; flex: none; padding: 0; border-radius: 50%; border: 1px solid #7d7059; background: #1e1a15; font-size: 1em; }
.rateBtn:hover:not(:disabled) { border-color: #b98f57; }
.rateBtn.on { background: #c8a06a; border-color: #c8a06a; }
.levelName { letter-spacing: 0.16em; text-transform: uppercase; color: #c8a06a; font-size: 0.78em; font-weight: 600; margin-inline-start: 0.4em; }
.encounters { letter-spacing: 0.12em; text-transform: uppercase; color: #a89c86; font-size: 0.66em; font-weight: 600; margin-top: 0.5em; min-height: 1.2em; }
.pills { display: flex; gap: 0.5em; align-items: center; margin-top: 0.8em; flex-wrap: wrap; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.4em; border: 1px solid #453c2f; border-radius: 999px; padding: 0.5em 1.1em; color: #d9cfbe; background: #1e1a15; font-size: 0.9em; }
.btn:hover:not(:disabled) { border-color: #b98f57; }
.pills .btn { padding: 0.45em 0.85em; font-size: 0.85em; }
.btn--quiet { border-color: transparent; background: transparent; color: #a89c86; margin-inline-start: auto; }
.btn--quiet:hover:not(:disabled) { border-color: transparent; color: #d9cfbe; }
.deeperBtn::after, .sentenceBtn::after, .variantsBtn::after { content: ' \\25BE'; }
.deeperBtn[aria-expanded="true"]::after, .sentenceBtn[aria-expanded="true"]::after, .variantsBtn[aria-expanded="true"]::after { content: ' \\25B4'; }
.sentenceBox, .variantsBox { margin-top: 0.8em; }
.sentenceBox[hidden], .variantsBox[hidden] { display: none; }
.sentenceBox .more, .variantsBox .more { margin-top: 0; }
table.variants { border-collapse: collapse; width: 100%; margin: 0.4em 0; }
table.variants th, table.variants td { text-align: start; vertical-align: top; padding: 0.25em 0.5em 0.25em 0; border-bottom: 1px solid var(--line, #e3e1dc); font-weight: normal; }
table.variants th { white-space: nowrap; color: var(--muted, #6b6b6b); }
table.variants tr.current th { font-weight: 600; color: inherit; }
table.variants .vform { font-size: 1.1em; }
table.variants .vstatus, table.variants .vnone { color: var(--muted, #6b6b6b); font-size: 0.9em; }
.periodLine { font-size: 0.85em; color: var(--muted, #6b6b6b); margin-top: 0.2em; }
.deeper { margin-top: 0.8em; }
.deeper h3 { margin: 0; padding: 0.8em 0 0.3em; border-top: 1px solid #322b22; letter-spacing: 0.16em; text-transform: uppercase; color: #a89c86; font-size: 0.69em; font-weight: 600; }
.deeper .more { margin-top: 0; border-top: 0; padding-top: 0; }
.deeper .about { color: #a89c86; }
.sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.row { display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: baseline; margin: 0; padding: 4px 0; border-bottom: 1px solid #322b22; }
.k { flex: none; min-width: 5.5em; font-size: 0.7em; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: #a89c86; white-space: nowrap; }
/* a kicker longer than its column pushes the value to the right (or onto the next line); it never runs under it. The spacer of a subscript row repeats the width of the key above it. */
.kpad::before { content: attr(data-pad); visibility: hidden; }
.v { flex: 1 1 13.4em; min-width: 0; overflow-wrap: anywhere; }
.row[data-row="lemma"] .v { color: #c8a06a; font-size: 1.05em; }
.tag { flex: none; margin-inline-start: auto; font-size: 0.64em; letter-spacing: .06em; text-transform: uppercase; padding: 0 5px; border-radius: 999px; border: 1px solid #453c2f; background: #1e1a15; color: #a89c86; white-space: nowrap; }
.muted { color: #a89c86; font-style: italic; }
.actions { display: flex; gap: 6px; margin-top: 0.7em; flex-wrap: wrap; align-items: center; }
table.paradigm { border-collapse: collapse; margin: 4px 0 8px; font-size: 0.92em; max-width: 100%; }
table.paradigm th { font-weight: 600; text-align: left; padding: 2px 8px 2px 0; color: #a89c86; white-space: normal; }
table.paradigm td.pcell { padding: 2px 8px 2px 0; }
table.paradigm td.pcell.sel { font-weight: 600; color: #c8a06a; text-decoration: underline; text-underline-offset: .2em; }
table.paradigm td.pcell.none { color: #a89c86; }
table.paradigm td.pcell.generated { font-style: italic; }
table.paradigm td.pcell.conflicted { color: #f0a090; }
.pmark { margin-left: 3px; font-size: 0.8em; color: #a89c86; }
ol.senses { padding-left: 18px; margin: 4px 0; }
ol.senses li { margin: 2px 0; }
.example { font-style: italic; color: #a89c86; margin-left: 4px; }
.ety { margin: 4px 0; }
.segs { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 4px; margin: 6px 0; }
.seg { display: inline-flex; flex-direction: column; align-items: center; border: 1px solid #453c2f; border-radius: 6px; padding: 2px 8px; }
.seg .role { font-size: 0.66em; letter-spacing: .06em; text-transform: uppercase; color: #a89c86; }
.seg.prefix, .seg.suffix, .seg.ending, .seg.linking, .seg.clitic { border-style: dashed; }
button, input, select { font: inherit; font-size: 0.95em; padding: 0.2em 0.75em; border-radius: 999px; border: 1px solid #453c2f; background: #1e1a15; color: #d9cfbe; }
select { border-radius: 6px; }
button { cursor: pointer; }
button:hover:not(:disabled) { border-color: #b98f57; }
button:disabled { opacity: .5; cursor: not-allowed; }
button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 2px solid #c8a06a; outline-offset: 2px; }
button[aria-expanded="true"] { border-color: #b98f57; }
button.sub[aria-expanded="true"], .sourcesBtn[aria-expanded="true"], .analysisBtn[aria-expanded="true"] { border-color: transparent; }
.close { border: 0; background: none; color: #a89c86; padding: 0 0.3em; font-size: 1.4em; line-height: 1; }
.close:hover:not(:disabled) { color: #d9cfbe; }
.more { margin-top: 10px; padding-top: 2px; font-size: 0.95em; }
.more h4 { margin: 10px 0 2px; font-size: 0.72em; letter-spacing: .14em; text-transform: uppercase; color: #a89c86; font-weight: 600; }
.more ul { margin: 0; padding-inline-start: 18px; }
.more table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
.more th, .more td { text-align: start; vertical-align: top; padding: 2px 6px 2px 0; border-bottom: 1px solid #322b22; }
.more .note { font-size: 0.923em; }
.more .tag { font-size: 0.7em; }
.more th { font-weight: 600; white-space: nowrap; }
.sel { font-weight: 600; }
.status { margin-top: 0.6em; font-size: 0.857em; font-style: italic; color: #a89c86; min-height: 1.2em; }
.feedback { margin-top: 0.4em; font-size: 0.857em; font-style: italic; color: #a89c86; min-height: 1.2em; }
.note { font-size: 0.857em; margin-top: 4px; color: #a89c86; }
.msg { margin: 4px 0; }
.err { color: #f0a090; }
form.fix { margin-top: 0.7em; border-top: 1px solid #322b22; padding-top: 0.5em; font-size: 0.95em; }
form.fix fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
form.fix legend { padding: 0; margin: 0 0 2px; }
form.fix[hidden] { display: none; }
form.fix label { display: block; margin: 2px 0; }
form.fix input[type="text"] { width: 12em; border-radius: 6px; }
`;

type Child = Node | string | null | undefined | false;

/** The sections "Go deeper" shows, in `LAYER_ORDER`. "Sentence" is the word-by-word English rescue list. */
const LAYER_TITLES: Record<LayerName, string> = { morphology: 'Form', grammar: 'Grammar', 'phrase-syntax': 'Syntax', forms: 'All forms', meaning: 'Meanings', origin: 'Origin', structure: 'Word structure', sentence: 'Sentence', variants: 'Variants' };
/** The panels renderPanels fills: the sections of "Go deeper", the sentence (its own pill, "See full sentence") and the variants (its own pill, languages with period varieties only); the three pills are exclusive. */
const PANEL_LAYERS: readonly LayerName[] = [...LAYER_ORDER, 'sentence', 'variants'];
const LAYER_CLASS: Record<LayerName, string> = { morphology: 'l2', 'phrase-syntax': 'l3', grammar: 'l4', sentence: 'l5', forms: 'l6', meaning: 'l7', origin: 'l8', structure: 'l10', variants: 'l11' };
/** The "Variants" rows in plain words. */
const VARIANT_STATUS: Record<string, string> = { attested: 'attested', 'same-as-lemma': 'the same form', 'not-in-sources': 'not in our sources', 'not-yet-existing': 'not yet in the language', obsolete: 'no longer used' };
const STRUCTURE_STATUS: Record<string, string> = { 'supported-by-source': 'From the dictionary: its etymology template names these parts.', provisional: "Provisional: from the analyser's rules only; no dictionary template confirms it." };
const STATUS_MARK: Record<string, string> = { verified: '✓', supported: '◌', generated: '~', conflicted: '‼' };
const STATUS_LABEL: Record<string, string> = { verified: 'both the rules and the dictionary', supported: 'the dictionary only', generated: 'the rules only (unverified)', conflicted: 'the two disagree' };
/** A feature bundle in plain key-value words (`Case Acc, Definite Def, Number Sing`); the pack's labels replace these where the Morphology layer has them. */
const describeFeatures = (f: Record<string, string>): string => Object.keys(f).sort().map((k) => `${k} ${f[k].split(',').join(' / ')}`).join(', ');

// ───────────────────────────── the built-in local pronouncer ─────────────────────────────

/** The device's own voice for the language, nothing remote (used when no GoListen pronouncer is injected). */
export function localSpeechPronouncer(speech: SpeechLike | null, makeUtterance?: (text: string, voice: VoiceLike) => unknown): Pronouncer {
  const make = makeUtterance ?? ((text: string, voice: VoiceLike) => {
    const U = (globalThis as { SpeechSynthesisUtterance?: new (t: string) => { voice?: unknown; lang?: string } }).SpeechSynthesisUtterance;
    if (!U) return undefined;
    const u = new U(text);
    u.voice = voice; u.lang = voice.lang;
    return u;
  });
  const variants = (lang: string): string => (lang === 'sq' ? 'sq|als|alb' : lang);
  const voiceFor = (lang: string): VoiceLike | undefined => {
    try { return speech?.getVoices().find((v) => new RegExp(`^(${variants(lang)})(-|_|$)`, 'i').test(v.lang) && v.localService !== false); } catch { return undefined; }
  };
  return {
    availability(lang): PronounceAvailability {
      if (!speech) return { available: false, note: 'Speech is not available in this browser.' };
      if (voiceFor(lang)) return { available: true, note: 'Practice only: a local system voice, not a checked pronunciation. Nothing is sent anywhere.' };
      return { available: false, note: `No local ${languageNameOf(lang)} voice on this device, so there is nothing to play (remote voices are not used).` };
    },
    play(text, lang): PlayResult {
      const v = voiceFor(lang);
      if (!v || !speech) return { ok: false, message: 'No local voice is available.' };
      const u = make(text, v);
      if (!u) return { ok: false, message: 'Speech is not available in this browser.' };
      speech.cancel(); speech.speak(u);
      return { ok: true, voice: 'synthetic', voiceId: `device:${v.name}` };
    },
    stop() { try { speech?.cancel(); } catch { /* nothing playing */ } },
    onChange(cb) {
      if (!speech?.addEventListener) return () => {};
      speech.addEventListener('voiceschanged', cb);
      return () => speech.removeEventListener?.('voiceschanged', cb);
    },
  };
}

// ───────────────────────────── the card ─────────────────────────────

export function createCardUI(options: CardUIOptions = {}): CardUI {
  const doc = options.doc ?? document;
  const speech = options.speech === undefined ? ((globalThis as { speechSynthesis?: SpeechLike }).speechSynthesis ?? null) : options.speech;
  const pronouncer: Pronouncer = options.pronouncer ?? localSpeechPronouncer(speech, options.makeUtterance);

  let host: HTMLElement | undefined;
  let root: ShadowRoot | undefined;
  let card: HTMLElement | undefined;
  let statusEl: HTMLElement | undefined;
  let feedbackEl: HTMLElement | undefined;
  let open = false;
  let prevFocus: Element | null = null;
  let movedFocus = false;
  let cleanup: Array<() => void> = [];
  let lastAnchor: PopupAnchor | undefined;

  // state of the open card
  let model: CardModel | undefined;
  let view: CardView = initialView('');
  let actions: CardActions = {};
  let parts: {
    rows: HTMLElement; pronNote: HTMLElement; say: HTMLButtonElement; stopAudio?: HTMLButtonElement; audioSpeed?: HTMLSelectElement;
    sources: HTMLElement; sourcesBtn: HTMLButtonElement; deeper: HTMLElement; deeperBtn: HTMLButtonElement; sentenceBox: HTMLElement; sentenceBtn: HTMLButtonElement;
    variantsBox?: HTMLElement; variantsBtn?: HTMLButtonElement; encounters: HTMLElement; levelName: HTMLElement;
    layers: Record<LayerName, HTMLElement>; fix: HTMLFormElement; report: HTMLButtonElement; rateBtns: Record<SelfMark, HTMLButtonElement>;
  } | undefined;
  // `autoPlay`: the render token of a card that should speak once as soon as its voice is known to be available (GoLearn Active's "Speak on click")
  let pron: { available: boolean; note: string; playing: boolean; plays: number; off?: () => void; offPlayback?: () => void; state?: 'idle' | 'playing' | 'paused' | 'ended' | 'error'; pending?: { voice: 'synthetic' | 'recorded'; voiceId?: string }; failed?: boolean; autoPlay?: number } = { available: false, note: '', playing: false, plays: 0 };
  let playbackRate = 1;
  // the ANALYSIS dropdown of the Form section: open or not (kept when the panel is re-filled by a late arrival), and whether its first opening was reported
  let analysisOpen = false;
  let analysisReported = false;
  // the sentence pill's first opening is reported once per card
  let sentenceReported = false;
  let variantsReported = false;
  let renderToken = 0;
  // Voice discovery may be retriggered while the card is open (for example when the browser
  // publishes voiceschanged). Only the newest check may change the speaker state.
  let pronunciationAvailabilityRequest = 0;

  const h = (tag: string, props: Record<string, string> = {}, ...children: Child[]): HTMLElement => {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) el.setAttribute(k, v);
    for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(typeof c === 'string' ? doc.createTextNode(c) : c);
    return el;
  };

  function ensureHost(): void {
    if (host && host.isConnected && root) return;
    host?.remove();
    host = doc.createElement('div');
    host.setAttribute(GOLEARN_HOST_ATTR, '');
    host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; overflow: visible; z-index: 2147483647;';
    root = host.attachShadow({ mode: 'closed' });
    // constructed stylesheets are not subject to the page's style-src CSP; <style> is the fallback
    let adopted = false;
    try {
      const Sheet = (doc.defaultView as unknown as { CSSStyleSheet?: new () => CSSStyleSheet })?.CSSStyleSheet;
      if (Sheet && 'adoptedStyleSheets' in root) {
        const sheet = new Sheet();
        sheet.replaceSync(CSS);
        (root as unknown as { adoptedStyleSheets: CSSStyleSheet[] }).adoptedStyleSheets = [sheet];
        adopted = true;
      }
    } catch { adopted = false; }
    if (!adopted) { const style = doc.createElement('style'); style.textContent = CSS; root.append(style); }
    (doc.body ?? doc.documentElement).append(host);
  }

  function mountCard(inner: HTMLElement, label: string): HTMLElement {
    ensureHost();
    card?.remove();
    card = h('div', { class: 'card', role: 'dialog', 'aria-label': label, tabindex: '-1', 'data-placement': 'below' }, inner);
    card.style.top = '-9999px';
    card.style.left = '0px';
    root!.append(card);
    card.addEventListener('keydown', onCardKey);
    // typing in the correction form must not trigger the page's own shortcuts
    for (const t of ['keyup', 'keypress'] as const) card.addEventListener(t, (e) => { if ((e.target as Element | null)?.tagName === 'INPUT') e.stopPropagation(); });
    return card;
  }

  function measure(): { width: number; height: number } {
    const r = card!.getBoundingClientRect();
    return { width: r.width || card!.offsetWidth || CARD_WIDTH, height: r.height || card!.offsetHeight || 160 };
  }

  function place(anchor: PopupAnchor): Placement {
    const p = computePosition(anchor, measure());
    card!.style.top = `${Math.round(p.top)}px`;
    card!.style.left = `${Math.round(p.left)}px`;
    card!.setAttribute('data-placement', p.placement);
    return p;
  }

  function listen(): void {
    if (cleanup.length) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) dismiss('escape'); };
    const onDown = (e: Event) => {
      if (!open || !host) return;
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      if (path.includes(host) || (e.target instanceof Node && host.contains(e.target))) return;
      dismiss('outside');
    };
    doc.addEventListener('keydown', onKey, true);
    doc.addEventListener('pointerdown', onDown, true);
    cleanup = [() => doc.removeEventListener('keydown', onKey, true), () => doc.removeEventListener('pointerdown', onDown, true)];
  }

  function onCardKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.stopPropagation(); dismiss('escape'); return; }
    if ((e.target as Element | null)?.tagName === 'INPUT') e.stopPropagation();
    if (e.key !== 'Tab' || !root) return;
    const focusables = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')).filter((el) => !el.closest('[hidden]'));
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = root.activeElement as HTMLElement | null;
    if (e.shiftKey && (active === first || active === card)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }

  function closeButton(): HTMLElement {
    const b = h('button', { class: 'close', type: 'button', 'aria-label': 'Close GoLearn card', title: 'Close (Esc)', 'aria-keyshortcuts': 'Escape' }, '×');
    b.addEventListener('click', () => dismiss('close'));
    return b;
  }

  function tag(label: EvidenceLabel): HTMLElement { return h('span', { class: 'tag', title: LABEL_HELP[label] }, label); }

  function row(rowId: string, key: string, value: string, label: EvidenceLabel, muted = false, lang?: string): HTMLElement {
    return h('div', { class: 'row', 'data-row': rowId }, h('span', { class: 'k' }, key), h('span', { class: muted ? 'v muted' : 'v', ...(lang ? { lang } : {}) }, value), tag(label));
  }

  // ───────────── the immediate card ─────────────

  /** The meaning under the word: the lexicon gloss at once, else the dictionary's, else "looking up…" while it is on its way. */
  function meaningText(m: CardModel, v: CardView): { text: string; attr?: string; muted: boolean; from?: string } {
    const dict = v.gloss;
    if (m.gloss) return { text: m.gloss, muted: false, from: 'Course word list' };
    // a dictionary-only meaning carries its attribution beside it (CC BY-SA: the notice goes wherever the entry is shown)
    if (dict.state === 'ready' && dict.senses.length) return { text: dict.senses.slice(0, 3).join('; '), ...(dict.attribution ? { attr: dict.attribution } : {}), muted: false, from: 'Wiktionary' };
    if (dict.state === 'loading') return { text: 'looking up…', muted: true };
    // the reason the dictionary gave nothing is shown ("no dictionary location", "could not be reached" and "not in the dictionary" must not look alike)
    if (dict.state === 'none' || dict.state === 'error') return { text: `${m.provenance === 'none' ? 'Not in the word list' : 'No meaning in the word list'}; ${dict.message ? dict.message.replace(/\.$/, '') : dict.state === 'error' ? 'the dictionary could not be asked' : 'not in the dictionary either'}.`, muted: true };
    return { text: m.provenance === 'none' ? 'Not in the word list.' : 'No meaning given.', muted: true };
  }

  /**
   * The immediate card under the word: the meaning in curly quotes with a kicker naming where it came from, the lemma line when the lemma
   * differs from the word, and a note only when there is something honest to say (a guessed lemma). Nothing else: no confidence, no context.
   */
  function renderRows(): void {
    if (!parts || !model) return;
    const m = model; const v = view;
    const { text, attr, muted, from } = meaningText(m, v);
    const gloss = h('div', { class: muted ? 'meaning card__gloss muted' : 'meaning card__gloss', 'data-row': 'meaning' }, h('span', { class: muted ? '' : 'card__gloss--quote' }, text), attr ? ' ' : null, attr ? h('span', { class: 'kicker attr' }, `(${attr})`) : null);
    const dictRom = v.enrichment.pronunciation?.romanization;
    const sameWord = !m.lemma || m.lemma.normalize('NFC').toLowerCase() === m.surface.normalize('NFC').trim().toLowerCase();
    // the transliteration: the adapter's rule-based romanization first; the dictionary's romanization of the lemma (Level 2) when the adapter has none
    const wordRom = m.transliteration ?? (sameWord && m.tokenCount === 1 ? dictRom : undefined);
    const wordRomSource = m.transliteration ? 'Romanization by the analyser\'s rules' : 'Wiktionary romanization';
    const rows: HTMLElement[] = [];
    if (wordRom) rows.push(h('div', { class: 'translit wordTranslit', role: 'note', 'aria-label': 'transliteration', title: wordRomSource, 'data-row': 'transliteration' }, wordRom));
    rows.push(gloss);
    if (from) rows.push(h('div', { class: 'kicker' }, `Meaning · ${from}`));
    const same = !m.lemma || m.lemma.normalize('NFC').toLowerCase() === m.surface.normalize('NFC').trim().toLowerCase();
    if (!same && m.lemma && m.tokenCount === 1) {
      const lemmaRom = m.lemmaTransliteration ?? dictRom;
      const lemmaRomSource = m.lemmaTransliteration ? 'Romanization by the analyser\'s rules' : 'Wiktionary romanization';
      rows.push(h('div', { class: 'lemmaLine' }, h('span', { class: 'lv', lang: m.languageId }, m.lemma, m.pos ? h('span', { class: 'pos' }, m.pos) : null), lemmaRom ? h('span', { class: 'translit', role: 'note', 'aria-label': 'lemma transliteration', title: lemmaRomSource }, lemmaRom) : null, h('span', { class: 'kicker' }, m.unconfirmed ? 'lemma (guess)' : 'lemma')));
    }
    if (m.unconfirmed && m.tokenCount === 1) rows.push(h('div', { class: 'card__text' }, 'The lemma is a guess from the ending; the word list does not hold this word.'));
    // a language with period varieties: which period this text was read in, and why (the analyser's own basis)
    if (m.period) rows.push(h('div', { class: 'periodLine', 'data-row': 'period', title: m.period.basis }, `Read as ${m.period.label} — ${m.period.basis}`));
    if (m.words.length > 1) {
      const ul = h('ul', {}, ...m.words.map((w) => h('li', {}, h('span', { lang: m.languageId }, w.surface), ': ', w.lemma ? h('span', { lang: m.languageId }, w.lemma) : 'unknown', `${w.gloss ? ` – ${w.gloss}` : ''} (${w.confidence.toFixed(2)})`)));
      rows.push(h('div', { class: 'more-inline' }, ul));
    }
    parts.rows.replaceChildren(...rows);
  }

  /** Only an https address becomes a link; anything else a reply carries is shown as its name. */
  const safeHttps = (url: string | undefined): string | undefined => {
    if (!url) return undefined;
    // an address with credentials (https://user:pw@host/) does not begin with https://host: it is not a link either
    try { const u = new URL(url); return u.protocol === 'https:' && u.href.startsWith(`https://${u.host}`) ? u.href : undefined; } catch { return undefined; }
  };

  /** The "view sources" list: each source with its link and licence; with none, a plain sentence saying so. */
  function renderSources(): void {
    if (!parts) return;
    const list = view.sources ?? [];
    const panel = parts.sources;
    if (!list.length) { panel.replaceChildren(h('div', { class: 'note' }, 'No external source: the course word list only.')); return; }
    const ul = h('ul', {});
    for (const s of list) {
      const url = safeHttps(s.url);
      ul.append(h('li', {}, url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, s.label) : s.label, s.licence ? ` — ${s.licence}` : ''));
    }
    panel.replaceChildren(ul);
    if (view.gloss.attribution) panel.append(h('div', { class: 'note' }, view.gloss.attribution));
  }

  /** "· N× encounters", once the learner model has answered (nothing before, and nothing when it cannot be asked). */
  function renderEncounters(): void {
    if (!parts) return;
    const p = view.profile;
    parts.encounters.textContent = p.state === 'ready' ? `· ${p.encounters ?? p.met ?? 0}× encounters` : '';
  }


  // ───────────── pronunciation ─────────────

  function renderPron(): void {
    if (!parts) return;
    const speakText = model && model.surface.length <= 200 ? model.surface : '';
    parts.say.disabled = !(pron.available && speakText) || pron.playing;
    // the speaker says why it cannot play in its title (no voice on this device, voices still loading); nothing else of that is shown
    parts.say.title = pron.available ? 'Play with GoListen' : pron.note;
    // Playback state is useful context for every learner, so keep the live note visible for
    // availability, preparation, active playback, completion, and failures alike.
    parts.pronNote.textContent = pron.note;
    parts.pronNote.className = 'note pron';
    if (parts.stopAudio) parts.stopAudio.disabled = !pron.playing && pron.state !== 'playing' && pron.state !== 'paused';
    if (parts.audioSpeed) parts.audioSpeed.disabled = !pron.available;
  }

  function completedPronunciation(): void {
    if (!pron.pending) return;
    const outcome = pron.pending;
    pron.pending = undefined;
    const repeated = pron.plays++ > 0;
    pron.note = 'Pronunciation played as practice. It is not listening evidence.';
    try { actions.onPronounced?.({ ok: true, ...outcome, repeated }); } catch { /* reporting never blocks */ }
  }

  /** A synchronous answer (the local voice list) is applied at once; a promised one (GoListen asks the device) when it arrives. */
  function checkPronunciation(token: number): void {
    if (!model) return;
    const request = ++pronunciationAvailabilityRequest;
    const apply = (a: PronounceAvailability | undefined): void => {
      if (token !== renderToken || request !== pronunciationAvailabilityRequest) return;
      pron.available = !!a?.available;
      pron.note = a ? a.note : 'Pronunciation is not available right now.';
      renderPron();
      if (pron.autoPlay === token) { pron.autoPlay = undefined; if (pron.available) onPronounceClick(); }
    };
    let got: PronounceAvailability | Promise<PronounceAvailability>;
    try { got = pronouncer.availability(model.languageId); } catch { apply(undefined); return; }
    if (got instanceof Promise) void got.then(apply, () => apply(undefined)); else apply(got);
  }

  /** Speak the open card's word once, as the speaker beside the word would (now, or as soon as the voice check says a voice exists; nothing when none does). */
  function pronounce(): void {
    if (!model || !open) return;
    if (pron.available) onPronounceClick(); else pron.autoPlay = renderToken;
  }

  let pronunciationRequest = 0;
  function onPronounceClick(): void {
    if (!model) return;
    playPronunciation(model.surface, view.pronunciationContext?.kind ?? (model.tokenCount > 1 ? 'phrase' : 'word'));
  }
  function playPronunciation(input: string, kind: 'word' | 'phrase' | 'sentence'): void {
    if (!model || !pron.available) return;
    const text = input.length <= 5000 ? input : '';
    if (!text) return;
    const lang = model.languageId;
    const token = renderToken;
    const request = ++pronunciationRequest;
    // Clear a previous failure before invoking the provider. Local playback can publish
    // `playing` or `ended` synchronously from play(), so this reset must happen first.
    pron.playing = true;
    pron.failed = false;
    pron.state = 'idle';
    if (pronouncer.onPlaybackState) pron.note = 'Preparing pronunciation…';
    renderPron();
    let result: PlayResult | Promise<PlayResult>;
    try { result = pronouncer.play(text, lang, { ...view.pronunciationContext, kind }); } catch { result = { ok: false, message: 'Pronunciation failed.' }; }
    void Promise.resolve(result).then((r) => r, () => ({ ok: false, message: 'Pronunciation failed.' }) as PlayResult).then((r) => {
      if (token !== renderToken || request !== pronunciationRequest) return;
      pron.playing = false;
      if (r.ok) {
        if (!pronouncer.onPlaybackState || (pron.state !== 'error' && pron.state !== 'idle')) {
          pron.pending = { voice: r.voice, voiceId: r.voiceId };
          if (!pronouncer.onPlaybackState || pron.state === 'ended') completedPronunciation();
        }
      } else {
        pron.note = r.message; // one line; the analysis is untouched
        pron.failed = true;
      }
      renderPron();
    });
  }

  // ───────────── layers 2-5 ─────────────

  const section = (panel: HTMLElement, title: string, items: Array<string | HTMLElement>): void => {
    if (!items.length) return;
    panel.append(h('h4', {}, title));
    const ul = h('ul', {});
    for (const t of items) ul.append(h('li', {}, t));
    panel.append(ul);
  };

  const firstSentence = (s: string): string => (/^(.+?[.!?])(\s|$)/u.exec(s)?.[1] ?? s).trim();

  /**
   * One dropdown per feature of the reading, in the pack's label words: the summary is "Case · accusative" (the label and the value; alternatives the
   * analyser could not choose between stay slash-joined), the body beneath the box is the why: the pack's explanation at the current depth.
   * (Some analysers report the same feature twice, or two values for one key: one dropdown per feature, so a duplicate such as `Number NUM .9` cannot look like two facts.)
   */
  function fillFeatures(panel: HTMLElement, m: CardModel, v: CardView): void {
    if (!m.features.length) {
      panel.append(h('div', { class: 'note' }, m.tokenCount > 1 ? 'Select one word to see its form.' : 'The analyser gave no features for this word.'));
      return;
    }
    const grouped = new Map<string, string[]>();
    for (const f of m.features) {
      const values = f.value.split(',').map((x) => x.trim()).filter(Boolean);
      const prior = grouped.get(f.key) ?? [];
      for (const value of values) if (!prior.includes(value)) prior.push(value);
      grouped.set(f.key, prior);
    }
    for (const [key, values] of grouped) {
      const explanations = values.map((value) => v.explain.features.find((x) => x.key === key && x.value === value));
      const combined = v.explain.features.find((x) => x.key === key &&
        x.value.split(',').map((raw) => raw.trim()).filter(Boolean).length === values.length &&
        x.value.split(',').every((raw) => values.includes(raw.trim())));
      const e = combined ?? explanations.find(Boolean);
      const label = e?.label ?? key;
      const value = combined?.brief ?? values.map((raw, i) => explanations[i]?.brief ?? raw).join(' / ');
      const texts = [...new Set([combined, ...explanations].map((x) => x?.explanation).filter((x): x is string => !!x))];
      const why = v.depth === 'label' ? '' : v.depth === 'brief' ? texts.map(firstSentence).join(' / ') : texts.join(' / ');
      const body = why || (texts.length ? 'Explanations are switched off by the explanation depth (label).' : 'No explanation from the pack for this feature.');
      panel.append(h('details', { class: 'feat' }, h('summary', {}, `${label} · ${value}`), h('div', { class: 'muted' }, body)));
    }
    if ([...grouped.values()].some((values) => values.length > 1)) {
      panel.append(h('div', { class: 'note' }, 'A slash joins alternative values supplied by the analyser; GoLearn has not chosen between them.'));
    }
    if (v.explain.state !== 'ready') panel.append(h('div', { class: 'note' }, 'These are the analyser’s own labels; the pack’s explanations were not available.'));
  }

  /** A line of the Form section: key and value, with no evidence chip (the About block says the readings are machine-drafted). */
  const plainRow = (rowId: string, key: string, value: string, lang?: string): HTMLElement =>
    h('div', { class: 'row', 'data-row': rowId }, h('span', { class: 'k' }, key), h('span', { class: 'v', ...(lang ? { lang } : {}) }, value));

  /**
   * Form: the lemma and part of speech, the essential morphology line, and under it the quiet toggle "analysis" (a disclosure, closed by default).
   * It opens GRAMMAR (the constructions the form realizes) and then one dropdown per feature. No table, no evidence chips.
   */
  function fillForm(panel: HTMLElement, m: CardModel, v: CardView): void {
    const lines: HTMLElement[] = [];
    if (m.lemma) lines.push(plainRow('lemma', m.unconfirmed ? 'lemma (guess)' : 'lemma', m.pos ? `${m.lemma} (${m.pos})` : m.lemma, m.languageId));
    if (m.morphology) lines.push(plainRow('form', 'form', m.morphology));
    // the toggle is a subscript of the last line: no rule between them (the rule after the whole Form block is the next section's)
    lines.at(-1)?.classList.add('noRule');
    const lastKey = lines.at(-1)?.querySelector('.k')?.textContent ?? '';
    panel.append(...lines);
    const btn = h('button', { type: 'button', class: 'analysisBtn', 'aria-expanded': String(analysisOpen), 'aria-controls': 'panel-analysis' }, 'analysis') as HTMLButtonElement;
    const box = h('div', { class: 'analysis', id: 'panel-analysis' });
    if (!analysisOpen) box.setAttribute('hidden', '');
    const grammar = h('div', { class: 'more layer l4', 'data-layer': 'grammar' }, h('span', { class: 'label' }, 'Grammar'));
    fillGrammar(grammar, m, v);
    box.append(grammar);
    fillFeatures(box, m, v);
    btn.addEventListener('click', () => {
      analysisOpen = box.hasAttribute('hidden');
      if (analysisOpen) box.removeAttribute('hidden'); else box.setAttribute('hidden', '');
      btn.setAttribute('aria-expanded', String(analysisOpen));
      if (lastAnchor) place(lastAnchor);
      // the Repository still sees that the grammar was consulted: one event, on the first opening
      if (analysisOpen && !analysisReported) { analysisReported = true; try { actions.onLayer?.('grammar'); } catch { /* reporting never blocks */ } }
    });
    // under the form text, in the value column (an empty key cell holds the kicker column's width), as quiet as "view sources"
    panel.append(h('div', { class: 'row analysisRow' }, h('span', { class: 'k kpad', 'aria-hidden': 'true', 'data-pad': lastKey }), h('span', { class: 'v' }, btn)), box);
  }

  function fillSyntax(panel: HTMLElement, m: CardModel): void {
    section(panel, 'Phrases', m.phrases.map((p) => `${p.display} (${p.kind}${p.gloss ? `: ${p.gloss}` : ''}) · ${p.confidence.toFixed(2)}`));
    section(panel, 'Units and parts', m.syntaxNotes);
    const s = m.syntax;
    if (s && s.status !== 'none') {
      // Stage 4: the relation, why the rules chose it, what else they could not rule out, and the words that hang on this one
      const head = s.headSurface ? ` → ${s.headSurface}` : '';
      section(panel, 'Relation', [`${s.label ?? s.relation}${head} (${s.relation}) · ${(s.confidence ?? 0).toFixed(2)}${s.status === 'conflicted' ? ' · ‼ not decided' : ''}`]);
      if (s.basis.length) section(panel, 'Why', s.basis);
      if (s.alternatives.length) section(panel, 'Also possible', s.alternatives.map((a) => `${a.relation}${a.headSurface ? ` → ${a.headSurface}` : ''} · ${a.confidence.toFixed(2)}: ${a.why}`));
      if (s.dependents.length) section(panel, 'Words that depend on it', s.dependents.map((d) => `${d.surface}: ${d.label} (${d.relation})`));
      if (s.clause) panel.append(h('div', { class: 'note' }, `Clause: ${s.clause}.`));
      for (const n of s.notes) panel.append(h('div', { class: 'note' }, n));
      panel.append(h('div', { class: 'note' }, `Generated by the analyser's rules (${s.analyzer}); ${Math.round(s.attached * 100)}% of this sentence's words were attached. Not reviewed by a person.`));
    } else {
      const roleLine = m.role ? `role: ${m.role}` : s ? 'role: the analyser has syntax rules but could not attach this word' : 'role: not available from this analyser';
      section(panel, 'Relation', [roleLine, ...(m.context.kind === 'none' ? ['Without a sentence there are no neighbouring words to relate this one to.'] : []), ...(s?.notes ?? [])]);
    }
    if (!m.phrases.length && !m.syntaxNotes.length && !m.constructions.length && !s) panel.append(h('div', { class: 'note' }, 'No phrase or construction was found around this word.'));
  }

  function fillGrammar(panel: HTMLElement, m: CardModel, v: CardView): void {
    if (!m.constructions.length) {
      panel.append(h('div', { class: 'note' }, 'No grammar note is attached to this form by the installed pack or the analyser.'));
      return;
    }
    const items: HTMLElement[] = [];
    // a construction the learner's grammar is weak on comes first
    const weakIds = new Set(v.profile.weak);
    const ordered = [...m.constructions].sort((a, b) => Number(weakIds.has(b.id)) - Number(weakIds.has(a.id)));
    for (const c of ordered) {
      const e = v.explain.constructions.find((x) => x.id === c.id);
      const title = e?.title ?? c.title;
      const body = v.depth === 'label' ? '' : v.depth === 'brief' ? (e?.brief ?? firstSentence(c.explanation)) : (e?.explanation ?? c.explanation);
      items.push(h('div', { class: 'row' }, h('span', { class: 'v' }, h('strong', {}, title), body ? ` — ${body}` : '')));
    }
    for (const it of items) panel.append(it);
    panel.append(h('div', { class: 'note' }, `Explanation depth: ${v.depth}${v.depthOrigin === 'settings' || v.depthOrigin === 'explicit' ? ' (your setting)' : ''}.`));
  }

  function fillSentence(panel: HTMLElement, m: CardModel, v: CardView): void {
    panel.append(h('div', { class: 'note' }, 'The list below is word by word. A sentence translation is shown only when you ask for it.'));
    const hasSentence = m.context.kind === 'sentence';
    if (hasSentence && v.pronunciationSentence) {
      const listenSentence = h('button', { type: 'button', class: 'listenSentence' }, 'Listen to sentence') as HTMLButtonElement;
      listenSentence.addEventListener('click', () => playPronunciation(v.pronunciationSentence!, 'sentence'));
      panel.append(listenSentence);
    }
    const translation = v.sentenceTranslation;
    const processing = translation.processingMode ?? 'unknown';
    const referenceResult = translation.state === 'ready' && translation.origin === 'reference';
    const disclosure = referenceResult
      ? 'Exact title reference; no general dialect guarantee.'
      : processing === 'local'
        ? 'Translation uses a local model service; model files may download. Sentence text stays on this device.'
        : processing === 'remote' || processing === 'mixed'
          ? 'The configured provider may send sentence text to a remote service when you ask for translation.'
          : 'The configured provider determines whether sentence text stays on this device or is sent remotely.';
    panel.append(h('div', { class: 'note' }, disclosure));
    const button = h('button', { type: 'button', class: 'translateSentence' }, translation.state === 'loading' ? 'Translating…' : 'Translate sentence to English') as HTMLButtonElement;
    button.disabled = !hasSentence || translation.state === 'loading' || translation.state === 'unavailable';
    button.title = !hasSentence ? 'Sentence context is not available.' : translation.state === 'unavailable' ? (translation.message ?? 'Translation is not available.') : '';
    button.addEventListener('click', () => { try { actions.onTranslateSentence?.(); } catch { /* translation never blocks the card */ } });
    panel.append(h('div', { class: 'actions' }, button));
    if (translation.state === 'unavailable') panel.append(h('div', { class: 'note' }, translation.message ?? 'Sentence translation is unavailable.'));
    else if (translation.state === 'error') panel.append(h('div', { class: 'note err', role: 'alert' }, translation.message ?? 'The sentence could not be translated.'));
    else if (translation.state === 'loading') panel.append(h('div', { class: 'note', role: 'status', 'aria-live': 'polite' }, 'Translating the selected sentence…'));
    else if (translation.state === 'ready') {
      const origin = translation.origin ?? 'machine';
      if (translation.naturalText) {
        panel.append(h('div', { class: 'row' }, h('span', { class: 'k' }, origin === 'reference' ? 'Reference English' : 'Natural English (machine translation)'), h('span', { class: 'v', lang: 'en' }, translation.naturalText)));
      }
      const certainty = translation.sourceConfidence === undefined ? 'uncertain' : `${Math.round(translation.sourceConfidence * 100)}% source-language confidence`;
      const language = [translation.sourceLanguage ?? 'source language unknown', translation.sourceDialect].filter(Boolean).join(' · ');
      if (origin === 'reference') {
        panel.append(h('div', { class: 'note' }, `${translation.attribution ?? 'Exact title reference; no general dialect guarantee.'} Source language: ${language}; ${certainty}${translation.sourceBasis ? ` (${translation.sourceBasis})` : ''}.`));
      } else {
        const generation = translation.generated === false ? '' : ` Generated by ${translation.providerId ?? 'a translation provider'}.`;
        const review = translation.reviewed === true ? ' Reviewed.' : ' Not reviewed.';
        panel.append(h('div', { class: 'note' }, `Source: ${language}; ${certainty}${translation.sourceBasis ? ` (${translation.sourceBasis})` : ''}.${generation}${review} Machine output may be wrong.`));
      }
      for (const note of translation.sourceUncertaintyNotes ?? []) panel.append(h('div', { class: 'note' }, note));
      if (origin !== 'reference' && translation.modelDownload === 'may-start') panel.append(h('div', { class: 'note' }, 'The browser may download a language model for this translation.'));
    }
    if (!m.sentenceWords.length) { panel.append(h('div', { class: 'note' }, 'There is no sentence context, so there is nothing to list.')); return; }
    const ul = h('ul', {});
    for (const w of m.sentenceWords) {
      const rest = `${w.pos ? ` (${w.pos})` : ''}${w.gloss ? ` – ${w.gloss}` : ''}`;
      ul.append(h('li', w.selected ? { class: 'sel' } : {}, h('span', { lang: m.languageId }, w.surface), w.transliteration ? h('span', { class: 'sentenceRom' }, ` (${w.transliteration})`) : null, ': ', w.lemma ? h('span', { lang: m.languageId }, w.lemma) : 'unknown', w.lemma ? rest : ''));
    }
    panel.append(ul);
  }

  // ───────────── the deeper sections (Level 2) ─────────────

  const enrichNote = (panel: HTMLElement, v: CardView): boolean => {
    const e = v.enrichment;
    if (e.state === 'ready') return true;
    panel.append(h('div', { class: 'note' }, e.state === 'loading' ? 'Looking this up in the dictionary…' : e.state === 'unavailable' ? (e.message ?? 'The dictionary could not be asked.') : 'No dictionary service is connected, so there is nothing deeper to show.'));
    return false;
  };

  function fillForms(panel: HTMLElement, m: CardModel, v: CardView): void {
    if (!enrichNote(panel, v)) return;
    const seg = v.enrichment.segmentations;
    if (seg && (seg.alternatives.length || m.tokenCount > 1)) {
      const line = (c: SegmentationCut): string => `${c.words.map((w) => `${w.text}${w.known ? '' : '?'}${w.gloss ? ` (${w.gloss})` : ''}`).join(' | ')} — ${Math.round(c.confidence * 100)}% (${c.basis})`;
      section(panel, 'How this selection cuts into words', [line(seg.chosen), ...seg.alternatives.map(line)]);
      panel.append(h('div', { class: 'note' }, seg.alternatives.length
        ? 'This script writes no spaces between words, so the cut is a reading of its own. Other cuts the word list allows are listed; a ? marks a piece the word list does not hold.'
        : seg.reason ?? 'Only one cut is plausible here.'));
    }
    const p = v.enrichment.paradigm;
    if (!p) {
      const detail = v.enrichment.message ? ` ${v.enrichment.message}` : '';
      panel.append(h('div', { class: 'note' }, m.tokenCount > 1
        ? 'Select one word to see its forms.'
        : `No inflection paradigm is available for this lemma: neither the analyser nor the dictionary supplied a form table.${detail}`));
      return;
    }
    if (p.kind === 'none') {
      panel.append(h('div', { class: 'note' }, p.notes.join(' ') || 'This language does not inflect its words.'));
      if (p.constructions?.length) section(panel, 'Constructions to know instead', p.constructions);
      return;
    }
    const counts = { verified: 0, supported: 0, generated: 0, conflicted: 0 } as Record<string, number>;
    for (const c of p.cells) counts[c.status]++;
    const parts = (Object.keys(counts) as Array<keyof typeof counts>).filter((k) => counts[k]).map((k) => `${counts[k]} ${STATUS_LABEL[k]}`);
    panel.append(h('div', { class: 'note' }, `${p.cells.length} form${p.cells.length === 1 ? '' : 's'}${p.template ? ` · ${p.template}` : ''}: ${parts.join('; ')}.`));
    const selected = new Set<ParadigmCell>();
    if (v.enrichment.selected?.length) {
      // the adapter's own projection of the reading onto its cells (union readings, varieties), computed page-side
      const want = new Set(v.enrichment.selected);
      for (const c of p.cells) if (want.has(featureKey(c.features))) selected.add(c);
    } else {
      const feats = Object.fromEntries(m.features.map((f) => [f.key, f.value]));
      const byFeatures = Object.keys(feats).length ? cellOf(p, feats) : undefined;
      if (byFeatures) selected.add(byFeatures); else for (const c of cellsWithForm(p, m.surface)) selected.add(c);
    }
    const formRom = v.enrichment.formRoman;
    const cellNode = (c: ParadigmCell | undefined): HTMLElement => {
      if (!c) return h('td', { class: 'pcell none' }, '—');
      const text = c.status === 'conflicted' && c.alternatives?.length ? `${c.form} / ${c.alternatives.join(' / ')}` : c.form;
      const sources = c.sources.map((source) => source === 'generated' ? 'analyser rules' : 'dictionary table').join(' + ');
      return h('td', { class: `pcell ${c.status}${selected.has(c) ? ' sel' : ''}`, title: `${STATUS_LABEL[c.status]} (${sources})${c.note ? `; ${c.note}` : ''}` }, h('span', { lang: m.languageId }, text), h('span', { class: 'pmark', 'aria-label': STATUS_LABEL[c.status] }, STATUS_MARK[c.status]), formRom && formRom[c.form] ? h('span', { class: 'rom', title: 'Wiktionary romanization' }, formRom[c.form]) : null);
    };
    const L = p.layout;
    if (L) {
      const sectionKeys = L.sections ?? [];
      // a slot of the layout is named by its section, row and column values; a cell may carry more (a noun's Gender), which does not unplace it
      const layoutKeys = [...sectionKeys, L.rows.key, L.columns.key];
      const cellAt = (want: Record<string, string>): ParadigmCell | undefined => {
        const hits = p.cells.filter((c) => layoutKeys.every((k) => c.features[k] === want[k]));
        return hits.length <= 1 ? hits[0] : (hits.find((c) => featureKey(c.features) === featureKey(want)) ?? hits[0]);
      };
      const combos: Array<Record<string, string>> = [];
      const seen = new Set<string>();
      for (const c of p.cells) {
        const combo: Record<string, string> = {};
        for (const k of sectionKeys) if (c.features[k] !== undefined) combo[k] = c.features[k];
        const key = featureKey(combo);
        if (!seen.has(key)) { seen.add(key); combos.push(combo); }
      }
      for (const combo of combos) {
        const title = sectionKeys.map((k) => (combo[k] !== undefined ? (L.labels?.[k]?.[combo[k]] ?? `${k} ${combo[k]}`) : undefined)).filter(Boolean).join(' · ');
        if (title) panel.append(h('h4', {}, title));
        const table = h('table', { class: 'paradigm' });
        table.append(h('tr', {}, h('th', {}, ''), ...L.columns.values.map(([, label]) => h('th', {}, label))));
        for (const [rv, rlabel] of L.rows.values) {
          const row = h('tr', {}, h('th', {}, rlabel));
          for (const [cv] of L.columns.values) row.append(cellNode(cellAt({ ...combo, [L.rows.key]: rv, [L.columns.key]: cv })));
          table.append(row);
        }
        panel.append(table);
      }
      // cells the layout does not place (an extra feature the layout has no axis for) are listed below the tables
      const placed = new Set<string>();
      for (const combo of combos) for (const [rv] of L.rows.values) for (const [cv] of L.columns.values) { const c = cellAt({ ...combo, [L.rows.key]: rv, [L.columns.key]: cv }); if (c) placed.add(featureKey(c.features)); }
      const rest = p.cells.filter((c) => !placed.has(featureKey(c.features)));
      if (rest.length) section(panel, 'Other forms', rest.map((c) => `${c.form} — ${describeFeatures(c.features)} ${STATUS_MARK[c.status]}`));
    } else {
      section(panel, 'Forms', p.cells.map((c) => `${c.form} — ${describeFeatures(c.features)} ${STATUS_MARK[c.status]}`));
    }
    panel.append(h('div', { class: 'note' }, `${STATUS_MARK.verified} both agree · ${STATUS_MARK.supported} dictionary only · ${STATUS_MARK.generated} rules only · ${STATUS_MARK.conflicted} they disagree (both shown). The selected form is marked.`));
    for (const n of p.notes) panel.append(h('div', { class: 'note' }, n));
    panel.append(h('div', { class: 'note' }, `Sources: ${p.sources.map((s) => `${s.label}${s.licence ? ` (${s.licence})` : ''}`).join('; ')}.`));
  }

  function fillMeaning(panel: HTMLElement, m: CardModel, v: CardView): void {
    if (m.gloss) panel.append(h('div', { class: 'row' }, h('span', { class: 'v' }, h('strong', {}, 'Word list: '), m.gloss), tag(m.labels.gloss)));
    // the dictionary's own senses (the immediate card shows the word list's meaning when it has one), with the attribution CC BY-SA asks for
    if (m.gloss && v.gloss.state === 'ready' && v.gloss.senses.length) panel.append(row('dictionary', 'dictionary', `${v.gloss.senses.slice(0, 4).join('; ')}${v.gloss.attribution ? ` (${v.gloss.attribution})` : ''}`, 'analysis', true));
    if (!enrichNote(panel, v)) return;
    const e = v.enrichment;
    if (!e.senses?.length) { panel.append(h('div', { class: 'note' }, e.message ? `The dictionary did not provide senses for this lemma: ${e.message}` : 'The dictionary has no entry for this lemma.')); }
    else {
      const ol = h('ol', { class: 'senses' });
      for (const s of e.senses) {
        const li = h('li', {}, s.gloss, s.tags.length ? h('span', { class: 'muted' }, ` (${s.tags.join(', ')})`) : '');
        for (const x of s.examples) li.append(h('div', { class: 'example', lang: m.languageId }, x));
        ol.append(li);
      }
      panel.append(ol);
      panel.append(h('div', { class: 'note' }, 'Senses are the dictionary\'s, in its order; the one meant here is not chosen by GoLearn (a future contextual step).'));
    }
    const r = e.relations;
    if (r) {
      section(panel, 'Derived words', r.derived);
      section(panel, 'Related words', r.related);
      section(panel, 'Synonyms', r.synonyms);
      section(panel, 'Antonyms', r.antonyms);
    }
    if (e.attribution) panel.append(h('div', { class: 'note' }, e.attribution));
  }

  function fillOrigin(panel: HTMLElement, m: CardModel, v: CardView): void {
    if (!enrichNote(panel, v)) return;
    const o = v.enrichment.etymology;
    if (!o || o.status === 'unknown') {
      panel.append(h('div', { class: 'note' }, v.enrichment.message
        ? `The dictionary did not provide a documented origin: ${v.enrichment.message}`
        : 'No documented origin in the dictionary. GoLearn does not invent one.'));
      return;
    }
    panel.append(h('div', { class: 'note' }, o.status === 'conflicted' ? 'The source itself calls this origin uncertain or disputed.' : 'From the dictionary\'s etymology; a documented account, not GoLearn\'s own.'));
    if (o.text) panel.append(h('div', { class: 'ety', lang: 'en' }, o.text));
    if (o.chain.length) section(panel, 'Steps the source names', o.chain.map((c) => etymologyStepText(c, o.languageNames ?? {})));
    if (o.cognates?.length) section(panel, 'Cognates the source lists', o.cognates.map((c) => cognateText(c, o.languageNames ?? {})));
    if (o.source) panel.append(h('div', { class: 'note' }, `Source: ${o.source.label} (${o.source.licence}). Lemma: ${m.lemma ?? m.surface}.`));
  }

  function fillStructure(panel: HTMLElement, m: CardModel, v: CardView): void {
    if (!enrichNote(panel, v)) return;
    const w = v.enrichment.structure;
    const family = w ? [...w.family.derived, ...w.family.related] : [];
    if (!w || (w.status === 'unknown' && !w.derivedFrom && !family.length)) {
      panel.append(h('div', { class: 'note' }, v.enrichment.message
        ? `The dictionary did not provide documented structure for this word: ${v.enrichment.message}`
        : 'No documented structure for this word.'));
      return;
    }
    if (w.parts.length) {
      const describe = (p: StructurePart): string => `${p.text}: ${p.role}${p.gloss ? ` (${p.gloss})` : ''}`;
      const line = h('div', { class: 'segs', role: 'group', 'aria-label': `Parts of the word: ${w.parts.map(describe).join('; ')}` });
      for (const p of w.parts) line.append(h('span', { class: `seg ${p.role}`, title: p.gloss ? `${p.role}; ${p.gloss}` : p.role }, h('span', { lang: m.languageId }, p.text), h('span', { class: 'role', 'aria-hidden': 'true' }, p.role)));
      panel.append(line);
      const glossed = w.parts.filter((p) => p.gloss);
      if (glossed.length) section(panel, 'What the parts are', glossed.map(describe));
    } else {
      panel.append(h('div', { class: 'note' }, 'No documented parts for this word.'));
    }
    if (STRUCTURE_STATUS[w.status]) panel.append(h('div', { class: 'note' }, STRUCTURE_STATUS[w.status]));
    if (w.derivedFrom) section(panel, 'Derived from', [h('span', {}, h('span', { lang: m.languageId }, w.derivedFrom.lemma), ` — ${w.derivedFrom.relation} (${w.derivedFrom.source})`)]);
    section(panel, 'Word family: derived words', w.family.derived);
    section(panel, 'Word family: related words', w.family.related);
    for (const n of w.notes) panel.append(h('div', { class: 'note' }, n));
    const sources = [...new Set([...w.parts.map((p) => p.source), ...(w.derivedFrom ? [w.derivedFrom.source] : []), ...(w.family.source ? [`${w.family.source}, CC BY-SA 4.0`] : [])])];
    if (sources.length) panel.append(h('div', { class: 'note' }, `Sources: ${sources.join('; ')}. Lemma: ${m.lemma ?? m.surface}.`));
  }

  function renderPanels(): void {
    if (!parts || !model) return;
    const fills: Partial<Record<LayerName, (p: HTMLElement) => void>> = {
      morphology: (p) => fillForm(p, model!, view),
      'phrase-syntax': (p) => fillSyntax(p, model!),
      forms: (p) => fillForms(p, model!, view),
      meaning: (p) => fillMeaning(p, model!, view),
      origin: (p) => fillOrigin(p, model!, view),
      structure: (p) => fillStructure(p, model!, view),
      sentence: (p) => fillSentence(p, model!, view),
      variants: (p) => fillVariants(p, model!),
    };
    for (const name of PANEL_LAYERS) {
      const panel = parts.layers[name];
      if (!panel) continue; // the variants panel exists only for a language with period varieties
      panel.replaceChildren();
      fills[name]?.(panel);
    }
  }

  /** The rating row (the word's level pressed: the learner's own mark when they made one, else the level the model gives), the correction feedback and the footer. */
  function renderSaved(): void {
    if (!parts) return;
    const current = view.rated ?? view.profile.level;
    const at = current ? KNOWLEDGE_LEVELS.indexOf(current) : -1;
    for (const [mark, b] of Object.entries(parts.rateBtns) as Array<[SelfMark, HTMLButtonElement]>) {
      b.setAttribute('aria-pressed', String(current === mark));
      b.classList.toggle('on', KNOWLEDGE_LEVELS.indexOf(mark) <= at); // the circles up to and including the current level are filled
    }
    parts.levelName.textContent = current ? KNOWLEDGE_LEVEL_WORDS[current].title : '';
    renderEncounters();
    const c = view.correction;
    if (c.state === 'sending') setFeedback('Sending your correction…');
    else if (c.state === 'sent' || c.state === 'saved-locally' || c.state === 'error') setFeedback(c.message);
  }

  function renderAll(): void { renderRows(); renderSources(); renderPanels(); renderPron(); renderSaved(); }

  function toggleSources(): void {
    const openNow = parts!.sources.hasAttribute('hidden');
    if (openNow) parts!.sources.removeAttribute('hidden'); else parts!.sources.setAttribute('hidden', '');
    parts!.sourcesBtn.setAttribute('aria-expanded', String(openNow));
    if (lastAnchor) place(lastAnchor);
  }

  /**
   * "Go deeper" and "See full sentence" are one or the other: opening either closes the other (aria-expanded on both). "Go deeper" opens every
   * grammatical section at once ("Less" closes them) and reports each, in order; the sentence reports its one event on its first opening.
   */
  function setPills(which: 'deeper' | 'sentence' | 'variants' | 'none'): void {
    if (!parts) return;
    const set = (box: HTMLElement, btn: HTMLButtonElement, open: boolean, openText: string, closedText: string): boolean => {
      const was = !box.hasAttribute('hidden');
      if (open) box.removeAttribute('hidden'); else box.setAttribute('hidden', '');
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? openText : closedText;
      return open && !was;
    };
    const opened = set(parts.deeper, parts.deeperBtn, which === 'deeper', 'Less', 'Go deeper');
    const sentenceOpened = set(parts.sentenceBox, parts.sentenceBtn, which === 'sentence', 'Hide sentence', 'See full sentence');
    const variantsOpened = parts.variantsBox && parts.variantsBtn ? set(parts.variantsBox, parts.variantsBtn, which === 'variants', 'Hide variants', 'Variants') : false;
    if (lastAnchor) place(lastAnchor);
    if (opened) {
      for (const name of LAYER_ORDER) {
        if (name === 'forms' && model && model.tokenCount !== 1) continue; // the paradigm is for one word
        try { actions.onLayer?.(name); } catch { /* reporting never blocks */ }
      }
    }
    if (sentenceOpened && !sentenceReported) { sentenceReported = true; try { actions.onLayer?.('sentence'); } catch { /* reporting never blocks */ } }
    if (variantsOpened && !variantsReported) { variantsReported = true; try { actions.onLayer?.('variants'); } catch { /* reporting never blocks */ } }
  }
  const toggleDeeper = (): void => setPills(parts!.deeper.hasAttribute('hidden') ? 'deeper' : 'none');
  const toggleSentence = (): void => setPills(parts!.sentenceBox.hasAttribute('hidden') ? 'sentence' : 'none');
  const toggleVariants = (): void => setPills(parts!.variantsBox?.hasAttribute('hidden') ? 'variants' : 'none');

  /**
   * The "Variants" panel: the word across the periods of the language, one row per period in historical order, each with the form(s) a
   * source attests, the meaning when a source gives one for that period, the status in plain words and the sources; the period the text
   * itself is in is marked. A period no source knows is said to be "not in our sources" — never filled in.
   */
  function fillVariants(panel: HTMLElement, m: CardModel): void {
    const v = m.variants;
    if (!v) { panel.append(h('div', { class: 'note' }, 'This language has no period varieties to compare.')); return; }
    if (m.period) panel.append(h('div', { class: 'note' }, `This text is read as ${m.period.label}: ${m.period.basis}.`));
    const table = h('table', { class: 'variants' });
    for (const row of v.rows) {
      const forms = row.forms.length ? h('span', { class: 'vform', lang: m.languageId, dir: 'auto' }, row.forms.join(' · ')) : h('span', { class: 'vnone', 'aria-label': 'no form' }, '—');
      const detail: string[] = [];
      if (row.status !== 'attested' || !row.forms.length) detail.push(VARIANT_STATUS[row.status] ?? row.status);
      if (row.gloss) detail.push(row.gloss);
      if (row.note) detail.push(row.note);
      if (row.sources.length) detail.push(`source: ${row.sources.join(', ')}`);
      table.append(h('tr', { class: row.current ? 'current' : '' },
        h('th', { scope: 'row' }, row.current ? `${row.label} (this text)` : row.label),
        h('td', {}, forms, detail.length ? h('div', { class: 'vstatus' }, detail.join(' · ')) : null),
      ));
    }
    panel.append(table);
    panel.append(h('div', { class: 'note' }, `Lemma: ${v.lemma}. Every row states what a source attests for that period; a period with no row in the sources is left empty, not guessed.`));
  }

  function buildCorrectionForm(m: CardModel): HTMLFormElement {
    const form = h('form', { class: 'fix', id: 'panel-fix', hidden: '', 'aria-label': 'Correct this analysis' }) as HTMLFormElement;
    form.append(h('div', { class: 'note' }, 'Your correction is kept with your own record and sent to the shared word list as a proposal, not as a fact.'));
    const group = h('fieldset', {}, h('legend', {}, 'Which reading is right?'));
    form.append(group);
    const alts = m.alternatives.filter((a) => a.lemma);
    alts.forEach((a, i) => {
      const id = `alt-${i}`;
      const input = h('input', { type: 'radio', name: 'reading', id, value: String(i) });
      group.append(h('label', { for: id }, input, ' ', h('span', { lang: m.languageId }, a.lemma ?? ''), `${a.pos ? ` (${a.pos})` : ''}${a.gloss ? ` – ${a.gloss}` : ''}`));
    });
    const typed = h('input', { type: 'radio', name: 'reading', id: 'alt-typed', value: 'typed' });
    const text = h('input', { type: 'text', name: 'lemma', id: 'typed-lemma', 'aria-label': 'The correct lemma', maxlength: '60', autocomplete: 'off' });
    group.append(h('label', { for: 'alt-typed' }, typed, ' Another lemma: ', text));
    const send = h('button', { type: 'submit', class: 'sendFix' }, 'Send correction');
    const cancel = h('button', { type: 'button', class: 'cancelFix' }, 'Cancel');
    form.append(h('div', { class: 'actions' }, send, cancel));
    cancel.addEventListener('click', () => { form.setAttribute('hidden', ''); parts?.report.setAttribute('aria-expanded', 'false'); if (lastAnchor) place(lastAnchor); });
    text.addEventListener('input', () => { (typed as HTMLInputElement).checked = true; });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const chosen = (form.querySelector('input[name="reading"]:checked') as HTMLInputElement | null)?.value;
      let lemma = ''; let pos: string | undefined; let fromAlternative = false;
      if (chosen === 'typed') lemma = (text as HTMLInputElement).value.normalize('NFC').trim();
      else if (chosen !== undefined) { const a = alts[Number(chosen)]; if (a?.lemma) { lemma = a.lemma; pos = a.pos; fromAlternative = true; } }
      if (!lemma || /[:,?#&%\u0000-\u001f]/u.test(lemma) || lemma.length > 60) { setFeedback(!lemma ? 'Choose a reading or type the lemma first.' : 'The lemma may not contain : , ? # & % or line breaks.'); return; }
      form.setAttribute('hidden', '');
      parts?.report.setAttribute('aria-expanded', 'false');
      try { actions.onCorrect?.({ lemma, pos, fromAlternative }); } catch { /* reporting never blocks */ }
    });
    return form;
  }

  function show(m: CardModel, anchor: PopupAnchor, opts: ShowOptions = {}): Placement {
    renderToken++;
    analysisOpen = false; analysisReported = false; sentenceReported = false; variantsReported = false;
    pron.off?.();
    pron.offPlayback?.();
    try { pronouncer.stop?.(); } catch { /* nothing playing */ }
    pron = { available: false, note: 'Checking voices…', playing: false, plays: 0 };
    model = m;
    view = { ...initialView(opts.view?.languageName ?? ''), ...opts.view };
    actions = opts.actions ?? {};
    const top = h('div', { class: 'top' }, h('span', { class: 'label' }, `Word${view.languageName ? ` · ${view.languageName}` : ''}`), closeButton());
    const word = h('div', { class: 'word', lang: m.languageId, dir: m.context.direction === 'rtl' ? 'rtl' : 'auto' }, m.surface);
    const rows = h('div', { class: 'rows' });

    // the speaker beside the word: GoListen's device provider speaks it; with no device voice its title says so (disabled, nothing else shown)
    const say = h('button', { type: 'button', class: 'say', 'aria-label': 'Play with GoListen', title: pron.note }, h('span', { 'aria-hidden': 'true' }, '🔊')) as HTMLButtonElement;
    say.disabled = true;
    say.addEventListener('click', onPronounceClick);
    const wordLine = h('div', { class: 'wordline' }, word, say);
    // Keep playback status visible while the learner waits, listens, or recovers from an error.
    const pronNote = h('div', { class: 'note pron', role: 'status', 'aria-live': 'polite' }, pron.note);
    const audioControls = h('div', { class: 'actions', role: 'group', 'aria-label': 'Playback' });
    let stopAudio: HTMLButtonElement | undefined;
    let audioSpeed: HTMLSelectElement | undefined;
    if (pronouncer.onPlaybackState && pronouncer.stop) {
      stopAudio = h('button', { type: 'button' }, 'Stop pronunciation') as HTMLButtonElement;
      stopAudio.disabled = true;
      stopAudio.addEventListener('click', () => {
        pronunciationRequest++;
        pron.pending = undefined;
        pron.playing = false;
        pron.autoPlay = undefined;
        pronouncer.stop?.();
        pron.note = 'Pronunciation stopped.';
        renderPron();
      });
      audioControls.append(stopAudio);
    }
    if (pronouncer.setRate) {
      audioSpeed = h('select', { 'aria-label': 'Pronunciation speed' }) as HTMLSelectElement;
      for (const rate of [0.5, 0.75, 1, 1.25, 1.5]) audioSpeed.append(h('option', { value: String(rate) }, `${rate}×`));
      audioSpeed.value = String(playbackRate);
      audioSpeed.disabled = true;
      audioSpeed.addEventListener('change', () => {
        playbackRate = Number(audioSpeed!.value);
        pronouncer.setRate?.(playbackRate);
        pron.note = 'Pronunciation speed changed; device voices use it on the next playback.';
        renderPron();
      });
      audioControls.append(h('label', {}, 'Speed ', audioSpeed));
    }

    // "view sources", a subscript under the meaning: the list of pages the information came from
    const sourcesBtn = h('button', { type: 'button', class: 'sourcesBtn', 'aria-expanded': 'false', 'aria-controls': 'panel-sources' }, 'view sources') as HTMLButtonElement;
    const sources = h('div', { class: 'sources', id: 'panel-sources', hidden: '' });
    sourcesBtn.addEventListener('click', toggleSources);

    // "Go deeper": every grammatical section at once, in order; the last is "About this analysis" (muted)
    const layers = {} as Record<LayerName, HTMLElement>;
    const deeper = h('div', { class: 'deeper', id: 'panel-deeper', hidden: '' });
    for (const name of LAYER_ORDER) {
      layers[name] = h('div', { class: `more layer ${LAYER_CLASS[name]}`, 'data-layer': name, id: `panel-${LAYER_CLASS[name]}` });
      deeper.append(h('h3', {}, LAYER_TITLES[name]), layers[name]);
    }
    // "See full sentence": the word-by-word list (and the translation block) in its own panel, beside "Go deeper" and exclusive with it
    layers.sentence = h('div', { class: `more layer ${LAYER_CLASS.sentence}`, 'data-layer': 'sentence', id: `panel-${LAYER_CLASS.sentence}` });
    const sentenceBox = h('div', { class: 'sentenceBox', id: 'panel-sentence', hidden: '' }, layers.sentence);
    const sentenceBtn = h('button', { type: 'button', class: 'btn sentenceBtn', 'aria-expanded': 'false', 'aria-controls': 'panel-sentence' }, 'See full sentence') as HTMLButtonElement;
    if (m.context.kind === 'none') { sentenceBtn.disabled = true; sentenceBtn.title = 'No sentence around this word'; }
    sentenceBtn.addEventListener('click', toggleSentence);
    const about = h('div', { class: 'more about', id: 'panel-about' });
    fillAbout(about, m);
    deeper.append(h('h3', {}, 'About this analysis'), about);
    const deeperBtn = h('button', { type: 'button', class: 'btn deeperBtn', 'aria-expanded': 'false', 'aria-controls': 'panel-deeper' }, 'Go deeper') as HTMLButtonElement;
    deeperBtn.addEventListener('click', toggleDeeper);
    // "Variants": the word across the periods of the language, its own panel and pill to the right of the sentence's; only for a language whose analyser has period varieties
    let variantsBox: HTMLElement | undefined;
    let variantsBtn: HTMLButtonElement | undefined;
    if (m.variants) {
      layers.variants = h('div', { class: `more layer ${LAYER_CLASS.variants}`, 'data-layer': 'variants', id: `panel-${LAYER_CLASS.variants}` });
      variantsBox = h('div', { class: 'variantsBox', id: 'panel-variants', hidden: '' }, layers.variants);
      variantsBtn = h('button', { type: 'button', class: 'btn variantsBtn', 'aria-expanded': 'false', 'aria-controls': 'panel-variants' }, 'Variants') as HTMLButtonElement;
      variantsBtn.addEventListener('click', toggleVariants);
    }

    // the learner's own word on how well they know it: six levels, the current one shown pressed (a new mark replaces it)
    const rateBtns = {} as Record<SelfMark, HTMLButtonElement>;
    const rate = h('div', { class: 'rate', role: 'group', 'aria-label': 'How well do you know this word?' }, h('span', { class: 'label' }, 'How well do you know it?'));
    for (const mark of KNOWLEDGE_LEVELS) {
      // a circle of the level meter: its name is the level's title (the button has no text), its title says what the level means
      const b = h('button', { type: 'button', class: 'rateBtn', 'data-mark': mark, 'aria-pressed': 'false', 'aria-label': KNOWLEDGE_LEVEL_WORDS[mark].title, title: `${KNOWLEDGE_LEVEL_WORDS[mark].title}: ${KNOWLEDGE_LEVEL_WORDS[mark].detail}` }) as HTMLButtonElement;
      b.addEventListener('click', () => { if (view.rated === mark) return; try { actions.onRate?.(mark); } catch { /* reporting never blocks */ } });
      rateBtns[mark] = b;
      rate.append(b);
    }
    const levelName = h('span', { class: 'levelName', 'aria-hidden': 'true' }, '');
    rate.append(levelName);

    // under the meter, the kicker "· N× encounters" (all that is shown about the learner); "Report" is the quiet pill beside "Go deeper" and opens the correction form
    const encounters = h('div', { class: 'encounters' }, '');
    const report = h('button', { type: 'button', class: 'btn btn--quiet reportBtn', 'aria-expanded': 'false', 'aria-controls': 'panel-fix' }, 'Report') as HTMLButtonElement;
    const fix = buildCorrectionForm(m);
    if (m.tokenCount !== 1 || !m.itemIds.length) { report.disabled = true; report.title = 'Reports are for a single word.'; }
    report.addEventListener('click', () => {
      const openNow = fix.hasAttribute('hidden');
      if (openNow) fix.removeAttribute('hidden'); else fix.setAttribute('hidden', '');
      report.setAttribute('aria-expanded', String(openNow));
      if (lastAnchor) place(lastAnchor);
    });
    const pills = h('div', { class: 'pills' }, deeperBtn, sentenceBtn, variantsBtn ?? null, report);

    statusEl = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' }, '');
    feedbackEl = h('div', { class: 'feedback', role: 'status', 'aria-live': 'polite' }, '');
    parts = { rows, pronNote, say, stopAudio, audioSpeed, sources, sourcesBtn, deeper, deeperBtn, sentenceBox, sentenceBtn, variantsBox, variantsBtn, encounters, levelName, layers, fix, report, rateBtns };
    const wrapper = h('div', {}, top, wordLine, rows, audioControls, h('div', {}, sourcesBtn), sources, rate, encounters, pills, deeper, sentenceBox, variantsBox ?? null, pronNote, fix, feedbackEl, statusEl);
    mountCard(wrapper, `GoLearn: ${m.surface}`);
    renderAll();
    pron.off = pronouncer.onChange?.(() => { checkPronunciation(renderToken); });
    const playbackToken = renderToken;
    pron.offPlayback = pronouncer.onPlaybackState?.((state) => {
      if (playbackToken !== renderToken) return;
      pron.state = state;
      if (state === 'error') {
        pron.pending = undefined;
        pron.playing = false;
        // Preserve the provider's failure state until a new attempt starts.
        pron.note = 'Pronunciation could not play. Try again, or continue with the written information.';
      } else if (state === 'idle') {
        pron.pending = undefined;
      } else if (state === 'playing') {
        pron.playing = true;
        pron.note = 'Playing pronunciation…';
      } else if (state === 'paused') {
        pron.playing = true;
        pron.note = 'Pronunciation paused.';
      } else if (state === 'ended') {
        pron.playing = false;
        completedPronunciation();
      }
      renderPron();
    });
    checkPronunciation(renderToken);
    return finish(anchor, opts);
  }

  function finish(anchor: PopupAnchor, opts: { focus?: boolean } = {}): Placement {
    lastAnchor = anchor;
    open = true;
    listen();
    const p = place(anchor);
    if (opts.focus) {
      prevFocus = doc.activeElement;
      card!.setAttribute('aria-modal', 'true'); // it traps Tab while focus is inside; a card opened by selection takes no focus and is not modal
      const target = root!.querySelector<HTMLElement>('.say:not([disabled]), .deeperBtn, .close') ?? card!;
      target.focus();
      movedFocus = true;
    }
    return p;
  }

  function update(patch: Partial<CardView>): void {
    if (!open || !model || !parts) return;
    view = { ...view, ...patch };
    renderRows(); renderSources(); renderPanels(); renderSaved();
    if (lastAnchor) place(lastAnchor);
  }

  function showMessage(text: string, anchor: PopupAnchor, kind: 'info' | 'error' = 'info'): Placement {
    renderToken++;
    model = undefined; parts = undefined; statusEl = undefined; feedbackEl = undefined;
    pron.off?.(); pron.offPlayback?.();
    try { pronouncer.stop?.(); } catch { /* nothing playing */ }
    pron = { available: false, note: '', playing: false, plays: 0 };
    const top = h('div', { class: 'top' }, h('span', { class: 'label' }, 'GoLearn'), closeButton());
    mountCard(h('div', {}, top, h('div', { class: kind === 'error' ? 'msg err' : 'msg', role: 'alert' }, text)), 'GoLearn message');
    return finish(anchor);
  }

  function reposition(anchor: PopupAnchor): Placement | undefined {
    if (!open || !card) return undefined;
    lastAnchor = anchor;
    return place(anchor);
  }

  function setRecorded(status: RecordStatus): void {
    if (!statusEl) return;
    statusEl.textContent = status === 'recorded' ? 'Encounter recorded.' : status === 'duplicate' ? 'Encounter already recorded this session.' : status === 'failed' ? 'Encounter not recorded.' : '';
  }

  function setFeedback(text: string): void { if (feedbackEl) feedbackEl.textContent = text; }

  function dismiss(reason: DismissReason): void {
    const wasOpen = open;
    open = false;
    renderToken++;
    for (const off of cleanup) off();
    cleanup = [];
    pron.off?.(); pron.off = undefined;
    pron.offPlayback?.(); pron.offPlayback = undefined;
    try { pronouncer.stop?.(); } catch { /* nothing playing */ }
    host?.remove();
    host = undefined; root = undefined; card = undefined; statusEl = undefined; feedbackEl = undefined; lastAnchor = undefined;
    model = undefined; parts = undefined;
    if (movedFocus && prevFocus instanceof HTMLElement && prevFocus.isConnected) { try { prevFocus.focus(); } catch { /* */ } }
    prevFocus = null; movedFocus = false;
    if (wasOpen) options.onDismiss?.(reason);
  }

  return {
    show, update, showMessage, reposition, setRecorded, setFeedback, dismiss, pronounce,
    isOpen: () => open,
    host: () => host,
    root: () => root,
    destroy: () => dismiss('disposed'),
  };
}

const LABEL_HELP: Record<EvidenceLabel, string> = {
  fact: 'Observed directly: what you selected, or how the context was obtained.',
  analysis: 'The parser’s best reading with its confidence. Machine-drafted and not checked by a native speaker.',
  inference: 'An estimate about you, computed from your own learning history. It can be wrong and it is never shown to anyone else.',
};

/**
 * "About this analysis", the last block of "Go deeper" (muted): how the reading was reached and how far to trust it. The context
 * the word was read in, the confidence and where the reading came from, the labels, the limits, and the analyser's id.
 */
function fillAbout(about: HTMLElement, m: CardModel): void {
  const doc = about.ownerDocument;
  const section = (title: string, items: string[]) => {
    if (!items.length) return;
    const h4 = doc.createElement('h4'); h4.textContent = title; about.append(h4);
    const ul = doc.createElement('ul');
    for (const t of items) { const li = doc.createElement('li'); li.textContent = t; ul.append(li); }
    about.append(ul);
  };
  const c = m.context;
  section('Context', [contextLine(c).replace(/^Context:\s*/, '')]);
  const src = m.source ? ` · ${m.source.label} (${m.source.reviewStatus})` : '';
  section('Confidence', [`${m.confidence.toFixed(2)} · ${m.provenance}${src}`]);
  section('Why this reading', m.basis);
  section('Other readings', m.alternatives.map((a) => `${a.lemma ?? '?'}${a.pos ? ` (${a.pos})` : ''}${a.gloss ? ` – ${a.gloss}` : ''} · ${a.confidence.toFixed(2)}`));
  section('Notes', m.notes);
  section('Limits', m.limits);
  section('Labels', ['fact: what you selected and how the context was got', 'analysis: the reading, machine-drafted, unchecked', 'inference: an estimate about you from your own learning history']);
  section('Analyser', [m.analyzerId]);
}

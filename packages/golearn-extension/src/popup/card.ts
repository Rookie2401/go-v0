/**
 * The card: a Shadow DOM popup on a fixed-position host appended to <body>. No page style reaches it and none of its
 * style reaches the page; it never changes the page's text, colours or layout (position: fixed, no reflow). All text
 * that reaches the DOM is set with textContent, never as markup: page text, dictionary glosses and every reply from the
 * background are rendered as text. Dismissed by Escape, a click outside, or the close button. Tab cycles inside the card.
 *
 * LAYERS. Layer 1 is immediate and always on screen: the selected form, the likely meaning in this context, lemma and
 * part of speech, the essential morphology line, confidence, what the context was, and a pronunciation button.
 * Layers 2-5 are disclosures the learner opens, each reachable by one button: 2 morphology (a table of the features
 * that exist), 3 phrase & syntax, 4 the grammar explanation (how much depends on the explanation depth), 5 the English
 * rescue (a word-by-word list; there is no machine translation). Opening a layer is reported through `CardActions`.
 *
 * LATER ARRIVALS. The card is shown with what the parser had. The dictionary gloss, the learner-model line and the
 * pack's explanations arrive through `update()`; nothing waits for them. When the learner's grammatical understanding of
 * a construction the form realizes is weak, its hint is moved above the gloss; otherwise the gloss comes first.
 */
import { GOLEARN_HOST_ATTR, type PopupAnchor } from '../contract/readerAdapter';
import { contextLine, type CardModel, type EvidenceLabel } from '../parser/cardModel';
import { languageNameOf } from '../protocol';
import {
  initialView, type CardActions, type CardView, type LayerName, type PlayResult, type PronounceAvailability, type Pronouncer,
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
.card {
  position: fixed; width: min(24.3em, calc(100vw - ${MARGIN * 2}px)); max-height: min(70vh, 520px); overflow: auto;
  font: 0.875em/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1b1b1f; background: #fffdf8;
  border: 1px solid #c9c2b4; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.22); padding: 10px 12px; text-align: start;
}
.card:focus { outline: none; }
@media (prefers-color-scheme: dark) { .card { color: #ececf1; background: #25262b; border-color: #4a4b54; } .tag { background: #3a3b44; color: #cfd0d8; } button, input { color: #ececf1; background: #34353d; border-color: #8a8b96; } button:focus-visible, input:focus-visible { outline: 2px solid #8ec5f5; } }
.top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.brand { font-size: 0.857em; letter-spacing: .04em; text-transform: uppercase; opacity: .7; }
.word { font-size: 1.43em; font-weight: 650; margin: 2px 0 6px; overflow-wrap: anywhere; }
.row { display: flex; gap: 8px; align-items: baseline; margin: 3px 0; }
.k { min-width: 5.2em; font-size: 0.857em; opacity: .65; }
.v { flex: 1; overflow-wrap: anywhere; }
.tag { font-size: 0.857em; padding: 0 6px; border-radius: 8px; background: #ece7da; color: #5a5446; white-space: nowrap; }
.muted { opacity: .72; }
.actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; align-items: center; }
button, input { font: inherit; font-size: 0.929em; padding: 0.214em 0.714em; border-radius: 6px; border: 1px solid #857e6e; background: #f2eee3; color: #1b1b1f; }
button { cursor: pointer; }
button:disabled { opacity: .5; cursor: not-allowed; }
button:focus-visible, input:focus-visible { outline: 2px solid #2b6cb0; outline-offset: 2px; }
button[aria-expanded="true"] { border-color: #2b6cb0; }
.close { padding: 0 0.5em; font-size: 1.143em; line-height: 1.3; }
.more { margin-top: 8px; border-top: 1px solid #ddd6c6; padding-top: 6px; font-size: 0.929em; }
.more[hidden] { display: none; }
.more h4 { margin: 8px 0 2px; font-size: 0.923em; opacity: .7; font-weight: 600; }
.more ul { margin: 0; padding-inline-start: 18px; }
.more table { border-collapse: collapse; width: 100%; }
.more th, .more td { text-align: start; vertical-align: top; padding: 2px 6px 2px 0; }
.more .tag, .more .note { font-size: 0.923em; }
.more th { font-weight: 600; white-space: nowrap; }
.sel { font-weight: 650; }
.status { margin-top: 8px; font-size: 0.857em; opacity: .8; min-height: 1.2em; }
.feedback { font-size: 0.857em; opacity: .85; min-height: 1.2em; }
.note { font-size: 0.857em; margin-top: 4px; opacity: .8; }
.msg { margin: 4px 0; }
.err { color: #9b1c1c; }
form.fix { margin-top: 8px; border-top: 1px solid #ddd6c6; padding-top: 6px; font-size: 0.929em; }
form.fix fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
form.fix legend { padding: 0; margin: 0 0 2px; }
form.fix[hidden] { display: none; }
form.fix label { display: block; margin: 2px 0; }
form.fix input[type="text"] { width: 12em; }
@media (prefers-color-scheme: dark) { .err { color: #ff9a9a; } .more, form.fix { border-color: #44454e; } }
`;

type Child = Node | string | null | undefined | false;

const LAYER_TITLES: Record<LayerName, string> = { morphology: 'Form', 'phrase-syntax': 'Phrase & syntax', grammar: 'Grammar', sentence: 'English rescue' };

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
  let parts: { rows: HTMLElement; pronNote: HTMLElement; say: HTMLButtonElement; layers: Record<LayerName, { btn: HTMLButtonElement; panel: HTMLElement }>; fix: HTMLFormElement; save: HTMLButtonElement; wrong: HTMLButtonElement } | undefined;
  let pron: { available: boolean; note: string; playing: boolean; plays: number; off?: () => void } = { available: false, note: '', playing: false, plays: 0 };
  let renderToken = 0;

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
    const focusables = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')).filter((el) => !el.closest('[hidden]'));
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

  // ───────────── layer 1 ─────────────

  function grammarHint(m: CardModel, v: CardView): { text: string; weak: boolean } | undefined {
    if (!m.constructions.length) return undefined;
    const weakIds = new Set(v.profile.weak);
    const c = m.constructions.find((x) => weakIds.has(x.id)) ?? m.constructions[0];
    const e = v.explain.constructions.find((x) => x.id === c.id);
    const title = e?.title ?? c.title;
    const brief = e?.brief ?? c.explanation.split(/(?<=[.!?])\s/u)[0];
    return { text: v.depth === 'label' || !brief ? title : `${title}: ${brief}`, weak: weakIds.has(c.id) };
  }

  function profileLine(v: CardView): { text: string; label: EvidenceLabel } | undefined {
    const p = v.profile;
    if (p.state === 'ready') {
      if (!p.met) return { text: 'You have not met this word before, as far as GoLearn knows.', label: 'inference' };
      const rec = p.recognition;
      const r = rec === undefined || rec === 'not-assessed' ? 'not assessed yet' : `${rec.level} (confidence ${rec.confidence.toFixed(2)})`;
      return { text: `You have met this word ${p.met} time${p.met === 1 ? '' : 's'}; reading recognition: ${r}${p.stale ? ' (from saved data)' : ''}`, label: 'inference' };
    }
    if (p.state === 'not-connected') return { text: 'Not connected: your history with this word is not shown. Open GoLearn setup to connect.', label: 'fact' };
    if (p.state === 'unavailable') {
      const why = p.reason === 'needs-sign-in' ? 'is not available until you sign in to GoLearn again' : p.reason === 'offline' ? 'could not be loaded: GoLearn cannot reach your account right now' : 'could not be loaded right now';
      return { text: `Your history with this word ${why}.`, label: 'fact' };
    }
    return undefined;
  }

  function renderRows(): void {
    if (!parts || !model) return;
    const m = model; const v = view; const l = m.labels;
    const rows: HTMLElement[] = [];
    const lemmaText = m.lemma ? (m.pos ? `${m.lemma} (${m.pos})` : m.lemma) : '';
    if (m.lemma) rows.push(row('lemma', m.unconfirmed ? 'lemma (guess)' : 'lemma', lemmaText, l.lemma, false, m.languageId));

    const hint = grammarHint(m, v);
    const hintRow = hint ? row('grammar', 'grammar', hint.text, l.constructions, !hint.weak) : undefined;
    if (hintRow && hint!.weak) rows.push(hintRow); // adaptive order: a weak construction comes before the gloss

    // meaning: the lexicon gloss at once, else the dictionary's, else "looking up…" while it is on its way
    const dict = v.gloss;
    if (m.gloss) rows.push(row('meaning', 'meaning', m.gloss, l.gloss));
    // a dictionary-only meaning carries its attribution on the row itself (CC BY-SA: the notice goes wherever the entry is shown)
    else if (dict.state === 'ready' && dict.senses.length) rows.push(row('meaning', 'meaning', `${dict.senses.slice(0, 3).join('; ')}${dict.attribution ? ` (${dict.attribution})` : ''}`, l.gloss));
    else if (dict.state === 'loading') rows.push(row('meaning', 'meaning', 'looking up…', l.gloss, true));
    else rows.push(row('meaning', 'meaning', m.provenance === 'none' ? 'Not in the word list.' : 'No meaning given.', l.gloss, true));
    if (m.gloss && dict.state === 'ready' && dict.senses.length) {
      rows.push(row('dictionary', 'dictionary', `${dict.senses.slice(0, 4).join('; ')}${dict.attribution ? ` (${dict.attribution})` : ''}`, 'analysis', true));
    }
    if (hintRow && !hint!.weak) rows.push(hintRow);

    if (m.morphology) rows.push(row('form', 'form', m.morphology, l.morphology));
    rows.push(row('context', 'context', contextLine(m.context).replace(/^Context:\s*/, ''), l.context, true));
    const src = m.source ? ` · ${m.source.label} (${m.source.reviewStatus})` : '';
    rows.push(row('confidence', 'confidence', `${m.confidence.toFixed(2)} · ${m.provenance}${src}`, l.confidence, true));
    const pl = profileLine(v);
    if (pl) rows.push(row('learner', 'you', pl.text, pl.label, pl.label !== 'inference'));
    if (m.words.length > 1) {
      const ul = h('ul', {}, ...m.words.map((w) => h('li', {}, h('span', { lang: m.languageId }, w.surface), ': ', w.lemma ? h('span', { lang: m.languageId }, w.lemma) : 'unknown', `${w.gloss ? ` – ${w.gloss}` : ''} (${w.confidence.toFixed(2)})`)));
      rows.push(h('div', { class: 'more-inline' }, ul));
    }
    parts.rows.replaceChildren(...rows);
  }

  // ───────────── pronunciation ─────────────

  function renderPron(): void {
    if (!parts) return;
    const speakText = model && model.surface.length <= 200 ? model.surface : '';
    parts.say.disabled = !(pron.available && speakText) || pron.playing;
    parts.pronNote.textContent = pron.note;
  }

  /** A synchronous answer (the local voice list) is applied at once; a promised one (GoListen asks the device) when it arrives. */
  function checkPronunciation(token: number): void {
    if (!model) return;
    const apply = (a: PronounceAvailability | undefined): void => {
      if (token !== renderToken) return;
      pron.available = !!a?.available;
      pron.note = a ? a.note : 'Pronunciation is not available right now.';
      renderPron();
    };
    let got: PronounceAvailability | Promise<PronounceAvailability>;
    try { got = pronouncer.availability(model.languageId); } catch { apply(undefined); return; }
    if (got instanceof Promise) void got.then(apply, () => apply(undefined)); else apply(got);
  }

  function onPronounceClick(): void {
    if (!model || !pron.available) return;
    const text = model.surface.length <= 200 ? model.surface : '';
    if (!text) return;
    const lang = model.languageId;
    const token = renderToken;
    let result: PlayResult | Promise<PlayResult>;
    try { result = pronouncer.play(text, lang); } catch { result = { ok: false, message: 'Pronunciation failed.' }; }
    pron.playing = true; renderPron();
    void Promise.resolve(result).then((r) => r, () => ({ ok: false, message: 'Pronunciation failed.' }) as PlayResult).then((r) => {
      if (token !== renderToken) return;
      pron.playing = false;
      if (r.ok) {
        const repeated = pron.plays > 0;
        pron.plays++;
        try { actions.onPronounced?.({ ok: true, voice: r.voice, voiceId: r.voiceId, repeated }); } catch { /* reporting never blocks */ }
      } else {
        pron.note = r.message; // one line; the analysis is untouched
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

  function fillMorphology(panel: HTMLElement, m: CardModel, v: CardView): void {
    if (!m.features.length) {
      panel.append(h('div', { class: 'note' }, m.tokenCount > 1 ? 'Select one word to see its form.' : 'The analyser gave no features for this word.'));
      return;
    }
    const table = h('table', {});
    for (const f of m.features) {
      const e = v.explain.features.find((x) => x.key === f.key && x.value === f.value);
      const label = e?.label ?? f.key;
      const value = e?.brief ?? f.value;
      const why = v.depth === 'label' ? '' : v.depth === 'brief' ? (e?.explanation ? firstSentence(e.explanation) : '') : (e?.explanation ?? '');
      table.append(h('tr', {}, h('th', {}, label), h('td', {}, value), h('td', { class: 'muted' }, why), h('td', {}, tag(m.labels.features))));
    }
    panel.append(table);
    if (v.explain.state !== 'ready') panel.append(h('div', { class: 'note' }, 'These are the analyser’s own labels; the pack’s explanations were not available.'));
  }

  function fillSyntax(panel: HTMLElement, m: CardModel): void {
    section(panel, 'Phrases', m.phrases.map((p) => `${p.display} (${p.kind}${p.gloss ? `: ${p.gloss}` : ''}) · ${p.confidence.toFixed(2)}`));
    section(panel, 'Units and parts', m.syntaxNotes);
    section(panel, 'Constructions here', m.constructions.map((c) => c.title));
    const roleLine = m.role ? `role: ${m.role}` : 'role: not available from this analyser';
    section(panel, 'Syntax', [roleLine, ...(m.context.kind === 'none' ? ['Without a sentence there are no neighbouring words to relate this one to.'] : [])]);
    if (!m.phrases.length && !m.syntaxNotes.length && !m.constructions.length) panel.append(h('div', { class: 'note' }, 'No phrase or construction was found around this word.'));
  }

  function fillGrammar(panel: HTMLElement, m: CardModel, v: CardView): void {
    if (!m.constructions.length) {
      panel.append(h('div', { class: 'note' }, 'No grammar note is attached to this form by the installed pack or the analyser.'));
      return;
    }
    const items: HTMLElement[] = [];
    for (const c of m.constructions) {
      const e = v.explain.constructions.find((x) => x.id === c.id);
      const title = e?.title ?? c.title;
      const body = v.depth === 'label' ? '' : v.depth === 'brief' ? (e?.brief ?? firstSentence(c.explanation)) : (e?.explanation ?? c.explanation);
      items.push(h('div', { class: 'row' }, h('span', { class: 'v' }, h('strong', {}, title), body ? ` — ${body}` : ''), tag(m.labels.constructions)));
    }
    for (const it of items) panel.append(it);
    panel.append(h('div', { class: 'note' }, `Explanation depth: ${v.depth}${v.depthOrigin === 'settings' || v.depthOrigin === 'explicit' ? ' (your setting)' : ''}.`));
  }

  function fillSentence(panel: HTMLElement, m: CardModel): void {
    panel.append(h('div', { class: 'note' }, 'There is no machine translation in GoLearn. This is a word-by-word list from the word list and the dictionary, not a translation of the sentence.'));
    if (!m.sentenceWords.length) { panel.append(h('div', { class: 'note' }, 'There is no sentence context, so there is nothing to list.')); return; }
    const ul = h('ul', {});
    for (const w of m.sentenceWords) {
      const rest = `${w.pos ? ` (${w.pos})` : ''}${w.gloss ? ` – ${w.gloss}` : ''}`;
      ul.append(h('li', w.selected ? { class: 'sel' } : {}, h('span', { lang: m.languageId }, w.surface), ': ', w.lemma ? h('span', { lang: m.languageId }, w.lemma) : 'unknown', w.lemma ? rest : ''));
    }
    panel.append(ul);
  }

  function renderPanels(): void {
    if (!parts || !model) return;
    const fills: Record<LayerName, (p: HTMLElement) => void> = {
      morphology: (p) => fillMorphology(p, model!, view),
      'phrase-syntax': (p) => fillSyntax(p, model!),
      grammar: (p) => fillGrammar(p, model!, view),
      sentence: (p) => fillSentence(p, model!),
    };
    for (const name of Object.keys(parts.layers) as LayerName[]) {
      const panel = parts.layers[name].panel;
      panel.replaceChildren();
      fills[name](panel);
    }
  }

  function renderSaved(): void {
    if (!parts) return;
    parts.save.disabled = view.saved;
    parts.save.textContent = view.saved ? 'Saved for review' : 'Review this';
    const c = view.correction;
    if (c.state === 'sending') setFeedback('Sending your correction…');
    else if (c.state === 'sent' || c.state === 'saved-locally' || c.state === 'error') setFeedback(c.message);
  }

  function renderAll(): void { renderRows(); renderPanels(); renderPron(); renderSaved(); }

  function toggleLayer(name: LayerName): void {
    const l = parts!.layers[name];
    const openNow = l.panel.hasAttribute('hidden');
    if (openNow) l.panel.removeAttribute('hidden'); else l.panel.setAttribute('hidden', '');
    l.btn.setAttribute('aria-expanded', String(openNow));
    if (lastAnchor) place(lastAnchor);
    if (openNow) { try { actions.onLayer?.(name); } catch { /* reporting never blocks */ } }
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
    cancel.addEventListener('click', () => { form.setAttribute('hidden', ''); parts?.wrong.setAttribute('aria-expanded', 'false'); if (lastAnchor) place(lastAnchor); });
    text.addEventListener('input', () => { (typed as HTMLInputElement).checked = true; });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const chosen = (form.querySelector('input[name="reading"]:checked') as HTMLInputElement | null)?.value;
      let lemma = ''; let pos: string | undefined; let fromAlternative = false;
      if (chosen === 'typed') lemma = (text as HTMLInputElement).value.normalize('NFC').trim();
      else if (chosen !== undefined) { const a = alts[Number(chosen)]; if (a?.lemma) { lemma = a.lemma; pos = a.pos; fromAlternative = true; } }
      if (!lemma || /[:,?#&%\u0000-\u001f]/u.test(lemma) || lemma.length > 60) { setFeedback(!lemma ? 'Choose a reading or type the lemma first.' : 'The lemma may not contain : , ? # & % or line breaks.'); return; }
      form.setAttribute('hidden', '');
      parts?.wrong.setAttribute('aria-expanded', 'false');
      try { actions.onCorrect?.({ lemma, pos, fromAlternative }); } catch { /* reporting never blocks */ }
    });
    return form;
  }

  function show(m: CardModel, anchor: PopupAnchor, opts: ShowOptions = {}): Placement {
    renderToken++;
    pron.off?.();
    pron = { available: false, note: 'Checking voices…', playing: false, plays: 0 };
    model = m;
    view = { ...initialView(opts.view?.languageName ?? ''), ...opts.view };
    actions = opts.actions ?? {};
    const top = h('div', { class: 'top' }, h('span', { class: 'brand' }, `GoLearn${view.languageName ? ` · ${view.languageName}` : ''}`), closeButton());
    const word = h('div', { class: 'word', lang: m.languageId, dir: m.context.direction === 'rtl' ? 'rtl' : 'auto' }, m.surface);
    const rows = h('div', { class: 'rows' });

    const say = h('button', { type: 'button', class: 'say', 'aria-label': 'Pronounce (practice only)' }, 'Pronounce (practice)') as HTMLButtonElement;
    say.disabled = true;
    say.addEventListener('click', onPronounceClick);
    const pronNote = h('div', { class: 'note pron', role: 'status', 'aria-live': 'polite' }, pron.note);

    const layerBtn = (name: LayerName, cls: string): HTMLButtonElement => h('button', { type: 'button', class: cls, 'aria-expanded': 'false' }, LAYER_TITLES[name]) as HTMLButtonElement;
    const layers = {} as Record<LayerName, { btn: HTMLButtonElement; panel: HTMLElement }>;
    const classes: Record<LayerName, string> = { morphology: 'l2', 'phrase-syntax': 'l3', grammar: 'l4', sentence: 'l5' };
    for (const name of Object.keys(LAYER_TITLES) as LayerName[]) {
      const btn = layerBtn(name, `layerBtn ${classes[name]}`);
      const panel = h('div', { class: `more layer ${classes[name]}`, hidden: '', 'data-layer': name, id: `panel-${classes[name]}` });
      btn.setAttribute('aria-controls', panel.id);
      btn.addEventListener('click', () => toggleLayer(name));
      layers[name] = { btn, panel };
    }
    if (m.context.kind === 'none') { layers.sentence.btn.title = 'There is no sentence context to list.'; }

    const save = h('button', { type: 'button', class: 'saveBtn' }, 'Review this') as HTMLButtonElement;
    save.addEventListener('click', () => { if (view.saved) return; try { actions.onSave?.(); } catch { /* reporting never blocks */ } });
    const wrong = h('button', { type: 'button', class: 'wrongBtn', 'aria-expanded': 'false', 'aria-controls': 'panel-fix' }, 'This analysis is wrong') as HTMLButtonElement;
    const fix = buildCorrectionForm(m);
    if (m.tokenCount !== 1 || !m.itemIds.length) { wrong.disabled = true; wrong.title = 'Corrections are for a single word.'; }
    wrong.addEventListener('click', () => {
      const openNow = fix.hasAttribute('hidden');
      if (openNow) fix.removeAttribute('hidden'); else fix.setAttribute('hidden', '');
      wrong.setAttribute('aria-expanded', String(openNow));
      if (lastAnchor) place(lastAnchor);
    });

    const moreBtn = h('button', { type: 'button', class: 'moreBtn', 'aria-expanded': 'false', 'aria-controls': 'panel-more' }, 'More') as HTMLButtonElement;
    const more = h('div', { class: 'more', id: 'panel-more', hidden: '' });
    fillMore(more, m);
    moreBtn.addEventListener('click', () => {
      const openNow = more.hasAttribute('hidden');
      if (openNow) more.removeAttribute('hidden'); else more.setAttribute('hidden', '');
      moreBtn.setAttribute('aria-expanded', String(openNow));
      moreBtn.textContent = openNow ? 'Less' : 'More';
      if (lastAnchor) place(lastAnchor);
    });

    statusEl = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' }, '');
    feedbackEl = h('div', { class: 'feedback', role: 'status', 'aria-live': 'polite' }, '');
    const actionsRow = h('div', { class: 'actions' }, say, layers.morphology.btn, layers['phrase-syntax'].btn, layers.grammar.btn, layers.sentence.btn, save, wrong, moreBtn);
    parts = { rows, pronNote, say, layers, fix, save, wrong };
    const wrapper = h('div', {}, top, word, rows, actionsRow, pronNote, layers.morphology.panel, layers['phrase-syntax'].panel, layers.grammar.panel, layers.sentence.panel, fix, more, feedbackEl, statusEl);
    mountCard(wrapper, `GoLearn: ${m.surface}`);
    renderAll();
    pron.off = pronouncer.onChange?.(() => { checkPronunciation(renderToken); });
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
      const target = root!.querySelector<HTMLElement>('.say:not([disabled]), .layerBtn, .close') ?? card!;
      target.focus();
      movedFocus = true;
    }
    return p;
  }

  function update(patch: Partial<CardView>): void {
    if (!open || !model || !parts) return;
    view = { ...view, ...patch };
    renderRows(); renderPanels(); renderSaved();
    if (lastAnchor) place(lastAnchor);
  }

  function showMessage(text: string, anchor: PopupAnchor, kind: 'info' | 'error' = 'info'): Placement {
    renderToken++;
    model = undefined; parts = undefined; statusEl = undefined; feedbackEl = undefined;
    pron.off?.(); pron = { available: false, note: '', playing: false, plays: 0 };
    const top = h('div', { class: 'top' }, h('span', { class: 'brand' }, 'GoLearn'), closeButton());
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
    try { pronouncer.stop?.(); } catch { /* nothing playing */ }
    host?.remove();
    host = undefined; root = undefined; card = undefined; statusEl = undefined; feedbackEl = undefined; lastAnchor = undefined;
    model = undefined; parts = undefined;
    if (movedFocus && prevFocus instanceof HTMLElement && prevFocus.isConnected) { try { prevFocus.focus(); } catch { /* */ } }
    prevFocus = null; movedFocus = false;
    if (wasOpen) options.onDismiss?.(reason);
  }

  return {
    show, update, showMessage, reposition, setRecorded, setFeedback, dismiss,
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

function fillMore(more: HTMLElement, m: CardModel): void {
  const doc = more.ownerDocument;
  const section = (title: string, items: string[]) => {
    if (!items.length) return;
    const h4 = doc.createElement('h4'); h4.textContent = title; more.append(h4);
    const ul = doc.createElement('ul');
    for (const t of items) { const li = doc.createElement('li'); li.textContent = t; ul.append(li); }
    more.append(ul);
  };
  section('Why this reading', m.basis);
  section('Phrases', m.phrases.map((p) => `${p.display} (${p.kind}${p.gloss ? `: ${p.gloss}` : ''}) · ${p.confidence.toFixed(2)}`));
  section('Other readings', m.alternatives.map((a) => `${a.lemma ?? '?'}${a.pos ? ` (${a.pos})` : ''}${a.gloss ? ` – ${a.gloss}` : ''} · ${a.confidence.toFixed(2)}`));
  section('Notes', m.notes);
  section('Sound', m.pronunciation);
  const c = m.context;
  section('Context', [`${c.kind === 'none' ? 'none (word alone)' : c.kind}${c.kind !== 'none' ? ` · confidence ${c.confidence.toFixed(2)}` : ''}${c.reason ? ` · ${c.reason}` : ''}`]);
  section('Limits', m.limits);
  section('Labels', ['fact: what you selected and how the context was got', 'analysis: the reading, machine-drafted, unchecked', 'inference: an estimate about you from your own learning history']);
}

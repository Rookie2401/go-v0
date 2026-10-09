/**
 * The card: a Shadow DOM popup on a fixed-position host appended to <body>. No page style reaches it and none of its
 * style reaches the page; it never changes the page's text, colours or layout (position: fixed, no reflow). All text
 * that reaches the DOM is set with textContent, never as markup. Dismissed by Escape, a click outside, or the close
 * button. Tab cycles inside the card while focus is in it.
 */
import { GOLEARN_HOST_ATTR, type PopupAnchor } from '../contract/readerAdapter';
import type { CardModel, EvidenceLabel } from '../parser/cardModel';

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
  speech?: SpeechLike | null;
  makeUtterance?: (text: string, voice: VoiceLike) => unknown;
  onDismiss?: (reason: DismissReason) => void;
}

export interface Placement { top: number; left: number; placement: 'below' | 'above' }

export interface CardUI {
  show(card: CardModel, anchor: PopupAnchor, opts?: { focus?: boolean }): Placement;
  showMessage(text: string, anchor: PopupAnchor, kind?: 'info' | 'error'): Placement;
  reposition(anchor: PopupAnchor): Placement | undefined;
  setRecorded(status: RecordStatus): void;
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
  position: fixed; width: min(${CARD_WIDTH}px, calc(100vw - ${MARGIN * 2}px)); max-height: min(70vh, 480px); overflow: auto;
  font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1b1b1f; background: #fffdf8;
  border: 1px solid #c9c2b4; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.22); padding: 10px 12px; text-align: start;
}
.card:focus { outline: none; }
@media (prefers-color-scheme: dark) { .card { color: #ececf1; background: #25262b; border-color: #4a4b54; } .tag { background: #3a3b44; color: #cfd0d8; } button { color: #ececf1; background: #34353d; border-color: #5a5b66; } }
.top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.brand { font-size: 11px; letter-spacing: .04em; text-transform: uppercase; opacity: .7; }
.word { font-size: 20px; font-weight: 650; margin: 2px 0 6px; overflow-wrap: anywhere; }
.row { display: flex; gap: 8px; align-items: baseline; margin: 3px 0; }
.k { min-width: 5.2em; font-size: 12px; opacity: .65; }
.v { flex: 1; overflow-wrap: anywhere; }
.tag { font-size: 10px; padding: 0 6px; border-radius: 8px; background: #ece7da; color: #5a5446; white-space: nowrap; }
.muted { opacity: .72; }
.actions { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; align-items: center; }
button { font: inherit; font-size: 13px; padding: 3px 10px; border-radius: 6px; border: 1px solid #b9b2a3; background: #f2eee3; color: #1b1b1f; cursor: pointer; }
button:disabled { opacity: .5; cursor: not-allowed; }
button:focus-visible { outline: 2px solid #2b6cb0; outline-offset: 2px; }
.close { padding: 0 8px; font-size: 16px; line-height: 1.3; }
.more { margin-top: 8px; border-top: 1px solid #ddd6c6; padding-top: 6px; font-size: 13px; }
.more[hidden] { display: none; }
.more h4 { margin: 8px 0 2px; font-size: 12px; opacity: .7; font-weight: 600; }
.more ul { margin: 0; padding-inline-start: 18px; }
.status { margin-top: 8px; font-size: 12px; opacity: .8; min-height: 1.2em; }
.note { font-size: 12px; margin-top: 4px; opacity: .8; }
.msg { margin: 4px 0; }
.err { color: #9b1c1c; }
@media (prefers-color-scheme: dark) { .err { color: #ff9a9a; } .more { border-color: #44454e; } }
`;

type Child = Node | string | null | undefined | false;

export function createCardUI(options: CardUIOptions = {}): CardUI {
  const doc = options.doc ?? document;
  const speech = options.speech === undefined ? ((globalThis as { speechSynthesis?: SpeechLike }).speechSynthesis ?? null) : options.speech;
  const makeUtterance = options.makeUtterance ?? ((text: string, voice: VoiceLike) => {
    const U = (globalThis as { SpeechSynthesisUtterance?: new (t: string) => { voice?: unknown; lang?: string } }).SpeechSynthesisUtterance;
    if (!U) return undefined;
    const u = new U(text);
    u.voice = voice; u.lang = voice.lang;
    return u;
  });

  let host: HTMLElement | undefined;
  let root: ShadowRoot | undefined;
  let card: HTMLElement | undefined;
  let statusEl: HTMLElement | undefined;
  let open = false;
  let prevFocus: Element | null = null;
  let movedFocus = false;
  let voicesCb: (() => void) | undefined;
  let cleanup: Array<() => void> = [];

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
    if (e.key !== 'Tab' || !root) return;
    const focusables = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')).filter((el) => !el.closest('[hidden]'));
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = root.activeElement as HTMLElement | null;
    if (e.shiftKey && (active === first || active === card)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }

  function closeButton(): HTMLElement {
    const b = h('button', { class: 'close', type: 'button', 'aria-label': 'Close GoLearn card' }, '×');
    b.addEventListener('click', () => dismiss('close'));
    return b;
  }

  function tag(label: EvidenceLabel): HTMLElement { return h('span', { class: 'tag', title: LABEL_HELP[label] }, label); }

  function row(key: string, value: string, label: EvidenceLabel, muted = false): HTMLElement {
    return h('div', { class: 'row' }, h('span', { class: 'k' }, key), h('span', { class: muted ? 'v muted' : 'v' }, value), tag(label));
  }

  function voiceFor(): VoiceLike | undefined {
    try { return speech?.getVoices().find((v) => /^(sq|als|alb)(-|_|$)/i.test(v.lang) && v.localService !== false); } catch { return undefined; }
  }

  function show(model: CardModel, anchor: PopupAnchor, opts: { focus?: boolean } = {}): Placement {
    const l = model.labels;
    const top = h('div', { class: 'top' }, h('span', { class: 'brand' }, 'GoLearn · Albanian · prototype'), closeButton());
    const word = h('div', { class: 'word', dir: model.context.direction === 'rtl' ? 'rtl' : 'auto' }, model.surface);
    const rows: HTMLElement[] = [];
    const lemmaText = model.lemma ? (model.pos ? `${model.lemma} (${model.pos})` : model.lemma) : '';
    if (model.lemma) rows.push(row(model.unconfirmed ? 'lemma (guess)' : 'lemma', lemmaText, l.lemma));
    if (model.gloss) rows.push(row('meaning', model.gloss, l.gloss));
    else rows.push(row('meaning', model.provenance === 'none' ? 'Not in the word list.' : 'No meaning given.', l.gloss, true));
    if (model.morphology) rows.push(row('form', model.morphology, l.morphology));
    const src = model.source ? ` · ${model.source.label} (${model.source.reviewStatus})` : '';
    rows.push(row('confidence', `${model.confidence.toFixed(2)} · ${model.provenance}${src}`, l.confidence, true));
    if (model.words.length > 1) {
      const ul = h('ul', {}, ...model.words.map((w) => h('li', {}, `${w.surface}: ${w.lemma ?? 'unknown'}${w.gloss ? ` – ${w.gloss}` : ''} (${w.confidence.toFixed(2)})`)));
      rows.push(h('div', { class: 'more-inline' }, ul));
    }

    const speakText = model.surface.length <= 200 ? model.surface : '';
    const voice = voiceFor();
    const say = h('button', { type: 'button', class: 'say', 'aria-label': 'Pronounce (practice only)' }, 'Pronounce (practice)') as HTMLButtonElement;
    const sayNote = h('div', { class: 'note' }, '');
    const refreshVoice = () => {
      const v = voiceFor();
      if (v && speakText) { say.disabled = false; sayNote.textContent = 'Practice only: a local system voice, not a checked pronunciation. Nothing is sent anywhere.'; }
      else { say.disabled = true; sayNote.textContent = speech ? 'No local Albanian voice on this device, so there is nothing to play (remote voices are not used).' : 'Speech is not available in this browser.'; }
    };
    say.disabled = !(voice && speakText);
    refreshVoice();
    say.addEventListener('click', () => {
      const v = voiceFor();
      if (!v || !speech || !speakText) return;
      const u = makeUtterance(speakText, v);
      if (u) { speech.cancel(); speech.speak(u); }
    });
    if (speech?.addEventListener) { voicesCb = refreshVoice; speech.addEventListener('voiceschanged', voicesCb); }

    const moreBtn = h('button', { type: 'button', class: 'moreBtn', 'aria-expanded': 'false' }, 'More') as HTMLButtonElement;
    const more = h('div', { class: 'more', hidden: '' });
    fillMore(more, model);
    moreBtn.addEventListener('click', () => {
      const openNow = more.hasAttribute('hidden');
      if (openNow) more.removeAttribute('hidden'); else more.setAttribute('hidden', '');
      moreBtn.setAttribute('aria-expanded', String(openNow));
      moreBtn.textContent = openNow ? 'Less' : 'More';
      if (lastAnchor) place(lastAnchor);
    });
    statusEl = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' }, '');
    const actions = h('div', { class: 'actions' }, say, moreBtn);

    const wrapper = h('div', {}, top, word, ...rows, actions, sayNote, more, statusEl);
    mountCard(wrapper, `GoLearn: ${model.surface}`);
    return finish(anchor, opts);
  }

  let lastAnchor: PopupAnchor | undefined;

  function finish(anchor: PopupAnchor, opts: { focus?: boolean } = {}): Placement {
    lastAnchor = anchor;
    open = true;
    listen();
    const p = place(anchor);
    if (opts.focus) {
      prevFocus = doc.activeElement;
      const target = root!.querySelector<HTMLElement>('.say:not([disabled]), .moreBtn, .close') ?? card!;
      target.focus();
      movedFocus = true;
    }
    return p;
  }

  function showMessage(text: string, anchor: PopupAnchor, kind: 'info' | 'error' = 'info'): Placement {
    statusEl = undefined;
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

  function dismiss(reason: DismissReason): void {
    const wasOpen = open;
    open = false;
    for (const off of cleanup) off();
    cleanup = [];
    if (voicesCb && speech?.removeEventListener) speech.removeEventListener('voiceschanged', voicesCb);
    voicesCb = undefined;
    try { speech?.cancel(); } catch { /* nothing playing */ }
    host?.remove();
    host = undefined; root = undefined; card = undefined; statusEl = undefined; lastAnchor = undefined;
    if (movedFocus && prevFocus instanceof HTMLElement && prevFocus.isConnected) { try { prevFocus.focus(); } catch { /* */ } }
    prevFocus = null; movedFocus = false;
    if (wasOpen) options.onDismiss?.(reason);
  }

  return {
    show, showMessage, reposition, setRecorded, dismiss,
    isOpen: () => open,
    host: () => host,
    root: () => root,
    destroy: () => dismiss('disposed'),
  };
}

const LABEL_HELP: Record<EvidenceLabel, string> = {
  fact: 'Observed directly: what you selected, or how the context was obtained.',
  analysis: 'The parser’s best reading with its confidence. Machine-drafted and not checked by a native speaker.',
  inference: 'An estimate about you. Not used in this prototype.',
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
  section('Labels', ['fact: what you selected and how the context was got', 'analysis: the reading, machine-drafted, unchecked', 'inference: not used here']);
}

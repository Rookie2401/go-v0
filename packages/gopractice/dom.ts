/**
 * A tiny element builder. Everything the learner or the service supplies reaches the DOM through `textContent`
 * (never as markup), so no screen can be made to render injected HTML.
 */
export type Child = Node | string | number | null | undefined | false | readonly Child[];
export type Props = Record<string, string | number | boolean | undefined | ((e: Event) => void)>;

export function h(tag: string, props: Props = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) { append(el, c as Child[]); continue; }
    el.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : (c as Node));
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export const p = (text: string, cls?: string): HTMLElement => h('p', cls ? { class: cls } : {}, text);

/** A labelled form control: <label> wrapping a caption and the control. */
export function field(caption: string, control: HTMLElement, help?: string): HTMLElement {
  return h('label', { class: 'field' }, h('span', { class: 'cap' }, caption), control, help ? h('span', { class: 'help' }, help) : null);
}

export function button(text: string, onClick: (e: Event) => void, props: Props = {}): HTMLButtonElement {
  return h('button', { type: 'button', ...props, onclick: onClick }, text) as HTMLButtonElement;
}

/** A status line that screen readers announce. */
export function statusLine(): HTMLElement {
  return h('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
}

/** `text` may be a list of children, so a status sentence can carry a target-language word in its own `lang` span (see `embedTarget`). */
export function setStatus(el: HTMLElement, text: string | readonly Child[], kind: 'info' | 'ok' | 'error' = 'info'): void {
  if (typeof text === 'string') el.textContent = text;
  else { clear(el); append(el, [...text]); }
  el.setAttribute('data-kind', kind);
}

export function listOf(items: Child[], cls?: string): HTMLElement {
  return h('ul', cls ? { class: cls } : {}, ...items.map((i) => h('li', {}, i)));
}

/** A disclosure: the summary is always visible, the body is created on first open when `lazy` is given. */
export function disclosure(summary: string, body: Node | (() => Node), props: Props = {}): HTMLElement {
  if (typeof body !== 'function') return h('details', props, h('summary', {}, summary), body);
  const d = h('details', props, h('summary', {}, summary));
  let filled = false;
  d.addEventListener('toggle', () => {
    if (filled || !(d as HTMLDetailsElement).open) return;
    filled = true;
    d.append(body());
  });
  return d;
}

export const shortDate = (iso: string | undefined): string => {
  if (!iso) return 'never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
};

/** Text direction of a language: right to left for the scripts that need it. */
const RTL = new Set(['ar', 'he', 'fa', 'ur', 'yi', 'ps', 'sd', 'ug', 'dv', 'ckb', 'syr', 'arc']);
export const directionOf = (languageId: string): 'ltr' | 'rtl' => (RTL.has(languageId.split('-')[0].toLowerCase()) ? 'rtl' : 'ltr');

/** `lang` and `dir` attributes for target-language text. */
export const langProps = (languageTag: string | undefined): Props =>
  languageTag ? { lang: languageTag, dir: directionOf(languageTag), class: 'target-text' } : {};

const escapeRe = (w: string): string => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A sentence in the interface language that quotes target-language words: each occurrence of one of `words` becomes
 * `<span lang dir class="target-text">`, the rest stays text, so a screen reader switches voice for the word and back
 * (WCAG 3.1.2). A word matches whole (not inside a longer word) and case-insensitively; `words` that are empty are ignored.
 * Without a language tag, or without a match, the text is returned as one string.
 */
export function embedTarget(text: string, words: ReadonlyArray<string | undefined>, languageTag: string | undefined): Child[] {
  const list = [...new Set(words.filter((w): w is string => !!w && w.length > 0))].sort((a, b) => b.length - a.length);
  if (!languageTag || !list.length || !text) return [text];
  const re = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(${list.map(escapeRe).join('|')})(?![\\p{L}\\p{M}\\p{N}])`, 'giu');
  const out: Child[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push(h('span', langProps(languageTag), m[0]));
    last = at + m[0].length;
  }
  if (!out.length) return [text];
  if (last < text.length) out.push(text.slice(last));
  return out;
}

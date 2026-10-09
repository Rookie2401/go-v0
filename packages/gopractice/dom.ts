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

export function setStatus(el: HTMLElement, text: string, kind: 'info' | 'ok' | 'error' = 'info'): void {
  el.textContent = text;
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

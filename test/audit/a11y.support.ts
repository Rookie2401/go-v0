/**
 * Shared support for the ACCESSIBILITY audit (docs/ecosystem/audit/ACCESSIBILITY.md). Nothing here is imported by product code.
 *
 * Three tools:
 *   1. `auditDom(root, screen)`   a small, honest DOM audit for jsdom: accessible names (a simplified accname: aria-labelledby, aria-label,
 *                                 <label>, content, alt, value, then title/placeholder reported as WEAK), ids and references, heading and
 *                                 landmark structure, roles that are not focusable, positive tabindex, radio groups, `lang` on target-language
 *                                 text, autocomplete on identity fields, live regions on status text, repeated ambiguous control names.
 *   2. a CSS reader               `parseCss`, font-size accounting (px / rem / em), `:focus-visible` and outline accounting.
 *   3. WCAG contrast              relative luminance, `contrast(fg, bg)`, colour mixing and alpha compositing, so the ratios are computed from
 *                                 the colour values that are IN the stylesheets (read from the files, never typed here).
 *
 * jsdom has no layout, no cascade for linked stylesheets and no accessibility tree. What this cannot see is listed in the report.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll } from 'vitest';

// ───────────────────────────── findings and rows ─────────────────────────────

export type Severity = 'blocker' | 'serious' | 'moderate' | 'minor';
export interface Finding { rule: string; severity: Severity; screen: string; where: string; detail: string }

const found: Finding[] = [];
export const allFindings = (): Finding[] => found;

export interface A11yRow { id: string; area: string; what: string; result: string; detail?: string }
const rows: A11yRow[] = [];
export function row(id: string, area: string, what: string, result: string, detail?: string): void { rows.push({ id, area, what, result, ...(detail ? { detail } : {}) }); }

/** Call once at the top level of a lane: prints the rows and findings of the file and writes them when A11Y_ROWS_DIR is set. */
export function flushAfterAll(file: string, title: string): void {
  afterAll(() => {
    const byRule = new Map<string, Finding[]>();
    for (const f of found) (byRule.get(`${f.rule} | ${f.severity}`) ?? byRule.set(`${f.rule} | ${f.severity}`, []).get(`${f.rule} | ${f.severity}`)!).push(f);
    const lines = [...byRule.entries()].map(([k, v]) => `  ${k}: ${v.length} on ${[...new Set(v.map((x) => x.screen))].join(', ')}`);
    console.log(`\n${title}\n${rows.map((r) => `  ${r.id} [${r.area}] ${r.what}: ${r.result}${r.detail ? ` (${r.detail})` : ''}`).join('\n')}\n${lines.length ? `findings by rule:\n${lines.join('\n')}` : 'no findings'}\n`);
    const dir = process.env.A11Y_ROWS_DIR;
    if (!dir) return;
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${file}.json`), JSON.stringify({ rows, findings: found }, null, 1));
  });
}

// ───────────────────────────── DOM helpers ─────────────────────────────

const describe = (el: Element): string => {
  const id = el.id ? `#${el.id}` : '';
  const cls = el.classList.length ? `.${[...el.classList].slice(0, 2).join('.')}` : '';
  const data = [...el.attributes].filter((a) => /^data-(act|unit|route|choice|open|export|delete|level|issue|row|layer)/.test(a.name)).slice(0, 1).map((a) => `[${a.name}="${a.value.slice(0, 30)}"]`).join('');
  return `${el.tagName.toLowerCase()}${id}${cls}${data}`;
};

const rootOf = (el: Element): Document | ShadowRoot => el.getRootNode() as Document | ShadowRoot;
const byId = (el: Element, id: string): Element | null => rootOf(el).querySelector(`[id="${id.replace(/["\\]/g, '\\$&')}"]`);

export function isHidden(el: Element): boolean {
  for (let n: Element | null = el; n; n = n.parentElement ?? ((n.getRootNode() as ShadowRoot).host ?? null)) {
    if (n.hasAttribute('hidden') || n.getAttribute('aria-hidden') === 'true' || n.hasAttribute('inert')) return true;
    const st = (n as HTMLElement).style;
    if (st && (st.display === 'none' || st.visibility === 'hidden')) return true;
  }
  return false;
}

const INTERACTIVE_ROLES = new Set(['button', 'link', 'tab', 'checkbox', 'radio', 'switch', 'menuitem', 'option', 'combobox', 'textbox', 'slider', 'spinbutton', 'treeitem']);
const NATIVE_FOCUSABLE = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [contenteditable=""], [contenteditable="true"]';
const FIELDS = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea';

function contentText(el: Element): string {
  let out = '';
  for (const n of el.childNodes) {
    if (n.nodeType === 3) out += (n as Text).data;
    else if (n.nodeType === 1) {
      const c = n as Element;
      if (c.getAttribute('aria-hidden') === 'true' || c.hasAttribute('hidden')) continue;
      if (c.tagName === 'IMG') out += c.getAttribute('alt') ?? '';
      else if (c.hasAttribute('aria-label') && c.getAttribute('aria-label')!.trim()) out += c.getAttribute('aria-label');
      else if (c.tagName === 'SELECT' || c.tagName === 'TEXTAREA') continue;
      else out += contentText(c);
      out += ' ';
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

export interface Name { name: string; source: 'aria-labelledby' | 'aria-label' | 'label' | 'content' | 'alt' | 'value' | 'title' | 'placeholder' | 'none' }

/** A simplified accessible-name computation (enough to tell "has a proper name" from "has none or only a hint"). */
export function accessibleName(el: Element): Name {
  const lb = el.getAttribute('aria-labelledby');
  if (lb) {
    const t = lb.split(/\s+/).map((id) => { const r = byId(el, id); return r ? (r.getAttribute('aria-label') ?? contentText(r)) : ''; }).join(' ').replace(/\s+/g, ' ').trim();
    if (t) return { name: t, source: 'aria-labelledby' };
  }
  const al = el.getAttribute('aria-label')?.trim();
  if (al) return { name: al, source: 'aria-label' };
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (['button', 'submit', 'reset'].includes(type)) { const v = el.getAttribute('value')?.trim(); if (v) return { name: v, source: 'value' }; }
    if (type === 'image') { const a = el.getAttribute('alt')?.trim(); if (a) return { name: a, source: 'alt' }; }
    const labels = (el as HTMLInputElement).labels ? [...(el as HTMLInputElement).labels!] : [];
    const lt = labels.map((l) => contentText(l)).join(' ').replace(/\s+/g, ' ').trim();
    if (lt) return { name: lt, source: 'label' };
  } else {
    const t = contentText(el);
    if (t) return { name: t, source: 'content' };
    if (tag === 'IMG') { const a = el.getAttribute('alt')?.trim(); if (a) return { name: a, source: 'alt' }; }
  }
  const title = el.getAttribute('title')?.trim();
  if (title) return { name: title, source: 'title' };
  const ph = el.getAttribute('placeholder')?.trim();
  if (ph) return { name: ph, source: 'placeholder' };
  return { name: '', source: 'none' };
}

export const isFocusable = (el: Element): boolean => {
  if (isHidden(el) || el.hasAttribute('disabled')) return false;
  const ti = el.getAttribute('tabindex');
  if (ti !== null && Number(ti) < 0) return false;
  return el.matches(NATIVE_FOCUSABLE) || (ti !== null && Number.isFinite(Number(ti)));
};

/** Elements that are in the tab sequence, in DOM order (no positive tabindex is ever used by the product; the audit flags it). */
export const tabSequence = (root: ParentNode): Element[] => [...root.querySelectorAll('*')].filter((e) => isFocusable(e) && !(e.getAttribute('tabindex') === '-1'));

const NON_LATIN_TARGET = /[\u0900-\u097F\u0E00-\u0E7F\u0600-\u06FF\u0590-\u05FF\u0400-\u04FF\u0370-\u03FF]/u;

export interface AuditOptions {
  /** Language of the page chrome (default 'en'). Text in another script needs a `lang`. */
  chromeLang?: string;
  /** Skip rules that only make sense for a whole page (single h1, one main). */
  fragment?: boolean;
  /** Skip the repeated-ambiguous-name rule (e.g. for a single card). */
  skipRepeated?: boolean;
  /** Words of the target language known to be on the screen (Latin-script languages cannot be recognised by script). */
  targetWords?: string[];
  /** The language tag those words should carry (e.g. 'sq'). */
  targetLang?: string;
  /** Do not add the findings to the global list (the auditor's own self-test). */
  record?: boolean;
}

export interface AuditStats { controls: number; fields: number; headings: number; liveRegions: number; focusable: number }

export function auditDom(root: ParentNode, screen: string, opts: AuditOptions = {}): { findings: Finding[]; stats: AuditStats } {
  const out: Finding[] = [];
  const add = (rule: string, severity: Severity, el: Element | undefined, detail: string): void => { out.push({ rule, severity, screen, where: el ? describe(el) : '(screen)', detail }); };
  const all = [...root.querySelectorAll('*')];
  const visible = all.filter((e) => !isHidden(e));

  // 1. every interactive control has a name; every field has a label (a hint is not a label)
  const controlSel = `${NATIVE_FOCUSABLE}, ${[...INTERACTIVE_ROLES].map((r) => `[role="${r}"]`).join(', ')}`;
  const controls = visible.filter((e) => e.matches(controlSel) && e.getAttribute('role') !== 'presentation');
  for (const el of controls) {
    const n = accessibleName(el);
    const isField = el.matches(FIELDS);
    if (n.source === 'none') add(isField ? 'field-label' : 'control-name', 'blocker', el, `no accessible name (${isField ? 'no <label>, aria-label or aria-labelledby' : 'no text, aria-label or alt'})`);
    else if (n.source === 'title' || n.source === 'placeholder') add(isField ? 'field-label' : 'control-name', 'moderate', el, `named only by ${n.source}: "${n.name.slice(0, 40)}"`);
  }
  const fields = visible.filter((e) => e.matches(FIELDS));

  // 2. native or role+tabindex: a role that makes it a control must be focusable; a bare tabindex needs a role
  for (const el of visible) {
    const role = el.getAttribute('role');
    if (role && INTERACTIVE_ROLES.has(role) && !el.matches(NATIVE_FOCUSABLE) && el.getAttribute('tabindex') === null && !el.closest('[role="radiogroup"], [role="tablist"], [role="listbox"]')) add('role-not-focusable', 'serious', el, `role="${role}" on a non-focusable element`);
    const ti = el.getAttribute('tabindex');
    if (ti !== null && Number(ti) > 0) add('positive-tabindex', 'serious', el, `tabindex="${ti}" overrides the DOM order`);
    if (ti === '0' && !role && !el.matches(NATIVE_FOCUSABLE)) add('focusable-no-role', 'moderate', el, 'tabindex="0" on an element with no role');
  }

  // 3. ids and references
  const seen = new Map<string, Element>();
  for (const el of all) {
    if (!el.id) continue;
    if (seen.has(el.id)) add('duplicate-id', 'serious', el, `id "${el.id}" is used twice`); else seen.set(el.id, el);
  }
  for (const el of all) {
    for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns']) {
      const v = el.getAttribute(attr);
      if (!v) continue;
      for (const id of v.split(/\s+/)) if (!byId(el, id)) add('dangling-reference', 'serious', el, `${attr}="${id}" names no element`);
    }
    if (el.tagName === 'LABEL' && el.getAttribute('for') && !byId(el, el.getAttribute('for')!)) add('dangling-reference', 'serious', el, `label for="${el.getAttribute('for')}" names no element`);
  }

  // 4. headings and landmarks
  const headings = visible.filter((e) => /^H[1-6]$/.test(e.tagName));
  let prev = 0;
  for (const h of headings) {
    const level = Number(h.tagName[1]);
    if (!contentText(h)) add('empty-heading', 'moderate', h, 'heading with no text');
    if (prev && level > prev + 1) add('heading-skip', 'minor', h, `h${prev} followed by h${level}`);
    prev = level;
  }
  if (!opts.fragment) {
    const h1s = headings.filter((h) => h.tagName === 'H1');
    if (h1s.length !== 1) add('h1-count', 'moderate', undefined, `${h1s.length} h1 elements (expected 1)`);
    const mains = visible.filter((e) => e.tagName === 'MAIN' || e.getAttribute('role') === 'main');
    if (mains.length !== 1) add('main-landmark', 'serious', undefined, `${mains.length} main landmarks (expected 1)`);
    const navs = visible.filter((e) => e.tagName === 'NAV' || e.getAttribute('role') === 'navigation');
    if (navs.length > 1) for (const n of navs) if (!accessibleName(n).name) add('nav-name', 'moderate', n, 'several navigation landmarks, this one has no label');
  }

  // 5. images
  for (const img of visible.filter((e) => e.tagName === 'IMG')) if (!img.hasAttribute('alt')) add('img-alt', 'serious', img, 'img without alt');

  // 6. radio groups need a group name
  const radioNames = new Set(fields.filter((e) => (e as HTMLInputElement).type === 'radio').map((e) => (e as HTMLInputElement).name));
  for (const name of radioNames) {
    const first = fields.find((e) => (e as HTMLInputElement).type === 'radio' && (e as HTMLInputElement).name === name)!;
    const group = first.closest('fieldset, [role="radiogroup"], [role="group"]');
    const label = group ? (group.tagName === 'FIELDSET' ? group.querySelector('legend') : null) ?? (accessibleName(group).name ? group : null) : null;
    if (!group || !label) add('radio-group-name', 'moderate', first, `radio group "${name}" has no fieldset/legend or labelled radiogroup`);
  }

  // 7. identity fields should say what they are for (WCAG 1.3.5)
  for (const el of fields) {
    const type = (el as HTMLInputElement).type;
    if ((type === 'email' || type === 'password') && !el.getAttribute('autocomplete')) add('autocomplete', 'minor', el, `${type} field without an autocomplete attribute`);
  }

  // 8. status text should be a live region
  for (const el of visible.filter((e) => e.classList.contains('status') || e.classList.contains('feedback'))) {
    const live = el.closest('[role="status"], [role="alert"], [aria-live]');
    if (!live) add('status-not-live', 'moderate', el, 'status text that changes is not in a live region (role=status/alert or aria-live)');
  }

  // 9. language of target-language text
  const chrome = (opts.chromeLang ?? 'en').toLowerCase();
  for (const el of visible.filter((e) => e.classList.contains('target-text'))) {
    if (!el.closest('[lang]')?.getAttribute('lang')) add('target-lang', 'serious', el, 'class target-text without a lang attribute');
  }
  const walker = (root as Document | Element).ownerDocument?.createTreeWalker?.(root as Node, 4) ?? (root as Document).createTreeWalker?.(root as Node, 4);
  if (walker) {
    const reported = new Set<Element>();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n as Text;
      const host = t.parentElement;
      if (!host || reported.has(host) || !NON_LATIN_TARGET.test(t.data) || isHidden(host)) continue;
      const lang = host.closest('[lang]')?.getAttribute('lang')?.toLowerCase();
      if (!lang || lang.split('-')[0] === chrome) { reported.add(host); add('script-without-lang', 'serious', host, `non-Latin text "${t.data.trim().slice(0, 24)}" in an element whose language is ${lang ?? 'undeclared'}`); }
    }
  }

  // 9b. known target-language words (Latin script): the word alone in an element, or embedded in a sentence of the chrome language
  if (opts.targetWords?.length && opts.targetLang) {
    const want = opts.targetLang.toLowerCase().split('-')[0];
    const words = new Set(opts.targetWords.map((w) => w.toLowerCase()));
    const w2 = (root as Document | Element).ownerDocument?.createTreeWalker?.(root as Node, 4) ?? (root as Document).createTreeWalker?.(root as Node, 4);
    const reported = new Set<Element>();
    for (let n = w2?.nextNode(); n; n = w2?.nextNode()) {
      const t = n as Text;
      const host = t.parentElement;
      if (!host || reported.has(host) || isHidden(host) || host.tagName === 'SCRIPT' || host.tagName === 'STYLE') continue;
      const tokens = t.data.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
      const hit = tokens.find((x) => words.has(x));
      if (!hit) continue;
      const lang = host.closest('[lang]')?.getAttribute('lang')?.toLowerCase().split('-')[0];
      if (lang === want) continue;
      reported.add(host);
      const alone = t.data.trim().toLowerCase().replace(/[^\p{L}\s]/gu, '').trim() === hit;
      add(alone ? 'target-lang' : 'embedded-target-word', alone ? 'serious' : 'minor', host, `"${hit}" (${opts.targetLang}) in ${alone ? 'an element of its own' : `the sentence "${t.data.trim().slice(0, 50)}"`} whose language is ${lang ?? 'undeclared'}`);
    }
  }

  // 10. repeated, ambiguous control names (same name, different target)
  if (!opts.skipRepeated) {
    const groups = new Map<string, Element[]>();
    for (const el of controls.filter((e) => e.matches('button, a[href], [role="button"], [role="link"]'))) {
      const n = accessibleName(el).name.toLowerCase();
      if (!n) continue;
      (groups.get(n) ?? groups.set(n, []).get(n)!).push(el);
    }
    for (const [name, els] of groups) {
      if (els.length < 2) continue;
      const contexts = new Set(els.map((e) => `${e.getAttribute('href') ?? ''}|${[...all].indexOf(e.closest('li, tr, [data-unit], [data-item], [data-draft]') ?? e.parentElement ?? e)}`));
      if (contexts.size > 1) add('repeated-name', 'minor', els[0], `${els.length} controls are all named "${name}" and act on different list items: each is understood from its list item (WCAG 2.4.4 passes in context), but a list of controls or links cannot tell them apart`);
    }
  }

  // 11. dialogs
  for (const el of visible.filter((e) => e.getAttribute('role') === 'dialog' || e.getAttribute('role') === 'alertdialog')) {
    if (!accessibleName(el).name) add('dialog-name', 'serious', el, 'dialog without a name');
  }

  const stats: AuditStats = { controls: controls.length, fields: fields.length, headings: headings.length, liveRegions: visible.filter((e) => e.matches('[role="status"], [role="alert"], [aria-live]')).length, focusable: tabSequence(root).length };
  if (opts.record !== false) found.push(...out);
  return { findings: out, stats };
}

// ───────────────────────────── CSS reader ─────────────────────────────

export interface CssRule { selector: string; decls: Record<string, string>; media: string[] }

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** A small CSS parser: rules and nested @media / @supports, declarations as a map (last wins). No @font-face / keyframes bodies. */
export function parseCss(css: string, media: string[] = []): CssRule[] {
  const src = stripComments(css);
  const out: CssRule[] = [];
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open < 0) break;
    const head = src.slice(i, open).trim();
    let depth = 1; let j = open + 1;
    while (j < src.length && depth) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
    const body = src.slice(open + 1, j - 1);
    if (head.startsWith('@media') || head.startsWith('@supports')) out.push(...parseCss(body, [...media, head.replace(/^@(media|supports)\s*/, '').trim()]));
    else if (head.startsWith('@')) { /* @font-face, @keyframes: ignored */ }
    else {
      const decls: Record<string, string> = {};
      for (const d of body.split(';')) { const k = d.indexOf(':'); if (k > 0) decls[d.slice(0, k).trim().toLowerCase()] = d.slice(k + 1).trim(); }
      for (const sel of head.split(',')) out.push({ selector: sel.trim(), decls, media });
    }
    i = j;
  }
  return out;
}

/** Unit of one length token: 'px' | 'rem' | 'em' | '%' | 'keyword' | 'var' | 'other'. */
export function unitOf(v: string): string {
  const t = v.trim().toLowerCase();
  if (/^-?[\d.]+px$/.test(t)) return 'px';
  if (/^-?[\d.]+rem$/.test(t)) return 'rem';
  if (/^-?[\d.]+em$/.test(t)) return 'em';
  if (/^-?[\d.]+%$/.test(t)) return '%';
  if (/^(x-small|small|medium|large|x-large|xx-large|smaller|larger|inherit|initial)$/.test(t)) return 'keyword';
  if (t.startsWith('var(') || t.startsWith('clamp(') || t.startsWith('calc(') || t.startsWith('min(') || t.startsWith('max(')) return 'var';
  return 'other';
}

export interface FontSizeUse { selector: string; media: string; via: 'font-size' | 'font'; value: string; unit: string }

/** Every font-size declaration (and the size inside a `font:` shorthand) in the rules. */
export function fontSizes(rules: CssRule[]): FontSizeUse[] {
  const out: FontSizeUse[] = [];
  for (const r of rules) {
    const media = r.media.join(' and ');
    if (r.decls['font-size'] !== undefined) out.push({ selector: r.selector, media, via: 'font-size', value: r.decls['font-size'], unit: unitOf(r.decls['font-size']) });
    const f = r.decls.font;
    if (f !== undefined && f !== 'inherit') {
      // font: [style] [weight] SIZE[/line-height] family...; take the first length token
      const m = /(?:^|\s)(-?[\d.]+(?:px|rem|em|%)|x-small|small|medium|large|x-large|xx-large|smaller|larger)(?:\/[\d.]+(?:px|rem|em|%)?)?(?=\s|$)/i.exec(f);
      if (m) out.push({ selector: r.selector, media, via: 'font', value: m[1], unit: unitOf(m[1]) });
    }
  }
  return out;
}

// ───────────────────────────── contrast ─────────────────────────────

export interface Rgba { r: number; g: number; b: number; a: number }

export function parseColor(input: string): Rgba {
  const v = input.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16), a: 1 };
  m = /^#([0-9a-f]{6})$/.exec(v);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
  m = /^#([0-9a-f]{8})$/.exec(v);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: parseInt(m[1].slice(6, 8), 16) / 255 };
  m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(v);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4] };
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (v === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (v === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  throw new Error(`unparsed colour: ${input}`);
}

/** `top` composited over an opaque `bottom`. */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a;
  return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 };
}

const lin = (c: number): number => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export const luminance = (c: Rgba): number => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
/** WCAG 2.x contrast ratio of two opaque colours. */
export function contrast(fg: Rgba, bg: Rgba): number {
  const a = luminance(fg); const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * A token environment: custom properties from the :root rules (light) with the dark overrides from the prefers-color-scheme: dark block.
 * `evalColor` resolves `var(--x)`, hex, rgb(), and `color-mix(in srgb, A p%, B|transparent)` against an opaque base.
 */
export function tokensOf(rules: CssRule[], scheme: 'light' | 'dark'): Record<string, string> {
  const t: Record<string, string> = {};
  for (const r of rules) {
    if (r.selector !== ':root') continue;
    const isDark = r.media.some((m) => m.includes('prefers-color-scheme: dark'));
    if (isDark && scheme !== 'dark') continue;
    if (r.media.length && !isDark) continue;
    for (const [k, v] of Object.entries(r.decls)) if (k.startsWith('--')) t[k] = v;
  }
  return t;
}

export function evalColor(expr: string, tokens: Record<string, string>, base: Rgba): Rgba {
  const e = expr.trim();
  const v = /^var\((--[\w-]+)\)$/.exec(e);
  if (v) { if (!(v[1] in tokens)) throw new Error(`unknown token ${v[1]}`); return evalColor(tokens[v[1]], tokens, base); }
  const mix = /^color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+)\)$/.exec(e);
  if (mix) {
    const a = evalColor(mix[1], tokens, base);
    const p = parseFloat(mix[2]) / 100;
    const other = mix[3].trim() === 'transparent' ? { ...a, a: 0 } : evalColor(mix[3], tokens, base);
    // mixing with transparent keeps the colour and scales the alpha (premultiplied interpolation)
    const alpha = a.a * p + other.a * (1 - p);
    const r = alpha === 0 ? 0 : (a.r * a.a * p + other.r * other.a * (1 - p)) / alpha;
    const g = alpha === 0 ? 0 : (a.g * a.a * p + other.g * other.a * (1 - p)) / alpha;
    const b = alpha === 0 ? 0 : (a.b * a.a * p + other.b * other.a * (1 - p)) / alpha;
    return over({ r, g, b, a: alpha }, base);
  }
  return over(parseColor(e), base);
}

/** The effective foreground of text drawn with `opacity` over `bg` (opacity applies to the whole element: text and its own background). */
export const withOpacity = (fg: Rgba, bg: Rgba, opacity: number): Rgba => over({ ...fg, a: opacity }, bg);

export const AA_TEXT = 4.5;
export const AA_LARGE_OR_UI = 3;

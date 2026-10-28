// @vitest-environment node
/**
 * ACCESSIBILITY audit, lane 1 of 4 (docs/ecosystem/audit/ACCESSIBILITY.md): the stylesheets, read as files.
 *   A-C01..    font sizes in px / rem / em, `:focus-visible`, outline removal, reduced motion, colour scheme
 *   A-K01..    WCAG contrast of the foreground/background pairs the stylesheets actually use, light and dark
 * Every colour comes from the stylesheet text (custom properties of :root, or the literal in the rule): none is typed here.
 * Defects are asserted with `it.fails` (the assertion states the CORRECT behaviour; it fails today, so the run stays green;
 * when the defect is fixed the test turns red and must be flipped to a plain `it`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AA_LARGE_OR_UI, AA_TEXT, contrast, evalColor, flushAfterAll, fontSizes, parseCss, row, tokensOf, withOpacity, over,
  type CssRule, type Rgba,
} from './a11y.support';

flushAfterAll('a11y.css', 'ACCESSIBILITY lane 1 (stylesheets)');

const REPO = path.resolve(__dirname, '../..');
const read = (rel: string): string => fs.readFileSync(path.join(REPO, rel), 'utf8');

/** The CSS inside a template literal assigned to `const CSS = \`...\`` in a TypeScript file. */
const cssFromTs = (rel: string): string => {
  const src = read(rel);
  const m = /const CSS = `([\s\S]*?)`;/.exec(src);
  if (!m) throw new Error(`no CSS literal in ${rel}`);
  return m[1].replace(/\$\{[^}]*\}/g, '0');
};
const styleFromHtml = (rel: string): string => /<style>([\s\S]*?)<\/style>/.exec(read(rel))?.[1] ?? '';

interface Sheet { key: string; label: string; css: string; rules: CssRule[] }
const sheet = (key: string, label: string, css: string): Sheet => ({ key, label, css, rules: parseCss(css) });
const SHEETS: Sheet[] = [
  sheet('practice', 'GoReview styles.css', read('packages/goreview/app/styles.css')),
  sheet('tell', 'GoTell workspace styles (screens/tell/styles.ts)', cssFromTs('packages/goreview/app/screens/tell/styles.ts')),
  sheet('app', 'GoLearn setup app styles.css', read('packages/golearn-extension/app/styles.css')),
  sheet('card', 'Lookup card (popup/card.ts, shadow DOM)', cssFromTs('packages/golearn-extension/src/popup/card.ts')),
  sheet('action', 'Action popup (action/popup.html <style>)', styleFromHtml('packages/golearn-extension/action/popup.html')),
];
const by = (key: string): Sheet => SHEETS.find((s) => s.key === key)!;

// ───────────────────────────── font sizes ─────────────────────────────

describe('font sizes: relative units or fixed pixels', () => {
  it.each(SHEETS.map((s) => [s.key, s] as const))('A-C01 %s: count of font-size declarations by unit', (_k, s) => {
    const uses = fontSizes(s.rules);
    const n = (u: string): number => uses.filter((x) => x.unit === u).length;
    const px = uses.filter((x) => x.unit === 'px');
    const smallest = px.map((x) => parseFloat(x.value)).sort((a, b) => a - b)[0];
    row(`A-C01:${s.key}`, 'css', `${s.label}: font-size declarations`, `${uses.length} total: ${n('px')} px, ${n('rem')} rem, ${n('em')} em, ${n('%')} %, ${n('var')} var/calc`, px.length ? `px: ${px.map((x) => `${x.selector} ${x.value}${x.via === 'font' ? ' (font shorthand)' : ''}`).join('; ')}${smallest !== undefined && smallest < 12 ? ` · smallest ${smallest}px` : ''}` : undefined);
    expect(uses.length).toBeGreaterThan(0);
  });

  // The two application stylesheets size everything in rem/em; the one px size is the root `font: 16px/1.5`, which pins the
  // base size and ignores the browser's default-text-size preference (zoom still works).
  for (const key of ['practice', 'app'] as const) {
    it(`A-01 ${key}: the root font size is not a fixed pixel size (it should follow the browser's text-size setting)`, () => {
      const root = by(key).rules.filter((r) => r.selector === ':root' && !r.media.length);
      const f = root.map((r) => r.decls.font ?? '').join(' ');
      expect(/(^|\s)\d+(\.\d+)?px(\/|\s)/.test(f), `:root font is "${f.slice(0, 40)}"`).toBe(false);
    });
  }

  it('A-02 card and action popup: font sizes are in rem/em, not pixels (card 11 declarations, popup 12; 10px and 11px text exist)', () => {
    for (const key of ['card', 'action']) {
      const px = fontSizes(by(key).rules).filter((x) => x.unit === 'px');
      expect(px.map((x) => `${key}: ${x.selector} ${x.value}`)).toEqual([]);
    }
  });

  it('the application stylesheets (GoReview, GoTell, setup app) declare no pixel font size except the root', () => {
    for (const key of ['practice', 'tell', 'app']) {
      const px = fontSizes(by(key).rules).filter((x) => x.unit === 'px' && x.selector !== ':root');
      expect(px, key).toEqual([]);
    }
  });
});

// ───────────────────────────── focus, motion, scheme ─────────────────────────────

describe('focus indicators, motion and colour scheme', () => {
  it('A-C02 GoReview, GoTell and the setup app declare :focus-visible with a 3px outline, and never remove the outline from a control', () => {
    for (const key of ['practice', 'app']) {
      const fv = by(key).rules.filter((r) => r.selector.includes(':focus-visible'));
      expect(fv.length, key).toBeGreaterThan(0);
      expect(fv[0].decls.outline, key).toMatch(/3px solid var\(--focus\)/);
    }
    const tellFv = by('tell').rules.filter((r) => r.selector.includes(':focus-visible'));
    expect(tellFv.length).toBeGreaterThan(0); // the visually-hidden radio's label shows the ring via :has(input:focus-visible)
    for (const s of SHEETS) {
      const removed = s.rules.filter((r) => /^(none|0)$/.test(r.decls.outline ?? '') && !/:focus-visible/.test(r.selector));
      row(`A-C02:${s.key}`, 'css', `${s.label}: rules that remove the outline`, removed.length ? removed.map((r) => r.selector).join('; ') : 'none', `:focus-visible rules: ${s.rules.filter((r) => r.selector.includes(':focus-visible')).length}`);
      // only a container that receives focus from script (tabindex="-1") may lose its outline
      for (const r of removed) expect(r.selector, `${s.key}: ${r.selector}`).toMatch(/^(\.screen|\.card):focus$/);
    }
  });

  it('A-C03 the action popup declares no focus style at all: it relies on the browser default ring', () => {
    const r = by('action').rules.filter((x) => x.selector.includes(':focus'));
    row('A-C03', 'css', 'action popup: focus rules', r.length ? 'present' : 'none (browser default ring)', 'the default ring is visible on buttons/checkbox in Chrome; verify in the browser walk');
    expect(r.length).toBe(0);
  });

  it('A-C04 transitions are limited to prefers-reduced-motion: no-preference; there are no animations or smooth scrolling anywhere, except the loading indicator\u2019s turn', () => {
    // The one allowance (2026-10-28): the loading mark's globe turns outside the media query (.go-globe-turn, the strip of land sliding across
    // the sphere), because the turning IS the loading indicator (WCAG 2.3.3 excludes motion essential to the information conveyed); reduced
    // motion only slows it (animation-duration).
    const essential = (selector: string): boolean => selector === '.go-globe-turn';
    for (const s of SHEETS) {
      const motion = s.rules.filter((r) => 'transition' in r.decls || 'animation' in r.decls || r.decls['scroll-behavior'] === 'smooth');
      for (const r of motion) if (!essential(r.selector)) expect(r.media.join(' '), `${s.key} ${r.selector}`).toContain('prefers-reduced-motion: no-preference');
      const allowed = motion.filter((r) => essential(r.selector));
      for (const r of allowed) expect(r.media.join(' '), `${s.key} ${r.selector} is the indicator and must not be gated off`).not.toContain('prefers-reduced-motion');
      row(`A-C04:${s.key}`, 'css', `${s.label}: motion`, motion.length ? `${motion.length - allowed.length} transition rule(s), all inside prefers-reduced-motion: no-preference${allowed.length ? `; ${allowed.length} allowed outside it (the loading indicator's turn, slowed under reduced motion)` : ''}` : 'none');
    }
  });

  it('A-C05 every stylesheet supports a dark scheme (prefers-color-scheme or color-scheme)', () => {
    for (const s of SHEETS) {
      // the GoTell workspace sheet adds no colours of its own: it uses the shell's custom properties, so it follows the shell's scheme
      const has = /prefers-color-scheme:\s*dark/.test(s.css) || /color-scheme:\s*(light )?dark/.test(s.css) || (s.key === 'tell' && !/#[0-9a-f]{3,6}\b/i.test(s.css));
      row(`A-C05:${s.key}`, 'css', `${s.label}: dark scheme`, has ? (s.key === 'tell' ? 'yes (the shell\'s tokens; no literal colours)' : 'yes') : 'no');
      expect(has, s.key).toBe(true);
    }
  });

  it('A-C06 neither application stylesheet adapts to forced-colors (Windows High Contrast): reported', () => {
    for (const s of SHEETS) row(`A-C06:${s.key}`, 'css', `${s.label}: @media (forced-colors: active)`, /forced-colors/.test(s.css) ? 'handled' : 'not handled', 'colours come from system defaults for native controls; custom marks (.issue-mark, .tell-step, badges) rely on background tints that forced-colors removes');
    expect(true).toBe(true);
  });
});

// ───────────────────────────── contrast ─────────────────────────────

interface Pair { id: string; sheet: string; what: string; fg: string; bg: string; kind: 'text' | 'ui'; opacity?: number; note?: string }
interface Result extends Pair { scheme: 'light' | 'dark'; ratio: number; need: number; pass: boolean }

const rgbHex = (c: Rgba): string => `#${[c.r, c.g, c.b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;

/** Declaration value of `prop` in the rule for `selector`, optionally the dark-scheme variant. */
function val(s: Sheet, selector: string, prop: string, dark = false): string {
  const matches = s.rules.filter((r) => r.selector === selector && prop in r.decls);
  const inDark = matches.filter((r) => r.media.some((m) => m.includes('prefers-color-scheme: dark')));
  const inLight = matches.filter((r) => !r.media.some((m) => m.includes('prefers-color-scheme: dark')));
  const pick = dark ? (inDark.at(-1) ?? inLight.at(-1)) : inLight.at(-1);
  if (!pick) throw new Error(`${s.key}: no ${prop} for ${selector}`);
  return pick.decls[prop];
}
const num = (v: string): number => parseFloat(v);

function evaluate(_s: Sheet, pairs: Pair[], tokens: (scheme: 'light' | 'dark') => Record<string, string>, resolveRaw?: (expr: string, scheme: 'light' | 'dark') => string): Result[] {
  const out: Result[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    const t = tokens(scheme);
    const white: Rgba = { r: 255, g: 255, b: 255, a: 1 };
    for (const p of pairs) {
      const fgExpr = resolveRaw ? resolveRaw(p.fg, scheme) : p.fg;
      const bgExpr = resolveRaw ? resolveRaw(p.bg, scheme) : p.bg;
      const page = evalColor(t['--bg'] ?? '#ffffff', t, white);
      // a translucent background (color-mix with transparent) is composited on the page colour
      const bg = evalColor(bgExpr, t, page);
      let fg = evalColor(fgExpr, t, bg);
      if (p.opacity !== undefined) fg = withOpacity(fg, bg, p.opacity);
      const ratio = contrast(fg, bg);
      const need = p.kind === 'ui' ? AA_LARGE_OR_UI : AA_TEXT;
      out.push({ ...p, scheme, ratio, need, pass: ratio >= need });
    }
  }
  return out;
}

const results: Result[] = [];
const fmtRows = (rs: Result[]): void => {
  for (const r of rs) row(`A-K:${r.sheet}:${r.id}:${r.scheme}`, 'contrast', `${r.sheet} · ${r.what}`, `${r.ratio.toFixed(2)}:1 (${r.kind === 'ui' ? '3' : '4.5'} needed) ${r.pass ? 'pass' : 'FAIL'}`, r.scheme);
  results.push(...rs);
};

describe('contrast of the colour pairs actually used (WCAG 2.x, AA)', () => {
  // ── GoReview, GoTell and the setup app share one token set; each sheet is evaluated from its own tokens
  const appPairs = (s: Sheet): Pair[] => {
    const P = (id: string, what: string, fg: string, bg: string, extra: Partial<Pair> = {}): Pair => ({ id, sheet: s.key, what, fg, bg, kind: 'text', ...extra });
    const common: Pair[] = [
      P('ink-bg', 'body text on the page (body)', 'var(--ink)', 'var(--bg)'),
      P('ink-panel', 'text on a panel (.card, .topbar, .exercise)', 'var(--ink)', 'var(--panel)'),
      P('muted-bg', 'secondary text on the page (.muted)', 'var(--muted)', 'var(--bg)'),
      P('muted-panel', 'secondary text on a panel (.help, .reason, .reasons)', 'var(--muted)', 'var(--panel)'),
      P('muted-warn', 'secondary text on a notice (.notice .muted)', 'var(--muted)', 'var(--warn-bg)'),
      P('ink-warn', 'text on a notice (.notice)', 'var(--ink)', 'var(--warn-bg)'),
      P('link-bg', 'links (a) on the page', 'var(--accent)', 'var(--bg)'),
      P('link-panel', 'links (a) on a panel', 'var(--accent)', 'var(--panel)'),
      P('primary', 'primary button (.btn.primary)', 'var(--accent-ink)', 'var(--accent)'),
      P('ok-bg', 'success text (.ok, .status[data-kind=ok])', 'var(--ok)', 'var(--bg)'),
      P('ok-panel', 'success text on a panel', 'var(--ok)', 'var(--panel)'),
      P('bad-bg', 'error text (.error, .status[data-kind=error])', 'var(--bad)', 'var(--bg)'),
      P('bad-panel', 'error text on a panel', 'var(--bad)', 'var(--panel)'),
      P('bad-warn', 'error text on a notice', 'var(--bad)', 'var(--warn-bg)'),
      P('tag-panel', 'tag (.tag) on a panel', 'var(--ink)', 'color-mix(in srgb, var(--accent) 22%, transparent)'),
      P('nav-current', 'current navigation item (a[aria-current])', 'var(--ink)', 'color-mix(in srgb, var(--accent) 16%, transparent)'),
      P('muted-disabled', 'a disabled button (opacity .5; exempt from WCAG, reported)', 'var(--ink)', 'var(--panel)', { opacity: 0.5, note: 'disabled controls are exempt' }),
      P('focus-bg', 'focus ring (--focus) on the page', 'var(--focus)', 'var(--bg)', { kind: 'ui' }),
      P('focus-panel', 'focus ring (--focus) on a panel', 'var(--focus)', 'var(--panel)', { kind: 'ui' }),
      P('border-field', 'text-field border (--line) on the page: the only visible boundary of an input', 'var(--line)', 'var(--bg)', { kind: 'ui' }),
      P('border-button', 'button border (--line) on a panel', 'var(--line)', 'var(--panel)', { kind: 'ui' }),
    ];
    if (s.key === 'app') common.push(P('danger', 'danger button (.btn.danger)', 'var(--panel)', 'var(--bad)'), P('mark-todo', 'step mark (.mark.todo, .steps li.group)', 'var(--muted)', 'var(--panel)'));
    const laterOpacity = ((): number | undefined => { try { return num(val(s, '.candidate[data-choice="later"]', 'opacity')); } catch { return undefined; } })();
    if (s.key === 'practice') common.push(P('sync', 'sync indicator (.sync) on the top bar', 'var(--muted)', 'var(--panel)'), P('later', 'a candidate kept for later: ink', 'var(--ink)', 'var(--bg)', laterOpacity === undefined ? {} : { opacity: laterOpacity }), P('later-muted', 'a candidate kept for later: reason text', 'var(--muted)', 'var(--bg)', laterOpacity === undefined ? {} : { opacity: laterOpacity }));
    if (s.key === 'tell') common.push(
      P('issue-mark', 'issue mark (.issue-mark): text on its red tint', 'var(--ink)', 'color-mix(in srgb, var(--bad) 18%, transparent)'),
      P('diff-added', 'diff, added (.tell-diff .added)', 'var(--ink)', 'color-mix(in srgb, var(--ok) 20%, transparent)'),
      P('diff-removed', 'diff, removed (.tell-diff .removed)', 'var(--ink)', 'color-mix(in srgb, var(--bad) 18%, transparent)'),
      P('step', 'assistance step (.tell-step)', 'var(--ink)', 'color-mix(in srgb, var(--accent) 7%, transparent)'),
      P('goal-done', 'finished goal (muted, struck through)', 'var(--muted)', 'var(--bg)'),
      P('badge-warn', 'warning badge (.tell-badge.warn)', 'var(--muted)', 'var(--warn-bg)'),
      P('tab-selected', 'selected tab (.tell-tabs button[aria-selected])', 'var(--ink)', 'color-mix(in srgb, var(--accent) 16%, transparent)'),
    );
    return common;
  };

  it.each(['practice', 'app'] as const)('A-K01 %s: pairs from the stylesheet tokens (light and dark)', (key) => {
    const s = by(key);
    const rs = evaluate(s, appPairs(s), (scheme) => tokensOf(s.rules, scheme));
    fmtRows(rs);
    expect(rs.length).toBe(appPairs(s).length * 2);
    expect(rs.filter((r) => r.id === 'ink-bg').every((r) => r.pass)).toBe(true);
  });

  it('A-K02 tell (GoTell workspace) uses the shell tokens: pairs from the practice tokens', () => {
    const s = by('tell');
    const practice = by('practice');
    const rs = evaluate(s, appPairs(s).filter((p) => !['ink-bg', 'ink-panel'].includes(p.id) || true), (scheme) => tokensOf(practice.rules, scheme));
    // the practice pairs are reported under the practice sheet; here only the rules unique to the workspace
    fmtRows(rs.filter((r) => ['issue-mark', 'diff-added', 'diff-removed', 'step', 'goal-done', 'badge-warn', 'tab-selected'].includes(r.id)));
    expect(rs.length).toBeGreaterThan(0);
  });

  // ── the card and the action popup carry literal colours
  // Since 2026-10-10 the card has Biblia's look: ONE dark scheme (paper #16130f), its own colours whatever the page. Every pair is read from the rules.
  // ink-faint (#7d7059, ~3.4:1) is for borders and decoration only: no text uses it; the circles of the level meter, which have no text, take it as their border (3:1).
  it('A-K03 card: pairs read from the rules (one dark scheme)', () => {
    const s = by('card');
    const L = (sel: string, prop: string): string => val(s, sel, prop);
    const fg = L('.card', 'color'); const bg = L('.card', 'background');
    const t = (id: string, what: string, f: string, b: string, extra: Partial<Pair> = {}): Pair => ({ id, sheet: 'card', what: what + ' (dark)', fg: f, bg: b, kind: 'text', ...extra });
    const ring = (decl: string): string => /#[0-9a-f]{6}/i.exec(decl)![0];
    const pairs: Pair[] = [
      t('ink', 'text on the card (.card)', fg, bg),
      t('label', 'kicker (.label)', L('.label', 'color'), bg),
      t('kicker', 'kicker under the meaning (.kicker)', L('.kicker', 'color'), bg),
      t('k', 'row key (.k)', L('.k', 'color'), bg),
      t('muted', 'muted value (.muted)', L('.muted', 'color'), bg),
      t('note', 'note (.note)', L('.note', 'color'), bg),
      t('guess', 'italic note (.card__text)', L('.card__text', 'color'), bg),
      t('status', 'status line (.status)', L('.status', 'color'), bg),
      t('feedback', 'feedback line (.feedback)', L('.feedback', 'color'), bg),
      t('sources', 'view sources (.sourcesBtn, accent)', L('.sourcesBtn', 'color'), bg),
      t('level', 'level name (.levelName, accent)', L('.levelName', 'color'), bg),
      t('encounters', 'encounters kicker (.encounters)', L('.encounters', 'color'), bg),
      t('quiet', 'quiet pill (.btn--quiet)', L('.btn--quiet', 'color'), bg),
      t('tag', 'evidence tag (.tag)', L('.tag', 'color'), L('.tag', 'background')),
      t('button', 'button text (button, input)', L('button', 'color'), L('button', 'background')),
      t('err', 'error text (.err)', L('.err', 'color'), bg),
      t('disabled', 'disabled button (opacity .5; exempt, reported)', L('button', 'color'), L('button', 'background'), { opacity: num(L('button:disabled', 'opacity')) }),
      t('focus', 'focus ring on the card', ring(L('button:focus-visible', 'outline')), bg, { kind: 'ui' }),
      t('meter', 'a circle of the level meter, empty (.rateBtn border)', ring(L('.rateBtn', 'border')), bg, { kind: 'ui' }),
      t('meter-on', 'a circle of the level meter, filled (accent on paper)', L('.rateBtn.on', 'background'), bg, { kind: 'ui' }),
    ];
    const rs: Result[] = pairs.map((p) => {
      const bgc = evalColor(p.bg, {}, { r: 255, g: 255, b: 255, a: 1 });
      let fgc = evalColor(p.fg, {}, bgc);
      if (p.opacity !== undefined) fgc = withOpacity(fgc, bgc, p.opacity);
      const ratio = contrast(fgc, bgc);
      const need = p.kind === 'ui' ? AA_LARGE_OR_UI : AA_TEXT;
      return { ...p, scheme: 'dark' as const, ratio, need, pass: ratio >= need };
    });
    fmtRows(rs);
    expect(rs.length).toBe(20);
    // every pair passes but the disabled button, which WCAG exempts (reported above)
    for (const r of rs) if (r.id !== 'disabled') expect(r.pass, `${r.what}: ${r.ratio.toFixed(2)}:1`).toBe(true);
  });

  it('A-K04 action popup: its colour pairs on its own paper (the tokens of its :root, light and dark)', () => {
    const s = by('action');
    const white: Rgba = { r: 255, g: 255, b: 255, a: 1 };
    const text: Array<[string, string, string]> = [
      ['body', 'body text (body)', 'body'], ['err', 'error text (.err)', '.err'], ['warn', 'warning status (.status-line.warn)', '.status-line.warn'],
      // the protocol note (.proto) left the popup with its housekeeping controls on 2026-10-09; the sub-title, the hint and the h1 left with
      // the owner's cut of 2026-10-28 (the greeting, the brand button to setup and the one-line legend took their place)
      ['welcome', 'greeting (.welcome)', '.welcome'], ['setup', 'the brand button to setup (.setup-link)', '.setup-link'], ['legend', 'the one-line legend (.legend)', '.legend'], ['sample', 'a sample word of the legend (.legend .sw)', '.legend .sw'], ['muted', 'muted detail (.muted)', '.muted'],
    ];
    const rs: Result[] = [];
    for (const scheme of ['light', 'dark'] as const) {
      const dark = scheme === 'dark';
      const tokens = tokensOf(s.rules, scheme);
      const paper = evalColor('var(--paper)', tokens, white);
      const one = (id: string, what: string, fgExpr: string, kind: 'text' | 'ui', opacity?: number): Result => {
        let fg = evalColor(fgExpr, tokens, paper);
        if (opacity !== undefined) fg = withOpacity(fg, paper, opacity);
        const ratio = contrast(fg, paper);
        const need = kind === 'ui' ? AA_LARGE_OR_UI : AA_TEXT;
        return { id, sheet: 'action', what, fg: rgbHex(fg), bg: rgbHex(paper), kind, scheme, ratio, need, pass: ratio >= need };
      };
      for (const [id, what, sel] of text) {
        let opacity: number | undefined;
        try { opacity = num(val(s, sel, 'opacity', dark)); } catch { opacity = undefined; }
        rs.push(one(id, what, val(s, sel, 'color', dark), 'text', opacity));
      }
      // the boundaries of the controls
      rs.push(one('border-button', 'button border (--control-line) on the paper', 'var(--control-line)', 'ui'), one('border-field', 'text-area border (--control-line) on the paper', 'var(--control-line)', 'ui'));
    }
    fmtRows(rs);
    expect(rs.length).toBe(20);
  });

  // ── the verdicts
  const failing = (): Result[] => results.filter((r) => !r.pass && r.id !== 'muted-disabled' && r.id !== 'disabled');

  const failIds = (pred: (r: Result) => boolean): string[] => failing().filter(pred).map((r) => `${r.sheet}:${r.id}:${r.scheme} ${r.ratio.toFixed(2)}`);

  it('A-03 the boundary of a text field and of a button is at least 3:1 against its surroundings (WCAG 1.4.11): --line is 1.37 to 1.60:1; the card button border 2.07 to 2.25:1', () => {
    expect(failIds((r) => /^border/.test(r.id))).toEqual([]);
  });

  it('A-04 the card focus ring is at least 3:1 on the dark card (it is one literal blue, #2b6cb0, in both schemes: 2.79:1 on #25262b)', () => {
    expect(failIds((r) => r.sheet === 'card' && r.id === 'focus')).toEqual([]);
  });

  it('A-05 the action popup error and warning text is at least 4.5:1 in a dark browser theme (#b42318 on the dark canvas: 2.85:1)', () => {
    expect(failIds((r) => r.sheet === 'action')).toEqual([]);
  });

  it('A-06 a candidate "kept for later" keeps 4.5:1 for its secondary text (opacity .75 on --muted: 3.55:1 in the light scheme)', () => {
    expect(failIds((r) => r.id === 'later-muted')).toEqual([]);
  });

  it('A-K05 the verdict: how many pairs were computed and which fail', () => {
    const bad = failing();
    row('A-K05', 'contrast', 'pairs computed / failing (disabled controls excluded)', `${results.length} / ${bad.length}`, bad.map((r) => `${r.sheet}:${r.id}:${r.scheme} ${r.ratio.toFixed(2)}`).join('; ') || 'none');
    expect(results.length).toBeGreaterThan(80);
  });
});

void over;

// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachRipple, MIN_LIT_MS, RIPPLE_SOLID } from '../../packages/goreview/app/ripple';
import { destroyRigs, dueCard, ids, key, makeRig, reopen, seed, startWith, type, until } from './helpers';

/**
 * The home's deck tiles (the owner, 2026-11-12): no outline; a tile turns a lighter colour under the pointer, and the lighter colour spreads from
 * the point of contact. ripple.ts says where the wash starts and how far it reaches; the stylesheet draws it. jsdom has no layout, so the tile's
 * box is given here and the stylesheet's rules are read as text.
 */
afterEach(() => { destroyRigs(); vi.useRealTimers(); });
const css = readFileSync('packages/goreview/app/styles.css', 'utf8');
const A = ids('L1', 'sq');

function tile(width = 300, height = 80, inner = '<button type="button">Start</button>'): HTMLElement {
  const el = document.createElement('div');
  el.className = 'deck-tile';
  el.innerHTML = inner;
  document.body.append(el);
  el.getBoundingClientRect = () => ({ left: 20, top: 100, right: 20 + width, bottom: 100 + height, width, height, x: 20, y: 100, toJSON: () => ({}) });
  attachRipple(el);
  return el;
}
const pointer = (el: HTMLElement, type: string, clientX: number, clientY: number): void => { el.dispatchEvent(new MouseEvent(type, { clientX, clientY })); };
const v = (el: HTMLElement, name: string): string => el.style.getPropertyValue(name);

describe('the ripple on a deck tile', () => {
  it('starts at the point of contact and reaches the farthest corner with its solid part', () => {
    const el = tile();
    pointer(el, 'pointerenter', 20 + 60, 100 + 30);
    expect(el.hasAttribute('data-lit')).toBe(true);
    expect([v(el, '--ripple-x'), v(el, '--ripple-y')]).toEqual(['60px', '30px']);
    // the farthest corner from (60, 30) in a 300 x 80 box is the bottom right: 240 across, 50 down
    const radius = Number.parseFloat(v(el, '--ripple-r'));
    expect(radius * RIPPLE_SOLID).toBeGreaterThanOrEqual(Math.hypot(240, 50));
    expect(radius * RIPPLE_SOLID).toBeLessThan(Math.hypot(240, 50) + 1);
  });

  it('draws back to the point where the pointer left, which is kept inside the tile', () => {
    vi.useFakeTimers();
    const el = tile();
    pointer(el, 'pointerenter', 30, 110);
    vi.advanceTimersByTime(MIN_LIT_MS + 1);
    pointer(el, 'pointerleave', 20 + 300 + 14, 100 - 9); // just outside the top right corner
    expect(el.hasAttribute('data-lit')).toBe(false);
    expect([v(el, '--ripple-x'), v(el, '--ripple-y')]).toEqual(['300px', '0px']);
    expect(Number.parseFloat(v(el, '--ripple-r')) * RIPPLE_SOLID).toBeGreaterThanOrEqual(Math.hypot(300, 80));
  });

  it('keeps a quick tap lit long enough to be seen, and a pointer that comes back keeps it lit', () => {
    vi.useFakeTimers();
    const el = tile();
    pointer(el, 'pointerenter', 100, 120);
    vi.advanceTimersByTime(60);
    pointer(el, 'pointerleave', 100, 120);
    expect(el.hasAttribute('data-lit')).toBe(true);
    vi.advanceTimersByTime(MIN_LIT_MS - 61);
    expect(el.hasAttribute('data-lit')).toBe(true);
    vi.advanceTimersByTime(2);
    expect(el.hasAttribute('data-lit')).toBe(false);

    pointer(el, 'pointerenter', 100, 120);
    vi.advanceTimersByTime(60);
    pointer(el, 'pointerleave', 100, 120);
    pointer(el, 'pointerenter', 140, 120); // back before the wash was withdrawn
    vi.advanceTimersByTime(MIN_LIT_MS * 3);
    expect(el.hasAttribute('data-lit')).toBe(true);
  });

  it('a touch that becomes a scroll withdraws it', () => {
    vi.useFakeTimers();
    const el = tile();
    pointer(el, 'pointerenter', 100, 120);
    vi.advanceTimersByTime(MIN_LIT_MS + 1);
    pointer(el, 'pointercancel', 100, 150);
    expect(el.hasAttribute('data-lit')).toBe(false);
  });

  it('does not light a tile with nothing to press', () => {
    const el = tile(300, 80, '<button type="button" disabled>No cards ready</button>');
    pointer(el, 'pointerenter', 100, 120);
    expect(el.hasAttribute('data-lit')).toBe(false);
    const link = tile(300, 80, '<a href="#/review/decks">Saved</a>');
    pointer(link, 'pointerenter', 100, 120);
    expect(link.hasAttribute('data-lit')).toBe(true);
  });

  it('leaves the centred default alone when the tile has no box', () => {
    const el = tile(0, 0);
    pointer(el, 'pointerenter', 100, 120);
    expect(el.hasAttribute('data-lit')).toBe(true);
    expect(v(el, '--ripple-x')).toBe('');
  });
});

describe('the deck tiles on the home', () => {
  it('light under the pointer when they can be pressed: the Current Deck and Saved do, an empty Review Deck does not', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    await reopen(rig);
    const lit = (deck: string): boolean => {
      const el = rig.q(`.deck-tile[data-deck="${deck}"]`);
      el.dispatchEvent(new MouseEvent('pointerenter', { clientX: 5, clientY: 5 }));
      return el.hasAttribute('data-lit');
    };
    expect(rig.q<HTMLButtonElement>('#start-review').disabled).toBe(true);
    expect([lit('current'), lit('review'), lit('saved')]).toEqual([true, false, true]);
  });
});

it('lights all three completed-session actions with the deck tile ripple', async () => {
  const rig = await makeRig({ signedIn: true });
  await startWith(rig, dueCard(A, 'zog', 'meaning-to-form'));
  const input = rig.q<HTMLInputElement>('#answer-input');
  type(input, 'wrong');
  key('Enter', input);
  await until(() => !!rig.root.querySelector('#feedback'));
  rig.q('#next').click();
  await until(() => !!rig.root.querySelector('#continue-due-work'));

  expect(rig.q<HTMLButtonElement>('#continue-due-work').disabled).toBe(false);
  for (const id of ['continue-due-work', 'open-remediation', 'back-to-review']) {
    const control = rig.q('#' + id);
    const tile = control.parentElement!;
    expect(control.classList.contains('deck-face')).toBe(true);
    expect(tile.classList.contains('deck-tile')).toBe(true);
    pointer(tile, 'pointerenter', 5, 5);
    expect(tile.hasAttribute('data-lit')).toBe(true);
  }
});

describe('the stylesheet', () => {
  const rule = (selector: string): string => {
    const at = css.indexOf(`\n${selector} {`);
    return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
  };

  it('gives a tile no outline, and clips the wash to its rounded shape', () => {
    expect(rule('.deck-tile')).not.toBe('');
    expect(rule('.deck-tile')).not.toMatch(/border(-color|-width|-style)?:/);
    expect(rule('.deck-tile[data-deck="current"]')).not.toMatch(/border/);
    expect(rule('.deck-tile')).toMatch(/overflow: hidden;[^}]*border-radius: \.8rem;/s);
    expect(rule('.deck-tile')).toMatch(/isolation: isolate;/);
  });

  it('draws the wash as a circle at the point of contact whose solid share is the one ripple.ts reckons with', () => {
    const wash = rule('.deck-tile::before');
    expect(wash).toMatch(/left: var\(--ripple-x, 50%\);\s*top: var\(--ripple-y, 50%\);/);
    expect(wash).toMatch(/width: calc\(2 \* var\(--ripple-r, 110%\)\);\s*aspect-ratio: 1;/);
    expect(wash).toMatch(new RegExp(`var\\(--tile-lit\\) ${RIPPLE_SOLID * 100}%`));
    expect(wash).toMatch(/transform: translate\(-50%, -50%\) scale\(0\);/);
    expect(wash).toMatch(/pointer-events: none;/);
    expect(css).toMatch(/\.deck-tile\[data-lit\]::before, \.deck-tile:has\(:focus-visible\)::before \{ transform: translate\(-50%, -50%\) scale\(1\); \}/);
  });

  it('spreads whatever the motion preference (the owner, 2026-11-12: it did not spread on a PC with animations off), and keeps a line around the tile in forced colours', () => {
    const gated = [...css.matchAll(/@media \(prefers-reduced-motion: [a-z-]+\) \{(?:[^{}]|\{[^{}]*\})*\}/g)].map((m) => m[0]).join('\n');
    expect(gated).not.toMatch(/\.deck-tile/);
    expect(css).toMatch(/\n\.deck-tile::before \{ transition: transform \.42s/);
    expect(css).toMatch(/\n\.deck-tile\[data-lit\]::before, \.deck-tile:has\(:focus-visible\)::before \{ transition: transform \.62s/);
    expect(css).toMatch(/@media \(forced-colors: active\) \{[^@]*\.deck-tile \{ border: 1px solid CanvasText; \}/);
  });

  it('every text colour on a lit tile, and on the crest of the wash, still reaches 4.5:1', () => {
    const lum = (hex: string): number => {
      const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string): number => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
    const home = css.slice(css.indexOf('body:has(#screen[data-route="review"]) {'));
    const token = (name: string): string => home.match(new RegExp(`${name}: (#[0-9a-f]{6});`))![1];
    const fills = [...(rule('.deck-tile') + rule('.deck-tile[data-deck="current"]')).matchAll(/--tile(?:-lit|-crest)?: (#[0-9a-f]{6});/g)].map((m) => m[1]);
    expect(fills).toHaveLength(6);
    for (const bg of fills) for (const fg of ['--ink', '--ink-soft', '--accent']) expect(ratio(token(fg), bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
});

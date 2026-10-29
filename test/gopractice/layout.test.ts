import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The phone layout, read from the stylesheet itself (jsdom has no layout engine, so the rules are asserted as text): mobile first at 430 CSS px
 * and below, nothing that can overflow sideways, the body as the one scroll area, 16px gutters, safe areas, the type scale, the header on one
 * line, the four grades on one line, fingertip targets. The desktop layout (above 640px) is left to the base rules.
 */
const css = readFileSync('packages/gopractice/styles.css', 'utf8');

/** The body of the first `@media <query> { ... }` block (balanced braces). */
function mediaBlock(query: string): string {
  const start = css.indexOf(`@media ${query} {`);
  if (start < 0) return '';
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') { depth -= 1; if (depth === 0) return css.slice(css.indexOf('{', start) + 1, i); }
  }
  return '';
}

describe('the phone layout', () => {
  const phone = mediaBlock('(max-width: 430px)');

  it('has a phone block with 16px gutters and safe-area padding under the notch and above the home indicator', () => {
    expect(phone).not.toBe('');
    expect(phone).toMatch(/\.screen \{[^}]*padding: 1rem max\(16px, env\(safe-area-inset-right[^}]*calc\(2rem \+ env\(safe-area-inset-bottom[^}]*max\(16px, env\(safe-area-inset-left/);
    // the header row right under the status bar, as Duolingo's (the owner, 2026-10-28, later): the whole inset, always (--top-inset)
    expect(phone).toMatch(/\.topbar \{[^}]*padding-top: calc\(\.375rem \+ var\(--top-inset\)\);[^}]*max\(16px, env\(safe-area-inset-left/); // 6 px under the status bar (the owner: "Lower it just a little bit")
    expect(css).toMatch(/--top-inset: env\(safe-area-inset-top, 0px\);/);
    // nothing may zero it: a check that did ("the page already starts below the status bar") put the header under the clock on the owner's phone
    expect(css).not.toMatch(/data-status-bar|--top-inset: 0/);
    expect(css).not.toMatch(/\.topbar[^}]*env\(safe-area-inset-top/); // no rule adds the raw inset any more
  });

  it('scales the type for a handheld: title 1.4rem, entry titles 1.7rem, kickers 0.7rem, body 1rem', () => {
    expect(phone).toMatch(/body \{ font-size: 1rem/);
    expect(phone).toMatch(/h1 \{ font-size: 1\.4rem/);
    expect(phone).toMatch(/\.entry-title \{ font-size: 1\.7rem/);
    expect(phone).toMatch(/\.entry-kicker \{ font-size: \.7rem/);
  });

  it('keeps the header one line (44 px of targets plus the room above), the card full width with 16px padding, and the four grades on one line', () => {
    expect(phone).toMatch(/\.topbar \{[^}]*flex-wrap: nowrap[^}]*min-height: calc\(3\.5rem \+ var\(--top-inset\)\)/);
    expect(phone).toMatch(/\.card, \.exercise, \.feedback \{ padding: 16px; \}/);
    expect(phone).toMatch(/\.grades \{ flex-wrap: nowrap/);
    expect(phone).toMatch(/button\.grade \{ flex: 1 1 0; min-width: 0/);
    expect(mediaBlock('(max-width: 359px)')).toMatch(/\.grade-word \{ display: none; \}/); // the number remains; the button keeps its word as its name
  });

  it('puts the meaning under the word in My vocab on phones, the level at the right', () => {
    expect(phone).toMatch(/\.vocab-row \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto; grid-template-areas: "word level" "gloss indeck" "met met"/);
  });

  it('makes the body the one scroll area and stops sideways overflow and rubber-banding', () => {
    expect(css).toMatch(/html, body \{ overscroll-behavior-y: contain; \}/);
    expect(css).toMatch(/body \{ min-height: 100vh; min-height: 100dvh; overflow-x: hidden; \}/);
    expect(css).toMatch(/\.shell \{ min-height: 100vh; min-height: 100dvh; \}/);
    expect(css).toMatch(/\.sync\.sr \{ width: 1px; max-width: 1px; margin: 0; \}/);
    // no inner fixed-height scroll boxes
    expect(css).not.toMatch(/(^|[^-])height: \d+(\.\d+)?vh;[^}]*overflow(-y)?: (auto|scroll)/m);
  });

  it('declares no fixed width wider than a phone (width and min-width; max-width is fine)', () => {
    const wide: string[] = [];
    for (const m of css.matchAll(/(^|[;{\s])(width|min-width):\s*(-?\d+(?:\.\d+)?)(px|rem)\b/g)) {
      const px = Number(m[3]) * (m[4] === 'rem' ? 16 : 1);
      if (px > 430) wide.push(m[0].trim());
    }
    expect(wide).toEqual([]);
  });

  it('every pill, link and control gets a fingertip-sized target on touch and in standalone mode', () => {
    const touch = mediaBlock('(pointer: coarse), (display-mode: standalone)');
    expect(touch).toMatch(/min-height: 2\.75rem/);
    expect(css).toMatch(/@media \(pointer: coarse\), \(display-mode: standalone\) \{\n  \.stepper-btn \{ width: 2\.75rem; height: 2\.75rem; \}/);
  });
});

describe('the viewport', () => {
  it('is device-width with viewport-fit=cover in the page (user zoom is not locked)', () => {
    const html = readFileSync('packages/gopractice/index.html', 'utf8');
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">');
    expect(html).not.toMatch(/user-scalable|maximum-scale/);
  });

  it('and in the review build when it has been built', () => {
    const built = 'packages/gopractice/dist-review/index.html';
    if (!existsSync(built)) return;
    const html = readFileSync(built, 'utf8');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('width=device-width');
  });
});

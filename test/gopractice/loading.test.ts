// @vitest-environment jsdom
/**
 * The loading mark (the owner, 2026-10-28: "the globe from the logo, but spinning", then "the globe should rotate along its axis, not spin"):
 * three layers of the logo's globe as CSS masks in the ink: the meridian with the stand and the sphere's rim still, the continents drifting
 * across the sphere and out of sight at its edge; a status with a label for assistive technology; the stylesheet keeps the turn going under
 * reduced motion (slower) and shows the mark after a moment, so a load that ends within a blink shows nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadingMark } from '../../packages/gopractice/loading';

const pkg = path.resolve(__dirname, '../../packages/gopractice');
const brand = path.resolve(__dirname, '../../packages/shared-brand');
const css = fs.readFileSync(path.join(pkg, 'styles.css'), 'utf8');
const url = (file: string): RegExp => new RegExp(`^url\\("[a-z]+://[^"]*/${file.replace('.', '\\.')}"\\)$`);

describe('the loading mark', () => {
  it('is a status with the label for assistive technology, and the globe in three masked layers: frame and rim still, the land on a sliding strip', () => {
    const el = loadingMark('Loading your deck…');
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.textContent).toBe('Loading your deck…');
    expect(el.querySelector('.sr')?.textContent).toBe('Loading your deck…');
    const globe = el.querySelector('.go-globe');
    expect(globe?.getAttribute('aria-hidden')).toBe('true');
    expect([...globe!.children].map((c) => c.className)).toEqual(['go-globe-frame', 'go-globe-rim', 'go-globe-sphere']); // the sphere clips the land inside the rim
    const frame = el.querySelector<HTMLElement>('.go-globe-frame');
    const rim = el.querySelector<HTMLElement>('.go-globe-rim');
    const sphere = el.querySelector<HTMLElement>('.go-globe-sphere');
    const turn = sphere?.querySelector<HTMLElement>(':scope > .go-globe-turn');
    const land = turn?.querySelector<HTMLElement>(':scope > .go-globe-land');
    expect(frame && rim && sphere && turn && land).toBeTruthy();
    // the images are inline absolute URLs (so they resolve wherever the stylesheet lives), one layer each; the sliding span itself carries
    // no mask (WebKit does not repaint a transform animation on a masked element), its child does
    expect(frame!.style.getPropertyValue('mask-image')).toMatch(url('go-globe-frame.png'));
    expect(rim!.style.getPropertyValue('mask-image')).toMatch(url('go-globe-rim.png'));
    expect(sphere!.getAttribute('style')).toBeNull();
    expect(turn!.getAttribute('style')).toBeNull();
    expect(land!.style.getPropertyValue('mask-image')).toMatch(url('go-globe-land.png'));
    expect(el.querySelector('img')).toBeNull();
  });

  it('ships the three layers beside the logo, cut by the script that stays in the repository, with the geometry the stylesheet reads', () => {
    for (const f of ['go-globe-land.png', 'go-globe-rim.png', 'go-globe-frame.png', 'go-logo.png']) expect(fs.existsSync(path.join(brand, f)), f).toBe(true);
    expect(fs.existsSync(path.join(brand, 'go-globe-disc.png'))).toBe(false); // the spinning disc of the first version is gone
    expect(fs.existsSync(path.resolve(__dirname, '../../scripts/split-go-globe.cjs'))).toBe(true);
    // PNGs with an alpha channel (colour type 6), square, all the same box
    const sizes = new Set<number>();
    for (const f of ['go-globe-land.png', 'go-globe-rim.png', 'go-globe-frame.png']) {
      const png = fs.readFileSync(path.join(brand, f));
      expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
      expect(png.readUInt32BE(16), f).toBe(png.readUInt32BE(20)); // width = height
      expect(png[25], f).toBe(6);
      sizes.add(png.readUInt32BE(16));
    }
    expect(sizes.size).toBe(1);
    // the clip circle in the stylesheet is the rim's inner edge, as the script measured it (a share of the box, to two decimals of a percent)
    const geometry = JSON.parse(fs.readFileSync(path.join(brand, 'go-globe-geometry.json'), 'utf8')) as { landRadiusShare: number; circle: { rIn: number }; box: { size: number } };
    expect(geometry.landRadiusShare).toBeCloseTo(geometry.circle.rIn / geometry.box.size, 6);
    const clip = /\.go-globe-sphere \{[^}]*clip-path: circle\(([\d.]+)% at 50% 50%\)/.exec(css);
    expect(clip, 'the sphere clip').toBeTruthy();
    expect(Number(clip![1])).toBeCloseTo(geometry.landRadiusShare * 100, 1);
  });

  it('turns the land always (slower under reduced motion), on an unmasked strip of its own layer, one sphere-width per loop; appears after a moment when motion is welcome, at once under reduced motion', () => {
    // the strip is twice the sphere wide, the land repeated along it at half the strip (= the sphere's width), and it slides exactly one copy
    expect(css).toMatch(/@keyframes go-turn \{ from \{ transform: translateX\(-50%\); \} to \{ transform: translateX\(0\); \} \}/);
    expect(css).toMatch(/^\.go-globe-turn \{ position: absolute; top: 0; left: 0; width: 200%; height: 100%; display: block; animation: go-turn 3\.6s linear infinite; will-change: transform; \}$/m);
    expect(css).toMatch(/^\.go-globe-land \{[^}]*mask-size: 50% 100%; mask-position: 0 0; mask-repeat: repeat-x; \}$/m);
    // the sphere: the land clipped to a circle, tilted like the logo's meridian, nothing animated on it
    expect(css).toMatch(/^\.go-globe-sphere \{ overflow: hidden; clip-path: circle\([\d.]+% at 50% 50%\); transform: rotate\(\d+deg\); \}$/m);
    expect(css).not.toMatch(/\.go-globe-sphere \{[^}]*animation/);
    // the turn is not behind a media query: it is the loading indicator itself (the audit's one allowance, A-C04)
    expect(css).toMatch(/\.go-loading \{[^}]*opacity: 0; \}/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{ \.go-loading \{ animation: go-appear \.2s ease \.15s forwards; \} \}/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.go-loading \{ opacity: 1; \} \.go-globe-turn \{ animation-duration: 9s; \} \}/);
    // the layers take the ink and are masks, not images; the mask is never on the sliding span; nothing spins any more
    expect(css).toMatch(/\.go-loading \{[^}]*color: var\(--brand\)/);
    expect(css).toMatch(/\.go-globe-frame, \.go-globe-rim \{ background: currentColor;[^}]*mask-size: contain/);
    expect(css).toMatch(/\.go-globe-land \{[^}]*background: currentColor/);
    expect(css).not.toMatch(/\.go-globe-turn \{[^}]*mask/);
    expect(css).not.toMatch(/go-spin|rotate\(360deg\)|go-globe-disc/);
  });
});

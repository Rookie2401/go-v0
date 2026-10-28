// @vitest-environment jsdom
/**
 * The loading mark (the owner, 2026-10-28: "the globe from the logo, but spinning"): two layers of the logo's globe as CSS masks in the ink,
 * the sphere turning and the meridian with the stand still; a status with a label for assistive technology; the stylesheet turns the
 * sphere only when motion is welcome and shows the mark after a moment, so a load that ends within a blink shows nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadingMark } from '../../packages/gopractice/loading';

const pkg = path.resolve(__dirname, '../../packages/gopractice');
const brand = path.resolve(__dirname, '../../packages/shared-brand');
const css = fs.readFileSync(path.join(pkg, 'styles.css'), 'utf8');

describe('the loading mark', () => {
  it('is a status with the label for assistive technology, and the globe in two masked layers, the sphere one marked to turn', () => {
    const el = loadingMark('Loading your deck…');
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.textContent).toBe('Loading your deck…');
    expect(el.querySelector('.sr')?.textContent).toBe('Loading your deck…');
    const globe = el.querySelector('.go-globe');
    expect(globe?.getAttribute('aria-hidden')).toBe('true');
    const frame = el.querySelector<HTMLElement>('.go-globe-frame');
    const disc = el.querySelector<HTMLElement>('.go-globe-disc');
    const sphere = disc?.querySelector<HTMLElement>('.go-globe-sphere');
    expect(frame && disc && sphere).toBeTruthy();
    // the images are inline absolute URLs (so they resolve wherever the stylesheet lives), one layer each; the turning span itself carries
    // no mask (WebKit does not repaint a transform animation on a masked element), its child does
    expect(frame!.style.getPropertyValue('mask-image')).toMatch(/^url\("[a-z]+:\/\/[^"]*\/go-globe-frame\.png"\)$/);
    expect(disc!.getAttribute('style')).toBeNull();
    expect(sphere!.style.getPropertyValue('mask-image')).toMatch(/^url\("[a-z]+:\/\/[^"]*\/go-globe-disc\.png"\)$/);
    expect(el.querySelector('img')).toBeNull();
  });

  it('ships both layers beside the logo, cut by the script that stays in the repository', () => {
    for (const f of ['go-globe-disc.png', 'go-globe-frame.png', 'go-logo.png']) expect(fs.existsSync(path.join(brand, f)), f).toBe(true);
    expect(fs.existsSync(path.resolve(__dirname, '../../scripts/split-go-globe.cjs'))).toBe(true);
    // a PNG with an alpha channel (colour type 6), square
    const disc = fs.readFileSync(path.join(brand, 'go-globe-disc.png'));
    expect(disc.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(disc.readUInt32BE(16)).toBe(disc.readUInt32BE(20)); // width = height
    expect(disc[25]).toBe(6);
  });

  it('turns the sphere always (slower under reduced motion), on an unmasked span of its own layer; appears after a moment when motion is welcome, at once under reduced motion', () => {
    expect(css).toMatch(/@keyframes go-spin \{ from \{ transform: rotate\(0deg\); \} to \{ transform: rotate\(360deg\); \} \}/);
    // the spin is not behind a media query: it is the loading indicator itself (the audit's one allowance, A-C04)
    expect(css).toMatch(/^\.go-globe-disc \{ animation: go-spin 2\.2s linear infinite; transform-origin: 50% 50%; will-change: transform; \}$/m);
    expect(css).toMatch(/\.go-loading \{[^}]*opacity: 0; \}/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{ \.go-loading \{ animation: go-appear \.2s ease \.15s forwards; \} \}/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.go-loading \{ opacity: 1; \} \.go-globe-disc \{ animation-duration: 6s; \} \}/);
    // the layers take the ink and are masks, not images; the mask is never on the turning span
    expect(css).toMatch(/\.go-loading \{[^}]*color: var\(--brand\)/);
    expect(css).toMatch(/\.go-globe-frame, \.go-globe-sphere \{ background: currentColor;[^}]*mask-size: contain/);
    expect(css).not.toMatch(/\.go-globe-disc \{[^}]*mask/);
  });
});

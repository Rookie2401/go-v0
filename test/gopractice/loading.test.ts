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
    expect(frame && disc).toBeTruthy();
    // the images are inline absolute URLs (so they resolve wherever the stylesheet lives), one layer each
    expect(frame!.style.getPropertyValue('mask-image')).toMatch(/^url\("[a-z]+:\/\/[^"]*\/go-globe-frame\.png"\)$/);
    expect(disc!.style.getPropertyValue('mask-image')).toMatch(/^url\("[a-z]+:\/\/[^"]*\/go-globe-disc\.png"\)$/);
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

  it('turns the sphere only when motion is welcome, appears after a moment, and stands still at once under reduced motion', () => {
    expect(css).toMatch(/@keyframes go-spin \{ to \{ transform: rotate\(360deg\); \} \}/);
    const welcome = /@media \(prefers-reduced-motion: no-preference\) \{\s*\.go-loading \{ animation: go-appear[^}]*\}\s*\.go-globe-disc \{ animation: go-spin [^}]*infinite[^}]*\}/;
    expect(css).toMatch(welcome);
    expect(css).toMatch(/\.go-loading \{[^}]*opacity: 0;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.go-loading \{ opacity: 1; \} \}/);
    // the layers take the ink and are masks, not images
    expect(css).toMatch(/\.go-loading \{[^}]*color: var\(--brand\)/);
    expect(css).toMatch(/\.go-globe > span \{[^}]*background: currentColor;[^}]*mask-size: contain/);
  });
});

// @vitest-environment jsdom
/**
 * The loading mark (the owner, 2026-10-28: "the globe should rotate along its axis, not spin"; 2026-11-03: no artificial crescents, a complete
 * spinning globe): the meridian with the stand and the sphere's rim still as CSS masks in the ink; the land one whole turn rendered on a sphere, a
 * sheet of 120 frames shown by two stepped slides; a status with a label for assistive technology; the stylesheet keeps the turn going under
 * reduced motion (slower) and shows the mark after a moment, so a load that ends within a blink shows nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { loadingMark } from '../../packages/goreview/app/loading';

const pkg = path.resolve(__dirname, '../../packages/goreview/app');
const brand = path.resolve(__dirname, '../../packages/shared-brand');
const css = fs.readFileSync(path.join(pkg, 'styles.css'), 'utf8');
const url = (file: string): RegExp => new RegExp(`^url\\("[a-z]+://[^"]*/${file.replace('.', '\\.')}"\\)$`);

/** Decodes the alpha of a filter-any RGBA8 PNG. */
function alphaOf(file: string): { w: number; h: number; a: Uint8Array } {
  const buf = fs.readFileSync(file); let pos = 8; const idat: Buffer[] = []; let w = 0, h = 0;
  while (pos < buf.length) { const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), d = buf.subarray(pos + 8, pos + 8 + len); if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); } if (type === 'IDAT') idat.push(d); pos += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)), st = w * 4, out = Buffer.alloc(h * st); let prev = Buffer.alloc(st);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (st + 1)], line = raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1)), cur = out.subarray(y * st, (y + 1) * st);
    for (let i = 0; i < st; i++) { const l = i >= 4 ? cur[i - 4]! : 0, u = prev[i]!, c = i >= 4 ? prev[i - 4]! : 0; let v = line[i]!; if (f === 1) v += l; else if (f === 2) v += u; else if (f === 3) v += (l + u) >> 1; else if (f === 4) { const p = l + u - c, pa = Math.abs(p - l), pb = Math.abs(p - u), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? l : pb <= pc ? u : c; } cur[i] = v & 255; }
    prev = cur;
  }
  const a = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) a[i] = out[i * 4 + 3]!;
  return { w, h, a };
}

describe('the loading mark', () => {
  it('is a status with the label for assistive technology, and the globe in masked layers: frame and rim still, the land sheet on two sliding spans', () => {
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
    const rows = sphere?.querySelector<HTMLElement>(':scope > .go-globe-disc > .go-globe-rows');
    const turn = rows?.querySelector<HTMLElement>(':scope > .go-globe-turn');
    const land = turn?.querySelector<HTMLElement>(':scope > .go-globe-land');
    expect(frame && rim && sphere && rows && turn && land).toBeTruthy();
    // the images are inline absolute URLs (so they resolve wherever the stylesheet lives), one layer each; the sliding spans carry
    // no mask (WebKit does not repaint a transform animation on a masked element), their child does
    expect(frame!.style.getPropertyValue('mask-image')).toMatch(url('go-globe-frame.png'));
    expect(rim!.style.getPropertyValue('mask-image')).toMatch(url('go-globe-rim.png'));
    expect(sphere!.getAttribute('style')).toBeNull();
    expect(rows!.getAttribute('style')).toBeNull();
    expect(turn!.getAttribute('style')).toBeNull();
    expect(land!.style.getPropertyValue('mask-image')).toMatch(url('go-globe-turn.png'));
    expect(el.querySelector('img')).toBeNull();
  });

  it('ships the layers beside the logo, cut and rendered by the scripts that stay in the repository, with the geometry the stylesheet reads', () => {
    for (const f of ['go-globe-land.png', 'go-globe-rim.png', 'go-globe-frame.png', 'go-globe-turn.png', 'go-logo.png']) expect(fs.existsSync(path.join(brand, f)), f).toBe(true);
    expect(fs.existsSync(path.join(brand, 'go-globe-disc.png'))).toBe(false); // the spinning disc of the first version is gone
    expect(fs.existsSync(path.resolve(__dirname, '../../scripts/split-go-globe.cjs'))).toBe(true);
    expect(fs.existsSync(path.resolve(__dirname, '../../scripts/render-go-globe-turn.cjs'))).toBe(true);
    // PNGs with an alpha channel (colour type 6): the still layers square and the same box
    const sizes = new Set<number>();
    for (const f of ['go-globe-rim.png', 'go-globe-frame.png']) {
      const png = fs.readFileSync(path.join(brand, f));
      expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
      expect(png.readUInt32BE(16), f).toBe(png.readUInt32BE(20)); // width = height
      expect(png[25], f).toBe(6);
      sizes.add(png.readUInt32BE(16));
    }
    expect(sizes.size).toBe(1);
    // the clip circle in the stylesheet is the rim's inner edge, as the script measured it (a share of the box, to two decimals of a percent)
    const geometry = JSON.parse(fs.readFileSync(path.join(brand, 'go-globe-geometry.json'), 'utf8')) as { landRadiusShare: number; circle: { rIn: number }; box: { size: number }; turn: { cols: number; rows: number; frames: number; cell: number } };
    expect(geometry.landRadiusShare).toBeCloseTo(geometry.circle.rIn / geometry.box.size, 6);
    const clip = /\.go-globe-sphere \{[^}]*clip-path: circle\(([\d.]+)% at 50% 50%\)/.exec(css);
    expect(clip, 'the sphere clip').toBeTruthy();
    expect(Number(clip![1])).toBeCloseTo(geometry.landRadiusShare * 100, 1);
    expect(geometry.turn).toMatchObject({ cols: 12, rows: 10, frames: 120 });
    const sheet = fs.readFileSync(path.join(brand, 'go-globe-turn.png'));
    expect(sheet.readUInt32BE(16)).toBe(geometry.turn.cols * geometry.turn.cell);
    expect(sheet.readUInt32BE(20)).toBe(geometry.turn.rows * geometry.turn.cell);
  });

  it('the turn is a whole sphere: no frame is empty or crowded, nothing reaches the rim, and each frame is the last one turned a little (no crescent can travel)', () => {
    const { w, a } = alphaOf(path.join(brand, 'go-globe-turn.png'));
    const { cols, rows, cell } = (JSON.parse(fs.readFileSync(path.join(brand, 'go-globe-geometry.json'), 'utf8')) as { turn: { cols: number; rows: number; cell: number } }).turn;
    const at = (f: number, x: number, y: number): number => a[(Math.floor(f / cols) * cell + y) * w + (f % cols) * cell + x]!;
    const frames = cols * rows, c = (cell - 1) / 2, r = cell / 2, area = Math.PI * r * r;
    const shares: number[] = [];
    for (let f = 0; f < frames; f++) {
      let ink = 0, edge = 0;
      for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) { const v = at(f, x, y); if (!v) continue; ink += v / 255; if (Math.hypot(x - c, y - c) >= r * 0.985) edge = Math.max(edge, v); }
      shares.push(ink / area);
      // the land has faded out before the rim, so what the turn squeezes thin cannot merge with the ring and read as a crescent on it
      expect(edge, `frame ${f} at the rim`).toBeLessThan(8);
    }
    // the old strip left the sphere all but empty for part of its loop; on a whole world the land never leaves
    expect(Math.min(...shares), 'the emptiest frame').toBeGreaterThan(0.03);
    expect(Math.max(...shares), 'the fullest frame').toBeLessThan(0.65);
    // a frame differs from the next by a little, all the way round, the last back to the first included: a real turn, with no jump
    for (let f = 0; f < frames; f++) {
      const g = (f + 1) % frames; let diff = 0;
      for (let y = 0; y < cell; y += 2) for (let x = 0; x < cell; x += 2) diff += Math.abs(at(f, x, y) - at(g, x, y)) / 255;
      expect(diff * 4 / area, `frame ${f} to ${g}`).toBeLessThan(0.12);
    }
  });

  it('plays the 120 frames in order, at normal speed and under reduced motion: the column loop is exactly one row step (2026-11-04: .5 s against a .6 s row step played them out of order)', () => {
    const seconds = (v: string): number => Number(v.replace(/s$/, ''));
    const rule = (re: RegExp): string => { const m = re.exec(css); expect(m, String(re)).toBeTruthy(); return m![1]!; };
    const normal = { rows: seconds(rule(/go-turn-rows ([\d.]+s) steps\(10\)/)), cols: seconds(rule(/go-turn-cols ([\d.]+s) steps\(12\)/)) };
    const reduced = { rows: seconds(rule(/\.go-globe-rows \{ animation-duration: ([\d.]+s); \}/)), cols: seconds(rule(/\.go-globe-turn \{ animation-duration: ([\d.]+s); \}/)) };
    for (const { rows, cols } of [normal, reduced]) {
      // what the two stepped slides show at a moment: the row and column each animation has reached
      const frameAt = (t: number): number => Math.floor(((t / rows) % 1) * 10) * 12 + Math.floor(((t / cols) % 1) * 12);
      const shown: number[] = [];
      for (let k = 0; k < 240; k++) shown.push(frameAt((k + 0.5) * rows / 120)); // the middle of each frame, two whole turns
      expect(shown).toEqual(Array.from({ length: 240 }, (_, k) => k % 120));
    }
  });

  it('turns the land always (slower under reduced motion), on unmasked spans of their own, one whole sheet per loop in whole-pixel steps; appears after a moment when motion is welcome, at once under reduced motion', () => {
    // the rows slide once in 6 s in 10 steps, the columns once in .6 s (one row step) in 12: 120 frames
    expect(css).toMatch(/@keyframes go-turn-rows \{ to \{ transform: translateY\(-100%\); \} \}/);
    expect(css).toMatch(/@keyframes go-turn-cols \{ to \{ transform: translateX\(-100%\); \} \}/);
    expect(css).toMatch(/^\.go-globe-rows \{[^}]*height: 1000%;[^}]*animation: go-turn-rows 6s steps\(10\) infinite; will-change: transform; \}$/m);
    expect(css).toMatch(/^\.go-globe-turn \{[^}]*width: 1200%;[^}]*animation: go-turn-cols \.6s steps\(12\) infinite; will-change: transform; \}$/m);
    expect(css).toMatch(/^\.go-globe-disc \{[^}]*width: 70px; height: 70px;[^}]*overflow: hidden; \}$/m); // whole pixels: 70 is even and a step is 70
    expect(css).toMatch(/^\.go-globe-land \{[^}]*mask-size: 100% 100%;[^}]*mask-repeat: no-repeat; \}$/m);
    // the sphere: the land clipped to a circle, nothing animated on it, and no flat picture leaning or sliding any more
    expect(css).toMatch(/^\.go-globe-sphere \{ overflow: hidden; clip-path: circle\([\d.]+% at 50% 50%\); \}$/m);
    expect(css).not.toMatch(/\.go-globe-sphere \{[^}]*(animation|rotate)/);
    expect(css).not.toMatch(/translateX\(-50%\)/);
    // the turn is not behind a media query: it is the loading indicator itself (the audit's one allowance, A-C04)
    expect(css).toMatch(/\.go-loading \{[^}]*opacity: 0; \}/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{ \.go-loading \{ animation: go-appear \.2s ease \.15s forwards; \} \}/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.go-loading \{ opacity: 1; \} \.go-globe-rows \{ animation-duration: 15s; \} \.go-globe-turn \{ animation-duration: 1\.5s; \} \}/);
    // the layers take the ink and are masks, not images; the mask is never on a sliding span; nothing spins
    expect(css).toMatch(/\.go-loading \{[^}]*color: var\(--brand\)/);
    expect(css).toMatch(/\.go-globe-frame, \.go-globe-rim \{ background: currentColor;[^}]*mask-size: contain/);
    expect(css).toMatch(/\.go-globe-land \{[^}]*background: currentColor/);
    expect(css).not.toMatch(/\.go-globe-(turn|rows) \{[^}]*mask/);
    expect(css).not.toMatch(/go-spin|rotate\(360deg\)|go-globe-disc\.png/);
  });
});

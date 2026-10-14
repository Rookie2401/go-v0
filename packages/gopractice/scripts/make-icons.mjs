/**
 * Draws the GoReview icon (a serif-contrast "G" in the Western Canon brown on the paper colour) and writes
 *   public/icons/icon.svg, apple-touch-icon.png (180), icon-192.png, icon-512.png, icon-maskable-512.png
 * No dependency: the PNG is encoded by hand (zlib from node) from the same outline the SVG uses.
 *   node packages/gopractice/scripts/make-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
fs.mkdirSync(out, { recursive: true });

const PAPER = [0xf7, 0xf2, 0xe8];
const INK = [0x6b, 0x4f, 0x2a]; // --accent
const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

// ── geometry on a 512 x 512 canvas (y down). Angles run clockwise from 3 o'clock, in radians.
const C = 256;
const R_OUT = 150;                                  // outer radius of the bowl
const A0 = (-3 * Math.PI) / 180;                    // the bowl starts just above 3 o'clock (the bar covers the seam)
const A1 = (322 * Math.PI) / 180;                   // and ends at the upper-right terminal
const thick = (a) => 26 + 40 * ((1 - Math.cos(a)) / 2) ** 2; // thin at the right, heavy at the left: stroke contrast
const BAR = { x0: C - 6, x1: C + R_OUT, y0: C - 17, y1: C + 17 };

/** Outline of the bowl as a closed polygon (outer edge out, inner edge back). */
function bowl(steps = 160) {
  const outer = []; const inner = [];
  for (let i = 0; i <= steps; i++) {
    const a = A0 + ((A1 - A0) * i) / steps;
    outer.push([C + R_OUT * Math.cos(a), C + R_OUT * Math.sin(a)]);
    const r = R_OUT - thick(a);
    inner.push([C + r * Math.cos(a), C + r * Math.sin(a)]);
  }
  return [...outer, ...inner.reverse()];
}
const BOWL = bowl();

// the terminal's beak: a short wedge hanging from the end of the upper arm
const tipO = [C + R_OUT * Math.cos(A1), C + R_OUT * Math.sin(A1)];
const tipI = [C + (R_OUT - thick(A1)) * Math.cos(A1), C + (R_OUT - thick(A1)) * Math.sin(A1)];
const FLAG = [tipO, tipI, [tipI[0] + 4, tipI[1] + 38], [tipO[0] + 14, tipO[1] + 38]];

/** A 2048 x 2048 coverage mask of the G (scanline fill of each polygon), so any icon size is a cheap average of it. */
const M = 2048; const K = M / 512;
const mask = new Uint8Array(M * M);
function fill(poly) {
  for (let y = 0; y < M; y++) {
    const py = (y + 0.5) / K; const xs = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
      if ((yi > py) !== (yj > py)) xs.push(((xj - xi) * (py - yi)) / (yj - yi) + xi);
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.round(xs[k] * K)); x < Math.min(M, Math.round(xs[k + 1] * K)); x++) mask[y * M + x] = 1;
  }
}
const asPoly = (r) => [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
for (const poly of [BOWL, asPoly(BAR), FLAG]) fill(poly);

// ── PNG
const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, { scale = 1 } = {}) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      // each pixel averages the mask cells it covers;  shrinks the G towards the centre (the maskable safe zone)
      const per = M / size; let hit = 0; let n = 0;
      for (let sy = 0; sy < per; sy += 2) for (let sx = 0; sx < per; sx += 2) {
        const u = (x * per + sx + 0.5) / K; const v = (y * per + sy + 0.5) / K;
        const mu = Math.floor((C + (u - C) / scale) * K); const mv = Math.floor((C + (v - C) / scale) * K);
        n++; if (mu >= 0 && mu < M && mv >= 0 && mv < M && mask[mv * M + mu]) hit++;
      }
      const t = hit / n;
      for (let k = 0; k < 3; k++) row[1 + x * 3 + k] = Math.round(PAPER[k] * (1 - t) + INK[k] * t);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ── SVG (the same outline)
const pts = (poly) => poly.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const rect = (r) => `<rect x="${r.x0}" y="${r.y0}" width="${r.x1 - r.x0}" height="${r.y1 - r.y0}"/>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="GoReview">
<rect width="512" height="512" fill="${hex(PAPER)}"/>
<g fill="${hex(INK)}">
<polygon points="${pts(BOWL)}"/>
${rect(BAR)}
<polygon points="${pts(FLAG)}"/>
</g>
</svg>
`;

fs.writeFileSync(path.join(out, 'icon.svg'), svg);
fs.writeFileSync(path.join(out, 'apple-touch-icon.png'), png(180));
fs.writeFileSync(path.join(out, 'icon-192.png'), png(192));
fs.writeFileSync(path.join(out, 'icon-512.png'), png(512));
fs.writeFileSync(path.join(out, 'icon-maskable-512.png'), png(512, { scale: 0.78 }));
console.log('wrote', fs.readdirSync(out).join(', '));

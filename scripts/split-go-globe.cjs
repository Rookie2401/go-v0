// Splits the Go logo (packages/shared-brand/go-logo.png) into the globe's three layers for the loading mark (packages/goreview/app/loading.ts):
//   go-globe-land.png   the continents, which drift across the sphere as it turns about its axis
//   go-globe-rim.png    the rim's inner ring, still
//   go-globe-frame.png  the rim's outer ring, the meridian arc with its knobs, and the stand, still
// All three are the same square box around the sphere's centre, so the land can be clipped to the sphere with CSS alone. Run after go-logo.png changes:
//   node scripts/split-go-globe.cjs packages/shared-brand/go-logo.png packages/shared-brand
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function decode(buf) {
  let pos = 8; const idat = []; let w, h, bitDepth, colorType;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const type = buf.toString('ascii', pos + 4, pos + 8); const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; if (data[12] !== 0) throw new Error('interlaced'); }
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('bit depth ' + bitDepth);
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]; const raw = zlib.inflateSync(Buffer.concat(idat)); const stride = w * ch;
  const out = Buffer.alloc(h * stride); let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]; const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)); const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0; let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    prev = cur;
  }
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    const k = i * ch;
    if (ch === 4) { rgba[j] = out[k]; rgba[j + 1] = out[k + 1]; rgba[j + 2] = out[k + 2]; rgba[j + 3] = out[k + 3]; }
    else if (ch === 3) { rgba[j] = out[k]; rgba[j + 1] = out[k + 1]; rgba[j + 2] = out[k + 2]; rgba[j + 3] = 255; }
    else if (ch === 2) { rgba[j] = rgba[j + 1] = rgba[j + 2] = out[k]; rgba[j + 3] = out[k + 1]; }
    else { rgba[j] = rgba[j + 1] = rgba[j + 2] = out[k]; rgba[j + 3] = 255; }
  }
  return { w, h, rgba };
}

const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function encode(w, h, rgba) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Writes the three layers, each in the same square box around the circle's centre that holds the whole globe:
 *   go-globe-land.png   the continents: everything inside the rim's inner edge (d < rIn); the layer that moves
 *   go-globe-rim.png    the rim's inner ring (rIn ≤ d ≤ R − 8), still
 *   go-globe-frame.png  the rest: the rim's outermost ring, the meridian arc with its knobs, and the stand, still
 * plus a geometry JSON. `landRadiusShare` (rIn / size) is the radius of the circle the land is clipped to, as a share of the box, which
 * packages/goreview/app/styles.css carries as the clip-path of .go-globe-sphere.
 */
function write({ w, h, rgba, cx, cy, R, rIn, gx0, gx1, gy0, gy1, outDir }) {
  const alpha = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : rgba[(y * w + x) * 4 + 3];
  // the rim layer stops 8 px inside the rim's outer edge: the rim's outermost ring is round, so it may stay with the frame, and the two places
  // where the meridian arc crosses the rim then belong to the frame
  const edge = R - 8;
  const half = Math.ceil(Math.max(cx - gx0, gx1 - cx, cy - gy0, gy1 - cy) + 6);
  const size = half * 2;
  const left = Math.round(cx) - half, top = Math.round(cy) - half;
  const land = Buffer.alloc(size * size * 4), rim = Buffer.alloc(size * size * 4), frame = Buffer.alloc(size * size * 4);
  let landInk = 0, rimInk = 0, frameInk = 0, band = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = left + x, sy = top + y;
    if (sx < gx0) continue; // the box reaches into the G: the globe alone
    const a = alpha(sx, sy); if (!a) continue;
    const i = (sy * w + sx) * 4, o = (y * size + x) * 4;
    const d = Math.hypot(sx + 0.5 - cx, sy + 0.5 - cy);
    const target = d < rIn ? land : d <= edge ? rim : frame;
    target[o] = rgba[i]; target[o + 1] = rgba[i + 1]; target[o + 2] = rgba[i + 2]; target[o + 3] = a;
    if (target === land) landInk += a; else if (target === rim) rimInk += a; else { frameInk += a; if (d <= edge + 6) band += a; }
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'go-globe-land.png'), encode(size, size, land));
  fs.writeFileSync(path.join(outDir, 'go-globe-rim.png'), encode(size, size, rim));
  fs.writeFileSync(path.join(outDir, 'go-globe-frame.png'), encode(size, size, frame));
  for (const stale of ['go-globe-disc.png']) { const p = path.join(outDir, stale); if (fs.existsSync(p)) fs.unlinkSync(p); }
  const total = landInk + rimInk + frameInk;
  const geometry = { source: { w, h }, globeBox: { x0: gx0, x1: gx1, y0: gy0, y1: gy1 }, circle: { cx, cy, r: R, rIn }, box: { size, left, top }, landRadiusShare: rIn / size, inkShare: { land: landInk / total, rim: rimInk / total, frame: frameInk / total }, inkInBandOutsideCircle: band / 255 };
  fs.writeFileSync(path.join(outDir, 'go-globe-geometry.json'), JSON.stringify(geometry, null, 2));
  return geometry;
}



const [,, src, outDir] = process.argv;
const { w, h, rgba } = decode(fs.readFileSync(src));
const opaque = new Uint8Array(w * h);
for (let i = 0; i < w * h; i++) opaque[i] = rgba[i * 4 + 3] > 40 ? 1 : 0;
// outside flood (4-connected) from the border
const outside = new Uint8Array(w * h);
const stack = [];
for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
while (stack.length) {
  const i = stack.pop();
  if (outside[i] || opaque[i]) continue;
  outside[i] = 1;
  const x = i % w, y = (i - x) / w;
  if (x > 0) stack.push(i - 1); if (x < w - 1) stack.push(i + 1); if (y > 0) stack.push(i - w); if (y < h - 1) stack.push(i + w);
}
// the globe's columns: the last run of opaque columns
const cols = new Array(w).fill(0);
for (let i = 0; i < w * h; i++) if (opaque[i]) cols[i % w]++;
const runs = []; let inRun = false, start = 0;
for (let x = 0; x < w; x++) { const o = cols[x] > 0; if (o && !inRun) { inRun = true; start = x; } if (!o && inRun) { inRun = false; runs.push([start, x - 1]); } }
if (inRun) runs.push([start, w - 1]);
const [gx0, gx1] = runs[runs.length - 1];
let gy0 = h, gy1 = -1;
for (let y = 0; y < h; y++) for (let x = gx0; x <= gx1; x++) if (opaque[y * w + x]) { if (y < gy0) gy0 = y; if (y > gy1) gy1 = y; }
// enclosed transparent pixels inside the globe's columns
let ex0 = w, ex1 = -1, ey0 = h, ey1 = -1, count = 0;
for (let y = 0; y < h; y++) for (let x = gx0; x <= gx1; x++) { const i = y * w + x; if (!opaque[i] && !outside[i]) { count++; if (x < ex0) ex0 = x; if (x > ex1) ex1 = x; if (y < ey0) ey0 = y; if (y > ey1) ey1 = y; } }
const cx = (ex0 + ex1 + 1) / 2, cy = (ey0 + ey1 + 1) / 2;
const rIn = Math.max(ex1 - ex0 + 1, ey1 - ey0 + 1) / 2;
// rim thickness: walk outward from the inner edge at four compass points (the stand is below, so take the median of top, left, right)
function thickness(dx, dy) { let r = rIn; let seenInk = false; for (; r < rIn + 200; r++) { const x = Math.round(cx + dx * r), y = Math.round(cy + dy * r); const o = opaque[y * w + x]; if (o) seenInk = true; else if (seenInk) break; } return r - rIn; }
const ts = [thickness(0, -1), thickness(-1, 0), thickness(1, 0)].sort((a, b) => a - b);
const t = ts[1];
const R = rIn + t;
const geometry = write({ w, h, rgba, cx, cy, R, rIn, gx0, gx1, gy0, gy1, outDir });
console.log(JSON.stringify({ enclosedPixels: count, inner: { ex0, ex1, ey0, ey1, rIn }, thicknesses: ts, circle: { cx, cy, R }, ...geometry }));

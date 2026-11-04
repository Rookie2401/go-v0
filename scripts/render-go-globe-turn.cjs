// Renders the loading mark's turning sphere (packages/goreview/app/loading.ts): a sprite sheet of the land seen on a real sphere (orthographic), one
// full turn about the axis through the logo's meridian knobs. The Americas, Greenland and Iceland are the logo's own art, unprojected from
// go-globe-land.png; the rest of the world (the logo only ever showed one side, its Africa and Europe cut by the sphere's edge) is drawn here in
// coarse coasts, rounded to the logo's style. Run after go-logo.png changes, after scripts/split-go-globe.cjs:
//   node scripts/render-go-globe-turn.cjs packages/shared-brand
// Writes go-globe-turn.png and adds `turn` to go-globe-geometry.json.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const dir = process.argv[2];
const COLS = 19, ROWS = 19, // 361 frames, one degree each; 19 x 70 CSS px keeps the moving layer under 4096 device px on a 3x phone
   CELL = Number(process.env.CELL || 150), FRAMES = COLS * ROWS;
const AXIS_TILT = 32 * Math.PI / 180; // the axis leans clockwise, through the meridian's knobs
const VIEW_LAT = 8 * Math.PI / 180;   // the logo's globe is seen from a little above its equator
const ART_CENTRE_LON = -50;           // the geographic longitude the logo's art is centred on
const LIMB_START = 0.88, LIMB_END = 0.985; // the land fades out towards the sphere's edge, as a lit sphere darkens there, so what the turn squeezes thin never merges with the rim
const EQ_W = 1440, EQ_H = 720;        // the land map, a quarter of a degree per pixel; x = longitude relative to the art's centre

// the world beyond the logo's art: coarse coasts as [longitude, latitude], rounded afterwards by the blur below
const LAND = [
  // Africa
  [[-6,35.8],[-2,35.2],[3,36.9],[10,37.3],[11,33.5],[15,32.3],[20,31],[20,32.8],[25,31.7],[32.3,31.2],[34,27.5],[37,21],[39.5,15.5],[43.3,11.5],[51.2,11.8],[48,5],[42,-1],[39.5,-6],[40.5,-15],[35,-20],[35.5,-24],[32.7,-28],[28,-33],[20,-34.8],[18,-32],[15,-26],[12,-17],[13.5,-9],[9,-1],[9.5,4],[4,6.2],[-4,5.2],[-8,4.5],[-13,8.5],[-17,14.7],[-16.5,20],[-13,27.5],[-9.5,31]],
  // Eurasia, from Portugal east along the south coast, round by the Pacific and home along the Arctic and the Baltic
  [[-9,37],[-5.5,36],[0,39],[3,42],[6,43],[9,44],[12,42],[16,38.5],[18,40],[14,42.5],[13,45.5],[19,41],[22,37],[24,40],[26,40.5],[27,37],[32,36],[36,36.5],[35,32],[34.5,29],[39,21],[43,13],[45,12.8],[52,16],[59.5,22.5],[56,26],[51,25],[48,30],[51,28],[57,26],[62,25],[67,25],[72,21],[73,16],[76,9],[78,8],[80,13],[87,21],[91,22],[94,18],[97,16],[98.5,10],[101,3],[104,1.5],[103,6],[100,13],[105,9],[109,12],[106,19],[108,21.5],[113,22],[120,26],[122,31],[119,35],[122,37],[118,39],[121,40],[125,39.5],[126.5,35],[129,35.5],[128,39],[130,42.5],[135,44],[140,48],[141,53],[135,54.5],[143,59],[155,59.5],[157,52],[162,56],[164,60],[178,62.5],[190,65.5],[180,69],[160,70],[140,73],[130,71],[113,74],[105,77.5],[88,75],[70,73],[68,68.5],[55,69],[44,67],[40,65],[34,66],[41,67],[33,69.5],[25,71],[15,68.5],[5,62],[6,58],[11,59],[13,55.5],[18,59],[17,62],[23,65.5],[21,61],[23,60],[30,60],[23,57.5],[20,54.5],[11,54],[8,57],[8,54],[4,52],[-1,50],[-4.5,48.5],[-1.5,46],[-2,43.5],[-9,43.5]],
  [[-5,50],[1,51],[0,54],[-3,58.5],[-6,57],[-3,54],[-5,52]], // Great Britain
  [[-10,52],[-6,52],[-6,55],[-10,54]], // Ireland
  [[44,-16],[49.5,-12],[50,-16],[47,-25],[44,-24]], // Madagascar
  [[80,9.5],[82,7],[80.5,6]], // Sri Lanka
  [[130,31.5],[132,34.5],[136,36.5],[140,40],[140,45],[145,43.5],[142,40],[140.5,35],[136,33.5]], // Japan
  [[95,5.5],[100,2],[106,-3],[104,-6],[100,-3],[96,2]], // Sumatra
  [[105,-6],[114,-7],[114,-8.5],[106,-7.5]], // Java
  [[109,1],[113,3.5],[117,7],[119,1],[116,-4],[110,-3]], // Borneo
  [[119,-5],[120,1],[125,1.5],[122,-5]], // Sulawesi
  [[131,-1],[141,-2.5],[147,-6],[150,-10],[143,-9],[138,-8],[133,-4]], // New Guinea
  [[120,18.5],[122.5,18],[124,13],[126,7],[122,7],[121,13]], // the Philippines
  [[114,-22],[122,-18],[129,-15],[131,-12],[136,-12],[136,-15],[140,-17.5],[142,-11],[146,-19],[153,-26],[150,-37],[144,-38.5],[138,-35],[131,-31.5],[124,-33],[115,-34.5],[113,-26]], // Australia
  [[145,-41],[148,-41],[147,-43.5]], // Tasmania
  [[173,-35],[178,-38],[175,-41.5]], [[172,-41],[174,-42],[168,-47],[166.5,-45.5]], // New Zealand
];
const WATER = [[[28,43],[31,46],[37,46],[41,42],[35,42],[29,41]], [[47,45],[53,45],[54,37],[50,37],[49,41]]]; // the Black Sea, the Caspian

function decode(buf) {
  let pos = 8; const idat = []; let w, h;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), d = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); if (d[8] !== 8 || d[9] !== 6) throw new Error('expected RGBA8'); }
    if (type === 'IDAT') idat.push(d);
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), st = w * 4, out = Buffer.alloc(h * st); let prev = Buffer.alloc(st);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (st + 1)], line = raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1)), cur = out.subarray(y * st, (y + 1) * st);
    for (let i = 0; i < st; i++) {
      const a = i >= 4 ? cur[i - 4] : 0, b = prev[i], c = i >= 4 ? prev[i - 4] : 0; let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    prev = cur;
  }
  const al = new Float32Array(w * h); for (let i = 0; i < w * h; i++) al[i] = out[i * 4 + 3] / 255;
  return { w, h, al };
}
const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, 'ascii'), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
/** RGBA, black, the coverage in the alpha: a CSS mask reads the alpha. */
function encodeAlpha(w, h, al) {
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw[y * (w * 4 + 1) + 1 + x * 4 + 3] = al[y * w + x];
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ── the logo's art, keeping the Americas, Greenland and Iceland: the pieces left of Europe (Europe and Africa are the ones the sphere's edge cuts)
const geo = JSON.parse(fs.readFileSync(path.join(dir, 'go-globe-geometry.json'), 'utf8'));
const art = decode(fs.readFileSync(path.join(dir, 'go-globe-land.png')));
const ax0 = geo.circle.cx - geo.box.left, ay0 = geo.circle.cy - geo.box.top, aR = geo.circle.rIn;
const label = new Int32Array(art.w * art.h).fill(-1), comps = [];
for (let s = 0; s < art.w * art.h; s++) {
  if (art.al[s] < 0.15 || label[s] >= 0) continue;
  const id = comps.length; let n = 0, sx = 0; const todo = [s]; label[s] = id;
  while (todo.length) {
    const i = todo.pop(), x = i % art.w; n++; sx += x;
    for (const m of [x > 0 ? i - 1 : -1, x < art.w - 1 ? i + 1 : -1, i - art.w, i + art.w]) if (m >= 0 && m < label.length && art.al[m] >= 0.15 && label[m] < 0) { label[m] = id; todo.push(m); }
  }
  comps.push({ n, cx: sx / n });
}
const KEEP_LEFT_OF = ax0 + 115; // box pixels from the centre: Iceland stands at about +104, the first of Europe at about +124
const keep = comps.map((c) => c.cx < KEEP_LEFT_OF);
const artAt = (x, y) => { const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= art.w || yi >= art.h) return 0; const l = label[yi * art.w + xi]; return l >= 0 && keep[l] ? 1 : 0; };

// ── the map: x is longitude relative to the art's centre, wrapping; y is latitude, north at the top
function fill(map, poly, value) {
  const pts = poly.map(([lon, lat]) => [(lon - ART_CENTRE_LON + 180) / 360 * EQ_W, (90 - lat) / 180 * EQ_H]); // unwrapped; the pixels wrap below
  for (let y = 0; y < EQ_H; y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; if ((y0 <= yc) !== (y1 <= yc)) xs.push(x0 + (yc - y0) / (y1 - y0) * (x1 - x0)); }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) map[y * EQ_W + ((x % EQ_W) + EQ_W) % EQ_W] = value;
  }
}
const hand = new Float32Array(EQ_W * EQ_H);
for (const p of LAND) fill(hand, p, 1);
for (const p of WATER) fill(hand, p, 0);
// round the coasts like the logo's: a Gaussian of 1.1 degrees, then the half-way line
const SIGMA = 1.1 * EQ_W / 360, rad = Math.ceil(SIGMA * 3), ker = []; let sum = 0;
for (let i = -rad; i <= rad; i++) { const v = Math.exp(-i * i / (2 * SIGMA * SIGMA)); ker.push(v); sum += v; }
for (let i = 0; i < ker.length; i++) ker[i] /= sum;
const t1 = new Float32Array(EQ_W * EQ_H), land = new Uint8Array(EQ_W * EQ_H);
for (let y = 0; y < EQ_H; y++) for (let x = 0; x < EQ_W; x++) { let v = 0; for (let k = -rad; k <= rad; k++) v += ker[k + rad] * hand[y * EQ_W + ((x + k) % EQ_W + EQ_W) % EQ_W]; t1[y * EQ_W + x] = v; }
for (let y = 0; y < EQ_H; y++) for (let x = 0; x < EQ_W; x++) { let v = 0; for (let k = -rad; k <= rad; k++) { const yy = Math.min(EQ_H - 1, Math.max(0, y + k)); v += ker[k + rad] * t1[yy * EQ_W + x]; } land[y * EQ_W + x] = v >= 0.5 ? 1 : 0; }
// the art, unprojected onto the same map: every map pixel on the art's near side reads the pixel of the art it would show on
const sl = Math.sin(VIEW_LAT), cl = Math.cos(VIEW_LAT);
for (let y = 0; y < EQ_H; y++) {
  const lat = (90 - (y + 0.5) / EQ_H * 180) * Math.PI / 180;
  for (let x = 0; x < EQ_W; x++) {
    const rel = ((x + 0.5) / EQ_W * 360 - 180) * Math.PI / 180;
    const px = Math.cos(lat) * Math.sin(rel), py = Math.sin(lat), pz = Math.cos(lat) * Math.cos(rel);
    const vy = py * cl - pz * sl, vz = py * sl + pz * cl;
    if (vz <= 0.02) continue;
    if (artAt(ax0 + px * aR, ay0 - vy * aR)) land[y * EQ_W + x] = 1;
  }
}
// ── the sheet: one full turn, the land moving eastward (to the right), as the Earth does and as the old strip did
const SS = 3, sheet = new Uint8Array(COLS * CELL * ROWS * CELL), st = Math.sin(AXIS_TILT), ct = Math.cos(AXIS_TILT);
const sample = (lat, rel) => { const x = Math.floor((((rel / (2 * Math.PI) + 0.5) % 1) + 1) % 1 * EQ_W), y = Math.min(EQ_H - 1, Math.max(0, Math.floor((0.5 - lat / Math.PI) * EQ_H))); return land[y * EQ_W + x]; };
for (let f = 0; f < FRAMES; f++) {
  const ox = (f % COLS) * CELL, oy = Math.floor(f / COLS) * CELL, centre = -2 * Math.PI * f / FRAMES;
  for (let py = 0; py < CELL; py++) for (let px = 0; px < CELL; px++) {
    let hit = 0;
    for (let a = 0; a < SS; a++) for (let b = 0; b < SS; b++) {
      const sx = ((px + (a + 0.5) / SS) / CELL) * 2 - 1, sy = 1 - ((py + (b + 0.5) / SS) / CELL) * 2, rr = sx * sx + sy * sy;
      if (rr > 1) continue;
      const ux = sx * ct - sy * st, uy = sx * st + sy * ct, uz = Math.sqrt(1 - rr); // undo the axis's lean
      const wy = uy * cl + uz * sl, wz = -uy * sl + uz * cl;                         // undo the view from above
      if (sample(Math.asin(Math.max(-1, Math.min(1, wy))), Math.atan2(ux, wz) + centre)) hit++;
    }
    const rho = Math.hypot((px + 0.5) / CELL * 2 - 1, (py + 0.5) / CELL * 2 - 1), e = Math.max(0, Math.min(1, (LIMB_END - rho) / (LIMB_END - LIMB_START)));
    sheet[(oy + py) * COLS * CELL + ox + px] = Math.round(hit / (SS * SS) * 255 * e * e * (3 - 2 * e));
  }
}
const png = encodeAlpha(COLS * CELL, ROWS * CELL, sheet);
fs.writeFileSync(path.join(dir, 'go-globe-turn.png'), png);
geo.turn = { cols: COLS, rows: ROWS, frames: FRAMES, cell: CELL, axisTiltDeg: 32, viewLatDeg: 8, artCentreLon: ART_CENTRE_LON };
fs.writeFileSync(path.join(dir, 'go-globe-geometry.json'), JSON.stringify(geo, null, 2));
console.log(JSON.stringify({ bytes: png.length, comps: comps.map((c, i) => ({ px: c.n, dx: Math.round(c.cx - ax0), keep: keep[i] })).filter((c) => c.px > 30) }));

/**
 * Distribution scan (docs/ecosystem/audit/RIGHTS-AND-ATTRIBUTION.md, "Distribution scan 2026-10-09"): what the built
 * product folders actually contain. It reports facts about files; it makes no claim about legal status.
 *
 * Scanned folders (git-ignored build output, so each is skipped with the build command when absent):
 *   packages/golearn-extension/dist/       the loadable extension (+ dist/app, its setup page)
 *   packages/golearn-extension/dist-web/   the hosted setup page
 *   packages/gopractice/dist/              GoPractice
 *
 * Checks, per folder: no frequency sidecar; no file kinds or directory names of the retired library; no text of the
 * retired corpus (every string of data/corpus, data/ladder, data/stage0 and all four verified Bibles, plus a stride
 * sample of public/library and data/sources) in any text file; no title or author of a catalogued work; the
 * third-party notice file; the kaikki attribution in the shipped dictionary manifest and in the notices.
 *
 * Text is compared after normalisation (NFC, lower case, everything that is not a letter, digit or mark removed), in
 * windows of 40 characters, with a rolling hash and an exact check on each hash hit. A string shorter than one
 * window (40 normalised characters) is not used: shorter strings are common words and phrases.
 */
import { beforeAll, describe, expect, it, type TestContext } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './conformance.support';

const abs = (r: string): string => path.join(ROOT, r);

interface Dist { id: string; dir: string; builds: string; notices: string[]; dictDir: string }
const DISTS: Dist[] = [
  {
    id: 'extension (dist)', dir: 'packages/golearn-extension/dist',
    builds: 'npm run ext:build && npx vite build -c packages/golearn-extension/app/vite.config.ts --mode options',
    notices: ['THIRD-PARTY-NOTICES.md', 'app/THIRD-PARTY-NOTICES.md'], dictDir: 'app/dict',
  },
  {
    id: 'hosted setup page (dist-web)', dir: 'packages/golearn-extension/dist-web',
    builds: 'npx vite build -c packages/golearn-extension/app/vite.config.ts --mode web',
    notices: ['THIRD-PARTY-NOTICES.md'], dictDir: 'dict',
  },
  {
    id: 'GoPractice (dist)', dir: 'packages/gopractice/dist',
    builds: 'npx vite build -c packages/gopractice/vite.config.ts',
    notices: ['THIRD-PARTY-NOTICES.md'], dictDir: 'dict',
  },
];

const KAIKKI_ATTRIBUTION = 'Wiktionary, via kaikki.org — CC BY-SA 4.0';
const TEXT_EXT = /\.(js|mjs|css|html|json|md|txt|xml|svg|webmanifest)$/i;
/** The one binary kind of a web build: the EB Garamond web fonts (SIL OFL 1.1, packages/shared-fonts). */
const FONT_EXT = /\.woff2$/i;

const listAll = (dir: string): string[] => {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else out.push(path.relative(abs(dir), p).split(path.sep).join('/'));
    }
  };
  walk(abs(dir));
  return out.sort();
};

// ---------------------------------------------------------------------------------------------------------------------
// fingerprints

const W = 40;
const MIN_LEN = W;
const B = 1000003;
const POW = ((): number => { let p = 1; for (let i = 0; i < W; i++) p = Math.imul(p, B); return p | 0; })();
const norm = (s: string): string => s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, '');
const hashOf = (s: string): number => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, B) + s.charCodeAt(i)) | 0; return h; };

interface Fingerprints { windows: Map<string, string>; hashes: Set<number>; sources: Record<string, number> }
const fp: Fingerprints = { windows: new Map(), hashes: new Set(), sources: {} };
const names: { titles: Map<string, string> } = { titles: new Map() };

/** Head and tail window of one string (a whole sentence or verse copied into a build is caught by either). */
function addString(raw: string, origin: string): void {
  // licence boilerplate (a licence name or link) is not text of a work: the notices legitimately quote the same licences
  if (/creativecommons\.org|^https?:\/\//i.test(raw)) return;
  const n = norm(raw);
  if (n.length < MIN_LEN) return;
  add(n.slice(0, W), origin);
  add(n.slice(n.length - W), origin);
  fp.sources[origin.split(':')[0]] = (fp.sources[origin.split(':')[0]] ?? 0) + 1;
}

/**
 * Consecutive strings joined and cut into aligned, non-overlapping windows: any copied run of 2 * W - 1 normalised
 * characters (about 12 words) that follows the original's order contains one whole window. `max` bounds a sampled file.
 */
function addRun(parts: readonly string[], origin: string, max = Infinity): void {
  const n = norm(parts.filter((p) => !/creativecommons\.org|^https?:\/\//i.test(p)).join(' '));
  let count = 0;
  for (let s = 0; s + W <= n.length && count < max; s += W, count++) add(n.slice(s, s + W), origin);
  fp.sources[origin.split(':')[0]] = (fp.sources[origin.split(':')[0]] ?? 0) + 1;
}

function add(w: string, origin: string): void {
  if (!fp.windows.has(w)) { fp.windows.set(w, origin); fp.hashes.add(hashOf(w)); }
}

const META_KEYS = new Set(['id', 'lang', 'schemaVersion', 'schema', 'source', 'review', 'corpus', 'provenance', 'attribution', 'licenseNote', 'notes', 'topics', 'editorialTags', 'prepTargets', 'generated', 'rights', 'basis', 'url', 'file']);
/** Leaf strings grouped by their key path with array indices removed (all `sentences[].text` of a document together). */
function leafGroups(v: unknown, out: Map<string, string[]>, p = '', depth = 0): void {
  if (typeof v === 'string') { const g = out.get(p); if (g) g.push(v); else out.set(p, [v]); }
  else if (Array.isArray(v)) for (const x of v) leafGroups(x, out, p, depth + 1);
  else if (v && typeof v === 'object' && depth < 12) for (const [k, x] of Object.entries(v)) if (!META_KEYS.has(k) && !/licen[cs]e/i.test(k)) leafGroups(x, out, `${p}.${k}`, depth + 1);
}

function walkData(dir: string, re: RegExp, maxBytes: number, stride: number): string[] {
  const root = abs(dir);
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (re.test(e.name)) files.push(p);
    }
  };
  walk(root);
  files.sort();
  return files.filter((_, i) => i % stride === 0).filter((f) => fs.statSync(f).size <= maxBytes);
}

/** `stride` 1 = every file; `max` bounds the windows taken from one run (sampled directories). */
function addDataDir(dir: string, label: string, stride: number, maxBytes = 8_000_000, max = Infinity): void {
  for (const f of walkData(dir, /\.(json|txt|md)$/i, maxBytes, stride)) {
    const text = fs.readFileSync(f, 'utf8');
    const origin = `${label}:${path.relative(ROOT, f).split(path.sep).join('/')}`;
    const groups = new Map<string, string[]>();
    if (f.endsWith('.json')) { try { leafGroups(JSON.parse(text), groups); } catch { continue; } } else groups.set('', text.split(/\n+/));
    for (const strings of groups.values()) {
      for (const s of strings.slice(0, max === Infinity ? undefined : 60)) addString(s, origin);
      addRun(strings, origin, max);
    }
  }
}

let loaded = false;
function loadFingerprints(): void {
  if (loaded) return;
  loaded = true;
  // the retired course: bundled corpus, ladders, Stage 0 packs: every file, every string
  addDataDir('data/corpus', 'corpus', 1);
  addDataDir('data/ladder', 'ladder', 1);
  addDataDir('data/stage0', 'stage0', 1);
  // the installed library and the source texts: a deterministic stride sample of files (200 MB each)
  addDataDir('public/library', 'library', 61, 6_000_000, 400);
  addDataDir('data/sources', 'sources', 5, 6_000_000, 400);
  // the four verified Bibles: every verse alone, and every book as one run
  const scr = abs('data/verified/scripture.json');
  if (fs.existsSync(scr)) {
    const j = JSON.parse(fs.readFileSync(scr, 'utf8')) as { translations: Array<{ translationId: string; verses: Record<string, { text: string }> }> };
    for (const t of j.translations) {
      const books = new Map<string, string[]>();
      for (const [ref, v] of Object.entries(t.verses)) {
        addString(v.text, `scripture:${t.translationId}`);
        const b = ref.split('.')[0];
        if (!books.has(b)) books.set(b, []);
        books.get(b)!.push(v.text);
      }
      for (const [b, texts] of books) addRun(texts, `scripture:${t.translationId}:${b}`);
    }
  }
  // titles and authors of every catalogued work (including withheld ones)
  for (const f of ['thai-literature-works', 'curriculum-acquired-works']) {
    const file = abs('src/course/' + f + '.json');
    if (!fs.existsSync(file)) continue;
    for (const e of JSON.parse(fs.readFileSync(file, 'utf8')) as Array<{ title?: string; author?: string }>) {
      for (const [what, s, min] of [['title', e.title, 14], ['author', e.author, 10]] as const) {
        const n = s ? norm(s) : '';
        if (n.length >= min) names.titles.set(n, what + ' in src/course/' + f + '.json: ' + s);
      }
    }
  }
  const dir = abs('data/sources/course-library');
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { entries?: Array<{ title?: string; author?: string }>; withheld?: Array<{ title?: string; author?: string }> };
      for (const e of [...(j.entries ?? []), ...(j.withheld ?? [])]) {
        for (const [what, s, min] of [['title', e.title, 14], ['author', e.author, 10]] as const) {
          const n = s ? norm(s) : '';
          if (n.length >= min) names.titles.set(n, `${what} in ${f}: ${s}`);
        }
      }
    }
  }
}

/**
 * Overlaps that were examined by hand and are not literary or Scripture text. Each is a window (normalised) that the
 * shipped build shares with the retired curriculum's owner-authored material; a new overlap fails the test until it is
 * examined and either removed or added here with the reason.
 */
const EXAMINED_OVERLAPS: ReadonlyArray<{ window: string; origin: string; why: string }> = [
  {
    window: 'aleminderitisfaleminderitandtwovowelswri',
    origin: 'stage0:data/stage0/sq/sounds/sq-snd1.json',
    why: 'the Albanian orientation tutorial (packages/language-packs/src/tutorial/sq.ts) reuses a pronunciation sentence of the retired Stage 0 sound pack; both are owner-authored, machine-drafted English explanations, not third-party text',
  },
  {
    window: 'efinitenominativesingularandindefiniteno',
    origin: 'ladder:data/ladder/sq/PLAN-A1-2-A2.md',
    why: 'a grammar-label phrase ("definite nominative singular and indefinite nominative plural") that a Wiktionary dictionary shard (s-94.json) and an owner planning note both contain; generic terminology, no running text',
  },
];
const explained = (hit: string): string | undefined => {
  const m = /window "([^"]+)" with ([^ ]+)$/.exec(hit);
  return m ? EXAMINED_OVERLAPS.find((o) => o.window === m[1] && o.origin === m[2])?.why : undefined;
};

function scanText(text: string, hits: string[], file: string): void {
  const n = norm(text);
  if (n.length >= W) {
    let h = 0;
    for (let i = 0; i < n.length; i++) {
      h = (Math.imul(h, B) + n.charCodeAt(i)) | 0;
      if (i >= W) h = (h - Math.imul(n.charCodeAt(i - W), POW)) | 0;
      if (i >= W - 1 && fp.hashes.has(h)) {
        const w = n.slice(i - W + 1, i + 1);
        const origin = fp.windows.get(w);
        if (origin) hits.push(`${file}: shares a ${W}-character window "${w}" with ${origin}`);
      }
    }
  }
  for (const [name, why] of names.titles) if (n.includes(name)) hits.push(`${file}: contains ${why}`);
}

// ---------------------------------------------------------------------------------------------------------------------

describe('fingerprint set (the scan is only meaningful if it knows the retired text)', () => {
  beforeAll(loadFingerprints, 120_000);
  it('covers the retired corpus, ladders, Stage 0, the library sample, the sources sample and all four Bibles', () => {
    loadFingerprints();
    const need = fs.existsSync(abs('data/corpus')) && fs.existsSync(abs('data/verified/scripture.json'));
    if (!need) return; // data/ not checked out: only the structural checks below apply
    expect(fp.sources.corpus ?? 0).toBeGreaterThan(300);
    expect(fp.sources.ladder ?? 0).toBeGreaterThan(5_000);
    expect(fp.sources.stage0 ?? 0).toBeGreaterThan(500);
    expect(fp.sources.scripture ?? 0).toBeGreaterThan(100_000);
    expect(fp.windows.size).toBeGreaterThan(100_000);
    expect(names.titles.size).toBeGreaterThan(100);
  });

  it('positive control: the scan finds a window of the retired corpus and a Bible verse when they are planted', () => {
    loadFingerprints();
    if (fp.windows.size === 0) return;
    const planted = [...fp.windows.entries()].find(([, o]) => o.startsWith('corpus:'))?.[0];
    const verse = [...fp.windows.entries()].find(([, o]) => o.startsWith('scripture:'))?.[0];
    expect(planted).toBeTruthy();
    const hits: string[] = [];
    scanText(`<p>${planted}</p> and ${verse}`, hits, 'planted.html');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const title = [...names.titles.keys()][0];
    const hits2: string[] = [];
    scanText(`x ${title} y`, hits2, 'planted.html');
    expect(hits2.length).toBe(1);
  });
});

describe.each(DISTS)('$id', (dist) => {
  const present = fs.existsSync(abs(dist.dir)) && fs.readdirSync(abs(dist.dir)).length > 0;
  const skipNote = `${dist.dir} is missing: build it with  ${dist.builds}`;
  const files = present ? listAll(dist.dir) : [];
  const guard = (ctx: TestContext): void => { if (!present) ctx.skip(skipNote); };

  it(`is built [${present ? 'present' : 'SKIPPED: ' + skipNote}]`, (ctx) => {
    guard(ctx);
    expect(files.length).toBeGreaterThan(10);
    const bytes = files.reduce((n, f) => n + fs.statSync(path.join(abs(dist.dir), f)).size, 0);
    console.info(`[dist] ${dist.dir}: ${files.length} files, ${(bytes / 1024 / 1024).toFixed(2)} MiB`);
  });

  it('contains no frequency list and no other word-count sidecar', (ctx) => {
    guard(ctx);
    expect(files.filter((f) => /(^|\/)frequency\.json$/.test(f) || /freq/i.test(path.basename(f)))).toEqual([]);
  });

  it('contains only the file kinds of a web build: no EPUB, USFM, audio, archive, source map or database; no library, corpus, ladder, stage0 or Bible directory', (ctx) => {
    guard(ctx);
    expect(files.filter((f) => /\.(epub|usfm|usx|sfm|wav|oga|ogg|mp3|m4a|zip|gz|tgz|map|sqlite|db|jsonl|pdf|docx?)$/i.test(f))).toEqual([]);
    const dirs = new Set(files.flatMap((f) => f.split('/').slice(0, -1)));
    expect([...dirs].filter((d) => /^(library|corpus|sources|ladder|stage0|scripture|bible|bibles|audio|recordings|texts|books)$/i.test(d))).toEqual([]);
    // every file is one of the build's known kinds
    expect(files.filter((f) => !TEXT_EXT.test(f) && !FONT_EXT.test(f))).toEqual([]);
  });

  it('ships exactly the font files its stylesheet names (woff2 only) and the EB Garamond SIL OFL text beside the notices', (ctx) => {
    guard(ctx);
    const sheets = files.filter((f) => /\.css$/i.test(f));
    const named = sheets.flatMap((c) => [...fs.readFileSync(path.join(abs(dist.dir), c), 'utf8').matchAll(/url\(\s*['"]?(\.\/fonts\/[^'")]+\.woff2)['"]?\s*\)/g)].map((m) => path.posix.join(path.posix.dirname(c), m[1])));
    expect([...new Set(named)].sort(), 'the stylesheet names the three EB Garamond files').toHaveLength(3);
    const shipped = files.filter((f) => FONT_EXT.test(f));
    expect(shipped.filter((f) => !named.includes(f)), 'a font file nothing names').toEqual([]);
    expect(named.filter((f) => !shipped.includes(f)), 'a named font file that is missing').toEqual([]);
    const beside = dist.notices.filter((n) => files.includes(n)).map((n) => path.posix.join(path.posix.dirname(n), 'EB-Garamond-OFL.txt')).filter((o) => files.includes(o));
    expect(beside.length, 'EB-Garamond-OFL.txt beside a notice file').toBeGreaterThan(0);
    const licence = fs.readFileSync(path.join(abs(dist.dir), beside[0]), 'utf8');
    expect(licence).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/);
    expect(licence).toMatch(/Copyright 2017 The EB Garamond Project Authors \(https:\/\/github\.com\/octaviopardo\/EBGaramond12\)/);
  });

  it('ships the Albanian dictionary only (no other language, no non-installable pack data)', (ctx) => {
    guard(ctx);
    const langs = new Set(files.filter((f) => f.startsWith(dist.dictDir + '/')).map((f) => f.slice(dist.dictDir.length + 1).split('/')[0]));
    expect([...langs]).toEqual(['sq']);
  });

  it('contains none of the retired corpus, ladders, Stage 0 packs, library or Scripture text in any text file, and no catalogued title or author', (ctx) => {
    guard(ctx);
    loadFingerprints();
    if (fp.windows.size === 0) ctx.skip('data/ is not checked out: no fingerprints to compare');
    const hits: string[] = [];
    let scanned = 0;
    for (const f of files.filter((x) => TEXT_EXT.test(x))) {
      scanText(fs.readFileSync(path.join(abs(dist.dir), f), 'utf8'), hits, f);
      scanned++;
    }
    const unexplained = hits.filter((h) => !explained(h));
    console.info(`[dist] ${dist.dir}: ${scanned} text files compared against ${fp.windows.size} windows and ${names.titles.size} titles/authors; raw hits: ${hits.length}, examined overlaps: ${hits.length - unexplained.length}, unexplained: ${unexplained.length}`);
    expect(unexplained.slice(0, 20)).toEqual([]);
    // the examined overlaps involve the owner-authored curriculum only: none touches the library, the sources, a Bible or a catalogued title
    expect(hits.filter((h) => /with (library|sources|scripture|corpus):|contains (title|author)/.test(h))).toEqual([]);
  }, 120_000);

  it('carries THIRD-PARTY-NOTICES.md with the kaikki / Wiktionary attribution, the CC BY-SA 4.0 licence link and the ts-fsrs notice', (ctx) => {
    guard(ctx);
    const found = dist.notices.filter((n) => files.includes(n));
    expect(found.length, `none of ${dist.notices.join(', ')} in ${dist.dir}`).toBeGreaterThan(0);
    const text = fs.readFileSync(path.join(abs(dist.dir), found[0]), 'utf8');
    expect(text).toMatch(/kaikki\.org/);
    expect(text).toMatch(/Wiktionary/);
    expect(text).toMatch(/creativecommons\.org\/licenses\/by-sa\/4\.0/);
    expect(text).toMatch(/ts-fsrs/);
    // a copy of the repository's notice file: when the root file changed after the build the dist is stale (reported, not failed:
    // the dist is git-ignored build output)
    const same = crypto.createHash('sha256').update(text).digest('hex') === crypto.createHash('sha256').update(fs.readFileSync(abs('THIRD-PARTY-NOTICES.md'), 'utf8')).digest('hex');
    if (!same) console.warn(`[dist] ${dist.dir}/${found[0]} differs from the repository's THIRD-PARTY-NOTICES.md: rebuild with  ${dist.builds}`);
  });

  it('ships the dictionary with its manifest, whose attribution and licence are the kaikki strings', (ctx) => {
    guard(ctx);
    const manifestPath = `${dist.dictDir}/sq/manifest.json`;
    expect(files, manifestPath).toContain(manifestPath);
    const m = JSON.parse(fs.readFileSync(path.join(abs(dist.dir), manifestPath), 'utf8'));
    expect(m.attribution).toBe(KAIKKI_ATTRIBUTION);
    expect(m.licence).toMatch(/CC BY-SA 4\.0/);
    expect(m.licence).toMatch(/kaikki\.org/);
    const shards = files.filter((f) => f.startsWith(`${dist.dictDir}/sq/`) && /\/s-[0-9a-f]{2}\.json$/.test(f));
    expect(shards.length).toBe(m.shards);
    expect(m.source.url).toMatch(/^https:\/\/kaikki\.org\//);
  });

  it('shows the attribution string in the built application code', (ctx) => {
    guard(ctx);
    const code = files.filter((f) => /\.js$/.test(f) && !f.startsWith(dist.dictDir));
    const holders = code.filter((f) => fs.readFileSync(path.join(abs(dist.dir), f), 'utf8').includes(KAIKKI_ATTRIBUTION));
    // the content script receives the attribution from the background worker at run time and holds no copy
    if (dist.id.startsWith('extension')) expect(holders.map((f) => f.replace(/^.*\//, '')).sort()).toContain('app.js');
    else expect(holders.length).toBeGreaterThan(0);
  });
});

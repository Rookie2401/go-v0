// @vitest-environment node
/**
 * GoReview, the installable iPhone build (`vite build -c packages/gopractice/vite.config.ts --mode review`): the manifest, the icons, the iOS tags, the
 * safe-area CSS and the service worker, proved on the real build output (built into a scratch folder with GOPRACTICE_OUT, no dictionaries) and on the
 * worker itself, run in a sandbox with a fake Cache Storage. The default and the extension builds must carry none of it.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const root = path.resolve(__dirname, '../..');
const pkg = path.join(root, 'packages', 'gopractice');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'goreview-pwa-'));
const outs = { review: path.join(scratch, 'review'), web: path.join(scratch, 'web'), extension: path.join(scratch, 'extension') };
const read = (dir: string, ...p: string[]): string => fs.readFileSync(path.join(dir, ...p), 'utf8');

function build(mode: 'review' | 'extension' | 'web'): void {
  const args = [vite, 'build', '-c', 'packages/gopractice/vite.config.ts', ...(mode === 'web' ? [] : ['--mode', mode])];
  execFileSync(process.execPath, args, { cwd: root, stdio: 'pipe', timeout: 120_000, env: { ...process.env, GOPRACTICE_DICT: '', GOPRACTICE_OUT: outs[mode] } });
}

beforeAll(() => { build('review'); build('web'); build('extension'); }, 300_000);
afterAll(() => { fs.rmSync(scratch, { recursive: true, force: true }); });

/** Width and height of a PNG from its IHDR chunk (and the signature check). */
function pngSize(file: string): { w: number; h: number } {
  const b = fs.readFileSync(file);
  expect(b.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe('the web manifest', () => {
  const manifest = (): Record<string, unknown> & { icons: Array<{ src: string; sizes: string; type: string; purpose?: string }> } => JSON.parse(read(outs.review, 'manifest.webmanifest'));

  it('names the app GoReview and opens it standalone, portrait, at the review home', () => {
    const m = manifest();
    expect(m).toMatchObject({ name: 'GoReview', short_name: 'GoReview', start_url: './index.html#/review', display: 'standalone', orientation: 'portrait', scope: './' });
  });

  it('takes its colours from the Western Canon tokens of styles.css (paper, light and dark)', () => {
    const css = read(pkg, 'styles.css');
    const light = /--paper:\s*(#[0-9a-f]{6})/i.exec(css)![1].toLowerCase();
    const dark = /prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{\s*--paper:\s*(#[0-9a-f]{6})/i.exec(css)![1].toLowerCase();
    const m = manifest();
    expect(m.theme_color).toBe(light);
    expect(m.background_color).toBe(light);
    // the dark paper belongs to the page's theme-color meta (a manifest has one colour)
    const html = read(outs.review, 'index.html');
    expect(html).toContain(`<meta name="theme-color" content="${light}" media="(prefers-color-scheme: light)">`);
    expect(html).toContain(`<meta name="theme-color" content="${dark}" media="(prefers-color-scheme: dark)">`);
  });

  it('lists PNG icons of 192, 512 and a maskable 512, every one of them present in the build', () => {
    const icons = manifest().icons;
    const by = (size: string, purpose: string): string | undefined => icons.find((i) => i.sizes === size && (i.purpose ?? 'any') === purpose)?.src;
    expect(by('192x192', 'any')).toBe('./icons/icon-192.png');
    expect(by('512x512', 'any')).toBe('./icons/icon-512.png');
    expect(by('512x512', 'maskable')).toBe('./icons/icon-maskable-512.png');
    expect(icons.every((i) => i.type === 'image/png')).toBe(true);
    for (const i of icons) expect(fs.existsSync(path.join(outs.review, i.src)), i.src).toBe(true);
  });
});

describe('the icons', () => {
  it('are committed under public/icons with the sizes iOS and the manifest ask for', () => {
    const dir = path.join(pkg, 'public', 'icons');
    expect(pngSize(path.join(dir, 'apple-touch-icon.png'))).toEqual({ w: 180, h: 180 });
    expect(pngSize(path.join(dir, 'icon-192.png'))).toEqual({ w: 192, h: 192 });
    expect(pngSize(path.join(dir, 'icon-512.png'))).toEqual({ w: 512, h: 512 });
    expect(pngSize(path.join(dir, 'icon-maskable-512.png'))).toEqual({ w: 512, h: 512 });
    expect(fs.existsSync(path.resolve(pkg, '../shared-brand/go-logo.png'))).toBe(true);
  });
});

describe('index.html of the review build', () => {
  const html = (): string => read(outs.review, 'index.html');

  it('is titled GoReview and carries the iOS tags, the manifest and the touch icon, with viewport-fit=cover', () => {
    const h = html();
    expect(h).toContain('<title>GoReview</title>');
    expect(h).toContain('viewport-fit=cover');
    expect(h).toContain('<meta name="apple-mobile-web-app-capable" content="yes">');
    expect(h).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">');
    expect(h).toContain('<meta name="apple-mobile-web-app-title" content="GoReview">');
    expect(h).toContain('<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">');
    expect(h).toContain('<link rel="manifest" href="./manifest.webmanifest">');
    expect(h).toContain('<meta name="goreview-edition" content="review">');
  });

  it('uses relative references only (any host or sub-path) and registers the worker from the page after load, over https or localhost only', () => {
    const h = html();
    expect(h).not.toMatch(/(?:src|href)="(?:https?:)?\/\//);
    expect(h).not.toMatch(/(?:src|href)="\/(?!\/)/);
    expect(h).toContain("serviceWorker.register('./sw.js')");
    expect(h).toContain("window.addEventListener('load'");
    expect(h).toMatch(/location\.protocol === 'https:'/);
    expect(h).toMatch(/host === 'localhost'/);
  });

  it('carries the launch screen (the Go mark over REVIEW) from the first paint, with its mark beside the icons and a fade in the stylesheet', () => {
    const h = html();
    expect(h).toContain('id="goreview-splash"');
    expect(h).toContain('class="splash-word">REVIEW<');
    expect(h).toContain("mask-image: url('./icons/go-logo.png')");
    expect(fs.existsSync(path.join(outs.review, 'icons', 'go-logo.png'))).toBe(true);
    const css = read(pkg, 'styles.css');
    expect(css).toContain('#goreview-splash.out { opacity: 0;');
    expect(css).toMatch(/#goreview-splash \{[^}]*flex-direction: column/);
  });

  it('starts at the review home: the manifest start_url and the router both land on #/review', () => {
    expect(JSON.parse(read(outs.review, 'manifest.webmanifest')).start_url).toMatch(/#\/review$/);
  });
});

describe('the stylesheet for a phone', () => {
  const css = read(pkg, 'styles.css');
  it('pads for the notch and the home indicator, and sizes the page by the dynamic viewport', () => {
    for (const side of ['top', 'bottom', 'left', 'right']) expect(css).toContain(`env(safe-area-inset-${side}`);
    expect(css).toMatch(/min-height:\s*100dvh/);
  });
  it('gives every control a target of at least 44 CSS px on a touch screen (2.75rem at the default size)', () => {
    const block = /@media \(pointer: coarse\)[^{]*\{([\s\S]*?)\n\}\n/.exec(css)![1];
    for (const sel of ['button', '.btn', '.toggle-link', '.linklike', '.vocab-history', '.crumb a', '.cog', '.icon-btn', 'button.grade', '.vocab-row']) expect(block, sel).toContain(sel);
    expect(block).toMatch(/min-height:\s*2\.75rem/);
    expect(block).toMatch(/\.cog, \.icon-btn \{ width: 2\.75rem; height: 2\.75rem; \}/);
  });
  it('keeps editable controls at iOS focus-zoom-safe sizes and reflows the 375/390px phone layouts', () => {
    const touch = /@media \(pointer: coarse\)[^{]*\{([\s\S]*?)\n\}\n/.exec(css)![1];
    for (const control of ['input[type="search"]', 'input[type="date"]', 'select']) expect(touch).toContain(control);
    expect(touch).toContain('select.language-kicker { font-size: 1rem; }');
    expect(touch).toMatch(/font-size:\s*1rem; min-height:\s*2\.75rem/);
    const phone = [...css.matchAll(/@media \(max-width: 760px\) \{([\s\S]*?)\n\}/g)].map((match) => match[1]).join('\n');
    expect(phone).toMatch(/select\.language-kicker \{[^}]*font-size:\s*1rem/);
    const narrow = /@media \(max-width: 420px\) \{([\s\S]*?)\n\}/.exec(css)![1];
    for (const width of [375, 390]) {
      expect(width).toBeLessThanOrEqual(420);
      expect(narrow).toContain('.grades { flex-wrap: wrap; }');
      expect(narrow).toContain('.sync { overflow-wrap: anywhere; }');
    }
    // Preserve user zoom: viewport configuration must not lock the scale to 1.
    const html = read(outs.review, 'index.html');
    expect(html).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\.0)?(?:[,\"]|\s|$)/i);
  });
});

describe('the other builds carry none of it', () => {
  it('the default web build has no manifest, no worker, no registration, and keeps its title', () => {
    const h = read(outs.web, 'index.html');
    expect(h).toContain('<title>GoPractice</title>');
    expect(h).not.toMatch(/serviceWorker|manifest|apple-mobile-web-app|goreview-edition/);
    expect(fs.existsSync(path.join(outs.web, 'sw.js'))).toBe(false);
    expect(fs.existsSync(path.join(outs.web, 'manifest.webmanifest'))).toBe(false);
  });

  it('the extension build never registers a service worker (an extension page must not)', () => {
    const h = read(outs.extension, 'index.html');
    expect(h).not.toMatch(/serviceWorker|manifest|apple-mobile-web-app|goreview-edition/);
    expect(fs.existsSync(path.join(outs.extension, 'sw.js'))).toBe(false);
    const code = fs.readdirSync(path.join(outs.extension, 'assets')).filter((f) => f.endsWith('.js')).map((f) => read(outs.extension, 'assets', f)).join('\n');
    expect(code).not.toMatch(/serviceWorker/);
  });

  it('the app bundle itself never touches navigator.serviceWorker (only the review page registers one)', () => {
    const code = fs.readdirSync(path.join(outs.review, 'assets')).filter((f) => f.endsWith('.js')).map((f) => read(outs.review, 'assets', f)).join('\n');
    expect(code).not.toMatch(/serviceWorker\.register/);
  });
});

// ───────────────────────────── the worker, read ─────────────────────────────

describe('sw.js (as built)', () => {
  const sw = (): string => read(outs.review, 'sw.js');

  it('is stamped: a build id, a versioned cache name, and a precache list that holds the shell and not the dictionary', () => {
    const code = sw();
    expect(code).not.toContain('__BUILD_ID__');
    expect(code).not.toContain('__PRECACHE__');
    expect(code).toMatch(/var BUILD_ID = '[0-9a-f]{12}';/);
    expect(code).toContain("var SHELL_CACHE = SHELL_PREFIX + BUILD_ID;");
    const list = JSON.parse(/var PRECACHE = (\[[\s\S]*?\]);/.exec(code)![1]) as string[];
    for (const must of ['./', './manifest.webmanifest', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png', './config.json']) expect(list, must).toContain(must);
    expect(list.some((p) => /^\.\/assets\/.+\.js$/.test(p))).toBe(true);
    expect(list.some((p) => /\.woff2$/.test(p))).toBe(true);
    expect(list.some((p) => p.startsWith('./dict/'))).toBe(false);
    expect(list).not.toContain('./sw.js');
  });

  it('cleans up the caches of earlier builds, and does not skip waiting by itself (only on the page’s message)', () => {
    const code = sw();
    expect(code).toMatch(/k\.indexOf\(SHELL_PREFIX\) === 0 && k !== SHELL_CACHE/);
    expect(code).toContain('caches.delete(k)');
    const install = /addEventListener\('install'[\s\S]*?\n\}\);/.exec(code)![0];
    expect(install.replace(/\/\/.*$/gm, '')).not.toContain('skipWaiting');
    expect(code).toMatch(/type === 'SKIP_WAITING'\) self\.skipWaiting\(\)/);
  });

  it('names every Repository path it will never cache, and refuses a request that carries credentials', () => {
    const code = sw();
    const re = /var SERVICE_PATH = (\/.*\/);/.exec(code)![1];
    for (const word of ['sync', 'vocabulary', 'candidates', 'me', 'sessions', 'events']) expect(re).toContain(word);
    expect(code).toContain("request.headers.get('Authorization')");
    // the only writes to a cache are the install precache, the config.json copy and a capped dictionary shard
    const puts = [...code.matchAll(/\.put\(/g)].length;
    expect(puts).toBe(2);
  });

  it('the build id is a hash of the shell files, so it changes whenever one does', () => {
    const code = sw();
    const id = /BUILD_ID = '([0-9a-f]{12})'/.exec(code)![1];
    const files = (JSON.parse(/var PRECACHE = (\[[\s\S]*?\]);/.exec(code)![1]) as string[]).filter((p) => p !== './').map((p) => p.slice(2)).sort();
    const hash = crypto.createHash('sha256');
    for (const f of files) { hash.update(f); hash.update(fs.readFileSync(path.join(outs.review, f))); }
    expect(hash.digest('hex').slice(0, 12)).toBe(id);
  });
});

// ───────────────────────────── the worker, run ─────────────────────────────

type Listener = (event: unknown) => void;

function sandbox(opts: { scope?: string; origin?: string; precache?: string[]; fetchImpl?: (req: { url: string }) => Promise<Response> } = {}) {
  const origin = opts.origin ?? 'https://app.test';
  const scope = opts.scope ?? `${origin}/goreview/`;
  const store = new Map<string, Map<string, Response>>();
  const keyOf = (r: unknown, ignoreSearch = false): string => { const u = typeof r === 'string' ? new URL(r, scope).href : (r as { url: string }).url; return ignoreSearch ? u.split('?')[0] : u; };
  const cacheFor = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name)!;
    return {
      async match(r: unknown, o?: { ignoreSearch?: boolean }) { const k = keyOf(r, o?.ignoreSearch); for (const [key, v] of m) if (keyOf(key, o?.ignoreSearch) === k) return v.clone(); return undefined; },
      async put(r: unknown, res: Response) { m.set(keyOf(r), res); },
      async addAll(rs: unknown[]) { for (const r of rs) m.set(keyOf(r), new Response('cached:' + keyOf(r))); },
      async keys() { return [...m.keys()]; },
      async delete(k: unknown) { return m.delete(typeof k === 'string' ? k : keyOf(k)); },
    };
  };
  const caches = {
    open: async (n: string) => cacheFor(n),
    keys: async () => [...store.keys()],
    delete: async (n: string) => store.delete(n),
  };
  const listeners: Record<string, Listener> = {};
  const fetched: string[] = [];
  const fetchFn = vi.fn(async (req: { url: string } | string) => { const u = typeof req === 'string' ? req : req.url; fetched.push(u); return opts.fetchImpl ? opts.fetchImpl({ url: u }) : new Response('net:' + u, { status: 200 }); });
  const self = {
    registration: { scope }, location: { origin },
    addEventListener: (t: string, f: Listener) => { listeners[t] = f; },
    skipWaiting: vi.fn(), clients: { claim: vi.fn(async () => undefined) },
  };
  const code = fs.readFileSync(path.join(outs.review, 'sw.js'), 'utf8').replace(/var PRECACHE = \[[\s\S]*?\];/, `var PRECACHE = ${JSON.stringify(opts.precache ?? ['./', './index.html', './assets/app.js', './config.json'])};`);
  // in a worker a relative Request URL resolves against the worker's own address; node has no such base, so the scope stands in
  class ScopedRequest { url: string; constructor(u: string, public init?: unknown) { this.url = new URL(u, scope).href; } }
  vm.runInNewContext(code, { self, caches, fetch: fetchFn, Request: ScopedRequest, Response, Headers, URL, Promise, Number, Math, JSON });
  const fire = async (type: string, event: Record<string, unknown>): Promise<unknown> => {
    let waiting: Promise<unknown> | undefined;
    let responded: Promise<unknown> | undefined;
    listeners[type]({ ...event, waitUntil: (p: Promise<unknown>) => { waiting = p; }, respondWith: (p: Promise<unknown>) => { responded = p; } });
    await waiting;
    return responded === undefined ? undefined : await responded;
  };
  const request = (url: string, extra: Record<string, unknown> = {}) => ({ url: new URL(url, scope).href, method: 'GET', mode: 'cors', headers: new Headers(), ...extra });
  /** Whether the worker answered a GET (true) or left it to the network (false). */
  const handles = async (url: string, extra: Record<string, unknown> = {}): Promise<boolean> => {
    let answered = false;
    const e = { request: request(url, extra), respondWith: (p: Promise<unknown>) => { answered = true; void p.catch(() => undefined); } };
    listeners.fetch(e);
    await new Promise((r) => setTimeout(r, 5));
    return answered;
  };
  return { store, caches, listeners, self, fetched, fetchFn, fire, request, handles, SHELL: () => [...store.keys()].filter((k) => k.startsWith('goreview-shell-')) };
}

describe('sw.js (run in a sandbox)', () => {
  it('installs the shell into a versioned cache without skipping waiting, and the new worker claims the page on activation', async () => {
    const s = sandbox();
    await s.fire('install', {});
    expect(s.SHELL()).toHaveLength(1);
    expect([...s.store.get(s.SHELL()[0])!.keys()]).toEqual(expect.arrayContaining(['https://app.test/goreview/', 'https://app.test/goreview/index.html', 'https://app.test/goreview/config.json']));
    expect(s.self.skipWaiting).not.toHaveBeenCalled();
    await s.fire('activate', {});
    expect(s.self.clients.claim).toHaveBeenCalled();
  });

  it('skips waiting only when the page sends SKIP_WAITING', async () => {
    const s = sandbox();
    s.listeners.message({ data: { type: 'something-else' } });
    expect(s.self.skipWaiting).not.toHaveBeenCalled();
    s.listeners.message({ data: { type: 'SKIP_WAITING' } });
    expect(s.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('activation deletes the shell caches of older builds and keeps the dictionary cache and unrelated caches', async () => {
    const s = sandbox();
    await s.fire('install', {});
    await s.caches.open('goreview-shell-oldbuild'); await s.caches.open('goreview-dict-v1'); await s.caches.open('something-else');
    await s.fire('activate', {});
    const names = await s.caches.keys();
    expect(names).not.toContain('goreview-shell-oldbuild');
    expect(names).toEqual(expect.arrayContaining(['goreview-dict-v1', 'something-else', ...s.SHELL()]));
  });

  it('NEVER caches or answers anything of the Repository service: another origin, the service paths under the scope, anything with a credential', async () => {
    const s = sandbox();
    await s.fire('install', {});
    const before = JSON.stringify([...s.store].map(([k, v]) => [k, [...v.keys()]]));
    for (const url of ['https://repo.example.org/sync/pull', 'https://repo.example.org/vocabulary?languageId=sq', 'https://repo.example.org/me', 'https://repo.example.org/sessions']) expect(await s.handles(url), url).toBe(false);
    for (const p of ['sync/push', 'sync/pull', 'sync/wait', 'sync/status', 'vocabulary?languageId=sq', 'candidates?enrolmentId=e1', 'me', 'sessions', 'events?afterSeq=1', 'knowledge', 'enrolments']) expect(await s.handles(`./${p}`), p).toBe(false);
    expect(await s.handles('./assets/app.js', { headers: new Headers({ Authorization: 'Bearer secret' }) })).toBe(false);
    expect(await s.handles('./index.html', { method: 'POST' })).toBe(false);
    expect(JSON.stringify([...s.store].map(([k, v]) => [k, [...v.keys()]]))).toBe(before);
    expect(s.fetchFn).not.toHaveBeenCalled();
  });

  it('does not mistake an app hosted at /me/ or /sync/ for the service', async () => {
    for (const mount of ['me', 'sync', 'events']) {
      const s = sandbox({ scope: `https://app.test/${mount}/` });
      await s.fire('install', {});
      expect(await s.handles('./assets/app.js'), mount).toBe(true);
    }
  });

  it('serves the shell from the cache first, and a navigation from the cached index even with no network', async () => {
    const s = sandbox({ fetchImpl: async () => { throw new TypeError('offline'); } });
    await s.fire('install', {});
    const asset = (await s.fire('fetch', { request: s.request('./assets/app.js') })) as Response;
    expect(await asset.text()).toBe('cached:https://app.test/goreview/assets/app.js');
    const nav = (await s.fire('fetch', { request: s.request('./index.html#/review', { mode: 'navigate' }) })) as Response;
    expect(await nav.text()).toBe('cached:https://app.test/goreview/index.html');
    expect(s.fetchFn).not.toHaveBeenCalled();
  });

  it('reads config.json from the network first, keeps that copy, and falls back to it when the network fails', async () => {
    let down = false;
    const s = sandbox({ fetchImpl: async () => { if (down) throw new TypeError('offline'); return new Response('{"serviceUrl":"https://new.example"}', { status: 200 }); } });
    await s.fire('install', {});
    const online = (await s.fire('fetch', { request: s.request('./config.json') })) as Response;
    expect(await online.text()).toBe('{"serviceUrl":"https://new.example"}');
    await new Promise((r) => setTimeout(r, 5));
    down = true;
    const offline = (await s.fire('fetch', { request: s.request('./config.json') })) as Response;
    expect(await offline.text()).toBe('{"serviceUrl":"https://new.example"}');
  });

  it('caches dictionary shards on demand, keeps at most 400, and does not keep one over 3 MB', async () => {
    const s = sandbox({ fetchImpl: async (r) => new Response('shard ' + r.url, { status: 200, headers: r.url.includes('big') ? { 'content-length': String(4 * 1024 * 1024) } : {} }) });
    await s.fire('install', {});
    const first = (await s.fire('fetch', { request: s.request('./dict/sq/a.json') })) as Response;
    expect(await first.text()).toBe('shard https://app.test/goreview/dict/sq/a.json');
    await new Promise((r) => setTimeout(r, 5));
    const dict = s.store.get('goreview-dict-v1')!;
    expect([...dict.keys()]).toEqual(['https://app.test/goreview/dict/sq/a.json']);
    // second read: from the cache, no second network call
    s.fetchFn.mockClear();
    await s.fire('fetch', { request: s.request('./dict/sq/a.json') });
    expect(s.fetchFn).not.toHaveBeenCalled();
    // too big: served, not kept
    await s.fire('fetch', { request: s.request('./dict/sq/big.json') });
    await new Promise((r) => setTimeout(r, 5));
    expect(dict.has('https://app.test/goreview/dict/sq/big.json')).toBe(false);
    // the cap
    for (let i = 0; i < 420; i++) { await s.fire('fetch', { request: s.request(`./dict/de/s${i}.json`) }); await new Promise((r) => setTimeout(r, 0)); }
    await new Promise((r) => setTimeout(r, 20));
    expect(dict.size).toBeLessThanOrEqual(401);
    expect(dict.size).toBeGreaterThan(300);
    // none of the dictionary is in the shell cache
    expect([...s.store.get(s.SHELL()[0])!.keys()].some((k) => k.includes('/dict/'))).toBe(false);
  }, 30_000);
});

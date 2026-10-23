/**
 * The installable standalone edition of Biblia (packages/biblia/vite.config.ts --mode standalone, docs/ecosystem/BIBLIA-STANDALONE.md):
 * built into a scratch folder with BIBLIA_OUT, against the public https address given in BIBLIA_SERVICE_URL. The copied config.json carries
 * that address, index.html carries the edition marker and the manifest link, the manifest has the installable fields, the worker's BUILD_ID is
 * a content hash and its precache list is the shell only (never data/ or lexicon/). A non-https address, one with credentials and one with a
 * query refuse to build; the default build stays free of every standalone file.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'biblia-standalone-'));
afterAll(() => { fs.rmSync(scratch, { recursive: true, force: true }); });

function build(out: string, mode: 'standalone' | undefined, serviceUrl?: string): void {
  execFileSync(process.execPath, [vite, 'build', '-c', 'packages/biblia/vite.config.ts', ...(mode ? ['--mode', mode] : [])], {
    cwd: root, stdio: 'pipe', timeout: 120_000,
    env: { ...process.env, BIBLIA_OUT: out, BIBLIA_SERVICE_URL: serviceUrl ?? '' },
  });
}

const PUBLIC = 'https://repo.golearn-global-languages.com';
const read = (out: string, file: string): string => fs.readFileSync(path.join(out, file), 'utf8');

describe('Biblia standalone build', () => {
  const out = path.join(scratch, 'standalone');

  it('builds, and copies config.json with the public address (trailing slash dropped); the source config keeps the development address', () => {
    build(out, 'standalone', PUBLIC + '/');
    const copied = JSON.parse(read(out, 'config.json')) as { serviceUrl: string; assetBaseUrl: string };
    expect(copied).toEqual({ serviceUrl: PUBLIC, assetBaseUrl: './' });
    const source = JSON.parse(fs.readFileSync(path.join(root, 'packages', 'biblia', 'config.json'), 'utf8')) as { serviceUrl: string; assetBaseUrl: string };
    expect(source).toEqual({ serviceUrl: 'http://127.0.0.1:8790', assetBaseUrl: './' });
  }, 150_000);

  it('index.html carries the edition marker, the manifest link, the iOS tags and the inline registration; the source index.html is untouched', () => {
    const html = read(out, 'index.html');
    expect(html).toContain('<meta name="biblia-edition" content="standalone">');
    expect(html).toContain('<link rel="manifest" href="./manifest.webmanifest">');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes">');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Biblia">');
    expect(html).toMatch(/<meta name="apple-mobile-web-app-status-bar-style" content="[a-z-]+">/);
    expect(html).toContain('<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain("navigator.serviceWorker.register('./sw.js')");
    const source = fs.readFileSync(path.join(root, 'packages', 'biblia', 'index.html'), 'utf8');
    expect(source).not.toContain('biblia-edition');
    expect(source).not.toContain('manifest');
    expect(fs.existsSync(path.join(out, 'register.js'))).toBe(false); // inlined, not shipped
  });

  it('the manifest is installable and every icon it names is in the build', () => {
    const m = JSON.parse(read(out, 'manifest.webmanifest')) as { name: string; short_name: string; display: string; start_url: string; scope: string; icons: { src: string; sizes: string; purpose: string }[] };
    expect(m.name).toBe('Biblia');
    expect(m.short_name).toBe('Biblia');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('./index.html');
    expect(m.scope).toBe('./');
    expect(m.icons.some((i) => i.sizes === '192x192' && i.purpose === 'any')).toBe(true);
    expect(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
    expect(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
    for (const i of m.icons) expect(fs.existsSync(path.join(out, i.src)), i.src).toBe(true);
    expect(fs.existsSync(path.join(out, 'icons', 'apple-touch-icon.png'))).toBe(true);
  });

  it('sw.js has a content-hash BUILD_ID and a shell-only precache list', () => {
    const sw = read(out, 'sw.js');
    expect(sw).not.toMatch(/__[A-Z_]+__/); // every token replaced
    const buildId = /var BUILD_ID = '([0-9a-f]{12})';/.exec(sw)?.[1];
    expect(buildId).toBeDefined();
    expect(/var DATA_ID = '([0-9a-f]{12})';/.test(sw)).toBe(true);
    const list = JSON.parse(/var PRECACHE = (\[[\s\S]*?\n\]);/.exec(sw)?.[1] ?? 'null') as string[];
    expect(list).toContain('./');
    for (const f of ['./index.html', './config.json', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png']) expect(list, f).toContain(f);
    expect(list.some((f) => /^\.\/assets\/.+\.js$/.test(f))).toBe(true);
    expect(list.some((f) => /^\.\/assets\/.+\.css$/.test(f))).toBe(true);
    expect(list.filter((f) => f.startsWith('./data/') || f.startsWith('./lexicon/'))).toEqual([]);
    expect(list).not.toContain('./sw.js');
    expect(list.filter((f) => f !== './').every((f) => fs.existsSync(path.join(out, f)))).toBe(true);
    // the texts really are in the build (so the exclusion above is meaningful) and are far larger than the shell
    expect(fs.existsSync(path.join(out, 'data'))).toBe(true);
  });

  it('a second build of the same sources has the same BUILD_ID (a content hash, not a timestamp)', () => {
    const again = path.join(scratch, 'again');
    build(again, 'standalone', PUBLIC);
    const id = (dir: string): string | undefined => /var BUILD_ID = '([0-9a-f]{12})';/.exec(read(dir, 'sw.js'))?.[1];
    expect(id(again)).toBe(id(out));
  }, 150_000);

  it('refuses a plain-http public address, credentials, a query, a fragment and a non-URL', () => {
    for (const bad of ['http://example.com', 'https://user:pw@repo.golearn-global-languages.com', 'https://repo.golearn-global-languages.com/?x=1', 'https://repo.golearn-global-languages.com/#x', 'not a url']) {
      expect(() => build(path.join(scratch, 'bad'), 'standalone', bad), bad).toThrow();
    }
    expect(fs.existsSync(path.join(scratch, 'bad', 'index.html'))).toBe(false);
  }, 200_000);

  it('accepts http on localhost and 127.0.0.1', () => {
    const local = path.join(scratch, 'local');
    build(local, 'standalone', 'http://127.0.0.1:8790/');
    expect((JSON.parse(read(local, 'config.json')) as { serviceUrl: string }).serviceUrl).toBe('http://127.0.0.1:8790');
  }, 150_000);

  it('the default build carries none of the standalone files', () => {
    const plain = path.join(scratch, 'plain');
    build(plain, undefined);
    for (const f of ['sw.js', 'register.js', 'manifest.webmanifest', 'icons', 'config.json']) expect(fs.existsSync(path.join(plain, f)), f).toBe(false);
    const html = read(plain, 'index.html');
    expect(html).not.toContain('biblia-edition');
    expect(html).not.toContain('serviceWorker');
    expect(fs.existsSync(path.join(plain, 'assets'))).toBe(true);
  }, 150_000);
});

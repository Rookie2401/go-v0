// @vitest-environment node
/**
 * Checks of the BUILT application (run the two builds first; each block is skipped when its output is absent):
 *   npx vite build -c packages/golearn-extension/app/vite.config.ts --mode options   -> dist/app/
 *   npx vite build -c packages/golearn-extension/app/vite.config.ts --mode web       -> dist-web/
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ext = path.resolve(__dirname, '../../packages/golearn-extension');
const read = (...p: string[]): string => fs.readFileSync(path.join(ext, ...p), 'utf8');
const has = (...p: string[]): boolean => fs.existsSync(path.join(ext, ...p));

describe.skipIf(!has('dist/app/app.js'))('the options-page build (dist/app)', () => {
  const html = (): string => read('dist/app/index.html');
  it('is one classic script, a stylesheet, the page and config.json, with relative references only', () => {
    expect(html()).toContain('<script src="./app.js" defer></script>');
    expect(html()).not.toMatch(/type="module"/);
    expect(html()).toContain('href="./styles.css"');
    expect(html()).not.toMatch(/(?:src|href)="(?:https?:)?\/\//);
    for (const f of ['app.js', 'styles.css', 'config.json', 'index.html']) expect(has('dist/app', f), f).toBe(true);
    expect(JSON.parse(read('dist/app/config.json'))).toMatchObject({ serviceUrl: expect.stringMatching(/^https?:\/\//) });
  });

  it('the script has no module syntax and no eval, so an extension page with a strict CSP can run it', () => {
    const code = read('dist/app/app.js');
    expect(code).not.toMatch(/^\s*(import|export)\s/m);
    expect(code).not.toMatch(/\beval\s*\(|new Function\s*\(/);
    // the one dynamic import is the analyser loader's: German, Hindi, Thai and Spanish are the extension's own analysers/<id>.js, read on demand
    // (a web accessible resource), not linked into this script
    expect(code.match(/\bimport\s*\(/g) ?? []).toHaveLength(1);
    expect(code).toContain('analysers/');
    expect(code).not.toContain('adapter-de@');
    expect(code.length).toBeLessThan(650 * 1024);
  });

  it('carries the dictionary the installer fetches, and nothing of a planned language', () => {
    expect(has('dist/app/dict/sq/manifest.json')).toBe(true);
    expect(has('dist/app/dict/es')).toBe(false);
  });
});

describe.skipIf(!has('dist-web/index.html'))('the web build (dist-web)', () => {
  it('is a static site with relative URLs that works from any sub-path', () => {
    const html = read('dist-web/index.html');
    expect(html).toMatch(/src="\.\/assets\/[^"]+\.js"/);
    expect(html).toMatch(/href="\.\/assets\/[^"]+\.css"/);
    expect(html).not.toMatch(/(?:src|href)="\/(?!\/)/);
    expect(has('dist-web/config.json')).toBe(true);
    expect(has('dist-web/dict/sq/manifest.json')).toBe(true);
  });

  it('has no eval, no beacon and no socket; its only default service address is the local development one', () => {
    const assets = fs.readdirSync(path.join(ext, 'dist-web/assets')).filter((f) => f.endsWith('.js'));
    expect(assets.length).toBeGreaterThan(0);
    const all = assets.map((f) => read('dist-web/assets', f)).join('\n');
    expect(all).not.toMatch(/\beval\s*\(|new Function\s*\(/);
    expect(all).not.toMatch(/sendBeacon|WebSocket|XMLHttpRequest/);
    expect(all).toContain('http://127.0.0.1:8790');
  });
});

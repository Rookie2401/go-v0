// @vitest-environment node
/**
 * `vite build -c packages/gopractice/vite.config.ts --mode extension` writes GoPractice as a page of the GoLearn extension, to
 * packages/golearn-extension/dist/practice/: relative asset paths (the page is served from chrome-extension://<id>/practice/index.html),
 * the dictionary and fonts as for the web build, the extension binding in the script, nothing else of the extension's dist touched.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'packages', 'golearn-extension', 'dist', 'practice');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const read = (...p: string[]): string => fs.readFileSync(path.join(out, ...p), 'utf8');
const bundle = (): string => fs.readdirSync(path.join(out, 'assets')).filter((f) => f.endsWith('.js')).map((f) => read('assets', f)).join('\n');

describe('the extension build of GoPractice', () => {
  let sibling = false;

  beforeAll(() => {
    // a file of the extension's own dist that this build must leave alone
    const marker = path.join(root, 'packages', 'golearn-extension', 'dist', '.gopractice-build-test');
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, 'kept');
    execFileSync(process.execPath, [vite, 'build', '-c', 'packages/gopractice/vite.config.ts', '--mode', 'extension'], { cwd: root, stdio: 'pipe', timeout: 120_000 });
    sibling = fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === 'kept';
    fs.rmSync(marker, { force: true });
  }, 150_000);

  it('writes the page, its script and stylesheet, config.json and the licence files to dist/practice, with relative references only', () => {
    const html = read('index.html');
    expect(html).toMatch(/<script type="module" crossorigin src="\.\/assets\/[^"]+\.js"><\/script>/);
    expect(html).toMatch(/href="\.\/assets\/[^"]+\.css"/);
    expect(html).not.toMatch(/(?:src|href)="(?:https?:)?\/\//);
    expect(html).not.toMatch(/(?:src|href)="\/(?!\/)/);
    expect(html).toContain('<title>GoPractice</title>');
    for (const f of ['config.json', 'THIRD-PARTY-NOTICES.md', 'EB-Garamond-OFL.txt']) expect(fs.existsSync(path.join(out, f)), f).toBe(true);
    expect(JSON.parse(read('config.json'))).toMatchObject({ serviceUrl: expect.stringMatching(/^https?:\/\//) });
  });

  it('carries the dictionary the exercises read glosses from, and the fonts beside the stylesheet', () => {
    expect(fs.existsSync(path.join(out, 'dict', 'sq', 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(out, 'dict', 'sq', 'frequency.json'))).toBe(false); // quarantined sidecar, never shipped
    expect(fs.readdirSync(path.join(out, 'assets', 'fonts')).some((f) => f.endsWith('.woff2'))).toBe(true);
  });

  it('is the app with its extension binding: it reaches the on-device Repository through the worker and needs no eval', () => {
    const code = bundle();
    expect(code).toContain('golearn:local-repo');
    expect(code).toContain('chrome-extension:');
    expect(code).not.toMatch(/\beval\s*\(|new Function\s*\(/);
    expect(code).not.toMatch(/sendBeacon|WebSocket|XMLHttpRequest/);
  });

  it('leaves the rest of the extension’s dist alone (only dist/practice is emptied)', () => {
    expect(sibling).toBe(true);
  });
});

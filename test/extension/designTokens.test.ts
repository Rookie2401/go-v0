// @vitest-environment node
/**
 * GoLearn's two own surfaces, the action popup and the setup application, are one design language (docs/golearn/DESIGN-SYSTEM.md,
 * 2026-11-11): the popup's <style> repeats the colour tokens it uses, and they must be the setup application's values, light and dark.
 * The word card has its own stylesheet inside its shadow root and is not part of this.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string => fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');
const app = read('packages/golearn-extension/app/styles.css');
const popup = /<style>([\s\S]*?)<\/style>/.exec(read('packages/golearn-extension/action/popup.html'))![1];

/** The custom properties of the first `:root { … }` (light) and of the `:root` inside the first dark media block. */
function tokens(css: string): { light: Map<string, string>; dark: Map<string, string> } {
  const decls = (block: string): Map<string, string> => new Map([...block.matchAll(/(--[a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const light = /:root\s*\{([\s\S]*?)\n\s*\}/.exec(css)![1];
  const dark = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([\s\S]*?)\}\s*\}/.exec(css)![1];
  return { light: decls(light), dark: decls(dark) };
}

describe('one design language: the popup and the setup application', () => {
  const a = tokens(app);
  const p = tokens(popup);
  const colours = [...p.light.keys()].filter((k) => k !== '--serif');

  it('the popup declares colour tokens, each of them one the setup application has', () => {
    expect(colours.length).toBeGreaterThanOrEqual(10);
    for (const k of colours) expect(a.light.has(k), k).toBe(true);
  });

  it('every colour token of the popup has the setup application\'s value on paper', () => {
    for (const k of colours) expect(p.light.get(k), k).toBe(a.light.get(k));
  });

  it('and in the dark theme, except the warning colour, which the popup keeps lighter for its small text', () => {
    for (const k of [...p.dark.keys()].filter((x) => x !== '--bad')) expect(p.dark.get(k), k).toBe(a.dark.get(k));
    expect(p.dark.get('--bad')).toBe('#ff9a9a');
  });

  it('both set the same typeface and the nearly square corner', () => {
    expect(p.light.get('--serif')).toBe(a.light.get('--serif'));
    expect(a.light.get('--radius')).toBe('2px');
    expect(popup).toMatch(/select \{[^}]*border-radius: 2px/);
  });

  it('the setup application has one filled-button rule, a hidden rule that always wins, and no boxed sections', () => {
    expect(app).toMatch(/\[hidden\] \{ display: none !important; \}/);
    // a section is a label on a hairline: no background, no border box
    expect(app).toMatch(/\.part, \.card, section\.sub \{[^}]*border: 0; background: none;/);
    expect(app.match(/\.btn\.primary, button\.primary \{/g)).toHaveLength(1);
  });
});

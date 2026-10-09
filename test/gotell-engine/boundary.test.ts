/**
 * The engine's boundary: packages/gotell/src/engine and /salvage import their own files, the GoTell types, and only the repository
 * contract, the language packs and the sync client — never the legacy engine (src/gotell), the core (src/core), an adapter
 * (src/adapters) directly, GoReview, the shell, or a store; and they use no network, storage or clock of their own.
 * Comments may name the legacy files (they say what was adapted); code may not import them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../packages/gotell/src');
const DIRS = ['engine', 'salvage'];
const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  return d.isDirectory() ? files(p) : /\.(ts|tsx)$/.test(d.name) ? [p] : [];
});
const code = (f: string): string => fs.readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
const importsOf = (f: string): string[] => [...code(f).matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
const all = DIRS.flatMap((d) => files(path.join(ROOT, d)));

describe('engine and salvage imports', () => {
  it('there are files to check', () => {
    expect(all.length).toBeGreaterThanOrEqual(10);
  });

  it('import only their own package’s files, the contract, the language packs and the sync client', () => {
    for (const f of all) {
      for (const i of importsOf(f)) {
        if (i.startsWith('node:')) continue;
        const resolved = path.resolve(path.dirname(f), i);
        const rel = path.relative(path.resolve(ROOT, '..', '..'), resolved).replace(/\\/g, '/'); // relative to packages/
        const ok = rel.startsWith('gotell/') || /^(repository-contract|language-packs|repository-sync)\/src$/.test(rel);
        expect(ok, `${path.relative(ROOT, f)} imports ${i} (→ ${rel})`).toBe(true);
      }
    }
  });

  it('never import the legacy engine, the core, an adapter, GoReview, the shell or a store', () => {
    for (const f of all) {
      for (const i of importsOf(f)) {
        expect(/\/src\/(gotell|core|adapters|ui|golearn|goread|app|course|ladder|stage0|library|dict)(\/|$)|goreview|gopractice|golisten|golearn|repository-(store|engine|service)/.test(i), `${path.relative(ROOT, f)} imports ${i}`).toBe(false);
      }
    }
  });

  it('use no network, storage, timer-free clock or DOM of their own', () => {
    for (const f of all) {
      const c = code(f);
      expect(/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|document\.|window\.|navigator\./.test(c), path.relative(ROOT, f)).toBe(false);
      expect(/\bnew Date\(\)|Date\.now\(\)|Math\.random\(\)/.test(c), `${path.relative(ROOT, f)} reads the clock or random`).toBe(false);
    }
  });

  it('say where each salvaged file came from', () => {
    for (const f of files(path.join(ROOT, 'salvage')).filter((f) => !/(index|types)\.ts$/.test(f))) {
      expect(fs.readFileSync(f, 'utf8'), path.basename(f)).toMatch(/adapted from src\/gotell\/[\w/.]+ \(2026-10-09\)/);
    }
  });
});

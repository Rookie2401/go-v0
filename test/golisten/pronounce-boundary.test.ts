import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as golisten from '../../packages/golisten/src';

const SRC = path.resolve(__dirname, '../../packages/golisten/src');
const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : /\.ts$/.test(d.name) ? [path.join(dir, d.name)] : []));
const sources = files(SRC).map((f) => ({ f: path.relative(SRC, f), text: fs.readFileSync(f, 'utf8') }));
const imports = (text: string): string[] => [...text.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);

describe('packages/golisten boundary', () => {
  it('imports only itself and the Repository contract; no node: modules in the shipped code', () => {
    expect(sources.length).toBeGreaterThan(8);
    for (const { f, text } of sources) {
      for (const i of imports(text)) {
        const inside = i.startsWith('./') || (i.startsWith('../') && !i.includes('packages/') && !/\.\.\/\.\.\//.test(i));
        const contract = /^(\.\.\/)+repository-contract\/src$/.test(i);
        expect(inside || contract, `${f} imports ${i}`).toBe(true);
      }
    }
  });

  it('never reaches the extension, the service, the store, the engine, an application or the retired modules', () => {
    const forbidden = /golearn-extension|golearn-app|goreview|gotell|repository-service|repository-store|repository-engine|repository-sync|repository-linguistics|language-packs|controlled-reader|\/src\/(ui|golearn|gotell|goread|app|course|ladder|stage0|library|golisten|core)\b/;
    for (const { f, text } of sources) for (const i of imports(text)) expect(forbidden.test(i), `${f} imports ${i}`).toBe(false);
  });

  it('has no console output, no storage, no timers beyond the voice wait, and no embedded key or credential header', () => {
    for (const { f, text } of sources) {
      expect(/\bconsole\./.test(text), `${f} uses console`).toBe(false);
      expect(/localStorage|sessionStorage|indexedDB/.test(text), `${f} uses browser storage`).toBe(false);
      expect(/Ocp-Apim|subscription-key|authorization/i.test(text.replace(/^\s*\*.*$/gm, '').replace(/\/\/.*$/gm, '')), `${f} mentions a credential header`).toBe(false);
    }
  });

  it('exports the public surface GoLearn and GoReview use', () => {
    for (const name of ['createGoListen', 'isIndependentEvidence', 'albanianRegistry', 'demoGermanRegistry', 'defaultRegistries', 'createAssessmentSource', 'assessmentEvidence', 'listeningAssessedPayload', 'createPlayback']) {
      expect(typeof (golisten as Record<string, unknown>)[name], name).toBe('function');
    }
  });

  it('is not the retired src/golisten: a different module with a different surface', () => {
    expect((golisten as Record<string, unknown>).FixtureTtsProvider).toBeUndefined();
  });
});

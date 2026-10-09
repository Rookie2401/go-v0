/**
 * Package-boundary rules of the Go ecosystem (docs/ecosystem/GO-REPOSITORY-DESIGN.md §7, packages/README.md):
 * applications import only the Repository contract; GoReview and GoTell never import each other; nothing under
 * packages/ reaches into the retired course/ladder/stage0/library modules; the contract imports nothing at all.
 * The rules are checked against the files as they exist, so an empty package passes and a wrong import fails.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CONTRACT_VERSION, EVENT_KINDS, familyOf, validateEvent } from '../../packages/repository-contract/src';

const ROOT = path.resolve(__dirname, '../../packages');
const list = (dir: string): string[] => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === 'node_modules' || d.name === 'dist' ? [] : list(p);
    return /\.(ts|tsx|mts)$/.test(d.name) ? [p] : [];
  });
};
const imports = (file: string): string[] =>
  [...fs.readFileSync(file, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
const pkgOf = (file: string): string => path.relative(ROOT, file).split(path.sep)[0];

const RETIRED = ['src/course', 'src/ladder', 'src/stage0', 'src/library', '/course/', '/ladder/', '/stage0/', '/library/'];

describe('package boundaries', () => {
  const files = list(ROOT);

  it('the contract imports nothing', () => {
    for (const f of files.filter((f) => pkgOf(f) === 'repository-contract')) {
      expect(imports(f).filter((i) => !i.startsWith('node:')), f).toEqual([]);
    }
  });

  it('application packages import only the contract, never each other or the engine/store', () => {
    const apps = new Set(['golearn-app', 'golearn-extension', 'goreview', 'gotell']);
    for (const f of files.filter((f) => apps.has(pkgOf(f)))) {
      for (const i of imports(f)) {
        if (i.startsWith('.') && !i.includes('..')) continue; // inside its own package
        const target = i.includes('packages/') ? i.split('packages/')[1].split('/')[0] : i.startsWith('@go/') ? i.slice(4).split('/')[0] : undefined;
        if (target) expect(target, `${f} imports ${i}`).toBe('repository-contract');
      }
    }
  });

  it('nothing under packages/ imports the retired course, ladder, stage0 or library modules', () => {
    for (const f of files) for (const i of imports(f)) expect(RETIRED.some((r) => i.includes(r)), `${f} imports ${i}`).toBe(false);
  });
});

describe('the event contract', () => {
  const good = {
    id: 'e1', v: CONTRACT_VERSION, learnerId: 'L', enrolmentId: 'E', languageId: 'sq', at: '2026-10-08T10:00:00.000Z',
    producer: { app: 'golearn-ext', version: '0.0.1', deviceId: 'd1' }, kind: 'SelectionLookedUp',
    subject: { itemIds: ['lemma:sq:shtëpi:NOUN'], sentenceKey: 'ab12', sourceRef: { kind: 'demo' } }, payload: { surface: 'shtëpinë' },
  };
  it('accepts a well-formed event and knows its family', () => {
    expect(validateEvent(good)).toEqual([]);
    expect(familyOf('SelectionLookedUp')).toBe('reading-context');
    expect(familyOf('CardReviewed')).toBe('review');
    expect(Object.values(EVENT_KINDS).flat().length).toBeGreaterThan(10);
  });
  it('refuses an unknown kind, a bad producer, a missing timestamp and a subject that carries text', () => {
    expect(validateEvent({ ...good, kind: 'PageRead' }).map((i) => i.path)).toContain('kind');
    expect(validateEvent({ ...good, producer: { app: 'kindle', version: '1', deviceId: 'd' } }).map((i) => i.path)).toContain('producer');
    expect(validateEvent({ ...good, at: 'yesterday' }).map((i) => i.path)).toContain('at');
    expect(validateEvent({ ...good, subject: { ...good.subject, sentenceText: 'Unë jam këtu.' } }).map((i) => i.message)).toContain('a subject identifies a context; it never carries its text');
  });
});

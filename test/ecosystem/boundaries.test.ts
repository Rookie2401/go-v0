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
// the GoReview app (packages/goreview/app, the shell that was packages/gopractice until 2026-10-28) is its own package, goreview-app, apart from the engine in packages/goreview/src
const pkgOf = (file: string): string => { const parts = path.relative(ROOT, file).split(path.sep); return parts[0] === 'goreview' && parts[1] === 'app' ? 'goreview-app' : parts[0]; };

const RETIRED = ['src/course', 'src/ladder', 'src/stage0', 'src/library', '/course/', '/ladder/', '/stage0/', '/library/'];

describe('package boundaries', () => {
  const files = list(ROOT);

  it('the contract imports nothing outside itself', () => {
    for (const f of files.filter((f) => pkgOf(f) === 'repository-contract')) {
      expect(imports(f).filter((i) => !i.startsWith('node:') && !/^\.\/[\w-]+$/.test(i)), f).toEqual([]);
    }
  });

  it('repository packages never import application packages, the UI, or each other except through the contract and their declared dependencies', () => {
    const allowed: Record<string, string[]> = {
      'repository-linguistics': ['repository-contract'],
      'repository-store': ['repository-contract'],
      'repository-engine': ['repository-contract'],
      'repository-sync': ['repository-contract'],
      'repository-service': ['repository-contract', 'repository-store', 'repository-engine', 'repository-linguistics', 'repository-sync'],
      // the device-local Repository assembles the service's own parts in one process
      'repository-local': ['repository-contract', 'repository-store', 'repository-engine', 'repository-linguistics', 'repository-sync', 'repository-service'],
    };
    for (const f of files.filter((f) => pkgOf(f) in allowed)) {
      for (const i of imports(f)) {
        if (i.startsWith('.') && !i.includes('..')) continue;
        if (i.startsWith('node:')) continue;
        const target = i.includes('packages/') ? i.split('packages/')[1].split('/')[0] : i.startsWith('@go/') ? i.slice(4).split('/')[0] : undefined;
        if (target) expect(allowed[pkgOf(f)], `${f} imports ${i}`).toContain(target);
        expect(/\/src\/(ui|golearn|gotell|goread|app)\//.test(i), `${f} imports ${i}`).toBe(false);
      }
    }
  });

  it('application packages import only the contract and the shared subsystems, never each other or the engine/store', () => {
    const apps = new Set(['golearn-app', 'golearn-extension', 'goreview', 'gotell', 'goreview-app']);
    // the GoReview shell hosts both workspaces; the workspaces never import each other
    const hosts: Record<string, string[]> = { 'goreview-app': ['goreview', 'gotell'] };
    // shared subsystems an application may use: the contract, GoListen, the language packs, the device-side sync
    // client and the typed API client of the service (never the service handler, store or engine)
    // golearn-share (the mobile share contract) is a shared library that imports only the contract
    // repository-local is the device-local Repository (no account needed): a shared library an application opens, or reaches by message
    const shared = new Set(['repository-contract', 'golisten', 'language-packs', 'repository-sync', 'golearn-share', 'repository-local']);
    for (const f of files.filter((f) => apps.has(pkgOf(f)))) {
      for (const i of imports(f)) {
        if (i.startsWith('.') && !i.includes('..')) continue; // inside its own package
        if (i.startsWith('..') && !i.includes('packages/') && !i.includes('/src/')) continue; // inside its own package (deeper relative)
        const target = i.includes('packages/') ? i.split('packages/')[1].split('/')[0] : i.startsWith('@go/') ? i.slice(4).split('/')[0] : undefined;
        if (!target) continue;
        if (target === 'repository-service') { expect(/repository-service\/src\/api$/.test(i), `${f} may import only the api client of the service: ${i}`).toBe(true); continue; }
        if (target === pkgOf(f)) continue;
        if (hosts[pkgOf(f)]?.includes(target)) continue;
        expect(shared.has(target), `${f} imports ${i}`).toBe(true);
      }
    }
  });

  it('the mobile share contract imports only the Repository contract and its own files: no application, no service client, no pack, no store', () => {
    const own = files.filter((f) => pkgOf(f) === 'golearn-share');
    expect(own.length).toBeGreaterThan(3);
    for (const f of own) {
      for (const i of imports(f)) {
        if (/^\.\/[\w-]+$/.test(i)) continue;
        expect(/^\.\.\/\.\.\/repository-contract\/src$/.test(i), `${f} imports ${i}`).toBe(true);
      }
    }
  });

  it('GoListen and the language packs never import an application, the service, the store or the engine', () => {
    const forbidden = ['golearn-extension', 'golearn-app', 'goreview', 'gotell', 'repository-service', 'repository-store', 'repository-engine'];
    for (const f of files.filter((f) => pkgOf(f) === 'golisten' || pkgOf(f) === 'language-packs')) {
      for (const i of imports(f)) {
        const target = i.includes('packages/') ? i.split('packages/')[1].split('/')[0] : undefined;
        if (target) expect(forbidden.includes(target), `${f} imports ${i}`).toBe(false);
        expect(/\/src\/(ui|golearn|gotell|goread|app|course|ladder|stage0|library)\//.test(i), `${f} imports ${i}`).toBe(false);
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
    subject: { itemIds: ['lemma:sq:shtëpi:NOUN'], sentenceKey: 'ab12', sourceRef: { kind: 'demo' } },
    payload: { surface: 'shtëpinë', tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'demo', helpShown: ['lemma'] },
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

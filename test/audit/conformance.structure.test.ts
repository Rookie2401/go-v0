/**
 * Architecture conformance, rule (c) and the structural half of §13 (docs/ecosystem/audit/ARCHITECTURE-CONFORMANCE.md):
 * exactly two application entry groups exist (GoLearn incl. its extension and setup app; GoPractice), the Repository
 * service is shared infrastructure, and the shared packages reach no application, service, store or engine, transitively.
 *
 * test/ecosystem/boundaries.test.ts checks the literal import strings of each file; this file checks the transitive
 * closure from the real entries and the exact package set each entry may reach. It does not repeat those checks.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ENTRIES, GOTELL_ENTRY, ROOT, listFiles, packageOf, reach, readText, unionOf } from './conformance.support';

const PACKAGES = fs.readdirSync(path.join(ROOT, 'packages'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const pkgSet = (files: Iterable<string>): string[] => [...new Set([...files].filter((f) => f.startsWith('packages/')).map(packageOf))].sort();

describe('(c) exactly two application entry groups', () => {
  it('the product entries fall into golearn-extension and gopractice, plus the shared service', () => {
    const groups = new Set(ENTRIES.map((e) => e.group));
    expect([...groups].sort()).toEqual(['golearn-extension', 'gopractice', 'service']);
    // the golearn group is the extension (background, content, popup) AND its setup app: four entries, one package
    expect(ENTRIES.filter((e) => e.group === 'golearn-extension').map((e) => e.id).sort()).toEqual(['golearn-app', 'golearn-background', 'golearn-content', 'golearn-popup']);
    for (const e of ENTRIES.filter((e) => e.group === 'golearn-extension')) expect(e.file.startsWith('packages/golearn-extension/'), e.file).toBe(true);
  });

  it('only golearn-extension, gopractice and the controlled-reader prototype contain a page, a manifest or a browser entry', () => {
    const hasEntry = PACKAGES.filter((p) => listFiles(`packages/${p}`, /(^|\/)(manifest\.json|index\.html|popup\.html)$/).length > 0);
    expect(hasEntry).toEqual(['controlled-reader', 'golearn-extension', 'gopractice']);
  });

  it('the controlled reader is a labelled prototype and no entry reaches it', () => {
    expect(readText('packages/controlled-reader/README.md')).toMatch(/PROTOTYPE/);
    expect(pkgSet(unionOf([...ENTRIES.map((e) => e.file), GOTELL_ENTRY]))).not.toContain('controlled-reader');
  });

  it('GoReview, GoTell and the shared libraries have no page, manifest or main.ts of their own; the service has no page', () => {
    for (const p of ['goreview', 'gotell', 'golisten', 'language-packs', 'repository-contract', 'repository-sync', 'repository-store', 'repository-engine', 'repository-linguistics']) {
      expect(listFiles(`packages/${p}`, /(^|\/)(manifest\.json|index\.html|popup\.html|main\.ts)$/), p).toEqual([]);
    }
    // the service's main.ts is the Node bridge, a service entry and not an application
    expect(listFiles('packages/repository-service', /(^|\/)(manifest\.json|index\.html|popup\.html)$/)).toEqual([]);
  });

  it('the retired single-page app (src/main.tsx with the root index.html) is the only other browser entry in the repo and no product entry reaches it', () => {
    expect(fs.existsSync(path.join(ROOT, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'src/main.tsx'))).toBe(true);
    for (const e of ENTRIES) expect(reach(e.file).files.has('src/main.tsx'), e.id).toBe(false);
  });

  it('the two applications never reach each other, and GoPractice never reaches the extension or the controlled reader', () => {
    const golearn = pkgSet(unionOf(ENTRIES.filter((e) => e.group === 'golearn-extension').map((e) => e.file)));
    const gopractice = pkgSet(reach('packages/gopractice/main.ts').files);
    expect(golearn.filter((p) => ['gopractice', 'goreview', 'gotell'].includes(p))).toEqual([]);
    expect(gopractice).not.toContain('golearn-extension');
    expect(gopractice).not.toContain('controlled-reader');
  });
});

describe('what each entry may reach (exact package sets)', () => {
  const EXPECT: Record<string, string[]> = {
    'golearn-background': ['golearn-extension', 'language-packs', 'repository-contract', 'repository-service', 'repository-sync'],
    'golearn-content': ['golearn-extension', 'golisten', 'repository-contract'],
    'golearn-popup': ['golearn-extension', 'repository-contract'],
    'golearn-app': ['golearn-extension', 'language-packs', 'repository-contract', 'repository-service'],
    gopractice: ['gopractice', 'goreview', 'gotell', 'golisten', 'language-packs', 'repository-contract', 'repository-service', 'repository-sync'],
    'repository-service': ['repository-contract', 'repository-engine', 'repository-linguistics', 'repository-service', 'repository-store'],
  };
  it.each(ENTRIES.map((e) => [e.id, e.file]))('%s reaches exactly the packages listed in the doc', (id, file) => {
    expect(pkgSet(reach(file).files)).toEqual([...EXPECT[id]].sort());
  });

  it('no application reaches the store, the engine or the linguistic service; of the service it reaches only the typed client, its dependency types and the handler module the client names', () => {
    for (const e of ENTRIES.filter((x) => x.group !== 'service')) {
      const r = reach(e.file);
      const pk = pkgSet(r.files);
      for (const banned of ['repository-store', 'repository-engine', 'repository-linguistics']) expect(pk, `${e.id} reaches ${banned}`).not.toContain(banned);
      const service = [...r.files].filter((f) => f.startsWith('packages/repository-service/')).sort();
      const ALLOWED_SERVICE = ['packages/repository-service/src/api.ts', 'packages/repository-service/src/deps.ts', 'packages/repository-service/src/handler.ts'];
      expect(service.filter((f) => !ALLOWED_SERVICE.includes(f)), e.id).toEqual([]);
    }
  });

  it('the service reaches no application, no GoListen, no language pack and no sync client', () => {
    const pk = pkgSet(reach('packages/repository-service/src/main.ts').files);
    for (const banned of ['golearn-extension', 'gopractice', 'goreview', 'gotell', 'golisten', 'language-packs', 'repository-sync', 'controlled-reader']) expect(pk).not.toContain(banned);
  });

  it('the content script reaches no Repository client, sync, store or service code (it only messages the worker)', () => {
    const pk = pkgSet(reach('packages/golearn-extension/src/content/index.ts').files);
    for (const banned of ['repository-service', 'repository-sync', 'repository-store', 'repository-engine', 'repository-linguistics', 'language-packs']) expect(pk, banned).not.toContain(banned);
  });

  it('GoLearn needs no audio: only the content script reaches GoListen, and only its device provider (no remote, recorded or audio-file provider, no assessment mode)', () => {
    for (const e of ENTRIES.filter((x) => x.group === 'golearn-extension' && x.id !== 'golearn-content')) expect(pkgSet(reach(e.file).files), e.id).not.toContain('golisten');
    const content = [...reach('packages/golearn-extension/src/content/index.ts').files].filter((f) => f.startsWith('packages/golisten/'));
    expect(content.length).toBeGreaterThan(0);
    expect(content.filter((f) => /providers\/(remote|recorded|audio)\.ts$|assessment\.ts$|golisten\.ts$/.test(f))).toEqual([]);
  });
});

describe('shared packages never reach an application, the service, the store or the engine (transitively)', () => {
  const ALLOWED: Record<string, string[]> = {
    'repository-contract': ['repository-contract'],
    golisten: ['golisten', 'repository-contract'],
    'language-packs': ['language-packs', 'repository-contract'],
    'repository-sync': ['repository-sync', 'repository-contract'],
  };
  it.each(Object.keys(ALLOWED))('%s', (p) => {
    const roots = listFiles(`packages/${p}`);
    expect(roots.length).toBeGreaterThan(3);
    const reached = new Set<string>();
    for (const root of roots) for (const f of reach(root).files) reached.add(f);
    expect(pkgSet(reached).filter((x) => !ALLOWED[p].includes(x)), `${p} reaches`).toEqual([]);
    // and, in the legacy tree, nothing outside pure language analysis (src/course is the type-only C-01 coupling, asserted in conformance.imports)
    expect([...reached].filter((f) => /^src\/(ui|ladder|stage0|library|golearn|gotell|goread|golisten|ingest|sim|authoring|app|db|backup)\//.test(f)), p).toEqual([]);
  });

  it('the Repository packages below the service reach only the contract (linguistics also reaches the language analyser in src/)', () => {
    const ALLOWED_BELOW: Record<string, string[]> = {
      'repository-store': ['repository-store', 'repository-contract'],
      'repository-engine': ['repository-engine', 'repository-contract'],
      'repository-linguistics': ['repository-linguistics', 'repository-contract'],
    };
    for (const [p, allowed] of Object.entries(ALLOWED_BELOW)) {
      const reached = new Set<string>();
      for (const root of listFiles(`packages/${p}`)) for (const f of reach(root).files) reached.add(f);
      expect(pkgSet(reached).filter((x) => !allowed.includes(x)), p).toEqual([]);
    }
  });
});

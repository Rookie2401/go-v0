/**
 * Architecture conformance, rule (c) and the structural half of §13 (docs/ecosystem/audit/ARCHITECTURE-CONFORMANCE.md):
 * exactly two application entry groups exist (GoLearn incl. its extension and setup app; GoReview), the Repository
 * service is shared infrastructure, and the shared packages reach no application, service, store or engine, transitively.
 *
 * test/ecosystem/boundaries.test.ts checks the literal import strings of each file; this file checks the transitive
 * closure from the real entries and the exact package set each entry may reach. It does not repeat those checks.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ENTRIES, GOTELL_ENTRY, ROOT, chainTo, listFiles, packageOf, reach, readText, rel, unionOf } from './conformance.support';

// Only packages git tracks are part of the architecture. An untracked folder under packages/ (2026-10-20: packages/goreview-ios,
// the Capacitor shell of the TestFlight build, not committed) is someone's working copy, not a shipped entry group.
const trackedPackages = (): Set<string> => {
  try {
    const out = execFileSync('git', ['ls-files', '--', 'packages'], { cwd: ROOT, encoding: 'utf8' });
    return new Set(out.split('\n').map((l) => l.split('/')[1]).filter((p): p is string => !!p));
  } catch { return new Set(); } // no git: every folder counts
};
const tracked = trackedPackages();
// A native shell (packages/<app>-ios: the Capacitor wrapper of an app that exists as a package of its own) is not an application entry
// group: its web content is a generated copy of that app (web/, ios/App/App/public/), and it is excluded here (2026-10-24, biblia-ios).
const isNativeShell = (name: string): boolean => /-ios$/.test(name);
const PACKAGES = fs.readdirSync(path.join(ROOT, 'packages'), { withFileTypes: true }).filter((d) => d.isDirectory() && !isNativeShell(d.name) && (tracked.size === 0 || tracked.has(d.name))).map((d) => d.name).sort();
const pkgSet = (files: Iterable<string>): string[] => [...new Set([...files].filter((f) => f.startsWith('packages/')).map(packageOf))].sort();

describe('(c) exactly two application entry groups', () => {
  it('the product entries fall into golearn-extension and goreview-app, plus the shared service', () => {
    const groups = new Set(ENTRIES.map((e) => e.group));
    expect([...groups].sort()).toEqual(['golearn-extension', 'goreview-app', 'service']);
    // the golearn group is the extension (background, content, popup) AND its setup app: four entries, one package
    expect(ENTRIES.filter((e) => e.group === 'golearn-extension').map((e) => e.id).sort()).toEqual(['golearn-app', 'golearn-background', 'golearn-content', 'golearn-popup']);
    for (const e of ENTRIES.filter((e) => e.group === 'golearn-extension')) expect(e.file.startsWith('packages/golearn-extension/'), e.file).toBe(true);
  });

  it('only golearn-extension, goreview-app, the Biblia reader and the controlled-reader prototype contain a page, a manifest or a browser entry', () => {
    // by package group (packageOf): the GoReview app's page lives under packages/goreview/app and counts as goreview-app, not as the engine
    const hasEntry = [...new Set(PACKAGES.flatMap((p) => listFiles(`packages/${p}`, /(^|\/)(manifest\.json|index\.html|popup\.html)$/)).map((f) => packageOf(rel(f))))].sort();
    // biblia (2026-10-18): the Scripture reader page built on the extension's parser and card, with no analysis of its own (its README says so)
    expect(hasEntry).toEqual(['biblia', 'controlled-reader', 'golearn-extension', 'goreview-app']);
    expect(readText('packages/biblia/README.md')).toMatch(/GoLearn/);
  });

  it('the controlled reader is a labelled prototype and no entry reaches it', () => {
    expect(readText('packages/controlled-reader/README.md')).toMatch(/PROTOTYPE/);
    expect(pkgSet(unionOf([...ENTRIES.map((e) => e.file), GOTELL_ENTRY]))).not.toContain('controlled-reader');
  });

  it('GoReview, GoTell and the shared libraries have no page, manifest or main.ts of their own; the service has no page', () => {
    // the GoReview engine is packages/goreview/src; its app (packages/goreview/app, the former GoPractice shell) is the entry and has the page
    for (const p of ['goreview/src', 'gotell', 'golisten', 'golearn-share', 'language-packs', 'repository-contract', 'repository-sync', 'repository-store', 'repository-engine', 'repository-linguistics']) {
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

  it('the two applications never reach each other, and GoReview never reaches the extension or the controlled reader', () => {
    const golearn = pkgSet(unionOf(ENTRIES.filter((e) => e.group === 'golearn-extension').map((e) => e.file)));
    const goreviewApp = pkgSet(reach('packages/goreview/app/main.ts').files);
    expect(golearn.filter((p) => ['goreview-app', 'goreview', 'gotell'].includes(p))).toEqual([]);
    expect(goreviewApp).not.toContain('golearn-extension');
    expect(goreviewApp).not.toContain('controlled-reader');
  });
});

describe('what each entry may reach (exact package sets)', () => {
  const EXPECT: Record<string, string[]> = {
    // the background worker hosts the device-local Repository (packages/repository-local), which brings the service's store, engine and linguistic layer with it
    'golearn-background': ['golearn-extension', 'language-packs', 'repository-contract', 'repository-engine', 'repository-linguistics', 'repository-local', 'repository-service', 'repository-store', 'repository-sync'],
    'golearn-content': ['golearn-extension', 'golisten', 'repository-contract'],
    // the popup stopped naming the device voices on 2026-10-28 (the owner's cut), so it no longer reaches GoListen's tag data; the setup page's Audio guide does
    'golearn-popup': ['golearn-extension', 'repository-contract'],
    // the setup app and GoReview work with no account: inside the extension they connect to the worker's device-local Repository, and the hosted
    // setup app opens one of its own (a lazy chunk); repository-local brings the store, engine and linguistic layer with it (reached only through it, below)
    'golearn-app': ['golearn-extension', 'golearn-share', 'golisten', 'language-packs', 'repository-contract', 'repository-engine', 'repository-linguistics', 'repository-local', 'repository-service', 'repository-store', 'repository-sync'],
    // shared-brand: the Go mark and the loading mark's globe (PNG masks the app resolves with new URL(..., import.meta.url))
    'goreview-app': ['goreview-app', 'goreview', 'gotell', 'golisten', 'language-packs', 'repository-contract', 'repository-engine', 'repository-linguistics', 'repository-local', 'repository-service', 'repository-store', 'repository-sync', 'shared-brand'],
    'repository-service': ['repository-contract', 'repository-engine', 'repository-linguistics', 'repository-service', 'repository-store'],
  };
  it.each(ENTRIES.map((e) => [e.id, e.file]))('%s reaches exactly the packages listed in the doc', (id, file) => {
    expect(pkgSet(reach(file).files)).toEqual([...EXPECT[id]].sort());
  });

  it('no application reaches the store, the engine or the linguistic service except through repository-local (the device-local Repository); of the service it reaches only the typed client, its dependency types and the handler module the client names', () => {
    for (const e of ENTRIES.filter((x) => x.group !== 'service')) {
      const r = reach(e.file);
      for (const banned of ['repository-store', 'repository-engine', 'repository-linguistics']) {
        // a package that is reached must be reached through repository-local: every chain from the entry to one of its files passes a repository-local file
        for (const f of [...r.files].filter((x) => x.startsWith(`packages/${banned}/`))) {
          expect(chainTo(r, f).some((x) => x.startsWith('packages/repository-local/')), `${e.id} reaches ${banned} (${f}) other than through repository-local`).toBe(true);
        }
      }
      const service = [...r.files].filter((f) => f.startsWith('packages/repository-service/')).sort();
      // the handler module brings its own browser-safe helpers: the long-poll notifier (sync, 2026-10-17) and, since the accounts
      // hardening of the same day, accounts.ts, http.ts (request ids, body caps), metrics.ts, ratelimit.ts and throttle.ts. None of
      // them imports node:* (the device bundle builds from them); the Node bridge, the mailer, the purge job and the stores stay out.
      const ALLOWED_SERVICE = ['api.ts', 'deps.ts', 'handler.ts', 'accounts.ts', 'http.ts', 'metrics.ts', 'notifier.ts', 'ratelimit.ts', 'throttle.ts'].map((f) => 'packages/repository-service/src/' + f);
      expect(service.filter((f) => !ALLOWED_SERVICE.includes(f)), e.id).toEqual([]);
    }
  });

  it('the service reaches no application, no GoListen, no language pack and no sync client', () => {
    const pk = pkgSet(reach('packages/repository-service/src/main.ts').files);
    for (const banned of ['golearn-extension', 'goreview-app', 'goreview', 'gotell', 'golisten', 'language-packs', 'repository-sync', 'controlled-reader']) expect(pk).not.toContain(banned);
  });

  it('the content script reaches no Repository client, sync, store or service code (it only messages the worker)', () => {
    const pk = pkgSet(reach('packages/golearn-extension/src/content/index.ts').files);
    for (const banned of ['repository-service', 'repository-sync', 'repository-store', 'repository-engine', 'repository-linguistics', 'language-packs']) expect(pk, banned).not.toContain(banned);
  });

  it('GoLearn keeps audio behind the content voice adapter: the setup page (its Audio guide) reaches tag data only; the popup and the worker none; content uses injected providers', () => {
    for (const e of ENTRIES.filter((x) => x.group === 'golearn-extension' && x.id !== 'golearn-content')) {
      const listen = [...reach(e.file).files].filter((f) => f.startsWith('packages/golisten/')).sort();
      expect(listen, e.id).toEqual(e.id === 'golearn-app' ? ['packages/golisten/src/deviceTags.ts'] : []);
    }
    const content = [...reach('packages/golearn-extension/src/content/index.ts').files].filter((f) => f.startsWith('packages/golisten/'));
    expect(content.length).toBeGreaterThan(0);
    expect(content.filter((f) => /providers\/(recorded)\.ts$|assessment\.ts$|golisten\.ts$/.test(f))).toEqual([]);
    expect(content.filter((f) => /providers\/(remote|audio)\.ts$/.test(f)).sort()).toEqual([
      'packages/golisten/src/providers/audio.ts', 'packages/golisten/src/providers/remote.ts',
    ]);
  });
});

describe('shared packages never reach an application, the service, the store or the engine (transitively)', () => {
  const ALLOWED: Record<string, string[]> = {
    'repository-contract': ['repository-contract'],
    golisten: ['golisten', 'repository-contract'],
    'golearn-share': ['golearn-share', 'repository-contract'],
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

  it('repository-local reaches the contract, the store (memory), the engine, the linguistic layer, the sync area and the service client and handler, and nothing else', () => {
    const reached = new Set<string>();
    for (const root of listFiles('packages/repository-local')) for (const f of reach(root).files) reached.add(f);
    expect(pkgSet(reached).filter((x) => !['repository-local', 'repository-contract', 'repository-store', 'repository-engine', 'repository-linguistics', 'repository-sync', 'repository-service'].includes(x))).toEqual([]);
    // of the service: the client, its dependency types, the handler and the handler's browser-safe helpers (accounts, http, metrics,
    // notifier, ratelimit, throttle: 2026-10-17), and nothing else (no Node bridge, no Node crypto, no mailer, no purge job, no source-policy file reader)
    expect([...reached].filter((f) => f.startsWith('packages/repository-service/')).sort()).toEqual(['accounts.ts', 'api.ts', 'deps.ts', 'handler.ts', 'http.ts', 'metrics.ts', 'notifier.ts', 'ratelimit.ts', 'throttle.ts'].map((f) => 'packages/repository-service/src/' + f));
    // of the store: the memory implementation and its rules; never the SQLite one (node:sqlite) or the export module
    expect([...reached].filter((f) => f.startsWith('packages/repository-store/')).sort()).toEqual(['packages/repository-store/src/deletion.ts', 'packages/repository-store/src/memory.ts', 'packages/repository-store/src/rules.ts']);
    // and no Node-only import anywhere in what it reaches
    for (const f of [...reached].filter((x) => x.startsWith('packages/'))) expect(readText(f), f).not.toMatch(/froms+['"]node:/);
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

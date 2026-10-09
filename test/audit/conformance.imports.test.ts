/**
 * Architecture conformance, rules (a), (b), (d), (e) of the audit brief (docs/ecosystem/audit/ARCHITECTURE-CONFORMANCE.md):
 * the static import graph from every real entry point must not reach the retired course, every legacy module that is
 * reached must be on the salvage allow-list, GoTell must not reach GoReview, and no entry may carry commercial-ebook code.
 *
 * Rule (c) (entry groups, shared packages) is in conformance.structure.test.ts. The literal-import checks of
 * test/ecosystem/boundaries.test.ts and test/gotell/boundary.test.ts are not repeated: these tests follow imports
 * transitively, through `src/`, and look at the whole reached set.
 *
 * Set AUDIT_PRINT=1 to print each entry's reached `src/` set (the lists quoted in the doc).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  EBOOK_PATTERNS, ENTRIES, GOREVIEW_ROOT, GOTELL_ENTRY, LEGACY_FORBIDDEN, RETIRED_DATA, ROOT, SALVAGE_ALLOW_LIST,
  allowListed, boundaryEdges, chainTo, codeStrings, exists, infoOf, isForbiddenLegacy, listFiles, packageOf, reach, readText, underPrefix, unionOf,
} from './conformance.support';

const ALL_ENTRIES: ReadonlyArray<{ id: string; file: string }> = [...ENTRIES, { id: 'gotell (hosted workspace package index)', file: GOTELL_ENTRY }];
const print = process.env.AUDIT_PRINT === '1';
/** The resolved targets of a file's relative edges (repo-relative). */
const infoEdges = (file: string): string[] => infoOf(file).edges.filter((e) => e.to).map((e) => e.to!);

describe('entry points exist', () => {
  it.each(ALL_ENTRIES.map((e) => [e.id, e.file]))('%s -> %s', (_id, file) => {
    expect(exists(file), file).toBe(true);
  });
  it('the manifest, the options page and the popup name the entries the graph starts from', () => {
    const manifest = JSON.parse(readText('packages/golearn-extension/manifest.json'));
    expect(manifest.options_page).toBe('app/index.html');
    expect(manifest.action.default_popup).toBe('action/popup.html');
    expect(manifest.background.service_worker).toBe('background.js');
    expect(readText('packages/golearn-extension/app/index.html')).toContain('./main.ts');
    expect(readText('packages/golearn-extension/action/popup.html')).toContain('popup.js');
    expect(readText('packages/gopractice/index.html')).toContain('./main.ts');
    // the build maps these exact sources to the shipped scripts
    const vite = readText('packages/golearn-extension/vite.config.ts');
    expect(vite).toContain("src/content/index.ts");
    expect(vite).toContain("src/background/index.ts");
    expect(vite).toContain("action/popup.ts");
  });
  it('the graph resolves every relative import it follows', () => {
    for (const e of ALL_ENTRIES) {
      const r = reach(e.file);
      expect(r.unresolved, `${e.id}: unresolved specifiers`).toEqual([]);
      expect(r.files.size, e.id).toBeGreaterThan(5);
    }
  });
});

describe('the detector is live (negative controls)', () => {
  it('starting from the retired app entry, the same graph finds the course, ladders, library, Scripture UI and a bundled-data glob', () => {
    const r = reach('src/main.tsx');
    for (const p of ['src/course/', 'src/ladder/', 'src/library/', 'src/stage0/', 'src/ui/scripture/', 'src/ingest/']) {
      expect([...r.runtime].some((f) => f.startsWith(p)), p).toBe(true);
    }
    expect(r.globs.length).toBeGreaterThan(0);
    expect([...r.runtime].filter(isForbiddenLegacy).length).toBeGreaterThan(100);
  });
  it('the identifier scan sees a refusal list as code and does not see comments', () => {
    expect(codeStrings('packages/golearn-extension/app/surfaces.ts')).toContain('Kindle');
    expect(codeStrings('packages/golearn-extension/src/adapters/webGeneric.ts')).toContain('read.amazon.com');
    // a phrase that occurs only in a comment of webGeneric.ts is not returned
    expect(codeStrings('packages/golearn-extension/src/adapters/webGeneric.ts')).not.toContain('Hosts whose reading terms are not reviewed');
  });
});

describe('(a) no entry reaches the retired course modules', () => {
  it('the forbidden list is derived from real directories', () => {
    for (const f of LEGACY_FORBIDDEN) {
      if (f.prefix.endsWith('/')) expect(fs.existsSync(path.join(ROOT, f.prefix)), f.prefix).toBe(true);
      else expect(exists(f.prefix), f.prefix).toBe(true);
    }
    for (const d of RETIRED_DATA) expect(fs.existsSync(path.join(ROOT, d.prefix)), d.prefix).toBe(true);
    // every top-level directory of src/ is either forbidden or allow-listed; none is silently unclassified
    const tops = fs.readdirSync(path.join(ROOT, 'src'), { withFileTypes: true }).map((d) => (d.isDirectory() ? `src/${d.name}/` : `src/${d.name}`));
    const classified = (t: string): boolean =>
      LEGACY_FORBIDDEN.some((x) => underPrefix(t, x.prefix) || x.prefix.startsWith(t)) || SALVAGE_ALLOW_LIST.some((x) => x.prefix.startsWith(t) || underPrefix(t, x.prefix));
    const assets = ['src/assets/', 'src/index.css'];
    expect(tops.filter((t) => !classified(t) && !assets.includes(t)), 'unclassified top-level entries of src/').toEqual([]);
  });

  describe.each(ALL_ENTRIES.map((e) => [e.id, e.file]))('%s', (_id, file) => {
    const r = reach(file);

    it('reaches no forbidden legacy module or retired data file through any compiled (runtime) import', () => {
      const bad = [...r.runtime].filter(isForbiddenLegacy);
      expect(bad.map((f) => chainTo(r, f).join(' -> '))).toEqual([]);
    });

    it('reaches no file under data/ or public/ at runtime and globs no data', () => {
      expect([...r.runtime].filter((f) => f.startsWith('data/') || f.startsWith('public/'))).toEqual([]);
      expect(r.globs, 'import.meta.glob in the reached set').toEqual([]);
    });

    it('type-level reach of forbidden modules is confined to the two known type-only edges into src/course/curriculumPolicy.ts (defect C-01)', () => {
      const edges = boundaryEdges(r, isForbiddenLegacy);
      const KNOWN = ['src/core/course.ts -> src/course/curriculumPolicy.ts', 'src/core/model.ts -> src/course/curriculumPolicy.ts'];
      for (const e of edges) expect(KNOWN, `unexpected edge into the retired course: ${e.from} -> ${e.to}`).toContain(`${e.from} -> ${e.to}`);
      for (const e of edges) expect(e.typeOnly, `${e.from} -> ${e.to} must be an erased "import type"`).toBe(true);
    });
  });

  it('the legacy app entry (src/main.tsx, root index.html) is reached from no entry', () => {
    for (const e of ALL_ENTRIES) {
      const r = reach(e.file);
      expect(r.files.has('src/main.tsx'), e.id).toBe(false);
      expect([...r.files].filter((f) => f === 'index.html' || f.startsWith('server/')), e.id).toEqual([]);
    }
  });
});

describe('(b) the salvage allow-list covers every legacy module that is reached', () => {
  it('allow-list entries exist on disk and none sits inside a forbidden prefix', () => {
    for (const a of SALVAGE_ALLOW_LIST) {
      expect(fs.existsSync(path.join(ROOT, a.prefix)), a.prefix).toBe(true);
      expect(LEGACY_FORBIDDEN.some((f) => underPrefix(a.prefix, f.prefix)), `${a.prefix} is also forbidden`).toBe(false);
    }
    // the allow-list is confined to pure language analysis: adapters, the adapter contract, the dictionary format
    for (const a of SALVAGE_ALLOW_LIST) expect(/^src\/(adapters|core|dict)(\/|\.|$)/.test(a.prefix), a.prefix).toBe(true);
  });

  describe.each(ALL_ENTRIES.map((e) => [e.id, e.file]))('%s', (id, file) => {
    const r = reach(file);
    const srcRuntime = [...r.runtime].filter((f) => f.startsWith('src/')).sort();
    const srcFull = [...r.files].filter((f) => f.startsWith('src/') && !isForbiddenLegacy(f)).sort();

    it('every src/ module reached by a compiled import is allow-listed', () => {
      if (print) console.info(`[reached src/ runtime] ${id}: ${srcRuntime.length} modules\n  ${srcRuntime.join('\n  ')}`);
      expect(srcRuntime.filter((f) => !allowListed(f)), 'not on the allow-list').toEqual([]);
    });

    it('every non-forbidden src/ module reached at type level is allow-listed', () => {
      expect(srcFull.filter((f) => !allowListed(f)), 'not on the allow-list').toEqual([]);
    });

    it('an app entry that reaches src/ reaches it only through language-packs, the extension parser, GoReview facts or the linguistics service', () => {
      // the legacy tree is entered from five places in the packages and nowhere else
      const doors = new Set<string>();
      for (const f of r.files) for (const to of infoEdges(f)) if (to.startsWith('src/') && !f.startsWith('src/')) doors.add(packageOf(f));
      const ALLOWED_DOORS = new Set(['golearn-extension', 'language-packs', 'goreview', 'repository-linguistics']);
      expect([...doors].filter((d) => !ALLOWED_DOORS.has(d))).toEqual([]);
    });
  });

  it('no module outside the allow-list is reached by any entry (union)', () => {
    const u = unionOf(ALL_ENTRIES.map((e) => e.file));
    const reachedSrc = [...u].filter((f) => f.startsWith('src/') && !isForbiddenLegacy(f));
    expect(reachedSrc.length).toBeGreaterThan(50);
    expect(reachedSrc.filter((f) => !allowListed(f))).toEqual([]);
    if (print) console.info(`[reached src/ union, full graph] ${reachedSrc.length} modules`);
  });

  it('records which allow-listed prefixes are wired (reached) and which are only allowed', () => {
    const u = unionOf(ALL_ENTRIES.map((e) => e.file));
    const wired = SALVAGE_ALLOW_LIST.filter((a) => [...u].some((f) => underPrefix(f, a.prefix))).map((a) => a.prefix);
    const unwired = SALVAGE_ALLOW_LIST.filter((a) => !wired.includes(a.prefix)).map((a) => a.prefix);
    if (print) console.info(`[allow-list] wired: ${wired.join(', ')}\n[allow-list] allowed but not reached: ${unwired.join(', ')}`);
    // Albanian and Spanish are the two installable packs; the other analysers are planned packs and are not wired
    for (const p of ['src/adapters/sq.ts', 'src/adapters/albanian/', 'src/adapters/es.ts', 'src/adapters/spanish/', 'src/adapters/shared.ts', 'src/core/', 'src/dict/']) expect(wired, p).toContain(p);
    for (const p of ['src/adapters/de.ts', 'src/adapters/hi.ts', 'src/adapters/th.ts', 'src/adapters/nb.ts', 'src/adapters/nn.ts']) expect(unwired, `${p} became reachable: update LEGACY-SALVAGE.md`).toContain(p);
  });
});


describe('(d) GoTell and GoReview are independent', () => {
  const tell = reach(GOTELL_ENTRY);
  const review = reach('packages/goreview/src/index.ts');

  it("GoTell's entry reaches no GoReview, GoPractice shell or GoLearn module", () => {
    const bad = [...tell.files].filter((f) => /^packages\/(goreview|gopractice|golearn-extension|controlled-reader)\//.test(f));
    expect(bad.map((f) => chainTo(tell, f).join(' -> '))).toEqual([]);
  });

  it("GoTell's entry reaches no legacy GoTell, GoRead or course module (its salvage is copied into packages/gotell/src/salvage)", () => {
    expect([...tell.files].filter((f) => f.startsWith('src/gotell/') || f.startsWith('src/goread/') || f.startsWith('src/golearn/'))).toEqual([]);
    expect([...tell.runtime].filter(isForbiddenLegacy)).toEqual([]);
  });

  it("GoReview's entry reaches no GoTell module (the converse)", () => {
    expect([...review.files].filter((f) => f.startsWith('packages/gotell/') || f.startsWith(GOTELL_ENTRY.replace('/src/index.ts', '/')))).toEqual([]);
  });

  it('GoTell reaches nothing of GoReview even through the shell it is hosted by, except that the shell reaches both', () => {
    const shell = reach('packages/gopractice/main.ts');
    expect([...shell.files].some((f) => f.startsWith('packages/gotell/'))).toBe(true);
    expect([...shell.files].some((f) => f.startsWith(GOREVIEW_ROOT))).toBe(true);
    // ...and the two meet only in the shell: nothing in goreview/ or gotell/ names the other
    for (const [pkg, other] of [['goreview', 'gotell'], ['gotell', 'goreview']] as const) {
      const files = [...shell.files].filter((f) => f.startsWith(`packages/${pkg}/`));
      for (const f of files) for (const to of infoEdges(f)) expect(to.startsWith(`packages/${other}/`), `${f} -> ${to}`).toBe(false);
    }
  });
});

describe('(e) no entry carries commercial ebook-provider code', () => {
  const union = unionOf(ALL_ENTRIES.map((e) => e.file));
  const sources = [...union].filter((f) => /\.(ts|tsx|mts)$/.test(f));

  /**
   * The only reached code that names a commercial reader. Both are refusals: the generic web adapter DECLINES these
   * hosts, and the setup page's compatibility table says Kindle and Kobo are NOT supported.
   */
  const REFUSAL_SITES: Record<string, RegExp> = {
    'packages/golearn-extension/src/adapters/webGeneric.ts': /^(read\.amazon\.com|kindle\.amazon\.com|read\.kobo\.com)$/,
    'packages/golearn-extension/app/surfaces.ts': /^(kindle|Kindle|Other ebook readers \(Kobo, Play Books, …\)|Not supported\. Kindle shows pages as images.*|Not supported yet\. Each needs its own terms review.*)$/,
  };

  it('code (identifiers and string literals, comments excluded) names no ebook provider outside the two refusal sites', () => {
    const hits: string[] = [];
    for (const f of sources) {
      for (const s of codeStrings(f)) {
        for (const p of EBOOK_PATTERNS) {
          if (!p.re.test(s)) continue;
          const allowed = REFUSAL_SITES[f];
          if (allowed && allowed.test(s)) continue;
          hits.push(`${f}: ${p.name}: ${s.slice(0, 80)}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('the two refusal sites really are refusals', () => {
    const web = readText('packages/golearn-extension/src/adapters/webGeneric.ts');
    expect(web).toMatch(/DEFAULT_DECLINED_HOSTS\s*=\s*\[/);
    expect(web).toMatch(/declinedHosts:\s*options\.declinedHosts \?\? DEFAULT_DECLINED_HOSTS/);
    expect(web).toMatch(/declin/i);
    const surfaces = readText('packages/golearn-extension/app/surfaces.ts');
    const kindle = surfaces.slice(surfaces.indexOf("id: 'kindle'"), surfaces.indexOf("id: 'other-ebook'"));
    expect(kindle).toContain("status: 'not-supported'");
    const other = surfaces.slice(surfaces.indexOf("id: 'other-ebook'"));
    expect(other.slice(0, other.indexOf('},'))).toContain("status: 'not-supported'");
  });

  it('the reached code matches the ebook patterns only in those two files, and in no other reached file by any spelling', () => {
    const files = new Set<string>();
    for (const f of sources) if (codeStrings(f).some((s) => EBOOK_PATTERNS.some((p) => p.re.test(s)))) files.add(f);
    expect([...files].sort()).toEqual(Object.keys(REFUSAL_SITES).sort());
  });

  it('the manifest grants no host access and declares no content script, so no reader site is touched without a gesture', () => {
    const m = JSON.parse(readText('packages/golearn-extension/manifest.json'));
    expect(m.host_permissions).toBeUndefined();
    expect(m.content_scripts).toBeUndefined();
    expect(m.optional_host_permissions).toBeUndefined();
    expect(JSON.stringify(m)).not.toMatch(/amazon|kindle|kobo/i);
  });

  it('the only third-party package any entry imports is ts-fsrs (GoReview scheduling) plus node builtins', () => {
    const externals = new Set<string>();
    for (const e of ALL_ENTRIES) for (const x of reach(e.file).externals.keys()) externals.add(x);
    const nonNode = [...externals].filter((x) => !x.startsWith('node:'));
    expect(nonNode.sort()).toEqual(['ts-fsrs']);
    for (const x of externals) for (const p of EBOOK_PATTERNS) expect(p.re.test(x), x).toBe(false);
  });

  it('package.json declares no ebook-provider dependency', () => {
    const pkg = JSON.parse(readText('package.json'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const d of deps) for (const p of EBOOK_PATTERNS) expect(p.re.test(d), d).toBe(false);
  });

  it('the controlled reader prototype is not an app entry: no entry reaches it, and it holds no provider code either', () => {
    expect([...union].filter((f) => f.startsWith('packages/controlled-reader/'))).toEqual([]);
    const readme = readText('packages/controlled-reader/README.md');
    expect(readme).toMatch(/PROTOTYPE/);
    const cr = new Set<string>();
    for (const entry of ['packages/controlled-reader/src/reader.ts', 'packages/controlled-reader/src/adapter.ts']) for (const f of reach(entry).files) cr.add(f);
    const hits: string[] = [];
    for (const f of cr) if (/\.(ts|tsx|mts)$/.test(f)) for (const s of codeStrings(f)) for (const p of EBOOK_PATTERNS) if (p.re.test(s)) hits.push(`${f}: ${s.slice(0, 80)}`);
    expect(hits).toEqual([]);
    // its one third-party package is a generic EPUB renderer, not a vendor SDK
    const ext = new Set<string>();
    for (const entry of ['packages/controlled-reader/src/reader.ts', 'packages/controlled-reader/src/adapter.ts']) for (const x of reach(entry).externals.keys()) ext.add(x);
    expect([...ext].filter((x) => !x.startsWith('node:'))).toEqual(['epubjs']);
  });
});

describe('in between: the one legacy corner reachable only from a prototype', () => {
  it('the controlled reader (not an app entry) compiles in exactly four legacy modules, the DRM-refusing EPUB reader and its helpers, and globs no data', () => {
    const rt = new Set<string>();
    const globs: unknown[] = [];
    for (const entry of listFiles('packages/controlled-reader/src')) {
      const r = reach(entry);
      r.runtime.forEach((f) => rt.add(f));
      globs.push(...r.globs);
    }
    expect([...rt].filter((f) => f.startsWith('src/')).sort()).toEqual(['src/ingest/epub.ts', 'src/ingest/headings.ts', 'src/ingest/plaintext.ts', 'src/ingest/quality.ts']);
    expect([...rt].filter((f) => f.startsWith('data/') || f.startsWith('public/'))).toEqual([]);
    expect(globs).toEqual([]);
  });
});

describe('no entry names an external language-model provider', () => {
  it('no identifier or string literal in any reached source names an LLM vendor, SDK or endpoint (charter principle 13; the Azure Speech registry metadata is speech synthesis, dormant, and is listed in the rights audit)', () => {
    const union = unionOf(ALL_ENTRIES.map((e) => e.file));
    const NEEDLES = ['openai', 'anthropic', 'chatgpt', 'gpt-3', 'gpt-4', 'gpt-5', 'gemini-', 'generativelanguage', 'api.cohere', 'mistral.ai', 'perplexity.ai', 'huggingface', 'api.groq', 'together.ai', 'api.deepl'];
    const hits: string[] = [];
    for (const f of union) for (const s of codeStrings(f)) if (NEEDLES.some((n) => s.toLowerCase().includes(n))) hits.push(f + ': ' + s.slice(0, 80));
    expect(hits).toEqual([]);
  });
});

describe('in between: reached modules whose names point at the retired course', () => {
  const FLAGGED = ['src/adapters/albanian/lexicon-ladder.ts', 'src/adapters/spanish/lexicon-course.ts'];
  it('exactly two compiled-in modules are named after the ladder or the course; both are pure word lists inside their adapter directory', () => {
    const rt = new Set<string>();
    for (const e of ALL_ENTRIES) reach(e.file).runtime.forEach((f) => rt.add(f));
    const named = [...rt].filter((f) => f.startsWith('src/') && /(ladder|course|stage|curriculum|library|corpus|lesson|scripture)/i.test(f.split('/').pop()!) && !f.startsWith('src/course/') && !isForbiddenLegacy(f));
    expect(named.sort()).toEqual(FLAGGED);
    for (const f of FLAGGED) {
      const dir = f.slice(0, f.lastIndexOf('/') + 1);
      expect(infoEdges(f).filter((to) => !to.startsWith(dir)), f + ' imports outside its adapter directory').toEqual([]);
      expect(infoOf(f).externals, f).toEqual([]);
    }
  });

  it('the four contract files named for the course, library and Stage 0 (src/core/course.ts, src/core/contracts/{course,library,stage0}.ts) are reached only as erased types', () => {
    const typeOnly = ['src/core/course.ts', 'src/core/contracts/course.ts', 'src/core/contracts/library.ts', 'src/core/contracts/stage0.ts'];
    const full = unionOf(ALL_ENTRIES.map((e) => e.file));
    const rt = new Set<string>();
    for (const e of ALL_ENTRIES) reach(e.file).runtime.forEach((f) => rt.add(f));
    for (const f of typeOnly) {
      expect(full.has(f), f + ' reached at type level').toBe(true);
      expect(rt.has(f), f + ' must not be compiled in').toBe(false);
    }
  });
});

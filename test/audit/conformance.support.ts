/**
 * Static import graph for the architecture-conformance audit (docs/ecosystem/audit/ARCHITECTURE-CONFORMANCE.md).
 *
 * Nothing here executes the code under test: it parses every reachable source file with the TypeScript parser,
 * collects `import`/`export ... from`/dynamic `import('x')`/`import type`/`import.meta.glob('x')`/`new URL('x', import.meta.url)`
 * edges, resolves relative specifiers (`.ts`, `.tsx`, `.mts`, `.js`, `.json`, `index.*`), and stops at bare specifiers
 * (node_modules and `node:*` builtins), which are recorded as externals instead of followed.
 *
 * Two reach sets exist per entry: `full` follows every edge including `import type` (the coupling a reader of the code
 * sees) and `runtime` skips edges that are erased by the compiler (type-only). Conformance rules are asserted on `full`.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export const ROOT = path.resolve(__dirname, '../..');
export const rel = (abs: string): string => path.relative(ROOT, abs).split(path.sep).join('/');
const abs = (r: string): string => path.join(ROOT, r);

// ---------------------------------------------------------------------------------------------------------------------
// entries

/** Every runtime entry of the two applications and the shared service. `group` is the app-entry group. */
export const ENTRIES = [
  { id: 'golearn-background', group: 'golearn-extension', file: 'packages/golearn-extension/src/background/index.ts', role: 'MV3 service worker (privileged side)' },
  { id: 'golearn-content', group: 'golearn-extension', file: 'packages/golearn-extension/src/content/index.ts', role: 'content script injected into reader pages' },
  { id: 'golearn-popup', group: 'golearn-extension', file: 'packages/golearn-extension/action/popup.ts', role: 'toolbar action popup' },
  { id: 'golearn-app', group: 'golearn-extension', file: 'packages/golearn-extension/app/main.ts', role: 'setup / onboarding app (options page and hosted web build)' },
  { id: 'goreview-app', group: 'goreview-app', file: 'packages/goreview/app/main.ts', role: 'GoReview app (the shell: the review, GoTell and Settings workspaces)' },
  { id: 'repository-service', group: 'service', file: 'packages/repository-service/src/main.ts', role: 'Repository HTTP service (Node)' },
] as const;
export type EntryId = (typeof ENTRIES)[number]['id'];

/** The GoTell entry is the package index: GoTell has no entry of its own, the GoReview shell hosts it. */
export const GOTELL_ENTRY = 'packages/gotell/src/index.ts';
export const GOREVIEW_ROOT = 'packages/goreview/src/';

// ---------------------------------------------------------------------------------------------------------------------
// graph

export interface Edge { spec: string; to?: string; typeOnly: boolean; kind: 'static' | 'dynamic' | 'glob' | 'url' }
export interface FileInfo { file: string; edges: Edge[]; externals: string[]; unresolved: string[] }

const EXTS = ['.ts', '.tsx', '.mts', '.js', '.mjs', '.json'];
const infoCache = new Map<string, FileInfo>();

function resolveRelative(fromAbs: string, spec: string): string | undefined {
  const base = path.resolve(path.dirname(fromAbs), spec);
  const tries: string[] = [];
  tries.push(base);
  // `.js` specifiers in TS sources name a `.ts` file
  if (/\.(js|mjs)$/.test(base)) tries.push(base.replace(/\.(js|mjs)$/, '.ts'), base.replace(/\.(js|mjs)$/, '.tsx'));
  for (const e of EXTS) tries.push(base + e);
  for (const e of EXTS) tries.push(path.join(base, 'index' + e));
  for (const t of tries) {
    try { if (fs.statSync(t).isFile()) return t; } catch { /* next */ }
  }
  return undefined;
}

function parseFile(fileAbs: string): FileInfo {
  const cached = infoCache.get(fileAbs);
  if (cached) return cached;
  const info: FileInfo = { file: rel(fileAbs), edges: [], externals: [], unresolved: [] };
  infoCache.set(fileAbs, info);
  if (fileAbs.endsWith('.json') || !/\.(ts|tsx|mts|js|mjs)$/.test(fileAbs)) return info; // data leaf
  const text = fs.readFileSync(fileAbs, 'utf8');
  const sf = ts.createSourceFile(fileAbs, text, ts.ScriptTarget.ES2023, true, fileAbs.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const add = (spec: string, typeOnly: boolean, kind: Edge['kind']): void => {
    if (spec.startsWith('node:') || !(spec.startsWith('.') || spec.startsWith('/'))) { info.externals.push(spec); return; }
    const to = resolveRelative(fileAbs, spec.replace(/\?.*$/, ''));
    if (!to) { info.unresolved.push(spec); return; }
    info.edges.push({ spec, to: rel(to), typeOnly, kind });
  };
  const str = (n: ts.Node | undefined): string | undefined => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : undefined);
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n)) {
      const spec = str(n.moduleSpecifier);
      if (spec) add(spec, !!n.importClause?.isTypeOnly, 'static');
    } else if (ts.isExportDeclaration(n)) {
      const spec = str(n.moduleSpecifier);
      if (spec) add(spec, !!n.isTypeOnly, 'static');
    } else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) {
      const spec = str(n.moduleReference.expression);
      if (spec) add(spec, !!n.isTypeOnly, 'static');
    } else if (ts.isCallExpression(n)) {
      if (n.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const spec = str(n.arguments[0]);
        if (spec) add(spec, false, 'dynamic'); else info.unresolved.push('<non-literal dynamic import>');
      } else if (ts.isIdentifier(n.expression) && n.expression.text === 'require') {
        const spec = str(n.arguments[0]);
        if (spec) add(spec, false, 'dynamic');
      } else if (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'glob'
        && ts.isMetaProperty(n.expression.expression)) {
        // import.meta.glob('./x/*.json'): record the pattern, resolve its static directory part
        const pat = str(n.arguments[0]);
        if (pat) {
          info.edges.push({ spec: pat, to: rel(path.resolve(path.dirname(fileAbs), pat.replace(/[*{[].*$/, '') || '.')), typeOnly: false, kind: 'glob' });
        }
      }
    } else if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'URL' && n.arguments && n.arguments.length === 2) {
      const spec = str(n.arguments[0]);
      if (spec && (spec.startsWith('.') || spec.startsWith('/')) && /import\.meta\.url/.test(n.arguments[1].getText(sf))) {
        const to = resolveRelative(fileAbs, spec);
        if (to) info.edges.push({ spec, to: rel(to), typeOnly: false, kind: 'url' });
      }
    } else if (ts.isImportTypeNode(n)) {
      const arg = n.argument;
      if (ts.isLiteralTypeNode(arg)) { const spec = str(arg.literal); if (spec) add(spec, true, 'static'); }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return info;
}

export interface Reach {
  entry: string;
  /** repo-relative files reached (entry included), full graph */
  files: Set<string>;
  /** files reached through runtime (non type-only) edges only */
  runtime: Set<string>;
  parent: Map<string, { from: string; spec: string } | undefined>;
  /** bare-package specifiers imported anywhere in the reached set, with an example importer */
  externals: Map<string, string>;
  /** import.meta.glob patterns found in the reached set: [importer, pattern] */
  globs: Array<[string, string]>;
  /** specifiers that did not resolve */
  unresolved: Array<[string, string]>;
}

const reachCache = new Map<string, Reach>();

export function reach(entry: string): Reach {
  const hit = reachCache.get(entry);
  if (hit) return hit;
  const r: Reach = { entry, files: new Set(), runtime: new Set(), parent: new Map(), externals: new Map(), globs: [], unresolved: [] };
  const walk = (start: string, runtimeOnly: boolean, into: Set<string>): void => {
    const queue: string[] = [start];
    into.add(start);
    if (!runtimeOnly) r.parent.set(start, undefined);
    while (queue.length) {
      const cur = queue.shift()!;
      const info = parseFile(abs(cur));
      if (!runtimeOnly) {
        for (const x of info.externals) if (!r.externals.has(x)) r.externals.set(x, cur);
        for (const u of info.unresolved) r.unresolved.push([cur, u]);
      }
      for (const e of info.edges) {
        if (runtimeOnly && e.typeOnly) continue;
        if (e.kind === 'glob') {
          if (!runtimeOnly) r.globs.push([cur, e.spec]);
          continue; // a glob is a data pattern, not a module edge
        }
        if (!e.to || into.has(e.to)) continue;
        into.add(e.to);
        if (!runtimeOnly) r.parent.set(e.to, { from: cur, spec: e.spec });
        queue.push(e.to);
      }
    }
  };
  walk(entry, false, r.files);
  walk(entry, true, r.runtime);
  reachCache.set(entry, r);
  return r;
}

/** The import chain entry -> ... -> file, as repo-relative paths (for failure messages and the doc). */
export function chainTo(r: Reach, file: string): string[] {
  const out: string[] = [];
  let cur: string | undefined = file;
  while (cur) { out.unshift(cur); cur = r.parent.get(cur)?.from; }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// the legacy tree and the rules

/** Every top-level directory of the legacy app, and what the architecture documents say about it. */
export const LEGACY_FORBIDDEN: ReadonlyArray<{ prefix: string; why: string }> = [
  { prefix: 'src/ladder/', why: 'graded reading ladders (633 units) and the learner path (charter principle 9; salvage audit C: RETIRE)' },
  { prefix: 'src/stage0/', why: 'Stage 0 onboarding packs and sound tables (principle 9: no Stage 0-B2 curriculum; salvage audit C: RETIRE)' },
  { prefix: 'src/course/', why: 'course definitions, course progression, curriculum policy, vocabulary ownership per course (salvage audit C: RETIRE)' },
  { prefix: 'src/library/', why: 'bundled literary library, shelves, rights gate and catalogue (principle 8: no giant bundled literary corpus)' },
  { prefix: 'src/authoring/', why: 'unit authoring tooling for the retired ladders (salvage audit C: RETIRE)' },
  { prefix: 'src/sim/', why: 'learner simulation over the retired course (salvage audit C: RETIRE)' },
  { prefix: 'src/ui/', why: 'the legacy React course UI: Home, Path, Library, Scripture, Course, Curriculum pages (salvage audit C: RETIRE/REBUILD)' },
  { prefix: 'src/app/', why: 'the legacy single-page app shell (router, course context)' },
  { prefix: 'src/main.tsx', why: 'the legacy single-page app entry' },
  { prefix: 'src/goread/', why: 'device-local identity (u-local) and the team text-sharing client (salvage audit B: RETIRE)' },
  { prefix: 'src/golisten/', why: 'retired course-audio pipeline bound to a bundled audio corpus (packages/golisten README: nothing depends on it)' },
  { prefix: 'src/ingest/', why: 'corpus importer: globs the bundled corpus (import.meta.glob) and plans library documents; the KEEP-classed personal-copy importers are not wired into either app' },
  { prefix: 'src/bench/', why: 'benchmark and gold-set tooling over the retired corpus (dev asset, never product)' },
  { prefix: 'src/db/', why: 'Dexie database of the legacy single-page app (learner state now lives in the Repository)' },
  { prefix: 'src/backup/', why: 'legacy IndexedDB backup (ADAPT: replaced by the Repository export)' },
  { prefix: 'src/golearn/', why: 'legacy learner model bound to bundled texts and ladders; its host-neutral lift is 2GoLearn and the Repository engine' },
  { prefix: 'src/gotell/', why: 'legacy GoTell bound to the course testimony; the salvaged pure pieces were copied into packages/gotell/src/salvage' },
  { prefix: 'src/alphabet/', why: 'Stage 0 alphabet/letter trainers for the retired course' },
];

/** Data directories of the retired corpus: a reached module must never import (or glob) from here. */
export const RETIRED_DATA: ReadonlyArray<{ prefix: string; why: string }> = [
  { prefix: 'data/corpus/', why: 'bundled comprehensible-input corpus (147 documents)' },
  { prefix: 'data/ladder/', why: 'reading-ladder units' },
  { prefix: 'data/stage0/', why: 'Stage 0 packs' },
  { prefix: 'data/sources/', why: 'source texts of the retired library and the four Bibles' },
  { prefix: 'data/verified/', why: 'verified-source records of the retired library' },
  { prefix: 'data/review/', why: 'reviewer packets for the retired units' },
  { prefix: 'public/library/', why: 'installed library shards (196 MB)' },
];

/**
 * The legacy modules that ARE allowed into the product: pure, I/O-free language analysis and its types. Each entry is a
 * path prefix under `src/`. `status`: 'salvaged' = KEEP/ADAPT in the salvage audit and used by the ecosystem; 'flagged'
 * = reachable but with a documented reservation (see LEGACY-SALVAGE.md).
 */
export const SALVAGE_ALLOW_LIST: ReadonlyArray<{ prefix: string; status: 'salvaged' | 'flagged'; why: string }> = [
  { prefix: 'src/adapters/sq.ts', status: 'salvaged', why: 'Albanian analyser (the vertical-slice language pack)' },
  { prefix: 'src/adapters/albanian/', status: 'salvaged', why: 'Albanian lexicon, morphology, constructions' },
  { prefix: 'src/adapters/es.ts', status: 'salvaged', why: 'Spanish analyser (installable at a minimal level)' },
  { prefix: 'src/adapters/spanish/', status: 'salvaged', why: 'Spanish lexicon and rules' },
  { prefix: 'src/adapters/shared.ts', status: 'salvaged', why: 'language-agnostic tokenizer, lexicon helpers and phrase matcher' },
  { prefix: 'src/adapters/shared/', status: 'salvaged', why: 'language-agnostic sharded-index loader (prefix shards, gzip inflate, LRU) used by the Hebrew and Greek adapters' },
  { prefix: 'src/adapters/index.ts', status: 'flagged', why: 'registry that names every course adapter' },
  { prefix: 'src/adapters/de.ts', status: 'salvaged', why: 'German analyser' },
  { prefix: 'src/adapters/german/', status: 'salvaged', why: 'German lexicon and rules' },
  { prefix: 'src/adapters/hi.ts', status: 'salvaged', why: 'Hindi analyser' },
  { prefix: 'src/adapters/hindi/', status: 'salvaged', why: 'Hindi lexicon and rules' },
  { prefix: 'src/adapters/th.ts', status: 'salvaged', why: 'Thai analyser' },
  { prefix: 'src/adapters/thai/', status: 'salvaged', why: 'Thai lexicon and rules' },
  { prefix: 'src/adapters/nb.ts', status: 'salvaged', why: 'Norwegian Bokmal analyser' },
  { prefix: 'src/adapters/nn.ts', status: 'salvaged', why: 'Norwegian Nynorsk analyser' },
  { prefix: 'src/adapters/norwegian/', status: 'salvaged', why: 'Norwegian lexicon and rules' },
  { prefix: 'src/adapters/la.ts', status: 'salvaged', why: 'Latin analyser (ported from the Romance app)' },
  { prefix: 'src/adapters/latin/', status: 'salvaged', why: 'Latin lexicon, morphology and rules' },
  { prefix: 'src/adapters/he.ts', status: 'salvaged', why: 'Hebrew analyser' },
  { prefix: 'src/adapters/hebrew/', status: 'salvaged', why: 'Hebrew lexicon, morphology and rules' },
  { prefix: 'src/adapters/el.ts', status: 'salvaged', why: 'Greek analyser' },
  { prefix: 'src/adapters/greek/', status: 'salvaged', why: 'Greek lexicon, morphology and rules' },
  { prefix: 'src/core/', status: 'salvaged', why: 'adapter contract, token/analysis types, item ids (pure)' },
  { prefix: 'src/dict/', status: 'salvaged', why: 'dictionary format, sharded loader, mapper (browser-safe, licence-labelled)' },
];

export const underPrefix = (file: string, prefix: string): boolean => file === prefix || (prefix.endsWith('/') || prefix.endsWith('.ts') || prefix.endsWith('.tsx') ? file.startsWith(prefix) : file.startsWith(prefix + '/'));
export const inLegacy = (file: string): boolean => file.startsWith('src/');
export const allowListed = (file: string): (typeof SALVAGE_ALLOW_LIST)[number] | undefined => SALVAGE_ALLOW_LIST.find((a) => underPrefix(file, a.prefix));

/** Commercial-ebook strings that must not appear in reached source (case-insensitive). */
export const EBOOK_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'kindle', re: /kindle/i },
  { name: 'amazon', re: /amazon/i },
  { name: 'read.amazon', re: /read\.amazon/i },
  { name: 'kobo', re: /\bkobo\b/i },
  { name: 'ebook-provider SDK', re: /@(?:amzn|kobo|overdrive|bookshout|readium)\b|overdrive|bookshout/i },
];

/**
 * What identifies a commercial ebook provider in a word list: its HOSTS and PATHS, not the English word. A salvaged word list
 * (src/adapters/<language>/lexicon-*.ts) is data in which "kindle" is a headword or gloss ("to kindle a fire"); it is not provider
 * code. The same list is still scanned for the provider hosts, paths and SDK names.
 */
export const EBOOK_HOST_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'read.amazon', re: /read\.amazon/i },
  { name: 'kindle.amazon', re: /kindle\.amazon/i },
  { name: 'read.kobo', re: /read\.kobo/i },
  { name: 'play.google.com/books', re: /play\.google\.com\/books/i },
  { name: 'ebook-provider SDK', re: /@(?:amzn|kobo|overdrive|bookshout|readium)\b|overdrive|bookshout/i },
];

/** The patterns to apply to one source file: package code (the extension, the apps) gets the strict word patterns; a legacy word list (src/adapters/) gets the host and path patterns. */
export const ebookPatternsFor = (file: string): ReadonlyArray<{ name: string; re: RegExp }> => (file.startsWith('src/adapters/') ? EBOOK_HOST_PATTERNS : EBOOK_PATTERNS);

export const readText = (file: string): string => fs.readFileSync(abs(file), 'utf8');
export const exists = (file: string): boolean => fs.existsSync(abs(file));

/** Every source file under `dir` (repo-relative), skipping node_modules and build output. */
export function listFiles(dir: string, re: RegExp = /\.(ts|tsx|mts)$/): string[] {
  const root = abs(dir);
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist' && e.name !== 'dist-web') walk(p); } else if (re.test(e.name)) out.push(rel(p));
    }
  };
  walk(root);
  return out.sort();
}

// ---------------------------------------------------------------------------------------------------------------------
// helpers for the rule tests

/** Parsed edges of one repo-relative file (cached). */
export const infoOf = (file: string): FileInfo => parseFile(abs(file));

/**
 * The package a repo-relative file belongs to: `packages/<name>` -> `<name>`, `src/...` -> `src`, `data/...` -> `data`. The GoReview app
 * (packages/goreview/app, the shell that was packages/gopractice until 2026-10-28) is its own group, `goreview-app`, so the engine's purity
 * (packages/goreview/src imports the Repository contract and GoListen's contracts only) is still checked apart from the app.
 */
export const packageOf = (file: string): string => (file.startsWith('packages/goreview/app/') ? 'goreview-app' : file.startsWith('packages/') ? file.split('/')[1] : file.split('/')[0]);

/**
 * Identifiers and string-literal texts of a TypeScript file, comments excluded. Used for pattern rules ("no Kindle
 * code") so that a sentence in a comment is not mistaken for code, and a refusal list is still seen as code.
 */
export function codeStrings(file: string): string[] {
  if (!/\.(ts|tsx|mts)$/.test(file)) return [];
  const sf = ts.createSourceFile(file, readText(file), ts.ScriptTarget.ES2023, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) out.push(n.text);
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text);
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) out.push(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** The union of every file reached from the given entries (full graph). */
export function unionOf(entries: readonly string[]): Set<string> {
  const u = new Set<string>();
  for (const e of entries) for (const f of reach(e).files) u.add(f);
  return u;
}

/** Edges from a file outside `isForbidden` into a file inside it, among the reached files of `r`. */
export function boundaryEdges(r: Reach, isForbidden: (file: string) => boolean): Array<{ from: string; to: string; typeOnly: boolean }> {
  const out: Array<{ from: string; to: string; typeOnly: boolean }> = [];
  for (const f of r.files) {
    if (isForbidden(f)) continue;
    for (const e of infoOf(f).edges) if (e.to && isForbidden(e.to)) out.push({ from: f, to: e.to, typeOnly: e.typeOnly });
  }
  return out;
}

export const isForbiddenLegacy = (f: string): boolean =>
  LEGACY_FORBIDDEN.some((x) => underPrefix(f, x.prefix)) || RETIRED_DATA.some((x) => underPrefix(f, x.prefix));

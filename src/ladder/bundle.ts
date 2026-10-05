/**
 * The committed ladders as the BROWSER sees them (docs/LADDER.md). `types.ts` is the Node-side loader (it reads files); this
 * module is the same reading done over what Vite bundles: `data/ladder/<lang>/ladder.json`, the unit documents under
 * `data/ladder/<lang>/units/`, and — for a unit whose `document` points elsewhere (e.g. "../../corpus/sq/udha-0-01.json", a
 * text already in the bundled corpus) — the bundled corpus document at that path. No fs, no Node.
 *
 *   bundledLadder(lang)         the ordered units, each with its text id (`ids.text(lang, doc.id)` for controlled / adapted,
 *                               the unit's own `textId` for authentic) and its document when one is bundled
 *   ladderUnitDocuments(lang)   the documents that live under `data/ladder/<lang>/units/` — what the bundled import adds to
 *                               the language's corpus. In-place references are NOT in this list: the corpus import has them.
 *
 * Both take an injectable `LadderSource` (tests build a synthetic ladder with `makeLadderSource`); the default is the real glob.
 * Nothing throws: a malformed ladder file is skipped (the Node gate reports it), an unreadable unit is returned without a text id.
 */
import { ids } from '../core';
import type { LanguageCode } from '../core';
import type { CorpusDocument } from '../ingest/format';
import type { LadderKind, LadderStage, LadderUnit } from './types';

/** The stages in ladder order (same list as `LADDER_STAGES` in types.ts, which cannot be imported here: that module reads files). */
export const BUNDLED_STAGES: readonly LadderStage[] = ['a1-1', 'a1-2', 'a2-1', 'a2-2', 'b1-bridge'];

/** What is bundled, by repository-relative path ("data/ladder/sq/ladder.json"). A `null` is a document the rights gate removed. */
export interface LadderSource {
  /** `data/ladder/<lang>/ladder.json` */
  ladders: Record<string, unknown>;
  /** `data/ladder/<lang>/units/*.json` */
  units: Record<string, unknown>;
  /** `data/corpus/**\/*.json` (in-place references point here) */
  corpus: Record<string, unknown>;
}

export interface BundledUnit {
  /** The unit as written in ladder.json. */
  unit: LadderUnit;
  /** Position in the ladder (0-based). */
  index: number;
  /** The Text id the learner reads it under; undefined when the unit's document is not in the bundle. */
  textId?: string;
  /** The bundled document (controlled / adapted; an authentic unit has none here — its text is in the corpus or the library). */
  doc?: CorpusDocument;
  /** True when the document is a corpus document referenced in place (so the bundled corpus import already has it). */
  inPlace: boolean;
  /** Why the unit has no text id, in plain words (the page says it; the gate reports it for the author). */
  problem?: string;
}

export interface BundledLadder {
  lang: LanguageCode;
  version: number;
  after?: 'stage0';
  units: BundledUnit[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Normalises a glob key ("../../data/ladder/sq/ladder.json", "/data/ladder/sq/ladder.json") to "data/…". */
export function repoPath(key: string): string {
  const i = key.indexOf('data/');
  return i >= 0 ? key.slice(i).replace(/\\/g, '/') : key.replace(/\\/g, '/');
}

/** Resolves `rel` against a repository-relative directory ("data/ladder/sq" + "../../corpus/sq/x.json" = "data/corpus/sq/x.json"). */
export function resolveRepoPath(dir: string, rel: string): string | undefined {
  if (rel.startsWith('/') || /^[a-zA-Z]:/.test(rel)) return undefined;
  const out: string[] = [];
  for (const part of `${dir}/${rel}`.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') { if (out.length === 0) return undefined; out.pop(); } else out.push(part);
  }
  return out.join('/');
}

const looksLikeDocument = (v: unknown): v is CorpusDocument => isObj(v) && Array.isArray(v.sections) && isStr(v.id) && isStr(v.lang);

function byPath(modules: Record<string, unknown>): Map<string, unknown> {
  const m = new Map<string, unknown>();
  for (const k of Object.keys(modules)) m.set(repoPath(k), modules[k]);
  return m;
}

let realSource: LadderSource | undefined;
/** The real bundle: Vite replaces these `import.meta.glob` calls at build time. Read once. */
export function defaultLadderSource(): LadderSource {
  return realSource ??= {
    ladders: import.meta.glob('../../data/ladder/*/ladder.json', { eager: true, import: 'default' }) as Record<string, unknown>,
    units: import.meta.glob('../../data/ladder/*/units/*.json', { eager: true, import: 'default' }) as Record<string, unknown>,
    corpus: import.meta.glob('../../data/corpus/**/*.json', { eager: true, import: 'default' }) as Record<string, unknown>,
  };
}

/** A `LadderSource` from plain objects keyed by repository-relative path (tests). */
export function makeLadderSource(parts: Partial<LadderSource> = {}): LadderSource {
  return { ladders: parts.ladders ?? {}, units: parts.units ?? {}, corpus: parts.corpus ?? {} };
}

/** Languages that have a bundled ladder, sorted. */
export function bundledLadderLanguages(source: LadderSource = defaultLadderSource()): LanguageCode[] {
  const out: LanguageCode[] = [];
  for (const k of byPath(source.ladders).keys()) {
    const m = /^data\/ladder\/([^/]+)\/ladder\.json$/.exec(k);
    if (m) out.push(m[1] as LanguageCode);
  }
  return out.sort();
}

/** The ordered units of a language's bundled ladder, with their text ids. undefined when the language has no (readable) ladder. */
export function bundledLadder(lang: LanguageCode, source: LadderSource = defaultLadderSource()): BundledLadder | undefined {
  const dir = `data/ladder/${lang}`;
  const raw = byPath(source.ladders).get(`${dir}/ladder.json`);
  if (!isObj(raw) || raw.lang !== lang || !Array.isArray(raw.units)) return undefined;
  const units = byPath(source.units);
  const corpus = byPath(source.corpus);
  const seen = new Set<string>();
  const out: BundledUnit[] = [];
  for (const u of raw.units) {
    if (!isObj(u) || !isStr(u.id) || seen.has(u.id)) continue; // a malformed ladder is the Node gate's to report; the learner sees what is sound
    seen.add(u.id);
    const unit = u as unknown as LadderUnit;
    const index = out.length;
    const kind = unit.kind as LadderKind;
    if (kind === 'authentic') {
      out.push(isStr(unit.textId)
        ? { unit, index, textId: unit.textId, inPlace: false }
        : { unit, index, inPlace: false, problem: 'the unit names no text' });
      continue;
    }
    if (!isStr(unit.document)) { out.push({ unit, index, inPlace: false, problem: 'the unit names no document' }); continue; }
    const path = resolveRepoPath(dir, unit.document);
    if (!path) { out.push({ unit, index, inPlace: false, problem: `document path "${unit.document}" leaves the repository` }); continue; }
    const inUnits = path.startsWith(`${dir}/units/`);
    const found = inUnits ? units.get(path) : corpus.get(path);
    if (looksLikeDocument(found) && found.lang === lang) {
      out.push({ unit, index, doc: found, textId: ids.text(lang, found.id), inPlace: !inUnits });
    } else {
      out.push({ unit, index, inPlace: !inUnits, problem: found === null ? 'this text is not in the bundle (its rights are not cleared)' : `document not bundled: ${path}` });
    }
  }
  return { lang, version: typeof raw.version === 'number' ? raw.version : 1, ...(raw.after === 'stage0' ? { after: 'stage0' as const } : {}), units: out };
}

/**
 * The unit documents of a language that sit under `data/ladder/<lang>/units/` — what the bundled import adds to the language's
 * corpus. Sorted by path; a null (removed) or malformed entry is dropped; a document already in `corpusDocs` (same id) is not
 * returned twice. In-place references are never here.
 */
export function ladderUnitDocuments(lang: LanguageCode, source: LadderSource = defaultLadderSource(), corpusDocs: readonly CorpusDocument[] = []): CorpusDocument[] {
  const have = new Set(corpusDocs.filter((d) => d.lang === lang).map((d) => d.id));
  const prefix = `data/ladder/${lang}/units/`;
  const entries = [...byPath(source.units).entries()].filter(([k]) => k.startsWith(prefix)).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const docs: CorpusDocument[] = [];
  for (const [, v] of entries) {
    if (!looksLikeDocument(v) || v.lang !== lang || have.has(v.id)) continue;
    have.add(v.id);
    docs.push(v);
  }
  return docs;
}

/** Running words of a bundled document (whitespace-separated, punctuation-only pieces ignored): "about N words" for the learner. */
export function documentWords(doc: CorpusDocument): number {
  let n = 0;
  const count = (t: unknown) => { if (typeof t === 'string') n += t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length; };
  for (const sec of doc.sections ?? []) {
    for (const p of sec.paragraphs ?? []) {
      const par = p as { sentences?: Array<{ text?: unknown }>; text?: unknown };
      if (Array.isArray(par.sentences)) par.sentences.forEach((s) => count(s?.text)); else count(par.text);
    }
  }
  return n;
}

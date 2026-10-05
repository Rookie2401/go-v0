/// <reference types="node" />
/**
 * The ladder data model and its loader (docs/LADDER.md, "Data"). Node only: it reads `data/ladder/<lang>/ladder.json`,
 * the controlled / adapted unit documents it names (a path relative to the ladder folder, which may point outside `units/`
 * but never outside the repository root), the authentic units' texts from the bundled corpus or the built library
 * (`public/library/<lang>`), and Stage 0's scenes from `data/stage0/<lang>/` as the head of the ladder.
 *
 * Nothing here throws for a missing text: a unit that cannot be read is returned with a `status` and a `problem`, and the
 * gate turns that into a finding (a warning for an authentic text the library does not hold, an error for a controlled one).
 * Only a ladder file that is itself malformed throws (`LadderFormatError`).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { LanguageCode } from '../core';
import { ids } from '../core';
import { loadBundledCorpus } from '../ingest';
import type { CorpusDocument } from '../ingest';
import { documentPathOf } from '../library/format';
import { packsFrom } from '../stage0/content';
import { sceneDocument } from '../stage0/documents';

export const LADDER_STAGES = ['a1-1', 'a1-2', 'a2-1', 'a2-2', 'b1-bridge'] as const;
export type LadderStage = (typeof LADDER_STAGES)[number];
export const LADDER_KINDS = ['controlled', 'adapted', 'authentic'] as const;
export type LadderKind = (typeof LADDER_KINDS)[number];

export interface LadderUnit {
  id: string;
  stage: LadderStage;
  kind: LadderKind;
  /** controlled / adapted: path to the import document, relative to `data/ladder/<lang>/` (e.g. "units/es-a1-1-01.json"). */
  document?: string;
  /** authentic: the library text placed as it is (e.g. "text:es:palma-tradiciones-peruanas-ch04"). */
  textId?: string;
  domain: string;
  title?: string;
}

export interface Ladder {
  lang: LanguageCode;
  version: number;
  /** "stage0" makes Stage 0's path the head of the ladder: its scenes count as the first texts read. */
  after?: 'stage0';
  units: LadderUnit[];
}

export type UnitStatus = 'ok' | 'missing' | 'invalid';

export interface LoadedUnit {
  unit: LadderUnit;
  doc?: CorpusDocument;
  status: UnitStatus;
  /** Why the text could not be read (status "missing" or "invalid"). */
  problem?: string;
}

export interface HeadText {
  id: string;
  title: string;
  doc: CorpusDocument;
}

export interface LoadedLadder {
  ladder: Ladder;
  /** Stage 0's scenes in path order, a review step counted as a re-reading of its scene. Empty unless `after` is "stage0". */
  head: HeadText[];
  units: LoadedUnit[];
}

export class LadderFormatError extends Error {
  constructor(readonly problems: string[]) {
    super(`malformed ladder file: ${problems.join('; ')}`);
    this.name = 'LadderFormatError';
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

export const ladderDir = (lang: LanguageCode, root: string): string => path.join(root, 'data', 'ladder', lang);
export const ladderFile = (lang: LanguageCode, root: string): string => path.join(ladderDir(lang, root), 'ladder.json');
export const libraryDir = (lang: LanguageCode, root: string): string => path.join(root, 'public', 'library', lang);

/** Languages that have a committed `data/ladder/<lang>/ladder.json`, sorted. */
export function ladderLanguages(root: string): LanguageCode[] {
  const base = path.join(root, 'data', 'ladder');
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(base, d.name, 'ladder.json')))
    .map((d) => d.name as LanguageCode)
    .sort();
}

/** Validates the shape of a ladder file. Throws `LadderFormatError` listing every problem. */
export function parseLadder(raw: unknown, lang: LanguageCode): Ladder {
  const problems: string[] = [];
  if (!isObj(raw)) throw new LadderFormatError(['the file is not a JSON object']);
  if (raw.lang !== lang) problems.push(`lang is "${String(raw.lang)}", expected "${lang}"`);
  if (typeof raw.version !== 'number') problems.push('version must be a number');
  if (raw.after !== undefined && raw.after !== 'stage0') problems.push('after, when given, must be "stage0"');
  const units: LadderUnit[] = [];
  if (!Array.isArray(raw.units)) problems.push('units must be an array');
  else {
    const seen = new Set<string>();
    raw.units.forEach((u, i) => {
      const where = `units[${i}]${isObj(u) && isStr(u.id) ? ` (${u.id})` : ''}`;
      if (!isObj(u)) { problems.push(`${where}: not an object`); return; }
      if (!isStr(u.id)) problems.push(`${where}: id is required`);
      else if (seen.has(u.id)) problems.push(`${where}: duplicate unit id`);
      else seen.add(u.id);
      if (!(LADDER_STAGES as readonly unknown[]).includes(u.stage)) problems.push(`${where}: stage must be one of ${LADDER_STAGES.join(', ')}`);
      if (!(LADDER_KINDS as readonly unknown[]).includes(u.kind)) problems.push(`${where}: kind must be one of ${LADDER_KINDS.join(', ')}`);
      if (!isStr(u.domain)) problems.push(`${where}: domain is required`);
      if (u.kind === 'authentic' && !isStr(u.textId)) problems.push(`${where}: an authentic unit needs a textId`);
      if ((u.kind === 'controlled' || u.kind === 'adapted') && !isStr(u.document)) problems.push(`${where}: a ${String(u.kind)} unit needs a document path`);
      if (u.title !== undefined && typeof u.title !== 'string') problems.push(`${where}: title must be a string`);
      units.push(u as unknown as LadderUnit);
    });
  }
  if (problems.length) throw new LadderFormatError(problems);
  return { lang, version: raw.version as number, ...(raw.after ? { after: 'stage0' as const } : {}), units };
}

const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf8'));

const looksLikeDocument = (v: unknown): v is CorpusDocument => isObj(v) && Array.isArray(v.sections);

/** True when `abs` lies inside `root` (or is it). */
export function isInside(root: string, abs: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(abs));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export interface TextLookup {
  doc?: CorpusDocument;
  status: UnitStatus;
  problem?: string;
}

/** Lazily-loaded bundled corpus, keyed by text id (the whole bundle is only read when an authentic unit asks for it). */
let bundledIndex: Map<string, CorpusDocument> | undefined;
function bundledDoc(lang: LanguageCode, textId: string): CorpusDocument | undefined {
  if (!bundledIndex) {
    bundledIndex = new Map();
    for (const d of loadBundledCorpus()) bundledIndex.set(ids.text(d.lang, d.id), d);
  }
  const d = bundledIndex.get(textId);
  return d && d.lang === lang ? d : undefined;
}

/** Finds a text by id: the bundled corpus first, then the built library. Never throws for an absent text or library. */
export function resolveTextDocument(lang: LanguageCode, root: string, textId: string): TextLookup {
  if (!textId.startsWith(`text:${lang}:`)) return { status: 'invalid', problem: `text id "${textId}" is not a ${lang} text id (text:${lang}:…)` };
  const bundled = bundledDoc(lang, textId);
  if (bundled) return { status: 'ok', doc: bundled };
  const lib = libraryDir(lang, root);
  if (!fs.existsSync(path.join(lib, 'manifest.json'))) return { status: 'missing', problem: `not in the bundled corpus, and the built library is absent (${path.relative(root, lib) || lib})` };
  const file = path.join(lib, documentPathOf(textId));
  if (!fs.existsSync(file)) return { status: 'missing', problem: 'not in the bundled corpus or the built library' };
  try {
    const raw = readJson(file);
    if (!looksLikeDocument(raw)) return { status: 'invalid', problem: `${documentPathOf(textId)} is not a corpus document` };
    return { status: 'ok', doc: raw };
  } catch (e) {
    return { status: 'invalid', problem: `${documentPathOf(textId)}: ${(e as Error).message}` };
  }
}

/** Reads a controlled / adapted unit's document: relative to the ladder folder, never outside the repository root. */
export function resolveUnitDocument(lang: LanguageCode, root: string, rel: string): TextLookup {
  if (path.isAbsolute(rel)) return { status: 'invalid', problem: `document path "${rel}" must be relative to data/ladder/${lang}/` };
  const abs = path.resolve(ladderDir(lang, root), rel);
  if (!isInside(root, abs)) return { status: 'invalid', problem: `document path "${rel}" leaves the repository root` };
  if (!fs.existsSync(abs)) return { status: 'missing', problem: `document not found: ${rel}` };
  try {
    const raw = readJson(abs);
    if (!looksLikeDocument(raw)) return { status: 'invalid', problem: `${rel} is not a corpus document (no sections)` };
    if (raw.lang !== lang) return { status: 'invalid', problem: `${rel} is a "${String(raw.lang)}" document in a ${lang} ladder` };
    return { status: 'ok', doc: raw };
  } catch (e) {
    return { status: 'invalid', problem: `${rel}: ${(e as Error).message}` };
  }
}

/** Stage 0's scenes as documents, in path order, each once (the probe's and `src/stage0/documents.ts`' reading of them). */
export function loadStage0Head(lang: LanguageCode, root: string): HeadText[] {
  const dir = path.join(root, 'data', 'stage0');
  const modules: Record<string, unknown> = {};
  const put = (rel: string): void => {
    const file = path.join(dir, rel);
    if (fs.existsSync(file)) modules[`data/stage0/${rel.replace(/\\/g, '/')}`] = readJson(file);
  };
  put('world.json');
  put(`${lang}/path.json`);
  const scenes = path.join(dir, lang, 'scenes');
  if (fs.existsSync(scenes)) for (const f of fs.readdirSync(scenes).filter((n) => n.endsWith('.json')).sort()) put(`${lang}/scenes/${f}`);
  const { world, packs } = packsFrom(modules);
  const pack = packs.get(lang);
  if (!pack) return [];
  // a review step shows its scene again, so the learner meets its words again: it counts as a re-reading
  const head: HeadText[] = [];
  for (const step of pack.path.steps) {
    if ((step.kind !== 'scene' && step.kind !== 'review') || !step.ref) continue;
    const scene = pack.scenes.get(step.ref);
    if (!scene) continue;
    const review = step.kind === 'review';
    head.push({ id: `stage0:${scene.id}${review ? `:review-${step.id}` : ''}`, title: `${scene.title.en}${review ? ' (review)' : ''}`, doc: sceneDocument(scene, world) });
  }
  return head;
}

/** Loads `data/ladder/<lang>/ladder.json` with every unit's text. Throws `LadderFormatError` only for a malformed ladder file. */
export function loadLadder(lang: LanguageCode, root: string): LoadedLadder {
  const file = ladderFile(lang, root);
  if (!fs.existsSync(file)) throw new LadderFormatError([`no ladder file at ${path.relative(root, file)}`]);
  let raw: unknown;
  try { raw = readJson(file); } catch (e) { throw new LadderFormatError([`${path.relative(root, file)}: ${(e as Error).message}`]); }
  const ladder = parseLadder(raw, lang);
  const units: LoadedUnit[] = ladder.units.map((unit) => {
    const found = unit.kind === 'authentic' ? resolveTextDocument(lang, root, unit.textId!) : resolveUnitDocument(lang, root, unit.document!);
    return { unit, status: found.status, ...(found.doc ? { doc: found.doc } : {}), ...(found.problem ? { problem: found.problem } : {}) };
  });
  return { ladder, head: ladder.after === 'stage0' ? loadStage0Head(lang, root) : [], units };
}

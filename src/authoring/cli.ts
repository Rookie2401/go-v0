/// <reference types="node" />
/**
 * Shared helpers of the two authoring scripts (argument reading, the stage table of a course). Node only.
 */
import fs from 'node:fs';
import { stageOfFromMap, stageOfFromWorks, type StageOf } from './select';

export interface Args { flags: Record<string, string>; rest: string[] }

/** `--name value` pairs; a lone `--` is ignored (so `vite-node script -- --lang es` works). */
export function parseArgs(argv: readonly string[]): Args {
  const flags: Record<string, string> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') continue;
    if (a.startsWith('--')) { flags[a.slice(2)] = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : ''; } else rest.push(a);
  }
  return { flags, rest };
}

/** Where each language's course works live; imported lazily so a missing or empty module never stops the script. */
export const COURSE_MODULES: Record<string, { module: string; exportName: string }> = {
  sq: { module: 'albanian', exportName: 'ALBANIAN_WORKS' },
  es: { module: 'spanish', exportName: 'SPANISH_WORKS' },
  de: { module: 'german', exportName: 'GERMAN_WORKS' },
  nb: { module: 'norwegian', exportName: 'NORWEGIAN_WORKS' },
};

/** The stage function from the course catalogue of `lang`; undefined stages everywhere when the module or its works are absent. */
export async function catalogueStageOf(lang: string): Promise<{ stageOf: StageOf; works: number; note?: string }> {
  const entry = COURSE_MODULES[lang];
  if (!entry) return { stageOf: () => undefined, works: 0, note: `no course table for language "${lang}"` };
  try {
    const spec = `../course/${entry.module}`;
    const mod = (await import(/* @vite-ignore */ spec)) as Record<string, unknown>;
    const works = mod[entry.exportName];
    if (!Array.isArray(works) || works.length === 0) return { stageOf: () => undefined, works: 0, note: `${entry.exportName} is missing or empty` };
    return { stageOf: stageOfFromWorks(works as Array<{ id: string; stageId: string }>), works: works.length };
  } catch (e) {
    return { stageOf: () => undefined, works: 0, note: `course module "${entry.module}" could not be loaded (${e instanceof Error ? e.message.split('\n')[0] : String(e)})` };
  }
}

/** `--stages`: a JSON file path or an inline JSON map slug → stage. */
export function readStagesArg(arg: string): Record<string, string> {
  const text = arg.trim().startsWith('{') ? arg : fs.readFileSync(arg, 'utf8');
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('--stages must be a JSON object mapping work slug to stage key');
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) if (!k.startsWith('_')) out[k] = String(v);
  return out;
}

/** The stage function the scripts use: `--stages` when given (slugs it does not list fall back to the catalogue), else the catalogue. */
export async function resolveStageOf(lang: string, stagesArg: string | undefined): Promise<{ stageOf: StageOf; note?: string }> {
  const cat = await catalogueStageOf(lang);
  if (stagesArg) return { stageOf: stageOfFromMap(readStagesArg(stagesArg), cat.stageOf), note: cat.note };
  return { stageOf: cat.stageOf, note: cat.note };
}

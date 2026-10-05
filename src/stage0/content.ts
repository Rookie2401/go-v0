/**
 * Stage 0 content packs, one per language, read from data/stage0/<lang>/:
 *   path.json        the ordered steps and the GoLearn texts that follow
 *   coverage.json    the hidden construction / grammar / sound map
 *   scenes/*.json    micro-scenes
 *   sounds/*.json    sound & script steps (always through real words)
 *   exit/*.json      unseen exit forms
 * plus data/stage0/world.json (the shared cast). Authors add files; no application code changes.
 */
import type { LanguageCode, Stage0CoverageEntry, Stage0ExitForm, Stage0Path, Stage0Scene, Stage0SoundStep } from '../core';

export interface Stage0World {
  version: number;
  characters: Array<{ id: string; role: string; names: Partial<Record<LanguageCode, string>> }>;
  places: Array<{ id: string; gloss: string }>;
  things: Array<{ id: string; gloss: string; picture?: string }>;
  arc: string[];
}

export interface Stage0Pack {
  lang: LanguageCode;
  path: Stage0Path;
  coverage: Stage0CoverageEntry[];
  scenes: Map<string, Stage0Scene>;
  sounds: Map<string, Stage0SoundStep>;
  exits: Map<string, Stage0ExitForm>;
  /** Where each item came from (for validation messages). */
  files: Map<string, string>;
  /** Ids defined in more than one file (the later file is ignored; the validator reports it). */
  duplicates: Array<{ id: string; file: string; first: string }>;
}

type Raw = Record<string, unknown>;

export function packsFrom(modules: Record<string, unknown>): { world?: Stage0World; packs: Map<LanguageCode, Stage0Pack> } {
  const packs = new Map<LanguageCode, Stage0Pack>();
  let world: Stage0World | undefined;
  const pack = (lang: LanguageCode): Stage0Pack => {
    let p = packs.get(lang);
    if (!p) {
      p = { lang, path: { lang, version: 0, steps: [], next: [] }, coverage: [], scenes: new Map(), sounds: new Map(), exits: new Map(), files: new Map(), duplicates: [] };
      packs.set(lang, p);
    }
    return p;
  };
  for (const key of Object.keys(modules).sort()) {
    const data = modules[key] as Raw | null;
    if (!data) continue;
    const m = /data\/stage0\/(?:([a-z]{2})\/)?(.*)\.json$/.exec(key.replace(/\\/g, '/'));
    if (!m) continue;
    const [, lang, rest] = m;
    if (!lang) { if (rest === 'world') world = data as unknown as Stage0World; continue; }
    const p = pack(lang as LanguageCode);
    if (rest === 'path') p.path = data as unknown as Stage0Path;
    else if (rest === 'coverage') p.coverage = (data as { entries?: Stage0CoverageEntry[] }).entries ?? [];
    else if (rest.startsWith('scenes/') || rest.startsWith('sounds/') || rest.startsWith('exit/')) {
      const item = data as unknown as { id: string };
      const first = p.files.get(item.id);
      if (first) { p.duplicates.push({ id: item.id, file: key, first }); continue; }
      p.files.set(item.id, key);
      if (rest.startsWith('scenes/')) p.scenes.set(item.id, data as unknown as Stage0Scene);
      else if (rest.startsWith('sounds/')) p.sounds.set(item.id, data as unknown as Stage0SoundStep);
      else p.exits.set(item.id, data as unknown as Stage0ExitForm);
    }
  }
  return { world, packs };
}

let bundled: ReturnType<typeof packsFrom> | undefined;

/** The packs bundled with the app (Vite import.meta.glob; works in the browser, vitest and vite-node). */
export function bundledStage0(): ReturnType<typeof packsFrom> {
  bundled ??= packsFrom(import.meta.glob('../../data/stage0/**/*.json', { eager: true, import: 'default' }));
  return bundled;
}

/** Title of any step (for lists). */
export function stepTitle(pack: Stage0Pack, step: { kind: string; ref?: string; channel?: string }): string {
  if (step.kind === 'exit') return 'Ready for real texts? (the Stage 0 check)';
  const ref = step.ref ?? '';
  const scene = pack.scenes.get(ref);
  if (scene) return step.kind === 'review' ? `Again, by ear: ${scene.title.en}` : scene.title.en;
  const sound = pack.sounds.get(ref);
  if (sound) return sound.title.en;
  return ref;
}

/** Character name in a language (falls back to the id). */
export function characterName(world: Stage0World | undefined, id: string, lang: LanguageCode): string {
  return world?.characters.find((c) => c.id === id)?.names[lang] ?? id;
}

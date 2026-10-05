/**
 * Expected coverage along the intended path: for each step, how much of its language a learner who followed the path
 * from the start has already met (earlier on the path, or earlier in the same scene), which words are new, and whether
 * the scene declared them. Words are compared by lemma
 * when the adapter reads one, else by form; the cast's names are given, not counted as new. This is a curriculum-level
 * estimate — the learner's own state (GoLearn) gives the personal one (service.overview).
 */
import type { LanguageAdapter, LanguageCode, Stage0ExitForm, Stage0Line } from '../core';
import type { Stage0Pack, Stage0World } from './content';
import { wordsOf } from './features';

export interface StepCoverage {
  stepId: string;
  ref?: string;
  kind: string;
  /** Position among scene steps (0-based) — the bands are per scene. */
  sceneIndex?: number;
  tokens: number;
  known: number;
  coverage: number;
  newItems: string[];
  /** New items the scene did not list in `introduces.words`. */
  undeclared: string[];
}

const NUMERIC = /^\p{N}+$/u;

export function itemKey(w: { lemma?: string; normalized: string }): string {
  return (w.lemma ?? w.normalized).normalize('NFC').toLowerCase();
}

export function nameKeys(world: Stage0World | undefined, lang: LanguageCode): Set<string> {
  return new Set((world?.characters ?? []).map((c) => (c.names[lang] ?? '').normalize('NFC').toLowerCase()).filter(Boolean));
}

function lineItems(adapter: LanguageAdapter, lang: LanguageCode, lines: Array<Pick<Stage0Line, 'text'>>, names: Set<string>) {
  const out: string[] = [];
  for (const l of lines) for (const w of wordsOf(adapter, lang, l.text)) {
    const k = itemKey(w);
    if (names.has(w.normalized.toLowerCase()) || names.has(k) || NUMERIC.test(w.normalized)) continue;
    out.push(k);
  }
  return out;
}

/** The items met along the whole path (scenes and sound words), for exit forms. */
export function pathItems(pack: Stage0Pack, adapter: LanguageAdapter, world?: Stage0World): Set<string> {
  const names = nameKeys(world, pack.lang);
  const known = new Set<string>();
  for (const s of pack.path.steps) {
    const scene = s.ref ? pack.scenes.get(s.ref) : undefined;
    if (scene) lineItems(adapter, pack.lang, scene.lines, names).forEach((k) => known.add(k));
    const sound = s.ref ? pack.sounds.get(s.ref) : undefined;
    if (sound) lineItems(adapter, pack.lang, sound.words, names).forEach((k) => known.add(k));
  }
  return known;
}

export function pathCoverage(pack: Stage0Pack, adapter: LanguageAdapter, world?: Stage0World): StepCoverage[] {
  const names = nameKeys(world, pack.lang);
  const known = new Set<string>();
  const out: StepCoverage[] = [];
  let sceneIndex = 0;
  for (const step of pack.path.steps) {
    const scene = step.kind === 'scene' && step.ref ? pack.scenes.get(step.ref) : undefined;
    const sound = step.kind === 'sounds' && step.ref ? pack.sounds.get(step.ref) : undefined;
    if (!scene && !sound) { out.push({ stepId: step.id, ...(step.ref ? { ref: step.ref } : {}), kind: step.kind, tokens: 0, known: 0, coverage: 1, newItems: [], undeclared: [] }); continue; }
    const items = lineItems(adapter, pack.lang, scene ? scene.lines : sound!.words, names);
    const fresh = [...new Set(items.filter((k) => !known.has(k)))];
    // a token counts as met when its word came earlier on the path OR earlier in this scene (the reader has just met it)
    const running = new Set(known);
    let knownTokens = 0;
    for (const k of items) { if (running.has(k)) knownTokens++; else running.add(k); }
    let undeclared: string[] = [];
    if (scene) {
      const declared = new Set(scene.introduces.words.flatMap((w) => [w.normalize('NFC').toLowerCase(), ...wordsOf(adapter, pack.lang, w).map(itemKey)]));
      undeclared = fresh.filter((k) => !declared.has(k));
    }
    out.push({
      stepId: step.id, ref: step.ref, kind: step.kind, ...(scene ? { sceneIndex: sceneIndex++ } : {}),
      tokens: items.length, known: knownTokens, coverage: items.length ? knownTokens / items.length : 1, newItems: fresh, undeclared,
    });
    items.forEach((k) => known.add(k));
  }
  return out;
}

export function exitCoverage(pack: Stage0Pack, adapter: LanguageAdapter, world: Stage0World | undefined, form: Stage0ExitForm): { coverage: number; unknown: string[] } {
  const known = pathItems(pack, adapter, world);
  const names = nameKeys(world, pack.lang);
  const items = lineItems(adapter, pack.lang, [...form.reading.lines, ...form.listening.lines], names);
  const unknown = [...new Set(items.filter((k) => !known.has(k)))];
  return { coverage: items.length ? items.filter((k) => known.has(k)).length / items.length : 1, unknown };
}

/**
 * The Alphabet Sprint profiles, one module per language, each loaded the first time it is needed (a bundler makes each a chunk of its
 * own, so no app carries every language's word list). A language read in two traditions (Greek) has two profiles; the learner's variety
 * chooses one (profileForVariety).
 */
import type { ScriptProfile } from '../types';

export const SPRINT_LANGUAGES = ['es', 'sq', 'de', 'nb', 'nn', 'la', 'el', 'he', 'arc', 'th', 'hi', 'ru', 'fr', 'ko'] as const;

const ALIASES: Readonly<Record<string, string>> = { no: 'nb', nob: 'nb', nno: 'nn', grc: 'el', hbo: 'he' };

const LOADERS: Readonly<Record<string, () => Promise<ScriptProfile[]>>> = {
  es: () => import('./es').then((m) => [m.ES_PROFILE]),
  sq: () => import('./sq').then((m) => [m.SQ_PROFILE]),
  de: () => import('./de').then((m) => [m.DE_PROFILE]),
  nb: () => import('./nb').then((m) => [m.NB_PROFILE]),
  nn: () => import('./nn').then((m) => [m.NN_PROFILE]),
  la: () => import('./la').then((m) => [m.LA_PROFILE]),
  el: () => import('./el').then((m) => [m.EL_PROFILE, m.EL_CLASSICAL_PROFILE]),
  he: () => import('./he').then((m) => [m.HE_PROFILE]),
  arc: () => import('./arc').then((m) => [m.ARC_PROFILE]),
  th: () => import('./th').then((m) => [m.TH_PROFILE]),
  hi: () => import('./hi').then((m) => [m.HI_PROFILE]),
  ru: () => import('./ru').then((m) => [m.RU_PROFILE]),
  fr: () => import('./fr').then((m) => [m.FR_PROFILE]),
  ko: () => import('./ko').then((m) => [m.KO_PROFILE]),
};

/** The Sprint language of a language id (`el-koi` → el, `no` → nb), or undefined when none has a profile. */
export function sprintLanguageOf(languageId: string): string | undefined {
  const base = languageId.split('-')[0].toLowerCase();
  const lang = ALIASES[base] ?? base;
  return Object.prototype.hasOwnProperty.call(LOADERS, lang) ? lang : undefined;
}

const cache = new Map<string, Promise<ScriptProfile[]>>();

/** The profiles of a language (empty for a language with none). A failed load is not remembered: the next call tries again. */
export function loadSprintProfiles(languageId: string): Promise<ScriptProfile[]> {
  const lang = sprintLanguageOf(languageId);
  if (!lang) return Promise.resolve([]);
  let job = cache.get(lang);
  if (!job) {
    job = LOADERS[lang]().catch((e: unknown) => { cache.delete(lang); throw e; });
    cache.set(lang, job);
  }
  return job;
}

/** The profile a variety reads with: the one whose tradition lists the variety, else the default (first) profile. */
export function profileForVariety(profiles: readonly ScriptProfile[], varietyId?: string): ScriptProfile | undefined {
  if (!profiles.length) return undefined;
  return (varietyId ? profiles.find((p) => p.tradition?.varieties.includes(varietyId)) : undefined) ?? profiles[0];
}

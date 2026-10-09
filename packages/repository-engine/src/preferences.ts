/**
 * Assistance preferences (§9): defaults, explicit PreferenceChanged events, and cautious inference from behaviour.
 * Preferences are never proficiency. An explicit value is never overwritten by inference; an inferred value always
 * carries the evidence it rests on and is replaced the moment the learner states a preference.
 */
import type { AssistancePreferences, GoEvent, Preference } from '../../repository-contract/src';
import { compareAt, dedupeEvents } from './projection';

/** Inference thresholds (documented in README). */
export const INFERENCE_MIN = 3;

export const DEFAULT_PREFERENCES = {
  explanationDepth: 'brief',
  terminology: 'plain',
  transliteration: 'on-request',
  pronunciationFirst: false,
  translationAvailable: true,
  visualAssistance: 'standard',
  accessibility: [] as string[],
} as const;

const ALLOWED: Record<string, (v: unknown) => boolean> = {
  explanationDepth: (v) => v === 'label' || v === 'brief' || v === 'explanatory',
  terminology: (v) => v === 'plain' || v === 'grammatical',
  transliteration: (v) => v === 'always' || v === 'on-request' || v === 'never',
  pronunciationFirst: (v) => typeof v === 'boolean',
  translationAvailable: (v) => typeof v === 'boolean',
  visualAssistance: (v) => v === 'less' || v === 'standard' || v === 'more',
  accessibility: (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
};

const byAtThenId = (a: GoEvent, b: GoEvent): number => compareAt(a.at, b.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const def = <T>(value: T): Preference<T> => ({ value, origin: 'default' });

/**
 * Derives the preferences from the learner's (already tombstone-filtered) events. `languageId` restricts to one
 * language's events; without it every event of the learner counts. `nowIso` stamps `updatedAt` only when no relevant event exists.
 */
export function derivePreferences(events: GoEvent[], learnerId: string, languageId: string | undefined, nowIso: string): AssistancePreferences {
  const scoped = dedupeEvents(events).filter((e) => e.learnerId === learnerId && (languageId === undefined || e.languageId === languageId)).sort(byAtThenId);
  const prefs: AssistancePreferences = {
    learnerId,
    explanationDepth: def<'label' | 'brief' | 'explanatory'>(DEFAULT_PREFERENCES.explanationDepth),
    terminology: def<'plain' | 'grammatical'>(DEFAULT_PREFERENCES.terminology),
    transliteration: def<'always' | 'on-request' | 'never'>(DEFAULT_PREFERENCES.transliteration),
    pronunciationFirst: def<boolean>(DEFAULT_PREFERENCES.pronunciationFirst),
    translationAvailable: def<boolean>(DEFAULT_PREFERENCES.translationAvailable),
    visualAssistance: def<'less' | 'standard' | 'more'>(DEFAULT_PREFERENCES.visualAssistance),
    accessibility: def<string[]>([]),
    updatedAt: nowIso,
  };
  if (languageId !== undefined) prefs.languageId = languageId;

  // 1. Explicit: the latest valid PreferenceChanged per key wins.
  const explicit = new Set<string>();
  const slot = prefs as unknown as Record<string, Preference<unknown>>;
  for (const e of scoped) {
    if (e.kind !== 'PreferenceChanged') continue;
    const p = e.payload as { key?: unknown; value?: unknown };
    if (typeof p.key !== 'string' || !ALLOWED[p.key]?.(p.value)) continue;
    slot[p.key] = { value: p.value, origin: 'explicit' };
    explicit.add(p.key);
  }

  // 2. Inference, for keys the learner never set.
  const infer = <T>(key: string, value: T, basis: string): void => {
    if (!explicit.has(key)) slot[key] = { value, origin: 'inferred', basis };
  };
  const explanatory = scoped.filter((e) => e.kind === 'AssistanceRequested' && (e.payload as { depth?: unknown }).depth === 'explanatory').length;
  if (explanatory >= INFERENCE_MIN) infer('explanationDepth', 'explanatory', `${explanatory} requests for an explanatory layer`);
  const translit = scoped.filter((e) => e.kind === 'AssistanceRequested' && (e.payload as { assistance?: unknown }).assistance === 'transliteration').length;
  if (translit >= INFERENCE_MIN) infer('transliteration', 'always', `${translit} transliteration requests`);

  // pronunciationFirst: in a sentence, the first help event was audio. Counted per distinct sentence, not per event.
  const bySentence = new Map<string, GoEvent[]>();
  for (const e of scoped) {
    const key = e.subject?.sentenceKey;
    if (!key) continue;
    if (e.kind === 'PronunciationPlayed' || e.kind === 'SelectionLookedUp' || e.kind === 'AnalysisShown' ||
        (e.kind === 'AssistanceRequested' && (e.payload as { assistance?: unknown }).assistance !== 'pronunciation')) {
      (bySentence.get(key) ?? bySentence.set(key, []).get(key)!).push(e);
    }
  }
  let audioFirst = 0;
  for (const list of bySentence.values()) if (list[0].kind === 'PronunciationPlayed') audioFirst++; // lists are already (at,id) ordered
  if (audioFirst >= INFERENCE_MIN) infer('pronunciationFirst', true, `audio played before any gloss in ${audioFirst} sentences`);

  // updatedAt: the latest event that fed any preference.
  const relevant = scoped.filter((e) => e.kind === 'PreferenceChanged' || e.kind === 'AssistanceRequested' || e.kind === 'PronunciationPlayed' || e.kind === 'SelectionLookedUp' || e.kind === 'AnalysisShown');
  if (relevant.length) prefs.updatedAt = relevant[relevant.length - 1].at;
  return prefs;
}

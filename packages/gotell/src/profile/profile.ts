/**
 * The writer profile: what the Repository knows about this learner's PRODUCTION, read for GoTell and nothing else.
 *
 * Separation rule: reading familiarity is never production. A unit is `productive` only when contextualProduction or
 * productiveRetrieval carries evidence weight; a unit met only in reading is `recognisedOnly`.
 *
 * Goal-event convention (the learner's own writing goals, free text): a `PreferenceChanged` event whose payload is
 *   { key: 'gotell:goal', origin: 'explicit', value: { goalId: string, text: string, createdAt: string, done?: boolean } }
 * (`origin: 'explicit'` is required by the contract for every PreferenceChanged). The latest event per goalId wins, so a goal
 * is marked done by a new event with `done: true`; a goal is withdrawn by `value: { goalId, removed: true }`.
 *
 * Error-category convention: a `ProductionRecorded`, `CorrectionAccepted` or `CorrectionRejected` event may carry
 * `payload.categories: string[]` or `payload.category: string`; a category counts once per event, and recurs at two events.
 *
 * Nothing here is a level of proficiency: the `band` is a rough bucket of the productive-unit count, with its basis.
 */
import type { GoEvent, UnitKnowledge } from '../../../repository-contract/src';
import type { ProfileSource, WriterProfile, WritingGoal } from '../types';

export const GOAL_PREFERENCE_KEY = 'gotell:goal';
export const RECENT_DAYS = 14;
export const RECURRING_ERROR_MIN = 2;
export const BAND_FIRST_SENTENCES_BELOW = 10;
export const BAND_SHORT_PARAGRAPH_BELOW = 60;

const DAY_MS = 86_400_000;
const ERROR_EVENT_KINDS = new Set<string>(['ProductionRecorded', 'CorrectionAccepted', 'CorrectionRejected']);
const DEPTHS = ['label', 'brief', 'explanatory'] as const;

const weightOf = (k: UnitKnowledge, d: keyof UnitKnowledge['dimensions']): number => k.dimensions?.[d]?.weight ?? 0;

export const isProductive = (k: UnitKnowledge): boolean => weightOf(k, 'contextualProduction') > 0 || weightOf(k, 'productiveRetrieval') > 0;

const isConstructionUnit = (unitId: string): boolean => unitId.startsWith('morph:') || unitId.startsWith('syntax:');

function categoriesOf(payload: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const c = payload.categories;
  if (Array.isArray(c)) for (const x of c) if (typeof x === 'string' && x.trim()) out.add(x.trim());
  if (typeof payload.category === 'string' && payload.category.trim()) out.add(payload.category.trim());
  return [...out];
}

function recurringErrors(events: readonly GoEvent[], learnerId: string, languageId: string): string[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.learnerId !== learnerId || e.languageId !== languageId || !ERROR_EVENT_KINDS.has(e.kind)) continue;
    for (const c of categoriesOf(e.payload ?? {})) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts].filter(([, n]) => n >= RECURRING_ERROR_MIN).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
}

/** The learner's own goals: latest event per goalId wins; removed goals disappear. */
export function goalsFrom(events: readonly GoEvent[], learnerId: string, languageId?: string): WritingGoal[] {
  const latest = new Map<string, { at: string; seq: number; goal: WritingGoal | null }>();
  events.forEach((e, seq) => {
    if (e.kind !== 'PreferenceChanged' || e.learnerId !== learnerId) return;
    if (languageId && e.languageId !== languageId) return;
    const p = e.payload ?? {};
    if (p.key !== GOAL_PREFERENCE_KEY) return;
    const v = p.value as Record<string, unknown> | null | undefined;
    if (!v || typeof v !== 'object' || typeof v.goalId !== 'string' || !v.goalId) return;
    const prev = latest.get(v.goalId);
    if (prev && (prev.at > e.at || (prev.at === e.at && prev.seq > seq))) return;
    if (v.removed === true) { latest.set(v.goalId, { at: e.at, seq, goal: null }); return; }
    if (typeof v.text !== 'string' || !v.text.trim()) return;
    const goal: WritingGoal = { goalId: v.goalId, text: v.text, createdAt: typeof v.createdAt === 'string' ? v.createdAt : e.at };
    if (v.done === true) goal.done = true;
    latest.set(v.goalId, { at: e.at, seq, goal });
  });
  return [...latest.values()].flatMap((x) => (x.goal ? [x.goal] : [])).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.goalId.localeCompare(b.goalId));
}

export async function buildWriterProfile(
  source: ProfileSource,
  identity: { learnerId: string; languageId: string; varietyId?: string },
  now: string,
): Promise<WriterProfile> {
  const [knowledge, events, prefs] = await Promise.all([source.knowledge(), source.events(), source.preferences()]);
  const rows = knowledge.filter((k) => k.learnerId === identity.learnerId && k.languageId === identity.languageId);

  const productive = rows.filter(isProductive).map((k) => k.unitId).sort();
  const productiveSet = new Set(productive);
  const recognisedOnly = rows.filter((k) => !productiveSet.has(k.unitId) && weightOf(k, 'readingRecognition') > 0).map((k) => k.unitId).sort();
  const weakConstructions = rows
    .filter((k) => isConstructionUnit(k.unitId))
    .filter((k) => (k.dimensions?.grammaticalUnderstanding?.negative ?? 0) > (k.dimensions?.grammaticalUnderstanding?.positive ?? 0))
    .map((k) => k.unitId).sort();

  const nowMs = Date.parse(now);
  const cutoff = nowMs - RECENT_DAYS * DAY_MS;
  const recent = rows
    .flatMap((k) => {
      const t = Date.parse(k.dimensions?.exposure?.lastAt ?? '');
      return Number.isFinite(t) && t >= cutoff ? [{ id: k.unitId, t }] : [];
    })
    .sort((a, b) => b.t - a.t || a.id.localeCompare(b.id))
    .map((x) => x.id);

  const depth = prefs?.explanationDepth;
  const explanationDepth = (DEPTHS as readonly string[]).includes(depth ?? '') ? (depth as WriterProfile['explanationDepth']) : 'brief';

  const n = productive.length;
  const level: WriterProfile['band']['level'] = n < BAND_FIRST_SENTENCES_BELOW ? 'first-sentences' : n < BAND_SHORT_PARAGRAPH_BELOW ? 'short-paragraph' : 'connected-paragraphs';
  const basis = [
    `${n} unit${n === 1 ? '' : 's'} with evidence of your own production (writing or recalling them yourself)`,
    `${recognisedOnly.length} unit${recognisedOnly.length === 1 ? '' : 's'} met in reading only; these are not counted as writing`,
    `first sentences below ${BAND_FIRST_SENTENCES_BELOW} productive units, short paragraph below ${BAND_SHORT_PARAGRAPH_BELOW}, connected paragraphs from there`,
  ];

  return {
    learnerId: identity.learnerId,
    languageId: identity.languageId,
    ...(identity.varietyId ? { varietyId: identity.varietyId } : {}),
    productive,
    recognisedOnly,
    weakConstructions,
    recurringErrors: recurringErrors(events, identity.learnerId, identity.languageId),
    recent,
    explanationDepth,
    goals: goalsFrom(events, identity.learnerId, identity.languageId),
    band: { level, basis },
  };
}

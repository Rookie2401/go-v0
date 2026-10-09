/**
 * PLANNING — composes one review session from the deck, the intake outcomes and the learner's preferences. Pure: it
 * reads, it never writes. A plan is a proposal; nothing is recorded until the learner answers (the session runner).
 *
 * Tiers, in order:
 *   1. DUE      reviewed items whose schedule says "due", lowest recall probability first. Never dropped silently: an item
 *               that does not fit the time budget stays due (nothing is written, so its schedule is untouched) and the plan
 *               lists it in `skipped` with 'over budget'.
 *   2. WEAK     items not yet due but failed repeatedly (≥ 2 Again among the last 10 reviews) or whose unit the learner
 *               repeatedly asked help for (`recentHelp`), at most WEAK_EXTRA_MAX extra practice items.
 *   3. NEW      never-reviewed deck items first (already committed), then intake `test-now` outcomes, up to `maxNew`.
 *
 * Time. Estimated seconds per item (estimates, not measurements): written recognition / meaning-to-form 25 s; a CHOICE
 * question 15 s (written recognition and phrase comprehension while the item is still new or learning, because those are
 * offered as choices first); grammar (morphological identification, grammar application) 35 s; sentence completion 40 s;
 * audio 30 s plus 8 s for each EXPECTED replay (one is assumed). The plan never exceeds `sessionMinutes`.
 *
 * Listening. A listening item is planned only when `includeListening && audio.available`. Otherwise a DUE listening item
 * is asked in its written counterpart (and the plan says so: the result then counts as reading, never as listening) and a
 * NEW listening item is not added at all. When the audio is available but is only practice (not evidence-eligible) the item
 * is planned and flagged: the runner will record it with evidence quality 'none'.
 *
 * Grammar share. `grammarShare` is APPROXIMATED when enough items of both kinds exist: each optional pick (tiers 2 and 3)
 * prefers a grammar item while the projected grammar fraction is below the target and a non-grammar item otherwise, and
 * falls back to the other kind when the preferred one is exhausted. Due items are never reordered or dropped to hit the share.
 *
 * Cost/benefit. benefit = retrievability deficit (1 − recall probability; 1 for a new item) × the Repository's candidate
 * score (0.5 when the unit has no candidate) ÷ cost, with cost = estimated seconds / 30 × (1 + candidate.cost). It orders
 * the optional tiers and breaks ties among due items.
 */
import type {
  AudioAvailability, DeckItem, ExerciseFamily, IntakeOutcome, PlannedItem, ReviewPreferences, Scheduler, SessionPlan,
} from '../types';
import { FAMILY_DIMENSION } from '../types';
import { itemIdFor } from '../scheduler/deck';
import { cardReasonFor } from '../intake/intake';

const GRAMMAR_FAMILY_SET: ReadonlySet<ExerciseFamily> = new Set<ExerciseFamily>(['morphological-identification', 'grammar-application']);
const AUDIO_FAMILY_SET: ReadonlySet<ExerciseFamily> = new Set<ExerciseFamily>(['audio-to-meaning', 'audio-transcription']);

/** Seconds per kind of item; estimates the planner documents and a host may replace with measured latencies. */
export const ESTIMATED_SECONDS = { written: 25, choice: 15, grammar: 35, sentenceCompletion: 40, audio: 30, replay: 8 } as const;
export const EXPECTED_REPLAYS = 1;
export const WEAK_EXTRA_MAX = 5;
export const WEAK_AGAIN_COUNT = 2;
export const WEAK_WINDOW = 10;

export const isGrammarFamily = (f: ExerciseFamily): boolean => GRAMMAR_FAMILY_SET.has(f);
export const isAudioFamily = (f: ExerciseFamily): boolean => AUDIO_FAMILY_SET.has(f);

/** The written family that asks the same recognition-or-retrieval question without sound. */
export const writtenCounterpart = (f: ExerciseFamily): ExerciseFamily => {
  if (f === 'audio-to-meaning') return 'written-recognition';
  if (f === 'audio-transcription') return 'meaning-to-form';
  return f;
};

export function estimateSeconds(family: ExerciseFamily, phase?: DeckItem['schedule']['phase']): number {
  const E = ESTIMATED_SECONDS;
  switch (family) {
    case 'written-recognition':
    case 'phrase-comprehension': return phase === 'new' || phase === 'learning' ? E.choice : E.written;
    case 'meaning-to-form': return E.written;
    case 'morphological-identification':
    case 'grammar-application': return E.grammar;
    case 'sentence-completion': return E.sentenceCompletion;
    case 'audio-to-meaning':
    case 'audio-transcription': return E.audio + E.replay * EXPECTED_REPLAYS;
  }
}

export interface PlanInput {
  deck: DeckItem[];
  intake: IntakeOutcome[];
  preferences: ReviewPreferences;
  audio: AudioAvailability;
  scheduler: Scheduler;
  now: string;
  /** Units for which the learner repeatedly asked for help (repeated AssistanceRequested). */
  recentHelp?: Set<string>;
  random: () => number;
}

interface Cand { planned: PlannedItem; benefit: number; grammar: boolean; recall: number }

const pct = (x: number): string => `${Math.round(x * 100)}%`;
const isLive = (i: DeckItem, nowMs: number): boolean =>
  i.status === 'active' || (i.status === 'snoozed' && i.snoozedUntil !== undefined && Date.parse(i.snoozedUntil) <= nowMs);

/** Recent Again ratings among the last WEAK_WINDOW reviews. */
export const recentAgains = (i: DeckItem): number => i.history.slice(-WEAK_WINDOW).filter((h) => h.rating === 1).length;

export const benefitOf = (deficit: number, score: number, seconds: number, cost: number): number =>
  (deficit * score) / Math.max(0.1, (seconds / 30) * (1 + cost));

export function planSession(input: PlanInput): SessionPlan {
  const { deck, intake, preferences, audio, scheduler, now, random } = input;
  const nowMs = Date.parse(now);
  if (Number.isNaN(nowMs)) throw new RangeError(`not an ISO timestamp: ${now}`);
  const recentHelp = input.recentHelp ?? new Set<string>();
  const budget = Math.max(0, preferences.sessionMinutes) * 60;
  const candidateOf = new Map(intake.map((o) => [o.unitId, o.candidate] as const));
  const listeningOk = preferences.includeListening && audio.available;

  const skipped: SessionPlan['skipped'] = [];
  const items: PlannedItem[] = [];
  let used = 0;
  let grammar = 0;

  /** The family actually asked, with the notes that explain any change. */
  const resolve = (family: ExerciseFamily): { family: ExerciseFamily; notes: string[] } => {
    if (!isAudioFamily(family)) return { family, notes: [] };
    if (listeningOk) return { family, notes: audio.eligibleForEvidence ? [] : ['listening practice only: this audio cannot count as listening evidence'] };
    const why = !preferences.includeListening ? 'listening is switched off' : `no suitable audio (${audio.reason})`;
    return { family: writtenCounterpart(family), notes: [`${why}: asked in writing, so the result counts as reading, not listening`] };
  };

  const make = (item: DeckItem, why: string[], deficit: number, isNew: boolean, recall = 0): Cand => {
    const r = resolve(item.family);
    const seconds = estimateSeconds(r.family, item.schedule.phase);
    const cand = candidateOf.get(item.unitId);
    return {
      planned: { item, family: r.family, why: [...why, ...r.notes], estimatedSeconds: seconds, isNew },
      benefit: benefitOf(deficit, cand?.score ?? 0.5, seconds, cand?.cost ?? 0),
      grammar: isGrammarFamily(r.family),
      recall,
    };
  };

  const add = (c: Cand): boolean => {
    if (used + c.planned.estimatedSeconds > budget) return false;
    items.push(c.planned);
    used += c.planned.estimatedSeconds;
    if (c.grammar) grammar += 1;
    return true;
  };

  // ── classify the deck ──
  const live = deck.filter((i) => isLive(i, nowMs));
  const due: Cand[] = [];
  const weak: Cand[] = [];
  const deckNew: Cand[] = [];
  for (const item of live) {
    const reviewed = item.history.length > 0;
    const helped = recentHelp.has(item.unitId);
    const againCount = recentAgains(item);
    const isWeak = againCount >= WEAK_AGAIN_COUNT || helped;
    const weakWhy = [
      ...(againCount >= WEAK_AGAIN_COUNT ? [`repeated weak point: ${againCount} Again in the last ${Math.min(WEAK_WINDOW, item.history.length)} reviews`] : []),
      ...(helped ? ['you asked for help with this unit repeatedly'] : []),
    ];
    if (!reviewed) {
      deckNew.push(make(item, ['new in the deck: not reviewed yet', ...weakWhy], 1, true));
      continue;
    }
    const r = scheduler.retrievability(item.schedule, now);
    if (scheduler.isDue(item.schedule, now)) {
      due.push(make(item, [`due: recall probability ${pct(r)}`, ...weakWhy], 1 - r, false, r));
    } else if (isWeak) {
      weak.push(make(item, [`not due yet (recall ${pct(r)}), but ${weakWhy.join('; ')}`], Math.max(0.05, 1 - r), false));
    }
  }

  // ── tier 1: due, lowest retrievability first, never silently dropped ──
  due.sort((a, b) => a.recall - b.recall || b.benefit - a.benefit || (a.planned.item.itemId < b.planned.item.itemId ? -1 : 1));
  let dueCount = 0;
  for (const c of due) {
    if (add(c)) dueCount += 1;
    else skipped.push({ itemId: c.planned.item.itemId, why: 'over budget (still due; nothing was written)' });
  }

  // ── optional tiers: grammar-share aware picking ──
  const pick = (pool: Cand[], limit: number): { picked: Cand[]; overBudget: Cand[] } => {
    const rest = [...pool].sort((a, b) => b.benefit - a.benefit || (a.planned.item.itemId < b.planned.item.itemId ? -1 : 1));
    const picked: Cand[] = [];
    const overBudget: Cand[] = [];
    while (rest.length && picked.length < limit) {
      const wantGrammar = grammar / (items.length + 1) < preferences.grammarShare;
      const fits = (c: Cand) => used + c.planned.estimatedSeconds <= budget;
      const choice = rest.find((c) => c.grammar === wantGrammar && fits(c)) ?? rest.find(fits);
      if (!choice) break;
      add(choice);
      picked.push(choice);
      rest.splice(rest.indexOf(choice), 1);
    }
    // what was eligible but did not fit (not beyond the limit)
    if (picked.length < limit) overBudget.push(...rest);
    return { picked, overBudget };
  };

  // tier 2: weak extras
  pick(weak, WEAK_EXTRA_MAX);

  // tier 3: new — the deck's own never-reviewed items, then the intake's test-now outcomes
  const deckIds = new Set(deck.map((i) => i.itemId));
  const fresh: Cand[] = [];
  const admitted = new Set<string>(); // an outcome list that names the same unit twice must not ask (or review) it twice
  for (const o of intake) {
    if (o.decision !== 'test-now' || !o.proposed) continue;
    const itemId = itemIdFor(o.unitId, o.proposed.dimension);
    const key = `${o.unitId}|${o.proposed.family}`;
    if (admitted.has(key) || admitted.has(itemId)) continue; // duplicate outcome: the first one stands
    admitted.add(key);
    admitted.add(itemId);
    if (deckIds.has(itemId)) continue; // the deck already has it in some state; intake never re-adds
    if (isAudioFamily(o.proposed.family) && !listeningOk) {
      skipped.push({ itemId, why: `listening item not added: ${!preferences.includeListening ? 'listening is switched off' : `no suitable audio (${audio.reason})`}` });
      continue;
    }
    const item: DeckItem = {
      itemId, unitId: o.unitId, unitKind: o.candidate.kind, languageId: preferences.languageId,
      dimension: o.proposed.dimension, family: o.proposed.family, addedAt: now, addedBy: 'intake',
      reasons: [cardReasonFor(o.candidate, o.reasons[0] ?? 'intake')], schedule: scheduler.newState(now), history: [], status: 'active',
    };
    fresh.push(make(item, ['new from intake', ...o.reasons], 1, true));
  }
  const newLimit = Math.max(0, preferences.maxNew);
  const committed = pick(deckNew, newLimit);
  const intakePicked = pick(fresh, Math.max(0, newLimit - committed.picked.length));
  const newCount = committed.picked.length + intakePicked.picked.length;
  for (const c of [...committed.overBudget, ...intakePicked.overBudget]) {
    skipped.push({ itemId: c.planned.item.itemId, why: c.planned.isNew && !deckIds.has(c.planned.item.itemId) ? 'over budget (not added to the deck)' : 'over budget (stays in the deck)' });
  }
  // eligible new items beyond the maxNew limit are listed too, so the plan explains every test-now it did not use
  const used_ = new Set(items.map((p) => p.item.itemId));
  const listed = new Set(skipped.map((s) => s.itemId));
  for (const c of [...deckNew, ...fresh]) {
    const id = c.planned.item.itemId;
    if (!used_.has(id) && !listed.has(id)) skipped.push({ itemId: id, why: `beyond the limit of ${newLimit} new item(s) per session` });
  }

  return {
    planId: `plan:${now}:${Math.floor(random() * 36 ** 6).toString(36).padStart(6, '0')}`,
    createdAt: now,
    languageId: preferences.languageId,
    budgetMinutes: preferences.sessionMinutes,
    items,
    skipped,
    dueCount,
    newCount,
    listeningCount: items.filter((p) => isAudioFamily(p.family)).length,
    grammarCount: grammar,
  };
}

/** The assessment dimension an item is actually asked along in a plan (differs from `item.dimension` after a listening fallback). */
export const askedDimension = (p: PlannedItem) => FAMILY_DIMENSION[p.family];

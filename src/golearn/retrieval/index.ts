/**
 * Retrieval practice — a small daily set drawn from the sentences the learner has actually read.
 *
 *   WHAT IS ASKED  A cloze: the sentence he read with one word blanked, and he types the word. Never an isolated flashcard,
 *                  never a sentence he has not met. The word is a lemma item that is weak (encountered / recognized_with_help, met at
 *                  least twice) or overdue (met three times or more, not met for 14 days), or a word he queued himself
 *                  ("practise" in the Vocabulary table). The sentence is one of those the item was READ in (an encounter in the
 *                  reading modality), found with `findOccurrences`; a word with no such sentence is not asked.
 *   HINTS          After a first miss the first letter is shown; after a second miss (or "show me") the whole word.
 *   MATCHING       The adapter's `normalize` after punctuation is dropped; for es / de / sq / nb / nn the Stage 0 lenient match as
 *                  well, so a missing accent never fails a learner (it is accepted with a note about the spelling).
 *   EVIDENCE       A correct recall with nothing shown emits the EXISTING `ProductionRecorded` event for that item, kind
 *                  `independent` (weight 1.0); after the first letter, kind `assisted` (0.4); after the whole word is shown, nothing.
 *                  The modality is `writing` (he typed the word): `ProductionRecorded.modality` is the closed union
 *                  'writing' | 'speaking' and the fold indexes its aggregate by it, so a new value would break the fold. A recall is
 *                  told apart by its dedupe key (`retrieval:…`). GoLearn's rule stands: evidence for an (item, sentence, modality) is
 *                  recorded once, ever; the kind is part of the sentence hash, so a hinted recall never blocks a later unaided one.
 *   SCHEDULE       Per item, the interval table of schedule.ts; the state is one JSON row in `meta`, id `retrieval:<user>:<lang>`
 *                  (the same mechanism as the alphabet trainer; a backup carries it, since the user id is one of its segments).
 *   LIMITS         At most DAILY_CAP (20) prompts a day; a word he queues himself is always offered and counts as done.
 *   ORPHANS        The ladder gate's orphan lemmas are measured when a ladder is built (scripts / `measureLadder` over the loaded
 *                  documents), not at runtime, so they are not read here; package R4 feeds them to the reread rule instead.
 */
import type { AdapterRegistry, AppStore, EventBus, GoLearn, ItemKind, LanguageCode, LearnerItemState, ProductionKind, ProductionRecorded } from '../../core';
import { hash, ids, itemKindOf } from '../../core';
import { matchAnswer, normalizeAnswer } from '../../stage0/match';
import {
  DAILY_CAP, applyOutcome, candidateReason, compareCandidates, doneOn, localDay, parseRetrievalState,
} from './schedule';
import type { CandidateReason, ItemFacts, ItemSchedule, RetrievalLevel, RetrievalOutcome, RetrievalState } from './schedule';

export * from './schedule';

export interface RetrievalDeps {
  store: AppStore;
  bus: EventBus;
  adapters: AdapterRegistry;
  golearn: Pick<GoLearn, 'findOccurrences'> & Partial<Pick<GoLearn, 'settled'>>;
  /** ISO "now" (default: the system clock). Tests pass their deterministic clock. */
  clock?: () => string;
  /** The session id events carry (default 'retrieval'). */
  session?: () => string;
}

/** One cloze prompt. Everything the page shows, and what the engine needs to record the answer. */
export interface RetrievalPrompt {
  itemId: string;
  itemKind: ItemKind;
  lang: LanguageCode;
  reason: CandidateReason;
  level: RetrievalLevel;
  sentenceId: string;
  textId: string;
  /** The title of the text the sentence was read in. */
  textTitle: string;
  tokenId: string;
  /** The word as written in the sentence: what the learner types. */
  answer: string;
  /** The sentence before and after the blank. */
  before: string;
  after: string;
  /** The whole sentence, answer in place. */
  sentence: string;
  firstLetter: string;
}

export interface RetrievalDay {
  prompts: RetrievalPrompt[];
  /** Prompts finished today. */
  doneToday: number;
  cap: number;
  /** The learner has read something in this language (false: the page says why it has nothing). */
  hasReading: boolean;
  /** The next time a scheduled word falls due, when nothing is due now. */
  nextDueAt?: string;
}

export interface CheckResult { accepted: boolean; /** Accepted, but spelled without its marks. */ note?: string }

export interface SubmitResult extends CheckResult {
  /** Set when the answer was right: how it was recorded. */
  outcome?: Extract<RetrievalOutcome, 'independent' | 'assisted'>;
  /** The event emitted for it (the existing ProductionRecorded); false when GoLearn had already recorded the item in this sentence. */
  recorded?: boolean;
}

export interface Retrieval {
  /** Today's set, most pressing first. `limit` stops the search early (Home only asks whether there is one). */
  today(userId: string, lang: LanguageCode, opts?: { limit?: number }): Promise<RetrievalDay>;
  /** Whether one prompt can be asked now (a cheap `today` with limit 1). */
  hasDue(userId: string, lang: LanguageCode): Promise<boolean>;
  /** Put one item at the front of the set. Fails (and says why) when no sentence he has read contains it. */
  queue(userId: string, lang: LanguageCode, itemId: string): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Pure matching of a typed answer. */
  check(prompt: RetrievalPrompt, typed: string): CheckResult;
  /** A typed answer: when right, it is recorded (event + schedule) as `independent` (`hint` 'none') or `assisted` (`hint` 'letter'). A wrong answer changes nothing. */
  submit(userId: string, prompt: RetrievalPrompt, typed: string, hint: 'none' | 'letter'): Promise<SubmitResult>;
  /** The whole word had to be shown: a miss on the schedule, nothing in GoLearn. */
  giveUp(userId: string, prompt: RetrievalPrompt): Promise<void>;
  /** The stored schedule of one item (tests, the Vocabulary table). */
  schedule(userId: string, lang: LanguageCode, itemId: string): Promise<ItemSchedule | undefined>;
}

export const retrievalMetaId = (userId: string, lang: LanguageCode): string => `retrieval:${userId}:${lang}`;

/** Parts of speech that make a poor cloze (function words, names, numerals): never chosen on their own, only when queued. */
const SKIPPED_POS = new Set(['DET', 'ADP', 'PRON', 'CONJ', 'SCONJ', 'AUX', 'PART', 'NUM', 'PROPN', 'PUNCT', 'X']);
function worthAsking(itemId: string): boolean {
  const m = /^lemma:[^:]+:.*:([A-Z]+)$/.exec(itemId);
  return !m || !SKIPPED_POS.has(m[1]);
}

/** State writes are read-modify-write on one row: serialise them per store, whatever engine instance asks. */
const locks = new WeakMap<object, Promise<unknown>>();
function locked<T>(key: object, fn: () => Promise<T>): Promise<T> {
  const run = (locks.get(key) ?? Promise.resolve()).then(fn);
  locks.set(key, run.then(() => undefined, () => undefined));
  return run;
}

const LONG_SENTENCE = 220;

export function createRetrieval(deps: RetrievalDeps): Retrieval {
  const { store, bus, adapters, golearn } = deps;
  const now = () => (deps.clock ? deps.clock() : new Date().toISOString());
  const sessionId = () => deps.session?.() ?? 'retrieval';

  const readState = async (userId: string, lang: LanguageCode): Promise<RetrievalState> =>
    parseRetrievalState((await store.meta.get(retrievalMetaId(userId, lang)))?.value);
  const writeState = async (userId: string, lang: LanguageCode, state: RetrievalState): Promise<void> => {
    await store.meta.put({ id: retrievalMetaId(userId, lang), value: JSON.stringify(state), updatedAt: now() });
  };
  const update = <T>(userId: string, lang: LanguageCode, fn: (s: RetrievalState) => T): Promise<T> =>
    locked(store, async () => {
      const state = await readState(userId, lang);
      const out = fn(state);
      await writeState(userId, lang, state);
      return out;
    });

  const factsOf = (r: LearnerItemState): ItemFacts => ({
    readingLevel: r.reading.level, encounterCount: r.encounterCount,
    ...(r.lastSeenAt ? { lastSeenAt: r.lastSeenAt } : {}), ...(r.manualMark ? { manualMark: r.manualMark } : {}),
  });

  /** The sentence this item is asked in: one he READ it in, live, with the word's token located. */
  async function buildPrompt(userId: string, lang: LanguageCode, row: LearnerItemState, reason: CandidateReason, sched: ItemSchedule | undefined): Promise<RetrievalPrompt | undefined> {
    const itemId = row.itemId;
    const read = new Set((await store.encounters.where('itemId', itemId)).filter((e) => e.userId === userId && e.modality === 'reading').map((e) => e.sentenceId));
    if (read.size === 0) return undefined;
    const textIds = row.readingTextIds ?? row.textIds;
    const hits = (await golearn.findOccurrences({ lang, itemId, ...(textIds.length > 0 ? { textIds } : {}), includeUnpublished: true, limit: 200 }))
      .filter((h) => read.has(h.sentenceId));
    if (hits.length === 0) return undefined;
    const sentences = await store.sentences.getMany(hits.map((h) => h.sentenceId));
    const usable = hits
      .map((h, i) => ({ h, s: sentences[i] }))
      .filter((x): x is { h: typeof x.h; s: NonNullable<typeof x.s> } => !!x.s && x.s.retiredInVersion === undefined && x.s.text.length > 0)
      .sort((a, b) => Number(a.s.text.length > LONG_SENTENCE) - Number(b.s.text.length > LONG_SENTENCE) || (a.s.id < b.s.id ? -1 : 1));
    const short = usable.filter((x) => x.s.text.length <= LONG_SENTENCE);
    const pool = short.length > 0 ? short : usable;
    // a different sentence each time the word comes back
    for (let k = 0; k < pool.length; k++) {
      const { h, s } = pool[((sched?.attempts ?? 0) + k) % pool.length];
      const tokens = (await store.tokens.getMany(h.tokenIds)).filter((t): t is NonNullable<typeof t> => !!t && t.isWord && t.sentenceId === s.id).sort((a, b) => a.index - b.index);
      const token = tokens[0];
      if (!token || token.surface.length === 0 || s.text.slice(token.start, token.end) !== token.surface) continue;
      const text = await store.texts.get(s.textId);
      return {
        itemId, itemKind: itemKindOf(itemId), lang, reason, level: sched?.level ?? 0,
        sentenceId: s.id, textId: s.textId, textTitle: text?.title ?? s.textId, tokenId: token.id,
        answer: token.surface, before: s.text.slice(0, token.start), after: s.text.slice(token.end), sentence: s.text,
        firstLetter: Array.from(token.surface)[0] ?? '',
      };
    }
    return undefined;
  }

  const normalizer = (lang: LanguageCode): ((s: string) => string) => {
    try {
      const adapter = adapters.get(lang);
      return (s) => adapter.normalize(normalizeAnswer(lang, s));
    } catch {
      return (s) => normalizeAnswer(lang, s);
    }
  };

  function check(prompt: RetrievalPrompt, typed: string): CheckResult {
    const norm = normalizer(prompt.lang);
    const t = norm(typed);
    if (!t) return { accepted: false };
    if (t === norm(prompt.answer)) return { accepted: true };
    const m = matchAnswer(prompt.lang, typed, [{ text: prompt.answer }]);
    return m.accepted ? { accepted: true, ...(m.spellingNote ? { note: m.spellingNote } : {}) } : { accepted: false };
  }

  async function finish(userId: string, prompt: RetrievalPrompt, outcome: RetrievalOutcome): Promise<void> {
    const at = now();
    await update(userId, prompt.lang, (state) => {
      state.items[prompt.itemId] = applyOutcome(state.items[prompt.itemId], outcome, at);
      const today = localDay(at);
      state.doneToday = (state.day === today ? state.doneToday : 0) + 1;
      state.day = today;
    });
  }

  async function record(userId: string, prompt: RetrievalPrompt, kind: Extract<ProductionKind, 'independent' | 'assisted'>): Promise<boolean> {
    // the kind is part of the hash: GoLearn keeps one record per (item, sentence hash, modality), so a recall after the first
    // letter and an unaided one in the same sentence are two different facts
    const sentenceHash = hash(`recall|${kind}|${prompt.sentence}`);
    const ev = await bus.emit<ProductionRecorded>({
      type: 'ProductionRecorded', userId, lang: prompt.lang, surface: 'corpus', session: sessionId(),
      dedupeKey: `retrieval:${userId}:${prompt.itemId}:${sentenceHash}`,
      itemId: prompt.itemId, itemKind: prompt.itemKind, kind, modality: 'writing', sentenceText: prompt.sentence, sentenceHash,
    });
    await deps.golearn.settled?.();
    return ev !== null;
  }

  async function today(userId: string, lang: LanguageCode, opts: { limit?: number } = {}): Promise<RetrievalDay> {
    const at = now();
    const state = await readState(userId, lang);
    const rows = (await store.learnerItems.where('userId', userId)).filter((r) => r.lang === lang);
    const hasReading = rows.some((r) => r.itemKind !== 'orth' && r.encounterCount > 0 && r.reading.level !== 'unseen');
    const done = doneOn(state, at);
    const remaining = Math.max(0, DAILY_CAP - done);

    const cands: Array<{ row: LearnerItemState; reason: CandidateReason; facts: ItemFacts; itemId: string }> = [];
    let nextDueAt: string | undefined;
    for (const row of rows) {
      const sched = state.items[row.itemId];
      if (row.itemKind !== 'lemma' && !sched) continue; // forms and phrases enter only by being queued
      if (row.itemKind === 'orth' || row.itemKind === 'pattern') continue;
      const facts = factsOf(row);
      const reason = candidateReason(facts, sched, at);
      if (!reason) {
        if (sched?.dueAt && sched.dueAt > at && (!nextDueAt || sched.dueAt < nextDueAt)) nextDueAt = sched.dueAt;
        continue;
      }
      if (reason !== 'queued' && !sched && !worthAsking(row.itemId)) continue;
      cands.push({ row, reason, facts, itemId: row.itemId });
    }
    cands.sort(compareCandidates);

    const prompts: RetrievalPrompt[] = [];
    let scheduled = 0;
    const max = opts.limit ?? Infinity;
    for (const c of cands) {
      if (prompts.length >= max) break;
      if (c.reason !== 'queued' && scheduled >= remaining) continue;
      const p = await buildPrompt(userId, lang, c.row, c.reason, state.items[c.itemId]);
      if (!p) continue;
      prompts.push(p);
      if (c.reason !== 'queued') scheduled++;
    }
    return { prompts, doneToday: done, cap: DAILY_CAP, hasReading, ...(prompts.length === 0 && nextDueAt ? { nextDueAt } : {}) };
  }

  return {
    today,
    async hasDue(userId, lang) {
      return (await today(userId, lang, { limit: 1 })).prompts.length > 0;
    },
    async queue(userId, lang, itemId) {
      const kind = itemKindOf(itemId);
      if (kind !== 'lemma' && kind !== 'form') return { ok: false, reason: 'Only a word can be practised, not a phrase or a pattern.' };
      const row = await store.learnerItems.get(ids.learnerItem(userId, itemId));
      if (!row || row.lang !== lang) return { ok: false, reason: 'You have not met this word in a text yet.' };
      const probe = await buildPrompt(userId, lang, row, 'queued', (await readState(userId, lang)).items[itemId]);
      if (!probe) return { ok: false, reason: 'No sentence you have read contains this word, so there is nothing to ask it in.' };
      const at = now();
      await update(userId, lang, (state) => {
        const cur = state.items[itemId] ?? { level: 0 as RetrievalLevel, attempts: 0, lapses: 0 };
        state.items[itemId] = { ...cur, queuedAt: at };
      });
      return { ok: true };
    },
    check,
    async submit(userId, prompt, typed, hint) {
      const r = check(prompt, typed);
      if (!r.accepted) return r;
      const kind = hint === 'none' ? 'independent' : 'assisted';
      const recorded = await record(userId, prompt, kind);
      await finish(userId, prompt, kind);
      return { ...r, outcome: kind, recorded };
    },
    async giveUp(userId, prompt) {
      await finish(userId, prompt, 'miss');
    },
    async schedule(userId, lang, itemId) {
      return (await readState(userId, lang)).items[itemId];
    },
  };
}

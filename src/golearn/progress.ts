/**
 * Reading progress, read from the event log: ONE canonical record per (learner, language, text, content version).
 * Five notions are kept apart (see `ReadingProgress`):
 *
 *   displayed / previewed  `TextViewed` (any mode)          counts NOTHING
 *   reading exposure       `SentenceViewed`                 `sentencesSeen` — live sentences with a real view
 *   explicit completion    `TextCompleted`                  `finishedAt` — never inferred, however many sentences were seen;
 *                                                           only a completion OF THE CURRENT content version
 *   reported understanding `ComprehensionReported` 'all'    `sentencesUnderstood` — live sentences, no sentence-level help
 *                                                           (explanation / English rescue) in the sitting of the report
 *   estimated familiarity  item-level estimate              never progress
 *
 * VERSION SCOPE. The numbers describe the CURRENT version's live sentences (order and membership come from the live
 * `Sentence` rows, never from ids). Exposure recorded against sentences that are no longer part of the text (retired by a
 * revision, or by the legacy migration of index ids) is history: it is kept, reported in `earlierVersions`, and never
 * counted in `sentencesSeen` / `sentencesUnderstood`. A completion counts as `finishedAt` only when its `contentVersion`
 * equals the text's current one (an event without a version: only while the text is at version 1); any other completion
 * is `finishedEarlierVersion` (the latest such).
 *
 * A report never fabricates a view: "Understood" on a sentence the learner never dwelt on still demonstrates its items
 * (fold.ts) and counts as understood here, but `sentencesSeen` only counts `SentenceViewed`.
 *
 * `asOf` is the `at` of the latest event of this learner that the record took into account (a view of a sentence of the
 * text, a completion, a counted report, sentence-level help on it, a heard sentence); undefined when there is none.
 *
 * `readingProgressMany` reads the log ONCE for any number of texts; `readingProgress` delegates to it.
 */
import type { DomainEvent, ReadingProgress, Sentence, Text } from '../core';
import { byAtId } from './sitting';
import type { Ctx, StoredEncounter } from './state';
import { eventsOfTexts } from './userlog';

export type Degree = 'all' | 'most' | 'some' | 'little';

/** What the log says about one text (before it is read against the text's sentences and version). */
interface TextLog {
  /** sentence id → sittings in which it was really viewed (a `SentenceViewed`; reports never add to this) */
  views: Map<string, Set<string>>;
  /** reading reports of degree 'all' */
  reports: Array<{ sentenceIds: string[]; sitting: string; at: string }>;
  completions: Array<{ at: string; version?: number }>;
  /** latest text-scope reading report */
  textReport?: { degree: Degree; at: string };
}

const key = (sitting: string, sentenceId: string) => `${sitting}\n${sentenceId}`;
const latest = (a: string | undefined, b: string): string => (a === undefined || b > a ? b : a);

export async function readingProgressMany(ctx: Ctx, userId: string, textIds: string[]): Promise<Map<string, ReadingProgress>> {
  const wanted = [...new Set(textIds)];
  const texts = new Map<string, Text>();
  const sentences = new Map<string, Sentence[]>();
  const textOfSentence = new Map<string, string>();
  for (const id of wanted) {
    const text = await ctx.store.texts.get(id);
    if (!text) throw new Error(`unknown text: ${id}`);
    texts.set(id, text);
    const rows = await ctx.store.sentences.where('textId', id);
    sentences.set(id, rows);
    for (const s of rows) textOfSentence.set(s.id, id);
  }

  // The events of the asked-for texts, from the folder's in-memory log of the learner (no read of the event table; the cost is
  // the history of THESE texts, not of everything he ever did). Sittings are those the folds derived from ALL of his evidence
  // events. Completions are not evidence events: they come from the event table's type index (rare).
  const log = await ctx.userLog(userId);
  const wantedSet = new Set(wanted);
  const completions = (await ctx.store.events.where('type', 'TextCompleted')).filter((e) => e.userId === userId && e.type === 'TextCompleted' && wantedSet.has(e.textId));
  const events: DomainEvent[] = [...eventsOfTexts(log, wanted), ...completions].sort(byAtId);
  const sittings = log.sittings;

  // Sentence-level help per (sitting, sentence): a report made after / in such a sitting is not "understood without help".
  const rescued = new Set<string>();
  for (const e of events) {
    if (e.type === 'SentenceExplanationRevealed') rescued.add(key(sittings.get(e.id) ?? '', e.sentenceId));
    else if (e.type === 'EnglishRescueRevealed') for (const sid of e.sentenceIds) rescued.add(key(sittings.get(e.id) ?? '', sid));
  }

  const logs = new Map<string, TextLog>();
  const asOf = new Map<string, string>();
  for (const id of wanted) logs.set(id, { views: new Map(), reports: [], completions: [] });
  const bump = (textId: string, at: string) => asOf.set(textId, latest(asOf.get(textId), at));

  for (const e of events) {
    switch (e.type) {
      case 'SentenceViewed': {
        const log = logs.get(e.textId);
        if (!log) break;
        let set = log.views.get(e.sentenceId);
        if (!set) log.views.set(e.sentenceId, (set = new Set()));
        set.add(sittings.get(e.id) ?? '');
        if (textOfSentence.get(e.sentenceId) === e.textId) bump(e.textId, e.at);
        break;
      }
      case 'TextCompleted': {
        const log = logs.get(e.textId);
        if (!log) break;
        log.completions.push({ at: e.at, ...(e.contentVersion !== undefined ? { version: e.contentVersion } : {}) });
        bump(e.textId, e.at);
        break;
      }
      case 'ComprehensionReported': {
        const log = logs.get(e.textId);
        if (!log || e.modality !== 'reading') break;
        let counted = false;
        if (e.degree === 'all') {
          log.reports.push({ sentenceIds: e.sentenceIds, sitting: sittings.get(e.id) ?? '', at: e.at });
          counted = e.sentenceIds.some((sid) => textOfSentence.get(sid) === e.textId);
        }
        if (e.scope === 'text') { log.textReport = { degree: e.degree, at: e.at }; counted = true; }
        if (counted) bump(e.textId, e.at);
        break;
      }
      case 'EnglishRescueRevealed': {
        for (const textId of new Set(e.sentenceIds.map((sid) => textOfSentence.get(sid)).filter((x): x is string => !!x))) bump(textId, e.at);
        break;
      }
      case 'SentenceExplanationRevealed': {
        const textId = textOfSentence.get(e.sentenceId);
        if (textId) bump(textId, e.at);
        break;
      }
      default:
        break;
    }
  }

  const out = new Map<string, ReadingProgress>();
  for (const id of wanted) {
    const text = texts.get(id)!;
    const log = logs.get(id)!;
    const rows = sentences.get(id)!;
    const live = new Set(rows.filter((s) => s.retiredInVersion === undefined).map((s) => s.id));
    const retired = new Set(rows.filter((s) => s.retiredInVersion !== undefined).map((s) => s.id));

    let seen = 0;
    let seenEarlier = 0;
    const sittingKeys = new Set<string>();
    for (const [sid, v] of log.views) {
      if (v.size === 0) continue;
      if (live.has(sid)) { seen += 1; for (const k of v) sittingKeys.add(k); } else if (retired.has(sid)) seenEarlier += 1;
    }
    const understoodIds = new Set<string>();
    for (const r of log.reports) for (const sid of r.sentenceIds) if (!rescued.has(key(r.sitting, sid))) understoodIds.add(sid);
    let understood = 0;
    let understoodEarlier = 0;
    for (const sid of understoodIds) { if (live.has(sid)) understood += 1; else if (retired.has(sid)) understoodEarlier += 1; }

    let finishedAt: string | undefined;
    let earlier: { version?: number; at: string } | undefined;
    for (const c of log.completions) {
      const current = c.version === undefined ? text.contentVersion === 1 : c.version === text.contentVersion;
      if (current) finishedAt = latest(finishedAt, c.at);
      else if (!earlier || c.at > earlier.at) earlier = { ...(c.version !== undefined ? { version: c.version } : {}), at: c.at };
    }

    const listened = new Set<string>();
    for (const e of (await ctx.store.encounters.where('textId', id)) as StoredEncounter[]) {
      if (e.userId === userId && e.modality === 'listening' && live.has(e.sentenceId)) { listened.add(e.sentenceId); bump(id, e.at); }
    }

    const record: ReadingProgress = {
      userId, lang: text.lang, textId: id, contentVersion: text.contentVersion, sentencesTotal: live.size,
      sentencesSeen: seen, sentencesUnderstood: understood,
      ...(finishedAt ? { finishedAt } : {}),
      ...(earlier ? { finishedEarlierVersion: earlier } : {}),
      ...(seenEarlier > 0 || understoodEarlier > 0 ? { earlierVersions: { sentencesSeen: seenEarlier, sentencesUnderstood: understoodEarlier } } : {}),
      ...(log.textReport ? { reportedComprehension: log.textReport.degree } : {}),
      sittings: sittingKeys.size,
      listenedSentences: listened.size,
      ...(asOf.has(id) ? { asOf: asOf.get(id)! } : {}),
    };
    out.set(id, record);
  }
  return out;
}

export async function readingProgress(ctx: Ctx, userId: string, textId: string): Promise<ReadingProgress> {
  return (await readingProgressMany(ctx, userId, [textId])).get(textId)!;
}

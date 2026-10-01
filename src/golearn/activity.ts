/**
 * Reading activity read from the event log: the raw material of reading pace and stage readiness.
 *
 * A READING UNIT is one sentence in one sitting (the same grain the folds use): all `SentenceViewed` events of a
 * (sentence, sitting) are one unit, so a reload or a scroll back and forth is not read twice. Help recorded in the same
 * (sentence, sitting) — even before the view arrives — belongs to the unit:
 *   lookups   TokenHelpOpened, PhraseHelpOpened, GrammarHelpOpened, DecodingRevealed (each event is one lookup)
 *   rescued   SentenceExplanationRevealed, EnglishRescueRevealed with scope 'sentence' | 'verse'
 *   decodings DecodingRevealed (a subset of the lookups); `romanized` those that used the romanization rescue
 * Help on a sentence that has no view in scope is not counted: numerators and denominators describe the same sentences.
 *
 * Sittings come from the learner's whole evidence log (sitting.ts), exactly as the folds derive them. The events are the
 * folder's in-memory log (userlog.ts); a scope that names texts reads only those texts' events.
 * Nothing here writes; nothing here waits on the fold queue.
 */
import type { LanguageCode } from '../core';
import type { Ctx } from './state';
import { eventsOfTexts } from './userlog';
import { cmp } from './util';

export interface ReadingUnit {
  key: string;
  sentenceId: string;
  textId: string;
  lang: LanguageCode;
  sitting: string;
  /** Time of the first view in the unit. */
  at: string;
  /** Word tokens of the sentence (restricted to the viewed tokens when the view named them). */
  words: number;
  /** Longest recorded dwell of the unit, when any view carried one. */
  dwellMs?: number;
  lookups: number;
  rescued: boolean;
  decodings: number;
  romanized: number;
}

export interface UnitScope {
  lang?: LanguageCode;
  /** Only these texts; undefined = every text. */
  textIds?: ReadonlySet<string>;
}

/** The texts of a stage: every imported text of every work listed at the stage. */
export async function stageTextIds(ctx: Ctx, stageId: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (const w of await ctx.store.works.where('stageId', stageId)) {
    for (const t of await ctx.store.texts.where('workId', w.id)) out.add(t.id);
  }
  return out;
}

export async function readingUnits(ctx: Ctx, userId: string, scope: UnitScope = {}): Promise<ReadingUnit[]> {
  // From the folder's in-memory log: one text's (or one stage's) events when the scope names texts, never a read of the event table.
  const log = await ctx.userLog(userId);
  const events = scope.textIds ? eventsOfTexts(log, scope.textIds) : log.events;
  const sittings = log.sittings;
  const inScope = (lang: LanguageCode, textId?: string) =>
    (!scope.lang || lang === scope.lang) && (!scope.textIds || (textId !== undefined && scope.textIds.has(textId)));
  const keyOf = (sentenceId: string, eventId: string) => `${sentenceId}\n${sittings.get(eventId) ?? ''}`;

  const units = new Map<string, ReadingUnit & { tokenIds: string[] }>();
  for (const e of events) {
    if (e.type !== 'SentenceViewed' || !inScope(e.lang, e.textId)) continue;
    const key = keyOf(e.sentenceId, e.id);
    let u = units.get(key);
    if (!u) {
      u = {
        key, sentenceId: e.sentenceId, textId: e.textId, lang: e.lang, sitting: sittings.get(e.id) ?? '', at: e.at, words: 0,
        lookups: 0, rescued: false, decodings: 0, romanized: 0, tokenIds: e.tokenIds ?? [],
      };
      units.set(key, u);
    }
    if (e.dwellMs !== undefined && e.dwellMs > 0 && (u.dwellMs === undefined || e.dwellMs > u.dwellMs)) u.dwellMs = e.dwellMs;
  }

  const touch = (sentenceId: string, eventId: string): (ReadingUnit & { tokenIds: string[] }) | undefined => units.get(keyOf(sentenceId, eventId));
  for (const e of events) {
    switch (e.type) {
      case 'TokenHelpOpened':
      case 'PhraseHelpOpened':
      case 'GrammarHelpOpened': {
        const u = touch(e.sentenceId, e.id);
        if (u) u.lookups += 1;
        break;
      }
      case 'DecodingRevealed': {
        const u = touch(e.sentenceId, e.id);
        if (u) { u.lookups += 1; u.decodings += 1; if (e.romanization) u.romanized += 1; }
        break;
      }
      case 'SentenceExplanationRevealed': {
        const u = touch(e.sentenceId, e.id);
        if (u) u.rescued = true;
        break;
      }
      case 'EnglishRescueRevealed': {
        if (e.scope === 'parallel') break; // the whole-passage parallel text is not a rescue of one sentence
        for (const sid of e.sentenceIds) { const u = touch(sid, e.id); if (u) u.rescued = true; }
        break;
      }
      default:
        break;
    }
  }

  // Word counts, one token read per distinct sentence.
  const wordIds = new Map<string, Set<string>>();
  for (const u of units.values()) {
    if (wordIds.has(u.sentenceId)) continue;
    wordIds.set(u.sentenceId, new Set((await ctx.store.tokens.where('sentenceId', u.sentenceId)).filter((t) => t.isWord).map((t) => t.id)));
  }
  const out: ReadingUnit[] = [];
  for (const u of units.values()) {
    const words = wordIds.get(u.sentenceId)!;
    const { tokenIds, ...unit } = u;
    unit.words = tokenIds.length > 0 ? tokenIds.filter((t) => words.has(t)).length : words.size;
    out.push(unit);
  }
  return out.sort((a, b) => cmp(a.at, b.at) || cmp(a.key, b.key));
}

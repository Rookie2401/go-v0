/**
 * Rescue dependence — how often a learner needed each kind of help while reading, and whether that is falling.
 *
 * A learner whose English sentence rescues fall from 30 in 100 sentences to 3 has made real progress, whatever a
 * level label says. So the kinds of help are kept apart, shallowest first:
 *   decoding        the script breakdown of a word was opened (DecodingRevealed)
 *   romanization    … and the transliteration rescue was used (a subset of decoding)
 *   word            a word's gloss was opened (TokenHelpOpened)
 *   phrase          a phrase explanation was opened (PhraseHelpOpened)
 *   grammar         a grammar explanation was opened (GrammarHelpOpened)
 *   explanation     the sentence was explained (SentenceExplanationRevealed)
 *   english         the sentence's English was shown (EnglishRescueRevealed, scope sentence or verse)
 * Word-level kinds are counted per 100 words read, sentence-level kinds per 100 sentences read.
 *
 * Grain and scope are those of reading pace (activity.ts): one sentence in one sitting is one unit; help counts only
 * when the same unit has a view, so numerators and denominators describe the same reading. Nothing is a score or a
 * target. The trend compares the earlier half of the units with the later half and says nothing below
 * `RESCUE.minUnitsForTrend` units — a few sentences prove nothing.
 *
 * Reads the folder's in-memory log (never the event table); writes nothing.
 */
import type { LanguageCode, RescueDependence, RescueKind, RescueRates } from '../core';
import { stageTextIds } from './activity';
import { RESCUE } from './policy';
import type { Ctx } from './state';
import { eventsOfTexts } from './userlog';
import { cmp, round1 } from './util';

interface Unit { key: string; at: string; words: number; tokenIds: string[]; sentenceId: string; counts: Record<RescueKind, number> }

const WORD_KINDS: readonly RescueKind[] = ['decoding', 'romanization', 'word', 'phrase', 'grammar'];
const SENTENCE_KINDS: readonly RescueKind[] = ['explanation', 'english'];
const zero = (): Record<RescueKind, number> => ({ decoding: 0, romanization: 0, word: 0, phrase: 0, grammar: 0, explanation: 0, english: 0 });

function ratesOf(units: Unit[]): RescueRates {
  const words = units.reduce((n, u) => n + u.words, 0);
  const sentences = units.length;
  const per100Words = {} as RescueRates['per100Words'];
  const per100Sentences = {} as RescueRates['per100Sentences'];
  for (const k of WORD_KINDS) per100Words[k as keyof RescueRates['per100Words']] = words > 0 ? round1((units.reduce((n, u) => n + u.counts[k], 0) / words) * 100) : 0;
  // a sentence rescued twice in one sitting is one rescued sentence
  for (const k of SENTENCE_KINDS) per100Sentences[k as keyof RescueRates['per100Sentences']] = sentences > 0 ? round1((units.filter((u) => u.counts[k] > 0).length / sentences) * 100) : 0;
  const unaided = units.filter((u) => [...WORD_KINDS, ...SENTENCE_KINDS].every((k) => u.counts[k] === 0)).length;
  return { sentences, words, per100Words, per100Sentences, unaidedSentenceShare: sentences > 0 ? round1((unaided / sentences) * 100) / 100 : 0 };
}

const direction = (earlier: number, recent: number): 'falling' | 'steady' | 'rising' => {
  if (recent <= earlier * (1 - RESCUE.change) && earlier - recent >= RESCUE.minAbsoluteChange) return 'falling';
  if (recent >= earlier * (1 + RESCUE.change) && recent - earlier >= RESCUE.minAbsoluteChange) return 'rising';
  return 'steady';
};

export async function rescueDependence(
  ctx: Ctx, userId: string, opts?: { textId?: string; stageId?: string; lang?: LanguageCode },
): Promise<RescueDependence> {
  let textIds: Set<string> | undefined;
  if (opts?.textId) textIds = new Set([opts.textId]);
  if (opts?.stageId) {
    const stage = await stageTextIds(ctx, opts.stageId);
    textIds = textIds ? new Set([...textIds].filter((t) => stage.has(t))) : stage;
  }
  const log = await ctx.userLog(userId);
  const events = textIds ? eventsOfTexts(log, textIds) : log.events;
  const sittings = log.sittings;
  const inScope = (lang: LanguageCode, textId?: string) => (!opts?.lang || lang === opts.lang) && (!textIds || (textId !== undefined && textIds.has(textId)));
  const keyOf = (sentenceId: string, eventId: string) => `${sentenceId}\n${sittings.get(eventId) ?? ''}`;

  const units = new Map<string, Unit>();
  for (const e of events) {
    if (e.type !== 'SentenceViewed' || !inScope(e.lang, e.textId)) continue;
    const key = keyOf(e.sentenceId, e.id);
    if (!units.has(key)) units.set(key, { key, at: e.at, words: 0, tokenIds: e.tokenIds ?? [], sentenceId: e.sentenceId, counts: zero() });
  }
  const bump = (sentenceId: string, eventId: string, kind: RescueKind) => { const u = units.get(keyOf(sentenceId, eventId)); if (u) u.counts[kind] += 1; };
  for (const e of events) {
    switch (e.type) {
      case 'TokenHelpOpened': bump(e.sentenceId, e.id, 'word'); break;
      case 'PhraseHelpOpened': bump(e.sentenceId, e.id, 'phrase'); break;
      case 'GrammarHelpOpened': bump(e.sentenceId, e.id, 'grammar'); break;
      case 'DecodingRevealed': bump(e.sentenceId, e.id, 'decoding'); if (e.romanization) bump(e.sentenceId, e.id, 'romanization'); break;
      case 'SentenceExplanationRevealed': bump(e.sentenceId, e.id, 'explanation'); break;
      case 'EnglishRescueRevealed':
        if (e.scope === 'parallel') break; // a whole parallel text is not the rescue of one sentence
        for (const sid of e.sentenceIds) bump(sid, e.id, 'english');
        break;
      default: break;
    }
  }

  // word counts: one token read per distinct sentence
  const wordIds = new Map<string, Set<string>>();
  for (const u of units.values()) {
    if (!wordIds.has(u.sentenceId)) wordIds.set(u.sentenceId, new Set((await ctx.store.tokens.where('sentenceId', u.sentenceId)).filter((t) => t.isWord).map((t) => t.id)));
    const words = wordIds.get(u.sentenceId)!;
    u.words = u.tokenIds.length > 0 ? u.tokenIds.filter((t) => words.has(t)).length : words.size;
  }
  const ordered = [...units.values()].sort((a, b) => cmp(a.at, b.at) || cmp(a.key, b.key));

  const out: RescueDependence = { overall: ratesOf(ordered), trend: 'insufficient-data' };
  if (ordered.length >= RESCUE.minUnitsForTrend) {
    const half = Math.floor(ordered.length / 2);
    const earlier = ratesOf(ordered.slice(0, half));
    const recent = ratesOf(ordered.slice(half));
    out.earlier = earlier;
    out.recent = recent;
    const kinds = {} as NonNullable<RescueDependence['byKind']>;
    for (const k of WORD_KINDS) kinds[k] = direction(earlier.per100Words[k as keyof RescueRates['per100Words']], recent.per100Words[k as keyof RescueRates['per100Words']]);
    for (const k of SENTENCE_KINDS) kinds[k] = direction(earlier.per100Sentences[k as keyof RescueRates['per100Sentences']], recent.per100Sentences[k as keyof RescueRates['per100Sentences']]);
    out.byKind = kinds;
    // the headline follows the deepest rescue: English shown for a sentence
    out.trend = kinds.english;
  }
  return out;
}

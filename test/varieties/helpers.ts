/** Event builders for the variety tests: a reader's events (with or without a stated variety) and GoReview's card events. */
import { CONTRACT_VERSION, cardIdFor } from '../../packages/repository-contract/src';
import type { GoEvent, UnitKnowledge } from '../../packages/repository-contract/src';
import { MODEL_VERSION, foldEvents } from '../../packages/repository-engine/src';

export const L = 'learner-1';
export const E = 'enrol-1';
let n = 0;
export const day = (d: number, h = 10): string => `2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00.000Z`;

export interface ReaderOpts {
  at: string; sentenceKey?: string; id?: string;
  /** The reader declares the variety (`payload.language`, basis override): Biblia. */
  declared?: string;
  /** The analyser settled it on the sentence (`payload.variety`, basis analysed). */
  analysed?: string;
  /** Only the enrolment's default speaks (`payload.language`, basis team-default): classifies nothing. */
  weak?: string;
}
const langOf = (unit: string): string => unit.split(':')[1]!;

export function reader(kind: GoEvent['kind'], unit: string, payload: Record<string, unknown>, o: ReaderOpts): GoEvent {
  const lang = langOf(unit);
  return {
    id: o.id ?? `r-${String(++n).padStart(4, '0')}`, v: CONTRACT_VERSION, learnerId: L, enrolmentId: E, languageId: lang, at: o.at,
    producer: { app: 'golearn-ext', version: '1', deviceId: 'd1' }, kind,
    subject: { itemIds: [unit], ...(o.sentenceKey ? { sentenceKey: o.sentenceKey } : {}) },
    payload: {
      ...payload,
      ...(o.declared ? { language: { languageId: lang, varietyId: o.declared, basis: 'override', confidence: 1, override: true } } : {}),
      ...(o.weak ? { language: { languageId: lang, varietyId: o.weak, basis: 'team-default', confidence: 0.3, override: false } } : {}),
      ...(o.analysed ? { variety: { varietyId: o.analysed, basis: 'analysed' } } : {}),
    },
  };
}
export const lookup = (unit: string, o: ReaderOpts): GoEvent => reader('SelectionLookedUp', unit, { tokenCount: 1, contextKind: 'sentence', contextConfidence: 1, readerId: 'r', helpShown: ['gloss'] }, o);
export const mark = (unit: string, level: string, o: ReaderOpts): GoEvent => reader('ItemMarked', unit, { mark: level }, o);
/** Met and marked in one variety: a lookup and its card's mark (the mark has no variety of its own; its sentence gives it one). */
export const met = (unit: string, varietyId: string, d: number, level = 'recognized', how: 'declared' | 'analysed' = 'declared'): GoEvent[] => {
  const sentenceKey = `s:${unit}:${varietyId}:${d}`;
  return [lookup(unit, { at: day(d), sentenceKey, [how]: varietyId }), mark(unit, level, { at: day(d, 11), sentenceKey })];
};

export interface CardOpts { at: string; id?: string; /** In the card's id: a card made since varieties were recorded. */ variety?: string; /** The old envelope variety of a card with the old id shape. */ stamp?: string }
const cardBase = (unit: string, o: CardOpts): Pick<GoEvent, 'v' | 'learnerId' | 'enrolmentId' | 'languageId' | 'at' | 'producer' | 'subject'> & { varietyId?: string } => ({
  v: 2, learnerId: L, enrolmentId: E, languageId: langOf(unit), at: o.at, ...((o.variety ?? o.stamp) ? { varietyId: o.variety ?? o.stamp } : {}),
  producer: { app: 'gopractice-review', version: '0.1.0', deviceId: 'd1' }, subject: { cardId: cardIdFor(unit, 'written-recognition', o.variety), itemIds: [unit] },
});
export const cardAdded = (unit: string, o: CardOpts): GoEvent => ({
  ...cardBase(unit, o), id: o.id ?? `a-${String(++n).padStart(4, '0')}`, kind: 'CardAdded', evidence: { quality: 'none' },
  payload: { unitId: unit, unitKind: 'lexeme', dimension: 'written-recognition', family: 'written-recognition', addedBy: 'intake' },
});
export const cardReviewed = (unit: string, rating: 1 | 2 | 3 | 4, o: CardOpts): GoEvent => ({
  ...cardBase(unit, o), id: o.id ?? `v-${String(++n).padStart(4, '0')}`, kind: 'CardReviewed',
  payload: { cardKind: 'recognition', grade: (['again', 'hard', 'good', 'easy'] as const)[rating - 1], correct: rating > 1, hinted: false, rating },
});

export const knowledgeOf = (events: GoEvent[]): UnitKnowledge[] => foldEvents(events, { modelVersion: MODEL_VERSION });

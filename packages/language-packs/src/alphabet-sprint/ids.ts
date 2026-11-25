/**
 * Card ids of the Alphabet Sprint. Every Sprint card is a GoReview `class:` unit, so it is kept out of the ordinary queue, My vocab,
 * the candidates and every vocabulary figure (packages/goreview/app/classEssentials.ts isClassUnit; the Repository's vocabulary
 * views skip `class:` ids too). A character card keeps the id the Alphabet deck has used since 2026-11-14, so a learner's letters
 * carry over:
 *
 *   class:<lang>-alphabet:<key>                     a character (letter, final form, vowel sign, mark, digraph, cluster, positional form, tone mark)
 *   class:<lang>-alphabet-rule:<key>                a decoding rule
 *   class:<lang>-alphabet-word:<form>               a word to decode
 *   class:<lang>-alphabet-phrase:<form>             a phrase to read
 *   class:<lang>-alphabet-contrast:<a>|<b>          two units told apart (keys sorted)
 *
 * A language read in more than one tradition (Greek: Modern and Classical sound values) adds `~<tradition>` after the kind for every
 * tradition but the default one: `class:el-alphabet~classical:β`. The third colon-separated part is the card's label on screens, so
 * a key never contains a colon.
 */
import type { SprintCardKind } from './types';

const KIND_SUFFIX: Readonly<Record<SprintCardKind, string>> = { character: '', rule: '-rule', word: '-word', phrase: '-phrase', contrast: '-contrast' };

export function sprintUnitId(languageId: string, kind: SprintCardKind, key: string, tradition?: string): string {
  if (key.includes(':')) throw new Error(`a Sprint key never contains a colon: ${key}`);
  return `class:${languageId}-alphabet${KIND_SUFFIX[kind]}${tradition ? `~${tradition}` : ''}:${key}`;
}

export const contrastKey = (a: string, b: string): string => [a, b].sort().join('|');

const ID = /^class:([a-z]+)-alphabet(-rule|-word|-phrase|-contrast)?(?:~([a-z]+))?:(.+)$/;

export interface ParsedSprintId { languageId: string; kind: SprintCardKind; tradition?: string; key: string }

export function parseSprintUnitId(unitId: string): ParsedSprintId | undefined {
  const m = ID.exec(unitId);
  if (!m) return undefined;
  const kind: SprintCardKind = m[2] === '-rule' ? 'rule' : m[2] === '-word' ? 'word' : m[2] === '-phrase' ? 'phrase' : m[2] === '-contrast' ? 'contrast' : 'character';
  return { languageId: m[1], kind, ...(m[3] ? { tradition: m[3] } : {}), key: m[4] };
}

/** Any Alphabet Sprint card (and the Alphabet deck's letters before it). */
export const isSprintUnitId = (unitId: string): boolean => ID.test(unitId);

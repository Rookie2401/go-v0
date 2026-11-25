/**
 * Reading Analysis: what the Repository's rows say of one word of the text. Runs in the background worker, where the full rows are.
 *
 * It decides nothing of its own about knowledge. A word's level is `levelOfRows` over its form row and its lemma row: the function GoLearn
 * Active colours the page with (src/active/levels.ts), so the two cannot disagree: the learner's own newest mark decides outright, else the
 * highest level either row supports. Known coverage counts the two top levels of the contract, Known and Automatic, and nothing below.
 *
 * Three cases need a rule beyond that, and each is the cautious one:
 *
 * 1. A spelling that is more than one word (several creditable readings). The word is Known when it is Known whichever reading is meant; not
 *    Known when none is; and `ambiguous` when the learner knows some of them and not others. It is then neither credited nor called unknown.
 *
 * 2. A language with learning varieties (Greek, Hebrew: repository-contract/src/varieties.ts). Rows are read in the text's variety with
 *    `knowledgeInVariety`, the contract's one reader. A word is credited as Known only when (a) that view says Known or Automatic and (b)
 *    the unit's evidence CLASSIFIED in that variety says so by itself (`ownKnowledgeOf`). A word Known only through records that nothing
 *    assigns to a variety (every mark and review made before varieties were recorded) is `unsettled`: reported, not credited. A legacy,
 *    language-wide mark therefore never establishes mastery of a particular variety, and what is known in another variety never counts here.
 *
 * 3. A word neither the analyser nor the dictionary could tie to a lemma. If the learner has a record of that exact form (they marked or
 *    looked up that spelling), the form's own row answers. Otherwise the word is `unidentified`: never assumed unknown, never guessed.
 */
import type { UnitKnowledge } from '../../../repository-contract/src';
import { KNOWLEDGE_LEVEL_RANK, isKnowledgeLevel, type KnowledgeLevel } from '../../../repository-contract/src/knowledge-levels';
import { hasLearningVarieties, hasSharedCore, knowledgeInVariety, ownKnowledgeOf, textVarietyOf } from '../../../repository-contract/src/varieties';
import { levelOfRows } from '../active/levels';
import { compactKnowledge } from '../background/profile';
import type { WireVerdict, WireWord } from './protocol';

/** The row of a unit, or undefined when the Repository holds none (a verified absence: the caller has asked and been answered). */
export type RowOf = (unitId: string) => UnitKnowledge | undefined;

const isKnown = (level: KnowledgeLevel): boolean => level === 'known' || level === 'automatic';
const higher = (a: KnowledgeLevel, b: KnowledgeLevel): KnowledgeLevel => (KNOWLEDGE_LEVEL_RANK[a] >= KNOWLEDGE_LEVEL_RANK[b] ? a : b);
const lower = (a: KnowledgeLevel, b: KnowledgeLevel): KnowledgeLevel => (KNOWLEDGE_LEVEL_RANK[a] <= KNOWLEDGE_LEVEL_RANK[b] ? a : b);

type One = { state: 'known' | 'unsettled' | 'below'; level: KnowledgeLevel };

/**
 * The row as the page's level reader takes it. A row (or a variety's view of one) whose level is not one of the six is damaged: the reader would
 * otherwise work a level out from the dimensions by older thresholds and could call a Familiar word Known. It throws; the caller refuses the batch.
 */
function strict(k: UnitKnowledge): ReturnType<typeof compactKnowledge> {
  if (!isKnowledgeLevel(k.level)) throw new RangeError('a row with no valid level');
  return compactKnowledge(k);
}

/** One reading of a word: its form row and (when it has one) its lemma row, read in the text's variety. */
function readOne(rows: Array<UnitKnowledge | undefined>, languageId: string, varietyId: string | undefined): One {
  if (!hasLearningVarieties(languageId)) {
    const level = levelOfRows(rows.map((r) => (r ? strict(r) : undefined)));
    return { state: isKnown(level) ? 'known' : 'below', level };
  }
  const level = levelOfRows(rows.map((r) => (r ? strict(knowledgeInVariety(r, varietyId).knowledge) : undefined)));
  if (!isKnown(level)) return { state: 'below', level };
  // Known in the variety's view: is it Known on evidence that belongs to this variety, or only on records nothing assigns to one?
  // Where the varieties are dialects with a shared core (Albanian), a record nothing assigns IS a record of this variety: the word was
  // met as every dialect writes it. The view itself already leaves out what was met only in another dialect.
  const own = hasSharedCore(languageId) || (varietyId ? rows.some((r) => { const o = ownKnowledgeOf(r, varietyId); return !!o && isKnown(o.level); }) : false);
  return { state: own ? 'known' : 'unsettled', level };
}

/**
 * The verdict on one word. `varietyId` must be a variety of the language when the language has learning varieties (the caller refuses the
 * request otherwise); it is ignored for every other language.
 */
export function classifyWord(word: WireWord, rowOf: RowOf, languageId: string, varietyId?: string): WireVerdict {
  const [formId, ...readings] = word;
  const variety = hasLearningVarieties(languageId) ? textVarietyOf(languageId, varietyId) : undefined;
  const form = rowOf(formId);
  if (!readings.length) {
    if (!form) return ['unidentified', 'new'];
    const one = readOne([form], languageId, variety);
    return [one.state, one.level];
  }
  const each = readings.map((id) => readOne([form, rowOf(id)], languageId, variety));
  if (each.length === 1) return [each[0].state, each[0].level];
  const anyBelow = each.some((o) => o.state === 'below');
  const anyAbove = each.some((o) => o.state !== 'below');
  if (anyBelow && anyAbove) return ['ambiguous', each[0].level]; // the learner knows one of the words this spelling can be, not all
  if (anyBelow) return ['below', each.reduce<KnowledgeLevel>((m, o) => higher(m, o.level), 'new')];
  // Known whichever reading is meant; credited only when every reading is credited
  const level = each.reduce<KnowledgeLevel>((m, o) => lower(m, o.level), 'automatic');
  return [each.every((o) => o.state === 'known') ? 'known' : 'unsettled', level];
}

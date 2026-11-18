/**
 * Language varieties as a LEARNING dimension (2026-11-17, docs/ecosystem/LANGUAGE-VARIETIES.md).
 *
 * One language, several varieties. Greek stays `el` and Hebrew stays `he`: a unit id (`lemma:el:λόγος:NOUN`) names the lexical item and is
 * SHARED by the varieties that spell it alike, which is exactly the lexical relationship between them. What is NOT shared is what a learner
 * has shown: a knowledge estimate, a review card and its schedule belong to one variety of the item.
 *
 *   lexical identity     the unit id (shared; relations between units stay in ./units)
 *   learning identity    unit id + variety (`UnitKnowledge.varieties[varietyId]`, `cardIdFor(unitId, dimension, varietyId)`)
 *   review scope         the varieties one review queue draws from (`ReviewScope`)
 *
 * The registry below is DATA. A language absent from it has no learning varieties: its regional varieties (es-HN, de-AT …) are usage
 * labels, never separate learning tasks, and everything in this file leaves such a language exactly as it was. Albanian is in it:
 * Gheg and the Standard differ in forms a learner must learn separately, not only in usage.
 *
 * The ids are the ones the packs and the stored events already use (`el-koi`, `he-bib` …); the longer spellings some documents use
 * (`grc-koine`, `he-biblical` …) are accepted as aliases and never stored.
 */
import type { GoEvent } from './index';
import { KNOWLEDGE_LEVEL_RANK } from './knowledge-levels';
import type { KnowledgeLevel } from './knowledge-levels';
import type { UnitKnowledge, VarietyKnowledge, WholeVariety } from './learner';

export type LanguageId = string;
export type VarietyId = string;

export interface LanguageVariety {
  /** Stable, persisted id. */
  id: VarietyId;
  parentLanguage: LanguageId;
  name: string;
  /** The stage of the language it belongs to (`ancient`, `modern`, `biblical` …): varieties of one group are closer than varieties of two. */
  historicalGroup: string;
  /** Approximate years (negative = BCE); a description, never a rule. */
  period?: { from?: number; to?: number };
  /** The other varieties of the language, nearest first (same group before other groups). Filled when the registry is built. */
  relatedVarieties: VarietyId[];
  /** Other spellings of the id accepted on input. */
  aliases: readonly string[];
  /** A learner may choose it as a review scope (the pack analyses it). The others are recognised on evidence and kept apart all the same. */
  selectable: boolean;
  /** A related language read beside this one (Biblical Aramaic inside the Hebrew Bible): its own learning identity, never credited to the language. */
  heritage?: boolean;
}

export interface LanguageVarieties {
  languageId: LanguageId;
  /** The variety an enrolment gets when nothing was chosen (the pack's default target). A stamp of it on a legacy record is not evidence. */
  defaultVarietyId: VarietyId;
  varieties: readonly LanguageVariety[];
}

type Seed = Omit<LanguageVariety, 'parentLanguage' | 'relatedVarieties' | 'aliases' | 'selectable'> & { aliases?: string[]; selectable?: boolean };

function build(languageId: LanguageId, defaultVarietyId: VarietyId, seeds: Seed[]): LanguageVarieties {
  const varieties = seeds.map((s): LanguageVariety => ({
    ...s, parentLanguage: languageId, aliases: s.aliases ?? [], selectable: s.selectable ?? false,
    relatedVarieties: [
      ...seeds.filter((o) => o.id !== s.id && !o.heritage && !s.heritage && o.historicalGroup === s.historicalGroup),
      ...seeds.filter((o) => o.id !== s.id && !o.heritage && !s.heritage && o.historicalGroup !== s.historicalGroup),
    ].map((o) => o.id),
  }));
  return { languageId, defaultVarietyId, varieties };
}

const REGISTRY = new Map<LanguageId, LanguageVarieties>();

/** Adds or replaces the learning varieties of a language. The built-in ones are Greek and Hebrew; a pack may add its own. */
export function defineLanguageVarieties(languageId: LanguageId, defaultVarietyId: VarietyId, seeds: Seed[]): LanguageVarieties {
  if (!seeds.some((s) => s.id === defaultVarietyId)) throw new RangeError(`the default variety ${defaultVarietyId} is not among the varieties of ${languageId}`);
  const made = build(languageId, defaultVarietyId, seeds);
  REGISTRY.set(languageId, made);
  return made;
}

defineLanguageVarieties('el', 'el-mod', [
  { id: 'el-hom', name: 'Homeric Greek', historicalGroup: 'ancient', period: { from: -800, to: -600 }, aliases: ['grc-homeric', 'grc-hom', 'grc-epic'], selectable: true },
  { id: 'el-att', name: 'Classical (Attic) Greek', historicalGroup: 'ancient', period: { from: -500, to: -300 }, aliases: ['grc-classical', 'grc-attic', 'grc-att'], selectable: true },
  { id: 'el-koi', name: 'Koine Greek', historicalGroup: 'ancient', period: { from: -300, to: 600 }, aliases: ['grc-koine', 'grc-koi'], selectable: true },
  { id: 'el-ion', name: 'Ionic Greek', historicalGroup: 'ancient', aliases: ['grc-ionic'] },
  { id: 'el-dor', name: 'Doric Greek', historicalGroup: 'ancient', aliases: ['grc-doric'] },
  { id: 'el-aeo', name: 'Aeolic Greek', historicalGroup: 'ancient', aliases: ['grc-aeolic'] },
  { id: 'el-med', name: 'Medieval (Byzantine) Greek', historicalGroup: 'medieval', period: { from: 600, to: 1453 }, aliases: ['grc-byzantine', 'gkm'] },
  { id: 'el-mod', name: 'Modern Greek', historicalGroup: 'modern', period: { from: 1453 }, aliases: ['el-modern', 'ell'], selectable: true },
]);

defineLanguageVarieties('he', 'he-mod', [
  { id: 'he-bib', name: 'Biblical Hebrew', historicalGroup: 'biblical', period: { from: -1000, to: -200 }, aliases: ['he-biblical', 'hbo'], selectable: true },
  { id: 'he-mish', name: 'Mishnaic (Rabbinic) Hebrew', historicalGroup: 'rabbinic', period: { from: 0, to: 500 }, aliases: ['he-mishnaic', 'he-rabbinic'] },
  { id: 'he-med', name: 'Medieval Hebrew', historicalGroup: 'medieval', period: { from: 500, to: 1800 }, aliases: ['he-medieval'] },
  { id: 'he-mod', name: 'Modern Hebrew', historicalGroup: 'modern', period: { from: 1880 }, aliases: ['he-modern', 'heb'], selectable: true },
  { id: 'arc-bib', name: 'Biblical Aramaic', historicalGroup: 'aramaic', aliases: [], heritage: true },
]);

/**
 * Albanian: one language, its dialects as learning varieties (the owner, 2026-11-18). Standard Albanian and Gheg are the two a learner
 * may choose; a sentence is assigned to one of them only on its own forms (src/adapters/albanian/dialect.ts). Tosk as a dialect,
 * Arbëresh and Arvanitika are recognised from a dictionary's label on a word and kept apart, never chosen. They are living dialects
 * of one time, so they form ONE group: what is Known in one is strong familiarity in another (transferEvidence), and still not mastery there.
 * The ids are the pack's own (`sq-standard`, `sq-gheg`); the adapter's codes and the ISO codes are aliases.
 */
defineLanguageVarieties('sq', 'sq-standard', [
  { id: 'sq-standard', name: 'Standard Albanian', historicalGroup: 'modern', period: { from: 1972 }, aliases: ['sq', 'sqi', 'standard'], selectable: true },
  { id: 'sq-gheg', name: 'Gheg', historicalGroup: 'modern', aliases: ['aln', 'aln-xk', 'aln-al', 'gheg'], selectable: true },
  { id: 'sq-tosk', name: 'Tosk (dialect)', historicalGroup: 'modern', aliases: ['als', 'tosk'] },
  { id: 'sq-arbereshe', name: 'Arbëresh (Italy)', historicalGroup: 'modern', aliases: ['aae', 'arberesh', 'arbëresh'] },
  { id: 'sq-arvanitika', name: 'Arvanitika (Greece)', historicalGroup: 'modern', aliases: ['aat', 'arvanitika'] },
]);

// ───────────────────────────── the registry, read ─────────────────────────────

/** The learning varieties of a language, in registry order; undefined for a language that has none. */
export const languageVarieties = (languageId: LanguageId): LanguageVarieties | undefined => REGISTRY.get(languageId);
export const hasLearningVarieties = (languageId: LanguageId): boolean => REGISTRY.has(languageId);
export const learningVarietiesOf = (languageId: LanguageId): readonly LanguageVariety[] => REGISTRY.get(languageId)?.varieties ?? [];
/** The varieties a learner may choose to review, in registry order. */
export const selectableVarietiesOf = (languageId: LanguageId): readonly LanguageVariety[] => learningVarietiesOf(languageId).filter((v) => v.selectable);
export const defaultVarietyOf = (languageId: LanguageId): VarietyId | undefined => REGISTRY.get(languageId)?.defaultVarietyId;

/** The registry id a variety id or alias names in this language; undefined when the language has no learning varieties or does not know it. */
export function canonicalVarietyId(languageId: LanguageId, id: unknown): VarietyId | undefined {
  if (typeof id !== 'string' || !id) return undefined;
  const key = id.trim().toLowerCase();
  for (const v of learningVarietiesOf(languageId)) if (v.id === key || v.aliases.includes(key)) return v.id;
  return undefined;
}

export function varietyOf(languageId: LanguageId, id: unknown): LanguageVariety | undefined {
  const canonical = canonicalVarietyId(languageId, id);
  return canonical ? learningVarietiesOf(languageId).find((v) => v.id === canonical) : undefined;
}

/**
 * How two varieties of one language stand to each other. `same-group`: two stages or dialects of one period (Attic and Koine).
 * `other-group`: two periods (Biblical and Modern Hebrew). `heritage`: one of them is a related language read beside it.
 */
export type VarietyRelation = 'same' | 'same-group' | 'other-group' | 'heritage' | 'unrelated';
export function varietyRelation(languageId: LanguageId, a: VarietyId, b: VarietyId): VarietyRelation {
  const va = varietyOf(languageId, a), vb = varietyOf(languageId, b);
  if (!va || !vb) return 'unrelated';
  if (va.id === vb.id) return 'same';
  if (va.heritage || vb.heritage) return 'heritage';
  return va.historicalGroup === vb.historicalGroup ? 'same-group' : 'other-group';
}

// ───────────────────────────── review identity ─────────────────────────────

/**
 * The id of the review card of one unit, tested along one dimension, in one variety.
 *
 *   card:<dimension>:<unitId>                 no variety: a language without learning varieties, or a record whose variety is not settled
 *   card:<dimension>@<varietyId>:<unitId>     one variety of a language that has them
 *
 * The first shape is every card written before 2026-11-17 and stays valid for ever. The variety stands before the unit id because a unit
 * id may contain any character; a dimension and a variety id never contain `:` or `@`.
 */
export function cardIdFor(unitId: string, dimension: string, varietyId?: VarietyId): string {
  return `card:${dimension}${varietyId ? `@${varietyId}` : ''}:${unitId}`;
}

export interface ParsedCardId { dimension: string; varietyId?: VarietyId; unitId: string }
export function parseCardId(cardId: unknown): ParsedCardId | undefined {
  if (typeof cardId !== 'string' || !cardId.startsWith('card:')) return undefined;
  const rest = cardId.slice('card:'.length);
  const cut = rest.indexOf(':');
  if (cut <= 0 || cut === rest.length - 1) return undefined;
  const head = rest.slice(0, cut), unitId = rest.slice(cut + 1);
  const at = head.indexOf('@');
  if (at < 0) return { dimension: head, unitId };
  if (at === 0 || at === head.length - 1) return undefined;
  return { dimension: head.slice(0, at), varietyId: head.slice(at + 1), unitId };
}

// ───────────────────────────── which variety an event belongs to ─────────────────────────────

/**
 * How an event's variety was settled.
 *   declared   the reader or the learner said so (Biblia reading the Hebrew Bible; a page that declares `hbo`; the learner's own override)
 *   analysed   the analyser read the SENTENCE in that period on evidence in the sentence (cantillation, polytonic spelling, its words)
 *   scope      the learner acted inside a chosen review scope of one variety (a mark in GoReview's word list)
 *   card       the review card's own id names the variety
 *   context    a follow-up event of a sentence whose lookup was classified (a mark or a help request on the same card)
 *   legacy     a record written before varieties were recorded, assigned by `legacyVarietyOf`
 */
export const VARIETY_BASES = ['declared', 'analysed', 'scope'] as const;
export type StatedVarietyBasis = (typeof VARIETY_BASES)[number];
export type VarietyBasis = StatedVarietyBasis | 'card' | 'context' | 'legacy';

/** `payload.variety` (additive, any event kind): the variety the observation belongs to and how that was settled. Absent on every older event. */
export interface VarietyStatement { varietyId: VarietyId; basis: StatedVarietyBasis }

export function validateVarietyStatement(v: unknown, path = 'payload.variety'): Array<{ path: string; message: string }> {
  if (v === undefined) return [];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return [{ path, message: 'object' }];
  const x = v as Record<string, unknown>;
  const out: Array<{ path: string; message: string }> = [];
  if (typeof x.varietyId !== 'string' || !x.varietyId.length || x.varietyId.length > 200) out.push({ path: `${path}.varietyId`, message: 'required string of at most 200 characters' });
  if (!(VARIETY_BASES as readonly string[]).includes(String(x.basis))) out.push({ path: `${path}.basis`, message: `one of ${VARIETY_BASES.join(', ')}` });
  return out;
}

const DECLARED_LANGUAGE_BASES = new Set(['override', 'book-metadata', 'document-metadata']);
const REVIEW_PRODUCER = 'gopractice-review';

export interface EventVariety { varietyId: VarietyId; basis: VarietyBasis }

/**
 * The variety an event states for itself, or undefined. Never a guess: an enrolment's variety on the envelope (`event.varietyId`) is the
 * learner's TARGET, not a statement about the text, and is not read here (see `legacyStampOf`).
 *   1. a review card whose id names a variety;
 *   2. `payload.variety`;
 *   3. `payload.language` when the language itself was declared (not detected, not the enrolment's default) and names a variety.
 */
export function statedVarietyOf(e: Pick<GoEvent, 'languageId' | 'subject' | 'payload'>): EventVariety | undefined {
  if (!hasLearningVarieties(e.languageId)) return undefined;
  const card = canonicalVarietyId(e.languageId, parseCardId(e.subject?.cardId)?.varietyId);
  if (card) return { varietyId: card, basis: 'card' };
  const payload = (e.payload ?? {}) as { variety?: { varietyId?: unknown; basis?: unknown }; language?: { languageId?: unknown; varietyId?: unknown; basis?: unknown } };
  const stated = canonicalVarietyId(e.languageId, payload.variety?.varietyId);
  if (stated && (VARIETY_BASES as readonly string[]).includes(String(payload.variety?.basis))) return { varietyId: stated, basis: payload.variety!.basis as StatedVarietyBasis };
  const language = payload.language;
  if (language && language.languageId === e.languageId && DECLARED_LANGUAGE_BASES.has(String(language.basis))) {
    const declared = canonicalVarietyId(e.languageId, language.varietyId);
    if (declared) return { varietyId: declared, basis: 'declared' };
  }
  return undefined;
}

/**
 * The variety GoReview stamped on the envelope of a record written before varieties were recorded: the ENROLMENT's variety at the time.
 * Only GoReview's own events are read (a card's events, a mark in its word list); a reader's envelope never carried one.
 */
export function legacyStampOf(e: Pick<GoEvent, 'languageId' | 'varietyId' | 'producer' | 'subject' | 'payload'>): VarietyId | undefined {
  if (e.producer?.app !== REVIEW_PRODUCER || statedVarietyOf(e)) return undefined;
  return canonicalVarietyId(e.languageId, e.varietyId);
}

/** True for a GoReview record that states no variety of its own: a card with the old id shape and its events, or a mark. */
export const isLegacyReviewRecord = (e: Pick<GoEvent, 'languageId' | 'producer' | 'subject' | 'payload'>): boolean =>
  hasLearningVarieties(e.languageId) && e.producer?.app === REVIEW_PRODUCER && !statedVarietyOf(e);

/**
 * The variety of a legacy record (a card with the old id shape, or a mark made in GoReview), from what is known of the unit AT THE TIME the
 * record began. `classifiedBefore` lists the varieties in which the unit had classified evidence at or before that instant. Fixed inputs
 * give a fixed answer: evidence that arrives later never moves an older record.
 *
 *   one variety classified      that variety, unless the stamp names another variety that is not the language's default (a conflict)
 *   several                     the stamp, when it is one of them; otherwise unsettled
 *   none                        the stamp, when it is not the language's default variety; otherwise unsettled
 *
 * A stamp of the default variety is what an enrolment gets when nobody chose, so by itself it settles nothing. Unsettled = undefined:
 * the record is kept whole and is never put in a modern or a historical queue by assumption.
 */
export function legacyVarietyOf(languageId: LanguageId, stamp: VarietyId | undefined, classifiedBefore: readonly VarietyId[]): VarietyId | undefined {
  if (!hasLearningVarieties(languageId)) return undefined;
  const seen = [...new Set(classifiedBefore.map((v) => canonicalVarietyId(languageId, v)).filter((v): v is string => !!v))];
  const s = canonicalVarietyId(languageId, stamp);
  const chosen = s !== undefined && s !== defaultVarietyOf(languageId);
  if (seen.length === 1) return chosen && s !== seen[0] ? undefined : seen[0];
  if (seen.length > 1) return s !== undefined && seen.includes(s) ? s : undefined;
  return chosen ? s : undefined;
}

// ───────────────────────────── review scope ─────────────────────────────

/**
 * What one review queue draws from: one language and the varieties named, nothing else. A queue never holds a card of a variety outside
 * its scope. `includeUnsettled` (default true) also admits the records whose variety is not settled (legacy cards and words nothing
 * classifies): they belong to no variety, so leaving them out of every queue would strand them.
 */
export interface ReviewScope {
  languageId: LanguageId;
  varietyIds: VarietyId[];
  includeUnsettled?: boolean;
}

/** A scope with canonical, de-duplicated ids in registry order; ids the language does not know are dropped. undefined for a language without learning varieties. */
export function normalizeScope(scope: { languageId: LanguageId; varietyIds?: readonly unknown[]; includeUnsettled?: unknown } | undefined): ReviewScope | undefined {
  if (!scope || !hasLearningVarieties(scope.languageId)) return undefined;
  const wanted = new Set((scope.varietyIds ?? []).map((v) => canonicalVarietyId(scope.languageId, v)).filter((v): v is string => !!v));
  const varietyIds = learningVarietiesOf(scope.languageId).map((v) => v.id).filter((id) => wanted.has(id));
  return { languageId: scope.languageId, varietyIds, includeUnsettled: scope.includeUnsettled !== false };
}

/**
 * The scope used when the learner has chosen none: ONE variety, never a combination.
 *   1. the enrolment's variety, when the language knows it;
 *   2. else the only variety the learner has studied, when there is exactly one;
 *   3. else, of several studied, the one studied most recently (`studied` is given most recent first);
 *   4. else the language's default variety.
 */
export function defaultScope(languageId: LanguageId, enrolmentVarietyId?: VarietyId, studied: readonly VarietyId[] = []): ReviewScope | undefined {
  if (!hasLearningVarieties(languageId)) return undefined;
  const pick = canonicalVarietyId(languageId, enrolmentVarietyId)
    ?? studied.map((v) => canonicalVarietyId(languageId, v)).find((v): v is string => !!v)
    ?? defaultVarietyOf(languageId)!;
  return { languageId, varietyIds: [pick], includeUnsettled: true };
}

/** True when a record of `varietyId` (undefined = unsettled) belongs in the scope. A language without learning varieties has no scope: everything belongs. */
export function inScope(scope: ReviewScope | undefined, varietyId: VarietyId | undefined): boolean {
  if (!scope) return true;
  if (varietyId === undefined) return scope.includeUnsettled !== false;
  return scope.varietyIds.includes(varietyId);
}

// ───────────────────────────── knowledge of one variety ─────────────────────────────

/** How a variety's view of a unit came about. */
export type VarietyViewBasis =
  | 'no-varieties'   // the language has no learning varieties: the row itself
  | 'classified'     // the unit has classified evidence in this variety
  | 'unsettled'      // nothing of the unit is classified: the row itself, carried over as it was (never assigned to a variety)
  | 'not-met';       // the unit is known in other varieties only: new here, see `transferEvidence`

export interface VarietyView {
  varietyId?: VarietyId;
  basis: VarietyViewBasis;
  /** A row to read exactly as a `UnitKnowledge` is read (level, dimensions, mark): what the learner has shown in this variety. */
  knowledge: UnitKnowledge;
}

const emptyDimensions = (row: UnitKnowledge): UnitKnowledge['dimensions'] => Object.fromEntries(Object.keys(row.dimensions).map((d) => [d,
  { score: d === 'exposure' ? 0 : 0.5, confidence: 0, observations: 0, positive: 0, negative: 0, weight: 0, contexts: 0, independentPositiveEvents: 0, delayedIndependentPositiveEvents: 0 }])) as UnitKnowledge['dimensions'];

const isWhole = (slice: VarietyKnowledge | WholeVariety | undefined): slice is WholeVariety => !!slice && (slice as { whole?: unknown }).whole === true;

/** The varieties a row has CLASSIFIED evidence in (registry order). Empty for a row nothing classifies and for a language without varieties. */
export function classifiedVarietiesOf(row: Pick<UnitKnowledge, 'languageId' | 'varieties'> | undefined): VarietyId[] {
  if (!row?.varieties) return [];
  return learningVarietiesOf(row.languageId).map((v) => v.id).filter((id) => {
    const slice = row.varieties![id];
    return isWhole(slice) || (!!slice && slice.own.events > 0);
  });
}

/** What the unit's classified evidence in one variety alone amounts to (no unclassified record counted); undefined when there is none. */
export function ownKnowledgeOf(row: UnitKnowledge | undefined, varietyId: VarietyId): { level: KnowledgeLevel; events: number; reader: number; review: number; firstAt?: string; lastAt?: string } | undefined {
  const slice = row?.varieties?.[varietyId];
  if (!row || !slice) return undefined;
  if (isWhole(slice)) return { level: row.level, events: row.basis.events, reader: row.sources?.reader ?? 0, review: row.sources?.review ?? 0, ...(slice.firstAt ? { firstAt: slice.firstAt } : {}), ...(row.lastSeenAt ? { lastAt: row.lastSeenAt } : {}) };
  return slice.own.events > 0 ? slice.own : undefined;
}

/**
 * The learner's knowledge of a unit IN ONE VARIETY. A language without learning varieties, and a call without a variety, give the row
 * itself. Otherwise:
 *   - the variety's own slice, when the unit has classified evidence there (records nothing classifies are folded into every slice, so a
 *     legacy mark keeps its force and is never assigned to a variety);
 *   - the row itself, when nothing of the unit is classified at all;
 *   - a NEW row, when the unit is known in other varieties only. What is known there never becomes knowledge here.
 */
export function knowledgeInVariety(row: UnitKnowledge, varietyId: VarietyId | undefined): VarietyView {
  if (!hasLearningVarieties(row.languageId)) return { basis: 'no-varieties', knowledge: row };
  const id = canonicalVarietyId(row.languageId, varietyId);
  if (!id) return { basis: classifiedVarietiesOf(row).length ? 'classified' : 'unsettled', knowledge: row };
  const slices = row.varieties;
  if (!slices || !Object.keys(slices).length) return { varietyId: id, basis: 'unsettled', knowledge: row };
  const slice = slices[id];
  if (isWhole(slice)) return { varietyId: id, basis: 'classified', knowledge: row };
  if (slice) {
    const { own: _own, ...view } = slice;
    return { varietyId: id, basis: slice.own.events > 0 ? 'classified' : 'not-met', knowledge: { ...row, ...view, ...(view.selfMark ? {} : { selfMark: undefined }), legacyKnowability: undefined } };
  }
  // known in other varieties only: whatever nothing classifies still counts here (the `unclassified` slice), the other varieties do not
  const loose = row.unclassified;
  if (loose) return { varietyId: id, basis: 'not-met', knowledge: { ...row, ...loose, ...(loose.selfMark ? {} : { selfMark: undefined }), legacyKnowability: undefined } };
  return {
    varietyId: id, basis: 'not-met',
    knowledge: { ...row, dimensions: emptyDimensions(row), retention: { estimate: 0, halfLifeDays: row.retention.halfLifeDays, basedOn: 'none' }, uncertainty: 1,
      level: 'new', encounters: 0, selfMark: undefined, firstSeenAt: undefined, lastSeenAt: undefined, basis: { events: 0 }, legacyKnowability: undefined },
  };
}

/** Every row read in one variety (rows of other languages untouched). The shape a variety-unaware reader of rows expects. */
export function knowledgeRowsInVariety(rows: readonly UnitKnowledge[], varietyId: VarietyId | undefined): UnitKnowledge[] {
  return rows.map((row) => knowledgeInVariety(row, varietyId).knowledge);
}

// ───────────────────────────── transfer between varieties ─────────────────────────────

/**
 * How much what is known in one variety says about a related item in another. A statement about FAMILIARITY (the learner may recognise
 * the item), never about mastery: nothing here writes a review, a level, a due date or a schedule.
 *
 *   strong     the same lexical item (one unit id) in another variety of the SAME historical group, known or better there
 *   moderate   the same lexical item in a variety of ANOTHER group, known or better; or the same group, familiar or recognised
 *   weak       anything else that is met there: another group at a lower level, or an item related by spelling only
 *
 * Only `strong` and `moderate` may move an item's place in a queue (`transferPriority`); `weak` is reported and changes nothing.
 * Shared spelling is not shared meaning, and a shared root is not a shared word: no rule here reads a relation as equivalence.
 */
export type TransferStrength = 'strong' | 'moderate' | 'weak';
export type LexicalLink = 'same-item' | 'same-spelling-family';
export interface TransferEvidence {
  /** The unit the evidence is about in the other variety (the same id for `same-item`). */
  unitId: string;
  fromVarietyId: VarietyId;
  relation: VarietyRelation;
  link: LexicalLink;
  /** The level the learner reached there on classified evidence alone. */
  level: KnowledgeLevel;
  strength: TransferStrength;
}

function strengthOf(relation: VarietyRelation, link: LexicalLink, level: KnowledgeLevel): TransferStrength | undefined {
  const rank = KNOWLEDGE_LEVEL_RANK[level];
  if (rank < KNOWLEDGE_LEVEL_RANK.seen || relation === 'same' || relation === 'unrelated' || relation === 'heritage') return undefined;
  if (link !== 'same-item' || rank < KNOWLEDGE_LEVEL_RANK.recognized) return 'weak';
  if (relation === 'same-group') return rank >= KNOWLEDGE_LEVEL_RANK.known ? 'strong' : 'moderate';
  return rank >= KNOWLEDGE_LEVEL_RANK.known ? 'moderate' : 'weak';
}

/**
 * What the learner's knowledge in OTHER varieties says about this unit in `varietyId`, strongest first. `family` are rows of other units
 * the caller holds to be the same word differently spelled (`lexicalFamilyKey`); they can only ever give `weak` evidence.
 */
export function transferEvidence(row: UnitKnowledge | undefined, varietyId: VarietyId, family: readonly UnitKnowledge[] = []): TransferEvidence[] {
  const out: TransferEvidence[] = [];
  const add = (source: UnitKnowledge, link: LexicalLink): void => {
    for (const other of classifiedVarietiesOf(source)) {
      if (other === varietyId) continue;
      const own = ownKnowledgeOf(source, other);
      if (!own) continue;
      const relation = varietyRelation(source.languageId, varietyId, other);
      const strength = strengthOf(relation, link, own.level);
      if (strength) out.push({ unitId: source.unitId, fromVarietyId: other, relation, link, level: own.level, strength });
    }
  };
  if (row && canonicalVarietyId(row.languageId, varietyId)) add(row, 'same-item');
  for (const other of family) if (other.unitId !== row?.unitId && canonicalVarietyId(other.languageId, varietyId)) add(other, 'same-spelling-family');
  const order: Record<TransferStrength, number> = { strong: 0, moderate: 1, weak: 2 };
  return out.sort((a, b) => order[a.strength] - order[b.strength] || KNOWLEDGE_LEVEL_RANK[b.level] - KNOWLEDGE_LEVEL_RANK[a.level]
    || (a.fromVarietyId < b.fromVarietyId ? -1 : a.fromVarietyId > b.fromVarietyId ? 1 : 0) || (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0));
}

/** 2, 1 or 0: a deterministic tie-break for the order new items are introduced in. Weak evidence is 0, like none. */
export function transferPriority(evidence: readonly TransferEvidence[]): 0 | 1 | 2 {
  if (evidence.some((e) => e.strength === 'strong')) return 2;
  return evidence.some((e) => e.strength === 'moderate') ? 1 : 0;
}

/**
 * A key that two unit ids share when they are the same letters under the spelling conventions of different periods: Hebrew without its
 * points and accents, Greek without breathings and accents, lower case, final sigma folded. `lemma:he:מֶלֶךְ:NOUN` and `lemma:he:מלך:NOUN`
 * share one. It relates SPELLINGS: it never says two words mean the same, and the evidence it gives is always `weak`.
 * undefined for an id that is not a lemma or a form of a language with learning varieties.
 */
export function lexicalFamilyKey(languageId: LanguageId, unitId: string): string | undefined {
  if (!hasLearningVarieties(languageId)) return undefined;
  const m = /^(lemma|form):([^:]+):(.+)$/u.exec(unitId);
  if (!m || m[2] !== languageId) return undefined;
  let rest = m[3];
  let pos = '';
  if (m[1] === 'lemma') { const p = /:([A-Z]+)$/u.exec(rest); if (p) { pos = p[1]; rest = rest.slice(0, -p[0].length); } }
  const bare = rest.normalize('NFD').replace(/[̀-֑ͯ-ׇֽֿׁׂׅׄ]/gu, '').replace(/ς/gu, 'σ').toLowerCase().normalize('NFC');
  return bare ? `${languageId}:${bare}${pos ? `:${pos}` : ''}` : undefined;
}

/**
 * Course gold set, step 2: accept a corrected draft. Pure: validates and turns the editing format into gold
 * sentences, or refuses with every reason (see scripts/gold-accept.mts for the files).
 */
import { draftDigest, parseMeta } from './draft';
import { fromEditing, validateGold } from './format';
import { COURSE_STRATA, GOLD_RIGHTS, type GoldRights, type GoldSentence } from './types';

export interface AcceptOptions {
  by: string | undefined;
  /** ISO date; the CLI passes today's. */
  at: string;
  /** Accept a draft nobody changed (the boundaries are right as drafted). */
  confirmUnchanged?: boolean;
}

export type AcceptResult =
  | { ok: true; sentences: GoldSentence[]; stratum: string; heldOut: number }
  | { ok: false; refusals: string[] };

export const TOKENIZED_BY_DRAFT = 'thAdapter.tokenize draft, boundaries checked and corrected by hand';
export const TOKENIZED_BY_CONFIRMED = 'thAdapter.tokenize draft, confirmed unchanged by hand';

export function acceptDraft(draftText: string, opt: AcceptOptions): AcceptResult {
  const refusals: string[] = [];
  const by = opt.by?.trim();
  if (!by) refusals.push('--by "Name" is required: a gold sentence records who checked it');
  const meta = parseMeta(draftText);
  const stratum = meta.get('stratum');
  if (!stratum || !(COURSE_STRATA as readonly string[]).includes(stratum)) refusals.push(`the draft's "## stratum:" line is missing or not one of ${COURSE_STRATA.join(', ')}`);
  const title = meta.get('source-title');
  const licence = meta.get('source-licence');
  const rights = meta.get('source-rights');
  if (!title || !licence) refusals.push('the draft lacks its "## source-title:" / "## source-licence:" lines');
  if (!rights || !(GOLD_RIGHTS as readonly string[]).includes(rights)) refusals.push(`the draft's "## source-rights:" line must be one of ${GOLD_RIGHTS.join(', ')}`);

  const parsed = fromEditing(draftText);
  refusals.push(...parsed.problems);
  if (parsed.entries.length === 0 && parsed.problems.length === 0) refusals.push('the draft contains no sentences');

  const recorded = meta.get('draft-digest');
  const unchanged = recorded !== undefined && recorded === draftDigest(parsed.entries);
  if (unchanged && !opt.confirmUnchanged) {
    refusals.push('the draft is unchanged from the machine draft: correct it by hand, or pass --confirm-unchanged if every boundary is right as drafted');
  }
  if (refusals.length) return { ok: false, refusals };

  const sentences: GoldSentence[] = parsed.entries.map((e) => ({
    id: e.id,
    lang: 'th',
    stratum: stratum as string,
    text: e.text,
    boundaries: e.boundaries,
    source: { title: title as string, licence: licence as string, rights: rights as GoldRights },
    tokenizedBy: unchanged ? TOKENIZED_BY_CONFIRMED : TOKENIZED_BY_DRAFT,
    checkedBy: by as string,
    checkedAt: opt.at,
    ...(e.heldOut ? { heldOut: true } : {}),
    ...(unchanged ? { notes: 'accepted unchanged from the machine draft (--confirm-unchanged)' } : {}),
  }));
  const problems: string[] = [];
  for (const s of sentences) for (const i of validateGold(s)) problems.push(`${s.id}: ${i.message}`);
  if (problems.length) return { ok: false, refusals: problems };
  return {
    ok: true, sentences, stratum: stratum as string,
    heldOut: sentences.filter((s) => s.heldOut).length,
  };
}

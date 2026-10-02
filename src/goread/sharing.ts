/**
 * What may be shared with a team (the rights table of docs/goread/BACKEND.md), applied before anything leaves the device.
 * The server applies the same table again; this is the app saying why, in the learner's words, without sending.
 *
 *   owner-authored                                  yes
 *   public-domain | licensed, with a verification   yes   (the record says who checked)
 *   public-domain | licensed, without one           no
 *   personal-copy                                   no    (redistribution; it stays on the device)
 *   user-private | generated | unverified           no
 */
import type { AppStore, ContentSource, RightsStatus, Text } from '../core';

/** The words a learner sees for a personal copy (the contract's sentence, character for character). */
export const PERSONAL_COPY_REASON =
  'Your own copy of a published book stays on your device — it is yours to read, not to redistribute. Texts your team wrote can be shared.';

/**
 * What `shareable` needs to know about a source: its rights and, for public-domain / licensed works, the record of who
 * checked them. A `ContentSource` qualifies as it is (it carries no record of its own); so does a `CorpusSourceInfo`.
 */
export interface ShareableSource {
  rights: RightsStatus | string;
  /** A verification record (who checked, against what). Present and naming someone ⇒ the claim has been checked. */
  verification?: { by?: unknown; against?: unknown } | null;
  /** True for machine-generated text: refused whatever the rights say. */
  generated?: boolean;
}

export type Shareable = { ok: true } | { ok: false; reason: string };

const hasRecord = (v: ShareableSource['verification']): boolean =>
  !!v && typeof v === 'object' && typeof v.by === 'string' && v.by.trim().length > 0;

/** The words a learner sees for machine-generated text (the server refuses it with the same sentence). */
export const GENERATED_REASON = 'Machine-generated text is not shared with the team. Texts your team wrote can be shared.';

export function shareable(source: ContentSource | ShareableSource): Shareable {
  const rights = source.rights;
  const verification = (source as ShareableSource).verification;
  // machine-generated text is never shared, whatever the rights say
  if ((source as ShareableSource).generated === true) return { ok: false, reason: GENERATED_REASON };
  switch (rights) {
    case 'owner-authored':
      return { ok: true };
    case 'public-domain':
    case 'licensed':
      return hasRecord(verification)
        ? { ok: true }
        : { ok: false, reason: `This text is marked "${rights}", but nothing records who checked that, so it cannot be shared with the team yet.` };
    case 'personal-copy':
      return { ok: false, reason: PERSONAL_COPY_REASON };
    case 'user-private':
      return { ok: false, reason: 'This text is private to you, so it stays on your device. Texts your team wrote can be shared.' };
    case 'generated':
      return { ok: false, reason: GENERATED_REASON };
    case 'unverified':
      return { ok: false, reason: 'The rights to this text have not been established, so it cannot be shared with the team.' };
    default:
      return { ok: false, reason: 'The rights to this text are not known, so it cannot be shared with the team.' };
  }
}

/**
 * The same, for a stored text: its source is looked up by `text.sourceId`, and the verification record a text carries
 * (Scripture's `scripture.verification`) counts as the record for a public-domain / licensed claim.
 */
export async function shareableText(store: Pick<AppStore, 'sources'>, text: Pick<Text, 'sourceId' | 'scripture'> & Partial<Pick<Text, 'generated'>>): Promise<Shareable> {
  if (text.generated === true) return { ok: false, reason: GENERATED_REASON };
  const source = await store.sources.get(text.sourceId);
  if (!source) return { ok: false, reason: 'The source of this text is not on this device, so its rights cannot be checked and it cannot be shared.' };
  return shareable({ rights: source.rights, verification: text.scripture?.verification, generated: text.generated });
}

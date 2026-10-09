/**
 * What may be said about a long selection. A selection of more than MAX_SURFACE_WORDS words is page text, not an item:
 * the stored event keeps no surface for it (the contract's rule), and neither may its unit ids spell it out. The reader
 * lists the ids of the first twelve words of a selection (`form:sq:ignore`, `form:sq:previous`, ...) in the order they
 * stand, which would reconstruct a sentence from the event log, from the idempotency key built out of them, and from the
 * `GET /knowledge?unitIds=` request line of every lookup. So, in the worker, before anything is stored or sent:
 *
 *  - a list that names more than MAX_SURFACE_WORDS words (`lemma:` and `form:` ids) belongs to a long selection;
 *  - from such a list every `form:` id (the raw word) is dropped, and at most MAX_SURFACE_WORDS `lemma:` ids stay (a lemma
 *    id is a dictionary headword the learner met, not the page's wording and not its order);
 *  - on an event, the whole list is capped at MAX_SURFACE_WORDS and the idempotency key, which embedded the full list, is
 *    replaced by a hash of itself.
 *
 * A short selection (up to four words) is untouched: its surface is stored anyway.
 */
import { MAX_SURFACE_WORDS } from '../../../repository-contract/src';

const isWordLevel = (id: string): boolean => id.startsWith('lemma:') || id.startsWith('form:');

export interface Limited { ids: string[]; trimmed: boolean }

/** The unit ids a long selection may keep (see the file header). Other ids (constructions, phrases) pass through. */
export function limitWordIds(ids: readonly string[]): Limited {
  const words = ids.filter(isWordLevel);
  if (words.length <= MAX_SURFACE_WORDS) return { ids: [...ids], trimmed: false };
  const keep = new Set(words.filter((i) => i.startsWith('lemma:')).slice(0, MAX_SURFACE_WORDS));
  return { ids: ids.filter((i) => !isWordLevel(i) || keep.has(i)), trimmed: true };
}

/** cyrb53: a fast 53-bit non-cryptographic hash. It only has to tell keys apart; the worker has no synchronous SHA. */
export function hashKey(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

type Evented = { subject?: { itemIds?: unknown }; payload?: Record<string, unknown>; dedupeKey?: unknown };

/**
 * The event with a long selection's word list cut down (see the file header). Never mutates its input. An event whose ids
 * do not name more than MAX_SURFACE_WORDS words, and one with no `itemIds`, is returned as it is.
 */
export function limitEventWords<E extends Evented>(event: E): E {
  const ids = event.subject?.itemIds;
  if (!Array.isArray(ids) || !ids.every((i) => typeof i === 'string')) return event;
  const limited = limitWordIds(ids as string[]);
  const omitted = event.payload?.surfaceOmitted === true;
  if (!limited.trimmed && !omitted) return event;
  const kept = limited.trimmed ? limited.ids.slice(0, MAX_SURFACE_WORDS) : (ids as string[]).slice(0, MAX_SURFACE_WORDS);
  // a surface-less lookup (`surfaceOmitted`) names its words with at most lemma ids as well, even when it listed few of them
  const final = omitted ? kept.filter((i) => !i.startsWith('form:')) : kept;
  const rekey = typeof event.dedupeKey === 'string' && (limited.trimmed || omitted) && (ids as string[]).some((i) => (event.dedupeKey as string).includes(i));
  const prefix = rekey ? (event.dedupeKey as string).split(':')[0] : '';
  return {
    ...event,
    subject: { ...event.subject, itemIds: final },
    ...(rekey ? { dedupeKey: `${prefix}:h${hashKey(event.dedupeKey as string)}` } : {}),
  };
}

/**
 * The import document GoTell materializes for an accepted testimony revision: a private Text
 * (`contentType: 'testimony'`, rights `user-private`, authorship `learner`) that the normal pipeline ingests, so
 * GoLearn and GoListen address it like any other text.
 *
 *   await ingestDocument(store, adapters, testimonyDocument({ userId, lang, n, sentences }), { clock })
 *
 * The learner's sentences are stored exactly as given. The "review" is the learner's own acceptance of the
 * revision (there is no editorial reviewer for private writing), so the document passes the publication gate and
 * the Text is `published` — it is still excluded from the Library / Scripture lists by `kind === 'testimony'`.
 */
import type { LanguageCode } from '../core';
import { hash } from '../core';
import { CORPUS_SCHEMA_VERSION, type CorpusDocument } from './format';

/** Document id (→ text id `text:<lang>:<id>`) of the private Text of revision `n`. Slug-safe. */
export function testimonyDocumentId(userId: string, n: number): string {
  const safe = userId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const user = safe && safe === userId ? safe : `${safe || 'u'}-${hash(userId).slice(0, 6)}`;
  return `testimony-${user}-r${n}`;
}

export interface TestimonyDocumentInput {
  userId: string;
  lang: LanguageCode;
  /** Revision number. */
  n: number;
  /** The accepted sentences, exactly as the learner wrote them. */
  sentences: readonly string[];
  /** ISO timestamp of the acceptance (optional; recorded as review.reviewedAt). */
  acceptedAt?: string;
}

export function testimonyDocument({ userId, lang, n, sentences, acceptedAt }: TestimonyDocumentInput): CorpusDocument {
  return {
    schemaVersion: CORPUS_SCHEMA_VERSION,
    id: testimonyDocumentId(userId, n),
    lang,
    title: `My testimony (revision ${n})`,
    contentType: 'testimony',
    corpus: { id: `testimony:${userId}`, kind: 'testimony', title: 'My Testimony' },
    source: {
      id: `src:testimony:${userId}`,
      title: 'Learner testimony',
      attribution: "The learner's own writing",
      provenance: `The learner's own private writing, accepted as revision ${n} in GoTell. Never shared or used as course content.`,
      rights: 'user-private',
      authorship: 'learner',
    },
    review: {
      status: 'approved',
      reviewedBy: 'learner (author)',
      ...(acceptedAt ? { reviewedAt: acceptedAt } : {}),
      notes: 'Accepted by the learner as their own revision in GoTell; no editorial review applies to private writing.',
    },
    topics: [],
    editorialTags: ['private'],
    prepTargets: [],
    generated: false,
    sections: [{ paragraphs: [{ sentences: sentences.map((text) => ({ text })) }] }],
  };
}

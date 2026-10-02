/**
 * The varieties of Hindi the adapter can label (see core/variety.ts for how a course uses them). Modern Standard Hindi is the
 * course language and carries no tag. The three below are `heritage`: related literary languages that a reader of Scripture,
 * song and devotional poetry meets beside Modern Standard Hindi. They are catalogued and readable as the learner's own copy,
 * never counted as evidence about Modern Standard Hindi, and never presented as older or lesser Hindi.
 */
import type { Variety } from '../../core';

export const HI_VARIETIES: Readonly<Record<string, Variety>> = {
  awa: {
    code: 'awa', label: 'Awadhi', kind: 'heritage',
    note: 'A language of the Awadh region (around Lucknow and Ayodhya), and the language of the Ramcharitmanas of Tulsidas. It has its own grammar and words: read it as its own language, not as Modern Standard Hindi.',
  },
  bra: {
    code: 'bra', label: 'Braj', kind: 'heritage',
    note: 'A language of the Mathura region, long the language of devotional poetry (Surdas and the poets of Krishna). It has its own grammar and words: read it as its own language, not as Modern Standard Hindi.',
  },
  'hi-sant': {
    code: 'hi-sant', label: 'the mixed language of the sant poets', kind: 'heritage',
    note: 'The blended speech of poets such as Kabir and Ravidas (sadhukkadi): words and forms from several regional languages in one poem. Its spelling and forms are not a guide to Modern Standard Hindi.',
  },
};

/** Codes the adapter tags words with, for tests and tools that must not accept an unknown tag. */
export const HI_VARIETY_CODES: readonly string[] = Object.keys(HI_VARIETIES);

/**
 * The four language profiles. Each says how the language is filed in the shared Repository, which edition the reader shows,
 * where its analysis comes from (and how far it is trusted), and the per-language defaults of the familiarity heuristic and
 * of session composition. Licences are stated as the source projects state them; verify before redistributing any text.
 */
import type { EcclesiaLanguageId, EcclesiaLanguageProfile } from './contract';

const REVIEW_DEFAULTS = { grammarShare: 0.25, cardsPerDeck: 12, sessionMinutes: 10, maxNew: 4, desiredRetention: 0.9 } as const;
/** Ancient-language reading: a token is counted known from `familiar` (recognised repeatedly) — `recognized` is one success with help. */
const FAMILIARITY_DEFAULTS = { knownFrom: 'familiar', targetLow: 0.8, targetHigh: 0.9, formsCount: true, crossPeriodCredit: false } as const;
const PUBLIC_DOMAIN = { textRetention: 'allowed', remoteProcessing: 'allowed', export: 'allowed', sharing: 'allowed', reviewExamples: 'allowed' } as const;
const ATTRIBUTION_LICENCE = { textRetention: 'allowed', export: 'allowed', reviewExamples: 'allowed' } as const;

export const HEBREW: EcclesiaLanguageProfile = {
  id: 'he', label: 'Biblical Hebrew', script: 'Hebr', direction: 'rtl',
  repository: { languageId: 'he', varietyId: 'he-bib', packId: 'pack:he', packVersion: '1' },
  textId: 'MAM',
  corpus: { label: 'Miqra according to the Masorah (MAM), Westminster Leningrad Codex for comparison', licence: 'CC BY-SA 4.0 (MAM); public domain (WLC)', restrictions: ATTRIBUTION_LICENCE },
  analysis: { label: 'Open Scriptures Hebrew Bible morphology (OSHB)', licence: 'CC BY 4.0', status: 'high-confidence', analyzerId: 'oshb-morphology' },
  familiarity: FAMILIARITY_DEFAULTS,
  review: REVIEW_DEFAULTS,
};

export const ARAMAIC: EcclesiaLanguageProfile = {
  id: 'arc', label: 'Biblical Aramaic', script: 'Hebr', direction: 'rtl',
  // Its own language in the Repository: an Aramaic מֶלֶךְ is not the Hebrew lexeme. The GoLearn Hebrew adapter reads the same
  // chapters as the heritage variety `arc-bib` of `he`; a reader that wants ONE enrolment for both may override `repository`.
  repository: { languageId: 'arc', varietyId: 'arc-bib', packId: 'pack:arc', packVersion: '1' },
  textId: 'MAM',
  corpus: { label: 'The Aramaic of Daniel 2:4b–7:28, Ezra 4:8–6:18 and 7:12–26, Jeremiah 10:11, Genesis 31:47 (MAM)', licence: 'CC BY-SA 4.0 (MAM)', restrictions: ATTRIBUTION_LICENCE },
  analysis: { label: 'Open Scriptures Hebrew Bible morphology (OSHB), Aramaic codes', licence: 'CC BY 4.0', status: 'high-confidence', analyzerId: 'oshb-morphology' },
  familiarity: FAMILIARITY_DEFAULTS,
  review: REVIEW_DEFAULTS,
};

export const GREEK: EcclesiaLanguageProfile = {
  id: 'grc', label: 'Koine Greek', script: 'Grek', direction: 'ltr',
  // The Greek adapter is ONE language `el` whose periods are varieties; Koine is `el-koi`. Unit ids are therefore `lemma:el:…`,
  // the same ids the Biblia reader and the GoLearn Greek pack write, so knowledge pools across readers.
  repository: { languageId: 'el', varietyId: 'el-koi', packId: 'pack:el', packVersion: '1' },
  textId: 'SBLGNT',
  corpus: { label: 'SBL Greek New Testament', licence: 'CC BY 4.0', restrictions: ATTRIBUTION_LICENCE },
  analysis: { label: 'MorphGNT over the SBLGNT', licence: 'CC BY-SA 3.0', status: 'high-confidence', analyzerId: 'morphgnt' },
  familiarity: FAMILIARITY_DEFAULTS,
  review: REVIEW_DEFAULTS,
};

export const LATIN: EcclesiaLanguageProfile = {
  id: 'la', label: 'Latin', script: 'Latn', direction: 'ltr',
  // The Latin adapter declares no period varieties; the Vulgate is read as Latin without a variety.
  repository: { languageId: 'la', packId: 'pack:la', packVersion: '1' },
  textId: 'VULG',
  corpus: { label: 'Vulgata (Clementine text as the Vetus reader bundles it)', licence: 'public domain', restrictions: PUBLIC_DOMAIN },
  analysis: { label: 'PROIEL treebank (NT) and Whitaker’s Words, as the Vetus build assigns them', licence: 'CC BY-NC-SA 4.0 (PROIEL); Whitaker’s Words freely redistributable', status: 'high-confidence', analyzerId: 'vetus-vulgate' },
  familiarity: FAMILIARITY_DEFAULTS,
  review: REVIEW_DEFAULTS,
};

export const PROFILES: Readonly<Record<EcclesiaLanguageId, EcclesiaLanguageProfile>> = { he: HEBREW, arc: ARAMAIC, grc: GREEK, la: LATIN };

export function profileOf(id: EcclesiaLanguageId): EcclesiaLanguageProfile {
  const p = PROFILES[id];
  if (!p) throw new RangeError(`not an Ecclesia language: ${String(id)} (he, arc, grc, la)`);
  return p;
}

/** A profile with some of its fields replaced (a reader that files Aramaic under its Hebrew enrolment, a different edition id). */
export interface ProfileOverrides {
  repository?: Partial<EcclesiaLanguageProfile['repository']>;
  textId?: string;
  familiarity?: Partial<EcclesiaLanguageProfile['familiarity']>;
  review?: Partial<EcclesiaLanguageProfile['review']>;
}

export function withOverrides(base: EcclesiaLanguageProfile, over: ProfileOverrides): EcclesiaLanguageProfile {
  return { ...base, ...over, repository: { ...base.repository, ...(over.repository ?? {}) }, familiarity: { ...base.familiarity, ...(over.familiarity ?? {}) }, review: { ...base.review, ...(over.review ?? {}) } };
}

/**
 * Which packs exist and which teams study which languages.
 *
 * A team is not a language: a team lists the languages its members may study, a learner may study several, and no
 * identifier joins a team to a learner's language. Norway is the one team whose languages require a choice: the
 * learner picks a written standard (Bokmål or Nynorsk) explicitly; neither is a default and neither is credited for
 * the other.
 */
import type { PackManifest } from './manifest';
import { albanianManifest } from './packs/sq';
import { germanManifest } from './packs/de';
import { hindiManifest } from './packs/hi';
import { spanishManifest } from './packs/es';
import { thaiManifest } from './packs/th';
import { bokmalManifest } from './packs/nb';
import { nynorskManifest } from './packs/nn';

export const PACKS: Readonly<Record<string, PackManifest>> = Object.freeze({
  sq: albanianManifest(),
  es: spanishManifest(),
  de: germanManifest(),
  hi: hindiManifest(),
  th: thaiManifest(),
  nb: bokmalManifest(),
  nn: nynorskManifest(),
});

export function packFor(languageId: string): PackManifest | undefined {
  return Object.prototype.hasOwnProperty.call(PACKS, languageId) ? PACKS[languageId] : undefined;
}

/** The packs a learner can install today. */
export const installablePacks = (): PackManifest[] => Object.values(PACKS).filter((p) => p.status === 'installable');

export type TeamId = 'albania' | 'honduras' | 'germany' | 'india' | 'thailand' | 'norway';

export interface TeamLanguage {
  languageId: string;
  varietyId?: string;
  label: string;
  default?: boolean;
  /** The learner must choose before studying this language; no choice is assumed. */
  requiredChoice?: { key: 'writtenStandard'; options: ['nb', 'nn'] };
}

export interface Team { teamId: TeamId; name: string; languages: TeamLanguage[] }

export const TEAMS: Readonly<Record<TeamId, Team>> = Object.freeze({
  albania: { teamId: 'albania', name: 'Albania', languages: [{ languageId: 'sq', varietyId: 'sq-standard', label: 'Albanian', default: true }] },
  honduras: { teamId: 'honduras', name: 'Honduras', languages: [{ languageId: 'es', varietyId: 'es-HN', label: 'Spanish (Honduras)', default: true }] },
  germany: { teamId: 'germany', name: 'Germany', languages: [{ languageId: 'de', varietyId: 'de-DE', label: 'German', default: true }] },
  india: { teamId: 'india', name: 'India', languages: [{ languageId: 'hi', varietyId: 'hi-standard', label: 'Hindi', default: true }] },
  thailand: { teamId: 'thailand', name: 'Thailand', languages: [{ languageId: 'th', varietyId: 'th-standard', label: 'Thai', default: true }] },
  norway: {
    teamId: 'norway',
    name: 'Norway',
    languages: [
      { languageId: 'nb', varietyId: 'nb', label: 'Norwegian, Bokmål', requiredChoice: { key: 'writtenStandard', options: ['nb', 'nn'] } },
      { languageId: 'nn', varietyId: 'nn', label: 'Norwegian, Nynorsk', requiredChoice: { key: 'writtenStandard', options: ['nb', 'nn'] } },
    ],
  },
});

export const teamList = (): Team[] => Object.values(TEAMS);

/** The languages a team offers, in order. */
export const languagesOf = (teamId: TeamId): TeamLanguage[] => TEAMS[teamId].languages;

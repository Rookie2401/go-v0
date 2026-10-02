/**
 * The varieties the German adapter can label (see core/variety.ts for how a course uses them). The course aims at
 * Standard German of Germany (de-DE). Austrian and Swiss Standard German are living varieties of the same language:
 * recognised and labelled, not the default. The two older spelling norms are 'historical': the words are the same,
 * only the spelling is older, and the text is kept as written. All entries are machine-drafted, not native-reviewed.
 */
import type { Variety } from '../../core';

export const DE_VARIETIES: Record<string, Variety> = {
  'de-DE': { code: 'de-DE', label: 'Germany', kind: 'national', note: 'Standard German of Germany: the variety this course aims at.' },
  'de-AT': { code: 'de-AT', label: 'Austria', kind: 'national', note: 'Standard German of Austria: ordinary there, worth recognising, not your default.' },
  'de-CH': { code: 'de-CH', label: 'Switzerland', kind: 'national', note: 'Standard German of Switzerland: ss is written where Germany writes ß; worth recognising, not your default.' },
  'de-south': { code: 'de-south', label: 'southern Germany', kind: 'regional', parent: 'de-DE', note: 'Usage of Bavaria and the south of Germany, shared in part with Austria.' },
  'de-north': { code: 'de-north', label: 'northern Germany', kind: 'regional', parent: 'de-DE', note: 'Usage of the north of Germany.' },
  'de-dialect': { code: 'de-dialect', label: 'dialect or strongly regional', kind: 'regional', note: 'A dialect form or one that belongs to a small region: recognise it, do not use it as standard German.' },
  'de-1901': { code: 'de-1901', label: 'spelling before 1996', kind: 'historical', note: 'The spelling used from 1901 until the reform of 1996 (daß, muß, Schloß). The words are the same; only the spelling is older.' },
  'de-pre1901': { code: 'de-pre1901', label: 'spelling before 1901', kind: 'historical', note: 'The spelling used before the conference of 1901 (thun, Thal, Cultur, seyn). The words are the same; only the spelling is older.' },
};

/** Codes the adapter can tag words with, for tests and tools that must not accept an unknown tag. */
export const DE_VARIETY_CODES: readonly string[] = Object.keys(DE_VARIETIES);

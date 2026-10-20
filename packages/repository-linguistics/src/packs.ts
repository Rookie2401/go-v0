/**
 * Language-pack descriptors: what a pack covers and what it does not, so coverage gaps can be reported.
 * The Albanian pack is described from the real adapter; every other language gets a generic, form-only pack.
 */
import { sqAdapter } from '../../../src/adapters/sq';
import { hiAdapter } from '../../../src/adapters/hi';
import { validationForPack } from '../../repository-contract/src';
import type { LanguagePackInfo, ProvenanceOrigin, ProvenanceSource, UnitProvenance, ValidationLevel } from '../../repository-contract/src';

/** Where a row entered the shared layer, from the kind of producer that made it (contract v3 `origin`). */
const ORIGIN_OF: Readonly<Record<ProvenanceSource, ProvenanceOrigin>> = {
  'hand-lexicon': 'pack-lexicon', dictionary: 'dictionary', rule: 'rule-derived', parser: 'rule-derived', reviewer: 'reviewer', learner: 'learner-lookup', import: 'import',
};

/** Stamps a provenance with its validation level, and its origin when it has none. */
export const withValidation = (p: UnitProvenance, validation: ValidationLevel): UnitProvenance => ({ ...p, origin: p.origin ?? ORIGIN_OF[p.source], validation });

/**
 * The validation level of what the resolver reads from a language's adapter. The level of each pack is the one in
 * docs/ecosystem/reader/LANGUAGE-PACK-CAPABILITIES.md (Albanian and Spanish installable, German / Hindi / Thai experimental, Norwegian planned) and the
 * mapping is the contract's own `validationForPack`: an installable pack reads as `production-validated` only when its manifest says so, and no pack's manifest
 * does today (the word lists are machine-drafted and no native speaker has checked them), so Albanian and Spanish read as `unreviewed`.
 */
const PACK_LEVEL: Readonly<Record<string, 'installable' | 'experimental' | 'planned'>> = { sq: 'installable', es: 'installable', de: 'experimental', hi: 'experimental', th: 'experimental', nb: 'planned', nn: 'planned' };
export const packValidation = (languageId: string): ValidationLevel =>
  validationForPack(Object.prototype.hasOwnProperty.call(PACK_LEVEL, languageId) ? { level: PACK_LEVEL[languageId] } : undefined);
/** A bare surface form recorded with no analysis: experimental and unsupported languages keep their level, every other reads `unreviewed`. */
export const genericValidation = (languageId: string): ValidationLevel => packValidation(languageId);

export const ALBANIAN_PACK_ID = 'pack:sq';

/** Hindi is an experimental, seed-only pack, but it still has a real analyser. Keep its
 * identity here so Repository rows and GoReview facts refer to the same pack. */
export function hindiPack(): LanguagePackInfo {
  return {
    packId: 'pack:hi', languageId: 'hi', version: String(hiAdapter.version), analyzerId: `adapter-hi@${hiAdapter.version}`,
    coverage: { notes: ['Seed-only Hindi word list and rule-based morphology; no native-speaker review.'] },
    licences: [{ resource: 'Hindi course word list and morphology rules (adapter-hi)', licence: 'Owner-authored, machine-drafted; not yet reviewed by a native speaker' }],
    reviewStatus: 'machine-drafted', level: 'experimental', validation: 'experimental',
  };
}

/** The adapter does not export its word list; the count is read from its own statement of its limits, and omitted when that text changes. */
function lexemeCount(): number | undefined {
  for (const line of sqAdapter.support?.limitations ?? []) {
    const m = /about\s+([\d.,\s  ]+?)\s+words/u.exec(line);
    if (m) {
      const n = Number(m[1].replace(/\D/gu, ''));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}

export function albanianPack(): LanguagePackInfo {
  const lexemes = lexemeCount();
  const notes = [
    'Word list only: there is no dictionary behind this pack, so a gloss is a short course gloss, not a dictionary entry.',
    'The word list, the word-form rules and the phrase list are machine-drafted and owner-authored; no native speaker has checked them.',
    'A form the word list does not know is read by its ending only: the lemma is a guess, marked unconfirmed, and carries no gloss.',
    'Ambiguity is kept: every reading the sentence does not decide stays as a candidate of the analysis.',
    lexemes === undefined
      ? 'The number of lexemes is not published by the adapter and is therefore not stated here.'
      : `The adapter states a word list of about ${lexemes.toLocaleString('en')} words (read from the adapter's own limitation text, not counted here).`,
    'The number of generated forms and of constructions is not exposed by the adapter and is not stated here.',
  ];
  return {
    packId: ALBANIAN_PACK_ID,
    languageId: 'sq',
    version: String(sqAdapter.version),
    analyzerId: `adapter-sq@${sqAdapter.version}`,
    coverage: { ...(lexemes === undefined ? {} : { lexemes }), notes },
    licences: [
      {
        resource: 'Albanian course word list, word-form rules and phrase list (adapter-sq)',
        licence: 'Owner-authored, machine-drafted; not yet reviewed by a native speaker',
        notice: 'Other analyzers (UniParser, Wiktionary, two treebanks) were used only to compare readings; none of their data is stored in these units.',
      },
    ],
    reviewStatus: 'machine-drafted',
  };
}

/** A language without an adapter: a form can be recorded, nothing about it is known. */
export function genericPack(languageId: string): LanguagePackInfo {
  return {
    packId: `pack:${languageId}:generic`,
    languageId,
    version: '0',
    analyzerId: 'generic@0',
    coverage: { notes: ['No analyzer for this language in the Repository yet: only the surface form is recorded, as provisional, with no lemma, gloss or morphology.'] },
    licences: [],
    reviewStatus: 'machine-drafted',
  };
}

export function packFor(languageId: string): LanguagePackInfo {
  if (languageId === 'sq') return albanianPack();
  if (languageId === 'hi') return hindiPack();
  return genericPack(languageId);
}

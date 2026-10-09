/**
 * Language-pack descriptors: what a pack covers and what it does not, so coverage gaps can be reported.
 * The Albanian pack is described from the real adapter; every other language gets a generic, form-only pack.
 */
import { sqAdapter } from '../../../src/adapters/sq';
import type { LanguagePackInfo } from '../../repository-contract/src';

export const ALBANIAN_PACK_ID = 'pack:sq';

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
  return languageId === 'sq' ? albanianPack() : genericPack(languageId);
}

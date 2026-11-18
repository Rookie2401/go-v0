/**
 * The languages GoReview's own setup offers (#/setup, screens/setup.ts), as rows: the language catalogue's entries with the choice each asks for
 * (Norwegian's written standard, required and never guessed; Spanish's regional preference; the varieties of Hebrew and Greek) and the words for
 * how far each pack is built.
 *
 * A copy of GoLearn setup's view (packages/golearn-extension/app/languages.ts): GoReview may not import from the extension
 * (test/audit/conformance.structure.test.ts). test/goreview-app/language-choices-mirror.test.ts fails the moment the two lists differ, so a
 * learner sees the same languages, names and choices in both setups. Change GoLearn's first, then this copy.
 */
import { LANGUAGE_CATALOGUE, PACKS } from '../../language-packs/src';
import type { CatalogueEntry, PackLevel } from '../../language-packs/src';

export interface LanguageOptionView { id: string; label: string; languageId: string; varietyId?: string }
export interface LanguageChoiceView { kind: 'standard' | 'variety'; required: boolean; label: string; options: LanguageOptionView[] }
export interface LanguageView {
  languageId: string;
  name: string;
  nativeName: string;
  scriptId: string;
  choice?: LanguageChoiceView;
  packIds: string[];
  level: string;
  validation: string;
  tutorialAvailable: boolean;
  audio: string;
  whatWorks: string[];
  whatDoesNot: string[];
}

/** The words the learner sees for how far a language is built (as GoLearn setup says them). */
export function levelWords(level: PackLevel, validation: string): string {
  if (level === 'planned') return 'planned, not installable';
  if (level === 'experimental') return 'experimental, unreviewed';
  if (validation === 'production-validated') return 'reference pack, reviewed';
  if (validation === 'incomplete') return 'reference pack, partly reviewed';
  return 'reference pack, machine-drafted, unreviewed';
}

/** The catalogue's “general” Spanish (`es-standard`) is recorded as the pack's general variety (Latin America), never as the Honduran default. */
const GENERAL_VARIETY: Readonly<Record<string, string>> = { 'es-standard': 'es-419' };

export function languageView(e: CatalogueEntry): LanguageView {
  const out: LanguageView = {
    languageId: e.languageId, name: e.name, nativeName: e.nativeName, scriptId: e.scriptId,
    packIds: [...e.packIds], level: levelWords(e.level, e.validation), validation: e.validation, tutorialAvailable: e.tutorialAvailable,
    audio: e.audio, whatWorks: [e.whatWorks], whatDoesNot: [e.whatDoesNot],
  };
  if (e.writtenStandards?.length) {
    out.choice = {
      kind: 'standard', required: true, label: 'Which written standard will you read?',
      options: e.writtenStandards.map((s): LanguageOptionView => ({ id: s.id, label: s.label, languageId: s.id, varietyId: s.id })),
    };
  } else if (e.varieties && e.varieties.length > 1) {
    const pack = e.packIds.map((id) => Object.values(PACKS).find((p) => p.packId === id)).find(Boolean);
    const known = (id: string): boolean => !!pack?.varieties.some((v) => v.varietyId === id && v.analysed);
    out.choice = {
      kind: 'variety', required: false, label: 'Regional preference',
      options: e.varieties.map((v): LanguageOptionView => {
        const variety = known(v.id) ? v.id : GENERAL_VARIETY[v.id];
        return { id: v.id, label: v.label, languageId: e.languageId, ...(variety && known(variety) ? { varietyId: variety } : {}) };
      }),
    };
  }
  return out;
}

/** The catalogue's languages in its order. */
export const languagesOf = (): LanguageView[] => LANGUAGE_CATALOGUE.map(languageView);

// ───────────────────────────── the six languages and their tutorials ─────────────────────────────
//
// The language screen's cards come from the language-packs catalogue (`LANGUAGE_CATALOGUE`, six entries, in the order a picker shows
// them) and nothing else: the names, script, level, what works and what does not are the catalogue's, which reads them from the
// manifests and the capability report. This file only turns an entry into the view the screen renders.
import { LANGUAGE_CATALOGUE, PACKS, tutorialFor } from '../../language-packs/src';
import type { CatalogueEntry, PackLevel, Tutorial } from '../../language-packs/src';
import type { LanguageOptionView, LanguageView } from './ports';

/**
 * The words the learner sees for how far a language is built. “reference pack, machine-drafted, unreviewed” is the installable
 * pack nobody has reviewed; “experimental, seed-only” is a pack with a small machine-drafted word list. Nothing is claimed beyond
 * the manifest's own level and review status.
 */
export function levelWords(level: PackLevel, validation: string): string {
  if (level === 'planned') return 'planned, not installable';
  if (level === 'experimental') return 'experimental, seed-only';
  if (validation === 'production-validated') return 'reference pack, reviewed';
  if (validation === 'incomplete') return 'reference pack, partly reviewed';
  return 'reference pack, machine-drafted, unreviewed';
}

/**
 * The variety a catalogue choice stands for on an enrolment. The catalogue's “general” Spanish (`es-standard`) is not a variety the
 * pack analyses; it is recorded as the pack's general variety (Latin America), never as the Honduran default.
 */
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

/** The six languages in the catalogue's order. */
export const languagesOf = (): LanguageView[] => LANGUAGE_CATALOGUE.map(languageView);

/** The orientation of a language, from the pack registry's tutorials; undefined where there is none. */
export const tutorialOf = (languageId: string): Tutorial | undefined => tutorialFor(languageId);

/**
 * Planned packs: a manifest that names an existing adapter and says honestly what exists and what does not. A planned
 * pack is never installable (`installPack` refuses it) and carries no validation cases, no tutorial and no review.
 *
 * The adapter versions below are constants rather than imports so that listing the packs does not pull five adapters'
 * word lists into an application bundle; a test (test/language-packs/planned.test.ts) imports each adapter and fails when
 * a version here has drifted from it.
 */
import { CONTRACT_VERSION } from '../../../repository-contract/src';
import { KAIKKI_ATTRIBUTION, type GrammarConstruction, type GrammarFeature, type PackManifest, type PackVariety } from '../manifest';

export interface PlannedSpec {
  languageId: string;
  version: string;
  varietyId: string;
  scriptId: string;
  name: string;
  nativeName: string;
  varieties: PackVariety[];
  /** Words in the shipped dictionary, when a kaikki dictionary for the language is built. */
  dictionary?: { entries: number; frequency: boolean; /** The dictionary manifest's own id, when it is not the default `kaikki-<lang>@2026-09-28` (Latin is built from another extract). */ id?: string };
  /** The adapter's own support levels, summarised. */
  adapterSummary: string;
  capabilities: string[];
  features: GrammarFeature[];
  constructions: GrammarConstruction[];
  voices: string[];
  segmentation: { method: 'adapter' | 'intl'; notes: string };
  extraProvenance?: string[];
  /** Writing direction of the script; 'ltr' when absent (Hebrew is 'rtl'). */
  direction?: 'ltr' | 'rtl';
}

export function plannedManifest(s: PlannedSpec): PackManifest {
  const lang = s.languageId;
  return {
    packId: `pack:${lang}`,
    languageId: lang,
    varietyId: s.varietyId,
    scriptId: s.scriptId,
    version: s.version,
    compatibility: { contractVersion: CONTRACT_VERSION, extensionMin: '0.1.0' },
    identity: { name: s.name, nativeName: s.nativeName, direction: s.direction ?? 'ltr' },
    varieties: s.varieties,
    lexical: {
      handLexicon: { ref: `src/adapters/${lang}.ts (course word list and rules)`, licence: 'Owner-authored, AI-drafted', reviewStatus: 'machine-drafted' },
      ...(s.dictionary
        ? {
            dictionary: {
              id: s.dictionary.id ?? 'kaikki-' + lang + '@2026-09-28',
              baseUrl: `dict/${lang}/`,
              licence: 'CC BY-SA 4.0 (Wiktionary contributors, via kaikki.org)',
              attribution: KAIKKI_ATTRIBUTION,
              entries: s.dictionary.entries,
              frequency: s.dictionary.frequency,
            },
          }
        : {}),
    },
    analyzer: { id: `adapter-${lang}@${s.version}`, version: s.version, capabilities: s.capabilities },
    segmentation: s.segmentation,
    sentenceBoundaries: { method: 'adapter' },
    grammar: { features: s.features, constructions: s.constructions },
    pronunciation: {
      registryRef: `golisten:${lang}`,
      notesAvailable: false,
      recordings: 'none',
      deviceVoiceExpected: false,
      remoteVoice: { provider: 'azure', voices: s.voices, requiresConsentAndKey: true },
    },
    tutorial: { ref: `tutorial/${lang}`, estimatedMinutes: 20, skippable: true },
    rights: {
      provenance: [
        `Planned, not installable. An analyser exists (adapter-${lang}@${s.version}): ${s.adapterSummary}`,
        s.dictionary
          ? `A kaikki dictionary for this language is built in the repository (${s.dictionary.entries.toLocaleString('en')} entries, CC BY-SA 4.0) but it has not been declared, installed or checked as part of a pack.`
          : 'There is no dictionary for this language in the repository yet (only a frequency list, if any); a pack would have to build one first.',
        'Not yet written for this pack: the grammar tables beyond the few entries listed, the validation cases, the orientation tutorial (tutorial/' + lang + ' does not exist; its length is an estimate), pronunciation notes and any recordings.',
        'Nothing in this pack has been reviewed by a native speaker. The voices named are the remote voices expected to be offered, each only with the learner’s consent and key.',
        ...(s.extraProvenance ?? []),
      ],
      licences: [
        { resource: `Course word list and rules (adapter-${lang})`, licence: 'Owner-authored, AI-drafted; not reviewed by a native speaker' },
        ...(s.dictionary ? [{ resource: `Dictionary ${s.dictionary.id ?? `kaikki-${lang}@2026-09-28`}`, licence: 'CC BY-SA 4.0 (Wiktionary contributors, via kaikki.org)', notice: KAIKKI_ATTRIBUTION }] : []),
      ],
      reviewStatus: 'machine-drafted',
    },
    validation: [],
    status: 'planned',
  };
}

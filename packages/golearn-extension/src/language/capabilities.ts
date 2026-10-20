/**
 * What the reader can offer in a language, from what the language's pack REALLY supports.
 *
 * The pack side (`@go/language-packs` capabilities.ts) reports the facts: tokenisation quality, lemma, morphology,
 * phrases, constructions, syntax roles, checker, script handling, audio, review status and level. This module adds the
 * one thing only the extension knows, whether the parser can read the language at all, and turns the facts into the plain
 * lines a setup page or a card can show. It never adds a capability the pack does not report.
 *
 * Audio comes from GoListen's voice registry, read HERE and handed to the report as a provider: `@go/language-packs` may not
 * reach GoListen (test/audit/conformance.structure.test.ts). For the same reason this module must not be reachable from an entry
 * that is not allowed to reach GoListen; it is not imported by the content script (the reports pull in the voice registry and
 * the manifests) and, today, by no entry. The content script asks the parser (`PARSER_LANGUAGES`) and the resolver.
 */
import { defaultRegistries, indexRegistries, languageAvailability } from '../../../golisten/src';
import type { LanguageAvailability, VoiceRegistry } from '../../../golisten/src';
import type { GoListenEnv } from '../../../golisten/src/environment';
import { LEVEL_LABEL, PACKS, packCapabilities as packReport, packFor, type AudioCapability, type PackCapabilities } from '../../../language-packs/src';
import { PARSER_LANGUAGES } from '../parser';

let registryIndex: Map<string, VoiceRegistry> | undefined;
const registryOf = (languageId: string): VoiceRegistry | undefined => (registryIndex ??= indexRegistries(defaultRegistries())).get(languageId);

/** What GoListen's registry holds for a language (static facts; `audioAvailability` is the live half). */
export function audioOf(languageId: string): AudioCapability {
  const r = registryOf(languageId);
  if (!r) return { recordings: 0, deviceVoiceTemplate: false, remoteVoices: [], phoneticNotes: false, listeningEvidence: false, gaps: [`No voices are registered for ${languageId}; nothing is claimed.`] };
  return {
    recordings: r.entries.reduce((n, e) => n + (e.source.kind === 'recorded' ? e.source.recordings.length : 0), 0),
    deviceVoiceTemplate: r.entries.some((e) => e.source.kind === 'device'),
    remoteVoices: r.entries.filter((e) => e.source.kind === 'remote').map((e) => e.voiceId),
    phoneticNotes: !!r.phonetics,
    listeningEvidence: false,
    gaps: [...r.gaps],
  };
}

/** The live half of the audio line: whether any voice can speak RIGHT NOW in this environment, by GoListen's own availability function. */
export function audioAvailability(languageId: string, env: GoListenEnv): Promise<LanguageAvailability> {
  return languageAvailability(languageId, registryOf(languageId), env);
}

/** The pack's capability report with the audio line filled from GoListen. */
export const packCapabilities = (languageId: string): PackCapabilities | undefined => packReport(languageId, audioOf);

export interface ReaderSupport {
  languageId: string;
  /** The parser can read selections in this language (its analyser is wired in). */
  parseable: boolean;
  /** The words the setup page shows: "installable", "experimental, seed-only lemmatisation, unreviewed", "planned, not installable". */
  levelLabel: string;
  report: PackCapabilities;
  /** What a card in this language can show, derived from the report (nothing the report does not state). */
  offers: {
    lemma: boolean; morphology: boolean; phrases: boolean; constructions: boolean;
    /** Always false today: no analyser gives syntactic roles. */
    syntaxRoles: boolean;
    pronunciationNotes: boolean;
    productionChecks: boolean;
  };
  /** Short plain lines for the learner, most important first. */
  lines: string[];
}

/** The reader's view of one language; undefined when there is no pack for it. */
export function readerSupport(languageId: string): ReaderSupport | undefined {
  const report = packReport(languageId, audioOf);
  const pack = packFor(languageId);
  if (!report || !pack) return undefined;
  const parseable = PARSER_LANGUAGES.includes(languageId);
  const offers = {
    lemma: parseable && report.lemma.supported,
    morphology: parseable && report.morphology.supported,
    phrases: parseable && report.phrases.supported,
    constructions: parseable && report.constructions.supported,
    syntaxRoles: parseable && report.syntaxRoles.supported,
    pronunciationNotes: parseable && pack.pronunciation.notesAvailable,
    productionChecks: report.checker.offered,
  };
  const lines: string[] = [];
  if (!parseable) lines.push('The reader cannot read selections in this language yet.');
  if (report.level === 'experimental') lines.push('Experimental: nothing in this pack has been reviewed by a native speaker.');
  else if (report.reviewStatus === 'machine-drafted') lines.push('Machine-drafted: no native speaker has checked this pack.');
  if (parseable && report.lemma.supported && report.lemma.quality === 'seed-only') lines.push('Lemmas come from a small word list; other words get a marked guess or nothing.');
  if (parseable && report.tokenization.quality === 'limited') lines.push('Word boundaries are limited, so a selection may be cut where you do not expect.');
  if (parseable && !report.morphology.supported) lines.push('No morphology for this language.');
  lines.push('No syntactic roles: a card never labels subject or object.');
  if (!report.checker.offered) lines.push('Nothing you write is checked.');
  const au = report.audio;
  if (au?.deviceVoiceTemplate) lines.push('A matching voice on your device can read text aloud as practice only; installed voices vary.');
  else if (au && au.remoteVoices.length === 0) lines.push(au.recordings > 0 ? 'The only audio is a short demonstration clip; no voice can read other text aloud.' : 'No voice is registered for this language: nothing can be played.');
  return { languageId, parseable, levelLabel: LEVEL_LABEL[report.level], report, offers, lines };
}

/** The reader's view of every language that has a pack. */
export function readerSupportList(): ReaderSupport[] {
  return Object.keys(PACKS).map((l) => readerSupport(l)).filter((s): s is ReaderSupport => !!s);
}

export type { PackCapabilities } from '../../../language-packs/src';

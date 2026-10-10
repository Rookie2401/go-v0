/**
 * The language catalogue: the six languages of interest, in the order a picker shows them, each with what a learner needs to
 * choose well. The product serves exactly these six; any learner may pick any language pack freely (there are no teams in the
 * apps, and a team is no longer how a language is chosen), and an account is optional.
 *
 *   Norwegian   (nb)  two written standards, Bokmål and Nynorsk, each its own pack; neither is the default for the other
 *   German      (de)
 *   Albanian    (sq)
 *   Hindi       (hi)  Devanagari
 *   Thai        (th)  Thai script
 *   Spanish     (es)  Honduras is a regional preference of the one Spanish pack, not a language of its own
 *
 * Everything but the fixed identity (which packs, which written standards, which varieties) is READ, never written here: the
 * names, script, level and validation come from the manifests; "a tutorial is available" from the tutorial registry and the
 * manifest's own tutorial reference; the audio line from the GoListen notes when a provider is given (else "no validated audio");
 * `whatWorks` and `whatDoesNot` from the capability report of each pack (capabilities.ts), so they cannot claim what the analyser
 * does not do.
 *
 * The report needs the analyser. In a build that links every adapter (servers, tests) the catalogue is complete at import; in an
 * extension build that loads analysers lazily, `LANGUAGE_CATALOGUE` is built from whatever is linked in at import, and a caller
 * that has loaded the analysers builds its own with `buildCatalogue({ adapterOf, audio })`. A language whose analyser is not
 * available says so in `whatWorks` instead of claiming anything.
 */
import type { LanguageAdapter, SupportLevel } from '../../../src/core';
import type { ValidationLevel } from '../../repository-contract/src';
import { capabilitiesOf, type AudioCapability, type AudioProvider, type PackCapabilities } from './capabilities';
import { LEVEL_LABEL, levelOf, validationOf, type PackLevel, type PackManifest, type ReviewStatus } from './manifest';
import { PACKS } from './registry';
import { builtInAdapter } from './runtime';
import { tutorialFor } from './tutorial';

export interface WrittenStandard { id: 'nb' | 'nn'; label: string }
export interface CatalogueVariety { id: string; label: string }

/** One pack behind a catalogue entry, with its own level, validation and tutorial. */
export interface CataloguePack {
  packId: string;
  languageId: string;
  name: string;
  level: PackLevel;
  levelLabel: string;
  validation: ValidationLevel;
  reviewStatus: ReviewStatus;
  tutorialAvailable: boolean;
}

export interface CatalogueEntry {
  /** The id the picker selects: the first pack's language id ('nb' for Norwegian). */
  languageId: string;
  name: string;
  nativeName: string;
  /** ISO 15924 code of the script ('Latn', 'Deva', 'Thai'). */
  scriptId: string;
  /** The script in plain words ('Latin', 'Devanagari', 'Thai script'). */
  scriptName: string;
  packIds: string[];
  packs: CataloguePack[];
  /** The weakest level / validation among the packs (Norwegian has two). */
  level: PackLevel;
  levelLabel: string;
  validation: ValidationLevel;
  /** True when every pack of the entry has an orientation tutorial and its manifest points at it. */
  tutorialAvailable: boolean;
  /** One line about audio: GoListen's notes when given, else "no validated audio". */
  audio: string;
  /** One sentence about what a card gives, from the capability report. */
  whatWorks: string;
  /** One sentence about what it does not, from the capability report. */
  whatDoesNot: string;
  /** Norwegian only: the two written standards the learner chooses between. */
  writtenStandards?: WrittenStandard[];
  /** Spanish only: the general variety and the regional preference. */
  varieties?: CatalogueVariety[];
}

interface Spec {
  packIds: string[];
  /** Overrides the manifest's own names where one entry covers two packs. */
  identity?: { name: string; nativeName: string };
  writtenStandards?: WrittenStandard[];
  varieties?: CatalogueVariety[];
}

/** The six languages, in picker order. This table is the only hand-written part: which packs belong to a language. */
const SPECS: readonly Spec[] = [
  {
    packIds: ['pack:nb', 'pack:nn'],
    identity: { name: 'Norwegian', nativeName: 'norsk' },
    writtenStandards: [{ id: 'nb', label: 'Bokmål' }, { id: 'nn', label: 'Nynorsk' }],
  },
  { packIds: ['pack:de'] },
  { packIds: ['pack:sq'] },
  { packIds: ['pack:hi'] },
  { packIds: ['pack:th'] },
  {
    packIds: ['pack:es'],
    varieties: [{ id: 'es-standard', label: 'General' }, { id: 'es-HN', label: 'Honduras (regional preference)' }],
  },
];

const SCRIPT_NAME: Readonly<Record<string, string>> = { Latn: 'Latin', Deva: 'Devanagari', Thai: 'Thai script' };

const LEVEL_RANK: Readonly<Record<PackLevel, number>> = { planned: 0, experimental: 1, installable: 2 };
const VALIDATION_ORDER: readonly ValidationLevel[] = ['unsupported', 'experimental', 'unreviewed', 'incomplete', 'production-validated'];
const SUPPORT_RANK: Readonly<Record<SupportLevel, number>> = { none: 0, 'seed-only': 1, limited: 2, dependable: 3 };

const weakest = <T>(items: readonly T[], rank: (t: T) => number): T => items.reduce((a, b) => (rank(b) < rank(a) ? b : a));
const weakestSupport = (levels: readonly SupportLevel[]): SupportLevel => weakest(levels, (l) => SUPPORT_RANK[l]);
const list = (xs: string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** "no validated audio" unless GoListen's notes for the language say something. */
export function audioLine(notes: AudioCapability | undefined): string {
  if (!notes) return 'no validated audio';
  const parts: string[] = [];
  if (notes.recordings > 0) parts.push(`${notes.recordings} short demonstration recording${notes.recordings === 1 ? '' : 's'}`);
  if (notes.deviceVoiceTemplate) parts.push('a voice from your device, if it has one');
  if (notes.remoteVoices.length > 0) parts.push('a remote voice, only with your consent and your own key');
  if (parts.length === 0) return 'no validated audio';
  return `${parts.join('; ')}; none of it is listening evidence`;
}

/** One sentence: what a card gives, from the reports of the entry's packs. */
function whatWorksOf(reports: readonly PackCapabilities[]): string {
  if (reports.some((r) => r.analyzer === 'none')) {
    return 'The analyser is not loaded in this build, so no card capability is claimed here until it is.';
  }
  const all = (f: (r: PackCapabilities) => boolean): boolean => reports.every(f);
  const things: string[] = [];
  if (all((r) => r.lemma.supported)) things.push(`its lemma (${weakestSupport(reports.map((r) => r.lemma.quality))})`);
  if (all((r) => r.morphology.supported)) things.push(`its grammar features (${weakestSupport(reports.map((r) => r.morphology.quality))})`);
  else if (reports.some((r) => r.morphology.supported)) things.push('grammar features in some packs');
  if (all((r) => r.phrases.supported)) things.push('fixed phrases');
  if (all((r) => r.constructions.supported)) things.push('listed sentence patterns');
  const tok = weakestSupport(reports.map((r) => (r.tokenization.quality === 'none' ? 'none' : (r.tokenization.quality as SupportLevel))));
  const words = tok === 'dependable' ? 'a word' : `a word (word boundaries are ${tok})`;
  return things.length
    ? `Selecting ${words} in a sentence gives ${list(things)}, each read with its neighbouring words.`
    : `Selecting ${words} in a sentence splits the words and sentences, and nothing more is claimed.`;
}

/** One sentence: what it does not, from the same reports and the manifests' review status. */
function whatDoesNotOf(reports: readonly PackCapabilities[]): string {
  const limits: string[] = [];
  if (reports.some((r) => r.analyzer === 'none')) limits.push('nothing is lemmatised or analysed until the analyser is loaded');
  if (reports.some((r) => r.lemma.supported && r.lemma.quality === 'seed-only')) limits.push('lemmas come from a small machine-drafted word list, so other words get a marked guess or nothing');
  if (reports.some((r) => r.reviewStatus !== 'reviewed')) limits.push('no native speaker has reviewed the pack');
  if (reports.some((r) => r.tokenization.quality === 'limited')) limits.push('word boundaries are limited');
  limits.push('there are no subject or object labels');
  if (reports.some((r) => !r.checker.offered)) limits.push('nothing you write is checked');
  return `${limits[0][0].toUpperCase()}${limits[0].slice(1)}${limits.length > 1 ? `; ${limits.slice(1).join('; ')}` : ''}.`;
}

function packOf(m: PackManifest): CataloguePack {
  const t = tutorialFor(m.languageId);
  return {
    packId: m.packId,
    languageId: m.languageId,
    name: m.identity.name,
    level: levelOf(m),
    levelLabel: LEVEL_LABEL[levelOf(m)],
    validation: validationOf(m),
    reviewStatus: m.rights.reviewStatus,
    tutorialAvailable: !!t && t.ref === m.tutorial.ref,
  };
}

export interface CatalogueOptions {
  /** GoListen's notes per language (the extension's capability view supplies one); without it every audio line is "no validated audio". */
  audio?: AudioProvider;
  /** Where an analyser comes from; default: the ones this build links in. */
  adapterOf?: (languageId: string) => LanguageAdapter | undefined;
}

/** Builds the six entries. A pack missing from the registry is a bug and throws. */
export function buildCatalogue(options: CatalogueOptions = {}): CatalogueEntry[] {
  const adapterOf = options.adapterOf ?? builtInAdapter;
  return SPECS.map((spec): CatalogueEntry => {
    const manifests = spec.packIds.map((id) => {
      const m = Object.values(PACKS).find((p) => p.packId === id);
      if (!m) throw new Error(`the catalogue names ${id}, which is not in the pack registry`);
      return m;
    });
    const first = manifests[0];
    const packs = manifests.map(packOf);
    const reports = manifests.map((m) => capabilitiesOf(m, adapterOf(m.languageId), options.audio));
    const level = weakest(packs.map((p) => p.level), (l) => LEVEL_RANK[l]);
    const lines = reports.map((r) => audioLine(r.audio));
    const audio = lines.every((l) => l === lines[0]) ? lines[0] : lines.map((l, i) => `${packs[i].name}: ${l}`).join('; ');
    return {
      languageId: first.languageId,
      name: spec.identity?.name ?? first.identity.name,
      nativeName: spec.identity?.nativeName ?? first.identity.nativeName,
      scriptId: first.scriptId,
      scriptName: SCRIPT_NAME[first.scriptId] ?? first.scriptId,
      packIds: [...spec.packIds],
      packs,
      level,
      levelLabel: LEVEL_LABEL[level],
      validation: weakest(packs.map((p) => p.validation), (v) => VALIDATION_ORDER.indexOf(v)),
      tutorialAvailable: packs.every((p) => p.tutorialAvailable),
      audio,
      whatWorks: whatWorksOf(reports),
      whatDoesNot: whatDoesNotOf(reports),
      ...(spec.writtenStandards ? { writtenStandards: spec.writtenStandards.map((s) => ({ ...s })) } : {}),
      ...(spec.varieties ? { varieties: spec.varieties.map((v) => ({ ...v })) } : {}),
    };
  });
}

/** The six languages of interest, in the order a picker shows them. */
export const LANGUAGE_CATALOGUE: readonly CatalogueEntry[] = Object.freeze(buildCatalogue());

/** The entry of a language or of any of its packs (`nn` finds Norwegian); undefined for a language outside the six. */
export function catalogueEntry(languageId: string, catalogue: readonly CatalogueEntry[] = LANGUAGE_CATALOGUE): CatalogueEntry | undefined {
  return catalogue.find((e) => e.languageId === languageId || e.packs.some((p) => p.languageId === languageId));
}

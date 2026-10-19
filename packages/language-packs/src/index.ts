/**
 * @go/language-packs — the reusable language-pack framework of GoLearn, and the Albanian reference pack. Seven languages of interest
 * (Norwegian, German, Albanian, Hindi, Thai, Spanish, Latin) are offered to any learner: see catalogue.ts.
 * Imports: the repository contract, src/adapters/* (the analysers), src/dict/* (the sharded dictionary reader) and
 * src/core types. Never an application package. See README.md.
 */
export { validateManifest, toPackInfo, levelOf, validationOf, LEVEL_LABEL, KAIKKI_ATTRIBUTION, MIN_VALIDATION_CASES } from './manifest';
export type {
  GrammarConstruction, GrammarFeature, PackLevel, PackManifest, PackVariety, ReviewStatus, ValidationCase,
} from './manifest';
export { readSelection, runCase, statusOf, CLOSE, HIGH_CONFIDENCE } from './analysis';
export type { CaseResult, ReadingStatus, SelectionReading } from './analysis';
export { albanianManifest, SQ_PACK_ID, SQ_VALIDATION } from './packs/sq';
export { plannedManifest } from './packs/planned';
export { spanishManifest, ES_PACK_ID, ES_VERSION, ES_VALIDATION } from './packs/es';
export { germanManifest, DE_VERSION, DE_VALIDATION } from './packs/de';
export { hindiManifest, HI_VERSION, HI_VALIDATION } from './packs/hi';
export { thaiManifest, TH_VERSION, TH_VALIDATION } from './packs/th';
export { experimentalManifest } from './packs/experimental';
export type { ExperimentalSpec } from './packs/experimental';
export { bokmalManifest, NB_VERSION, NB_VALIDATION } from './packs/nb';
export { nynorskManifest, NN_VERSION, NN_VALIDATION } from './packs/nn';
export { latinManifest, LA_VERSION, LA_VALIDATION, LA_DICTIONARY } from './packs/la';
export {
  SQ_TUTORIAL, SQ_TUTORIAL_STEPS, SQ_PASSAGE, ES_TUTORIAL, ES_TUTORIAL_STEPS, ES_PASSAGE, DE_TUTORIAL, DE_TUTORIAL_STEPS, HI_TUTORIAL, HI_TUTORIAL_STEPS,
  TH_TUTORIAL, TH_TUTORIAL_STEPS, NB_TUTORIAL, NB_TUTORIAL_STEPS, NN_TUTORIAL, NN_TUTORIAL_STEPS, LA_TUTORIAL, LA_TUTORIAL_STEPS, TUTORIALS, tutorialFor,
} from './tutorial';
export type {
  Tutorial, TutorialAuthorship, TutorialExample, TutorialPassage, TutorialPractice, TutorialStep, TutorialStepKind,
} from './tutorial/types';
export { createPackRuntime, installPack, verifyInstalled, intlAnalyzer, installedKey, joinUrl } from './runtime';
export type {
  EntryResult, FormOfVia, GlossResult, GlossSense, InstallDeps, InstallFailure, InstallProgress, InstallResult, InstallVerified, InstalledRecord,
  PackAnalyzer, PackRuntime, PackRuntimeDeps, PackStorage, VerifyResult,
} from './runtime';
export { packCapabilities, allPackCapabilities, capabilitiesOf } from './capabilities';
export type { AudioCapability, AudioProvider, PackCapabilities, Quality, ScriptHandlingItem } from './capabilities';
export { PACKS, TEAMS, packFor, installablePacks, teamList, languagesOf } from './registry';
export type { Team, TeamId, TeamLanguage } from './registry';
export { LANGUAGE_CATALOGUE, buildCatalogue, catalogueEntry, audioLine } from './catalogue';
export type { CatalogueEntry, CatalogueOptions, CataloguePack, CatalogueVariety, WrittenStandard } from './catalogue';

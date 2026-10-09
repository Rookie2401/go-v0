/**
 * @go/language-packs — the reusable language-pack framework of GoLearn, and the Albanian reference pack.
 * Imports: the repository contract, src/adapters/* (the analysers), src/dict/* (the sharded dictionary reader) and
 * src/core types. Never an application package. See README.md.
 */
export { validateManifest, toPackInfo, KAIKKI_ATTRIBUTION, MIN_VALIDATION_CASES } from './manifest';
export type {
  GrammarConstruction, GrammarFeature, PackManifest, PackVariety, ReviewStatus, ValidationCase,
} from './manifest';
export { readSelection, runCase, statusOf, CLOSE, HIGH_CONFIDENCE } from './analysis';
export type { CaseResult, ReadingStatus, SelectionReading } from './analysis';
export { albanianManifest, SQ_PACK_ID, SQ_VALIDATION } from './packs/sq';
export { plannedManifest } from './packs/planned';
export { spanishManifest } from './packs/es';
export { germanManifest } from './packs/de';
export { hindiManifest } from './packs/hi';
export { thaiManifest } from './packs/th';
export { bokmalManifest } from './packs/nb';
export { nynorskManifest } from './packs/nn';
export { SQ_TUTORIAL, SQ_TUTORIAL_STEPS, SQ_PASSAGE } from './tutorial/sq';
export type {
  Tutorial, TutorialAuthorship, TutorialExample, TutorialPassage, TutorialPractice, TutorialStep, TutorialStepKind,
} from './tutorial/types';
export { createPackRuntime, installPack, verifyInstalled, intlAnalyzer, installedKey, joinUrl } from './runtime';
export type {
  GlossResult, GlossSense, InstallDeps, InstallFailure, InstallProgress, InstallResult, InstallVerified, InstalledRecord,
  PackAnalyzer, PackRuntime, PackRuntimeDeps, PackStorage, VerifyResult,
} from './runtime';
export { PACKS, TEAMS, packFor, installablePacks, teamList, languagesOf } from './registry';
export type { Team, TeamId, TeamLanguage } from './registry';

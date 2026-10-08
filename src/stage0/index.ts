/**
 * Stage 0 — the zero-to-language bootstrap (docs/STAGE0.md).
 *   createStage0(deps)        the service the UI calls (also bound per learner with forUser)
 *   bundledStage0()           content packs from data/stage0
 *   validatePack()            authoring validation (npm run stage0:validate)
 *   pathCoverage()            expected coverage along the intended path
 *   foldStage0()              learner state, a pure fold of the event log
 */
export { createStage0 } from './service';
export type { Stage0Deps, Stage0ServiceImpl } from './service';
export { bundledStage0, packsFrom, stepTitle, characterName } from './content';
export type { Stage0Pack, Stage0World } from './content';
export { validatePack, signatureOf } from './validate';
export type { Stage0Issue } from './validate';
export { pathCoverage, exitCoverage, pathItems, itemKey } from './coverage';
export type { StepCoverage } from './coverage';
export { foldStage0, supportsInVisit, checksSecure, STAGE0_TYPES, READ_SECURE } from './state';
export type { Stage0State, Stage0StepFacts } from './state';
export { presentation, channelWords } from './fading';
export { chooseForm, scoreExit, unavailableSections, readingPassed, ladderOpening, selfCheckPasses } from './exit';
export { matchAnswer, normalizeAnswer } from './match';
export { wordsOf, featuresOfWord, describeFeature } from './features';
export type { WordInfo } from './features';
export { sceneDocument, sceneTextId, lineSentenceId, STAGE0_CORPUS } from './documents';
export { STAGE0_LANGS, stage0Config } from './lang';
export type { Stage0LanguageConfig, Stage0SpellingFeature, Stage0FadePolicy } from './lang';

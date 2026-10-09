/**
 * What the application needs from its environment, as one injectable object (`Deps`), plus the views of the language
 * packs, teams and tutorial it renders. `bindings.ts` is the only file that imports the sibling packages and adapts
 * them to these views; tests pass fakes.
 */
import type { RepositoryApi } from '../../repository-service/src/api';
import type { ChromeApi, StorageArea } from '../src/platform';
import type { SpeechLike } from '../src/popup/card';
import type { AppConfig } from './config';

// ───────────────────────────── language packs, teams, tutorial ─────────────────────────────

export interface PackVarietyView { varietyId: string; label: string; writtenStandard?: 'nb' | 'nn'; /** false: the pack only relates forms to this variety; it cannot be chosen as one’s own. */ analysed: boolean }

export interface PackView {
  packId: string;
  languageId: string;
  version: string;
  name: string;
  nativeName: string;
  /** 'planned' packs are listed honestly and can neither be enrolled in nor installed. */
  status: 'installable' | 'planned';
  /** How far the pack is built: an experimental pack is installable but seed-only and unreviewed, and is never shown as plainly installable. */
  level: 'installable' | 'experimental' | 'planned';
  /** The words the learner sees for `level` ("installable", "experimental, seed-only lemmatisation, unreviewed", "planned, not installable"). */
  levelLabel: string;
  defaultVarietyId: string;
  scriptId: string;
  varieties: PackVarietyView[];
  licences: Array<{ resource: string; licence: string; notice?: string }>;
  /** Lines the pack requires wherever its dictionary is shown (CC BY-SA attribution). */
  attribution: string[];
  reviewStatus: string;
  provenance: string[];
  /** Named remote speech provider, when the pack expects one (offered only with consent and a key). */
  remoteVoiceProvider?: string;
  /** The pack’s own manifest, handed unchanged to `install` and `verify`. */
  manifest: unknown;
}

export interface TeamLanguageView {
  languageId: string;
  label: string;
  /** The variety this team’s language stands for (Honduras: es-HN). */
  varietyId?: string;
  /** The learner must choose this explicitly (Norwegian: the written standard); nothing is preselected. */
  requiredChoice?: boolean;
}
export interface TeamView {
  teamId: string;
  name: string;
  languages: TeamLanguageView[];
  /** Why a choice is forced for this team, when it is (Norway: the written standard). */
  note?: string;
}

export interface VerifyCheck { id: string; label: string; ok: boolean; detail?: string }
export interface VerifyView {
  ok: boolean;
  /** Dictionary manifest, sample shard and each validation case, in order. */
  checks: VerifyCheck[];
  version?: string;
  message?: string;
}

export interface InstallOptions {
  fetch: typeof fetch;
  baseUrl: string;
  storage: StorageArea;
  onProgress?: (done: number, total: number, label?: string) => void;
}

export interface TutorialExampleView { surface: string; gloss: string; note?: string }
export interface TutorialStepView {
  id: string;
  /** The pack’s own kind: alphabet, sounds, words, patterns, passage, concept, practice. */
  kind: string;
  title: string;
  /** Plain text. */
  body: string;
  examples?: TutorialExampleView[];
  estimatedMinutes: number;
  /** A practice step: the sentence shown and parsed with the real analyser, and the word to select in it. */
  practice?: { instruction: string; sentence: string; target: string };
  /** The demonstration passage: sentences the learner may look any word up in. */
  passage?: { title: string; sentences: Array<{ text: string; gloss: string }> };
}
export interface TutorialView {
  languageId: string;
  /** One honest sentence about who wrote and who has (not) reviewed the orientation. */
  notice: string;
  estimatedMinutes: number;
  steps: TutorialStepView[];
}

export interface PackBindings {
  packs(): PackView[];
  teams(): TeamView[];
  packFor(languageId: string): PackView | undefined;
  install(pack: PackView, options: InstallOptions): Promise<VerifyView>;
  verify(pack: PackView, storage: StorageArea): Promise<VerifyView>;
  tutorial(languageId: string): TutorialView | undefined;
}

// ───────────────────────────── the environment ─────────────────────────────

export interface Deps {
  win: Window;
  doc: Document;
  /** The extension API, only when this page is really an extension page (see getChrome). */
  chrome: ChromeApi | undefined;
  fetch: typeof fetch;
  /** chrome.storage.local in the extension; the app’s own localStorage otherwise. */
  area: StorageArea;
  packs: PackBindings;
  config: AppConfig;
  createApi(baseUrl: string, token?: string): RepositoryApi;
  /** Offers a file to the learner (a Blob link click). */
  download(filename: string, blob: Blob): void;
  now(): Date;
  /** Closes this tab when the browser allows it; false when it does not. */
  closeWindow(): boolean;
  copyText(text: string): Promise<boolean>;
  /** The application’s own version. */
  appVersion: string;
  /** null = no speech in the tutorial’s card (tests); undefined = the browser’s own. */
  speech?: SpeechLike | null;
  /** Wait between asynchronous ticks (tests pass an immediate promise). */
  nextFrame?: () => Promise<void>;
}

/**
 * Bootstrap: store → bus → adapters → engines → bundled content → policy migration.
 *
 * A page opened with `?sandbox=<name>` opens database `go-v0-sandbox-<name>` and namespaces every localStorage key (ui/sandbox.ts).
 *
 * Order matters:
 *   1. seed languages / courses (and the first learner once a team has been chosen);
 *   2. GoListen is created WITHOUT the fixture unless preview mode or the development preference is on; a remembered
 *      Azure key (only ever stored when the learner ticked "remember on this device") is turned into a provider;
 *      the app's own speech service (`ProxySpeechProvider`, same-origin /api/speech/*, key held server-side from
 *      AZURE_SPEECH_KEY / AZURE_SPEECH_REGION) is asked for its status in the background and registered when it reports
 *      available, or reports missing credentials (it exists but has no key: GoListen then says so and audio stays honestly
 *      unavailable; Settings → Speech shows its instruction and a "Check again" button). Not reachable / no proxy on this
 *      host: not registered. No key is ever stored or bundled for that path;
 *   3. GoLearn (+ `audioEligible`: reviewed real speech exists for a text) and GoTell;
 *   4. the bundled corpus goes through the importer (validated as one batch, atomic, repeatable; skipped when the
 *      bundle is unchanged since the last successful import);
 *   5. `golearn.ensureCurrent(userId)`: state derived under an older evidence policy is rebuilt from the event log
 *      before anything is shown (nothing is deleted from the log).
 *
 * The UI never imports the engines' extras directly: the importer, backup and speech-provider controls reach it as
 * small interfaces in `AppServices` (ingest / backup / speech), bound to the real modules here.
 */
import { COURSES, LANGUAGE_ROWS, StoreEventBus, hash } from '../core';
import type { AppStore, Course, EventBus, GoListen, LanguageCode, LexiconSource, ProviderAvailability, TtsProvider, User } from '../core';
import { createCourseCatalog } from '../course';
import { createDexieStore } from '../db/dexie';
import { createFetchLexiconSource } from '../dict';
import { createAdapterRegistry } from '../adapters';
import { exportLearner, restoreLearner, validateBackup } from '../backup';
import type { BackupFile } from '../backup';
import { createGoLearn } from '../golearn';
import { AZURE_PROVIDER_ID, AzureSpeechProvider, ProxySpeechProvider, createGoListen } from '../golisten';
import { createGoTell } from '../gotell';
import { INGEST_TOOL, contentHistory, importDocuments, loadBundledCorpus, previewDocuments } from '../ingest';
import type { ImportOptions } from '../ingest';
import type { DocumentReport } from '../ingest';
import { plainTextToDocuments } from '../ingest/plaintext';
import type { AppServices, BackupApi, ImportDocView, IngestApi, SpeechApi, StartupInfo } from '../ui/context';
import { resolveDbName, sandboxProblem } from '../ui/sandbox';
import {
  DEFAULT_USER_ID, forgetAzure, getPref, recallActiveUser, recallAzure, recallChosenCourse, rememberAzure, rememberChosenCourse, subscribePrefs,
} from '../ui/prefs';

export interface BootstrapOptions {
  /** Default: Dexie (IndexedDB). Tests pass createMemoryStore(). */
  store?: AppStore;
  /** Database name (default `go-v0`). A page opened with `?sandbox=<name>` always uses `go-v0-sandbox-<name>` instead (see ui/sandbox.ts). */
  dbName?: string;
  /** Skip importing the bundled corpus (tests). */
  skipCorpus?: boolean;
  /** Last active learner id (persisted by the caller). */
  userId?: string;
  /** Learn this course without the onboarding screen (tests, deep links). Otherwise the learner is created once a team has been chosen. */
  courseId?: string;
  clock?: () => string;
  /** Override "fixture audio allowed" (default: preview mode or the development preference). */
  allowFixture?: boolean;
  /** Extra TTS providers (tests). */
  providers?: TtsProvider[];
  /**
   * The app's own speech service. Default: a `ProxySpeechProvider` on the same origin. `false` skips the check (no
   * server on this deployment, or a test that wants no request). `provider` substitutes the provider (tests);
   * `baseUrl` / `fetch` are passed to the real one.
   */
  speechProxy?: false | { baseUrl?: string; fetch?: typeof fetch; provider?: TtsProvider };
}

/** The speech-service check runs in the background; if it has not answered by now the service is treated as unknown. */
const PROXY_CHECK_TIMEOUT_MS = 4000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => { handle = setTimeout(() => resolve(undefined), ms); });
  return Promise.race([p, timeout]).finally(() => clearTimeout(handle));
}

export interface BootstrapResult {
  services: AppServices;
  /** null on a first run: the UI shows the "Which team are you on?" screen and creates the learner. */
  user: User | null;
  course: Course | null;
}

export { DEFAULT_USER_ID };

/** meta row that records the last successful bundled-corpus import (importer version + content fingerprint). */
export const BUNDLE_META_ID = 'bundled-corpus';

/**
 * Seed languages and courses (idempotent), and the first learner once a course has been chosen —
 * `courseId` here, or the one remembered from onboarding. With no choice and no learner, nobody is created.
 */
export async function seedFirstRun(store: AppStore, now: string, courseId?: string): Promise<void> {
  await store.languages.bulkPut(LANGUAGE_ROWS);
  await store.courses.bulkPut(COURSES);
  const chosen = courseId ?? recallChosenCourse();
  if ((await store.users.count()) === 0 && chosen && COURSES.some((c) => c.id === chosen)) {
    await store.users.put({ id: DEFAULT_USER_ID, displayName: 'Learner', courseId: chosen, createdAt: now });
    rememberChosenCourse(chosen);
  }
}

const titleOf = (doc: unknown): string | undefined => {
  const t = (doc as { title?: unknown } | null)?.title;
  return typeof t === 'string' ? t : undefined;
};

function toView(d: DocumentReport, title?: string): ImportDocView {
  return {
    id: d.id, title, action: d.action, contentVersion: d.contentVersion, published: d.published, unpublishedReasons: d.unpublishedReasons,
    ...(d.personalCopy ? { personalCopy: true } : {}),
    issues: d.issues.map((i) => ({ path: i.path, code: i.code, message: i.message, hint: i.hint, severity: i.severity })),
    analysisCoverage: d.analysisCoverage.words > 0 ? d.analysisCoverage.coverage : undefined,
    sentencesAdded: d.sentencesAdded, sentencesRetired: d.sentencesRetired, note: d.note,
  };
}

/** The importer bound to this store and these adapters (the in-app importer in Settings → Content and the course pages). */
export function createIngestApi(store: AppStore, adapters: AppServices['adapters'], clock?: () => string, lexicon?: AppServices['lexicon']): IngestApi {
  const importOpts: ImportOptions = { clock, ...(lexicon ? { lexicon } : {}) };
  return {
    convertPlainText: (text, opts) => plainTextToDocuments(text, opts),
    async validate(docs) {
      // A dry run of the import itself: the same validation (known works included), the same planning with the
      // installed dictionary. So the preview says BEFORE importing what the result will say after: the analysis
      // coverage and whether the document would be readable, with what is still missing if not.
      const previews = await previewDocuments(store, adapters, docs, importOpts);
      return previews.map((r, i): ImportDocView => ({
        id: r.id, title: titleOf(docs[i]), action: 'valid',
        issues: r.issues.map((x) => ({ path: x.path, code: x.code, message: x.message, hint: x.hint, severity: x.severity })),
        analysisCoverage: r.analysisCoverage && r.analysisCoverage.words > 0 ? r.analysisCoverage.coverage : undefined,
        ...(r.published !== undefined ? { published: r.published, unpublishedReasons: r.unpublishedReasons } : {}),
        ...(r.personalCopy ? { personalCopy: true } : {}),
        ...(r.note ? { note: r.note } : {}),
      }));
    },
    async import(docs) {
      const report = await importDocuments(store, adapters, docs, importOpts);
      return report.documents.map((d, i) => toView(d, titleOf(docs[i])));
    },
    history: (text) => contentHistory(text),
  };
}

/** Backup / restore bound to this store. */
export function createBackupApi(store: AppStore): BackupApi {
  return {
    exportLearner: (userId, opts) => exportLearner(store, userId, opts),
    check(file) {
      const issues = validateBackup(file);
      const say = (i: { message: string; path?: string }) => (i.path ? `${i.message} (${i.path})` : i.message);
      const errors = issues.filter((i) => i.severity === 'error').map(say);
      const warnings = issues.filter((i) => i.severity === 'warning').map(say);
      const f = file as Partial<BackupFile> | null;
      const c = f && typeof f === 'object' ? f.counts : undefined;
      const summary = c ? [
        c.events !== undefined && `${c.events} history events`,
        c.revisions !== undefined && `${c.revisions} saved versions`,
        c.drafts !== undefined && `${c.drafts} draft(s)`,
        c.recordings !== undefined && `${c.recordings} recording(s)`,
      ].filter(Boolean).join(', ') : undefined;
      return { ok: errors.length === 0, errors, warnings, summary };
    },
    async restore(file, opts) {
      const r = await restoreLearner(store, file, opts);
      const summary: string[] = [];
      if (!r.changed) summary.push('Nothing changed: everything in this file was already on this device.');
      if (r.events.added > 0) summary.push(`${r.events.added} history events added`);
      for (const [name, stat] of Object.entries(r.tables)) {
        if (stat.added > 0 || stat.updated > 0) summary.push(`${name}: ${stat.added} added${stat.updated ? `, ${stat.updated} updated` : ''}`);
        if (stat.keptExisting > 0) summary.push(`${name}: ${stat.keptExisting} kept as they were on this device (newer or different)`);
      }
      if (r.recordings.audioRestored > 0) summary.push(`${r.recordings.audioRestored} recording(s) restored with audio`);
      summary.push(...r.warnings);
      return { needsRebuild: r.needsRebuild, summary };
    },
  };
}

export async function bootstrap(opts: BootstrapOptions = {}): Promise<BootstrapResult> {
  const clock = opts.clock ?? (() => new Date().toISOString());
  // `?sandbox=<name>`: a separate database (and, through ui/prefs + ui/sitting + ui/testimony/draft, separate localStorage keys), so
  // acceptance and import tests never touch the learner's library. An invalid name refuses to start rather than fall back to it.
  const problem = sandboxProblem();
  if (problem) throw new Error(problem);
  const store = opts.store ?? createDexieStore(resolveDbName(opts.dbName));
  const bus: EventBus = new StoreEventBus(store, clock);
  const adapters = createAdapterRegistry();
  const startup: StartupInfo = {};

  await seedFirstRun(store, clock(), opts.courseId);

  // ── GoListen: no fixture unless preview mode or the development preference is on ──
  const wantsFixture = () => opts.allowFixture ?? (getPref('preview') || getPref('devFixtureAudio'));
  const providers: TtsProvider[] = [...(opts.providers ?? [])];
  const remembered = recallAzure();
  let azure: AzureSpeechProvider | undefined;
  if (remembered) { azure = new AzureSpeechProvider({ key: remembered.key, region: remembered.region }); providers.push(azure); }
  const golisten = createGoListen({ store, bus, adapters, clock, providers, allowFixture: wantsFixture() });
  // Preview mode and the development preference flip the fixture switch at runtime; a real provider is unaffected.
  if (opts.allowFixture === undefined) subscribePrefs(() => golisten.setAllowFixture(wantsFixture()));

  // ── the app's own speech service: registered only when it says it is configured and reachable ──
  // Never blocks startup. No key is read, stored or bundled here: the server holds it. When the service reports missing
  // credentials, the provider stays unregistered (audio is honestly unavailable) and Settings → Speech shows its instruction.
  let proxyCheck: Promise<ProviderAvailability | undefined> = Promise.resolve(undefined);
  let proxy: (TtsProvider & { resetAuthFailure?: () => void }) | undefined;
  const checkProxy = (): Promise<ProviderAvailability | undefined> => withTimeout(proxy!.availability(), PROXY_CHECK_TIMEOUT_MS).then(
    (a) => {
      // A proxy that exists but has no key is registered too, so GoListen reports the real reason (missing-credentials).
      if (a?.available || a?.reason === 'missing-credentials') golisten.registerProvider(proxy!);
      return a;
    },
    () => undefined,
  );
  if (opts.speechProxy !== false) {
    const cfg = opts.speechProxy ?? {};
    proxy = cfg.provider ?? new ProxySpeechProvider({
      ...(cfg.baseUrl !== undefined ? { baseUrl: cfg.baseUrl } : {}),
      ...(cfg.fetch !== undefined ? { fetch: cfg.fetch } : {}),
    });
    proxyCheck = checkProxy();
  }

  // ── GoLearn (listening is recommended only where reviewed real speech exists) and GoTell ──
  const golearn = createGoLearn({
    store, bus, adapters, clock,
    audioEligible: async (textId) => {
      try { return (await golisten.audioStatus(textId)).evidenceEligible; } catch { return false; }
    },
  });
  golearn.attach();
  const gotell = createGoTell({ store, bus, adapters, golearn, golisten, clock });

  // ── the reading ladder and the dictionaries ──
  // One lazy source per language: createFetchLexiconSource makes no request until it is first asked something.
  const catalog = createCourseCatalog({ store, golearn });
  const sources = new Map<LanguageCode, LexiconSource>();
  const lexicon: AppServices['lexicon'] = (lang) => {
    let s = sources.get(lang);
    if (!s) { s = createFetchLexiconSource(lang); sources.set(lang, s); }
    return s;
  };

  // ── bundled content through the importer ──
  if (!opts.skipCorpus) {
    const docs = loadBundledCorpus();
    const signature = `${INGEST_TOOL}|${docs.length}|${hash(JSON.stringify(docs))}`;
    const last = await store.meta.get(BUNDLE_META_ID);
    const haveTexts = (await store.texts.count()) > 0;
    if (!(last?.value === signature && haveTexts)) {
      const report = await importDocuments(store, adapters, docs, { clock });
      startup.bundledReport = report.documents.map((d, i) => toView(d, titleOf(docs[i])));
      if (report.ok) await store.meta.put({ id: BUNDLE_META_ID, value: signature, updatedAt: clock() });
      else startup.warnings = [`${report.documents.filter((d) => d.action === 'rejected').length} built-in text(s) were rejected by the importer, so none were imported. See Settings → Content.`];
    }
  }

  // ── which learner, and bring their derived state up to the current evidence policy ──
  const users = await store.users.all();
  const wanted = opts.userId ?? recallActiveUser();
  const user = users.find((u) => u.id === wanted) ?? users.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null;
  const course = user ? (await store.courses.get(user.courseId)) ?? COURSES[0] : null;
  // A restored learner row may exist without the device-local team choice (it is not part of a backup): adopt it.
  if (user && !recallChosenCourse()) rememberChosenCourse(user.courseId);
  if (user) startup.policyRebuilt = await golearn.ensureCurrent(user.id);
  // The ladder of the active course goes into the store (a no-op for a course without one). A failure never stops the app.
  if (course) {
    try { await catalog.install(course.id); } catch (e) {
      startup.warnings = [...(startup.warnings ?? []), `The reading ladder could not be set up: ${e instanceof Error ? e.message : String(e)}`];
    }
  }

  // ── speech-provider controls for Settings → Speech ──
  const speech: SpeechApi = {
    azure: () => ({ configured: !!azure, remembered: !!recallAzure(), region: azure?.region ?? recallAzure()?.region }),
    proxy: () => proxyCheck,
    async recheck() {
      if (!proxy) return undefined;
      // After the learner fixed .env.local and restarted the server: forget the remembered 401, ask again, retry dead audio jobs.
      proxy.resetAuthFailure?.();
      proxyCheck = checkProxy();
      const a = await proxyCheck;
      if (a?.available) await golisten.retryDead().catch(() => 0);
      return a;
    },
    async configureAzure({ key, region, remember }) {
      if (!key.trim() || !region.trim()) throw new Error('Both a key and a region are needed.');
      azure = new AzureSpeechProvider({ key, region });
      golisten.registerProvider(azure);
      if (remember) rememberAzure({ key: key.trim(), region: region.trim() });
      else forgetAzure();
    },
    forgetAzure() {
      forgetAzure();
      golisten.unregisterProvider(AZURE_PROVIDER_ID);
      azure = undefined;
    },
  };

  const services: AppServices = {
    store, bus, adapters, golearn, golisten, gotell,
    ingest: createIngestApi(store, adapters, clock, lexicon),
    catalog, lexicon,
    backup: createBackupApi(store),
    speech,
    startup,
  };
  // Jobs queued earlier (a saved testimony version only queues its audio) or left retryable are picked up now,
  // in the background, when a usable provider exists. Never blocks startup; never runs without a provider.
  void proxyCheck.then(() => resumeQueuedAudio(store, golisten));
  return { services, user, course };
}

/** Run queued / retryable audio jobs once, if there are any and a usable provider is available. Never throws. */
export async function resumeQueuedAudio(store: AppStore, golisten: Pick<GoListen, 'availability' | 'runJobs'>): Promise<number> {
  try {
    const pending = (await store.audioJobs.all()).some((j) => j.status === 'queued' || j.status === 'failed');
    if (!pending) return 0;
    if (!(await golisten.availability()).available) return 0;
    return await golisten.runJobs();
  } catch {
    return 0;
  }
}

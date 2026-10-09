/**
 * Bootstrap: store → bus → adapters → engines → bundled content → policy migration.
 *
 * A page opened with `?sandbox=<name>` opens database `go-v0-sandbox-<name>` and namespaces every localStorage key (ui/sandbox.ts).
 *
 * Order matters:
 *   1. seed languages / courses (and the first learner once a team has been chosen);
 *   2. GoListen is created WITHOUT the fixture unless preview mode or the development preference is on; a remembered
 *      Azure key (only ever stored when the learner ticked "remember on this device", and only read when the learner has
 *      also switched on the direct-key option in Settings, which is off by default) is turned into a provider;
 *      the app's own speech service (`ProxySpeechProvider`, same-origin /api/speech/*, key held server-side from
 *      AZURE_SPEECH_KEY / AZURE_SPEECH_REGION), only when a proxy is configured (`speechProxy` option or the build flag
 *      VITE_SPEECH_PROXY=1; otherwise no request is made), is asked for its status in the background and registered when it reports
 *      available, or reports missing credentials (it exists but has no key: GoListen then says so and audio stays honestly
 *      unavailable; Settings → Speech shows its instruction and a "Check again" button). Not reachable / no proxy on this
 *      host: not registered. No key is ever stored or bundled for that path;
 *   3. GoLearn (+ `audioEligible`: reviewed real speech exists for a text) and GoTell;
 *   4. the built-in texts of the ACTIVE course's language go through the importer (validated as one batch, atomic,
 *      repeatable; skipped when that language's bundle and analyzer are unchanged since its last successful import).
 *      Another language's texts are imported when its course becomes active (`content.ensureCourse`): a learner never
 *      waits at startup for texts of a language he is not learning;
 *   5. `golearn.ensureCurrent(userId)`: state derived under an older evidence policy is rebuilt from the event log
 *      before anything is shown (nothing is deleted from the log).
 *
 * The UI never imports the engines' extras directly: the importer, backup and speech-provider controls reach it as
 * small interfaces in `AppServices` (ingest / backup / speech), bound to the real modules here.
 */
import { COURSES, FEATURES, LANGUAGE_ROWS, StoreEventBus, courseLangs, hash, ids } from '../core';
import type { AppStore, Course, EventBus, Features, GoListen, LanguageCode, Library, LexiconSource, ProviderAvailability, TtsProvider, User } from '../core';
import { createCourseCatalog } from '../course';
import { createDexieStore } from '../db/dexie';
import { createFetchLexiconSource } from '../dict';
import { createLibrary } from '../library';
import { createAdapterRegistry } from '../adapters';
import { exportLearner, restoreLearner, validateBackup } from '../backup';
import type { BackupFile } from '../backup';
import { createGoLearn } from '../golearn';
import { setLadderPathSource, setWholeLibrarySource } from '../golearn/recommend';
import { setCorpusFrequencySource } from '../golearn/rank';
import { ladderUnitDocuments } from '../ladder/bundle';
import { createLadderPath } from '../ladder/path';
import { AZURE_PROVIDER_ID, AzureSpeechProvider, ProxySpeechProvider, createGoListen } from '../golisten';
import { createGoTell } from '../gotell';
import { createStage0 } from '../stage0';
import { INGEST_TOOL, contentHistory, epubToDocuments, importDocuments, loadBundledCorpus, previewDocuments } from '../ingest';
import type { ImportOptions } from '../ingest';
import type { DocumentReport } from '../ingest';
import { plainTextToDocuments } from '../ingest/plaintext';
import type { AppServices, BackupApi, ImportDocView, IngestApi, SpeechApi, StartupInfo } from '../ui/context';
import { resolveDbName, sandboxProblem } from '../ui/sandbox';
import {
  DEFAULT_USER_ID, forgetAzure, getPref, recallActiveUser, recallAzure, recallChosenCourse, rememberAzure, rememberChosenCourse, subscribePrefs,
} from '../ui/prefs';

export interface BootstrapOptions {
  /**
   * Which optional parts of the app are on (default: `FEATURES`). With `listen: false` (V1) the app registers no speech provider,
   * makes no speech request, reads no remembered Azure key, resumes no queued audio, gives GoTell no GoListen (a saved
   * testimony version queues no audio job) and tells GoLearn `listening: false`. GoListen still exists as an inert object.
   */
  features?: Partial<Features>;
  /** Default: Dexie (IndexedDB). Tests pass createMemoryStore(). */
  store?: AppStore;
  /** Database name (default `go-v0`). A page opened with `?sandbox=<name>` always uses `go-v0-sandbox-<name>` instead (see ui/sandbox.ts). */
  dbName?: string;
  /** Skip importing the bundled corpus (tests). */
  skipCorpus?: boolean;
  /**
   * Which languages' built-in texts are imported at startup. 'active' (default): the active course's language only
   * (nothing before a team is chosen); the others follow when their course becomes active. 'all': every language now.
   */
  bundleLanguages?: 'active' | 'all';
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
   * The app's own speech service. Default: NOT configured, so no request is made (a static deployment has no proxy; asking
   * it only produces a 404). Pass an object (or build with VITE_SPEECH_PROXY=1) to check a `ProxySpeechProvider` on the same
   * origin. `false` skips the check even when the build flag is set. `provider` substitutes the provider (tests);
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

/** Prefix of the meta rows that record the last successful import of the built-in texts, one row per language. */
export const BUNDLE_META_ID = 'bundled-corpus';
/** meta row of one language's built-in texts: importer version + content fingerprint + that language's analyzer version. */
export const bundleMetaId = (lang: LanguageCode): string => `${BUNDLE_META_ID}:${lang}`;
/** meta row of one language's reading-ladder unit documents (data/ladder/<lang>/units/): signature of the units + analyzer version. */
export const ladderMetaId = (lang: LanguageCode): string => `bundled-ladder:${lang}`;

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
    ...(d.teamText ? { teamText: true } : {}),
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
    convertEpub: (bytes, opts) => epubToDocuments(bytes, opts),
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
        ...(r.teamText ? { teamText: true } : {}),
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
  const features: Features = { ...FEATURES, ...opts.features };
  const listen = features.listen;

  await seedFirstRun(store, clock(), opts.courseId);

  // ── GoListen: no fixture unless preview mode or the development preference is on ──
  const wantsFixture = () => opts.allowFixture ?? (getPref('preview') || getPref('devFixtureAudio'));
  const providers: TtsProvider[] = listen ? [...(opts.providers ?? [])] : [];
  // A stored Azure key is read, and used from this browser, only when listening is on AND the learner has switched on the
  // direct-key option in Settings (off by default). Otherwise it is not even read, and no Azure request is ever made.
  const remembered = listen && getPref('azureDirectKey') ? recallAzure() : undefined;
  let azure: AzureSpeechProvider | undefined;
  if (remembered) { azure = new AzureSpeechProvider({ key: remembered.key, region: remembered.region }); providers.push(azure); }
  // Listening off: the object exists (other code holds a reference) but has no provider and never the fixture, so it is simply unavailable.
  const golisten = createGoListen({ store, bus, adapters, clock, providers, allowFixture: listen ? wantsFixture() : false });
  // Preview mode and the development preference flip the fixture switch at runtime; a real provider is unaffected.
  if (listen && opts.allowFixture === undefined) subscribePrefs(() => golisten.setAllowFixture(wantsFixture()));

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
  // Only when a proxy is configured: an explicit `speechProxy` option, or the build-time flag VITE_SPEECH_PROXY=1 (a deployment
  // that serves /api/speech/*). By default the app makes no speech request at all (a static deployment has no proxy to ask).
  const proxyConfigured = opts.speechProxy !== undefined || import.meta.env?.VITE_SPEECH_PROXY === '1';
  if (listen && opts.speechProxy !== false && proxyConfigured) {
    const cfg = opts.speechProxy ?? {};
    proxy = cfg.provider ?? new ProxySpeechProvider({
      ...(cfg.baseUrl !== undefined ? { baseUrl: cfg.baseUrl } : {}),
      ...(cfg.fetch !== undefined ? { fetch: cfg.fetch } : {}),
    });
    proxyCheck = checkProxy();
  }

  // ── GoLearn (listening is recommended only where reviewed real speech exists) and GoTell ──
  // `listening` is GoLearn's own option (package E); typed as an intersection so this compiles before and after it exists.
  const learnDeps: Parameters<typeof createGoLearn>[0] & { listening?: boolean } = {
    store, bus, adapters, clock,
    listening: listen,
    audioEligible: async (textId) => {
      if (!listen) return false;
      try { return (await golisten.audioStatus(textId)).evidenceEligible; } catch { return false; }
    },
  };
  // GoListen is GoLearn's listening subsystem: reached as `golearn.listening` (the same object as the deprecated `golisten` alias in the
  // services below). Nothing about it moves: it still exists as an inert object with listening off, and its events fold into GoLearn's
  // own listening modality exactly as before.
  const golearn = Object.assign(createGoLearn(learnDeps), { listening: golisten });
  golearn.attach();
  // What counts as listening can change when a recording is imported, rights are revoked or a voice review changes: GoLearn's
  // listening-derived state is then rebuilt from the event log (never inside a GoLearn fold: this runs after the change).
  if (listen) golisten.onEligibilityChange((textId) => golearn.invalidateListening(textId));
  // No GoListen for GoTell while listening is off: a saved testimony version then queues no audio job.
  const gotell = createGoTell({ store, bus, adapters, golearn, ...(listen ? { golisten } : {}), clock });
  // Stage 0: scenes are imported on demand (when the Stage 0 page first opens for a language), never at startup.
  const stage0 = createStage0({ store, bus, adapters, clock, golearn });
  // The ladder is the default route: "Next on your path" in GoLearn's recommendations reads it from here (src/ladder/path.ts).
  setLadderPathSource(createLadderPath({ store, golearn, stage0 }).source());

  // ── the reading ladder and the dictionaries ──
  // One lazy source per language: createFetchLexiconSource makes no request until it is first asked something.
  const catalog = createCourseCatalog({ store, golearn });
  const sources = new Map<LanguageCode, LexiconSource>();
  // The built site may live under a sub-path (GitHub Pages: /go-v0/): the dictionary and library shards sit beside index.html, so
  // their base follows Vite's base ('./' in production → relative; '/' in tests → the old absolute paths).
  const assetBase = ((import.meta.env?.BASE_URL as string | undefined) ?? '/').replace(/\/+$/, '');
  const lexicon: AppServices['lexicon'] = (lang) => {
    let s = sources.get(lang);
    if (!s) { s = createFetchLexiconSource(lang, { baseUrl: `${assetBase}/dict` }); sources.set(lang, s); }
    return s;
  };

  // The library (index, profiles, open-on-demand). Built inside a guard: if it cannot be, the app starts with an empty one.
  let library: Library;
  try { library = createLibrary({ store, adapters, clock, lexicon, baseUrl: `${assetBase}/library` }); } catch {
    library = emptyLibrary(); // the catalogue pages then say there is nothing in the library yet
  }
  // GoLearn recommends from the WHOLE library (src/golearn/candidates.ts), not only from texts already on this device: its
  // shortlist pages through the catalogue and profiles the few it ranks. Registered once, like the ladder's path source.
  setWholeLibrarySource({ pager: (q) => library.search(q), profileOf: (id) => library.profile(id) });
  // usefulUnknown reads the language's corpus frequency (the dictionary's frequency.json, R9) through its lexicon source; loaded once per
  // language by that source and cached by it. No sidecar (or no dictionary): undefined, and the ranking keeps the in-shortlist rule.
  setCorpusFrequencySource((lang) => lexicon(lang as LanguageCode)?.frequencyTable?.());

  // ── built-in texts through the importer, one language at a time ──
  let bundle: ReturnType<typeof loadBundledCorpus> | undefined;
  const inFlight = new Map<LanguageCode, Promise<ImportDocView[] | undefined>>();
  /**
   * Import one language's built-in texts unless they are there and unchanged. The analyzer is part of the signature: a
   * text is analysed when it is imported, so a better adapter reaches the texts already on a device only if the import
   * runs again (it then re-analyses exactly the texts whose analyzer changed) — for a language that is not active now,
   * when its course next becomes active. Returns the report, or undefined when nothing had to be done.
   */
  const ensureBundle = (lang: LanguageCode): Promise<ImportDocView[] | undefined> => {
    if (opts.skipCorpus) return Promise.resolve(undefined);
    const running = inFlight.get(lang);
    if (running) return running;
    const run = (async () => {
      const docs = (bundle ??= loadBundledCorpus()).filter((d) => d.lang === lang);
      const reports: ImportDocView[] = [];
      if (docs.length > 0) {
        const signature = `${INGEST_TOOL}|${docs.length}|${hash(JSON.stringify(docs))}|${lang}@${adapters.get(lang).version}`;
        const last = await store.meta.get(bundleMetaId(lang));
        const haveTexts = (await store.texts.where('lang', lang)).length > 0;
        if (!(last?.value === signature && haveTexts)) {
          const report = await importDocuments(store, adapters, docs, { clock });
          if (report.ok) await store.meta.put({ id: bundleMetaId(lang), value: signature, updatedAt: clock() });
          else startup.warnings = [...(startup.warnings ?? []), `${report.documents.filter((d) => d.action === 'rejected').length} built-in text(s) were rejected by the importer, so none were imported. See Settings → Content.`];
          reports.push(...report.documents.map((d, i) => toView(d, titleOf(docs[i]))));
        }
      }
      // The ladder's own unit documents (data/ladder/<lang>/units/; units that point at a corpus document in place are already in `docs`).
      // Their own batch and signature: a draft unit that fails the importer must never take the language's corpus down with it, and a
      // unit that changes changes this signature. If the batch is rejected, each unit is tried alone, so one bad draft hides only itself.
      const units = ladderUnitDocuments(lang, undefined, docs);
      if (units.length > 0) {
        const signature = `${INGEST_TOOL}|${units.length}|${hash(JSON.stringify(units))}|${lang}@${adapters.get(lang).version}`;
        const last = await store.meta.get(ladderMetaId(lang));
        const haveUnits = (await store.texts.get(ids.text(lang, units[0]!.id))) !== undefined;
        if (!(last?.value === signature && haveUnits)) {
          let views: ImportDocView[];
          const batch = await importDocuments(store, adapters, units, { clock });
          if (batch.ok) views = batch.documents.map((d, i) => toView(d, titleOf(units[i])));
          else {
            views = [];
            for (const u of units) views.push(...(await importDocuments(store, adapters, [u], { clock })).documents.map((d) => toView(d, titleOf(u))));
            const bad = views.filter((v) => v.action === 'rejected').length;
            startup.warnings = [...(startup.warnings ?? []), `${bad} unit(s) of the reading ladder were rejected by the importer and are not available yet. See Settings → Content.`];
          }
          await store.meta.put({ id: ladderMetaId(lang), value: signature, updatedAt: clock() });
          reports.push(...views);
        }
      }
      return reports.length > 0 ? reports : undefined;
    })().finally(() => { inFlight.delete(lang); });
    inFlight.set(lang, run);
    return run;
  };
  const indexLibrary = async (course: Course): Promise<void> => {
    // the course's own language and the companion languages it reads (Course.readsLangs)
    try { if ((await catalog.streams(course.id)).length > 0) for (const l of courseLangs(course)) await library.indexStore(l); } catch { /* the catalogue pages say what is missing */ }
  };
  /**
   * Everything a course needs before its Home is shown: its language's built-in texts, the learner models rebuilt if a
   * text was re-analysed or revised, its reading ladder, and (awaited here, unlike at startup) the library index.
   */
  const ensureCourse = async (courseId: string): Promise<void> => {
    const course = (await store.courses.get(courseId)) ?? COURSES.find((c) => c.id === courseId);
    if (!course) return;
    const report: ImportDocView[] = [];
    for (const l of courseLangs(course)) report.push(...((await ensureBundle(l)) ?? []));
    if (report.some((d) => d.action === 'updated')) for (const u of await store.users.all()) await golearn.rebuild(u.id);
    try { await catalog.install(course.id); } catch { /* the ladder pages say what is missing */ }
    await indexLibrary(course);
  };

  // ── which learner ──
  const users = await store.users.all();
  const wanted = opts.userId ?? recallActiveUser();
  const user = users.find((u) => u.id === wanted) ?? users.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null;
  const course = user ? (await store.courses.get(user.courseId)) ?? COURSES[0] : null;
  // A restored learner row may exist without the device-local team choice (it is not part of a backup): adopt it.
  if (user && !recallChosenCourse()) rememberChosenCourse(user.courseId);

  // ── the built-in texts: the active course's language (or every language when asked) ──
  const languages: LanguageCode[] = opts.bundleLanguages === 'all' ? adapters.all().map((a) => a.lang) : course ? courseLangs(course) : [];
  for (const lang of languages) {
    const report = await ensureBundle(lang);
    if (report) startup.bundledReport = [...(startup.bundledReport ?? []), ...report];
  }

  // ── bring the learner's derived state up to the current evidence policy ──
  if (user) startup.policyRebuilt = await golearn.ensureCurrent(user.id);
  // A built-in text that was re-analysed or revised changes what the words a learner has already met are counted as
  // ("no sé" was a form of ser, and is now saber): every learner's derived state is rebuilt from the event log, which
  // is itself never changed.
  if ((startup.bundledReport ?? []).some((d) => d.action === 'updated')) {
    for (const u of users) if (!(u.id === user?.id && startup.policyRebuilt)) await golearn.rebuild(u.id);
    startup.modelRebuilt = true;
  }
  // The ladder of the active course goes into the store (a no-op for a course without one). A failure never stops the app.
  if (course) {
    try { await catalog.install(course.id); } catch (e) {
      startup.warnings = [...(startup.warnings ?? []), `The reading ladder could not be set up: ${e instanceof Error ? e.message : String(e)}`];
    }
  }

  // ── speech-provider controls for Settings → Speech ──
  const inertSpeech: SpeechApi = {
    azure: () => ({ configured: false, remembered: false }),
    proxy: async () => undefined,
    recheck: async () => undefined,
    configureAzure: async () => undefined,
    forgetAzure: () => undefined,
  };
  const speech: SpeechApi = !listen ? inertSpeech : {
    azure: () => ({ configured: !!azure, remembered: !!recallAzure(), region: azure?.region ?? recallAzure()?.region }),
    // The direct-key option is off until the learner switches it on in Settings; turning it off forgets any stored key.
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
      if (!getPref('azureDirectKey')) throw new Error('Direct Azure keys are switched off. Turn on "Use my own Azure key in this browser" in Settings first.');
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
    store, bus, adapters, golearn, gotell, stage0,
    golisten, // deprecated alias of golearn.listening, kept for existing callers
    ingest: createIngestApi(store, adapters, clock, lexicon),
    catalog, lexicon, library,
    content: { ensureCourse },
    backup: createBackupApi(store),
    speech,
    features,
    startup,
  };
  // Jobs queued earlier (a saved testimony version only queues its audio) or left retryable are picked up now,
  // in the background, when a usable provider exists. Never blocks startup; never runs without a provider.
  if (listen) void proxyCheck.then(() => resumeQueuedAudio(store, golisten));
  // The texts already in the store (bundled, personal) become searchable and scorable in the background: never before first paint.
  if (course) void indexLibrary(course);
  return { services, user, course };
}

/** A library with nothing in it: what the app runs with when the real one cannot be built (the catalogue pages then say there is nothing yet). */
export function emptyLibrary(): Library {
  return {
    info: async () => undefined,
    search: async () => ({ total: 0, items: [] }),
    entry: async () => undefined,
    profile: async () => undefined,
    open: async (textId) => { throw new Error(`The library has no text ${textId}.`); },
    indexStore: async () => 0,
  };
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

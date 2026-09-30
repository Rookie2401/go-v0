/**
 * Bootstrap: store → bus → adapters → engines → first-run seeding.
 *
 * Sibling packages are imported STATICALLY against the signatures stated in docs/PLAN.md:
 *   createAdapterRegistry(): AdapterRegistry                              from 'src/adapters'  (A)
 *   createGoLearn({ store, bus, adapters }): GoLearn  (+ .attach())        from 'src/golearn'   (B)
 *   createGoListen({ store, bus, adapters }): GoListen, FixtureTtsProvider from 'src/golisten'  (C)
 *   createGoTell({ store, bus, adapters, golearn, golisten }): GoTell      from 'src/gotell'    (D)
 *   ingestAll(store, registry, docs), loadBundledCorpus(): CorpusDocument[] from 'src/ingest'   (A)
 *
 * TODO(integration): `new FixtureTtsProvider()` is assumed to take no arguments.
 * TODO(contract): AppStore has no `meta` table, so "already ingested" is inferred from the text count
 * (ingestAll is idempotent: re-ingest only bumps contentVersion when sentence text changed).
 */
import { COURSES, LANGUAGE_ROWS, StoreEventBus } from '../core';
import type { AppStore, Course, EventBus, User } from '../core';
import { createDexieStore } from '../db/dexie';
import { createAdapterRegistry } from '../adapters';
import { createGoLearn } from '../golearn';
import { FixtureTtsProvider, createGoListen } from '../golisten';
import { createGoTell } from '../gotell';
import { ingestAll, loadBundledCorpus } from '../ingest';
import type { AppServices } from '../ui/context';
import { DEFAULT_USER_ID, recallActiveUser, recallChosenCourse, rememberChosenCourse } from '../ui/prefs';

export interface BootstrapOptions {
  /** Default: Dexie (IndexedDB). Tests pass createMemoryStore(). */
  store?: AppStore;
  dbName?: string;
  /** Skip ingesting the bundled corpus (tests). */
  skipCorpus?: boolean;
  /** Last active learner id (persisted by the caller). */
  userId?: string;
  /** Learn this course without the onboarding screen (tests, deep links). Otherwise the learner is created once a team has been chosen. */
  courseId?: string;
  clock?: () => string;
}

export interface BootstrapResult {
  services: AppServices;
  /** null on a first run: the UI shows the "Which team are you on?" screen and creates the learner. */
  user: User | null;
  course: Course | null;
}

export { DEFAULT_USER_ID };
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

export async function bootstrap(opts: BootstrapOptions = {}): Promise<BootstrapResult> {
  const clock = opts.clock ?? (() => new Date().toISOString());
  const store = opts.store ?? createDexieStore(opts.dbName);
  const bus: EventBus = new StoreEventBus(store, clock);
  const adapters = createAdapterRegistry();

  await seedFirstRun(store, clock(), opts.courseId);

  const golearn = createGoLearn({ store, bus, adapters, clock });
  golearn.attach();
  const golisten = createGoListen({ store, bus, adapters, clock });
  golisten.registerProvider(new FixtureTtsProvider());
  const gotell = createGoTell({ store, bus, adapters, golearn, golisten, clock });

  if (!opts.skipCorpus) {
    const docs = loadBundledCorpus();
    if ((await store.texts.count()) < docs.length) await ingestAll(store, adapters, docs);
  }

  const users = await store.users.all();
  const wanted = opts.userId ?? recallActiveUser();
  const user = users.find((u) => u.id === wanted) ?? users.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null;
  const course = user ? (await store.courses.get(user.courseId)) ?? COURSES[0] : null;

  return { services: { store, bus, adapters, golearn, golisten, gotell }, user, course };
}

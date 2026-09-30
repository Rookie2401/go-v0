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
import { recallActiveUser } from '../ui/prefs';

export interface BootstrapOptions {
  /** Default: Dexie (IndexedDB). Tests pass createMemoryStore(). */
  store?: AppStore;
  dbName?: string;
  /** Skip ingesting the bundled corpus (tests). */
  skipCorpus?: boolean;
  /** Last active learner id (persisted by the caller). */
  userId?: string;
  clock?: () => string;
}

export interface BootstrapResult {
  services: AppServices;
  user: User;
  course: Course;
}

export const DEFAULT_USER_ID = 'u-local';
/** Seed languages, courses and a first learner (idempotent). */
export async function seedFirstRun(store: AppStore, now: string): Promise<void> {
  await store.languages.bulkPut(LANGUAGE_ROWS);
  await store.courses.bulkPut(COURSES);
  if ((await store.users.count()) === 0) {
    await store.users.put({ id: DEFAULT_USER_ID, displayName: 'Learner', courseId: COURSES[0].id, createdAt: now });
  }
}

export async function bootstrap(opts: BootstrapOptions = {}): Promise<BootstrapResult> {
  const clock = opts.clock ?? (() => new Date().toISOString());
  const store = opts.store ?? createDexieStore(opts.dbName);
  const bus: EventBus = new StoreEventBus(store, clock);
  const adapters = createAdapterRegistry();

  await seedFirstRun(store, clock());

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
  const user = users.find((u) => u.id === wanted) ?? users.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  const course = (await store.courses.get(user.courseId)) ?? COURSES[0];

  return { services: { store, bus, adapters, golearn, golisten, gotell }, user, course };
}

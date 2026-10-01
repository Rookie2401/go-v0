/**
 * Probe: how does the cost of folding one sentence view grow with the learner's history?
 * A novel is 5–10 thousand reading units; every view folds ~10 word items and ~15 writing-system items, and each
 * item's state is recomputed from its encounters. This measures it on the memory store (whose `where` is a scan, so
 * the absolute figures are pessimistic; the growth is what matters). Run: npx vite-node scripts/probe-scale.mts
 */
import { readFileSync } from 'node:fs';
import { StoreEventBus, createMemoryStore, ids, seedBasics } from '../src/core';
import type { SentenceViewed, Work } from '../src/core';
import { createAdapterRegistry } from '../src/adapters';
import { createGoLearn } from '../src/golearn';
import { importDocuments, plainTextToDocuments } from '../src/ingest';

const U = 'probe';
const store = createMemoryStore();
let t = Date.parse('2026-10-01T08:00:00.000Z');
const now = () => new Date((t += 1000)).toISOString();
const bus = new StoreEventBus(store, now);
const adapters = createAdapterRegistry();
const golearn = createGoLearn({ store, bus, adapters, clock: now, audioEligible: async () => false });
golearn.attach();
await seedBasics(store, U, 'thailand-th');

const work: Work = {
  id: ids.work('thailand-th', 'probe'), courseId: 'thailand-th', lang: 'th', stageId: ids.stage('thailand-th', 'g1'), role: 'subsidiary', order: 1,
  title: 'Probe (synthetic)', purpose: [], bibliographyVerified: false,
  rights: { copyrightStatus: 'unknown', permission: 'unknown', canBundle: false, userImportOnly: true, audiobook: 'none', verified: false },
};
const book = readFileSync(new URL('../test/integration/fixtures/thai-synthetic-book.txt', import.meta.url), 'utf8');
const { documents } = plainTextToDocuments(book, { lang: 'th', work });
await importDocuments(store, adapters, documents, { clock: now });
const sentences = (await store.sentences.all()).sort((a, b) => (a.id < b.id ? -1 : 1));

const PASSES = Number(process.argv[2] ?? 120); // each pass = a new sitting over the same 10 sentences
const marks: Array<[number, number]> = [];
for (let pass = 0; pass < PASSES; pass++) {
  t += 3 * 3600_000; // a new sitting
  const started = performance.now();
  for (const s of sentences) {
    const toks = (await store.tokens.where('sentenceId', s.id)).sort((a, b) => a.index - b.index);
    await bus.emit<SentenceViewed>({
      type: 'SentenceViewed', userId: U, lang: 'th', surface: 'corpus', session: `p${pass}`, dedupeKey: `view:${U}:p${pass}:${s.id}`,
      textId: s.textId, sentenceId: s.id, tokenIds: toks.map((x) => x.id), dwellMs: 2000, contentVersion: 1,
    });
  }
  await golearn.settled();
  const perView = (performance.now() - started) / sentences.length;
  if (pass === 0 || (pass + 1) % 20 === 0) marks.push([(pass + 1) * sentences.length, perView]);
}
const encounters = await store.encounters.count();
console.log(`views folded: ${PASSES * sentences.length}; encounter rows: ${encounters}`);
for (const [views, ms] of marks) console.log(`after ${String(views).padStart(5)} views: ${ms.toFixed(1)} ms per sentence view`);

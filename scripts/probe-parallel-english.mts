/**
 * Probe for the audited familiarity swings on Scripture when "Parallel English" is toggled.
 * Same evidence throughout: story read help-free in two sittings, two of three verses seen, then ONE
 * EnglishRescueRevealed (scope parallel). Coverage is read before, while the fold is still running, after it
 * settled, and after a rebuild from the log.
 */
import type { EnglishRescueRevealed, SentenceViewed } from '../src/core';
import { StoreEventBus, createMemoryStore, ids, seedBasics } from '../src/core';
import { createAdapterRegistry } from '../src/adapters';
import { importDocuments, loadBundledCorpus } from '../src/ingest';
import { createGoLearn } from '../src/golearn';

let t = Date.parse('2026-10-02T08:00:00Z');
const now = () => new Date((t += 1000)).toISOString();
const store = createMemoryStore();
const bus = new StoreEventBus(store, now);
const adapters = createAdapterRegistry();
const golearn = createGoLearn({ store, bus, adapters, clock: now });
await seedBasics(store, 'u1');
golearn.attach();
await importDocuments(store, adapters, loadBundledCorpus().filter((d) => d.lang === 'es'));
const live = async (textId: string) => (await store.sentences.where('textId', textId)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
const view = async (textId: string, sentenceIds: string[], session: string) => {
  for (const sid of sentenceIds) {
    const toks = await store.tokens.where('sentenceId', sid);
    await bus.emit<SentenceViewed>({ type: 'SentenceViewed', userId: 'u1', lang: 'es', surface: 'corpus', session, dedupeKey: `v:${session}:${sid}`, textId, sentenceId: sid, tokenIds: toks.map((x) => x.id) });
  }
};
const story = ids.text('es', 'story-01'), dialogue = ids.text('es', 'dialogue-01'), bible = ids.text('es', 'bible-1john-1');
const S = (await live(story)).map((s) => s.id), D = (await live(dialogue)).map((s) => s.id), B = (await live(bible)).map((s) => s.id);
for (const session of ['s1', 's2', 's3']) { await view(story, S, session); await view(dialogue, D, session); t += 45 * 60_000; }
await view(bible, B.slice(0, 2), 's4');
const cov = async () => { const c = await golearn.coverage('u1', bible); return `shown ${(c.knownLexicalCoverage * 100).toFixed(0)}% · likely familiar ${(c.estimatedFamiliarCoverage * 100).toFixed(0)}% · met ${(c.partialCoverage * 100).toFixed(0)}% · new ${(c.unseenCoverage * 100).toFixed(0)}%`; };
const storyEncounters = async () => JSON.stringify((await store.encounters.where('textId', story)).map((e) => [e.id, e.evidenceKind, e.assistance]).sort());

console.log('A  before English          :', await cov());
const storyBefore = await storyEncounters();
// The UI does not await the emit; it re-reads coverage on a timer.
const pending = bus.emit<EnglishRescueRevealed>({ type: 'EnglishRescueRevealed', userId: 'u1', lang: 'es', surface: 'scripture', session: 's4', dedupeKey: 'rescue:parallel', textId: bible, sentenceIds: B, scope: 'parallel' });
const mid: string[] = [];
for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); mid.push(await cov()); }
console.log('B  while the fold runs     :', [...new Set(mid)].join('\n                             '));
await pending;
console.log('C  after the fold settled  :', await cov());
console.log('   story encounters changed by the English reveal:', storyBefore === (await storyEncounters()) ? 'none' : 'YES');
const bibleEnc = (await store.encounters.where('textId', bible)).filter((e) => e.itemKind === 'form');
console.log('   Scripture encounters now:', JSON.stringify(bibleEnc.reduce((m: Record<string, number>, e) => { const k = `${e.evidenceKind}:${e.assistance}`; m[k] = (m[k] ?? 0) + 1; return m; }, {})));
await golearn.rebuild('u1');
console.log('D  after rebuild from log  :', await cov());
const dios = await golearn.getItemState('u1', ids.form('es', 'dios'));
console.log('   "Dios":', JSON.stringify({ exposures: dios?.reading.exposures, assisted: dios?.reading.assisted, estimatedFamiliar: dios?.reading.estimatedFamiliar, level: dios?.reading.level }));

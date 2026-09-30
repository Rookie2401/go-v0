/** Probe: personalized Scripture readiness on the real Spanish corpus after one reading of the story. */
import { StoreEventBus, createMemoryStore, ids, seedBasics } from '../src/core';
import type { SentenceViewed } from '../src/core';
import { createAdapterRegistry } from '../src/adapters';
import { ingestAll, loadBundledCorpus } from '../src/ingest';
import { createGoLearn } from '../src/golearn';

const lang = (process.argv[2] ?? 'es') as 'es' | 'sq' | 'th' | 'hi' | 'de';
const store = createMemoryStore();
const bus = new StoreEventBus(store);
const adapters = createAdapterRegistry();
const golearn = createGoLearn({ store, bus, adapters });
await seedBasics(store, 'u1');
golearn.attach();
await ingestAll(store, adapters, loadBundledCorpus().filter((d) => d.lang === lang));
const story = ids.text(lang, 'story-01'), bible = ids.text(lang, 'bible-1john-1');
const c0 = await golearn.coverage('u1', bible);
for (const s of (await store.sentences.where('textId', story)).sort((a, b) => a.index - b.index)) {
  const toks = await store.tokens.where('sentenceId', s.id);
  await bus.emit<SentenceViewed>({ type: 'SentenceViewed', userId: 'u1', lang, surface: 'corpus', session: 'p1', dedupeKey: `v:${s.id}`, textId: story, sentenceId: s.id, tokenIds: toks.map((t) => t.id) });
}
const r = await golearn.scriptureReadiness('u1', bible);
const c = r.coverage;
console.log(lang, 'before:', { known: c0.knownLexicalCoverage, partial: c0.partialCoverage, unseen: c0.unseenCoverage });
console.log(lang, 'after :', { known: c.knownLexicalCoverage, partial: c.partialCoverage, unseen: c.unseenCoverage, band: c.band, wordTokens: c.wordTokens, newItems: c.newItems.length });
console.log('familiar:', r.familiarItems.map((f) => f.surface).join(' '));
console.log('prereqs :', r.prerequisites.slice(0, 8).map((p) => `${p.surface}(${p.gain.toFixed(2)})`).join(' '));
console.log('prep    :', r.preparatoryTexts.map((p) => `${p.textId} covers ${p.covers.length} ${p.band}`).join(' | '));

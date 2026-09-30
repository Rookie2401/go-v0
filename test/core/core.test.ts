import { describe, expect, it } from 'vitest';
import { StoreEventBus, buildFixtureText, createMemoryStore, hash, ids, itemKindOf, parseSentenceId, parseTokenId, seedBasics } from '../../src/core';
import type { SentenceViewed } from '../../src/core';

describe('ids', () => {
  it('derive the same lexical id for the same form in two texts', () => {
    expect(ids.form('es', 'pecado')).toBe(ids.form('es', 'pecado'));
    expect(ids.lemma('de', 'anfangen', 'VERB')).toBe('lemma:de:anfangen:VERB');
    expect(ids.phrase('es', ['creer', 'en', '_'])).toBe('phrase:es:creer_en__');
  });
  it('parse token and sentence ids', () => {
    const t = ids.token(ids.sentence(ids.text('th', 'story-01'), 3), 7);
    expect(parseTokenId(t)).toEqual({ textId: 'text:th:story-01', sentenceId: 'text:th:story-01/s3', sentenceIndex: 3, tokenIndex: 7 });
    expect(parseSentenceId('text:hi:x/s0')).toEqual({ textId: 'text:hi:x', sentenceIndex: 0 });
    expect(itemKindOf('phrase:es:a_b')).toBe('phrase');
  });
  it('hash is deterministic over UTF-8', () => {
    expect(hash('พระเจ้า')).toBe(hash('พระเจ้า'));
    expect(hash('पाप')).not.toBe(hash('पापी'));
  });
});

describe('StoreEventBus', () => {
  it('appends, dedupes by dedupeKey and notifies subscribers in order', async () => {
    const store = createMemoryStore();
    const bus = new StoreEventBus(store, () => '2026-02-01T00:00:00.000Z');
    const seen: string[] = [];
    bus.subscribe(async (e) => { seen.push(e.type); }, { types: ['SentenceViewed'] });
    const input = { type: 'SentenceViewed', userId: 'u1', lang: 'es', surface: 'corpus', session: 's1', dedupeKey: 'view:u1:s1:x', textId: 'text:es:x', sentenceId: 'text:es:x/s0', tokenIds: [] } as const;
    const first = await bus.emit<SentenceViewed>({ ...input });
    const second = await bus.emit<SentenceViewed>({ ...input });
    expect(first?.at).toBe('2026-02-01T00:00:00.000Z');
    expect(second).toBeNull();
    expect(seen).toEqual(['SentenceViewed']);
    expect(await store.events.count()).toBe(1);
    // A fresh bus over the same store still dedupes (log is the source of truth).
    const bus2 = new StoreEventBus(store);
    expect(await bus2.emit<SentenceViewed>({ ...input })).toBeNull();
    expect((await bus2.history({ userId: 'u1' })).length).toBe(1);
  });
});

describe('fixture builder', () => {
  it('builds a Thai text from explicit segmented tokens with exact offsets and no whitespace', async () => {
    const store = createMemoryStore();
    await seedBasics(store);
    const text = await buildFixtureText(store, {
      lang: 'th', slug: 'fx',
      sentences: [{ tokens: [{ surface: 'พระเจ้า', lemma: 'พระเจ้า', pos: 'NOUN', gloss: 'God' }, { surface: 'ทรง' }, { surface: 'รัก', lemma: 'รัก', pos: 'VERB', gloss: 'love' }, { surface: 'โลก', lemma: 'โลก', pos: 'NOUN', gloss: 'world' }], english: 'God loves the world' }],
    });
    const s = (await store.sentences.where('textId', text.id))[0];
    expect(s.text).toBe('พระเจ้าทรงรักโลก');
    const toks = (await store.tokens.where('sentenceId', s.id)).sort((a, b) => a.index - b.index);
    expect(toks.map((t) => t.surface)).toEqual(['พระเจ้า', 'ทรง', 'รัก', 'โลก']);
    for (const t of toks) expect(s.text.slice(t.start, t.end)).toBe(t.surface);
    expect(toks[0].formId).toBe(ids.form('th', 'พระเจ้า'));
    expect(await store.rescues.get(ids.rescue(s.id))).toMatchObject({ english: 'God loves the world' });
    expect((await store.analyses.where('tokenId', toks[2].id))[0]).toMatchObject({ lemmaId: ids.lemma('th', 'รัก', 'VERB'), provenance: 'lexicon' });
  });
});

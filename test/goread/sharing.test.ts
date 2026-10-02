import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../src/core';
import type { ContentSource, Text } from '../../src/core';
import { PERSONAL_COPY_REASON, shareable, shareableText } from '../../src/goread/sharing';

const source = (rights: ContentSource['rights'], id = `src:${rights}`): ContentSource => ({
  id, title: 'T', attribution: 'a', provenance: 'p', rights, authorship: 'human',
});

describe('shareable', () => {
  it('owner-authored is shareable', () => {
    expect(shareable(source('owner-authored'))).toEqual({ ok: true });
  });

  it('public-domain / licensed need a verification record', () => {
    for (const rights of ['public-domain', 'licensed'] as const) {
      const without = shareable(source(rights));
      expect(without.ok).toBe(false);
      expect(shareable({ rights, verification: { by: 'Ana Ruiz', against: 'the 1909 edition' } })).toEqual({ ok: true });
      expect(shareable({ rights, verification: {} }).ok).toBe(false);
      expect(shareable({ rights, verification: null }).ok).toBe(false);
    }
  });

  it('a personal copy is refused with the contract sentence, exactly', () => {
    const r = shareable(source('personal-copy'));
    expect(r).toEqual({
      ok: false,
      reason: 'Your own copy of a published book stays on your device — it is yours to read, not to redistribute. Texts your team wrote can be shared.',
    });
    expect(PERSONAL_COPY_REASON).toBe(r.ok ? '' : r.reason);
    // a verification record does not change that
    expect(shareable({ rights: 'personal-copy', verification: { by: 'x' } }).ok).toBe(false);
  });

  it('user-private, generated and unverified are refused, each with its own reason', () => {
    const reasons = (['user-private', 'generated', 'unverified'] as const).map((r) => {
      const v = shareable(source(r));
      expect(v.ok).toBe(false);
      return v.ok ? '' : v.reason;
    });
    expect(new Set(reasons).size).toBe(3);
  });

  it('generated text is refused whatever the rights say', () => {
    const reason = 'Machine-generated text is not shared with the team. Texts your team wrote can be shared.';
    expect(shareable({ rights: 'owner-authored', generated: true })).toEqual({ ok: false, reason });
    expect(shareable({ rights: 'public-domain', verification: { by: 'Ana' }, generated: true })).toEqual({ ok: false, reason });
    expect(shareable({ rights: 'generated' })).toEqual({ ok: false, reason });
    expect(shareable({ rights: 'owner-authored', generated: false })).toEqual({ ok: true });
  });

  it('an unknown rights value is refused', () => {
    expect(shareable({ rights: 'whatever' }).ok).toBe(false);
  });
});

describe('shareableText', () => {
  const text = (sourceId: string, extra: Partial<Text> = {}): Text => ({ id: `text:es:${sourceId}`, sourceId, ...extra } as Text);

  it('looks the source up by text.sourceId', async () => {
    const store = createMemoryStore();
    await store.sources.bulkPut([source('owner-authored', 's1'), source('personal-copy', 's2'), source('public-domain', 's3')]);
    expect(await shareableText(store, text('s1'))).toEqual({ ok: true });
    expect(await shareableText(store, text('s2'))).toEqual({ ok: false, reason: PERSONAL_COPY_REASON });
    expect((await shareableText(store, text('s3'))).ok).toBe(false);
  });

  it('a text-level verification record (Scripture) counts for a public-domain source', async () => {
    const store = createMemoryStore();
    await store.sources.put(source('public-domain', 's3'));
    const scripture = { book: 'JHN', chapter: 1, verification: { against: 'eBible.org spaRV1909', checkedAt: '2026-01-01', method: 'byte-comparison' as const, by: 'verify-scripture.mjs' } };
    expect(await shareableText(store, text('s3', { scripture }))).toEqual({ ok: true });
  });

  it('a generated text is refused even from an owner-authored source', async () => {
    const store = createMemoryStore();
    await store.sources.put(source('owner-authored', 's1'));
    const r = await shareableText(store, text('s1', { generated: true }));
    expect(r).toEqual({ ok: false, reason: 'Machine-generated text is not shared with the team. Texts your team wrote can be shared.' });
    expect(await shareableText(store, text('s1', { generated: false }))).toEqual({ ok: true });
  });

  it('a text whose source is missing is refused', async () => {
    const r = await shareableText(createMemoryStore(), text('nowhere'));
    expect(r.ok).toBe(false);
  });
});

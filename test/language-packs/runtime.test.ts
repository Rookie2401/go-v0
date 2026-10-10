import { describe, expect, it } from 'vitest';
import {
  PACKS, albanianManifest, createPackRuntime, installPack, installedKey, plannedManifest, verifyInstalled,
} from '../../packages/language-packs/src';
import type { InstallProgress, PackManifest } from '../../packages/language-packs/src';
import { BASE, diskFetch, memoryStorage } from './helpers';

const sq = (): PackManifest => albanianManifest();
const failing404 = (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
const offline = (async () => { throw new TypeError('network down'); }) as unknown as typeof fetch;

describe('createPackRuntime (Albanian)', () => {
  it('gives the real analyser for sq', () => {
    const rt = createPackRuntime(sq(), { fetch: diskFetch(), baseUrl: BASE });
    const a = rt.analyzer();
    expect(a.kind).toBe('adapter');
    expect(a.id).toBe(sq().analyzer.id);
    const toks = a.tokenize('Fëmijët lexojnë librin.');
    expect(a.analyze(toks).filter((t) => t.token.isWord)).toHaveLength(3);
    expect(a.segmentSentences('Ana lexon. Luan pi çaj.')).toHaveLength(2);
  });

  it('glosses libër as a book, with the CC BY-SA attribution and a frequency rank', async () => {
    const f = diskFetch();
    const rt = createPackRuntime(sq(), { fetch: f, baseUrl: BASE });
    const g = await rt.gloss('libër', 'NOUN');
    expect(g).toBeDefined();
    expect(g!.senses.some((s) => /book/i.test(s.gloss))).toBe(true);
    expect(g!.senses[0].pos).toBe('NOUN');
    expect(g!.attribution).toBe('Wiktionary, via kaikki.org — CC BY-SA 4.0');
    expect(g!.frequencyRank === undefined || g!.frequencyRank >= 1).toBe(true);
    // lazy: the manifest and some shards, never the whole dictionary
    expect(f.calls.some((u) => u === `${BASE}dict/sq/manifest.json`)).toBe(true);
    expect(f.calls.filter((u) => /\/s-[0-9a-f]+\.json$/.test(u)).length).toBeLessThan(10);
  });

  it('glosses an inflected-looking lemma only through its headword, and honours a pos preference', async () => {
    const rt = createPackRuntime(sq(), { fetch: diskFetch(), baseUrl: BASE });
    const g = await rt.gloss('shkollë');
    expect(g?.senses.some((s) => /school/i.test(s.gloss))).toBe(true);
    const adj = await rt.gloss('i mirë', 'ADJ');
    expect(adj?.senses.length ?? 0).toBeGreaterThan(0);
  });

  it('returns undefined for a nonsense word, an empty lemma, and never throws', async () => {
    const rt = createPackRuntime(sq(), { fetch: diskFetch(), baseUrl: BASE });
    await expect(rt.gloss('xyzqwkplm')).resolves.toBeUndefined();
    await expect(rt.gloss('')).resolves.toBeUndefined();
  });

  it('returns undefined when the dictionary is not there or the network is down', async () => {
    await expect(createPackRuntime(sq(), { fetch: failing404, baseUrl: BASE }).gloss('libër')).resolves.toBeUndefined();
    await expect(createPackRuntime(sq(), { fetch: offline, baseUrl: BASE }).gloss('libër')).resolves.toBeUndefined();
    await expect(createPackRuntime(sq(), { fetch: diskFetch(), baseUrl: 'https://elsewhere.test/' }).gloss('libër')).resolves.toBeUndefined();
  });

  it('explains grammar features and constructions in plain words', () => {
    const rt = createPackRuntime(sq(), { fetch: diskFetch(), baseUrl: BASE });
    const acc = rt.explainFeature('Case', 'Acc');
    expect(acc).toMatch(/accusative/);
    expect(acc).toMatch(/direct object/);
    expect(rt.explainFeature('Case', 'Nom,Acc')).toMatch(/nominative or accusative/);
    expect(rt.explainFeature('Definite', 'Def')).toMatch(/definite/);
    expect(rt.explainFeature('Nonsense', 'x')).toBeUndefined();
    expect(rt.explainFeature('Case', 'Zzz')).toMatch(/^Case\./);
    expect(rt.explainConstruction('definite-accusative-singular')).toMatch(/-in\/-n ending marks a definite masculine noun as the direct object/);
    expect(rt.explainConstruction('nope')).toBeUndefined();
    for (const c of sq().grammar.constructions) expect(rt.explainConstruction(c.id)).toBeTruthy();
  });

  it('states its limits honestly', () => {
    const notes = createPackRuntime(sq(), { fetch: diskFetch(), baseUrl: BASE }).coverageNotes().join('\n');
    expect(notes).toMatch(/no native speaker has checked/);
    expect(notes).toMatch(/seed-only/);
    expect(notes).toMatch(/Wiktionary, via kaikki\.org — CC BY-SA 4\.0/);
    expect(notes).toMatch(/no recordings/);
    expect(notes).toMatch(/Gheg/);
  });
});

/** A hypothetical planned pack for a language no analyser is bundled for (no pack is planned only any more; the level and the fallback stay). */
const swedishPlanned = (): PackManifest => plannedManifest({
  languageId: 'sv', version: '1', varietyId: 'sv', scriptId: 'Latn', name: 'Swedish', nativeName: 'svenska',
  varieties: [{ varietyId: 'sv', label: 'Swedish', analysed: false }],
  adapterSummary: 'none yet', capabilities: ['tokenization'], features: [], constructions: [], voices: [], segmentation: { method: 'intl', notes: 'Intl.Segmenter' },
});

describe('a pack without an analyser', () => {
  it('falls back to a tokenizer that says it analyses nothing (a planned pack with no analyser bundled)', () => {
    const rt = createPackRuntime(swedishPlanned(), { fetch: diskFetch(), baseUrl: BASE });
    const a = rt.analyzer();
    expect(a.kind).toBe('tokenize-only');
    expect(a.limitation).toMatch(/no lemma, no morphology and no gloss/);
    const toks = a.tokenize('Vos tenés casa.');
    expect(toks.filter((t) => t.isWord).map((t) => t.surface)).toEqual(['Vos', 'tenés', 'casa']);
    expect(a.analyze(toks).every((t) => t.candidates.length === 0)).toBe(true);
    expect(rt.coverageNotes().join('\n')).toMatch(/planned and cannot be installed/);
    expect(rt.coverageNotes().join('\n')).toMatch(/No analyser for this language/);
  });

  it('can still be given an analyser by the caller', async () => {
    const { nbAdapter } = await import('../../src/adapters/nb');
    const rt = createPackRuntime(swedishPlanned(), { fetch: diskFetch(), baseUrl: BASE, adapter: nbAdapter });
    expect(rt.analyzer().kind).toBe('adapter');
  });

  it('Norwegian Bokmål and Nynorsk are bundled: the runtime reads them with their own adapter', () => {
    for (const lang of ['nb', 'nn']) {
      const a = createPackRuntime(PACKS[lang], { fetch: diskFetch(), baseUrl: BASE }).analyzer();
      expect(a.kind, lang).toBe('adapter');
      expect(a.id, lang).toBe(PACKS[lang].analyzer.id);
    }
  });
});

describe('installPack', () => {
  it('refuses a planned pack; German, Hindi, Thai and Norwegian are experimental and installable, see test/reader-languages/experimental-packs.test.ts', async () => {
    const storage = memoryStorage();
    const r = await installPack(swedishPlanned(), { fetch: diskFetch(), baseUrl: BASE, storage });
    expect(r).toMatchObject({ ok: false, reason: 'planned' });
    expect(storage.map.size).toBe(0);
  });

  it('installs a pack that declares no dictionary (Norwegian): nothing is fetched, the dictionary checks are recorded as not declared, every validation case runs', async () => {
    for (const lang of ['nb', 'nn']) {
      const storage = memoryStorage();
      const fetchSpy = diskFetch();
      const progress: string[] = [];
      const r = await installPack(PACKS[lang], { fetch: fetchSpy, baseUrl: BASE, storage, now: () => '2026-10-09T08:00:00.000Z', onProgress: (p) => progress.push(p.step) });
      if (!r.ok) throw new Error(`${lang}: ${r.reason}: ${r.detail}`);
      expect(fetchSpy.calls, lang).toEqual([]);
      expect(r.verified, lang).toMatchObject({ dictionaryManifest: false, sampleShard: false, dictionary: 'none-declared' });
      expect(r.verified.validation, lang).toHaveLength(14);
      expect(r.validationFailures, lang).toBe(0);
      expect(progress, lang).toEqual(['check', 'dictionary-manifest', 'sample-shard', 'validation', 'record']);
      expect(await verifyInstalled(PACKS[lang], storage), lang).toMatchObject({ installed: true, current: true, validationFailures: 0 });
    }
  });

  it('refuses an invalid manifest', async () => {
    const m = sq();
    m.rights.reviewStatus = 'reviewed';
    const r = await installPack(m, { fetch: diskFetch(), baseUrl: BASE, storage: memoryStorage() });
    expect(r).toMatchObject({ ok: false, reason: 'invalid-manifest' });
  });

  it('fails with a reason when the dictionary answers 404, and records nothing', async () => {
    const storage = memoryStorage();
    const r = await installPack(sq(), { fetch: failing404, baseUrl: BASE, storage });
    expect(r).toMatchObject({ ok: false, reason: 'dictionary-unreachable' });
    expect((r as { detail: string }).detail).toMatch(/404/);
    expect(storage.map.size).toBe(0);
  });

  it('fails with a reason when the network is down', async () => {
    const r = await installPack(sq(), { fetch: offline, baseUrl: BASE, storage: memoryStorage() });
    expect(r).toMatchObject({ ok: false, reason: 'dictionary-unreachable' });
    expect((r as { detail: string }).detail).toMatch(/network down/);
  });

  it('fails when the dictionary is for another language, another version, or has no shard', async () => {
    const wrongLang = diskFetch();
    const f1 = (async (u: RequestInfo | URL) => String(u).endsWith('dict/sq/manifest.json') ? new Response((await (await fetch_(`${BASE}dict/de/manifest.json`)).text()), { status: 200 }) : wrongLang(u)) as typeof fetch;
    const fetch_ = diskFetch();
    expect(await installPack(sq(), { fetch: f1, baseUrl: BASE, storage: memoryStorage() })).toMatchObject({ ok: false, reason: 'dictionary-mismatch' });

    const m = sq();
    m.lexical.dictionary!.entries = 5;
    expect(await installPack(m, { fetch: diskFetch(), baseUrl: BASE, storage: memoryStorage() })).toMatchObject({ ok: false, reason: 'dictionary-mismatch' });

    const real = diskFetch();
    const noShard = (async (u: RequestInfo | URL) => /\/s-[0-9a-f]+\.json$/.test(String(u)) ? new Response('gone', { status: 404 }) : real(u)) as typeof fetch;
    expect(await installPack(sq(), { fetch: noShard, baseUrl: BASE, storage: memoryStorage() })).toMatchObject({ ok: false, reason: 'shard-unreachable' });

    const garbage = (async (u: RequestInfo | URL) => String(u).endsWith('manifest.json') ? new Response('<html>', { status: 200 }) : real(u)) as typeof fetch;
    expect(await installPack(sq(), { fetch: garbage, baseUrl: BASE, storage: memoryStorage() })).toMatchObject({ ok: false, reason: 'dictionary-invalid' });
  });

  it('happy path: verifies the dictionary, one shard and every validation case, then records the installation', async () => {
    const storage = memoryStorage();
    const steps: InstallProgress[] = [];
    const f = diskFetch();
    const r = await installPack(sq(), { fetch: f, baseUrl: BASE, storage, onProgress: (p) => steps.push(p), now: () => '2026-10-08T12:00:00.000Z' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.installedAt).toBe('2026-10-08T12:00:00.000Z');
    expect(r.verified.dictionaryManifest).toBe(true);
    expect(r.verified.sampleShard).toBe(true);
    expect(r.verified.validation).toHaveLength(sq().validation.length);
    expect(r.verified.validation.filter((v) => !v.pass)).toEqual([]);
    expect(r.validationFailures).toBe(0);
    // exactly the manifest and one shard were fetched
    expect(f.calls).toHaveLength(2);
    expect(f.calls[0]).toBe(`${BASE}dict/sq/manifest.json`);
    expect(f.calls[1]).toMatch(/dict\/sq\/s-[0-9a-f]+\.json$/);
    expect(steps.map((s) => s.step)).toEqual(['check', 'dictionary-manifest', 'sample-shard', 'validation', 'record']);
    const stored = storage.map.get(installedKey('pack:sq')) as any;
    expect(stored).toMatchObject({ version: sq().version, installedAt: '2026-10-08T12:00:00.000Z' });
    expect(stored.verified.validation).toHaveLength(sq().validation.length);
    expect(installedKey('pack:sq')).toBe('pack:installed:pack:sq');
  });

  it('reports a failing validation case instead of hiding it, and still records what was found', async () => {
    const m = sq();
    m.validation[0] = { ...m.validation[0], expect: { lemma: 'shtëpi' } };
    const storage = memoryStorage();
    const r = await installPack(m, { fetch: diskFetch(), baseUrl: BASE, storage });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.validationFailures).toBe(1);
    const bad = r.verified.validation.find((v) => !v.pass)!;
    expect(bad.id).toBe(m.validation[0].id);
    expect(bad.got).toMatch(/lemma libër/);
    const v = await verifyInstalled(m, storage);
    expect(v).toMatchObject({ installed: true, current: true, validationFailures: 1 });
  });

  it('works with an asynchronous store, and reports a store that fails', async () => {
    const map = new Map<string, unknown>();
    const asyncStore = { get: async (k: string) => map.get(k), set: async (k: string, v: unknown) => { map.set(k, v); } };
    expect((await installPack(sq(), { fetch: diskFetch(), baseUrl: BASE, storage: asyncStore })).ok).toBe(true);
    expect(map.has('pack:installed:pack:sq')).toBe(true);
    const broken = { get: () => undefined, set: () => { throw new Error('quota'); } };
    expect(await installPack(sq(), { fetch: diskFetch(), baseUrl: BASE, storage: broken })).toMatchObject({ ok: false, reason: 'storage-failed', detail: 'quota' });
  });

  it('ignores a progress listener that throws', async () => {
    const r = await installPack(sq(), { fetch: diskFetch(), baseUrl: BASE, storage: memoryStorage(), onProgress: () => { throw new Error('ui'); } });
    expect(r.ok).toBe(true);
  });
});

describe('verifyInstalled', () => {
  it('is false before installation and true, current, after', async () => {
    const storage = memoryStorage();
    expect(await verifyInstalled(sq(), storage)).toMatchObject({ installed: false });
    await installPack(sq(), { fetch: diskFetch(), baseUrl: BASE, storage });
    expect(await verifyInstalled(sq(), storage)).toMatchObject({ installed: true, current: true, validationFailures: 0 });
  });

  it('notices a record made for another version of the pack', async () => {
    const storage = memoryStorage();
    await installPack(sq(), { fetch: diskFetch(), baseUrl: BASE, storage });
    const newer = sq();
    newer.version = '999';
    newer.analyzer = { ...newer.analyzer, version: '999', id: 'adapter-sq@999' };
    expect(await verifyInstalled(newer, storage)).toMatchObject({ installed: true, current: false });
  });

  it('reads a JSON string record, and treats a malformed record or a failing store as not installed', async () => {
    const m = sq();
    const rec = { version: m.version, installedAt: 'x', verified: { dictionaryManifest: true, sampleShard: true, validation: [{ id: 'a', pass: true }] } };
    expect(await verifyInstalled(m, { get: () => JSON.stringify(rec) })).toMatchObject({ installed: true, current: true });
    expect(await verifyInstalled(m, { get: () => ({ version: 3 }) })).toMatchObject({ installed: false });
    expect(await verifyInstalled(m, { get: () => 'not json' })).toMatchObject({ installed: false });
    expect(await verifyInstalled(m, { get: () => { throw new Error('locked'); } })).toMatchObject({ installed: false });
  });
});

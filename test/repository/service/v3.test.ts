// @vitest-environment node
/**
 * The service under contract v3: the source-restriction policy (page-controlled metadata never grants a permission), language-resolution
 * evidence and PackInstalled ingestion, the envelope fields every stored event exposes, clock skew, provenance stamped at a lookup (no learner
 * id), GET /units/:id provenance, POST /units/:id/corrections, the export and `DELETE /me`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../../packages/repository-store/src';
import { MAX_CORRECTIONS, RESTRICTION_FIELDS, UNKNOWN_RESTRICTIONS } from '../../../packages/repository-contract/src';
import type { GoEvent, LanguagePackInfo, LinguisticUnit, SourceRestrictions } from '../../../packages/repository-contract/src';
import { SOURCE_POLICY, parsePolicy, policyFor } from '../../../packages/repository-service/src/sourcePolicy';
import { createInProcessApi } from '../../../packages/repository-service/src/api';
import type { ServiceDeps } from '../../../packages/repository-service/src/deps';
import { createClock, createFakeCrypto, createFakeEngine, createFakeLinguistics, lookupEvent, makeEvent, raw, signUp } from './fakes';
import type { Harness } from './fakes';

/** The service over a REAL memory store (the fake store is a Map without the v3 store methods) and the fake linguistics. */
function realHarness(): Harness & { realStore: ReturnType<typeof createMemoryStore> } {
  const clock = createClock();
  const store = createMemoryStore({ now: clock.now });
  const engine = createFakeEngine(store);
  const linguistics = createFakeLinguistics(store, clock.now);
  const crypto = createFakeCrypto();
  const logs: string[] = [];
  const deps: ServiceDeps = { store, engine, linguistics, crypto, sourcePolicy: policyFor, now: clock.now, log: (l) => logs.push(l) };
  return { deps, store: store as never, realStore: store, engine, linguistics, crypto, clock, logs, api: (token) => createInProcessApi(deps, token) };
}

const FORM = 'form:sq:librin';
const PACK = (over: Partial<LanguagePackInfo> = {}): LanguagePackInfo => ({
  packId: 'fake', languageId: 'sq', version: '1', analyzerId: 'fake', coverage: { notes: [] }, licences: [], reviewStatus: 'machine-drafted', ...over,
});
const ref = (h: Harness, id = FORM) => h.store.getUnits([id]).then((u) => u[0]);

type Who = Awaited<ReturnType<typeof signUp>>;
const lookupOf = (who: Who, surface: string, over: Partial<GoEvent> = {}): GoEvent => lookupEvent(who, {
  producer: { app: 'golearn-ext', version: '1', deviceId: who.deviceId }, subject: { itemIds: [`form:sq:${surface}`], sentenceKey: 'ab12' },
  payload: { surface, tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'demo', helpShown: ['lemma'] }, ...over,
});

describe('health and the envelope', () => {
  it('reports contract version 3', async () => {
    const h = realHarness();
    const r = await h.api().health();
    expect(r.ok && r.data.contractVersion).toBe(3);
  });

  it('every stored event exposes recordedAt, at, id, dedupeKey, producer.deviceId, evidence.quality, processing and provenance', async () => {
    const h = realHarness();
    const who = await signUp(h, 'a@example.test');
    const e = lookupOf(who, 'librin', {
      id: 'env-1', dedupeKey: 'dk-1', evidence: { quality: 'weak', assisted: true, sourceReliability: 0.7 },
      processing: { parserVersion: 'p1', packVersion: '9' }, provenance: { packId: 'pack:sq', analyzerId: 'adapter-sq', confidence: 0.6, status: 'provisional' },
    });
    expect((await who.api.appendEvents([e])).ok).toBe(true);
    const r = await who.api.listEvents();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const got = r.data.events.find((x) => x.id === 'env-1')!;
    expect(got).toMatchObject({
      id: 'env-1', at: e.at, dedupeKey: 'dk-1', producer: { deviceId: who.deviceId }, evidence: { quality: 'weak' },
      processing: { parserVersion: 'p1', packVersion: '9' }, provenance: { packId: 'pack:sq', analyzerId: 'adapter-sq' }, v: 3,
    });
    expect(Date.parse(got.recordedAt)).toBe(Date.parse(h.clock.now())); // server-received, not the device's `at`
    expect(got.recordedAt).not.toBe(got.at);
  });
});

describe('clock skew', () => {
  it('is reported on a sync push as clientTime minus serverTime, and never applied to `at`', async () => {
    const h = realHarness();
    const who = await signUp(h, 'a@example.test');
    const serverNow = Date.parse(h.clock.now());
    const clientTime = new Date(serverNow + 2 * 3600_000).toISOString(); // the device runs two hours fast
    const at = new Date(serverNow + 2 * 3600_000 - 60_000).toISOString(); // an event stamped a minute before the device's "now": 1h59m ahead of the server
    const e = lookupOf(who, 'librin', { at });
    const r = await who.api.syncPush({ deviceId: who.deviceId, events: [e], clientTime });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.clockSkewMs).toBe(2 * 3600_000);
    expect(r.data.outcomes[0].stored).toBe(true);
    const stored = await h.store.get(who.learnerId, e.id);
    expect(stored!.at).toBe(at); // not corrected
    expect(Date.parse(stored!.recordedAt)).toBe(serverNow);
  });

  it('is negative for a device behind the server, and a direct POST /events still refuses a time more than five minutes ahead', async () => {
    const h = realHarness();
    const who = await signUp(h, 'a@example.test');
    const r = await who.api.syncPush({ deviceId: who.deviceId, events: [], clientTime: new Date(Date.parse(h.clock.now()) - 90_000).toISOString() });
    expect(r.ok && r.data.clockSkewMs).toBe(-90_000);
    const future = lookupOf(who, 'librin', { at: new Date(Date.parse(h.clock.now()) + 3600_000).toISOString() });
    const post = await who.api.appendEvents([future]);
    expect(post.ok).toBe(false);
  });
});

describe('source policy: restrictions are capped by the service, never granted by the client', () => {
  const allAllowed = Object.fromEntries(RESTRICTION_FIELDS.map((f) => [f, 'allowed'])) as SourceRestrictions;
  const allForbidden = Object.fromEntries(RESTRICTION_FIELDS.map((f) => [f, 'forbidden'])) as SourceRestrictions;
  const stored = async (h: Harness, who: Who, sourceRef: unknown, readerId: string, v = 3): Promise<Record<string, unknown>> => {
    const e = lookupOf(who, 'librin', {
      v, subject: { itemIds: [FORM], sentenceKey: 'ab12', sourceRef: sourceRef as never },
      payload: { surface: 'librin', tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId, helpShown: ['lemma'] },
    });
    const r = await who.api.appendEvents([e]);
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(r.body)}`);
    return (await h.store.get(who.learnerId, e.id))!.subject.sourceRef as unknown as Record<string, unknown>;
  };

  it('a forged "allowed" is stored as the policy\'s value, for every reader in the table', async () => {
    const h = realHarness();
    const who = await signUp(h, 'a@example.test');
    for (const [readerId, policy] of Object.entries(SOURCE_POLICY)) {
      const got = await stored(h, who, { kind: 'web', title: 'T', restrictions: allAllowed }, readerId);
      expect(got.restrictions, readerId).toEqual(policy);
    }
  });

  it('a reader the table does not know gets all "unknown" whatever it claims', async () => {
    const h = realHarness();
    const who = await signUp(h, 'a@example.test');
    expect((await stored(h, who, { kind: 'web', restrictions: allAllowed }, 'some-new-site')).restrictions).toEqual(UNKNOWN_RESTRICTIONS);
    expect(policyFor('some-new-site')).toEqual(UNKNOWN_RESTRICTIONS);
    expect(policyFor(undefined)).toEqual(UNKNOWN_RESTRICTIONS);
    expect(policyFor({ toString: 'x' })).toEqual(UNKNOWN_RESTRICTIONS);
    expect(policyFor('__proto__')).toEqual(UNKNOWN_RESTRICTIONS);
    expect(policyFor('constructor')).toEqual(UNKNOWN_RESTRICTIONS);
  });

  it('a tightened value is kept: a client may forbid what the policy would allow', async () => {
    const h = realHarness();
    const who = await signUp(h, 'a@example.test');
    expect(SOURCE_POLICY['epub-local'].export).toBe('allowed');
    const got = await stored(h, who, { kind: 'ebook', restrictions: { export: 'forbidden', textRetention: 'forbidden' } }, 'epub-local');
    expect(got.restrictions).toMatchObject({ export: 'forbidden', textRetention: 'forbidden', sharing: 'forbidden', reviewExamples: 'unknown' });
    // and where the policy does allow, the client's own "allowed" is kept
    const same = await stored(h, who, { kind: 'ebook', restrictions: { export: 'allowed' } }, 'epub-local');
    expect((same.restrictions as SourceRestrictions).export).toBe('allowed');
  });

  it('a client may forbid everything, whatever the reader', async () => {
    const h = realHarness();
    const who = await signUp(h, 'a@example.test');
    for (const readerId of ['epub-local', 'web-generic', 'some-new-site']) {
      expect((await stored(h, who, { kind: 'web', restrictions: allForbidden }, readerId)).restrictions, readerId).toEqual(allForbidden);
    }
  });

  it('a reference that claims nothing is stored without restrictions (absent reads as unknown)', async () => {
    const h = realHarness();
    const who = await signUp(h, 'a@example.test');
    const got = await stored(h, who, { kind: 'web', title: 'T' }, 'epub-local');
    expect(got).toEqual({ kind: 'web', title: 'T' });
  });

  it('a partial claim is completed with "unknown" before the cap, so a missing field is never raised to the policy', async () => {
    const h = realHarness();
    const who = await signUp(h, 'a@example.test');
    const got = await stored(h, who, { kind: 'web', restrictions: { export: 'allowed' } }, 'epub-local');
    expect(got.restrictions).toEqual({ ...UNKNOWN_RESTRICTIONS, export: 'allowed', sharing: 'forbidden' }); // sharing: claimed unknown, policy forbids
  });

  it('caps a v2 event\'s restrictions too, and keeps its other fields as they were', async () => {
    const h = realHarness();
    const who = await signUp(h, 'a@example.test');
    const got = await stored(h, who, { kind: 'scripture', translationId: 'NIV', book: 'JHN', chapter: 3, languageHint: 'en', restrictions: allAllowed }, 'biblegateway', 2);
    expect(got).toMatchObject({ kind: 'scripture', translationId: 'NIV', book: 'JHN', chapter: 3, languageHint: 'en', restrictions: SOURCE_POLICY.biblegateway });
  });

  it('a v3 reference is rebuilt from its known fields: whatever else a page-controlled client adds is not stored', async () => {
    const h = realHarness();
    const who = await signUp(h, 'a@example.test');
    const sent = { kind: 'scripture', provider: 'biblegateway', translationId: 'NIV', book: 'JHN', chapter: 3, verse: 16, confidence: 0.9, languageHint: 'en', grantedBy: 'the page', restrictions: allAllowed };
    const got = await stored(h, who, sent, 'biblegateway');
    expect(got).toEqual({ kind: 'scripture', provider: 'biblegateway', translationId: 'NIV', book: 'JHN', chapter: 3, verse: 16, confidence: 0.9, restrictions: SOURCE_POLICY.biblegateway });
  });

  it('stores a v3 share and media reference', async () => {
    const h = realHarness();
    const who = await signUp(h, 'a@example.test');
    expect(await stored(h, who, { kind: 'share', mechanism: 'android-send', sourceApp: 'Notes' }, 'share-android')).toEqual({ kind: 'share', mechanism: 'android-send', sourceApp: 'Notes' });
    expect(await stored(h, who, { kind: 'media', provider: 'p', mediaId: 'm', timestampMs: 9, captionProvenance: 'provider' }, 'web-generic'))
      .toEqual({ kind: 'media', provider: 'p', mediaId: 'm', timestampMs: 9, captionProvenance: 'provider' });
  });

  it('refuses a malformed v3 reference as a whole batch with the path, and stores nothing', async () => {
    const h = realHarness();
    const who = await signUp(h, 'a@example.test');
    const headBefore = await h.store.head(who.learnerId); // enrolling appended its own profile event
    const e = lookupOf(who, 'librin', { subject: { itemIds: [FORM], sourceRef: { kind: 'scripture', provider: 'biblegateway', translationId: 'NIV', book: 'John', chapter: 3, confidence: 0.5 } as never } });
    const r = await raw(h, 'POST', '/events', { token: who.token, body: { events: [e] } });
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body.issues)).toContain('subject.sourceRef.book');
    expect(await h.store.head(who.learnerId)).toBe(headBefore);
  });

  it('a service started without a policy fails closed: every claim is capped to "unknown", a forbidden one stays forbidden', async () => {
    const h = realHarness();
    delete h.deps.sourcePolicy;
    const who = await signUp(h, 'a@example.test');
    expect((await stored(h, who, { kind: 'ebook', restrictions: allAllowed }, 'epub-local')).restrictions).toEqual(UNKNOWN_RESTRICTIONS);
    expect((await stored(h, who, { kind: 'ebook', restrictions: { export: 'forbidden' } }, 'epub-local')).restrictions).toEqual({ ...UNKNOWN_RESTRICTIONS, export: 'forbidden' });
  });

  it('main.ts wires the policy into the service, and the handler (which applications reach) does not import the table', () => {
    const main = readFileSync(new URL('../../../packages/repository-service/src/main.ts', import.meta.url), 'utf8');
    expect(main).toContain("import('./sourcePolicy')");
    expect(main).toContain('sourcePolicy: policyFor');
    for (const f of ['handler.ts', 'api.ts', 'deps.ts', 'index.ts']) {
      expect(readFileSync(new URL(`../../../packages/repository-service/src/${f}`, import.meta.url), 'utf8'), f).not.toContain("from './sourcePolicy'");
    }
  });

  it('the table: only epub-local allows anything; commercial and permission-required readers allow nothing', () => {
    const allowed = Object.entries(SOURCE_POLICY).flatMap(([id, p]) => RESTRICTION_FIELDS.filter((f) => p[f] === 'allowed').map((f) => `${id}.${f}`));
    expect(allowed).toEqual(['epub-local.export']);
    for (const id of ['play-books', 'kobo-web', 'kindle-web', 'libroteka', 'kanah', 'tolino-webreader', 'vivlio-casadellibro', 'readawrite', 'mebmarket', 'pratilipi', 'biblegateway', 'youversion']) {
      for (const f of ['textRetention', 'remoteProcessing', 'audioRetention', 'sharing', 'reviewExamples'] as const) expect(SOURCE_POLICY[id][f], `${id}.${f}`).toBe('forbidden');
    }
    for (const id of ['kobo-web', 'kindle-web', 'readawrite', 'mebmarket', 'pratilipi']) expect(SOURCE_POLICY[id].export, id).toBe('forbidden');
    expect(Object.keys(SOURCE_POLICY).sort()).toEqual([
      'biblegateway', 'clipboard', 'epub-local', 'kanah', 'kindle-web', 'kobo-web', 'libroteka', 'mebmarket', 'play-books', 'pratilipi', 'readawrite',
      'share-android', 'share-ios', 'share-web', 'tolino-webreader', 'vivlio-casadellibro', 'web-generic', 'youversion',
    ]);
  });

  it('the policy file is checked when it is read: a missing field, a value that is no permission, an unknown field, another format all throw', () => {
    const row = { textRetention: 'unknown', remoteProcessing: 'unknown', audioRetention: 'unknown', export: 'unknown', sharing: 'unknown', reviewExamples: 'unknown' };
    const doc = (readers: unknown, format = 'go-source-policy@1') => JSON.stringify({ format, readers });
    expect(Object.keys(parsePolicy(doc({ a: row })))).toEqual(['a']);
    expect(() => parsePolicy(doc({ a: { ...row, export: undefined } }))).toThrow(/a.export/);
    expect(() => parsePolicy(doc({ a: { ...row, export: 'yes' } }))).toThrow(/a.export/);
    expect(() => parsePolicy(doc({ a: { ...row, copying: 'allowed' } }))).toThrow(/unknown field/);
    expect(() => parsePolicy(doc({ a: row }, 'other'))).toThrow(/go-source-policy@1/);
    expect(() => parsePolicy('not json')).toThrow();
    expect(Object.isFrozen(SOURCE_POLICY['epub-local'])).toBe(true);
  });

  it('the table covers every reader in the adapter registry document', () => {
    const doc = readFileSync(new URL('../../../docs/ecosystem/reader/ADAPTER-REGISTRY.md', import.meta.url), 'utf8');
    const section = doc.split('## 2. The registry')[1].split('## 3.')[0];
    const ids = [...section.matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(14);
    for (const id of ids) expect(Object.keys(SOURCE_POLICY), id).toContain(id);
  });
});

describe('language-resolution evidence and PackInstalled', () => {
  const language = { languageId: 'sq', basis: 'detection', confidence: 0.6, override: false };

  it('stores language evidence on a v3 lookup and returns it unchanged', async () => {
    const h = realHarness();
    const who = await signUp(h, 'a@example.test');
    const e = lookupOf(who, 'librin');
    e.payload = { ...e.payload, language };
    expect((await who.api.appendEvents([e])).ok).toBe(true);
    const got = await h.store.get(who.learnerId, e.id);
    expect((got!.payload as { language: unknown }).language).toEqual(language);
  });

  it('refuses an inconsistent override with 422 and the path', async () => {
    const h = realHarness();
    const who = await signUp(h, 'a@example.test');
    const e = lookupOf(who, 'librin');
    e.payload = { ...e.payload, language: { ...language, basis: 'override', override: false } };
    const r = await raw(h, 'POST', '/events', { token: who.token, body: { events: [e] } });
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body.issues)).toContain('payload.language.override');
  });

  it('a v2 lookup without language evidence is still ingested and registers its surface', async () => {
    const h = realHarness();
    const who = await signUp(h, 'a@example.test');
    const e = lookupOf(who, 'librin', { v: 2 });
    const r = await who.api.appendEvents([e]);
    expect(r.ok && r.data.stored).toBe(1);
    expect(h.linguistics.resolveCalls).toHaveLength(1);
  });

  it('ingests PackInstalled in v2 (packId only) and v3 (level and validation), and refuses a bad level', async () => {
    const h = realHarness();
    const who = await signUp(h, 'a@example.test');
    const base = (id: string, v: number, payload: Record<string, unknown>): GoEvent => makeEvent(who, {
      id, v, kind: 'PackInstalled', producer: { app: 'golearn-ext', version: '1', deviceId: who.deviceId }, subject: {}, payload,
    });
    const ok = await who.api.appendEvents([
      base('pk2', 2, { packId: 'pack:sq' }),
      base('pk3', 3, { packId: 'pack:sq', packVersion: '9', analyzerId: 'adapter-sq', analyzerVersion: '9', level: 'experimental', validation: 'experimental' }),
    ]);
    expect(ok.ok && ok.data.stored).toBe(2);
    const bad = await raw(h, 'POST', '/events', { token: who.token, body: { events: [base('pk4', 3, { packId: 'pack:sq', level: 'beta' })] } });
    expect(bad.status).toBe(422);
  });
});

describe('provenance of rows registered by a lookup (P-12)', () => {
  const lookupAndRead = async (h: ReturnType<typeof realHarness>, who: Who, surface = 'librin'): Promise<LinguisticUnit> => {
    const r = await who.api.appendEvents([lookupOf(who, surface)]);
    expect(r.ok).toBe(true);
    return (await h.realStore.getUnits([`form:sq:${surface}`]))[0];
  };

  it.each([
    ['an installable pack whose manifest says production-validated', { level: 'installable', validation: 'production-validated' }, 'production-validated'],
    ['an installable pack whose manifest does not say so', { level: 'installable' }, 'unreviewed'],
    ['an installable pack whose manifest says seed-only', { level: 'installable', validation: 'seed-only' }, 'seed-only'],
    ['an experimental pack', { level: 'experimental' }, 'experimental'],
    ['an experimental pack that claims production-validated', { level: 'experimental', validation: 'production-validated' }, 'experimental'],
    ['a pack of unknown level', {}, 'unreviewed'],
  ] as const)('stamps origin learner-lookup and the pack\'s validation: %s', async (_name, packFields, validation) => {
    const h = realHarness();
    await h.realStore.putPack(PACK(packFields as Partial<LanguagePackInfo>));
    const who = await signUp(h, 'a@example.test');
    const unit = await lookupAndRead(h, who);
    expect(unit.provenance).toMatchObject({ origin: 'learner-lookup', validation, packVersion: '1', source: 'rule', ref: 'fake' });
    const analysis = (await h.realStore.analysesOfForm(FORM))[0];
    expect(analysis.provenance).toMatchObject({ origin: 'learner-lookup', validation, packVersion: '1' });
  });

  it('with no pack row at all the validation is unreviewed', async () => {
    const h = realHarness();
    const who = await signUp(h, 'a@example.test');
    expect((await lookupAndRead(h, who)).provenance).toMatchObject({ origin: 'learner-lookup', validation: 'unreviewed' });
  });

  it('stamps through POST /lookup and through sync push as well', async () => {
    const h = realHarness();
    await h.realStore.putPack(PACK({ level: 'experimental' }));
    const who = await signUp(h, 'a@example.test');
    expect((await who.api.lookup({ languageId: 'sq', surface: 'shtëpi' })).ok).toBe(true);
    expect((await h.realStore.getUnits(['form:sq:shtëpi']))[0].provenance).toMatchObject({ origin: 'learner-lookup', validation: 'experimental' });
    const pushed = await who.api.syncPush({ deviceId: who.deviceId, events: [lookupOf(who, 'djalë')], clientTime: h.clock.now() });
    expect(pushed.ok).toBe(true);
    expect((await h.realStore.getUnits(['form:sq:djalë']))[0].provenance).toMatchObject({ origin: 'learner-lookup', validation: 'experimental' });
  });

  it('holds NO learner data: not the learner id, the account email, the device id or the session', async () => {
    const h = realHarness();
    await h.realStore.putPack(PACK({ level: 'experimental' }));
    const who = await signUp(h, 'private.person@example.test', 'device-secret-77');
    await lookupAndRead(h, who);
    const rows = JSON.stringify([
      await h.realStore.getUnits([FORM]), await h.realStore.relationsOf(FORM), await h.realStore.analysesOfForm(FORM),
    ]);
    for (const secret of [who.learnerId, who.email, 'private.person', who.deviceId, who.token]) expect(rows).not.toContain(secret);
  });

  it('stamps once: a second lookup leaves the stamped row as it is', async () => {
    const h = realHarness();
    await h.realStore.putPack(PACK({ level: 'experimental' }));
    const who = await signUp(h, 'a@example.test');
    const first = await lookupAndRead(h, who);
    // the fake linguistics rewrites the row with no origin at every lookup, as the real one does
    const second = await lookupAndRead(h, who);
    expect(second.provenance).toEqual(first.provenance);
    const counts = await h.realStore.provenanceStats();
    expect(counts.filter((c) => c.table === 'units')).toEqual([{ table: 'units', origin: 'learner-lookup', validation: 'experimental', count: 1 }]);
  });

  it('never replaces an origin the producer set itself', async () => {
    const h = realHarness();
    await h.realStore.putUnits([{ unitId: FORM, kind: 'form', languageId: 'sq', label: 'librin', packId: 'fake', packVersion: '1', provenance: { source: 'hand-lexicon', ref: 'seed', confidence: 1, origin: 'pack-lexicon', validation: 'seed-only' }, status: 'high-confidence', createdAt: h.clock.now() }]);
    const who = await signUp(h, 'a@example.test');
    const unit = await lookupAndRead(h, who);
    expect(unit.provenance).toMatchObject({ origin: 'pack-lexicon', validation: 'seed-only', source: 'hand-lexicon' });
  });

  it('a lookup that fails to stamp never fails the ingestion', async () => {
    const h = realHarness();
    const who = await signUp(h, 'a@example.test');
    h.deps.store.getPack = async () => { throw new Error('pack table unavailable'); };
    const r = await who.api.appendEvents([lookupOf(who, 'librin')]);
    expect(r.ok && r.data.stored).toBe(1);
  });

  it('GET /units/:id and /units/batch report the provenance, with the v2 defaults for a row that has none', async () => {
    const h = realHarness();
    const who = await signUp(h, 'a@example.test');
    await h.realStore.putUnits([{ unitId: 'lemma:sq:old:NOUN', kind: 'lexeme', languageId: 'sq', label: 'old', packId: 'p', packVersion: '1', provenance: { source: 'dictionary', ref: 'x', confidence: 0.9 }, status: 'provisional', createdAt: h.clock.now() }]);
    const old = await who.api.unit('lemma:sq:old:NOUN');
    expect(old.ok && old.data.provenance).toMatchObject({ source: 'dictionary', origin: 'import', validation: 'unreviewed' });
    expect(old.ok && old.data.unit.provenance.origin).toBeUndefined(); // the stored row is untouched; the report fills the defaults
    await h.realStore.putPack(PACK({ level: 'experimental' }));
    await lookupAndRead(h, who);
    const batch = await who.api.units([FORM, 'lemma:sq:old:NOUN']);
    expect(batch.ok && batch.data.units[FORM].provenance).toMatchObject({ origin: 'learner-lookup', validation: 'experimental' });
    expect(batch.ok && batch.data.units['lemma:sq:old:NOUN'].provenance).toMatchObject({ origin: 'import' });
  });
});

describe('POST /units/:id/corrections', () => {
  const setup = async (status: LinguisticUnit['status'] = 'provisional') => {
    const h = realHarness();
    await h.realStore.putPack(PACK({ level: 'experimental' }));
    const who = await signUp(h, 'a@example.test');
    await who.api.appendEvents([lookupOf(who, 'librin')]);
    if (status !== 'provisional') await h.realStore.putUnits([{ ...(await ref(h)), status }]);
    return { h, who };
  };

  it('appends the correction (a role and a reason, no learner) and moves a provisional unit to requires-review', async () => {
    const { h, who } = await setup();
    const r = await who.api.correctUnit(FORM, { reason: 'this is not the right word' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.statusChanged).toBe(true);
    expect(r.data.unit.status).toBe('requires-review');
    expect(r.data.provenance.corrections).toEqual([{ at: h.clock.now(), by: 'learner', reason: 'this is not the right word' }]);
    expect(r.data.provenance).toMatchObject({ origin: 'learner-lookup', validation: 'experimental' }); // the stamp survived
    const stored = await ref(h);
    expect(stored.status).toBe('requires-review');
    for (const secret of [who.learnerId, who.email, who.deviceId]) expect(JSON.stringify(stored)).not.toContain(secret);
    const view = await who.api.unit(FORM);
    expect(view.ok && view.data.provenance.corrections).toHaveLength(1);
  });

  it('records `from` and `to`', async () => {
    const { who } = await setup();
    const r = await who.api.correctUnit(FORM, { reason: 'wrong lemma', from: 'lemma:sq:a:NOUN', to: 'lemma:sq:b:NOUN' });
    expect(r.ok && r.data.provenance.corrections![0]).toMatchObject({ from: 'lemma:sq:a:NOUN', to: 'lemma:sq:b:NOUN' });
  });

  it('a lookup that comes back provisional afterwards does not clear the flag', async () => {
    const { h, who } = await setup();
    await who.api.correctUnit(FORM, { reason: 'no' });
    await who.api.appendEvents([lookupOf(who, 'librin', { id: 'again' })]);
    await who.api.lookup({ languageId: 'sq', surface: 'librin' });
    expect((await ref(h)).status).toBe('requires-review');
    expect((await ref(h)).provenance.corrections).toHaveLength(1);
  });

  it('a learner cannot lower a high-confidence or verified unit: the correction is kept, the status is not changed', async () => {
    for (const status of ['verified', 'high-confidence'] as const) {
      const { h, who } = await setup(status);
      const r = await who.api.correctUnit(FORM, { reason: 'I disagree' });
      expect(r.ok && r.data.statusChanged, status).toBe(false);
      expect((await ref(h)).status, status).toBe(status);
      expect((await ref(h)).provenance.corrections, status).toHaveLength(1);
    }
  });

  it('for a form given a lexeme or features, calls the linguistics port\'s correct() and leaves the unit\'s status alone', async () => {
    const { h, who } = await setup();
    const r = await who.api.correctUnit(FORM, { reason: 'it is the other noun', lexemeId: 'lemma:sq:libër:NOUN', sentenceKey: 'ab12' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(h.linguistics.correctCalls).toHaveLength(1);
    expect(h.linguistics.correctCalls[0]).toMatchObject({ formId: FORM, now: h.clock.now(), correction: { by: 'learner', lexemeId: 'lemma:sq:libër:NOUN', sentenceKey: 'ab12', reason: 'it is the other noun' } });
    expect(r.data.result?.analysis).toBeDefined();
    expect(r.data.statusChanged).toBe(false);
    expect(r.data.unit.status).toBe('provisional');
    expect(r.data.provenance.corrections).toHaveLength(1);
  });

  it('a lexeme given for a unit that is not a form does not reach correct(); the unit is flagged instead', async () => {
    const { h, who } = await setup();
    await h.realStore.putUnits([{ unitId: 'lemma:sq:x:NOUN', kind: 'lexeme', languageId: 'sq', label: 'x', packId: 'fake', packVersion: '1', provenance: { source: 'rule', ref: 'r', confidence: 0.5 }, status: 'provisional', createdAt: h.clock.now() }]);
    const r = await who.api.correctUnit('lemma:sq:x:NOUN', { reason: 'wrong', lexemeId: 'lemma:sq:y:NOUN' });
    expect(r.ok && r.data.statusChanged).toBe(true);
    expect(h.linguistics.correctCalls).toHaveLength(0);
  });

  it('without a correct() on the linguistics port it only appends and flags', async () => {
    const { h, who } = await setup();
    (h.deps.linguistics as { correct?: unknown }).correct = undefined;
    const r = await who.api.correctUnit(FORM, { reason: 'it is the other noun', lexemeId: 'lemma:sq:libër:NOUN' });
    expect(r.ok && r.data.statusChanged).toBe(true);
    expect(r.ok && r.data.unit.status).toBe('requires-review');
  });

  it('with a store that has no recordUnitCorrection it still appends (but cannot lower a status)', async () => {
    const { h, who } = await setup();
    (h.deps.store as { recordUnitCorrection?: unknown }).recordUnitCorrection = undefined;
    const r = await who.api.correctUnit(FORM, { reason: 'wrong' });
    expect(r.ok && r.data.statusChanged).toBe(false);
    expect((await ref(h)).provenance.corrections).toHaveLength(1);
  });

  it('refuses: no such unit (404), no reason (422), a reason over 300 characters (422), a reviewer claim (403), another learner (403), no session (401)', async () => {
    const { h, who } = await setup();
    expect((await who.api.correctUnit('lemma:sq:none:NOUN', { reason: 'x' }))).toMatchObject({ ok: false, status: 404, error: 'no-such-unit' });
    expect((await raw(h, 'POST', `/units/${encodeURIComponent(FORM)}/corrections`, { token: who.token, body: {} })).status).toBe(422);
    expect((await raw(h, 'POST', `/units/${encodeURIComponent(FORM)}/corrections`, { token: who.token, body: { reason: '' } })).status).toBe(422);
    expect((await who.api.correctUnit(FORM, { reason: 'x'.repeat(301) }))).toMatchObject({ ok: false, status: 422 });
    expect((await raw(h, 'POST', `/units/${encodeURIComponent(FORM)}/corrections`, { token: who.token, body: { reason: 'x', by: 'reviewer' } })).status).toBe(403);
    expect((await raw(h, 'POST', `/units/${encodeURIComponent(FORM)}/corrections`, { token: who.token, body: { reason: 'x', learnerId: 'someone-else' } })).status).toBe(403);
    expect((await raw(h, 'POST', `/units/${encodeURIComponent(FORM)}/corrections`, { body: { reason: 'x' } })).status).toBe(401);
    expect((await raw(h, 'POST', `/units/${encodeURIComponent(FORM)}/corrections`, { token: who.token, body: { reason: 'x', features: { Case: 5 } } })).status).toBe(422);
    expect((await ref(h)).provenance.corrections).toBeUndefined();
    expect((await ref(h)).status).toBe('provisional');
  });

  it(`stops at ${MAX_CORRECTIONS} corrections per unit with 409`, async () => {
    const { who } = await setup();
    for (let i = 0; i < MAX_CORRECTIONS; i++) expect((await who.api.correctUnit(FORM, { reason: `r${i}` })).ok).toBe(true);
    expect(await who.api.correctUnit(FORM, { reason: 'one more' })).toMatchObject({ ok: false, status: 409, error: 'corrections-full' });
  });
});

describe('export and deletion', () => {
  it('GET /export carries the provenance of the units the learner\'s events refer to', async () => {
    const h = realHarness();
    await h.realStore.putPack(PACK({ level: 'experimental' }));
    const who = await signUp(h, 'a@example.test');
    await who.api.appendEvents([lookupOf(who, 'librin')]);
    await who.api.correctUnit(FORM, { reason: 'check this' });
    const r = await who.api.exportAll();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const list = r.data.unitProvenance as Array<{ unitId: string; status: string; provenance: Record<string, unknown> }>;
    expect(list.map((u) => u.unitId)).toEqual([FORM]);
    expect(list[0]).toMatchObject({ status: 'requires-review', provenance: { origin: 'learner-lookup', validation: 'experimental', corrections: [{ by: 'learner', reason: 'check this' }] } });
    expect(r.data.format).toBe('go-repository-export@1');
    expect(r.data.contractVersion).toBe(3);
  });

  it('DELETE /me erases the learner and leaves the shared rows, which hold nothing of the learner', async () => {
    const h = realHarness();
    await h.realStore.putPack(PACK({ level: 'experimental' }));
    const who = await signUp(h, 'gone@example.test');
    await who.api.appendEvents([lookupOf(who, 'librin')]);
    await who.api.correctUnit(FORM, { reason: 'check this' });
    const before = JSON.stringify(await ref(h));
    const del = await who.api.deleteMe('gone@example.test');
    expect(del.ok).toBe(true);
    expect(await h.store.list({ learnerId: who.learnerId })).toEqual([]);
    const after = await ref(h);
    expect(after).toBeDefined(); // the shared linguistic row stays
    expect(JSON.stringify(after)).toBe(before);
    expect(after.provenance).toMatchObject({ origin: 'learner-lookup', corrections: [{ by: 'learner', reason: 'check this' }] });
    for (const secret of [who.learnerId, 'gone@example.test', who.deviceId]) expect(JSON.stringify([after, await h.realStore.analysesOfForm(FORM)])).not.toContain(secret);
  });
});

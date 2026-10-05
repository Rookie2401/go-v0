// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COURSES, createMemoryStore } from '../../src/core';
import type { DomainEvent } from '../../src/core';
import { BUNDLE_META_ID, bootstrap, bundleMetaId } from '../../src/app/bootstrap';
import { loadBundledCorpus } from '../../src/ingest';
import { chooseTeam } from '../../src/ui/Onboarding';
import { createDexieStore } from '../../src/db/dexie';
import { forgetAzure, recallAzure, rememberAzure, resetPrefsForTests, setPref } from '../../src/ui/prefs';

// These tests are about the built-in CORPUS going through the importer (counts, signatures, one row per language). The ladder's unit documents
// (data/ladder/<lang>/units/) have their own batch and signature in bootstrap, tested in test/ui/pathPage.test.tsx; drafts being written must not move these counts.
vi.mock('../../src/ladder/bundle', async (orig) => ({ ...(await orig<typeof import('../../src/ladder/bundle')>()), ladderUnitDocuments: () => [] }));

beforeEach(() => { resetPrefsForTests(); localStorage.clear(); });
afterEach(() => { resetPrefsForTests(); localStorage.clear(); });

const ES = bundleMetaId('es');
const bundledIn = (lang: string): number => loadBundledCorpus().filter((d) => d.lang === lang).length;

const opts = (extra: Parameters<typeof bootstrap>[0] = {}) => ({ store: createMemoryStore(), courseId: 'honduras-es', features: { listen: true }, ...extra });

describe('bootstrap: content goes through the importer, then the policy migration', () => {
  it('imports the bundled corpus through the v2 importer, remembers it, and skips it when unchanged', async () => {
    const store = createMemoryStore();
    const first = await bootstrap({ store, courseId: 'honduras-es' });
    const report = first.services.startup!.bundledReport!;
    expect(report.length).toBeGreaterThan(0);
    expect(report.filter((d) => d.action === 'rejected')).toEqual([]);
    expect(report.every((d) => d.action === 'created')).toBe(true);
    expect(first.services.startup!.warnings).toBeUndefined();
    expect(await store.texts.count()).toBe(report.length);
    const signature = await store.meta.get(ES);
    expect(signature!.value).toMatch(/^ingest@/);
    expect(await store.meta.get(BUNDLE_META_ID)).toBeUndefined(); // one row per language, none for "everything"
    // every imported text carries the v2 publication fields: nothing is published by accident
    for (const t of await store.texts.all()) {
      expect(t.schemaVersion).toBe(2);
      expect(typeof t.published).toBe('boolean');
      if (!t.published) expect(t.unpublishedReasons.length).toBeGreaterThan(0);
    }

    // a second start over the same store does not import again
    const second = await bootstrap({ store, courseId: 'honduras-es' });
    expect(second.services.startup!.bundledReport).toBeUndefined();
    expect(await store.texts.count()).toBe(report.length);
  });

  it('re-imports when the stored signature no longer matches, without changing unchanged documents', async () => {
    const store = createMemoryStore();
    await bootstrap({ store, courseId: 'honduras-es' });
    await store.meta.put({ id: ES, value: 'ingest@0|stale', updatedAt: 'x' });
    const again = await bootstrap({ store, courseId: 'honduras-es' });
    expect(again.services.startup!.bundledReport!.every((d) => d.action === 'unchanged')).toBe(true);
  });

  it('re-imports when an adapter version changed, although the documents did not', async () => {
    // found in the audit: analyses are made at import, and the remembered signature covered the documents only, so an
    // improved analyzer never reached texts already on a device
    const store = createMemoryStore();
    await bootstrap({ store, courseId: 'honduras-es' });
    const signature = String((await store.meta.get(ES))!.value);
    expect(signature.split('|').pop()).toMatch(/^es@.+$/);
    await store.meta.put({ id: ES, value: signature.replace(/es@[^,|]+/, 'es@older'), updatedAt: 'x' });
    const again = await bootstrap({ store, courseId: 'honduras-es' });
    expect(again.services.startup!.bundledReport).toBeDefined();
    expect(String((await store.meta.get(ES))!.value)).toBe(signature);
    const third = await bootstrap({ store, courseId: 'honduras-es' });
    expect(third.services.startup!.bundledReport).toBeUndefined();
  });

  it('rebuilds every learner\'s derived state when a built-in text was re-analysed, and only then', async () => {
    const store = createMemoryStore();
    const first = await bootstrap({ store, courseId: 'honduras-es' });
    expect(first.services.startup!.modelRebuilt).toBeUndefined(); // a first import creates, it does not re-analyse
    const userId = first.user!.id;
    // an event in the log, and a text that looks as if an earlier analyzer had prepared it
    const event: DomainEvent = { id: 'ev:kept:1', type: 'TextViewed', userId, lang: 'es', at: '2026-01-01T00:00:00.000Z', surface: 'corpus', session: 's', dedupeKey: 'kept:1', textId: 'text:es:camino-1-01' };
    await store.events.put(event);
    const text = (await store.texts.get('text:es:camino-1-01'))!;
    expect(text.transformations.some((t) => t.tool.startsWith('adapter-es@'))).toBe(true);
    await store.texts.put({ ...text, transformations: text.transformations.map((t) => (t.tool.startsWith('adapter-es@') ? { ...t, tool: 'adapter-es@older' } : t)) });
    const own = (await store.meta.all()).find((m) => !m.id.startsWith(BUNDLE_META_ID) && m.id.includes('text:es:camino-1-01') && typeof m.value === 'string')!;
    expect(own).toBeDefined();
    await store.meta.put({ ...own, value: `${String(own.value)}-older` });
    const signature = String((await store.meta.get(ES))!.value);
    await store.meta.put({ id: ES, value: signature.replace(/es@[^,|]+/, 'es@older'), updatedAt: 'x' });

    const second = await bootstrap({ store, courseId: 'honduras-es' });
    const report = second.services.startup!.bundledReport!;
    expect(report.filter((d) => d.action === 'updated').length).toBe(1);
    expect(report.filter((d) => d.action === 'rejected')).toEqual([]);
    expect(second.services.startup!.modelRebuilt).toBe(true);
    expect(await store.events.get('ev:kept:1')).toEqual(event); // the log is never rewritten

    const third = await bootstrap({ store, courseId: 'honduras-es' });
    expect(third.services.startup!.bundledReport).toBeUndefined();
    expect(third.services.startup!.modelRebuilt).toBeUndefined();
  });

  it('imports only the active course\'s language at startup; another language when its course becomes active', async () => {
    // found in browser audits by three sessions: a first start imported every language's texts (109 documents, about 25 s)
    const store = createMemoryStore();
    const first = await bootstrap({ store, courseId: 'honduras-es' });
    const langs = new Set((await store.texts.all()).map((t) => t.lang));
    expect([...langs]).toEqual(['es']);
    expect(await store.texts.count()).toBe(bundledIn('es'));
    expect(await store.meta.get(bundleMetaId('de'))).toBeUndefined();

    // the learner changes team: the German texts and the German ladder are there before Home counts them
    await store.users.put({ ...first.user!, courseId: 'germany-de' });
    await first.services.content!.ensureCourse('germany-de');
    expect((await store.texts.where('lang', 'de')).length).toBe(bundledIn('de'));
    expect((await store.texts.where('lang', 'es')).length).toBe(bundledIn('es')); // nothing is taken away
    expect(await store.meta.get(bundleMetaId('de'))).toBeDefined();
    const german = COURSES.find((c) => c.id === 'germany-de')!;
    if ((await first.services.catalog.streams(german.id)).length > 0 || (await store.stages.where('courseId', german.id)).length > 0) {
      expect((await store.works.where('courseId', german.id)).length).toBeGreaterThan(0); // its ladder is installed
    }
    // again: nothing to do, nothing written
    const before = (await store.meta.get(bundleMetaId('de')))!.updatedAt;
    await first.services.content!.ensureCourse('germany-de');
    expect((await store.meta.get(bundleMetaId('de')))!.updatedAt).toBe(before);

    // and the next start, now on the German course, imports nothing
    const next = await bootstrap({ store });
    expect(next.course!.id).toBe('germany-de');
    expect(next.services.startup!.bundledReport).toBeUndefined();
  });

  it('a language that went stale while another course was active is re-analysed when it next becomes active, not skipped for good', async () => {
    const store = createMemoryStore();
    const first = await bootstrap({ store, courseId: 'germany-de' });
    const userId = first.user!.id;
    const de = String((await store.meta.get(bundleMetaId('de')))!.value);
    // the learner moves to Spanish; meanwhile the German texts look as if an older German analyzer had prepared them
    await store.users.put({ ...first.user!, courseId: 'honduras-es' });
    const text = (await store.texts.where('lang', 'de'))[0];
    await store.texts.put({ ...text, transformations: text.transformations.map((t) => (t.tool.startsWith('adapter-de@') ? { ...t, tool: 'adapter-de@older' } : t)) });
    const own = (await store.meta.all()).find((m) => !m.id.startsWith(BUNDLE_META_ID) && m.id.includes(text.id) && typeof m.value === 'string')!;
    await store.meta.put({ ...own, value: `${String(own.value)}-older` });
    await store.meta.put({ id: bundleMetaId('de'), value: de.replace(/de@[^,|]+/, 'de@older'), updatedAt: 'x' });

    const spanish = await bootstrap({ store, userId });
    expect(spanish.course!.id).toBe('honduras-es');
    expect(spanish.services.startup!.bundledReport!.length).toBe(bundledIn('es')); // the Spanish texts only: German is left alone at this start
    expect((await store.texts.get(text.id))!.transformations.some((t) => t.tool === 'adapter-de@older')).toBe(true);
    expect(String((await store.meta.get(bundleMetaId('de')))!.value)).not.toBe(de); // still stale

    await store.users.put({ ...(await store.users.get(userId))!, courseId: 'germany-de' });
    await spanish.services.content!.ensureCourse('germany-de');
    expect(String((await store.meta.get(bundleMetaId('de')))!.value)).toBe(de); // caught up
    const again = (await store.texts.get(text.id))!;
    expect(again.transformations.some((t) => /analyzer changed/.test(t.description))).toBe(true);
    expect(again.contentVersion).toBe(text.contentVersion); // the words did not change
  });

  it('first run: nothing is imported before a team is chosen; choosing one leaves its texts, its ladder and its library index in place', async () => {
    const store = createMemoryStore();
    const r = await bootstrap({ store });
    expect(r.user).toBeNull();
    expect(await store.texts.count()).toBe(0);
    expect(r.services.startup!.bundledReport).toBeUndefined();

    const { course } = await chooseTeam(store, 'honduras-es');
    await r.services.content!.ensureCourse(course.id);
    expect((await store.texts.where('lang', 'es')).length).toBe(bundledIn('es'));
    expect((await store.works.where('courseId', course.id)).length).toBeGreaterThan(0);
    // the library index exists without a reload (it used to be built only when a course already existed at startup)
    const page = await r.services.library.search({ lang: 'es', location: 'bundled', limit: 5 });
    expect(page.total).toBe(bundledIn('es'));
  });

  it('bundleLanguages "all" imports every language at startup', async () => {
    const store = createMemoryStore();
    const r = await bootstrap({ store, courseId: 'honduras-es', bundleLanguages: 'all' });
    expect(await store.texts.count()).toBe(loadBundledCorpus().length);
    expect(r.services.startup!.bundledReport!.length).toBe(loadBundledCorpus().length);
    const again = await bootstrap({ store, courseId: 'honduras-es', bundleLanguages: 'all' });
    expect(again.services.startup!.bundledReport).toBeUndefined();
  });

  it('skipCorpus leaves the store without texts', async () => {
    const r = await bootstrap(opts({ skipCorpus: true }));
    expect(await r.services.store.texts.count()).toBe(0);
    expect(r.services.startup!.bundledReport).toBeUndefined();
  });

  it('brings the active learner\'s derived state up to the current evidence policy (events are kept)', async () => {
    const store = createMemoryStore();
    const first = await bootstrap({ store, courseId: 'honduras-es', skipCorpus: true });
    const userId = first.user!.id;
    const event: DomainEvent = { id: 'ev:old:1', type: 'TextViewed', userId, lang: 'es', at: '2026-01-01T00:00:00.000Z', surface: 'corpus', session: 's', dedupeKey: 'old:1', textId: 'text:es:x' };
    await store.events.put(event);
    await store.meta.delete(`golearn.policy:${userId}`);
    await store.meta.put({ id: `golearn.policy:${userId}`, value: 'evidence@1', updatedAt: 'x' });

    const second = await bootstrap({ store, courseId: 'honduras-es', skipCorpus: true });
    expect(second.services.startup!.policyRebuilt).toBe(true);
    expect((await store.meta.get(`golearn.policy:${userId}`))!.value).toBe(second.services.golearn.policyVersion);
    expect(await store.events.get('ev:old:1')).toEqual(event); // nothing deleted from the log

    const third = await bootstrap({ store, courseId: 'honduras-es', skipCorpus: true });
    expect(third.services.startup!.policyRebuilt).toBe(false); // current now
  });

  it('adopts the restored learner\'s team when the device has no remembered choice', async () => {
    const store = createMemoryStore();
    await store.users.put({ id: 'u-restored', displayName: 'Restored', courseId: 'germany-de', createdAt: '2026-01-01T00:00:00.000Z' });
    const r = await bootstrap({ store, skipCorpus: true });
    expect(r.user!.id).toBe('u-restored');
    expect(r.course!.id).toBe('germany-de');
    expect(localStorage.getItem('go-v0:chosen-course')).toBe('germany-de');
  });

  it('creates nobody on a first run with no team chosen', async () => {
    const r = await bootstrap({ store: createMemoryStore(), skipCorpus: true });
    expect(r.user).toBeNull();
    expect(r.course).toBeNull();
  });

  it('persists in Dexie across a restart', async () => {
    const dbName = `go-boot-${Date.now()}`;
    const first = await bootstrap({ dbName, courseId: 'thailand-th', skipCorpus: true });
    expect(first.user!.courseId).toBe('thailand-th');
    (first.services.store as ReturnType<typeof createDexieStore>).close();
    const second = await bootstrap({ dbName, skipCorpus: true });
    expect(second.user!.id).toBe(first.user!.id);
    expect(second.course!.lang).toBe('th');
    await (second.services.store as ReturnType<typeof createDexieStore>).destroy();
  });
});

describe('bootstrap: no fixture audio unless it is asked for', () => {
  it('audio is unavailable by default, and the fixture is not allowed', async () => {
    const { services } = await bootstrap(opts());
    expect(services.golisten.allowFixture()).toBe(false);
    expect((await services.golisten.availability()).available).toBe(false);
    const text = (await services.store.texts.all())[0];
    const status = await services.golisten.audioStatus(text.id);
    expect(status.state).toBe('unavailable');
    expect(status.reason).toContain('no speech provider is configured');
    expect(status.evidenceEligible).toBe(false);
  });

  it('preview mode (or the development preference) allows the fixture, and turning it off takes it away again', async () => {
    const { services } = await bootstrap(opts({ skipCorpus: true }));
    const gl = services.golisten as typeof services.golisten & { allowFixture(): boolean };
    expect(gl.allowFixture()).toBe(false);
    setPref('preview', true);
    expect(gl.allowFixture()).toBe(true);
    setPref('preview', false);
    expect(gl.allowFixture()).toBe(false);
    setPref('devFixtureAudio', true);
    expect(gl.allowFixture()).toBe(true);
    setPref('devFixtureAudio', false);
    expect(gl.allowFixture()).toBe(false);
  });

  it('starts with the fixture on when the preference was already on at launch', async () => {
    setPref('preview', true);
    const { services } = await bootstrap(opts({ skipCorpus: true }));
    expect((services.golisten as typeof services.golisten & { allowFixture(): boolean }).allowFixture()).toBe(true);
  });
});

describe('bootstrap: a direct Azure key needs an explicit opt-in (off by default)', () => {
  it('a key stored on the device is NOT read or used while the option is off; nothing is registered', async () => {
    rememberAzure({ key: 'k-stored', region: 'westeurope' });
    const { services } = await bootstrap(opts({ skipCorpus: true }));
    expect(services.golisten.providers().map((p) => p.id)).not.toContain('azure-speech');
    expect(services.speech.azure()).toMatchObject({ configured: false, remembered: true }); // still stored, so Settings can offer to forget it
  });

  it('configureAzure is refused while the option is off, and writes nothing', async () => {
    const { services } = await bootstrap(opts({ skipCorpus: true }));
    await expect(services.speech.configureAzure({ key: 'k-1', region: 'westeurope', remember: true })).rejects.toThrow(/switched off/);
    expect(recallAzure()).toBeUndefined();
    expect(services.golisten.providers().map((p) => p.id)).not.toContain('azure-speech');
  });

  it('with the option on, a stored key is used at start', async () => {
    rememberAzure({ key: 'k-stored', region: 'westeurope' });
    setPref('azureDirectKey', true);
    const { services } = await bootstrap(opts({ skipCorpus: true }));
    expect(services.golisten.providers().map((p) => p.id)).toContain('azure-speech');
  });
});

describe('bootstrap: the Azure key is stored only when the learner says so', () => {
  beforeEach(() => { setPref('azureDirectKey', true); }); // the explicit opt-in these tests are about
  it('without "remember", nothing is written and the provider lives for this session', async () => {
    const { services } = await bootstrap(opts({ skipCorpus: true }));
    expect(services.speech.azure()).toEqual({ configured: false, remembered: false, region: undefined });
    await services.speech.configureAzure({ key: 'k-session', region: 'westeurope', remember: false });
    expect(services.speech.azure()).toMatchObject({ configured: true, remembered: false, region: 'westeurope' });
    expect(services.golisten.providers().map((p) => p.id)).toContain('azure-speech');
    expect(JSON.stringify({ ...localStorage })).not.toContain('k-session');
    expect(recallAzure()).toBeUndefined();
  });

  it('with "remember", it is kept on this device, used at the next start, and can be forgotten', async () => {
    const a = await bootstrap(opts({ skipCorpus: true }));
    await a.services.speech.configureAzure({ key: 'k-kept', region: 'westeurope', remember: true });
    expect(recallAzure()).toEqual({ key: 'k-kept', region: 'westeurope' });

    const b = await bootstrap(opts({ skipCorpus: true }));
    expect(b.services.speech.azure()).toMatchObject({ configured: true, remembered: true, region: 'westeurope' });
    expect(b.services.golisten.providers().map((p) => p.id)).toContain('azure-speech');

    b.services.speech.forgetAzure();
    expect(recallAzure()).toBeUndefined();
    expect(b.services.golisten.providers().map((p) => p.id)).not.toContain('azure-speech');
    expect(b.services.speech.azure().configured).toBe(false);
  });

  it('refuses an empty key or region', async () => {
    const { services } = await bootstrap(opts({ skipCorpus: true }));
    await expect(services.speech.configureAzure({ key: '  ', region: 'westeurope', remember: true })).rejects.toThrow('key and a region');
    expect(recallAzure()).toBeUndefined();
    rememberAzure({ key: 'x', region: 'y' });
    forgetAzure();
    expect(recallAzure()).toBeUndefined();
  });
});

describe('bootstrap: the importer and backup controls are bound to the real modules', () => {
  it('validates without writing, with paths and hints; rejects a batch with a bad document', async () => {
    const { services } = await bootstrap(opts({ skipCorpus: true }));
    const report = await services.ingest.validate([{ id: 'x' }]);
    expect(report).toHaveLength(1);
    expect(report[0].action).toBe('valid'); // "checked", with issues below
    const errors = report[0].issues.filter((i) => i.severity === 'error');
    expect(errors.length).toBeGreaterThan(0);
    for (const e of errors) { expect(e.path).toBeDefined(); expect(e.message.length).toBeGreaterThan(0); expect(e.hint!.length).toBeGreaterThan(0); }
    expect(await services.store.texts.count()).toBe(0);

    const imported = await services.ingest.import([{ id: 'x' }]);
    expect(imported[0].action).toBe('rejected');
    expect(await services.store.texts.count()).toBe(0); // a bad document imports nothing
  });

  it('exports a learner, checks the file, and restores it into another device', async () => {
    const a = await bootstrap(opts({ skipCorpus: true }));
    const userId = a.user!.id;
    await a.services.store.drafts.put({ id: `draft:${userId}:es`, userId, lang: 'es', text: 'Yo creo en Dios.', updatedAt: '2026-01-01T00:00:00.000Z', seq: 2 });
    const file = await a.services.backup.exportLearner(userId);
    const check = a.services.backup.check(JSON.parse(JSON.stringify(file)));
    expect(check.ok).toBe(true);
    expect(check.errors).toEqual([]);

    const b = await bootstrap(opts({ skipCorpus: true }));
    const restored = await b.services.backup.restore(JSON.parse(JSON.stringify(file)), { mode: 'merge' });
    expect(Array.isArray(restored.summary)).toBe(true);
    expect((await b.services.store.drafts.get(`draft:${userId}:es`))!.text).toBe('Yo creo en Dios.');

    const tampered = JSON.parse(JSON.stringify(file));
    tampered.data.drafts[0].text = 'Changed.';
    const bad = b.services.backup.check(tampered);
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/integrity|corrupt/i);
  });
});

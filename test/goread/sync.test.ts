import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../src/core';
import type { AppStore } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { importDocuments } from '../../src/ingest';
import type { CorpusDocument } from '../../src/ingest';
import type { ImportDocView } from '../../src/ui/context';
import { readTeamTexts, recordTeamImport } from '../../src/ui/goread/TeamTexts';
import { TeamServerError } from '../../src/goread/client';
import type { SharedText, TeamClient, TextSummary } from '../../src/goread/client';
import { PERSONAL_COPY_REASON } from '../../src/goread/sharing';
import { fetchTeamTexts, shareBook } from '../../src/goread/sync';

const registry = createAdapterRegistry();
const PARA = 'Don Elías salió de su casa temprano. Caminó hasta el río, y allí encontró a su hermano.';

function doc(id: string, over: Partial<CorpusDocument> = {}): CorpusDocument {
  return {
    schemaVersion: 2, id, lang: 'es', title: `Libro ${id}`, contentType: 'story',
    corpus: { id: 'ci-es', kind: 'comprehensible-input', title: 'Comprehensible input - Spanish' },
    source: { id: `src:es:${id}`, title: `Libro ${id}`, attribution: 'Escrito por el equipo.', provenance: 'Written by the team. Nothing is copied.', rights: 'owner-authored', authorship: 'human' },
    review: { status: 'unreviewed' }, topics: [], editorialTags: [], prepTargets: [], generated: false,
    sections: [{ paragraphs: [{ text: PARA }] }],
    ...over,
  };
}

const personalCopy = (id: string): CorpusDocument => doc(id, {
  source: { id: `src:es:${id}`, title: 'Un libro publicado', attribution: 'Mi copia.', provenance: 'My own copy of a published book, for my own reading.', rights: 'personal-copy', authorship: 'published' },
});

const summaryOf = (d: CorpusDocument, addedBy: string, addedAt: string): TextSummary =>
  ({ id: d.id, title: d.title, lang: d.lang, addedBy, addedAt, updatedAt: addedAt, sha256: `sha-${d.id}`, bytes: 100 });

/** A fake server: lists summaries, serves documents, records what was shared. */
function fakeClient(shared: Array<{ doc: CorpusDocument; addedBy: string; addedAt: string }>) {
  const calls = { list: [] as Array<[string, string | undefined]>, get: [] as string[], share: [] as Array<{ course: string; id: string }> };
  const client: TeamClient = {
    health: async () => ({ ok: true }),
    async list(course, since) { calls.list.push([course, since]); return shared.map((s) => summaryOf(s.doc, s.addedBy, s.addedAt)); },
    async get(_course, id): Promise<SharedText> {
      calls.get.push(id);
      const s = shared.find((x) => x.doc.id === id);
      if (!s) throw new TeamServerError({ status: 404, error: 'no-such-text', message: 'No such text.' });
      return { document: s.doc, addedBy: s.addedBy, addedAt: s.addedAt, updatedAt: s.addedAt, sha256: `sha-${id}` };
    },
    async share(course, document) {
      calls.share.push({ course, id: document.id });
      return { status: 201, summary: summaryOf(document, 'Ana', '2026-10-02T12:00:00.000Z') };
    },
    async me() { return { team: 'honduras-es', name: 'Ana' }; },
  };
  return { client, calls };
}

/** The importer as the page has it: the real importDocuments over the memory store, reported as ImportDocViews. */
function ingestOver(store: AppStore) {
  return {
    async import(docs: unknown[]): Promise<ImportDocView[]> {
      const report = await importDocuments(store, registry, docs, { clock: () => '2026-10-02T09:00:00.000Z' });
      return report.documents.map((d) => ({ id: d.id, action: d.action, issues: d.issues.map((i) => ({ path: i.path, code: i.code, message: i.message, severity: i.severity })), note: d.note }));
    },
  };
}

describe('fetchTeamTexts', () => {
  it('imports only what is missing and records who added it, with the server\'s time', async () => {
    const store = createMemoryStore();
    const have = doc('ya-lo-tengo');
    expect((await ingestOver(store).import([have]))[0].action).toBe('created');
    const { client, calls } = fakeClient([
      { doc: have, addedBy: 'Ana', addedAt: '2026-09-30T10:00:00.000Z' },
      { doc: doc('nuevo-uno'), addedBy: 'Beto', addedAt: '2026-10-01T11:00:00.000Z' },
      { doc: doc('nuevo-dos'), addedBy: 'Carla', addedAt: '2026-10-02T07:30:00.000Z' },
    ]);

    const result = await fetchTeamTexts({ client, course: 'honduras-es', lang: 'es', store, ingest: ingestOver(store), recordTeamImport, since: '2026-01-01T00:00:00.000Z' });
    expect(result).toEqual({ fetched: 2, imported: 2, skipped: 1, failed: [] });
    expect(calls.list).toEqual([['honduras-es', '2026-01-01T00:00:00.000Z']]);
    expect(calls.get).toEqual(['nuevo-uno', 'nuevo-dos']); // the one it had was never downloaded

    expect(await store.texts.get('text:es:nuevo-uno')).toBeDefined();
    expect(await store.texts.get('text:es:nuevo-dos')).toBeDefined();
    const entries = await readTeamTexts(store, 'es');
    expect(entries).toEqual([
      { textId: 'text:es:nuevo-uno', by: 'Beto', at: '2026-10-01T11:00:00.000Z' },
      { textId: 'text:es:nuevo-dos', by: 'Carla', at: '2026-10-02T07:30:00.000Z' },
    ]);

    // nothing is missing the second time
    const again = await fetchTeamTexts({ client, course: 'honduras-es', lang: 'es', store, ingest: ingestOver(store), recordTeamImport });
    expect(again).toEqual({ fetched: 0, imported: 0, skipped: 3, failed: [] });
    expect(calls.get).toHaveLength(2);
  });

  it('imports the whole fetch as ONE batch', async () => {
    const store = createMemoryStore();
    const batches: number[] = [];
    const inner = ingestOver(store);
    const { client } = fakeClient([
      { doc: doc('a-1'), addedBy: 'Ana', addedAt: '2026-10-01T00:00:00.000Z' },
      { doc: doc('a-2'), addedBy: 'Ana', addedAt: '2026-10-01T00:00:00.000Z' },
    ]);
    await fetchTeamTexts({ client, course: 'c', lang: 'es', store, ingest: { import: async (d) => { batches.push(d.length); return inner.import(d); } }, recordTeamImport });
    expect(batches).toEqual([2]);
  });

  it('a text that cannot be fetched or imported is reported in failed, and leaves no record', async () => {
    const store = createMemoryStore();
    const broken = doc('roto', { sections: [{ paragraphs: [{ text: '   ' }] }] });
    const { client } = fakeClient([{ doc: broken, addedBy: 'Ana', addedAt: '2026-10-01T00:00:00.000Z' }]);
    const result = await fetchTeamTexts({ client, course: 'c', lang: 'es', store, ingest: ingestOver(store), recordTeamImport });
    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].id).toBe('roto');
    expect(result.failed[0].message.length).toBeGreaterThan(0);
    expect(await readTeamTexts(store, 'es')).toEqual([]);

    // a summary the server lists but cannot serve
    const lister: TeamClient = { ...client, get: async () => { throw new TeamServerError({ status: 404, error: 'no-such-text', message: 'Gone.' }); } };
    const r2 = await fetchTeamTexts({ client: lister, course: 'c', lang: 'es', store, ingest: ingestOver(store), recordTeamImport });
    expect(r2).toEqual({ fetched: 0, imported: 0, skipped: 0, failed: [{ id: 'roto', message: 'Gone.' }] });
  });

  it('a summary in another language is not fetched', async () => {
    const store = createMemoryStore();
    const { client, calls } = fakeClient([{ doc: doc('x'), addedBy: 'Ana', addedAt: '2026-10-01T00:00:00.000Z' }]);
    const result = await fetchTeamTexts({ client, course: 'c', lang: 'de', store, ingest: ingestOver(store), recordTeamImport });
    expect(result.fetched).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(calls.get).toEqual([]);
  });

  it('a server that does not answer stops the fetch with the TeamServerError', async () => {
    const store = createMemoryStore();
    const client: TeamClient = {
      ...fakeClient([]).client,
      list: async () => { throw new TeamServerError({ status: 0, error: 'unreachable', message: 'The team server did not answer.' }); },
    };
    await expect(fetchTeamTexts({ client, course: 'c', lang: 'es', store, ingest: ingestOver(store), recordTeamImport })).rejects.toMatchObject({ status: 0 });
  });
});

describe('shareBook', () => {
  it('shares an owner-authored text, sending the rebuilt document with the adder\'s name', async () => {
    const store = createMemoryStore();
    await ingestOver(store).import([doc('mio-ch01'), doc('mio-ch02')]);
    const sent: CorpusDocument[] = [];
    const { client, calls } = fakeClient([]);
    const spy = { share: async (course: string, d: CorpusDocument) => { sent.push(d); return client.share(course, d); } };
    const result = await shareBook({ client: spy, course: 'honduras-es', store, textIds: ['text:es:mio-ch01', 'text:es:mio-ch02'] });
    expect(result.shared).toEqual(['text:es:mio-ch01', 'text:es:mio-ch02']);
    expect(result.refused).toEqual([]);
    expect(calls.share).toEqual([
      { course: 'honduras-es', id: 'mio-ch01' },
      { course: 'honduras-es', id: 'mio-ch02' },
    ]);
    expect(sent[0].id).toBe('mio-ch01');
    expect(sent[0].sections[0].paragraphs).toEqual([{ text: PARA }]);
  });

  it('refuses a personal copy with the reason, without calling the client', async () => {
    const store = createMemoryStore();
    await ingestOver(store).import([personalCopy('libro-publicado'), doc('mio')]);
    const { client, calls } = fakeClient([]);
    const result = await shareBook({ client, course: 'honduras-es', store, textIds: ['text:es:libro-publicado', 'text:es:mio', 'text:es:no-esta'] });
    expect(result.shared).toEqual(['text:es:mio']);
    expect(result.refused).toEqual([
      { id: 'text:es:libro-publicado', reason: PERSONAL_COPY_REASON },
      { id: 'text:es:no-esta', reason: 'This text is not on this device.' },
    ]);
    expect(calls.share.map((c) => c.id)).toEqual(['mio']);
  });

  it('refuses a generated text (even owner-authored) without calling the client', async () => {
    const store = createMemoryStore();
    await ingestOver(store).import([doc('maquina', { generated: true })]);
    expect((await store.texts.get('text:es:maquina'))?.generated).toBe(true);
    let touched = 0;
    const client = { share: async () => { touched++; throw new Error('must not be called'); } };
    const result = await shareBook({ client, course: 'c', store, textIds: ['text:es:maquina'] });
    expect(touched).toBe(0);
    expect(result.shared).toEqual([]);
    expect(result.refused).toEqual([{ id: 'text:es:maquina', reason: 'Machine-generated text is not shared with the team. Texts your team wrote can be shared.' }]);
  });

  it('only a personal copy: the client is never touched', async () => {
    const store = createMemoryStore();
    await ingestOver(store).import([personalCopy('solo-mio')]);
    let touched = 0;
    const client = { share: async () => { touched++; throw new Error('must not be called'); } };
    const result = await shareBook({ client, course: 'c', store, textIds: ['text:es:solo-mio'] });
    expect(touched).toBe(0);
    expect(result.shared).toEqual([]);
    expect(result.refused[0].reason).toMatch(/stays on your device/);
  });

  it('the server\'s own refusal is reported as refused; an unreachable server stops the call', async () => {
    const store = createMemoryStore();
    await ingestOver(store).import([doc('uno'), doc('dos')]);
    let n = 0;
    const picky = {
      share: async () => { n++; throw new TeamServerError({ status: 422, error: 'invalid-document', message: 'The text did not pass the checks.' }); },
    };
    const r = await shareBook({ client: picky, course: 'c', store, textIds: ['text:es:uno', 'text:es:dos'] });
    expect(n).toBe(2);
    expect(r.refused).toEqual([{ id: 'text:es:uno', reason: 'The text did not pass the checks.' }, { id: 'text:es:dos', reason: 'The text did not pass the checks.' }]);
    expect(r.alreadyThere).toEqual([]);

    const dead = { share: async () => { throw new TeamServerError({ status: 0, error: 'unreachable', message: 'The team server did not answer.' }); } };
    await expect(shareBook({ client: dead, course: 'c', store, textIds: ['text:es:uno'] })).rejects.toMatchObject({ status: 0 });
    const noTeam = { share: async () => { throw new TeamServerError({ status: 404, error: 'no-such-team', message: 'No such team.' }); } };
    await expect(shareBook({ client: noTeam, course: 'c', store, textIds: ['text:es:uno'] })).rejects.toMatchObject({ error: 'no-such-team' });

    // a key that is not on the team's list: the same answer for every text, so the call stops and rethrows
    let tries = 0;
    const stranger = { share: async () => { tries++; throw new TeamServerError({ status: 401, error: 'not-on-whitelist', message: 'Ask whoever keeps the team’s list for a contributor key.' }); } };
    await expect(shareBook({ client: stranger, course: 'c', store, textIds: ['text:es:uno', 'text:es:dos'] })).rejects.toMatchObject({ status: 401, error: 'not-on-whitelist' });
    expect(tries).toBe(1);
  });

  it('a 409 already-there is "already on the shelf": listed in alreadyThere, not refused, and the rest carry on', async () => {
    const store = createMemoryStore();
    await ingestOver(store).import([doc('uno'), doc('dos'), doc('tres')]);
    const held = new Set(['dos']);
    const seen: string[] = [];
    const server = {
      async share(_course: string, d: CorpusDocument) {
        seen.push(d.id);
        if (held.has(d.id)) throw new TeamServerError({ status: 409, error: 'already-there', message: 'Your team already has this text.' });
        return { status: 201 as const, summary: summaryOf(d, 'Ana', '2026-10-02T12:00:00.000Z') };
      },
    };
    const r = await shareBook({ client: server, course: 'c', store, textIds: ['text:es:uno', 'text:es:dos', 'text:es:tres'] });
    expect(seen).toEqual(['uno', 'dos', 'tres']);
    expect(r.shared).toEqual(['text:es:uno', 'text:es:tres']);
    expect(r.alreadyThere).toEqual(['text:es:dos']);
    expect(r.refused).toEqual([]);
  });
});

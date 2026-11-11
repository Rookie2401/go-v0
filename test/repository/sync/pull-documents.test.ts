// @vitest-environment node
// A first pull (no documentsSince) used to carry every document on every page: the server answers a request without `documents:false` with all of them.
// Now only the first page asks for documents; the later pages say `documents: false`. The server is unchanged (clients already installed still work).
import { describe, expect, it } from 'vitest';
import type { PrivateDocument } from '../../../packages/repository-contract/src';
import { FakeServer, LEARNER, makeClock, makeDevice, makeEvent } from './helpers';

const doc = (n: number): PrivateDocument => ({
  docId: `doc-${n}`, learnerId: LEARNER, languageId: 'es', kind: 'note', title: `Nota ${n}`, body: `cuerpo ${n} `.repeat(50), revision: 1, deviceId: 'laptop',
  updatedAt: new Date(Date.parse('2026-10-08T11:00:00Z') + n * 1000).toISOString(),
});

describe('a first pull over several pages', () => {
  it('receives the 5 documents once and all 2,500 events; the local result is the same as before', async () => {
    const clock = makeClock(); const server = new FakeServer(clock);
    for (let n = 0; n < 5; n++) server.docs.set(`doc-${n}`, doc(n));
    for (let i = 0; i < 2500; i++) {
      const e = makeEvent('laptop', clock, { id: `ev-${i}`, at: new Date(clock.now() + i * 1000).toISOString() });
      server.seq += 1; server.events.set(e.id, { ...e, seq: server.seq, recordedAt: e.at });
    }
    const d = makeDevice('phone', server, clock, { pullLimit: 500 });
    const r = await d.client.pull();
    expect(r).toMatchObject({ ok: true, received: 2500, appended: 2500, documents: 5, cursor: 2500 });
    expect(server.pullRequests).toHaveLength(5);
    expect(server.pullRequests[0].documents).toBeUndefined();
    expect(server.pullRequests.slice(1).every((q) => q.documents === false && q.documentsSince === undefined)).toBe(true);
    expect(server.docsPerPull).toEqual([5, 0, 0, 0, 0]);
    // the local result: every event and every document, as a pull that re-sent the documents would have left them
    expect(d.local.events.size).toBe(2500);
    for (let n = 0; n < 5; n++) expect((await d.docs.get(`doc-${n}`))!.doc).toEqual(doc(n));
    expect((await d.docs.list()).length).toBe(5);
  });

  it('a later pull with a documentsSince cursor still asks for the changed documents on its first page', async () => {
    const clock = makeClock(); const server = new FakeServer(clock);
    server.docs.set('doc-0', doc(0));
    const d = makeDevice('phone', server, clock, { pullLimit: 2 });
    await d.client.pull();
    server.docs.set('doc-1', doc(1));
    for (let i = 0; i < 5; i++) { const e = makeEvent('laptop', clock, { id: `ev-${i}`, at: new Date(clock.now() + i * 1000).toISOString() }); server.seq += 1; server.events.set(e.id, { ...e, seq: server.seq, recordedAt: e.at }); }
    server.pullRequests.length = 0;
    await d.client.pull();
    expect(server.pullRequests[0].documentsSince).toBeDefined();
    expect(server.pullRequests.slice(1).every((q) => q.documents === false)).toBe(true);
    expect((await d.docs.get('doc-1'))!.doc.title).toBe('Nota 1');
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { nodeCrypto } from '../../../packages/repository-service/src/crypto-node';
import { adaptLinguistics } from '../../../packages/repository-service/src/linguistics-adapter';
import { createRepositoryApi } from '../../../packages/repository-service/src/api';
import { handle } from '../../../packages/repository-service/src/handler';
import { createHarness, makeEvent } from './fakes';

describe('node crypto', () => {
  it('hashes with scrypt in the documented encoding, with a fresh salt each time, and verifies', async () => {
    const a = await nodeCrypto.hashPassword('correct horse battery');
    const b = await nodeCrypto.hashPassword('correct horse battery');
    expect(a).toMatch(/^scrypt\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/); // 16-byte salt, 32-byte key
    expect(a).not.toBe(b);
    expect(await nodeCrypto.verifyPassword('correct horse battery', a)).toBe(true);
    expect(await nodeCrypto.verifyPassword('correct horse batterz', a)).toBe(false);
    for (const junk of ['', 'scrypt', 'scrypt$x', 'bcrypt$abc$def', `${a}$extra`, 'scrypt$AAAA$AAAA']) expect(await nodeCrypto.verifyPassword('x', junk)).toBe(false);
  });

  it('makes 32-byte base64url tokens and hex sha256', () => {
    const t = nodeCrypto.randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(nodeCrypto.randomToken()).not.toBe(t);
    expect(nodeCrypto.sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('the whole service with real crypto, over a plain fetch', () => {
  it('signs up, signs in, writes, syncs from a second device and deletes', async () => {
    const h = createHarness();
    const deps = { ...h.deps, crypto: nodeCrypto };
    // the client only needs a fetch: this is the shape the applications use against a real server
    const fetchLike = ((input: RequestInfo | URL, init?: RequestInit) => handle(new Request(input, init), deps)) as typeof fetch;
    const phone = createRepositoryApi({ baseUrl: 'https://repo.example/', fetch: fetchLike });
    const created = await phone.createAccount({ email: 'ana@example.com', password: 'a long enough password' });
    expect(created.ok).toBe(true);
    expect((await phone.createSession({ email: 'ana@example.com', password: 'nope nope nope' , deviceId: 'phone' })).ok).toBe(false);
    const login = await phone.createSession({ email: 'ana@example.com', password: 'a long enough password', deviceId: 'phone' });
    expect(login.ok).toBe(true);
    expect(phone.token).toBeDefined();
    const enrol = await phone.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] });
    if (!created.ok || !enrol.ok) throw new Error('setup failed');
    const who = { learnerId: created.data.learnerId, enrolmentId: enrol.data.enrolment.enrolmentId };
    expect((await phone.syncPush({ deviceId: 'phone', clientTime: h.clock.now(), events: [makeEvent(who)] })).ok).toBe(true);

    const laptop = createRepositoryApi({ baseUrl: 'https://repo.example', fetch: fetchLike });
    expect((await laptop.createSession({ email: 'ana@example.com', password: 'a long enough password', deviceId: 'laptop' })).ok).toBe(true);
    const pulled = await laptop.syncPull({ deviceId: 'laptop', afterSeq: 0 });
    expect(pulled.ok && pulled.data.events.map((e) => e.kind)).toEqual(['EnrolmentChanged', 'CardReviewed']);
    const me = await laptop.me();
    expect(me.ok && me.data.devices.map((d) => d.deviceId)).toEqual(['laptop']);

    expect((await laptop.deleteMe('ana@example.com')).ok).toBe(true);
    expect((await phone.me()).ok).toBe(false);
    expect(h.store.dump()).not.toContain('a long enough password');
  });
});

describe('linguistics adapter', () => {
  it('maps the real service’s shapes to the port', async () => {
    const analysis = { analysisId: 'an1', formId: 'form:sq:x' } as never;
    const unit = { unitId: 'form:sq:x' } as never;
    const calls: unknown[] = [];
    const port = adaptLinguistics({
      resolveAndStore: async (i) => { calls.push(i); return { formId: 'form:sq:x', units: [unit], relations: [], analysis, coverage: { known: true, notes: [] } }; },
      lookup: async (id) => (id === 'form:sq:x' ? { unit, relations: { out: [{ fromId: 'a' } as never], in: [{ fromId: 'b' } as never] }, analyses: [analysis] } : { relations: { out: [], in: [] }, analyses: [] }),
      correct: async (_f, c) => { calls.push(c); return { analysis, invalidated: [{ analysisId: 'old1' } as never] }; },
    });
    const r = await port.resolveAndStore({ languageId: 'sq', surface: 'x' });
    expect(Object.keys(r).sort()).toEqual(['analysis', 'formId', 'relations', 'units']);
    const found = await port.lookup('form:sq:x');
    expect(found?.relations).toHaveLength(2);
    expect(await port.lookup('lemma:nope')).toBeUndefined();
    const c = await port.correct('form:sq:x', { by: 'learner', learnerId: 'L', lexemeId: 'lemma:sq:x:NOUN' }, 't');
    expect(c).toEqual({ analysis, invalidated: ['old1'] });
    expect(calls[1]).toEqual({ by: 'learner', lexemeId: 'lemma:sq:x:NOUN' }); // the learner id is not passed to linguistics
  });
});

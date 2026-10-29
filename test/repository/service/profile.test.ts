// @vitest-environment node
/** POST /me/profile: the learner's display name, set or cleared by the signed-in learner; the name travels with GET /me. */
import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../../packages/repository-store/src';
import { call, hardening, member } from './hardening';

describe('the learner profile', () => {
  it('sets, changes and clears the display name; GET /me carries it; the audit log notes the change', async () => {
    const h = await hardening((now) => createMemoryStore({ now }));
    const ana = await member(h, 'ana@example.com');
    const before = await call(h, 'GET', '/me', { token: ana.token });
    expect(before.status).toBe(200);
    expect(before.body.learner.displayName).toBe('ana'); // member() creates the account with the local part of the address as its name

    const set = await call(h, 'POST', '/me/profile', { token: ana.token, body: { displayName: '  Ana Lima  ' } });
    expect(set.status).toBe(200);
    expect(set.body.learner.displayName).toBe('Ana Lima');
    expect((await call(h, 'GET', '/me', { token: ana.token })).body.learner.displayName).toBe('Ana Lima');

    const changed = await call(h, 'POST', '/me/profile', { token: ana.token, body: { displayName: 'Ana' } });
    expect(changed.body.learner.displayName).toBe('Ana');
    const cleared = await call(h, 'POST', '/me/profile', { token: ana.token, body: { displayName: '' } });
    expect(cleared.status).toBe(200);
    expect(cleared.body.learner.displayName).toBeUndefined();

    const events = await call(h, 'GET', '/me/security-events', { token: ana.token });
    expect(events.body.events.filter((e: { kind: string }) => e.kind === 'profile-updated')).toHaveLength(3);
  });

  it('refuses a name that is not a string or is too long, an empty body, and a request without a session', async () => {
    const h = await hardening((now) => createMemoryStore({ now }));
    const ana = await member(h, 'ana@example.com');
    expect((await call(h, 'POST', '/me/profile', { token: ana.token, body: { displayName: 42 } })).status).toBe(422);
    expect((await call(h, 'POST', '/me/profile', { token: ana.token, body: { displayName: 'x'.repeat(201) } })).status).toBe(422);
    expect((await call(h, 'POST', '/me/profile', { token: ana.token, body: {} })).status).toBe(422);
    expect((await call(h, 'POST', '/me/profile', { body: { displayName: 'Ana' } })).status).toBe(401);
    expect((await call(h, 'GET', '/me', { token: ana.token })).body.learner.displayName).toBe('ana');
  });
});

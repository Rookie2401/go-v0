/**
 * The standalone Biblia's session record (packages/biblia/src/session.ts): what is kept in localStorage under 'biblia:session' and 'biblia:device',
 * that it is tied to one service address, and that nothing but the five session fields (never a password) is ever written.
 */
import { describe, expect, it } from 'vitest';
import { DEVICE_KEY, SESSION_KEY, clearSession, deviceIdFor, loadSession, saveSession, type BibliaSession } from '../../packages/biblia/src/session';

function memoryStorage(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => { data.delete(k); },
    setItem: (k, v) => { data.set(k, String(v)); },
  };
}
const SERVICE = 'https://repo.example.org';
const session = (over: Partial<BibliaSession> = {}): BibliaSession => ({ serviceUrl: SERVICE, token: 'tok-fake-1', learnerId: 'L1', email: 'ana@example.org', deviceId: 'biblia:web:abc', ...over });

describe('session', () => {
  it('saves and loads a session under biblia:session, for the service address it was made for', () => {
    const st = memoryStorage();
    saveSession(st, session({ expiresAt: '2099-01-01T00:00:00.000Z' }));
    expect(st.data.has(SESSION_KEY)).toBe(true);
    expect(loadSession(st, SERVICE)).toEqual(session({ expiresAt: '2099-01-01T00:00:00.000Z' }));
    expect(loadSession(st, `${SERVICE}/`)?.token).toBe('tok-fake-1'); // a trailing slash is not a different service
  });

  it('ignores (without deleting) a session made for another service address', () => {
    const st = memoryStorage();
    saveSession(st, session());
    expect(loadSession(st, 'https://other.example.org')).toBeUndefined();
    expect(st.data.has(SESSION_KEY)).toBe(true);
  });

  it('never writes anything but the session fields: a password handed in by mistake is dropped', () => {
    const st = memoryStorage();
    saveSession(st, { ...session(), password: 'correct horse battery', secret: 'x' } as BibliaSession);
    const raw = st.getItem(SESSION_KEY)!;
    expect(raw).not.toMatch(/password|correct horse|secret/);
    expect(Object.keys(JSON.parse(raw) as object).sort()).toEqual(['deviceId', 'email', 'learnerId', 'serviceUrl', 'token']);
  });

  it('a session that ran out, is incomplete or is not JSON loads as none', () => {
    const st = memoryStorage();
    saveSession(st, session({ expiresAt: '2020-01-01T00:00:00.000Z' }));
    expect(loadSession(st, SERVICE, Date.parse('2026-10-22T00:00:00Z'))).toBeUndefined();
    st.setItem(SESSION_KEY, JSON.stringify({ serviceUrl: SERVICE, token: 'x' }));
    expect(loadSession(st, SERVICE)).toBeUndefined();
    st.setItem(SESSION_KEY, '{not json');
    expect(loadSession(st, SERVICE)).toBeUndefined();
    st.setItem(SESSION_KEY, 'null');
    expect(loadSession(st, SERVICE)).toBeUndefined();
  });

  it('clearSession removes it', () => {
    const st = memoryStorage();
    saveSession(st, session());
    clearSession(st);
    expect(st.data.has(SESSION_KEY)).toBe(false);
    expect(loadSession(st, SERVICE)).toBeUndefined();
  });

  it('survives storage that is missing or blocked', () => {
    const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } } as unknown as Storage;
    for (const st of [undefined, blocked]) {
      expect(() => saveSession(st, session())).not.toThrow();
      expect(() => clearSession(st)).not.toThrow();
      expect(loadSession(st, SERVICE)).toBeUndefined();
      expect(deviceIdFor(st)).toMatch(/^biblia:web:[0-9a-f]{24}$/);
    }
  });

  it('the device id is biblia:web:<random>, made once and kept under biblia:device', () => {
    const st = memoryStorage();
    const id = deviceIdFor(st);
    expect(id).toMatch(/^biblia:web:[0-9a-f]{24}$/);
    expect(st.getItem(DEVICE_KEY)).toBe(id);
    expect(deviceIdFor(st)).toBe(id);
    expect(deviceIdFor(memoryStorage())).not.toBe(id);
    st.setItem(DEVICE_KEY, 'something-else'); // not ours: replaced
    expect(deviceIdFor(st)).toMatch(/^biblia:web:/);
  });
});

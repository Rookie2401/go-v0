/**
 * An extension rig for the security audit: the same wiring as test/extension/rig.ts (real background worker, real service
 * handler over the in-memory fakes, fake chrome) but with a fetch that RECORDS every request in full (URL, headers, body)
 * and refuses to leave the service origin, so a test can say exactly what the worker sent and to whom.
 */
import { createBackground } from '../../packages/golearn-extension/src/background/core';
import { handle } from '../../packages/repository-service/src/handler';
import { createChromeFake, type ChromeFake } from '../extension/chromeFake';
import { PASSWORD, SERVICE, fakePacks } from '../extension/rig';
import { createHarness, type Harness } from '../repository/service/fakes';

export interface Sent { url: string; origin: string; method: string; headers: Record<string, string>; body: string }

export interface AuditRig {
  fake: ChromeFake;
  h: Harness;
  bg: ReturnType<typeof createBackground>;
  sent: Sent[];
  /** Requests whose origin is not the service's (they were refused: the worker saw a network error). */
  offOrigin: Sent[];
  timers: Array<{ ms: number; cleared: boolean; fired: boolean; fire(): void }>;
  page(message: Record<string, unknown>): Promise<any>;
  content(message: Record<string, unknown>, tabId?: number): Promise<any>;
  signUp(email?: string): Promise<{ learnerId: string; enrolmentId: string }>;
  connect(email?: string): Promise<any>;
  /** Everything in both storage areas, as one string. */
  storageText(): Promise<string>;
  fireTimers(): Promise<void>;
}

const shard = (): Response => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });

export function createAuditRig(opts: { allowOrigins?: string[]; realPacks?: boolean } = {}): AuditRig {
  const h = createHarness();
  h.clock.set(new Date().toISOString());
  const fake = createChromeFake();
  const sent: Sent[] = [];
  const offOrigin: Sent[] = [];
  const timers: AuditRig['timers'] = [];
  const allowed = new Set([new URL(SERVICE).origin, ...(opts.allowOrigins ?? [])]);
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const u = new URL(req.url);
    const record: Sent = { url: req.url, origin: u.origin, method: req.method, headers: Object.fromEntries(req.headers.entries()), body: await req.clone().text() };
    sent.push(record);
    if (!allowed.has(u.origin)) { offOrigin.push(record); throw new TypeError('Failed to fetch'); }
    if (u.pathname.includes('/dict/')) return shard();
    return handle(req, h.deps);
  }) as typeof fetch;
  const bg = createBackground(fake, {
    fetch: fetchImpl, ...(opts.realPacks ? {} : { packs: fakePacks([]) }), now: () => Date.now(),
    timers: { set: (fn, ms) => { const t = { ms, cleared: false, fired: false, fire() { if (!t.cleared && !t.fired) { t.fired = true; fn(); } } }; timers.push(t); return t; }, clear: (x) => { (x as { cleared: boolean }).cleared = true; } },
  });
  bg.register();
  const rig: AuditRig = {
    fake, h, bg, sent, offOrigin, timers,
    page: (m) => fake.dispatch(m, { id: 'test-ext-id', url: 'chrome-extension://test-ext-id/app/index.html' }),
    content: (m, tabId = 7) => fake.dispatch(m, { id: 'test-ext-id', tab: { id: tabId }, url: 'https://example.test/page' }),
    async signUp(email = 'ana@example.com') {
      const created = await h.api().createAccount({ email, password: PASSWORD, displayName: 'Ana' });
      if (!created.ok) throw new Error(`createAccount failed: ${created.error}`);
      const api = h.api();
      const s = await api.createSession({ email, password: PASSWORD, deviceId: 'setup-dev' });
      if (!s.ok) throw new Error('createSession failed');
      const e = await api.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] });
      if (!e.ok) throw new Error('enrol failed');
      return { learnerId: created.data.learnerId, enrolmentId: e.data.enrolment.enrolmentId };
    },
    connect: (email = 'ana@example.com') => rig.page({ type: 'golearn:connect', baseUrl: SERVICE, email, password: PASSWORD }),
    async storageText() { return JSON.stringify([await fake.local.get(null), await fake.sessionArea.get(null)]); },
    async fireTimers() { for (const t of [...timers]) t.fire(); await new Promise((r) => setTimeout(r, 30)); },
  };
  return rig;
}

export { PASSWORD, SERVICE };

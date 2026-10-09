/**
 * Shared fakes for the GoLearn setup application tests: an in-memory Repository service behind the typed API, small
 * pack bindings (an installable Albanian pack, a planned Spanish one, a Norway team), a chrome fake, and a rig that
 * builds the real application against them in jsdom.
 */
import { vi } from 'vitest';
import type { Enrolment } from '../../packages/repository-contract/src';
import type { ApiResult, RepositoryApi } from '../../packages/repository-service/src/api';
import { createApp, type AppHandle } from '../../packages/golearn-extension/app/app';
import type { Deps, PackBindings, PackView, TeamView, TutorialView, VerifyView } from '../../packages/golearn-extension/app/ports';
import { createMemoryStorageArea } from '../../packages/golearn-extension/src/store';
import type { ChromeApi, StorageArea } from '../../packages/golearn-extension/src/platform';
import { createChromeFake, type ChromeFake } from '../extension/chromeFake';

/** jsdom's Blob has no .text(): read it the way a page would. */
export const readBlob = (blob: Blob): Promise<string> => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsText(blob); });

export const flush = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Wait until `fn` stops throwing / returns truthy (the application renders asynchronously). */
export async function until<T>(fn: () => T | undefined | null | false, ms = 2000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    try { const v = fn(); if (v) return v; } catch (e) { if (Date.now() - t0 > ms) throw e; }
    if (Date.now() - t0 > ms) throw new Error('timed out waiting');
    await flush(5);
  }
}

// ───────────────────────────── the fake service ─────────────────────────────

export interface FakeAccount { password: string; learnerId: string; email: string }

export class FakeService {
  accounts = new Map<string, FakeAccount>();
  sessions = new Map<string, string>(); // token → learnerId
  enrolments: Enrolment[] = [];
  members = new Set<string>(); // team ids every learner may join
  calls: Array<{ method: string; args: unknown[] }> = [];
  health: ApiResult<{ ok: true; service: string; version: number; contractVersion?: number }> = { ok: true, status: 200, data: { ok: true, service: 'go-repository', version: 2 } };
  exportBody: Record<string, unknown> = { schema: 'go-repository-export@1', events: [{ id: 'e1' }], enrolments: [] };
  down = false;
  private n = 0;

  constructor(opts: { teams?: string[] } = {}) { for (const t of opts.teams ?? ['albania', 'norway']) this.members.add(t); }

  private fail(status: number, error: string, message = ''): ApiResult<never> { return { ok: false, status, error, message, body: { error, message } }; }
  private rec(method: string, ...args: unknown[]): void { this.calls.push({ method, args }); }

  api(initialToken?: string): RepositoryApi {
    const self = this;
    const state: { token: string | undefined } = { token: initialToken };
    const learner = (): string | undefined => (state.token ? self.sessions.get(state.token) : undefined);
    const need = <T>(fn: (learnerId: string) => ApiResult<T>): ApiResult<T> => { const l = learner(); return l ? fn(l) : (self.fail(401, 'unauthorized', 'Sign in.') as ApiResult<T>); };
    const api = {
      get token() { return state.token; }, set token(t: string | undefined) { state.token = t; },
      async health() { self.rec('health'); if (self.down) throw new Error('network down'); return self.health; },
      async createAccount(input: { email: string; password: string }) {
        self.rec('createAccount', input.email);
        if (self.accounts.has(input.email)) return self.fail(409, 'email-taken', 'That email is taken.');
        if (input.password.length < 10) return self.fail(400, 'weak-password', 'Password too short.');
        const learnerId = `learner-${++self.n}`;
        self.accounts.set(input.email, { password: input.password, learnerId, email: input.email });
        return { ok: true as const, status: 201, data: { learnerId, accountId: `acct-${self.n}` } };
      },
      async createSession(input: { email: string; password: string; deviceId: string }) {
        self.rec('createSession', input.email, input.deviceId);
        if (self.down) throw new Error('network down');
        const a = self.accounts.get(input.email);
        if (!a || a.password !== input.password) return self.fail(401, 'bad-credentials', 'No.');
        const token = `tok-${a.learnerId}-${++self.n}`;
        self.sessions.set(token, a.learnerId);
        state.token = token;
        return { ok: true as const, status: 201, data: { token, learnerId: a.learnerId, expiresAt: '2026-11-08T00:00:00.000Z' } };
      },
      async deleteSession() { self.rec('deleteSession'); if (state.token) self.sessions.delete(state.token); state.token = undefined; return { ok: true as const, status: 204, data: null }; },
      async listEnrolments() { self.rec('listEnrolments'); return need((l) => ({ ok: true as const, status: 200, data: { enrolments: self.enrolments.filter((e) => e.learnerId === l) } })); },
      async enrol(input: { teamId?: string } & Record<string, unknown>) {
        self.rec('enrol', input);
        return need((l) => {
          if (input.teamId !== undefined && !self.members.has(input.teamId)) return self.fail(403, 'not-a-member', 'no') as never;
          const e = { enrolmentId: `enr-${++self.n}`, learnerId: l, startedAt: `2026-10-08T10:00:0${self.n % 10}.000Z`, goals: [], ...input } as unknown as Enrolment;
          self.enrolments.push(e);
          return { ok: true as const, status: 201, data: { enrolment: e } };
        });
      },
      async exportAll() { self.rec('exportAll'); return need(() => ({ ok: true as const, status: 200, data: self.exportBody })); },
      async deleteMe(confirmEmail: string) {
        self.rec('deleteMe', confirmEmail);
        return need((l) => {
          const a = [...self.accounts.values()].find((x) => x.learnerId === l);
          if (!a || a.email.toLowerCase() !== confirmEmail.toLowerCase()) return self.fail(422, 'email-mismatch', 'Wrong email.') as never;
          self.accounts.delete(a.email);
          return { ok: true as const, status: 204, data: null };
        });
      },
    };
    return api as unknown as RepositoryApi;
  }
}

// ───────────────────────────── fake packs ─────────────────────────────

export const SQ_FAKE: PackView = {
  packId: 'pack:sq', languageId: 'sq', version: '9', name: 'Albanian', nativeName: 'Shqip', status: 'installable', level: 'installable', levelLabel: 'installable',
  analyzerId: 'adapter-sq@9', analyzerVersion: '9', validation: 'unreviewed',
  defaultVarietyId: 'sq-standard', scriptId: 'Latn',
  varieties: [{ varietyId: 'sq-standard', label: 'Standard Albanian', analysed: true }, { varietyId: 'sq-gheg', label: 'Gheg', analysed: false }],
  licences: [{ resource: 'Dictionary kaikki-sq', licence: 'CC BY-SA 4.0', notice: 'Wiktionary, via kaikki.org — CC BY-SA 4.0' }],
  attribution: ['Wiktionary, via kaikki.org — CC BY-SA 4.0'], reviewStatus: 'machine-drafted', provenance: ['Machine-drafted; no native speaker has checked it.'],
  remoteVoiceProvider: 'azure', manifest: { fake: 'sq' },
};
export const ES_FAKE: PackView = {
  packId: 'pack:es', languageId: 'es', version: '3', name: 'Spanish', nativeName: 'Español', status: 'planned', level: 'planned', levelLabel: 'planned, not installable',
  analyzerId: 'adapter-es@3', analyzerVersion: '3', validation: 'unsupported',
  defaultVarietyId: 'es-HN', scriptId: 'Latn', varieties: [{ varietyId: 'es-HN', label: 'Honduras', analysed: true }],
  licences: [], attribution: [], reviewStatus: 'machine-drafted', provenance: ['Planned, not installable.'], manifest: { fake: 'es' },
};
export const NB_FAKE: PackView = {
  packId: 'pack:nb', languageId: 'nb', version: '2', name: 'Norwegian (Bokmål)', nativeName: 'Bokmål', status: 'installable', level: 'installable', levelLabel: 'installable',
  analyzerId: 'adapter-nb@2', analyzerVersion: '2', validation: 'unreviewed',
  defaultVarietyId: 'nb', scriptId: 'Latn', varieties: [{ varietyId: 'nb', label: 'Bokmål', writtenStandard: 'nb', analysed: true }],
  licences: [], attribution: [], reviewStatus: 'machine-drafted', provenance: [], manifest: { fake: 'nb' },
};
export const NN_FAKE: PackView = { ...NB_FAKE, packId: 'pack:nn', languageId: 'nn', name: 'Norwegian (Nynorsk)', nativeName: 'Nynorsk', defaultVarietyId: 'nn', varieties: [{ varietyId: 'nn', label: 'Nynorsk', writtenStandard: 'nn', analysed: true }], manifest: { fake: 'nn' } };

export const TEAMS_FAKE: TeamView[] = [
  { teamId: 'albania', name: 'Albania', languages: [{ languageId: 'sq', label: 'Albanian', varietyId: 'sq-standard' }] },
  { teamId: 'honduras', name: 'Honduras', languages: [{ languageId: 'es', label: 'Spanish (Honduras)', varietyId: 'es-HN' }] },
  { teamId: 'norway', name: 'Norway', languages: [
    { languageId: 'nb', label: 'Norwegian, Bokmål', varietyId: 'nb', requiredChoice: true },
    { languageId: 'nn', label: 'Norwegian, Nynorsk', varietyId: 'nn', requiredChoice: true },
  ] },
];

/** Practice sentence the real Albanian analyser reads (also used by test/extension). */
export const DEMO_SENTENCE = 'Unë po lexoj një libër të bukur në shtëpinë time.';

export const TUTORIAL_FAKE: TutorialView = {
  languageId: 'sq', notice: 'Machine-drafted; no native speaker has checked this orientation.', estimatedMinutes: 6,
  steps: [
    { id: 'intro', kind: 'concept', title: 'How the card works', body: 'Select a word and a card appears.', estimatedMinutes: 1 },
    { id: 'practice-1', kind: 'practice', title: 'Try it', body: 'Now you.', estimatedMinutes: 1, practice: { instruction: 'Look up a word with the real card.', sentence: DEMO_SENTENCE, target: 'shtëpinë' } },
    { id: 'passage', kind: 'passage', title: 'A short passage', body: 'Read it.', estimatedMinutes: 2, passage: { title: 'Një ditë', sentences: [{ text: 'Nëna pi çaj në shtëpi.', gloss: 'The mother drinks tea at home.' }] } },
  ],
};

export interface FakePacks extends PackBindings {
  installs: PackView[];
  verifies: PackView[];
  nextInstall: VerifyView | (() => Promise<VerifyView>);
  nextVerify: VerifyView;
}

export function fakePacks(): FakePacks {
  const all = [SQ_FAKE, ES_FAKE, NB_FAKE, NN_FAKE];
  const f: FakePacks = {
    installs: [], verifies: [],
    nextInstall: { ok: false, version: '9', checks: [
      { id: 'dictionary-manifest', label: 'Dictionary description (kaikki-sq, 91,271 entries)', ok: true },
      { id: 'sample-shard', label: 'A dictionary shard can be fetched and read', ok: true },
      { id: 'case:v-librin', label: 'Validation case: “librin”', ok: true },
      { id: 'case:v-pine', label: 'Validation case: “pinë”', ok: false, detail: 'the analyser gave pi' },
    ] },
    nextVerify: { ok: true, version: '9', checks: [{ id: 'dictionary-manifest', label: 'Dictionary description', ok: true }] },
    packs: () => all,
    teams: () => TEAMS_FAKE,
    packFor: (id) => all.find((p) => p.languageId === id),
    async install(pack, o) {
      f.installs.push(pack);
      o.onProgress?.(1, 4, 'Reading the dictionary description');
      return typeof f.nextInstall === 'function' ? f.nextInstall() : f.nextInstall;
    },
    async verify(pack) { f.verifies.push(pack); return f.nextVerify; },
    tutorial: (id) => (id === 'sq' ? TUTORIAL_FAKE : undefined),
  };
  return f;
}

// ───────────────────────────── the rig ─────────────────────────────

export interface Rig {
  app: AppHandle;
  deps: Deps;
  service: FakeService;
  packs: FakePacks;
  area: ReturnType<typeof createMemoryStorageArea>;
  chrome: ChromeFake | undefined;
  downloads: Array<{ filename: string; blob: Blob }>;
  root: HTMLElement;
  createApiCalls: Array<{ baseUrl: string; token?: string }>;
  closed: { count: number; allowed: boolean };
  /** Text of the main area. */
  text(): string;
  q<T extends Element = HTMLElement>(sel: string): T;
  go(route: string): Promise<void>;
  destroy(): void;
}

export interface RigOptions {
  extension?: boolean;
  config?: Deps['config'];
  service?: FakeService;
  packs?: FakePacks;
  startRoute?: string;
  now?: Date;
}

let rigs: Rig[] = [];
export function destroyRigs(): void { for (const r of rigs) r.destroy(); rigs = []; }

export async function makeRig(opts: RigOptions = {}): Promise<Rig> {
  document.body.innerHTML = '<div id="app"></div>';
  window.location.hash = '';
  const service = opts.service ?? new FakeService();
  const packs = opts.packs ?? fakePacks();
  const chrome = opts.extension ? createChromeFake() : undefined;
  const area = chrome ? (chrome.local as unknown as ReturnType<typeof createMemoryStorageArea>) : createMemoryStorageArea();
  const downloads: Rig['downloads'] = [];
  const createApiCalls: Rig['createApiCalls'] = [];
  const closed = { count: 0, allowed: false };
  const deps: Deps = {
    win: window, doc: document, chrome: chrome as ChromeApi | undefined, fetch: vi.fn() as unknown as typeof fetch,
    area: area as StorageArea, packs, config: opts.config ?? {},
    createApi: (baseUrl, token) => { createApiCalls.push({ baseUrl, token }); return service.api(token); },
    download: (filename, blob) => { downloads.push({ filename, blob }); },
    now: () => opts.now ?? new Date('2026-10-08T12:00:00.000Z'),
    closeWindow: () => { closed.count++; return closed.allowed; },
    copyText: async () => true,
    appVersion: '0.1.0-test',
    speech: null,
    nextFrame: () => Promise.resolve(),
  };
  const root = document.getElementById('app')!;
  if (opts.startRoute) window.location.hash = `#/${opts.startRoute}`;
  const app = createApp(root, deps);
  await app.ready();
  const rig: Rig = {
    app, deps, service, packs, area, chrome, downloads, root, createApiCalls, closed,
    text: () => document.getElementById('screen')?.textContent ?? '',
    q: <T extends Element = HTMLElement>(sel: string): T => { const el = root.querySelector<T>(sel); if (!el) throw new Error(`not found: ${sel}`); return el; },
    async go(route) { await app.go(route); await app.ready(); await flush(); },
    destroy() { app.destroy(); },
  };
  rigs.push(rig);
  return rig;
}

/** Type into a field the way a person would (value + input/change events). */
export function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function choose(el: HTMLSelectElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function submit(form: HTMLFormElement): void {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

/** Sign in through the Account screen's form. */
export async function signIn(rig: Rig, email = 'ana@example.org', password = 'correct horse battery', create = false): Promise<void> {
  if (!create && !rig.service.accounts.has(email)) rig.service.accounts.set(email, { password, learnerId: `learner-${email.split('@')[0]}`, email });
  await rig.go('account');
  choose(rig.q<HTMLSelectElement>('#acct-mode'), create ? 'create' : 'signin');
  type(rig.q<HTMLInputElement>('#acct-email'), email);
  type(rig.q<HTMLInputElement>('#acct-password'), password);
  submit(rig.q<HTMLFormElement>('#acct-form'));
  await until(() => /Signed in as|Account created/.test(rig.q('#acct-form .status').textContent ?? ''));
  await flush(10);
}

// ───────────────────────────── a fake background worker ─────────────────────────────

export interface FakeBackground {
  /** Every message the application sent, in order. */
  messages: Array<Record<string, unknown>>;
  /** Types it answers; any other message gets no reply (as an older worker would behave). */
  handles: Set<string>;
  settings: Record<string, unknown>;
  recorded: Array<Record<string, unknown>>;
  syncReply: Record<string, unknown>;
  statusReply: Record<string, unknown>;
}

/**
 * A stand-in for the extension’s background worker that answers the messages the application sends (the shapes are
 * those of packages/golearn-extension/src/background/core.ts), writing the same storage keys the real one writes.
 * The real worker is exercised against the real service in integration.test.ts.
 */
export function fakeBackground(rig: Rig, only?: string[]): FakeBackground {
  const bg: FakeBackground = {
    messages: [], handles: new Set(only ?? ['connect', 'create-account', 'disconnect', 'service-config', 'select-enrolment', 'settings', 'record', 'status', 'sync-now', 'clear-local']),
    settings: {}, recorded: [],
    syncReply: { ok: true },
    statusReply: { ok: true, connected: true, needsSignIn: false, languageId: 'sq', languageName: 'Albanian', packAvailable: true, hasEnrolment: true, sync: { pending: 0, rejected: 0, online: true, needsSignIn: false } },
  };
  const area = rig.area as unknown as StorageArea;
  rig.chrome!.events.onMessage.addListener((m, _s, respond) => {
    const msg = m as Record<string, any>;
    const type = String(msg.type ?? '').replace(/^golearn:/, '');
    bg.messages.push(msg);
    if (!bg.handles.has(type)) return undefined;
    void (async () => {
      switch (type) {
        case 'connect':
        case 'create-account': {
          const api = rig.service.api();
          if (type === 'create-account') { const made = await api.createAccount({ email: msg.email, password: msg.password }); if (!made.ok) return respond({ ok: false, error: made.error, message: 'The service refused the account.' }); }
          const made = await api.createSession({ email: msg.email, password: msg.password, deviceId: 'dev-bg' });
          if (!made.ok) return respond({ ok: false, error: 'unauthorized', message: 'The email or password was not accepted.' });
          const enrolment = rig.service.enrolments.filter((e) => e.learnerId === made.data.learnerId).at(-1);
          await area.set({ 'golearn:session': { token: made.data.token, learnerId: made.data.learnerId, expiresAt: made.data.expiresAt, email: String(msg.email).toLowerCase(), ...(enrolment ? { enrolmentId: enrolment.enrolmentId, languageId: enrolment.languageId } : {}) }, 'golearn:service': { baseUrl: msg.baseUrl } });
          return respond({ ok: true, status: { connected: true, expired: false, email: msg.email, hasEnrolment: !!enrolment } });
        }
        case 'disconnect': { await area.remove('golearn:session'); return respond({ ok: true, remoteRevoked: true }); }
        case 'service-config': { await area.set({ 'golearn:service': { baseUrl: msg.baseUrl, ...(msg.assetBase ? { assetBase: msg.assetBase } : {}) } }); return respond({ ok: true }); }
        case 'select-enrolment': {
          const s = (await area.get('golearn:session'))['golearn:session'] as Record<string, unknown> | undefined;
          const e = rig.service.enrolments.find((x) => x.enrolmentId === msg.enrolmentId);
          if (!s || !e) return respond({ ok: false, error: 'no-such-enrolment', message: 'That enrolment is not open.' });
          await area.set({ 'golearn:session': { ...s, enrolmentId: e.enrolmentId, languageId: e.languageId } });
          return respond({ ok: true });
        }
        case 'settings': {
          if (msg.op === 'set') { const p = msg.patch as Record<string, unknown>; bg.settings = { ...bg.settings, ...p, keepSnippets: false }; if (p.explanationDepth === null) delete bg.settings.explanationDepth; await area.set({ 'golearn:settings': bg.settings }); }
          return respond({ ok: true, settings: bg.settings });
        }
        case 'record': { bg.recorded.push(msg.event as Record<string, unknown>); return respond({ ok: true, attributed: 'local' }); }
        case 'status': return respond(bg.statusReply);
        case 'sync-now': return respond({ ...bg.syncReply, status: bg.statusReply.sync });
        case 'clear-local': {
          const all = await area.get(null);
          const keys = Object.keys(all).filter((k) => k.startsWith('golearn:event:'));
          if (keys.length) await area.remove(keys);
          return respond({ ok: true, events: keys.length, metrics: 0, queued: 0 });
        }
        default: return respond({ ok: false, error: 'unknown-message' });
      }
    })();
    return true;
  });
  return bg;
}

export type { ChromeFake };

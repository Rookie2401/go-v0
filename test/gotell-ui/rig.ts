/**
 * The test rig for the workspace screens: the shell's own rig (fake Repository service, memory storage, jsdom) with the
 * workspace's engine, timers and downloads replaced by fakes, and an API that also takes `submitWriting`.
 */
import type { GoEvent } from '../../packages/repository-contract/src';
import { validateEvent } from '../../packages/repository-contract/src';
import type { Identity } from '../../packages/gotell/src/types';
import type { FileOut } from '../../packages/gotell/src/workspace/port';
import { tellOverrides } from '../../packages/goreview/app/screens/tell/overrides';
import { defaultService, destroyRigs, flush, makeRig, until, type FakeService, type Rig } from '../goreview-app/helpers';
import { fakeEngine, manualTimers, type FakeEngine, type FakeEngineOptions } from './fakes';

export { flush, until };

export interface TellRig extends Rig {
  engine: FakeEngine;
  timers: ReturnType<typeof manualTimers>;
  downloads: FileOut[];
  /** Observations the fake service received through `submitWriting`. */
  writing: GoEvent[];
  /** Make `submitWriting` fail (a dead connection) so the shell's queue is used. */
  writingDown: { value: boolean };
  /** Opens a route and waits for the screen. */
  open(route: string, waitFor?: string): Promise<void>;
}

export const ID: Identity = { learnerId: 'L1', enrolmentId: 'L1-e1', deviceId: 'web-id1', languageId: 'sq', varietyId: 'sq-AL' };

export async function makeTellRig(opts: { engine?: FakeEngineOptions; service?: FakeService } = {}): Promise<TellRig> {
  const service = opts.service ?? defaultService();
  const rig = await makeRig({ service, signedIn: true });
  const engine = fakeEngine({ ...ID, deviceId: 'web-id1' }, opts.engine);
  const timers = manualTimers();
  const downloads: FileOut[] = [];
  const writing: GoEvent[] = [];
  const writingDown = { value: false };
  tellOverrides.engine = () => engine;
  tellOverrides.timers = timers;
  tellOverrides.download = (f) => { downloads.push(f); };
  const baseApi = rig.deps.createApi;
  rig.deps.createApi = (url, token) => {
    const api = baseApi(url, token);
    return Object.assign(Object.create(Object.getPrototypeOf(api)), api, {
      async submitWriting(input: { observation: GoEvent }) {
        if (writingDown.value) throw new Error('network down');
        const issues = validateEvent(input.observation);
        if (issues.length) return { ok: false as const, status: 422, error: 'invalid-events', message: issues.map((i) => i.message).join('; '), body: {} };
        writing.push(input.observation);
        return { ok: true as const, status: 200, data: { outcome: { id: input.observation.id, stored: true }, projected: true } };
      },
      get token() { return api.token; },
    });
  };
  return Object.assign(rig, {
    engine, timers, downloads, writing, writingDown,
    async open(route: string, waitFor?: string) {
      await rig.go(route);
      if (waitFor) await until(() => !!rig.root.querySelector(waitFor), `${waitFor} on ${route}`);
    },
  });
}

export function resetTellRig(): void {
  tellOverrides.engine = undefined;
  tellOverrides.timers = undefined;
  tellOverrides.download = undefined;
  destroyRigs();
}

/** The draft id in the address bar, e.g. `#/tell/write/draft-id3` → `draft-id3`. */
export const draftIdFromHash = (): string => decodeURIComponent(window.location.hash.replace(/^#\/tell\/write\//, ''));

export function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export function press(key: string, opts: { ctrl?: boolean } = {}): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key, ctrlKey: !!opts.ctrl, bubbles: true, cancelable: true });
  document.dispatchEvent(ev);
  return ev;
}

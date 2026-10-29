/** Capacitor adapters used by the GoReview iOS shell. */
import { registerPlugin } from '@capacitor/core';
import type { KeyValueArea } from '../../repository-sync/src';
import type { Session } from './state';

export interface GoReviewNativeBridge {
  getSession(options: { serviceUrl: string }): Promise<{ session?: Session } | Session | null>;
  setSession(options: { session: Session }): Promise<void>;
  clearSession(options: { serviceUrl: string }): Promise<void>;
  storageGet(options?: { keys?: string[] }): Promise<{ values: Record<string, unknown> }>;
  storageSet(options: { values: Record<string, unknown> }): Promise<void>;
  storageRemove(options: { keys: string[] }): Promise<void>;
  storageList(options: { prefix: string }): Promise<{ keys: string[] }>;
  addListener?(event: 'appStateChange', callback: (state: { isActive: boolean }) => void): Promise<{ remove(): Promise<void> | void }>;
}

interface CapacitorWindow extends Window {
  /** Test and embedding seam; production uses the Capacitor registerPlugin proxy below. */
  __goReviewNative?: GoReviewNativeBridge;
  Capacitor?: {
    getPlatform?: () => string;
    isNativePlatform?: () => boolean;
    isPluginAvailable?: (name: string) => boolean;
    Plugins?: { GoReviewNative?: GoReviewNativeBridge };
    App?: { addListener?: (event: 'appStateChange', callback: (state: { isActive: boolean }) => void) => Promise<{ remove(): Promise<void> | void }> };
  };
}

const registeredNativeBridge = registerPlugin<GoReviewNativeBridge>('GoReviewNative');

export interface MobileRuntime {
  native: boolean;
  platform: string;
  bridgeAvailable: boolean;
  bridge?: GoReviewNativeBridge;
  area?: KeyValueArea;
  getSession(serviceUrl: string): Promise<Session | undefined>;
  setSession(session: Session): Promise<void>;
  clearSession(serviceUrl: string): Promise<void>;
  /** Probe before app rendering so a missing native bridge has a visible recovery message. */
  probe?(): Promise<boolean>;
  /** Native lifecycle callbacks become browser-style `resume` and `suspend` events. */
  installLifecycle?(win: Window): () => void;
}

/** Keep identical learner IDs at different Repository services in separate native queues/logs. */
export const nativeLearnerPrefix = (learnerId: string, serviceUrl: string): string =>
  `u:server:${encodeURIComponent(serviceUrl)}:${encodeURIComponent(learnerId)}:`;

const validSession = (x: unknown): x is Session => {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  return typeof s.token === 'string' && s.token.length > 0 && typeof s.learnerId === 'string'
    && typeof s.email === 'string' && typeof s.expiresAt === 'string';
};

/** GoReview event queues and profiles live in an atomic native JSON key-value file; bearer sessions live separately in Keychain. */
export function createNativeKeyValueArea(bridge: GoReviewNativeBridge): KeyValueArea {
  return {
    async get(keys) {
      const options = keys == null ? undefined : { keys: Array.isArray(keys) ? keys : [keys] };
      return (await bridge.storageGet(options)).values ?? {};
    },
    async set(items) { await bridge.storageSet({ values: items }); },
    async remove(keys) { await bridge.storageRemove({ keys: Array.isArray(keys) ? keys : [keys] }); },
    async list(prefix) { return [...(await bridge.storageList({ prefix })).keys].sort(); },
  };
}

export function createMobileRuntime(win: Window): MobileRuntime {
  const cap = win as CapacitorWindow;
  const platform = cap.Capacitor?.getPlatform?.() ?? 'web';
  const native = cap.Capacitor?.isNativePlatform?.() === true || platform !== 'web';
  const directBridge = cap.__goReviewNative ?? cap.Capacitor?.Plugins?.GoReviewNative;
  if (!native) return {
    native: false, platform, bridgeAvailable: false,
    getSession: async () => undefined, setSession: async () => undefined, clearSession: async () => undefined,
  };

  const bridge = directBridge ?? registeredNativeBridge;
  const runtime: MobileRuntime = {
    native: true, platform, bridgeAvailable: false, bridge,
    async probe() {
      try {
        await bridge.storageGet({ keys: [] });
        runtime.bridgeAvailable = true;
        runtime.area = createNativeKeyValueArea(bridge);
        return true;
      } catch {
        runtime.bridgeAvailable = false;
        runtime.area = undefined;
        return false;
      }
    },
    async getSession(serviceUrl) {
      if (!runtime.bridgeAvailable) return undefined;
      const raw = await bridge.getSession({ serviceUrl });
      const value = raw && typeof raw === 'object' && 'session' in raw ? (raw as { session?: unknown }).session : raw;
      return validSession(value) && value.serviceUrl === serviceUrl ? value : undefined;
    },
    async setSession(session) {
      if (!runtime.bridgeAvailable) throw new Error('Secure native session storage is unavailable.');
      await bridge.setSession({ session });
    },
    async clearSession(serviceUrl) {
      if (runtime.bridgeAvailable) await bridge.clearSession({ serviceUrl });
    },
    installLifecycle(target) {
      let removed = false;
      let handle: { remove(): Promise<void> | void } | undefined;
      const add = bridge.addListener?.bind(bridge) ?? cap.Capacitor?.App?.addListener?.bind(cap.Capacitor.App);
      void add?.('appStateChange', ({ isActive }) => {
        target.dispatchEvent(new Event(isActive ? 'resume' : 'suspend'));
      }).then((h) => { if (removed) void h.remove(); else handle = h; }).catch(() => undefined);
      return () => { removed = true; void handle?.remove(); };
    },
  };
  return runtime;
}

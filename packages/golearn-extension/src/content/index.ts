/**
 * Content script. Injected by the background worker only after a user gesture (action popup, context menu, keyboard
 * command), so `activeTab` is what grants access; it holds no host permission. It reads nothing until the learner makes
 * a lookup happen. Everything the page can see of it is one fixed-position shadow-DOM host while a card is open.
 */
import { bootStart } from '../boot';
import { sqAdapter } from '../../../../src/adapters/sq';
import { WebGenericAdapter, UnsupportedAdapter } from '../adapters';
import { createStorageMetricsStore } from '../metrics';
import { parseSelection } from '../parser';
import { MSG, getChrome, type ChromeApi, type LookupMessage } from '../platform';
import { createCardUI } from '../popup/card';
import { LOCAL_IDENTITY, createMemoryStorageArea, createStorageEncounterStore, getDeviceId, type Identity } from '../store';
import { LookupController } from './controller';

const GLOBAL_KEY = '__goLearnExtension';

interface InstalledMarker { controller: LookupController }

export async function install(chromeApi: ChromeApi | undefined = getChrome(), doc: Document = document): Promise<LookupController | undefined> {
  const w = globalThis as unknown as Record<string, InstalledMarker | undefined>;
  if (w[GLOBAL_KEY]) return w[GLOBAL_KEY]!.controller; // injected twice (a second gesture): reuse, do not stack listeners
  const area = chromeApi?.storage.local ?? createMemoryStorageArea();
  // the message listener below is registered synchronously; a lookup waits for the device id before it reads or writes
  const identity: Identity = { ...LOCAL_IDENTITY, deviceId: 'dev-pending' };
  const ready = getDeviceId(area).then((id) => { identity.deviceId = id; });

  const holder: { controller?: LookupController } = {};
  const ui = createCardUI({ doc, onDismiss: () => holder.controller?.onCardDismissed() });
  const controller = new LookupController({
    doc,
    adapters: [new WebGenericAdapter({ doc, segmentSentences: (t) => sqAdapter.segmentSentences(t) }), new UnsupportedAdapter()],
    parse: parseSelection,
    ui,
    store: createStorageEncounterStore(area),
    metrics: createStorageMetricsStore(area),
    identity,
    ready,
    version: chromeApi?.runtime.getManifest?.().version ?? '0.0.0',
    sessionId: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    moduleLoadMs: performance.now() - bootStart,
  });
  holder.controller = controller;
  w[GLOBAL_KEY] = { controller };

  chromeApi?.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const m = message as { type?: string } | undefined;
    switch (m?.type) {
      case MSG.enable: controller.enable(); sendResponse({ ok: true, enabled: true }); return;
      case MSG.disable: controller.disable(); sendResponse({ ok: true, enabled: false }); return;
      case MSG.ping: sendResponse({ ok: true, enabled: controller.isEnabled }); return;
      case MSG.lookup: {
        const req = m as LookupMessage;
        void controller.lookup({ trigger: req.trigger, selectionText: req.selectionText, focus: req.focus }).then(
          (o) => sendResponse({ ok: true, status: o.status }),
          () => sendResponse({ ok: false }),
        );
        return true; // async response
      }
      default: return;
    }
  });
  return controller;
}

if (typeof document !== 'undefined' && typeof (globalThis as { __GOLEARN_NO_AUTOINSTALL?: boolean }).__GOLEARN_NO_AUTOINSTALL === 'undefined') {
  void install().catch(() => { /* never an exception into the page */ });
}

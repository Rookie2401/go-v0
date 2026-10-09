/**
 * Content script. Injected by the background worker only after a user gesture (action popup, context menu, keyboard
 * command), so `activeTab` is what grants access; it holds no host permission. It reads nothing until the learner makes
 * a lookup happen. Everything the page can see of it is one fixed-position shadow-DOM host while a card is open.
 *
 * It is the UNPRIVILEGED side: no token, no learner id, no storage, no network call. Everything that needs the
 * Repository, the dictionary or a stored setting is a message to the background worker (services.ts).
 */
import { bootStart } from '../boot';
import { sqAdapter } from '../../../../src/adapters/sq';
import { WebGenericAdapter, UnsupportedAdapter } from '../adapters';
import { createMemoryMetricsStore } from '../metrics';
import { PARSER_LANGUAGES, parseSelection } from '../parser';
import { MSG, getContentChrome, type ContentChromeApi, type LookupMessage } from '../platform';
import { createCardUI } from '../popup/card';
import type { Pronouncer } from '../popup/view';
import { PENDING_IDENTITY, createMemoryEncounterStore, type Identity } from '../store';
import { LookupController } from './controller';
import { createBridge } from './services';
import { createDevicePronouncer } from './voice';

const GLOBAL_KEY = '__goLearnExtension';

interface InstalledMarker { controller: LookupController }

export async function install(chromeApi: ContentChromeApi | undefined = getContentChrome(), doc: Document = document): Promise<LookupController | undefined> {
  const w = globalThis as unknown as Record<string, InstalledMarker | undefined>;
  if (w[GLOBAL_KEY]) return w[GLOBAL_KEY]!.controller; // injected twice (a second gesture): reuse, do not stack listeners
  const bridge = chromeApi ? createBridge(chromeApi) : undefined;
  // events carry a placeholder identity; the background replaces it with the session's (or a local pseudonym)
  const identity: Identity = { ...PENDING_IDENTITY };

  // pronunciation: GoListen's device provider; whether a non-local browser voice may be used is the learner's setting, asked of the background
  let remoteConsent = false;
  const device = createDevicePronouncer({ speech: (globalThis as unknown as { speechSynthesis?: Parameters<typeof createDevicePronouncer>[0]['speech'] }).speechSynthesis ?? null, remoteConsent: () => remoteConsent });
  const pronouncer: Pronouncer = {
    ...device,
    availability: async (lang) => {
      const info = await bridge?.pronounceInfo(lang);
      remoteConsent = info?.remoteConsent === true;
      return device.availability(lang);
    },
  };

  const holder: { controller?: LookupController } = {};
  const ui = createCardUI({ doc, pronouncer, onDismiss: () => holder.controller?.onCardDismissed() });
  const fallbackEvents = bridge ? undefined : createMemoryEncounterStore();
  const controller = new LookupController({
    doc,
    adapters: [new WebGenericAdapter({ doc, segmentSentences: (t) => sqAdapter.segmentSentences(t) }), new UnsupportedAdapter()],
    parse: parseSelection,
    ui,
    store: bridge?.events ?? fallbackEvents!,
    metrics: bridge?.metrics ?? createMemoryMetricsStore(),
    services: bridge,
    analysers: [...PARSER_LANGUAGES],
    identity,
    version: chromeApi?.runtime.getManifest?.().version ?? '0.0.0',
    sessionId: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    moduleLoadMs: performance.now() - bootStart,
  });
  holder.controller = controller;
  w[GLOBAL_KEY] = { controller };

  chromeApi?.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // only this extension's own background may drive the content script
    if (sender?.id !== undefined && chromeApi.runtime.id !== undefined && sender.id !== chromeApi.runtime.id) return;
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

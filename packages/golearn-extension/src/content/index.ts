/**
 * Content script. Injected by the background worker after a user gesture (action popup, context menu, keyboard
 * command), so `activeTab` is what grants access; or, with GoLearn Active switched on (and the optional host permission
 * granted by the learner), registered to run when a page loads. Without Active it reads nothing until the learner makes
 * a lookup happen; with Active it reads the visible text of the page to underline the words the learner has met
 * (content/active.ts). Everything the page can see of it is one fixed-position shadow-DOM host while a card is open;
 * underlines are CSS custom highlights, never elements.
 *
 * It is the UNPRIVILEGED side: no token, no learner id, no storage, no network call. Everything that needs the
 * Repository, the dictionary or a stored setting is a message to the background worker (services.ts).
 */
import { bootStart } from '../boot';
import { createAnalyserLoader } from '../analysers/urlLoader';
import { createAdapters } from '../adapters';
import { resolveLanguage } from '../language/resolve';
import { createMemoryMetricsStore } from '../metrics';
import { PARSER_LANGUAGES, getAnalyser, hasAnalyser, parseSelection } from '../parser';
import { MSG, getContentChrome, type ContentChromeApi, type LookupMessage } from '../platform';
import { createCardUI } from '../popup/card';
import type { Pronouncer } from '../popup/view';
import type { ActivateMessage } from '../protocol';
import { PENDING_IDENTITY, createMemoryEncounterStore, type Identity } from '../store';
import { ActiveMode } from './active';
import { LookupController } from './controller';
import { createBridge } from './services';
import { createDevicePronouncer } from './voice';

const GLOBAL_KEY = '__goLearnExtension';

/** The sentence cutter of a loaded language (its own analyser's); a language that is not loaded is cut by the adapter's default. */
const segmenterOf = (languageId: string): ((t: string) => Array<{ start: number; end: number; text: string }>) | undefined => {
  const a = getAnalyser(languageId);
  return a ? (t) => a.segmentSentences(t) : undefined;
};

interface InstalledMarker { controller: LookupController; active: ActiveMode }

export async function install(chromeApi: ContentChromeApi | undefined = getContentChrome(), doc: Document = document): Promise<LookupController | undefined> {
  const w = globalThis as unknown as Record<string, InstalledMarker | undefined>;
  if (w[GLOBAL_KEY]) return w[GLOBAL_KEY]!.controller; // injected twice (a second gesture, or a gesture on a page Active already runs on): reuse, do not stack listeners
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
  const adapters = createAdapters(doc);
  const loadAnalyser = createAnalyserLoader(chromeApi);
  const controller = new LookupController({
    doc,
    adapters,
    // each language's own sentence cutter; a language without one (yet) is cut by the adapter's Intl.Segmenter default
    segmenterFor: segmenterOf,
    resolveLanguage,
    glossForms: (lemma, pos, languageId) => {
      const a = getAnalyser(languageId);
      if (!a || languageId === 'sq') return []; // the worker carries Albanian
      return [...new Set([a.normalize(lemma), ...(a.lemmaVariants?.(lemma, pos as Parameters<NonNullable<typeof a.lemmaVariants>>[1]) ?? []).map((v) => a.normalize(v))])].slice(0, 8);
    },
    loadAnalyser,
    hasAnalyser,
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
  // GoLearn Active: reads the page only when the background says the switch is on (below, or on `activate`)
  // its learner-model question goes through the scan's own message (device rows only, honoured only while the switch is on), not the card's
  const active = new ActiveMode({
    doc, controller, adapters, ui, adapterOf: getAnalyser, loadAnalyser,
    profile: bridge?.activeProfile ? (unitIds, languageId) => bridge.activeProfile!({ unitIds, languageId }) : undefined,
  });
  w[GLOBAL_KEY] = { controller, active };

  chromeApi?.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // only this extension's own background may drive the content script
    if (sender?.id !== undefined && chromeApi.runtime.id !== undefined && sender.id !== chromeApi.runtime.id) return;
    const m = message as { type?: string } | undefined;
    switch (m?.type) {
      case MSG.enable: controller.enable(); sendResponse({ ok: true, enabled: true }); return;
      case MSG.disable: controller.disable(); sendResponse({ ok: true, enabled: false }); return;
      case MSG.ping: { const s = active.state; sendResponse({ ok: true, enabled: controller.isEnabled, active: s.on, ...(s.on ? { activeState: s } : {}) }); return; }
      case MSG.lookup: {
        const req = m as LookupMessage;
        void controller.lookup({ trigger: req.trigger, selectionText: req.selectionText, focus: req.focus }).then(
          (o) => sendResponse({ ok: true, status: o.status }),
          () => sendResponse({ ok: false }),
        );
        return true; // async response
      }
      case MSG.activate: {
        const speak = (m as ActivateMessage).speak !== false;
        active.setSpeak(speak);
        void active.start({ speak }).then((s) => sendResponse({ ok: true, ...s }), () => sendResponse({ ok: false }));
        return true;
      }
      case MSG.deactivate: active.stop(); sendResponse({ ok: true }); return;
      default: return;
    }
  });

  // registered to run on page load (Active on): ask whether to start; injected on a gesture with Active off: the answer is no
  if (bridge?.active) {
    void bridge.active().then((r) => { if (r?.ok && r.settings.active) return active.start({ speak: r.settings.speakOnClick }); return undefined; }).catch(() => undefined);
  }
  return controller;
}

if (typeof document !== 'undefined' && typeof (globalThis as { __GOLEARN_NO_AUTOINSTALL?: boolean }).__GOLEARN_NO_AUTOINSTALL === 'undefined') {
  void install().catch(() => { /* never an exception into the page */ });
}

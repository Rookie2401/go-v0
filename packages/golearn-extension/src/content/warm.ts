/**
 * Keep-warm (2026-11-10). The browser stops the background worker about 30 s after its last message, and a worker that wakes must
 * re-open the device history before it can answer (seconds with a large one): most lookups in a long read were cold. While a page that
 * GoLearn is in use on is visible, one trivial message every KEEP_WARM_MS keeps it awake; a hidden tab never pings.
 *
 *  - runs while the document is visible AND (Active is on here OR a word was looked up here in the last KEEP_WARM_IDLE_MS);
 *  - pings at once whenever it (re)starts: a page load, a tab shown again, a first lookup are each a pre-warm;
 *  - stops for good when a send throws (the extension was reloaded and this script is orphaned) or the context is gone.
 */
export const KEEP_WARM_MS = 20_000;
export const KEEP_WARM_IDLE_MS = 120_000;

export interface KeepWarmDeps {
  doc: Document;
  /** One ping; false = the send threw (orphaned). */
  ping(): Promise<boolean>;
  activeOn(): boolean;
  alive?(): boolean;
  now?(): number;
}

export function createKeepWarm(d: KeepWarmDeps) {
  const now = d.now ?? Date.now;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dead = false;
  let busy = false;
  let lookedAt = -Infinity;
  const stop = (): void => { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } };
  const shouldRun = (): boolean => !dead && (d.alive?.() ?? true) && d.doc.visibilityState !== 'hidden' && (d.activeOn() || now() - lookedAt < KEEP_WARM_IDLE_MS);
  function send(): void {
    if (busy) return;
    busy = true;
    void d.ping().then((ok) => { if (!ok) { dead = true; stop(); } }, () => { dead = true; stop(); }).then(() => { busy = false; });
  }
  function tick(): void {
    timer = undefined;
    if (!shouldRun()) { if (dead || !(d.alive?.() ?? true)) dead = true; return; }
    send();
    timer = setTimeout(tick, KEEP_WARM_MS);
  }
  /** Re-decide: called when Active starts or stops, when a word was looked up, and when the tab is shown or hidden. */
  function refresh(): void {
    if (!shouldRun()) { if (!dead && !(d.alive?.() ?? true)) dead = true; stop(); return; }
    if (timer !== undefined) return;
    send();
    timer = setTimeout(tick, KEEP_WARM_MS);
  }
  const onVisibility = (): void => refresh();
  const view = d.doc.defaultView;
  const onHide = (): void => stop(); // one timer per page, cleared on pagehide; a page restored from the back-forward cache starts it again (pageshow)
  d.doc.addEventListener('visibilitychange', onVisibility);
  view?.addEventListener('pagehide', onHide);
  view?.addEventListener('pageshow', onVisibility);
  return {
    refresh,
    /** A word was looked up here: the page keeps the worker warm for KEEP_WARM_IDLE_MS more, even with Active off. */
    noteLookup(): void { lookedAt = now(); refresh(); },
    dispose(): void { stop(); d.doc.removeEventListener('visibilitychange', onVisibility); view?.removeEventListener('pagehide', onHide); view?.removeEventListener('pageshow', onVisibility); },
  };
}

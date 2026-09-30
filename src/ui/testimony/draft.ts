/**
 * DraftController — autosave for the testimony editor, one per (learner, language).
 *
 * The promise to the learner is that text they have typed is not lost. How it is kept:
 *
 *  1. WRITE-THROUGH COPY. The moment an edit makes the text differ from what is stored, the text is also written
 *     synchronously to a small localStorage copy (keyed by learner + language). A crash, a closed tab or a failed
 *     IndexedDB write cannot take it: on the next load the copy is offered for recovery. It is removed only after
 *     a successful save that is at least as recent.
 *  2. DEBOUNCED SAVE. ~800 ms after the last keystroke the text is saved through `gotell.saveDraft`. Saves are
 *     serialised; an edit made while a save is in flight is saved by the next one.
 *  3. EARLY FLUSH. The hook flushes on blur, on `visibilitychange` (hidden), on `pagehide`, on route change
 *     (unmount) and on learner / language switch (a new controller replaces the old; the old one is disposed,
 *     which starts its final save).
 *  4. FAILURE IS VISIBLE. A failed save never clears the text: the status line says it was not saved, the copy
 *     stays, and saving is retried on the next edit and on a timer.
 *  5. NO SILENT OVERWRITE. A save carries the `seq` it was based on. If another window saved a newer draft
 *     (`DraftConflict`) and its text differs, nothing is overwritten: the learner chooses.
 *
 * Drafts are never evidence and never versions; "Save this version" is a separate, explicit action.
 */
import type { GoTell, LanguageCode, TestimonyDraft } from '../../core';

export const draftTiming = { debounceMs: 800, retryMs: 5000 };

export type DraftApi = Pick<GoTell, 'getDraft' | 'saveDraft'>;

export interface DraftStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** localStorage, every access guarded: a blocked or full storage just means there is no copy. */
export const browserDraftStorage: DraftStorage = {
  get(key) { try { return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null; } catch { return null; } },
  set(key, value) { try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value); } catch { /* no copy */ } },
  remove(key) { try { if (typeof localStorage !== 'undefined') localStorage.removeItem(key); } catch { /* ignore */ } },
};

export interface DraftOwner { userId: string; lang: LanguageCode }
export interface FallbackCopy { text: string; savedAt: string; seq: number }

export const fallbackKey = (o: DraftOwner) => `go-v0:draft-copy:${o.userId}:${o.lang}`;

export type DraftStatus =
  | { kind: 'loading' }
  | { kind: 'clean'; savedAt?: string }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: string }
  | { kind: 'failed'; message: string }
  | { kind: 'conflict'; newer: TestimonyDraft };

export const isDraftConflict = (e: unknown) => e instanceof Error && e.name === 'DraftConflict';

export class DraftController {
  text = '';
  status: DraftStatus = { kind: 'loading' };
  /** A copy found on load that differs from the stored draft: offered to the learner, never applied silently. */
  recovery: FallbackCopy | null = null;
  loaded = false;

  private seq = 0;
  private basedOn: string | undefined;
  private lastSavedText = '';
  private dirty = false;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly api: DraftApi,
    readonly owner: DraftOwner,
    private readonly storage: DraftStorage,
    private readonly notify: () => void,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  private emit() { if (!this.disposed) this.notify(); }
  private set(status: DraftStatus) { this.status = status; this.emit(); }

  private readCopy(): FallbackCopy | null {
    const raw = this.storage.get(fallbackKey(this.owner));
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as Partial<FallbackCopy>;
      return typeof v.text === 'string' ? { text: v.text, savedAt: typeof v.savedAt === 'string' ? v.savedAt : '', seq: typeof v.seq === 'number' ? v.seq : 0 } : null;
    } catch { return null; }
  }
  private writeCopy() {
    this.storage.set(fallbackKey(this.owner), JSON.stringify({ text: this.text, savedAt: this.now(), seq: this.seq } satisfies FallbackCopy));
  }
  private clearCopy() { this.storage.remove(fallbackKey(this.owner)); }

  /** Read the stored draft for this learner + language; offer any leftover local copy for recovery. */
  async load(): Promise<void> {
    let stored: TestimonyDraft | undefined;
    let loadError: string | null = null;
    try { stored = await this.api.getDraft(this.owner.userId, this.owner.lang); }
    catch (e) { loadError = e instanceof Error ? e.message : String(e); }
    if (this.disposed) return;
    this.text = stored?.text ?? '';
    this.lastSavedText = this.text;
    this.seq = stored?.seq ?? 0;
    this.basedOn = stored?.basedOnRevisionId;
    const copy = this.readCopy();
    if (copy && (copy.text === this.text || copy.text.trim() === '')) { this.clearCopy(); this.recovery = null; }
    else this.recovery = copy;
    this.loaded = true;
    this.status = loadError
      ? { kind: 'failed', message: `Could not read your saved draft (${loadError}). What you type here is kept on this page and on this device.` }
      : { kind: 'clean', savedAt: stored?.updatedAt };
    this.emit();
  }

  /** The learner typed. */
  setText(text: string) {
    if (!this.loaded) return;
    this.text = text;
    if (text === this.lastSavedText) { this.dirty = false; this.clearCopy(); this.clearTimers(); this.set({ kind: 'clean' }); return; }
    this.dirty = true;
    this.writeCopy(); // write-through: survives a crash before the save below completes
    if (this.status.kind !== 'conflict') this.set({ kind: 'dirty' });
    if (this.timer) clearTimeout(this.timer);
    if (this.status.kind !== 'conflict') this.timer = setTimeout(() => { void this.flush(); }, draftTiming.debounceMs);
  }

  private clearTimers() {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    if (this.retry) { clearTimeout(this.retry); this.retry = undefined; }
  }

  /** Save now (blur, hidden, route change, "Save this version"). Resolves when the save (and any queued one) is done. */
  flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    this.chain = this.chain.then(() => this.saveOnce(false));
    return this.chain;
  }

  private async saveOnce(force: boolean, retried = false): Promise<void> {
    if (!this.dirty || !this.loaded) return;
    if (this.status.kind === 'conflict' && !force) return;
    const snapshot = this.text;
    const startedAt = this.now();
    this.set({ kind: 'saving' });
    try {
      const saved = await this.api.saveDraft(this.owner.userId, this.owner.lang, snapshot, {
        expectedSeq: force ? undefined : this.seq, // 0 = "there was no draft when I loaded": another window creating one is a conflict too
        basedOnRevisionId: this.basedOn,
      });
      this.seq = saved.seq;
      this.basedOn = saved.basedOnRevisionId ?? this.basedOn;
      this.lastSavedText = snapshot;
      const copy = this.readCopy();
      if (this.text === snapshot) {
        this.dirty = false;
        if (copy) this.clearCopy(); // superseded by a successful save of the same text
        this.set({ kind: 'saved', at: saved.updatedAt ?? startedAt });
      } else {
        // edited again while saving: the copy now holds the newer text and the next save will persist it
        this.set({ kind: 'dirty' });
        this.timer = setTimeout(() => { void this.flush(); }, draftTiming.debounceMs);
      }
    } catch (e) {
      if (isDraftConflict(e)) { await this.onConflict(snapshot, retried); return; }
      this.set({ kind: 'failed', message: e instanceof Error ? e.message : String(e) });
      this.writeCopy();
      this.scheduleRetry();
    }
  }

  private scheduleRetry() {
    if (this.retry || this.disposed) return;
    this.retry = setTimeout(() => { this.retry = undefined; void this.flush(); }, draftTiming.retryMs);
  }

  private async onConflict(snapshot: string, retried: boolean) {
    let latest: TestimonyDraft | undefined;
    let readFailed = false;
    try { latest = await this.api.getDraft(this.owner.userId, this.owner.lang); } catch { readFailed = true; }
    if (readFailed) { this.set({ kind: 'failed', message: 'The draft changed elsewhere and could not be read again.' }); this.writeCopy(); this.scheduleRetry(); return; }
    if (!latest) {
      // The other window cleared the draft: there is no writing to protect, so this page's text simply becomes the draft.
      if (!retried) { this.seq = 0; await this.saveOnce(true, true); return; }
      this.set({ kind: 'failed', message: 'The draft changed elsewhere and could not be saved over.' }); this.writeCopy(); this.scheduleRetry(); return;
    }
    if (!retried && (latest.text === snapshot || latest.text === this.lastSavedText)) {
      // Same words, only its bookkeeping moved on (another tab saved the same text, or a version was saved from it):
      // adopt its sequence number and save again.
      this.seq = latest.seq;
      this.basedOn = latest.basedOnRevisionId ?? this.basedOn;
      if (latest.text === snapshot) {
        this.lastSavedText = snapshot;
        if (this.text === snapshot) { this.dirty = false; this.clearCopy(); this.set({ kind: 'saved', at: latest.updatedAt }); return; }
      }
      await this.saveOnce(false, true);
      return;
    }
    this.writeCopy();
    this.set({ kind: 'conflict', newer: latest });
  }

  /** After a conflict: take the newer draft from the other window. The local text is replaced. */
  useNewer() {
    if (this.status.kind !== 'conflict') return;
    const newer = this.status.newer;
    this.adopt(newer);
  }

  /** After a conflict: keep what is on this page and overwrite the other window's draft. */
  async keepMine(): Promise<void> {
    if (this.status.kind !== 'conflict') return;
    this.chain = this.chain.then(() => this.saveOnce(true));
    await this.chain;
  }

  /** Replace the working text with a stored draft (restore a version, use the newer draft). Nothing is saved by this call. */
  adopt(draft: TestimonyDraft) {
    this.clearTimers();
    this.text = draft.text;
    this.seq = draft.seq;
    this.basedOn = draft.basedOnRevisionId;
    this.lastSavedText = draft.text;
    this.dirty = false;
    this.clearCopy();
    this.recovery = null;
    this.set({ kind: 'saved', at: draft.updatedAt });
  }

  /** Put recovered text back in the editor and save it (the learner chose "Restore it"). */
  acceptRecovery() {
    if (!this.recovery) return;
    const text = this.recovery.text;
    this.recovery = null;
    this.lastSavedText = this.text; // the stored draft is what is currently saved
    this.setText(text);
    this.emit();
  }

  /** The learner declined the recovered copy. */
  discardRecovery() {
    this.recovery = null;
    if (!this.dirty) this.clearCopy();
    this.emit();
  }

  /** Re-read seq / basedOn after something else touched the draft row (GoTell sets basedOnRevisionId on save-version). */
  async resync(): Promise<void> {
    try {
      const latest = await this.api.getDraft(this.owner.userId, this.owner.lang);
      if (!latest || this.disposed) return;
      this.seq = Math.max(this.seq, latest.seq);
      this.basedOn = latest.basedOnRevisionId ?? this.basedOn;
      if (latest.text === this.text) this.lastSavedText = latest.text;
    } catch { /* the next save will sort it out (conflict handling adopts the sequence) */ }
  }

  /**
   * Leaving (route change, learner or language switch, unmount). Synchronous: the local copy is already current; the
   * final save starts now and keeps running after the screen is gone.
   */
  dispose() {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    if (this.dirty && this.loaded) {
      this.writeCopy();
      void this.flush();
    }
    this.disposed = true;
    if (this.retry) { clearTimeout(this.retry); this.retry = undefined; }
  }
}

/** "Saved 12:03" / "Saving…" / the failure wording, for the status line. */
export function statusText(status: DraftStatus): string {
  const time = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  switch (status.kind) {
    case 'loading': return 'Loading your draft…';
    case 'clean': return status.savedAt ? `Saved ${time(status.savedAt)}` : 'Your writing is saved automatically as you type.';
    case 'dirty':
    case 'saving': return 'Saving…';
    case 'saved': return `Saved ${time(status.at)}`;
    case 'failed': return 'Not saved — storage failed. Your text is kept on this page; copy it to be safe.';
    case 'conflict': return 'Not saved — a newer draft was saved in another window. Choose which to keep.';
  }
}

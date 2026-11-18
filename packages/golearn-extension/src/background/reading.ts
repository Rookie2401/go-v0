/**
 * Reading Analysis, the privileged half: what the learner knows of the words of a text, read from the device's own Repository after it has
 * been brought level with the account. See ../reading/protocol.ts for the messages and ../reading/classify.ts for the rule.
 *
 * Read-only towards the learner's history: nothing here appends an event, changes a level, a mark or a schedule. The one thing it may do
 * to the device's Repository is what a sign-in does: pull the learner's own events that other devices recorded.
 *
 * Completeness is established, never assumed:
 *   - `snapshot` says whether the device holds the account's whole history NOW (a pull that reached the account's head, with nothing refused),
 *     or that it could not be checked and since when the device's record is known to be whole;
 *   - `classify` asks the Repository about EVERY unit id of the batch (in requests of at most KNOWLEDGE_CHUNK, each of which must be answered)
 *     and checks every row it gets back: the id was asked for, it is the device learner's, it is in the language asked about, and no id comes
 *     back twice. Any failure refuses the whole batch: a part of an answer is never used. `asked` and `answered` are returned so the page can
 *     show that they are equal;
 *   - every batch names the snapshot it belongs to; a Repository that took in an event since is answered with `snapshot-changed`, and the
 *     page starts the batches again, so one figure never mixes two states of the learner's knowledge.
 *
 * Who may ask: an extension page grants one tab for GRANT_MS (the popup, inside the learner's own press). A content script without a grant
 * for its tab is refused. So a page cannot make its content script ask about words the learner did not ask to have analysed.
 */
import type { UnitKnowledge } from '../../../repository-contract/src';
import { canonicalVarietyId, hasLearningVarieties } from '../../../repository-contract/src/varieties';
import type { StorageArea } from '../platform';
import { isLanguageId, isUnitId, type SyncView } from '../protocol';
import { classifyWord } from '../reading/classify';
import { GRANT_MS, MAX_READINGS, MAX_WORDS_PER_MESSAGE, type KnowledgeSnapshot, type ReadingKnowledgeReply, type WireWord } from '../reading/protocol';
import type { CatchUp, LocalRepoService } from './localRepo';
import type { SessionManager } from './session';

export const GRANT_PREFIX = 'golearn:reading-grant:';
/** How long an analysis waits for the account before it reports the device's own record as unverified. */
export const VERIFY_TIMEOUT_MS = 20_000;

export interface ReadingServiceOptions {
  local: Pick<LocalRepoService, 'open' | 'catchUp' | 'knowledgeRows' | 'generation'>;
  session: Pick<SessionManager, 'status'>;
  sync: { status(): Promise<SyncView>; needsSignIn(): Promise<boolean> };
  /** Where grants are kept (`chrome.storage.session` when it exists: cleared with the browser, unreadable by a content script). */
  area: StorageArea;
  now: () => number;
  online?: () => boolean;
  verifyTimeoutMs?: number;
}

const bad = (error: Extract<ReadingKnowledgeReply, { ok: false }>['error'], message?: string): ReadingKnowledgeReply => ({ ok: false, error, ...(message ? { message } : {}) });

const languageOfUnit = (id: string): string => id.split(':', 3)[1] ?? '';

export function createReadingService(o: ReadingServiceOptions) {
  const timeout = o.verifyTimeoutMs ?? VERIFY_TIMEOUT_MS;

  async function grant(tabId: unknown): Promise<ReadingKnowledgeReply> {
    if (typeof tabId !== 'number' || !Number.isInteger(tabId) || tabId < 0) return bad('invalid');
    await o.area.set({ [GRANT_PREFIX + tabId]: o.now() + GRANT_MS });
    return { ok: true, op: 'grant' };
  }

  async function granted(tabId: number | undefined): Promise<boolean> {
    if (tabId === undefined) return false;
    try {
      const until = (await o.area.get(GRANT_PREFIX + tabId))[GRANT_PREFIX + tabId];
      return typeof until === 'number' && until > o.now();
    } catch { return false; }
  }

  async function unsent(): Promise<number> {
    try { const s = await o.sync.status(); return (s.pending || 0) + (s.localOnly || 0) + (s.rejected || 0); } catch { return 0; }
  }

  function fromCatchUp(c: CatchUp, id: string, waiting: number): KnowledgeSnapshot {
    if (c.state === 'no-account') return { id, authority: 'device', state: 'verified', verifiedAt: o.now(), unsent: waiting };
    if (c.state === 'level') {
      // level with the account, but the device's one record also holds another account's history: the figure is not this account's alone
      if (c.mixedAccounts) return { id, authority: 'account', state: 'unverified', reason: 'mixed-accounts', lastVerifiedAt: c.at, added: c.added, unsent: waiting };
      return { id, authority: 'account', state: 'verified', verifiedAt: c.at, added: c.added, unsent: waiting };
    }
    const reason: KnowledgeSnapshot['reason'] = c.mixedAccounts ? 'mixed-accounts' : c.reason === 'unavailable' ? 'unreachable' : c.reason;
    return { id, authority: 'account', state: 'unverified', reason, ...(c.lastLevelAt !== undefined ? { lastVerifiedAt: c.lastLevelAt } : {}), added: c.added, unsent: waiting };
  }

  /** Brings the device level with the account (when there is one) and says what the knowledge about to be read can be taken for. */
  async function snapshot(): Promise<ReadingKnowledgeReply> {
    const repo = await o.local.open();
    if (!repo) return bad('repository-unavailable', 'The on-device Repository would not open.');
    const s = await o.session.status();
    const waiting = await unsent();
    if (!s.connected) return { ok: true, op: 'snapshot', snapshot: { id: o.local.generation(), authority: 'device', state: 'verified', verifiedAt: o.now(), unsent: waiting } };
    if (s.expired || await o.sync.needsSignIn()) {
      return { ok: true, op: 'snapshot', snapshot: { id: o.local.generation(), authority: 'account', state: 'unverified', reason: 'needs-sign-in', unsent: waiting } };
    }
    if (o.online && !o.online()) {
      return { ok: true, op: 'snapshot', snapshot: { id: o.local.generation(), authority: 'account', state: 'unverified', reason: 'offline', unsent: waiting } };
    }
    const c = await o.local.catchUp({ timeoutMs: timeout });
    // the id is read AFTER the pull: what it brought in is part of the state the batches will be checked against
    return { ok: true, op: 'snapshot', snapshot: fromCatchUp(c, o.local.generation(), await unsent()) };
  }

  function validWords(raw: unknown, languageId: string): WireWord[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const out: WireWord[] = [];
    for (const w of raw) {
      if (!Array.isArray(w) || w.length < 1 || w.length > 1 + MAX_READINGS) return undefined;
      if (!w.every((id) => isUnitId(id) && languageOfUnit(id) === languageId)) return undefined; // a word of another language is never merged into this one's figure
      if (!(w[0] as string).startsWith('form:') || !w.slice(1).every((id) => (id as string).startsWith('lemma:'))) return undefined;
      out.push(w as unknown as WireWord);
    }
    return out;
  }

  /** Checks the rows a lookup returned against what was asked: any row that should not be there refuses the batch. */
  function accept(rows: readonly UnitKnowledge[], asked: ReadonlySet<string>, learnerId: string, languageId: string): Map<string, UnitKnowledge> | string {
    const by = new Map<string, UnitKnowledge>();
    for (const row of rows) {
      if (!row || typeof row.unitId !== 'string') return 'a row with no unit id';
      if (!asked.has(row.unitId)) return 'a row that was not asked for';
      if (by.has(row.unitId)) return 'the same unit twice';
      if (row.learnerId !== learnerId) return 'a row of another learner';
      if (row.languageId !== languageId) return 'a row of another language';
      by.set(row.unitId, row);
    }
    return by;
  }

  async function classify(m: Record<string, unknown>): Promise<ReadingKnowledgeReply> {
    const languageId = m.languageId;
    if (!isLanguageId(languageId)) return bad('invalid', 'not a language');
    const variety = hasLearningVarieties(languageId) ? canonicalVarietyId(languageId, m.varietyId) : undefined;
    if (hasLearningVarieties(languageId) && !variety) return bad('invalid', 'this language needs the variety of the text');
    if (typeof m.snapshot !== 'string' || !m.snapshot) return bad('invalid', 'no snapshot');
    if (Array.isArray(m.words) && m.words.length > MAX_WORDS_PER_MESSAGE) return bad('too-many', `at most ${MAX_WORDS_PER_MESSAGE} words to a message`);
    const words = validWords(m.words, languageId);
    if (!words) return bad('invalid', 'not a list of words of this language');
    if (m.snapshot !== o.local.generation()) return bad('snapshot-changed');

    const ids = [...new Set(words.flat())];
    const got = await o.local.knowledgeRows(ids);
    if (!got.ok) return bad(got.error === 'unavailable' ? 'repository-unavailable' : 'lookup-failed');
    // an event recorded while the rows were being read: this batch may straddle two states
    if (got.generation !== m.snapshot || o.local.generation() !== m.snapshot) return bad('snapshot-changed');
    const rows = accept(got.rows, new Set(ids), got.learnerId, languageId);
    if (typeof rows === 'string') return bad('lookup-failed', rows);
    const verdicts = words.map((w) => classifyWord(w, (id) => rows.get(id), languageId, variety));
    return { ok: true, op: 'classify', snapshot: m.snapshot, verdicts, asked: ids.length, answered: ids.length };
  }

  /** `kind`: who sent the message; `tabId`: the tab of a content script. */
  async function handle(m: Record<string, unknown>, kind: 'page' | 'content', tabId: number | undefined): Promise<ReadingKnowledgeReply> {
    try {
      if (m.op === 'grant') return kind === 'page' ? await grant(m.tabId) : bad('not-granted');
      if (kind === 'content' && !(await granted(tabId))) return bad('not-granted');
      if (m.op === 'snapshot') return await snapshot();
      if (m.op === 'classify') return await classify(m);
      return bad('invalid', 'unknown operation');
    } catch (e) {
      return bad('lookup-failed', e instanceof Error ? e.message : undefined);
    }
  }

  return { handle, snapshot, classify, grant, granted };
}

export type ReadingService = ReturnType<typeof createReadingService>;

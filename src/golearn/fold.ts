/**
 * Event folding — events are the ONLY write path into learner state. Policy `evidence@6`.
 *
 *  SITTINGS: every evidence event is assigned a sitting derived from event TIME per learner (sitting.ts), never from the
 *  UI's `session` string. Within one sitting there is at most ONE encounter per (user, item, sentence, modality), whatever
 *  session ids the UI sent (reload, route revisit, scroll in/out, rerender). Help and reports are scoped to the sitting.
 *  Encounters are pinned to the content version: the event's `contentVersion`, else the sentence's `versionAdded`.
 *
 *  SentenceViewed        → reading EXPOSURE encounters: one per word *form*, per credited *lemma*, per phrase and per
 *                          pattern in the sentence, plus one per writing-system (`orth`) item of its words when the language can
 *                          decode (deduped by ids.encounter, slot = sitting; a writing-system item has no row, only its aggregate). Item state is NOT recomputed: each
 *                          touched item's aggregate is updated (agg.ts) and the folds read only the items and encounter rows of ONE sentence. Emits PhraseEncountered. A
 *                          view alone is never comprehension: the encounter is `exposure`, weight 0.
 *  TokenHelpOpened …     → never create encounters. They raise the assistance of the existing reading encounters of the
 *                          same sentence + sitting (or are remembered for a view that arrives later): the encounter
 *                          becomes `assisted`. Token / phrase / grammar help is scoped to the items it explains (ITEM-TARGETED:
 *                          kept in `Encounter.itemHelp`, it vetoes the estimate); sentence explanation and English rescue apply
 *                          to the whole sentence (SENTENCE-LEVEL: assisted, never an estimate veto). See policy.ts.
 *  DecodingRevealed      → item-targeted help (level 1) for the word's form and for each writing-system item of its decoding; like
 *                          any help it never creates encounters. `romanization: true` is also kept on those encounters (`romanized`).
 *  NoteOpened            → context, no effect on evidence (not folded).
 *  ComprehensionReported → degree 'all': the sentence's items become `demonstrated` (evidence) unless help was used on
 *                          that item in that sitting (then they stay `assisted`). A report for a sentence the learner
 *                          never dwelt on still demonstrates its items (rule 3) — it materialises the reading
 *                          encounters — but it is NOT a view: `readingProgress.sentencesSeen` counts only real
 *                          `SentenceViewed` events. Listening reports only upgrade listening encounters that real,
 *                          reviewed speech produced. Degrees 'most' | 'some' | 'little' are NOT item evidence
 *                          (readingProgress / recommendations read them from the log). Reports never downgrade.
 *  AudioSegmentCompleted → listening encounters for the segment's sentences IF the audio is reviewed real speech (rule 5,
 *                          eligibility.ts); touches ONLY `listening`. Transcript / translation shown ⇒ `assisted`.
 *  ProductionRecorded    → writing / speaking `production` encounter; touches ONLY `writing` / `speaking`. Evidence for an
 *                          (item, sentenceHash, modality) is recorded ONCE, ever (first one wins).
 *  ItemMarked            → manualMark only (a `known` mark is an explicit demonstration of that item).
 * Everything else (TextViewed, TextCompleted, plays, seeks, suggestions shown …) is not item evidence and is ignored here.
 *
 * The per-sitting memo of help / reports is hydrated from the event log the first time a (user, sitting) is touched, so a
 * restart, a late view and `rebuild` all reach the same encounters.
 */
import type { AssistanceLevel, DomainEvent, EventInput, EvidenceKind, LanguageCode, Modality, PhraseEncountered, PhraseOccurrence } from '../core';
import { hash, ids } from '../core';
import { K_PRODUCTION, addProduction, addReceptive, entryOf, kindCode } from './agg';
import type { Entry, StoredItem } from './agg';
import { AnalysisCache } from './analysis';
import { ItemBook } from './book';
import { listenVerdict } from './eligibility';
import { sentenceItems } from './items';
import { OrthCache, isOrthId } from './orth';
import { LISTEN_ASSISTANCE, PRODUCTION_ASSISTANCE } from './policy';
import { SittingIndex, byAtId } from './sitting';
import type { Ctx, StoredEncounter } from './state';
import { buildEncounter, encounterIdOf } from './state';
import { insertEvent, textsOfEvent } from './userlog';
import type { UserLog } from './userlog';

type ReceptiveModality = 'reading' | 'listening';

interface SentenceMemo {
  all: AssistanceLevel;
  items: Map<string, AssistanceLevel>;
  /** modalities for which the learner reported understanding ALL of this sentence in this sitting */
  demo: Set<ReceptiveModality>;
  /** items for which the romanization rescue was used in this sentence + sitting */
  roman: Set<string>;
}
interface SittingMemo { hydrated: boolean; sentences: Map<string, SentenceMemo> }
/** One learner's time-derived sittings plus the help / report events of each (the memo's raw material). */
interface UserSittings { index: SittingIndex; log: UserLog; memoEvents: Map<string, DomainEvent[]>; memoIds: Set<string>; lastAtByLang: Map<LanguageCode, string> }
type Emission = EventInput<PhraseEncountered>;

/** Events that change learner state (what `attach()` subscribes to and what `rebuild` replays). Also the events that make up a sitting. */
export const FOLD_TYPES = [
  'SentenceViewed', 'TokenHelpOpened', 'PhraseHelpOpened', 'GrammarHelpOpened', 'SentenceExplanationRevealed',
  'EnglishRescueRevealed', 'ComprehensionReported', 'ItemMarked', 'AudioSegmentCompleted', 'ProductionRecorded', 'DecodingRevealed',
] as const satisfies readonly DomainEvent['type'][];
export const FOLD_TYPE_SET: ReadonlySet<string> = new Set(FOLD_TYPES);

const MEMO_TYPES: ReadonlySet<string> = new Set([
  'TokenHelpOpened', 'PhraseHelpOpened', 'GrammarHelpOpened', 'SentenceExplanationRevealed', 'EnglishRescueRevealed',
  'ComprehensionReported', 'DecodingRevealed',
]);

const max = (a: AssistanceLevel, b: AssistanceLevel): AssistanceLevel => (a >= b ? a : b);

export class Folder {
  /** userId → sitting key → memo */
  private readonly memos = new Map<string, Map<string, SittingMemo>>();
  private readonly users = new Map<string, UserSittings>();
  /** PhraseEncountered events a fold wants to emit. The caller emits them AFTER the fold left the queue (a subscriber may read GoLearn). */
  private outbox: Emission[] = [];
  /** Decodings of word forms, cached for one live fold or one rebuild (see orth.ts). */
  private readonly orth = new OrthCache();

  constructor(private readonly ctx: Ctx) {}

  clearUser(userId: string) {
    this.memos.delete(userId);
    this.users.delete(userId);
    this.orth.clear();
  }

  // ───────────────────────── sittings ─────────────────────────

  /** The learner's sittings, built once from the log (identical to what live folding derives event by event). */
  private async userSittings(userId: string): Promise<UserSittings> {
    let u = this.users.get(userId);
    if (u) return u;
    const index = new SittingIndex();
    u = { index, log: { events: [], sittings: index, byText: new Map() }, memoEvents: new Map(), memoIds: new Set(), lastAtByLang: new Map() };
    this.users.set(userId, u);
    const history = (await this.ctx.bus.history({ userId, types: [...FOLD_TYPES] })).sort(byAtId);
    for (const e of history) this.note(u, e);
    return u;
  }

  private note(u: UserSittings, e: DomainEvent): string {
    const fresh = u.index.get(e.id) === undefined;
    const sitting = u.index.add(e);
    if (fresh) {
      insertEvent(u.log.events, e);
      for (const t of textsOfEvent(e)) {
        let l = u.log.byText.get(t);
        if (!l) u.log.byText.set(t, (l = []));
        insertEvent(l, e);
      }
    }
    const last = u.lastAtByLang.get(e.lang);
    if (last === undefined || e.at > last) u.lastAtByLang.set(e.lang, e.at);
    if (MEMO_TYPES.has(e.type) && !u.memoIds.has(e.id)) {
      u.memoIds.add(e.id);
      let l = u.memoEvents.get(sitting);
      if (!l) u.memoEvents.set(sitting, (l = []));
      l.push(e);
    }
    return sitting;
  }

  /**
   * `at` of the latest evidence event of this learner IN THIS LANGUAGE in the folded history (the coverage `asOf`: item state is
   * per language, so another language's events cannot change a text's coverage). Never waits on the queue.
   */
  async lastEvidenceAt(userId: string, lang: LanguageCode): Promise<string | undefined> {
    return (await this.userSittings(userId)).lastAtByLang.get(lang);
  }

  /** The learner's evidence events, in memory and indexed by text (see userlog.ts). Never waits on the queue. */
  async userLog(userId: string): Promise<UserLog> {
    return (await this.userSittings(userId)).log;
  }

  /** Events the folds asked to emit (drained by the caller once its queue entry is over). */
  takeOutbox(): Emission[] {
    const out = this.outbox;
    this.outbox = [];
    return out;
  }

  /** The sitting key of an event (the ISO time of the first event of its sitting). */
  private async sittingOf(e: DomainEvent): Promise<string> {
    return this.note(await this.userSittings(e.userId), e);
  }

  // ───────────────────────── sitting memo ─────────────────────────

  private sittingMemo(userId: string, sitting: string): SittingMemo {
    let byUser = this.memos.get(userId);
    if (!byUser) this.memos.set(userId, (byUser = new Map()));
    let m = byUser.get(sitting);
    if (!m) { m = { hydrated: false, sentences: new Map() }; byUser.set(sitting, m); }
    return m;
  }

  private memo(userId: string, sitting: string, sentenceId: string): SentenceMemo {
    const s = this.sittingMemo(userId, sitting);
    let m = s.sentences.get(sentenceId);
    if (!m) { m = { all: 0, items: new Map(), demo: new Set(), roman: new Set() }; s.sentences.set(sentenceId, m); }
    return m;
  }

  /** Load this (user, sitting)'s help and reports from the log once; afterwards events keep the memo current. */
  private async hydrate(userId: string, sitting: string): Promise<void> {
    const s = this.sittingMemo(userId, sitting);
    if (s.hydrated) return;
    s.hydrated = true;
    const events = [...((await this.userSittings(userId)).memoEvents.get(sitting) ?? [])].sort(byAtId);
    for (const e of events) await this.record(e, sitting);
  }

  /** Idempotently remember a help / report event of a sitting; returns the sentence ids it concerns. */
  private async record(e: DomainEvent, sitting: string): Promise<string[]> {
    const { store } = this.ctx;
    const raise = (sentenceId: string, level: AssistanceLevel, itemIds: string[] | 'all') => {
      const m = this.memo(e.userId, sitting, sentenceId);
      if (itemIds === 'all') m.all = max(m.all, level);
      else for (const i of itemIds) m.items.set(i, max(m.items.get(i) ?? 0, level));
    };
    switch (e.type) {
      case 'TokenHelpOpened': {
        const items = new Set<string>([e.itemId, ...(await this.tokenItems(e.tokenId))]);
        raise(e.sentenceId, e.level, [...items]);
        return [e.sentenceId];
      }
      case 'PhraseHelpOpened': {
        const occ = (await store.phraseOccurrences.where('sentenceId', e.sentenceId)).find((o) => o.id === e.phraseOccurrenceId);
        const items = new Set<string>([e.phraseId]);
        for (const t of occ?.tokenIds ?? []) for (const i of await this.tokenItems(t)) items.add(i);
        raise(e.sentenceId, 2, [...items]);
        return [e.sentenceId];
      }
      case 'GrammarHelpOpened': {
        const items = new Set<string>([e.patternId]);
        for (const t of e.tokenIds) for (const i of await this.tokenItems(t)) items.add(i);
        raise(e.sentenceId, 3, [...items]);
        return [e.sentenceId];
      }
      case 'DecodingRevealed': {
        const items = [e.itemId, ...e.features.map((f) => ids.orth(e.lang, f))];
        raise(e.sentenceId, 1, items);
        if (e.romanization) for (const i of items) this.memo(e.userId, sitting, e.sentenceId).roman.add(i);
        return [e.sentenceId];
      }
      case 'SentenceExplanationRevealed':
        raise(e.sentenceId, 4, 'all');
        return [e.sentenceId];
      case 'EnglishRescueRevealed':
        for (const sid of e.sentenceIds) raise(sid, 5, 'all');
        return [...e.sentenceIds];
      case 'ComprehensionReported':
        if (e.degree === 'all') for (const sid of e.sentenceIds) this.memo(e.userId, sitting, sid).demo.add(e.modality);
        return [...e.sentenceIds];
      default:
        return [];
    }
  }

  /** All help on one item in this (sentence, sitting): item-targeted (1–3) and sentence-level (4–5), whichever is higher. */
  private helpOf(m: SentenceMemo, itemId: string): AssistanceLevel {
    return max(m.all, m.items.get(itemId) ?? 0);
  }

  /** Only the help that was ABOUT this item (word / phrase / grammar). Sentence-level help is not in it. */
  private itemHelpOfMemo(m: SentenceMemo, itemId: string): AssistanceLevel {
    return m.items.get(itemId) ?? 0;
  }

  // ───────────────────────── dispatch ─────────────────────────

  async fold(event: DomainEvent, replay = false): Promise<void> {
    // Every folded evidence event extends its learner's sitting index and `lastAt`, whether or not it changes an item
    // (a 'most' report, a fixture play): live folding then derives exactly what a rebuild from the log derives.
    if (FOLD_TYPE_SET.has(event.type)) await this.sittingOf(event);
    if (!replay) this.orth.clear(); // decodings are cached per live fold; a rebuild keeps them for its whole run
    switch (event.type) {
      case 'SentenceViewed': return this.onSentenceViewed(event, replay);
      case 'TokenHelpOpened':
      case 'PhraseHelpOpened':
      case 'GrammarHelpOpened':
      case 'DecodingRevealed':
      case 'SentenceExplanationRevealed':
      case 'EnglishRescueRevealed': return this.onHelp(event);
      case 'ComprehensionReported': return this.onReported(event, replay);
      case 'AudioSegmentCompleted': return this.onAudioCompleted(event, replay);
      case 'ProductionRecorded': return this.onProduction(event);
      case 'ItemMarked': return this.onItemMarked(event);
      default: return; // not evidence (PhraseEncountered is GoLearn's own output; counted on the SentenceViewed)
    }
  }

  // ───────────────────────── reading ─────────────────────────

  private async onSentenceViewed(e: Extract<DomainEvent, { type: 'SentenceViewed' }>, replay: boolean) {
    const sitting = await this.sittingOf(e);
    await this.hydrate(e.userId, sitting);
    const book = new ItemBook(this.ctx, e.userId);
    await this.encounterSentence({
      userId: e.userId, lang: e.lang, sentenceId: e.sentenceId, session: e.session, sitting, contentVersion: e.contentVersion,
      at: e.at, modality: 'reading',
      tokenFilter: e.tokenIds.length > 0 ? new Set(e.tokenIds) : undefined,
      dedupeBase: e.dedupeKey, replay, surface: e.surface, book,
    });
    await book.flush();
  }

  private async onHelp(e: Extract<DomainEvent, { type: 'TokenHelpOpened' | 'PhraseHelpOpened' | 'GrammarHelpOpened' | 'DecodingRevealed' | 'SentenceExplanationRevealed' | 'EnglishRescueRevealed' }>) {
    const sitting = await this.sittingOf(e);
    await this.hydrate(e.userId, sitting);
    const sentenceIds = await this.record(e, sitting);
    const book = new ItemBook(this.ctx, e.userId);
    for (const sid of sentenceIds) await this.settle(e.userId, sitting, sid, 'reading', book);
    await book.flush();
  }

  private async onReported(e: Extract<DomainEvent, { type: 'ComprehensionReported' }>, replay: boolean) {
    if (e.degree !== 'all') return; // stored in the log only
    const sitting = await this.sittingOf(e);
    await this.hydrate(e.userId, sitting);
    await this.record(e, sitting);
    const book = new ItemBook(this.ctx, e.userId);
    for (const sid of e.sentenceIds) {
      if (e.modality === 'reading') {
        await this.encounterSentence({
          userId: e.userId, lang: e.lang, sentenceId: sid, session: e.session, sitting, contentVersion: e.contentVersion,
          at: e.at, modality: 'reading', dedupeBase: e.dedupeKey, replay, surface: e.surface, book,
        });
      }
      await this.settle(e.userId, sitting, sid, e.modality, book);
    }
    await book.flush();
  }

  /**
   * Re-derive assistance / evidenceKind / weight of the existing encounters of one sentence + sitting + modality from
   * the memo. Reading assistance comes from the memo; listening keeps the assistance its audio event set. The encounters
   * are found through the current sitting's entries in the items' aggregates (agg.ts): nothing scans the encounter table.
   */
  private async settle(userId: string, sitting: string, sentenceId: string, modality: Modality, book: ItemBook) {
    const { ctx } = this;
    const reading = modality === 'reading';
    const memo = this.memo(userId, sitting, sentenceId);
    const info = await sentenceItems(ctx, sentenceId, undefined, reading ? this.orth : undefined);
    if (!info) return;
    await book.load(info.items.keys());
    const found: Array<{ itemId: string; row: StoredItem; ent: Entry }> = [];
    for (const itemId of info.items.keys()) {
      const row = book.get(itemId);
      const ent = row ? entryOf(row.agg, modality, sitting, sentenceId) : undefined;
      if (row && ent) found.push({ itemId, row, ent });
    }
    const words = found.filter((f) => !isOrthId(f.itemId));
    const encRows = (await ctx.store.encounters.getMany(words.map((f) => encounterIdOf({ userId, itemId: f.itemId, sentenceId, modality, sitting, session: sitting }))));
    const encOf = new Map(words.map((f, i) => [f.itemId, encRows[i] as StoredEncounter | undefined]));
    for (const { itemId, ent } of found) {
      const enc = encOf.get(itemId);
      const assistance = reading ? this.helpOf(memo, itemId) : (ent[1] as AssistanceLevel);
      const itemHelp = reading ? this.itemHelpOfMemo(memo, itemId) : ent[2];
      const j = this.judge(modality, assistance, memo.demo.has(modality as ReceptiveModality), enc?.playbackSpeed, enc?.replays);
      const romanized = reading && memo.roman.has(itemId);
      const kind = kindCode(j.evidenceKind);
      const micro = Math.round(j.weight * 1e6);
      if (ent[0] === kind && ent[1] === assistance && ent[3] === micro && ent[2] === itemHelp && ent[5] === (romanized ? 1 : 0)) continue;
      ent[0] = kind; ent[1] = assistance; ent[2] = itemHelp; ent[3] = micro; ent[5] = romanized ? 1 : 0;
      if (enc) {
        enc.assistance = assistance;
        enc.evidenceKind = j.evidenceKind;
        enc.weight = j.weight;
        if (reading) {
          if (itemHelp > 0) enc.itemHelp = itemHelp as AssistanceLevel; else delete enc.itemHelp;
          if (romanized) enc.romanized = true; else delete enc.romanized;
        }
        book.putEncounter(enc);
      }
      book.touch(itemId);
    }
  }

  /** exposure / assisted / demonstrated and the evidence weight that kind contributes. */
  private judge(modality: Modality, assistance: AssistanceLevel, demonstrated: boolean, speed?: number, replays?: number): { evidenceKind: EvidenceKind; weight: number } {
    if (assistance > 0) return { evidenceKind: 'assisted', weight: 0 };
    if (!demonstrated) return { evidenceKind: 'exposure', weight: 0 };
    const { policy } = this.ctx;
    const weight = modality === 'listening'
      ? policy.listeningWeight({ speed: speed ?? 1, replays: replays ?? 0, transcriptRevealed: false, translationRevealed: false })
      : policy.readingWeight(0);
    return { evidenceKind: 'demonstrated', weight };
  }

  // ───────────────────────── listening ─────────────────────────

  private async onAudioCompleted(e: Extract<DomainEvent, { type: 'AudioSegmentCompleted' }>, replay: boolean) {
    const { ctx } = this;
    const sitting = await this.sittingOf(e); // every folded event extends the sitting, eligible or not (keeps live == rebuild)
    const verdict = await listenVerdict(ctx, e);
    if (!verdict.eligible) return; // fixture / unreviewed / unknown audio: no evidence, ever (the log keeps the event)
    await this.hydrate(e.userId, sitting);
    const transcript = e.revealedTranscript || e.transcriptVisible;
    const assistance: AssistanceLevel = e.revealedTranslation
      ? LISTEN_ASSISTANCE.translation : transcript ? LISTEN_ASSISTANCE.transcript : LISTEN_ASSISTANCE.none;
    const book = new ItemBook(ctx, e.userId);
    for (const sentenceId of e.sentenceIds) {
      await this.encounterSentence({
        userId: e.userId, lang: e.lang, sentenceId, session: e.session, sitting, at: e.at, modality: 'listening',
        listen: { assistance, speed: e.speed, replays: e.replayCount },
        dedupeBase: e.dedupeKey, replay, surface: e.surface, book,
      });
    }
    await book.flush();
  }

  /** Comparable strength of a listening completion (used only to keep the better of two in one sitting). */
  private listenStrength(speed: number | undefined, replays: number | undefined, assistance: AssistanceLevel): number {
    return this.ctx.policy.listeningWeight({
      speed: speed ?? 1, replays: replays ?? 0,
      transcriptRevealed: assistance >= LISTEN_ASSISTANCE.transcript && assistance < LISTEN_ASSISTANCE.translation,
      translationRevealed: assistance >= LISTEN_ASSISTANCE.translation,
    });
  }

  // ───────────────────────── shared sentence → items ─────────────────────────

  /** Whether a variety code names a heritage variety of the language (the adapter's own table says so). */
  private heritage(lang: LanguageCode, variety: string): boolean {
    try { return this.ctx.adapters.get(lang).varieties?.[variety]?.kind === 'heritage'; } catch { return false; }
  }

  private async encounterSentence(a: {
    userId: string; lang: LanguageCode; sentenceId: string; session: string; sitting: string; contentVersion?: number; at: string;
    modality: ReceptiveModality; tokenFilter?: Set<string>;
    listen?: { assistance: AssistanceLevel; speed: number; replays: number };
    dedupeBase: string; replay: boolean; surface: string; book: ItemBook;
  }) {
    const { ctx, } = this;
    const { book } = a;
    // Writing-system items belong to reading only: listening does not exercise the script.
    const info = await sentenceItems(ctx, a.sentenceId, a.tokenFilter, a.modality === 'reading' ? this.orth : undefined);
    if (!info) return; // unknown sentence: nothing to attach evidence to
    const { sentence, text, items, firstPhraseOcc } = info;
    // A text in a heritage variety (Awadhi or Braj beside Modern Standard Hindi) is read as its own language: meeting
    // its words is not evidence about the course language, so no item is credited. The reading itself stays in the log
    // (progress, pace and rescue measures read it); only the word, phrase, pattern and script items are left alone.
    if (text?.variety && this.heritage(text.lang, text.variety)) return;
    const surface = a.modality === 'listening' ? 'listen'
      : text?.kind === 'scripture' ? 'scripture' : text?.kind === 'testimony' ? 'testimony' : 'corpus';
    const memo = this.memo(a.userId, a.sitting, a.sentenceId);
    const demonstrated = memo.demo.has(a.modality);
    // Evidence is pinned to the version encountered: the event says which one, else the sentence's own version.
    const contentVersion = a.contentVersion ?? sentence.versionAdded;

    await book.load(items.keys());
    // The encounter rows this sentence + sitting may already have: one read by id (never a scan).
    const wordItems = [...items].filter(([, k]) => k !== 'orth').map(([itemId]) => itemId);
    const existing = await ctx.store.encounters.getMany(wordItems.map((itemId) =>
      encounterIdOf({ userId: a.userId, itemId, sentenceId: a.sentenceId, modality: a.modality, sitting: a.sitting, session: a.session })));
    const exOf = new Map(wordItems.map((itemId, i) => [itemId, existing[i] as StoredEncounter | undefined]));

    const createdPhrases: Array<{ occ: PhraseOccurrence; assistance: AssistanceLevel }> = [];
    for (const [itemId, itemKind] of items) {
      const assistance: AssistanceLevel = a.listen ? a.listen.assistance : this.helpOf(memo, itemId);
      // item-targeted help: a reading encounter records it apart; a listening encounter falls back to its assistance when 1–3
      const itemHelp = a.listen ? (assistance >= 1 && assistance <= 3 ? assistance : 0) : this.itemHelpOfMemo(memo, itemId);
      const j = this.judge(a.modality, assistance, demonstrated, a.listen?.speed, a.listen?.replays);
      const romanized = !a.listen && memo.roman.has(itemId);
      const entry: Entry = [kindCode(j.evidenceKind), assistance, itemHelp, Math.round(j.weight * 1e6), 0, romanized ? 1 : 0];
      const row = book.ensure(itemId, { lang: a.lang, itemKind });
      const meeting = { textId: sentence.textId, sentenceId: a.sentenceId, at: a.at };

      if (itemKind === 'orth') { // no encounter row: the aggregate is the record
        if (entryOf(row.agg, a.modality, a.sitting, a.sentenceId)) continue;
        addReceptive(row.agg, a.modality, a.sitting, entry, meeting);
        book.touch(itemId);
        continue;
      }

      const ex = exOf.get(itemId);
      if (ex) {
        // listening: an existing encounter is replaced when the candidate is better evidence (idempotent, order-independent)
        const better = a.listen && (assistance < ex.assistance
          || (assistance === ex.assistance && this.listenStrength(a.listen.speed, a.listen.replays, assistance) > this.listenStrength(ex.playbackSpeed, ex.replays, ex.assistance)));
        if (!better) continue;
        ex.evidenceKind = j.evidenceKind; ex.weight = j.weight; ex.assistance = assistance;
        ex.playbackSpeed = a.listen!.speed; ex.replays = a.listen!.replays;
        const ent = entryOf(row.agg, a.modality, a.sitting, a.sentenceId);
        if (ent) { ent[0] = entry[0]; ent[1] = entry[1]; ent[2] = entry[2]; ent[3] = entry[3]; }
        book.putEncounter(ex);
        book.touch(itemId);
        continue;
      }
      book.putEncounter(buildEncounter({
        userId: a.userId, lang: a.lang, itemId, itemKind, sentenceId: a.sentenceId, textId: sentence.textId, surface,
        modality: a.modality, session: a.session, sitting: a.sitting, contentVersion, at: a.at,
        evidenceKind: j.evidenceKind, assistance, weight: j.weight,
        ...(a.listen ? {} : { itemHelp: this.itemHelpOfMemo(memo, itemId), romanized }),
        playbackSpeed: a.listen?.speed, replays: a.listen?.replays,
      }));
      addReceptive(row.agg, a.modality, a.sitting, entry, meeting);
      book.touch(itemId);
      if (itemKind === 'phrase') {
        const occ = firstPhraseOcc.get(itemId);
        if (occ) createdPhrases.push({ occ, assistance });
      }
    }

    if (!a.replay) {
      for (const { occ, assistance } of createdPhrases) {
        this.outbox.push({
          type: 'PhraseEncountered', userId: a.userId, lang: a.lang, surface: surfaceOf(a.surface),
          session: a.session, dedupeKey: `phrase-enc:${a.dedupeBase}:${occ.id}`, at: a.at,
          sentenceId: a.sentenceId, phraseId: occ.phraseId, phraseOccurrenceId: occ.id, modality: a.modality, assistance,
        });
      }
    }
  }

  // ───────────────────────── production ─────────────────────────

  private async onProduction(e: Extract<DomainEvent, { type: 'ProductionRecorded' }>) {
    const { ctx } = this;
    const sitting = await this.sittingOf(e);
    // Evidence for an (item, sentenceHash, modality) is recorded once, ever: the id ignores session, sitting and revision.
    const sentenceHash = e.sentenceHash ?? hash(e.sentenceText);
    const enc = buildEncounter({
      userId: e.userId, lang: e.lang, itemId: e.itemId, itemKind: e.itemKind, sentenceId: `prod:${sentenceHash}`,
      textId: e.revisionId ?? 'testimony:adhoc', surface: 'testimony', modality: e.modality, session: 'prod', sitting, idKey: 'prod',
      at: e.at,
      evidenceKind: 'production', assistance: PRODUCTION_ASSISTANCE[e.kind], weight: ctx.policy.productionWeight(e.kind),
      productionKind: e.kind,
    });
    if (await ctx.store.encounters.get(enc.id)) return;
    const book = new ItemBook(ctx, e.userId);
    await book.load([e.itemId]);
    const row = book.ensure(e.itemId, { lang: e.lang, itemKind: e.itemKind });
    addProduction(row.agg, e.modality, [K_PRODUCTION, enc.assistance, 0, Math.round(enc.weight * 1e6), 0, 0], e.at);
    book.putEncounter(enc);
    book.touch(e.itemId);
    await book.flush();
  }

  // ───────────────────────── manual marks ─────────────────────────

  private async onItemMarked(e: Extract<DomainEvent, { type: 'ItemMarked' }>) {
    const { ctx } = this;
    await this.sittingOf(e); // an explicit mark is learner activity: it belongs to the sitting like any other evidence event
    const book = new ItemBook(ctx, e.userId);
    await book.load([e.itemId]);
    if (e.mark === 'clear') {
      const row = book.get(e.itemId);
      if (!row) return;
      delete row.manualMark;
    } else {
      book.ensure(e.itemId, { lang: e.lang, itemKind: e.itemKind }).manualMark = e.mark;
    }
    book.touch(e.itemId);
    await book.flush(); // drops the row if it holds nothing else
  }

  // used by GoLearn for its own analysis of the item a token belongs to
  private async tokenItems(tokenId: string): Promise<string[]> {
    const token = await this.ctx.store.tokens.get(tokenId);
    if (!token) return [];
    const out = [token.formId];
    // help on any piece of a lexical unit is help on the unit's lemma (a non-head piece credits no ENCOUNTER, but it asked)
    const lemmaId = await new AnalysisCache(this.ctx.store).askedLemmaIdOf(tokenId);
    if (lemmaId) out.push(lemmaId);
    return out;
  }
}

function surfaceOf(s: string): 'corpus' | 'scripture' | 'testimony' | 'listen' | 'home' {
  return s === 'corpus' || s === 'scripture' || s === 'testimony' || s === 'listen' || s === 'home' ? s : 'corpus';
}

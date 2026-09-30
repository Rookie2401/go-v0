/**
 * Event folding — events are the ONLY write path into learner state. Policy `evidence@2`.
 *
 *  SentenceViewed        → reading EXPOSURE encounters: one per word *form*, per credited *lemma*, per phrase and per
 *                          pattern in the sentence (deduped by ids.encounter). Emits PhraseEncountered. A view alone is
 *                          never comprehension: the encounter is `exposure`, weight 0.
 *  TokenHelpOpened …     → never create encounters. They raise the assistance of the existing reading encounters of the
 *                          same sentence + session (or are remembered for a view that arrives later): the encounter
 *                          becomes `assisted`. Token / phrase / grammar help is scoped to the items it explains;
 *                          sentence explanation and English rescue apply to the whole sentence.
 *  ComprehensionReported → degree 'all': the sentence's items become `demonstrated` (evidence) unless help was used on
 *                          that item in that session (then they stay `assisted`). A report for a sentence the reader
 *                          never emitted a view for materialises the reading encounters (the report proves it was read).
 *                          Listening reports only upgrade listening encounters that real, reviewed speech produced.
 *                          Degrees 'most' | 'some' | 'little' are NOT item evidence (readingProgress / recommendations read
 *                          them from the log). Reports never downgrade.
 *  AudioSegmentCompleted → listening encounters for the segment's sentences IF the audio is reviewed real speech (rule 5,
 *                          eligibility.ts); touches ONLY `listening`. Transcript / translation shown ⇒ `assisted`.
 *  ProductionRecorded    → writing / speaking `production` encounter; touches ONLY `writing` / `speaking`. Evidence for an
 *                          (item, sentenceHash, modality) is recorded ONCE, ever (first one wins).
 *  ItemMarked            → manualMark only (a `known` mark is an explicit demonstration of that item).
 * Everything else (TextViewed, TextCompleted, plays, seeks, suggestions shown …) is not item evidence and is ignored here.
 *
 * The per-session memo of help / reports is hydrated from the event log the first time a (user, session) is touched, so a
 * restart, a late view and `rebuild` all reach the same encounters.
 */
import type { AssistanceLevel, DomainEvent, EvidenceKind, ItemKind, LanguageCode, Modality, PhraseEncountered, PhraseOccurrence } from '../core';
import { hash, ids } from '../core';
import { AnalysisCache } from './analysis';
import { listenVerdict } from './eligibility';
import { sentenceItems } from './items';
import { LISTEN_ASSISTANCE, PRODUCTION_ASSISTANCE } from './policy';
import type { Ctx, StoredEncounter } from './state';
import { addEncounter, byAtThenId, emptyDimension, recomputeItem, recomputeMany } from './state';

type ItemMeta = { lang: LanguageCode; itemKind: ItemKind };
type ReceptiveModality = 'reading' | 'listening';

interface SentenceMemo {
  all: AssistanceLevel;
  items: Map<string, AssistanceLevel>;
  /** modalities for which the learner reported understanding ALL of this sentence in this session */
  demo: Set<ReceptiveModality>;
}
interface SessionMemo { hydrated: boolean; sentences: Map<string, SentenceMemo> }

/** Events that change learner state (what `attach()` subscribes to and what `rebuild` replays). */
export const FOLD_TYPES = [
  'SentenceViewed', 'TokenHelpOpened', 'PhraseHelpOpened', 'GrammarHelpOpened', 'SentenceExplanationRevealed',
  'EnglishRescueRevealed', 'ComprehensionReported', 'ItemMarked', 'AudioSegmentCompleted', 'ProductionRecorded',
] as const satisfies readonly DomainEvent['type'][];
export const FOLD_TYPE_SET: ReadonlySet<string> = new Set(FOLD_TYPES);

const MEMO_TYPES: ReadonlySet<string> = new Set([
  'TokenHelpOpened', 'PhraseHelpOpened', 'GrammarHelpOpened', 'SentenceExplanationRevealed', 'EnglishRescueRevealed',
  'ComprehensionReported',
]);

const max = (a: AssistanceLevel, b: AssistanceLevel): AssistanceLevel => (a >= b ? a : b);

export class Folder {
  private readonly sessions = new Map<string, SessionMemo>();

  constructor(private readonly ctx: Ctx) {}

  clearUser(userId: string) {
    for (const k of [...this.sessions.keys()]) if (k.startsWith(`${userId}\u0000`)) this.sessions.delete(k);
  }

  // ───────────────────────── session memo ─────────────────────────

  private session(userId: string, session: string): SessionMemo {
    const k = `${userId}\u0000${session}`;
    let m = this.sessions.get(k);
    if (!m) { m = { hydrated: false, sentences: new Map() }; this.sessions.set(k, m); }
    return m;
  }

  private memo(userId: string, session: string, sentenceId: string): SentenceMemo {
    const s = this.session(userId, session);
    let m = s.sentences.get(sentenceId);
    if (!m) { m = { all: 0, items: new Map(), demo: new Set() }; s.sentences.set(sentenceId, m); }
    return m;
  }

  /** Load this (user, session)'s help and reports from the log once; afterwards events keep the memo current. */
  private async hydrate(userId: string, session: string): Promise<void> {
    const s = this.session(userId, session);
    if (s.hydrated) return;
    s.hydrated = true;
    const events = (await this.ctx.store.events.where('session', session)).filter((e) => e.userId === userId && MEMO_TYPES.has(e.type)).sort(byAtThenId);
    for (const e of events) await this.record(e);
  }

  /** Idempotently remember a help / report event; returns the sentence ids it concerns. */
  private async record(e: DomainEvent): Promise<string[]> {
    const { store } = this.ctx;
    const raise = (sentenceId: string, level: AssistanceLevel, itemIds: string[] | 'all') => {
      const m = this.memo(e.userId, e.session, sentenceId);
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
      case 'SentenceExplanationRevealed':
        raise(e.sentenceId, 4, 'all');
        return [e.sentenceId];
      case 'EnglishRescueRevealed':
        for (const sid of e.sentenceIds) raise(sid, 5, 'all');
        return [...e.sentenceIds];
      case 'ComprehensionReported':
        if (e.degree === 'all') for (const sid of e.sentenceIds) this.memo(e.userId, e.session, sid).demo.add(e.modality);
        return [...e.sentenceIds];
      default:
        return [];
    }
  }

  private helpOf(m: SentenceMemo, itemId: string): AssistanceLevel {
    return max(m.all, m.items.get(itemId) ?? 0);
  }

  // ───────────────────────── dispatch ─────────────────────────

  async fold(event: DomainEvent, replay = false): Promise<void> {
    switch (event.type) {
      case 'SentenceViewed': return this.onSentenceViewed(event, replay);
      case 'TokenHelpOpened':
      case 'PhraseHelpOpened':
      case 'GrammarHelpOpened':
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
    await this.hydrate(e.userId, e.session);
    await this.encounterSentence({
      userId: e.userId, lang: e.lang, sentenceId: e.sentenceId, session: e.session, at: e.at, modality: 'reading',
      tokenFilter: e.tokenIds.length > 0 ? new Set(e.tokenIds) : undefined,
      dedupeBase: e.dedupeKey, replay, surface: e.surface,
    });
  }

  private async onHelp(e: Extract<DomainEvent, { type: 'TokenHelpOpened' | 'PhraseHelpOpened' | 'GrammarHelpOpened' | 'SentenceExplanationRevealed' | 'EnglishRescueRevealed' }>) {
    await this.hydrate(e.userId, e.session);
    const sentenceIds = await this.record(e);
    const touched = new Map<string, ItemMeta>();
    for (const sid of sentenceIds) await this.settle(e.userId, e.lang, e.session, sid, 'reading', touched);
    await recomputeMany(this.ctx, e.userId, touched);
  }

  private async onReported(e: Extract<DomainEvent, { type: 'ComprehensionReported' }>, replay: boolean) {
    if (e.degree !== 'all') return; // stored in the log only
    await this.hydrate(e.userId, e.session);
    await this.record(e);
    const touched = new Map<string, ItemMeta>();
    for (const sid of e.sentenceIds) {
      if (e.modality === 'reading') {
        await this.encounterSentence({
          userId: e.userId, lang: e.lang, sentenceId: sid, session: e.session, at: e.at, modality: 'reading',
          dedupeBase: e.dedupeKey, replay, surface: e.surface,
        });
      }
      await this.settle(e.userId, e.lang, e.session, sid, e.modality, touched);
    }
    await recomputeMany(this.ctx, e.userId, touched);
  }

  /**
   * Re-derive assistance / evidenceKind / weight of the existing encounters of one sentence + session + modality from
   * the memo. Reading assistance comes from the memo; listening keeps the assistance its audio event set.
   */
  private async settle(
    userId: string, lang: LanguageCode, session: string, sentenceId: string, modality: Modality,
    touched: Map<string, ItemMeta>,
  ) {
    const { ctx } = this;
    const memo = this.memo(userId, session, sentenceId);
    const encs = ((await ctx.store.encounters.where('sentenceId', sentenceId)) as StoredEncounter[])
      .filter((x) => x.userId === userId && x.modality === modality && (x.session ?? '') === session);
    for (const enc of encs) {
      const assistance = modality === 'reading' ? this.helpOf(memo, enc.itemId) : enc.assistance;
      const j = this.judge(modality, assistance, memo.demo.has(modality as ReceptiveModality), enc.playbackSpeed, enc.replays);
      if (enc.assistance === assistance && enc.evidenceKind === j.evidenceKind && enc.weight === j.weight) continue;
      enc.assistance = assistance;
      enc.evidenceKind = j.evidenceKind;
      enc.weight = j.weight;
      await ctx.store.encounters.put(enc);
      touched.set(enc.itemId, { lang, itemKind: enc.itemKind });
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
    const verdict = await listenVerdict(ctx, e);
    if (!verdict.eligible) return; // fixture / unreviewed / unknown audio: no evidence, ever (the log keeps the event)
    await this.hydrate(e.userId, e.session);
    const transcript = e.revealedTranscript || e.transcriptVisible;
    const assistance: AssistanceLevel = e.revealedTranslation
      ? LISTEN_ASSISTANCE.translation : transcript ? LISTEN_ASSISTANCE.transcript : LISTEN_ASSISTANCE.none;
    for (const sentenceId of e.sentenceIds) {
      await this.encounterSentence({
        userId: e.userId, lang: e.lang, sentenceId, session: e.session, at: e.at, modality: 'listening',
        listen: { assistance, speed: e.speed, replays: e.replayCount },
        dedupeBase: e.dedupeKey, replay, surface: e.surface,
      });
    }
  }

  /** Comparable strength of a listening completion (used only to keep the better of two in one session). */
  private listenStrength(speed: number | undefined, replays: number | undefined, assistance: AssistanceLevel): number {
    return this.ctx.policy.listeningWeight({
      speed: speed ?? 1, replays: replays ?? 0,
      transcriptRevealed: assistance >= LISTEN_ASSISTANCE.transcript && assistance < LISTEN_ASSISTANCE.translation,
      translationRevealed: assistance >= LISTEN_ASSISTANCE.translation,
    });
  }

  // ───────────────────────── shared sentence → items ─────────────────────────

  private async encounterSentence(a: {
    userId: string; lang: LanguageCode; sentenceId: string; session: string; at: string;
    modality: ReceptiveModality; tokenFilter?: Set<string>;
    listen?: { assistance: AssistanceLevel; speed: number; replays: number };
    dedupeBase: string; replay: boolean; surface: string;
  }) {
    const { ctx } = this;
    const info = await sentenceItems(ctx, a.sentenceId, a.tokenFilter);
    if (!info) return; // unknown sentence: nothing to attach evidence to
    const { sentence, text, items, firstPhraseOcc } = info;
    const surface = a.modality === 'listening' ? 'listen'
      : text?.kind === 'scripture' ? 'scripture' : text?.kind === 'testimony' ? 'testimony' : 'corpus';
    const memo = this.memo(a.userId, a.session, a.sentenceId);
    const demonstrated = memo.demo.has(a.modality);

    const touched = new Map<string, ItemMeta>();
    const createdPhrases: Array<{ occ: PhraseOccurrence; assistance: AssistanceLevel }> = [];
    for (const [itemId, itemKind] of items) {
      const assistance: AssistanceLevel = a.listen ? a.listen.assistance : this.helpOf(memo, itemId);
      const j = this.judge(a.modality, assistance, demonstrated, a.listen?.speed, a.listen?.replays);
      const replaceIf = a.listen
        ? (ex: StoredEncounter) => assistance < ex.assistance
          || (assistance === ex.assistance && this.listenStrength(a.listen!.speed, a.listen!.replays, assistance) > this.listenStrength(ex.playbackSpeed, ex.replays, ex.assistance))
        : undefined;
      const { changed, created } = await addEncounter(ctx, {
        userId: a.userId, lang: a.lang, itemId, itemKind, sentenceId: a.sentenceId, textId: sentence.textId, surface,
        modality: a.modality, session: a.session, at: a.at, evidenceKind: j.evidenceKind, assistance, weight: j.weight,
        playbackSpeed: a.listen?.speed, replays: a.listen?.replays,
      }, replaceIf);
      if (!changed) continue;
      touched.set(itemId, { lang: a.lang, itemKind });
      if (itemKind === 'phrase' && created) {
        const occ = firstPhraseOcc.get(itemId);
        if (occ) createdPhrases.push({ occ, assistance });
      }
    }
    await recomputeMany(ctx, a.userId, touched);

    if (!a.replay) {
      for (const { occ, assistance } of createdPhrases) {
        await ctx.bus.emit<PhraseEncountered>({
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
    // Evidence for an (item, sentenceHash, modality) is recorded once, ever: the id ignores session and revision.
    const sentenceHash = e.sentenceHash ?? hash(e.sentenceText);
    const { changed } = await addEncounter(ctx, {
      userId: e.userId, lang: e.lang, itemId: e.itemId, itemKind: e.itemKind, sentenceId: `prod:${sentenceHash}`,
      textId: e.revisionId ?? 'testimony:adhoc', surface: 'testimony', modality: e.modality, session: 'prod', at: e.at,
      evidenceKind: 'production', assistance: PRODUCTION_ASSISTANCE[e.kind], weight: ctx.policy.productionWeight(e.kind),
      productionKind: e.kind,
    });
    if (changed) await recomputeItem(ctx, e.userId, e.itemId, { lang: e.lang, itemKind: e.itemKind });
  }

  // ───────────────────────── manual marks ─────────────────────────

  private async onItemMarked(e: Extract<DomainEvent, { type: 'ItemMarked' }>) {
    const { ctx } = this;
    const rowId = ids.learnerItem(e.userId, e.itemId);
    const existing = await ctx.store.learnerItems.get(rowId);
    if (e.mark === 'clear') {
      if (!existing) return;
      delete existing.manualMark;
      await ctx.store.learnerItems.put(existing);
      await recomputeItem(ctx, e.userId, e.itemId, { lang: e.lang, itemKind: e.itemKind }); // drops the row if it holds nothing else
      return;
    }
    const row = existing ?? {
      id: rowId, userId: e.userId, lang: e.lang, itemId: e.itemId, itemKind: e.itemKind,
      reading: emptyDimension(), listening: emptyDimension(), writing: emptyDimension(), speaking: emptyDimension(),
      encounterCount: 0, textIds: [],
    };
    row.manualMark = e.mark;
    await ctx.store.learnerItems.put(row);
  }

  // used by GoLearn for its own analysis of the item a token belongs to
  private async tokenItems(tokenId: string): Promise<string[]> {
    const token = await this.ctx.store.tokens.get(tokenId);
    if (!token) return [];
    const out = [token.formId];
    const lemmaId = await new AnalysisCache(this.ctx.store).lemmaIdOf(tokenId);
    if (lemmaId) out.push(lemmaId);
    return out;
  }
}

function surfaceOf(s: string): 'corpus' | 'scripture' | 'testimony' | 'listen' | 'home' {
  return s === 'corpus' || s === 'scripture' || s === 'testimony' || s === 'listen' || s === 'home' ? s : 'corpus';
}

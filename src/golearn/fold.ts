/**
 * Event folding — events are the ONLY write path into learner state.
 *
 *  SentenceViewed        → reading encounters: one per word *form*, per credited *lemma*, per phrase and per
 *                          pattern occurring in the sentence (deduped by ids.encounter). Emits PhraseEncountered.
 *  TokenHelpOpened …     → never create encounters; they re-weight the existing reading encounter(s) of the same
 *                          sentence + session (or are remembered if the view has not arrived yet).
 *                          Token / phrase / grammar help is scoped to the items it explains; sentence explanation
 *                          and English rescue apply to the whole sentence.
 *  AudioSegmentCompleted → listening encounters for the segment's sentences; touches ONLY `listening`.
 *  ProductionRecorded    → writing / speaking encounter; touches ONLY `writing` / `speaking`.
 *  ItemMarked            → manualMark only.
 * Everything else (plays, seeks, suggestions shown …) is not evidence and is ignored here.
 */
import type {
  AssistanceLevel, DomainEvent, Encounter, ItemKind, LanguageCode, PatternOccurrence, PhraseEncountered,
  PhraseOccurrence, Sentence, Text,
} from '../core';
import { hash, ids } from '../core';
import { AnalysisCache } from './analysis';
import { LISTEN_ASSISTANCE, PRODUCTION_ASSISTANCE } from './policy';
import type { Ctx } from './state';
import { addEncounter, emptyDimension, recomputeItem, recomputeMany } from './state';

type ItemMeta = { lang: LanguageCode; itemKind: ItemKind };
type Assist = { all: AssistanceLevel; items: Map<string, AssistanceLevel> };

/** Events that change learner state (what `attach()` subscribes to and what `rebuild` replays). */
export const FOLD_TYPES = [
  'SentenceViewed', 'TokenHelpOpened', 'PhraseHelpOpened', 'GrammarHelpOpened', 'SentenceExplanationRevealed',
  'EnglishRescueRevealed', 'ItemMarked', 'AudioSegmentCompleted', 'ProductionRecorded',
] as const satisfies readonly DomainEvent['type'][];
export const FOLD_TYPE_SET: ReadonlySet<string> = new Set(FOLD_TYPES);

const max = (a: AssistanceLevel, b: AssistanceLevel): AssistanceLevel => (a >= b ? a : b);

export class Folder {
  /** Help that arrived (per user·session·sentence) — consulted when the SentenceViewed arrives later. */
  private readonly assist = new Map<string, Assist>();

  constructor(private readonly ctx: Ctx) {}

  clearUser(userId: string) {
    for (const k of [...this.assist.keys()]) if (k.startsWith(`${userId}\u0000`)) this.assist.delete(k);
  }

  private key(userId: string, session: string, sentenceId: string) { return `${userId}\u0000${session}\u0000${sentenceId}`; }

  private entry(userId: string, session: string, sentenceId: string): Assist {
    const k = this.key(userId, session, sentenceId);
    let e = this.assist.get(k);
    if (!e) { e = { all: 0, items: new Map() }; this.assist.set(k, e); }
    return e;
  }

  async fold(event: DomainEvent, replay = false): Promise<void> {
    switch (event.type) {
      case 'SentenceViewed': return this.onSentenceViewed(event, replay);
      case 'TokenHelpOpened': return this.onTokenHelp(event);
      case 'PhraseHelpOpened': return this.onPhraseHelp(event);
      case 'GrammarHelpOpened': return this.onGrammarHelp(event);
      case 'SentenceExplanationRevealed':
        return this.applyHelp(event.userId, event.lang, event.session, event.sentenceId, 4, 'all');
      case 'EnglishRescueRevealed':
        for (const sid of event.sentenceIds) await this.applyHelp(event.userId, event.lang, event.session, sid, 5, 'all');
        return;
      case 'AudioSegmentCompleted': return this.onAudioCompleted(event, replay);
      case 'ProductionRecorded': return this.onProduction(event);
      case 'ItemMarked': return this.onItemMarked(event);
      default: return; // not evidence (PhraseEncountered is GoLearn's own output; counted on the SentenceViewed)
    }
  }

  // ───────────────────────── reading ─────────────────────────

  private async onSentenceViewed(e: Extract<DomainEvent, { type: 'SentenceViewed' }>, replay: boolean) {
    const { ctx } = this;
    const entry = this.assist.get(this.key(e.userId, e.session, e.sentenceId));
    await this.encounterSentence({
      userId: e.userId, lang: e.lang, sentenceId: e.sentenceId, session: e.session, at: e.at, modality: 'reading',
      tokenFilter: e.tokenIds.length > 0 ? new Set(e.tokenIds) : undefined,
      assistFor: (itemId) => (entry ? max(entry.all, entry.items.get(itemId) ?? 0) : 0),
      weightOf: (a) => ctx.policy.readingWeight(a),
      dedupeBase: e.dedupeKey, replay, surface: e.surface,
    });
  }

  private async onTokenHelp(e: Extract<DomainEvent, { type: 'TokenHelpOpened' }>) {
    const { store } = this.ctx;
    const itemIds = new Set<string>([e.itemId]);
    const token = await store.tokens.get(e.tokenId);
    if (token) {
      itemIds.add(token.formId);
      const lemmaId = await new AnalysisCache(store).lemmaIdOf(token.id);
      if (lemmaId) itemIds.add(lemmaId);
    }
    await this.applyHelp(e.userId, e.lang, e.session, e.sentenceId, e.level, [...itemIds]);
  }

  private async onPhraseHelp(e: Extract<DomainEvent, { type: 'PhraseHelpOpened' }>) {
    const occ = (await this.ctx.store.phraseOccurrences.where('sentenceId', e.sentenceId)).find((o) => o.id === e.phraseOccurrenceId);
    const items = new Set<string>([e.phraseId]);
    for (const t of occ?.tokenIds ?? []) for (const i of await this.tokenItems(t)) items.add(i);
    await this.applyHelp(e.userId, e.lang, e.session, e.sentenceId, 2, [...items]);
  }

  private async onGrammarHelp(e: Extract<DomainEvent, { type: 'GrammarHelpOpened' }>) {
    const items = new Set<string>([e.patternId]);
    for (const t of e.tokenIds) for (const i of await this.tokenItems(t)) items.add(i);
    await this.applyHelp(e.userId, e.lang, e.session, e.sentenceId, 3, [...items]);
  }

  private async tokenItems(tokenId: string): Promise<string[]> {
    const token = await this.ctx.store.tokens.get(tokenId);
    if (!token) return [];
    const out = [token.formId];
    const lemmaId = await new AnalysisCache(this.ctx.store).lemmaIdOf(tokenId);
    if (lemmaId) out.push(lemmaId);
    return out;
  }

  /** Remember the help for a later view, and re-weight any existing reading encounter (never creates one). */
  private async applyHelp(
    userId: string, lang: LanguageCode, session: string, sentenceId: string, level: AssistanceLevel,
    itemIds: string[] | 'all',
  ) {
    const { ctx } = this;
    const entry = this.entry(userId, session, sentenceId);
    if (itemIds === 'all') entry.all = max(entry.all, level);
    else for (const i of itemIds) entry.items.set(i, max(entry.items.get(i) ?? 0, level));

    let encs: Encounter[];
    if (itemIds === 'all') {
      encs = (await ctx.store.encounters.where('sentenceId', sentenceId)).filter((x) =>
        x.userId === userId && x.modality === 'reading' && x.id === ids.encounter(userId, x.itemId, sentenceId, 'reading', session));
    } else {
      encs = (await ctx.store.encounters.getMany(itemIds.map((i) => ids.encounter(userId, i, sentenceId, 'reading', session))))
        .filter((x): x is Encounter => !!x);
    }
    const touched = new Map<string, ItemMeta>();
    for (const enc of encs) {
      if (enc.assistance >= level) continue;
      enc.assistance = level;
      enc.weight = ctx.policy.readingWeight(level);
      await ctx.store.encounters.put(enc);
      touched.set(enc.itemId, { lang, itemKind: enc.itemKind });
    }
    await recomputeMany(ctx, userId, touched);
  }

  // ───────────────────────── listening ─────────────────────────

  private async onAudioCompleted(e: Extract<DomainEvent, { type: 'AudioSegmentCompleted' }>, replay: boolean) {
    const { ctx } = this;
    const transcript = e.revealedTranscript || e.transcriptVisible;
    const assistance: AssistanceLevel = e.revealedTranslation
      ? LISTEN_ASSISTANCE.translation : transcript ? LISTEN_ASSISTANCE.transcript : LISTEN_ASSISTANCE.none;
    const weight = ctx.policy.listeningWeight({
      speed: e.speed, replays: e.replayCount, transcriptRevealed: transcript, translationRevealed: e.revealedTranslation,
    });
    for (const sentenceId of e.sentenceIds) {
      await this.encounterSentence({
        userId: e.userId, lang: e.lang, sentenceId, session: e.session, at: e.at, modality: 'listening',
        assistFor: () => assistance, weightOf: () => weight, speed: e.speed, upgrade: true,
        dedupeBase: e.dedupeKey, replay, surface: e.surface,
      });
    }
  }

  // ───────────────────────── shared sentence → items ─────────────────────────

  private async encounterSentence(a: {
    userId: string; lang: LanguageCode; sentenceId: string; session: string; at: string;
    modality: 'reading' | 'listening'; tokenFilter?: Set<string>;
    assistFor: (itemId: string) => AssistanceLevel; weightOf: (assistance: AssistanceLevel) => number;
    speed?: number; upgrade?: boolean; dedupeBase: string; replay: boolean; surface: string;
  }) {
    const { ctx } = this;
    const sentence: Sentence | undefined = await ctx.store.sentences.get(a.sentenceId);
    if (!sentence) return; // unknown sentence: nothing to attach evidence to
    const text: Text | undefined = await ctx.store.texts.get(sentence.textId);
    const surface: Encounter['surface'] = a.modality === 'listening' ? 'listen'
      : text?.kind === 'scripture' ? 'scripture' : text?.kind === 'testimony' ? 'testimony' : 'corpus';

    const cache = new AnalysisCache(ctx.store);
    const tokens = (await ctx.store.tokens.where('sentenceId', a.sentenceId)).sort((x, y) => x.index - y.index)
      .filter((t) => t.isWord && (!a.tokenFilter || a.tokenFilter.has(t.id)));
    await cache.prefetch(tokens.map((t) => t.id));

    const items = new Map<string, ItemKind>();
    for (const t of tokens) if (!items.has(t.formId)) items.set(t.formId, 'form');
    for (const t of tokens) {
      const lemmaId = await cache.lemmaIdOf(t.id);
      if (lemmaId && !items.has(lemmaId)) items.set(lemmaId, 'lemma');
    }
    const phraseOccs: PhraseOccurrence[] = (await ctx.store.phraseOccurrences.where('sentenceId', a.sentenceId)).sort((x, y) => (x.id < y.id ? -1 : 1));
    const patternOccs: PatternOccurrence[] = (await ctx.store.patternOccurrences.where('sentenceId', a.sentenceId)).sort((x, y) => (x.id < y.id ? -1 : 1));
    const firstPhraseOcc = new Map<string, PhraseOccurrence>();
    for (const o of phraseOccs) {
      if (!items.has(o.phraseId)) items.set(o.phraseId, 'phrase');
      if (!firstPhraseOcc.has(o.phraseId)) firstPhraseOcc.set(o.phraseId, o);
    }
    for (const o of patternOccs) if (!items.has(o.patternId)) items.set(o.patternId, 'pattern');

    const touched = new Map<string, ItemMeta>();
    const createdPhrases: Array<{ occ: PhraseOccurrence; assistance: AssistanceLevel }> = [];
    for (const [itemId, itemKind] of items) {
      const assistance = a.assistFor(itemId);
      const { changed, created } = await addEncounter(ctx, {
        userId: a.userId, lang: a.lang, itemId, itemKind, sentenceId: a.sentenceId, textId: sentence.textId, surface,
        modality: a.modality, session: a.session, at: a.at, assistance, weight: a.weightOf(assistance), playbackSpeed: a.speed,
      }, a.upgrade ?? false);
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
    const sentenceId = `prod:${e.revisionId ?? 'adhoc'}:${hash(e.sentenceText)}`;
    const { changed } = await addEncounter(ctx, {
      userId: e.userId, lang: e.lang, itemId: e.itemId, itemKind: e.itemKind, sentenceId,
      textId: e.revisionId ?? 'testimony:adhoc', surface: 'testimony', modality: e.modality, session: e.session, at: e.at,
      assistance: PRODUCTION_ASSISTANCE[e.kind], weight: ctx.policy.productionWeight(e.kind), productionKind: e.kind,
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
}

function surfaceOf(s: string): 'corpus' | 'scripture' | 'testimony' | 'listen' | 'home' {
  return s === 'corpus' || s === 'scripture' || s === 'testimony' || s === 'listen' || s === 'home' ? s : 'corpus';
}

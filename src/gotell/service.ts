/**
 * GoTell service — constrained production (My Testimony).
 *
 * Reads learner state ONLY through GoLearn queries (queryItem/queryItems/listKnown) plus the encounter log in the
 * store (for sources), and writes productive evidence ONLY as ProductionRecorded / IndependentProductionDetected
 * events. Keeps no vocabulary or mastery model of its own.
 *
 * Honesty rules implemented here (PLAN2 D2):
 *  - "familiar" means ENCOUNTERED (ItemKnowledge.exists, encounterCount >= 1) AND has a source sentence; no source => new.
 *  - a suggestion's scope is measured, not claimed: the checker is re-run on the suggested sentence; whatever it
 *    still reports is listed in `remainingIssues`; `checkerCoverage` states the checker's limits.
 *  - negation / time words / key terms / tense changes are flagged in `meaningChange`, never silent.
 *  - drafts are autosaved separately from versions and never produce evidence.
 *  - production evidence follows rule 6: nothing on check, once per (item, sentenceHash) ever, `independent` only
 *    for wording the learner had before any suggestion for that sentence was shown.
 */
import { hash, ids } from '../core';
import { ingestDocument, testimonyDocument, testimonyDocumentId } from '../ingest';
import type {
  AdapterRegistry, AnalyzedSentence, AppStore, EventBus, GoLearn, GoListen, GoTell, GoTellSuggestion, GoTellSuggestionAccepted,
  GoTellSuggestionEdited, GoTellSuggestionRejected, GoTellSuggestionShown, IndependentProductionDetected, IntentProposal,
  IntentRequest, InterpretationProvider, ItemKind, ItemKnowledge, LanguageAdapter, LanguageCode, ProductionAnalysis, ProductionKind, ProductionRecorded,
  ProductionTask, ProvenanceRef, SuggestionKind, SuggestionProvider, SuggestionSource, Testimony, TestimonyDraft, TestimonyRevision,
  TestimonyRevisionAccepted, TestimonySentence, TestimonyTextSubmitted, Text,
} from '../core';
import { checkerCoverage } from './coverage';
import { createPractice } from './productive/practice';
import { CONCEPTS, conceptsForToken, tagSection } from './concepts';
import { diffSentences } from './diff';
import { meaningChanges, negatorsIn } from './meaning';
import { RuleBasedSuggestionProvider } from './provider';
import type { AnalyzedError, ProposedSuggestion } from './provider';
import { contentStems, describeGap, intentTerms, retrieveWording } from './retrieval';
import type { IntentTerm } from './retrieval';
import { createSourceFinder, mergeSources } from './sources';
import type { SourceFinder } from './sources';
import {
  MIN_ERROR_CONFIDENCE, addsContent, bestCandidate, dice, introducedIndexes, isFunctionAt, normSet, parse, removedIndexes, wordIndexes,
} from './text';
import type { Parsed } from './text';

export type GoLearnReader = Pick<GoLearn, 'queryItem' | 'queryItems' | 'listKnown' | 'getItemState'>;

export interface GoTellDeps {
  store: AppStore;
  bus: EventBus;
  adapters: AdapterRegistry;
  golearn: GoLearnReader;
  golisten?: Pick<GoListen, 'ensureAudio'>;
  /** Extra providers, consulted in addition to the built-in RuleBasedSuggestionProvider. */
  providers?: SuggestionProvider[];
  clock?: () => string;
  /**
   * The acting user (set by the app from its session). When present, every accessor asserts that the
   * actor owns the testimony / suggestion / revision / draft it touches.
   * TODO(contract): GoTell's accessors take no userId (only assertOwner does), so privacy is bound to
   * an actor here. `forUser(userId)` returns a GoTell bound to one user.
   */
  actor?: () => string | undefined;
  /** Optional meaning interpreter for practice attempts (e.g. an LLM): validated and advisory only, never decides. */
  interpreter?: InterpretationProvider;
}

export interface GoTellService extends GoTell {
  /** A GoTell whose every accessor asserts that `userId` owns what it touches. */
  forUser(userId: string): GoTell;
}

/** Thrown (name 'DraftConflict') by saveDraft when `expectedSeq` no longer matches the stored draft. */
export class DraftConflictError extends Error {
  override name = 'DraftConflict';
  constructor(readonly current: TestimonyDraft | undefined, readonly expectedSeq: number) {
    super(`Draft changed elsewhere (you have version ${expectedSeq}, the saved draft is version ${current?.seq ?? 0}). Reload it before saving.`);
  }
}

type SentenceCtx = { sentence: AnalyzedSentence & { sectionConfidence?: number }; parsed: Parsed; errorTokens: Set<number> };
type Candidate = Omit<GoTellSuggestion, 'id' | 'userId' | 'lang' | 'testimonyId' | 'draftHash' | 'status' | 'createdAt'> & { order: number };
type KnownPhrase = { phraseId: string; display: string; pattern: string[] };

/** Slug (and so textId = ids.text(lang, slug)) of the private Text materialized from revision n. Slug-safe per src/ingest format. */
export function testimonySlug(userId: string, number: number): string {
  return testimonyDocumentId(userId, number); // one definition, owned by src/ingest
}

/** Testimony Texts live in the shared texts table; UI/GoLearn filter with this. */
export function isTestimonyText(text: Text): boolean;
export function isTestimonyText(text: Text, corpus: { kind: string }): boolean;
export function isTestimonyText(text: Text, corpus?: { kind: string }): boolean {
  return text.kind === 'testimony' || corpus?.kind === 'testimony';
}

export const MAX_SUGGESTIONS_PER_SENTENCE = 3;
export const MAX_SUGGESTIONS_PER_DRAFT = 6;

const STRENGTH: Record<ProductionKind, number> = { independent: 3, 'self-repaired': 2, assisted: 1, copied: 0 };
const unique = <T,>(xs: T[]): T[] => [...new Set(xs)];

/** Encountered = GoLearn has the item for this learner with at least one encounter (any modality, any help level). */
export function isEncountered(k: ItemKnowledge | undefined): boolean {
  return !!k && k.exists && k.encounterCount >= 1;
}

function refOf(k: ItemKnowledge): ProvenanceRef {
  return {
    itemId: k.itemId, itemKind: k.itemKind, encounterCount: k.encounterCount, textIds: [...k.textIds],
    readingLevel: k.reading.level, listeningLevel: k.listening.level, writingLevel: k.writing.level,
  };
}

/*
 * TODO(contract):
 *  - AnalyzedSentence.familiarity is documented as ">= recognized (reading)"; under policy v2 that is demonstration, so
 *    it is computed as the fraction of word tokens whose form or lemma is ENCOUNTERED (the gate GoTell uses everywhere).
 *  - SuggestionProvider.propose must return scope / remainingIssues / checkerCoverage / sources although only the service
 *    can measure them; providers return placeholders and `finalize` overwrites them.
 *  - GoTellSuggestion.scope has no value for "changes nothing the checker objects to" (a recombination on a sentence with
 *    no detected issue): it is labelled 'fixes-all-detected' with remainingIssues [] (vacuously true). UIs should key
 *    the wording on `kind` as well.
 *  - ids.suggestion(draftHash, sentenceIndex, n) carries no user scope of its own (the draft hash does).
 */
export function createGoTell(deps: GoTellDeps): GoTellService {
  const { store, bus, adapters, golearn, golisten } = deps;
  const clock = deps.clock ?? (() => new Date().toISOString());
  const providers: SuggestionProvider[] = [new RuleBasedSuggestionProvider({ adapters }), ...(deps.providers ?? [])];

  const common = (userId: string, lang: LanguageCode, session: string, dedupeKey: string) => ({
    userId, lang, surface: 'testimony' as const, session, dedupeKey, at: clock(),
  });

  // ───────────────────────── learner-state queries ─────────────────────────

  /** Phrases the learner has ENCOUNTERED in any modality (not only ones he has demonstrated). */
  async function knownPhrases(userId: string, lang: LanguageCode): Promise<KnownPhrase[]> {
    const rows = [
      ...(await golearn.listKnown(userId, lang, 'reading', 'encountered')),
      ...(await golearn.listKnown(userId, lang, 'listening', 'encountered')),
      ...(await golearn.listKnown(userId, lang, 'writing', 'encountered')),
    ];
    const seen = new Set<string>();
    const out: KnownPhrase[] = [];
    for (const r of rows) {
      if (r.itemKind !== 'phrase' || seen.has(r.itemId)) continue;
      seen.add(r.itemId);
      const ph = await store.phrases.get(r.itemId);
      if (ph && ph.lang === lang && ph.pattern.length > 0) out.push({ phraseId: ph.id, display: ph.display, pattern: ph.pattern });
    }
    return out;
  }

  async function query(userId: string, lang: LanguageCode, itemIds: string[]): Promise<Map<string, ItemKnowledge>> {
    const uniq = unique(itemIds);
    if (uniq.length === 0) return new Map();
    const ks = await golearn.queryItems(userId, uniq.map((itemId) => ({ itemId, lang })));
    return new Map(ks.map((k) => [k.itemId, k]));
  }

  function detect(adapter: LanguageAdapter, text: string): ReturnType<LanguageAdapter['checkProduction']> {
    const p = parse(adapter, text);
    return adapter.checkProduction(p.tokens, p.analyses, text).filter((e) => e.confidence >= MIN_ERROR_CONFIDENCE);
  }

  // ───────────────────────── analysis ─────────────────────────

  async function analyzeSentence(userId: string, lang: LanguageCode, adapter: LanguageAdapter, index: number, text: string): Promise<SentenceCtx> {
    const p = parse(adapter, text);
    const words = wordIndexes(p);
    const formIds = unique(words.map((i) => ids.form(lang, p.tokens[i].normalized)));
    const lemmaIds: string[] = [];
    for (const i of words) {
      const c = bestCandidate(p.analyses[i]);
      if (c?.lemma) lemmaIds.push(ids.lemma(lang, c.lemma, c.pos));
    }
    const phraseIds = unique(adapter.detectPhrases(p.tokens, p.analyses).map((c) => ids.phrase(lang, c.pattern)));
    const kmap = await query(userId, lang, [...formIds, ...lemmaIds, ...phraseIds]);

    let familiarTokens = 0;
    for (const i of words) {
      const form = kmap.get(ids.form(lang, p.tokens[i].normalized));
      const c = bestCandidate(p.analyses[i]);
      const lemma = c?.lemma ? kmap.get(ids.lemma(lang, c.lemma, c.pos)) : undefined;
      if (isEncountered(form) || isEncountered(lemma)) familiarTokens++;
    }

    const errorTokens = new Set<number>();
    const errors: AnalyzedError[] = [];
    for (const e of adapter.checkProduction(p.tokens, p.analyses, text)) {
      if (e.confidence < MIN_ERROR_CONFIDENCE) continue;
      const valid = e.tokenIndexes.filter((i) => i >= 0 && i < p.tokens.length);
      valid.forEach((i) => errorTokens.add(i));
      const span: [number, number] = valid.length
        ? [Math.min(...valid.map((i) => p.tokens[i].start)), Math.max(...valid.map((i) => p.tokens[i].end))]
        : e.suggestion ? [e.suggestion.start, e.suggestion.end] : [0, text.length];
      errors.push({ category: e.category, message: e.message, affectsMeaning: e.affectsMeaning, span, confidence: e.confidence, tokenIndexes: valid, suggestion: e.suggestion });
    }

    const tag = tagSection(lang, words.map((i) => ({ normalized: p.tokens[i].normalized, lemma: bestCandidate(p.analyses[i])?.lemma })));
    const sentence: SentenceCtx['sentence'] = {
      index,
      text,
      tokenSurfaces: p.tokens.filter((t) => t.surface.trim().length > 0).map((t) => t.surface),
      itemIds: [...formIds, ...phraseIds],
      knowledge: [...kmap.values()],
      errors,
      section: tag?.section,
      sectionConfidence: tag?.confidence,
      familiarity: words.length === 0 ? 0 : familiarTokens / words.length,
    };
    return { sentence, parsed: p, errorTokens };
  }

  /** Turn a provider proposal into a final candidate — or drop it (never-add-content rule). */
  async function finalize(
    userId: string, lang: LanguageCode, adapter: LanguageAdapter, known: KnownPhrase[], proposal: ProposedSuggestion, order: number, sources: SourceFinder,
  ): Promise<Candidate | undefined> {
    if (!proposal.suggested.trim() || proposal.suggested === proposal.original) return undefined;
    const orig = parse(adapter, proposal.original);
    const sug = parse(adapter, proposal.suggested);

    // allowed extra words: only those of known phrases the suggestion actually uses
    const usedPhraseIds = proposal.itemIds.filter((id) => id.startsWith('phrase:'));
    const allowed = new Set(known.filter((k) => usedPhraseIds.includes(k.phraseId)).flatMap((k) => k.pattern.filter((w) => w !== '_')));
    if (addsContent(adapter, orig, sug, allowed)) return undefined;

    // introduced items (computed from the diff, not trusted from the provider)
    const introduced = unique(introducedIndexes(orig, sug).map((i) => ids.form(lang, sug.tokens[i].normalized)));
    const firstIndex = new Map<string, number>();
    for (const i of introducedIndexes(orig, sug)) { const id = ids.form(lang, sug.tokens[i].normalized); if (!firstIndex.has(id)) firstIndex.set(id, i); }
    const lemmaOf = (i: number) => { const c = bestCandidate(sug.analyses[i]); return c?.lemma ? ids.lemma(lang, c.lemma, c.pos) : undefined; };
    const lemmaIds = introduced.map((id) => lemmaOf(firstIndex.get(id)!)).filter((x): x is string => !!x);
    const kmap = await query(userId, lang, [...introduced, ...lemmaIds, ...usedPhraseIds]);

    const familiar: ProvenanceRef[] = [];
    const newItems: GoTellSuggestion['newItems'] = [];
    const newSurfaces: string[] = [];
    const sourceGroups: SuggestionSource[][] = [];
    // met = encountered AND there is a sentence to point at; no source => new
    const met = async (id: string): Promise<boolean> => {
      const k = kmap.get(id);
      if (!isEncountered(k)) return false;
      const src = await sources.forItem(userId, id);
      if (src.length === 0) return false;
      familiar.push(refOf(k!));
      sourceGroups.push(src);
      return true;
    };
    for (const pid of usedPhraseIds) {
      if (!(await met(pid))) newItems.push({ itemId: pid, itemKind: 'phrase' });
    }
    for (const id of introduced) {
      const i = firstIndex.get(id)!;
      const norm = sug.tokens[i].normalized;
      if (await met(id)) continue;
      const lid = lemmaOf(i);
      if (lid && (await met(lid))) continue;
      if (allowed.has(norm)) continue; // covered by the known phrase
      if (isFunctionAt(sug, i)) continue; // closed-class words are exempt (agreement/particle fixes)
      const gloss = bestCandidate(sug.analyses[i])?.gloss;
      newItems.push({ itemId: id, itemKind: 'form', ...(gloss ? { gloss } : {}) });
      newSurfaces.push(gloss ? `${sug.tokens[i].surface} (${gloss})` : sug.tokens[i].surface);
    }

    const kind: SuggestionKind = newItems.length > 0 ? 'expansion' : proposal.kind;
    let explanation = proposal.explanation;
    if (newItems.length > 0 && newSurfaces.length > 0) explanation += ` This uses language you have not met yet: ${newSurfaces.join(', ')}.`;
    else if (newItems.length > 0) explanation += ' This uses language you have not met yet.';

    // meaning: negation, time words, key terms, tense — flagged, never silent
    const meaningChange = [proposal.meaningChange, ...meaningChanges(lang, orig, sug)].filter((x): x is string => !!x).join(' ') || undefined;

    // honest scope: re-run the checker on what we are proposing
    const remaining = unique(detect(adapter, proposal.suggested).map((e) => e.message));
    return {
      sentenceIndex: proposal.sentenceIndex,
      kind,
      original: proposal.original,
      suggested: proposal.suggested,
      explanation,
      categories: proposal.categories,
      priority: meaningChange ? 1 : proposal.priority,
      familiar,
      newItems,
      ...(meaningChange ? { meaningChange } : {}),
      scope: remaining.length === 0 ? 'fixes-all-detected' : 'partial',
      remainingIssues: remaining,
      checkerCoverage: checkerCoverage(adapter),
      sources: mergeSources(sourceGroups),
      order,
    };
  }

  async function analyzeCore(args: { userId: string; lang: LanguageCode; text: string; task: ProductionTask; contextId: string }, persist: boolean): Promise<ProductionAnalysis> {
    const { userId, lang, text, task, contextId } = args;
    const adapter = adapters.get(lang);
    // The draft hash is scoped to user + context so two learners' identical drafts never share suggestion ids.
    // TODO(contract): ids.suggestion(draftHash, sentenceIndex, n) has no user scope of its own.
    const draftHash = hash(`${userId}|${contextId}|${text}`);
    const known = await knownPhrases(userId, lang);
    const sources = createSourceFinder(store);
    const spans = adapter.segmentSentences(text).filter((s) => s.text.trim().length > 0);
    const ctxs: SentenceCtx[] = [];
    for (let i = 0; i < spans.length; i++) ctxs.push(await analyzeSentence(userId, lang, adapter, i, spans[i].text));

    const candidates: Candidate[] = [];
    let order = 0;
    for (const c of ctxs) {
      const seen = new Set<string>();
      for (const provider of providers) {
        let proposals: ProposedSuggestion[] = [];
        try {
          proposals = await provider.propose({ userId, lang, sentence: c.sentence, knownPhrases: known, task });
        } catch { continue; } // a failing provider never breaks the draft
        for (const prop of proposals) {
          const fin = await finalize(userId, lang, adapter, known, prop, order++, sources);
          if (!fin || seen.has(fin.suggested)) continue;
          seen.add(fin.suggested);
          candidates.push(fin);
        }
      }
    }

    // priority: meaning > intelligibility > reusable construction > recurrent/minor; expansions after the rest of their tier
    const rank = (a: Candidate, b: Candidate) =>
      a.priority - b.priority || Number(a.kind === 'expansion') - Number(b.kind === 'expansion') || a.sentenceIndex - b.sentenceIndex || a.order - b.order;
    candidates.sort(rank);
    const perSentence = new Map<number, number>();
    const kept: Array<GoTellSuggestion> = [];
    const createdAt = clock();
    for (const c of candidates) {
      const n = perSentence.get(c.sentenceIndex) ?? 0;
      if (n >= MAX_SUGGESTIONS_PER_SENTENCE || kept.length >= MAX_SUGGESTIONS_PER_DRAFT) continue;
      perSentence.set(c.sentenceIndex, n + 1);
      const { order: _order, ...rest } = c;
      void _order;
      kept.push({ id: ids.suggestion(draftHash, c.sentenceIndex, n), userId, lang, testimonyId: contextId, draftHash, status: 'shown', createdAt, ...rest });
    }

    const suggestions: GoTellSuggestion[] = [];
    for (const s of kept) {
      if (!persist) { if (await suggestionSourcesCurrent(s)) suggestions.push(s); continue; }
      const existing = await store.suggestions.get(s.id);
      if (existing && existing.status !== 'shown') { if (await suggestionSourcesCurrent(existing)) suggestions.push(existing); continue; } // keep the learner's decision
      // a re-check keeps the moment the suggestion was FIRST shown (provenance depends on it)
      const row: GoTellSuggestion = existing ? { ...s, createdAt: existing.createdAt } : s;
      await store.suggestions.put(row);
      if (await suggestionSourcesCurrent(row)) suggestions.push(row);
      await bus.emit<GoTellSuggestionShown>({ type: 'GoTellSuggestionShown', ...common(userId, lang, `gotell:${contextId}`, `gts-shown:${row.id}`), suggestionId: row.id, kind: row.kind });
    }

    // independent: correct items no suggestion touched
    const touched = new Set<string>();
    for (const s of suggestions) {
      const o = parse(adapter, s.original);
      const sg = parse(adapter, s.suggested);
      removedIndexes(o, sg).forEach((i) => touched.add(o.tokens[i].normalized));
    }
    const independent: string[] = [];
    for (const c of ctxs) {
      for (const i of wordIndexes(c.parsed)) {
        if (c.errorTokens.has(i) || touched.has(c.parsed.tokens[i].normalized)) continue;
        independent.push(ids.form(lang, c.parsed.tokens[i].normalized));
      }
    }
    return { draftHash, lang, sentences: ctxs.map((c) => c.sentence), suggestions, independentItemIds: unique(independent) };
  }

  /** Hide stale cached corrections when any wording source later becomes private, retired, or unpublished.
   * The persisted suggestion and event log remain intact for audit; this is only the active learner view. */
  async function suggestionSourcesCurrent(s: GoTellSuggestion): Promise<boolean> {
    for (const source of s.sources) {
      const [text, sentence] = await Promise.all([store.texts.get(source.textId), store.sentences.get(source.sentenceId)]);
      if (!text || !sentence || sentence.text !== source.excerpt || sentence.textId !== text.id || sentence.retiredInVersion !== undefined) return false;
      if ((text.listeningAssessmentId !== undefined || text.readingAssessmentId !== undefined)) return false;
      const corpus = await store.corpora.get(text.corpusId);
      const ownTestimony = text.kind === 'testimony' && text.corpusId === `testimony:${s.userId}`;
      if ((text.kind === 'testimony' || corpus?.kind === 'testimony') && !ownTestimony) return false;
      if (!ownTestimony && text.published !== true) return false;
    }
    return true;
  }

  // ───────────────────────── revisions: provenance (rule 6) ─────────────────────────

  interface ItemEvidence { itemId: string; itemKind: ItemKind; kind: ProductionKind; suggestionId?: string }

  /**
   * Classify the items of one saved sentence.
   *  - No suggestion was ever shown for (a sentence descended from) this one      => independent.
   *  - The item was in the learner's own wording BEFORE the first suggestion for it was shown => independent.
   *  - Otherwise: present in an accepted / edited suggestion => assisted; present only in a suggestion that was
   *    shown but not accepted (he typed it himself after seeing it) => copied; in neither => self-repaired.
   * Items inside a token the checker still flags get no evidence at all.
   */
  function classifySentence(adapter: LanguageAdapter, lang: LanguageCode, text: string, sugs: GoTellSuggestion[]): { items: ItemEvidence[]; used: Set<string> } {
    const p = parse(adapter, text);
    const errTokens = new Set<number>();
    for (const e of adapter.checkProduction(p.tokens, p.analyses, text)) if (e.confidence >= MIN_ERROR_CONFIDENCE) e.tokenIndexes.forEach((i) => errTokens.add(i));
    const tSet = normSet(p);
    const applied = (s: GoTellSuggestion) => (s.status === 'edited' ? s.finalText ?? s.suggested : s.suggested);

    // every suggestion whose original or applied text this sentence descends from
    const family = sugs.filter((s) => [s.original, applied(s), s.suggested].some((cand) => dice(tSet, normSet(parse(adapter, cand))) >= 0.5));
    // the earliest moment a suggestion for this sentence was shown: his wording up to then is "his own"
    const first = [...family].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1))[0];
    const ownSet = first ? normSet(parse(adapter, first.original)) : new Set<string>();
    const introduced = new Map(family.map((s) => {
      const base = normSet(parse(adapter, s.original));
      return [s.id, new Set([...normSet(parse(adapter, s.suggested))].filter((n) => !base.has(n)))] as const;
    }));

    const used = new Set<string>();
    const tokenKind = new Map<number, { kind: ProductionKind; suggestionId?: string }>();
    for (const i of wordIndexes(p)) {
      if (errTokens.has(i)) continue;
      const n = p.tokens[i].normalized;
      if (family.length === 0 || ownSet.has(n)) { tokenKind.set(i, { kind: 'independent' }); continue; }
      const accepted = family.find((s) => (s.status === 'accepted' || s.status === 'edited') && introduced.get(s.id)!.has(n));
      if (accepted) { used.add(accepted.id); tokenKind.set(i, { kind: 'assisted', suggestionId: accepted.id }); continue; }
      const shown = family.find((s) => introduced.get(s.id)!.has(n));
      if (shown) { tokenKind.set(i, { kind: 'copied', suggestionId: shown.id }); continue; }
      tokenKind.set(i, { kind: 'self-repaired' });
    }

    const items = new Map<string, ItemEvidence>();
    const put = (itemId: string, itemKind: ItemKind, ev: { kind: ProductionKind; suggestionId?: string }, strongest: boolean) => {
      const cur = items.get(itemId);
      const better = !cur || (strongest ? STRENGTH[ev.kind] > STRENGTH[cur.kind] : STRENGTH[ev.kind] < STRENGTH[cur.kind]);
      if (better) items.set(itemId, { itemId, itemKind, kind: ev.kind, ...(ev.suggestionId ? { suggestionId: ev.suggestionId } : {}) });
    };
    for (const [i, ev] of tokenKind) {
      put(ids.form(lang, p.tokens[i].normalized), 'form', ev, true);
      const c = bestCandidate(p.analyses[i]);
      if (c?.lemma) put(ids.lemma(lang, c.lemma, c.pos), 'lemma', ev, true);
    }
    for (const ph of adapter.detectPhrases(p.tokens, p.analyses)) {
      const evs = ph.tokenIndexes.map((i) => tokenKind.get(i));
      if (evs.some((e) => !e)) continue; // an erroneous token inside the phrase: no evidence
      for (const ev of evs) put(ids.phrase(lang, ph.pattern), 'phrase', ev!, false);
    }
    return { items: [...items.values()], used };
  }

  // ───────────────────────── the GoTell object ─────────────────────────

  const build = (actor: () => string | undefined): GoTell => {
    const assertActor = (userId: string) => {
      const a = actor();
      if (a !== undefined && a !== userId) throw new Error('GoTell: not permitted for this user');
    };
    const ownedTestimony = async (testimonyId: string): Promise<Testimony> => {
      const t = await store.testimonies.get(testimonyId);
      if (!t) throw new Error('GoTell: testimony not found or not owned by this user');
      assertActor(t.userId);
      return t;
    };
    const ownedSuggestion = async (id: string): Promise<GoTellSuggestion> => {
      const s = await store.suggestions.get(id);
      if (!s) throw new Error('GoTell: suggestion not found or not owned by this user');
      assertActor(s.userId);
      return s;
    };

    /** Upsert the working draft. seq is monotonic per learner + language and survives clearDraft. */
    const writeDraft = (userId: string, lang: LanguageCode, text: string, opts: { expectedSeq?: number; basedOnRevisionId?: string } = {}): Promise<TestimonyDraft> =>
      store.transaction(['drafts'], async () => {
        const id = ids.draft(userId, lang);
        const existing = await store.drafts.get(id);
        // a stale tab must not overwrite newer writing; a cleared draft (empty) holds no writing, so it never conflicts
        if (opts.expectedSeq !== undefined && existing && existing.text !== '' && opts.expectedSeq !== existing.seq) throw new DraftConflictError(existing, opts.expectedSeq);
        const based = opts.basedOnRevisionId ?? existing?.basedOnRevisionId;
        const draft: TestimonyDraft = { id, userId, lang, text, updatedAt: clock(), seq: (existing?.seq ?? 0) + 1, ...(based ? { basedOnRevisionId: based } : {}) };
        await store.drafts.put(draft);
        return draft;
      });

    const gt: GoTell = {
      // the productive engine (practice): append-only events, state folded from the log; bound to the same actor
      practice: createPractice({ store, bus, adapters, golearn, clock, actor, ...(deps.interpreter ? { interpreter: deps.interpreter } : {}) }),

      async getOrCreateTestimony(userId, lang) {
        assertActor(userId);
        const id = ids.testimony(userId, lang);
        const existing = await store.testimonies.get(id);
        if (existing) return existing;
        const t: Testimony = { id, userId, lang, title: 'My testimony', createdAt: clock() };
        await store.testimonies.put(t);
        return t;
      },

      async assertOwner(userId, testimonyId) {
        const t = await store.testimonies.get(testimonyId);
        if (!t || t.userId !== userId) throw new Error('GoTell: testimony not found or not owned by this user');
      },

      // ── drafts: autosaved, private, never evidence and never a version ──
      async getDraft(userId, lang) {
        assertActor(userId);
        const d = await store.drafts.get(ids.draft(userId, lang));
        return d && d.text !== '' ? d : undefined; // a cleared draft keeps its seq but is not a draft
      },

      async saveDraft(userId, lang, text, opts) {
        assertActor(userId);
        if (opts?.basedOnRevisionId) {
          const rev = await store.revisions.get(opts.basedOnRevisionId);
          if (!rev || rev.userId !== userId || rev.lang !== lang) throw new Error('GoTell: revision not found or not owned by this user');
        }
        return writeDraft(userId, lang, text, opts);
      },

      async clearDraft(userId, lang) {
        assertActor(userId);
        const existing = await store.drafts.get(ids.draft(userId, lang));
        if (!existing || existing.text === '') return;
        // the row stays (empty, seq advanced) so a stale tab's expectedSeq can never overwrite a later draft
        await store.drafts.put({ id: existing.id, userId, lang, text: '', updatedAt: clock(), seq: existing.seq + 1 });
      },

      async restoreRevisionAsDraft(revisionId) {
        const rev = await store.revisions.get(revisionId);
        if (!rev) throw new Error('GoTell: revision not found or not owned by this user');
        assertActor(rev.userId);
        return writeDraft(rev.userId, rev.lang, rev.fullText, { basedOnRevisionId: rev.id });
      },

      async submitDraft(testimonyId, text) {
        const t = await ownedTestimony(testimonyId);
        // checking records NO production evidence: suggestions are shown, nothing is credited
        const analysis = await analyzeCore({ userId: t.userId, lang: t.lang, text, task: 'testimony', contextId: testimonyId }, true);
        await bus.emit<TestimonyTextSubmitted>({
          type: 'TestimonyTextSubmitted', ...common(t.userId, t.lang, `gotell:${testimonyId}`, `tts:${analysis.draftHash}`),
          testimonyId, draftHash: analysis.draftHash, sentenceCount: analysis.sentences.length,
        });
        return analysis;
      },

      async analyzeProduction(args) {
        assertActor(args.userId);
        const t = await store.testimonies.get(args.contextId);
        if (t && t.userId !== args.userId) throw new Error('GoTell: testimony not found or not owned by this user');
        return analyzeCore(args, true);
      },

      async acceptSuggestion(suggestionId) {
        const s = await ownedSuggestion(suggestionId);
        if (s.status === 'accepted') return;
        await store.suggestions.put({ ...s, status: 'accepted' });
        await bus.emit<GoTellSuggestionAccepted>({
          type: 'GoTellSuggestionAccepted', ...common(s.userId, s.lang, `gotell:${s.testimonyId}`, `gts-acc:${s.id}`),
          suggestionId: s.id, kind: s.kind, itemIds: [...s.familiar.map((f) => f.itemId), ...s.newItems.map((n) => n.itemId)],
        });
      },

      async rejectSuggestion(suggestionId) {
        const s = await ownedSuggestion(suggestionId);
        if (s.status === 'rejected') return;
        await store.suggestions.put({ ...s, status: 'rejected' });
        await bus.emit<GoTellSuggestionRejected>({ type: 'GoTellSuggestionRejected', ...common(s.userId, s.lang, `gotell:${s.testimonyId}`, `gts-rej:${s.id}`), suggestionId: s.id });
      },

      async editSuggestion(suggestionId, finalText) {
        const s = await ownedSuggestion(suggestionId);
        await store.suggestions.put({ ...s, status: 'edited', finalText });
        await bus.emit<GoTellSuggestionEdited>({
          type: 'GoTellSuggestionEdited', ...common(s.userId, s.lang, `gotell:${s.testimonyId}`, `gts-edit:${s.id}:${hash(finalText)}`),
          suggestionId: s.id, finalText,
        });
      },

      async acceptRevision(testimonyId, text) {
        const t = await ownedTestimony(testimonyId);
        const adapter = adapters.get(t.lang);
        const existing = (await store.revisions.where('testimonyId', testimonyId)).sort((a, b) => a.number - b.number);
        const current = t.currentRevisionId ? existing.find((r) => r.id === t.currentRevisionId) : existing[existing.length - 1];
        if (current && current.fullText === text) return current; // idempotent: re-saving identical text adds nothing

        const number = (existing[existing.length - 1]?.number ?? 0) + 1;
        const revisionId = ids.revision(testimonyId, number);
        const spans = adapter.segmentSentences(text).filter((s) => s.text.trim().length > 0);
        const sugs = (await store.suggestions.where('testimonyId', testimonyId)).filter((s) => s.userId === t.userId);

        const sentences: TestimonySentence[] = [];
        const evidence: Array<{ sentence: TestimonySentence; items: ItemEvidence[] }> = [];
        const acceptedIds = new Set<string>();
        for (let i = 0; i < spans.length; i++) {
          const sp = parse(adapter, spans[i].text);
          const tag = tagSection(t.lang, wordIndexes(sp).map((j) => ({ normalized: sp.tokens[j].normalized, lemma: bestCandidate(sp.analyses[j])?.lemma })));
          const sentence: TestimonySentence = {
            index: i, text: spans[i].text, textHash: hash(spans[i].text),
            ...(tag ? { section: tag.section, sectionConfidence: tag.confidence } : {}),
          };
          sentences.push(sentence);
          const cls = classifySentence(adapter, t.lang, spans[i].text, sugs);
          cls.used.forEach((id) => acceptedIds.add(id));
          evidence.push({ sentence, items: cls.items });
        }

        // the accepted revision becomes a real private Text (addressable sentences/tokens for GoListen + GoLearn)
        let textId: string | undefined;
        if (sentences.length > 0) {
          const doc = testimonyDocument({ userId: t.userId, lang: t.lang, n: number, sentences: sentences.map((x) => x.text), acceptedAt: clock() });
          textId = (await ingestDocument(store, adapters, doc, { clock })).id;
        }

        const revision: TestimonyRevision = {
          id: revisionId, testimonyId, userId: t.userId, lang: t.lang, number, createdAt: clock(), fullText: text, sentences,
          ...(textId ? { textId } : {}),
          acceptedSuggestionIds: [...acceptedIds],
          ...(current ? { parentRevisionId: current.id } : {}),
        };
        await store.revisions.put(revision);
        await store.testimonies.put({ ...t, currentRevisionId: revisionId });
        // the working draft is kept; it now descends from this version (no seq bump: the writer's tab is not stale)
        const draft = await store.drafts.get(ids.draft(t.userId, t.lang));
        if (draft && draft.text !== '') await store.drafts.put({ ...draft, basedOnRevisionId: revisionId });

        const session = `gotell:${testimonyId}`;
        await bus.emit<TestimonyRevisionAccepted>({ type: 'TestimonyRevisionAccepted', ...common(t.userId, t.lang, session, `rev:${revisionId}`), testimonyId, revisionId, number });
        const independent: string[] = [];
        for (const { sentence, items } of evidence) {
          for (const it of items) {
            // rule 6: one record per (item, sentenceHash), ever - across revisions, re-saves and re-checks
            const ev = await bus.emit<ProductionRecorded>({
              type: 'ProductionRecorded',
              ...common(t.userId, t.lang, session, `prod:${t.userId}:${sentence.textHash}:${it.itemId}`),
              itemId: it.itemId, itemKind: it.itemKind, kind: it.kind, modality: 'writing', revisionId, sentenceText: sentence.text, sentenceHash: sentence.textHash,
              ...(it.suggestionId ? { suggestionId: it.suggestionId } : {}),
            });
            if (ev && it.kind === 'independent') independent.push(it.itemId);
          }
        }
        if (independent.length > 0) {
          await bus.emit<IndependentProductionDetected>({
            type: 'IndependentProductionDetected', ...common(t.userId, t.lang, session, `indep:${revisionId}`), itemIds: unique(independent), revisionId,
          });
        }

        if (golisten && revision.textId) {
          try {
            await golisten.ensureAudio(revision.textId, { runNow: false });
          } catch { /* audio is best-effort; the revision is already safely stored */ }
        }
        return revision;
      },

      async listRevisions(testimonyId) {
        await ownedTestimony(testimonyId);
        return (await store.revisions.where('testimonyId', testimonyId)).sort((a, b) => a.number - b.number);
      },

      async diffRevisions(aId, bId) {
        const [a, b] = await store.revisions.getMany([aId, bId]);
        if (!a || !b) throw new Error('GoTell: revision not found');
        assertActor(a.userId);
        assertActor(b.userId);
        if (a.userId !== b.userId) throw new Error('GoTell: revisions belong to different users');
        return diffSentences(a.sentences.map((s) => s.text), b.sentences.map((s) => s.text));
      },

      async intent(req) {
        assertActor(req.userId);
        return intentProposal(req);
      },
    };
    return gt;
  };

  // ───────────────────────── intent ─────────────────────────

  const unsupported = (limitation: string, unexpressed: string[]): IntentProposal => ({
    supported: false, insertable: false, limitation, sources: [], unexpressed, familiar: [], newItems: [],
  });

  /** Which meaning terms an attempt already expresses (precise concept or a gloss of one of its words). */
  function attemptCoverage(adapter: LanguageAdapter, lang: LanguageCode, attempt: string, terms: IntentTerm[]): { covered: Set<string>; negators: number } {
    const p = parse(adapter, attempt);
    const covered = new Set<string>();
    for (const i of wordIndexes(p)) {
      const c = bestCandidate(p.analyses[i]);
      const concepts = conceptsForToken(lang, p.tokens[i].normalized, c?.lemma);
      const gloss = c?.gloss ? contentStems(c.gloss) : new Set<string>();
      for (const t of terms) if (gloss.has(t.key) || t.concepts.some((k) => concepts.includes(k))) covered.add(t.key);
    }
    return { covered, negators: negatorsIn(lang, p).length };
  }

  async function intentProposal(req: IntentRequest): Promise<IntentProposal> {
    const { userId, lang } = req;
    const adapter = adapters.get(lang);
    const { terms, negated } = intentTerms(req.english);
    if (terms.length === 0) return unsupported(describeGap({ terms, negated, missing: [], metSeparately: [], blocked: [] }).limitation, []);
    const keyTerms = terms.filter((t) => t.concepts.some((c) => CONCEPTS[c].keyTerm)).map((t) => t.word);
    const keyNote = keyTerms.length ? `Key terms in what you said (${keyTerms.join(', ')}) are not interchangeable; GoTell will not swap one for another - choose the word you mean.` : undefined;
    const attempt = req.attempt?.trim() ? req.attempt : undefined;

    // ── an attempt that already says everything: repair it, nothing else ──
    let attemptNote: string | undefined;
    if (attempt) {
      const cov = attemptCoverage(adapter, lang, attempt, terms);
      const lacks = terms.filter((t) => !cov.covered.has(t.key));
      const polarityOk = (cov.negators > 0) === negated;
      if (lacks.length === 0 && polarityOk) return repairAttempt(req, attempt, adapter, keyNote);
      attemptNote = lacks.length
        ? `Your attempt does not yet say: ${lacks.map((t) => t.word).join(', ')}.`
        : negated ? 'Your attempt is not negative but what you said is.' : 'Your attempt is negative but what you said is not.';
    }

    // ── otherwise: wording the learner has already met ──
    const r = await retrieveWording({ store, adapters }, userId, lang, req.english);
    if (!r.best) {
      const gap = describeGap(r);
      return unsupported([attemptNote, gap.limitation].filter(Boolean).join(' '), gap.unexpressed);
    }
    const best = r.best;
    const k = await query(userId, lang, best.itemIds);
    const familiar = best.itemIds.map((id) => k.get(id)).filter((x): x is ItemKnowledge => isEncountered(x)).map(refOf);
    const source: SuggestionSource = {
      itemId: best.itemIds[0] ?? best.sentence.id, textId: best.textRow.id, textTitle: best.textRow.title,
      sentenceId: best.sentence.id, excerpt: best.sentence.text, surface: best.surface,
    };
    const notes = [
      attemptNote,
      `Taken word for word from "${best.textRow.title}": "${best.sentence.text}".`,
      best.extraWords.length ? `It also contains ${best.extraWords.map((w) => `"${w}"`).join(', ')}, which you did not ask for - keep only what you mean.` : undefined,
      'Person and tense are those of that sentence: check they fit what you mean.',
      keyNote,
    ].filter(Boolean).join(' ');
    return { supported: true, insertable: true, proposal: best.text, sources: [source], unexpressed: [], familiar, newItems: [], meaningNote: notes };
  }

  /** The attempt covers the whole meaning: offer it repaired by the checker, with the same honesty as submitDraft. */
  async function repairAttempt(req: IntentRequest, attempt: string, adapter: LanguageAdapter, keyNote: string | undefined): Promise<IntentProposal> {
    const { userId, lang } = req;
    const analysis = await analyzeCore({ userId, lang, text: attempt, task: req.task ?? 'free', contextId: 'intent' }, false);
    const pick = (allowExpansion: boolean) => analysis.sentences.map((s) => {
      const sug = analysis.suggestions.find((x) => x.sentenceIndex === s.index && !x.meaningChange && (allowExpansion || x.kind !== 'expansion'));
      return sug ? { text: sug.suggested, sug } : { text: s.text, sug: undefined };
    });
    const sep = adapter.display.wordSeparator;
    const withNew = pick(true);
    const without = pick(false);
    const join = (xs: Array<{ text: string }>) => xs.map((x) => x.text).join(sep === '' ? '' : ' ');
    const proposal = join(withNew);
    const sugs = withNew.map((x) => x.sug).filter((x): x is GoTellSuggestion => !!x);
    const familiar = [...new Map(sugs.flatMap((s) => s.familiar).map((f) => [f.itemId, f])).values()];
    const newItems: IntentProposal['newItems'] = [];
    for (const x of withNew) {
      for (const n of x.sug?.newItems ?? []) {
        const p = parse(adapter, x.text);
        const surface = wordIndexes(p).map((i) => p.tokens[i]).find((t) => ids.form(lang, t.normalized) === n.itemId)?.surface ?? n.itemId;
        newItems.push({ itemId: n.itemId, surface, ...(n.gloss ? { gloss: n.gloss } : {}), whyNeeded: 'Needed for the fix to your attempt; you have not met this word yet.' });
      }
    }
    const held = analysis.suggestions.filter((s) => s.meaningChange);
    const remaining = unique(sugs.flatMap((s) => s.remainingIssues));
    const fallbackText = join(without);
    const notes = [
      'This is your own attempt, corrected only where the checker found something.',
      held.length ? `Not applied, because it would change your meaning: ${held.map((s) => s.meaningChange).join(' ')}` : undefined,
      remaining.length ? `Still to check: ${remaining.join(' ')}` : undefined,
      analysis.suggestions[0]?.checkerCoverage ?? checkerCoverage(adapter),
      keyNote,
    ].filter(Boolean).join(' ');
    return {
      supported: true,
      insertable: true,
      proposal,
      sources: mergeSources(sugs.map((s) => s.sources)),
      unexpressed: [],
      familiar,
      newItems,
      ...(newItems.length > 0 && fallbackText !== proposal ? { fallbackWithoutNew: { text: fallbackText, lossNote: 'Leaves out fixes that need language you have not met yet; may be less correct.' } } : {}),
      meaningNote: notes,
    };
  }

  const service = build(deps.actor ?? (() => undefined));
  return { ...service, forUser: (userId: string) => build(() => userId) };
}

/**
 * GoTell service — constrained production (My Testimony).
 *
 * Reads learner state ONLY through GoLearn queries (queryItem/queryItems/listKnown/getItemState) and
 * writes productive evidence ONLY as ProductionRecorded / IndependentProductionDetected events.
 * Keeps no vocabulary or mastery model of its own.
 */
import { hash, ids, LEVEL_ORDER } from '../core';
import { CORPUS_FORMAT_VERSION, ingestDocument } from '../ingest';
import type { CorpusDocument } from '../ingest';
import type {
  AdapterRegistry, AnalyzedSentence, EventBus, GoLearn, GoListen, GoTell, GoTellSuggestion, GoTellSuggestionAccepted,
  GoTellSuggestionEdited, GoTellSuggestionRejected, GoTellSuggestionShown, IndependentProductionDetected, IntentProposal,
  IntentRequest, ItemKnowledge, LanguageAdapter, LanguageCode, ProductionAnalysis, ProductionKind, ProductionRecorded,
  ProductionTask, ProvenanceRef, SuggestionProvider, Testimony, TestimonyRevision, TestimonyRevisionAccepted,
  TestimonySentence, TestimonyTextSubmitted, Text, AppStore, SuggestionKind, ItemKind, PartOfSpeech,
} from '../core';
import { CONCEPTS, conceptsForToken, englishConcepts, lexemesFor, tagSection } from './concepts';
import type { ConceptId } from './concepts';
import { diffSentences } from './diff';
import { RuleBasedSuggestionProvider } from './provider';
import type { AnalyzedError, ProposedSuggestion } from './provider';
import {
  MIN_ERROR_CONFIDENCE, addsContent, bestCandidate, dice, introducedIndexes, isFunctionAt, normSet, parse, related,
  removedIndexes, wordIndexes,
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
   * actor owns the testimony / suggestion / revision it touches.
   * TODO(contract): GoTell's accessors take no userId (only assertOwner does), so privacy is bound to
   * an actor here. `forUser(userId)` returns a GoTell bound to one user.
   */
  actor?: () => string | undefined;
}

export interface GoTellService extends GoTell {
  /** A GoTell whose every accessor asserts that `userId` owns what it touches. */
  forUser(userId: string): GoTell;
}

/** TODO(contract): GoTellSuggestion has no `finalText`; edited suggestions keep it as an extra stored field. */
type StoredSuggestion = GoTellSuggestion & { finalText?: string };
type SentenceCtx = { sentence: AnalyzedSentence & { sectionConfidence?: number }; parsed: Parsed; errorTokens: Set<number> };
type Candidate = Omit<GoTellSuggestion, 'id' | 'userId' | 'lang' | 'testimonyId' | 'draftHash' | 'status' | 'createdAt'> & { order: number };
type KnownPhrase = { phraseId: string; display: string; pattern: string[] };

/** Slug (and so textId = ids.text(lang, slug)) of the private Text materialized from revision n. Slug-safe per src/ingest format. */
export function testimonySlug(userId: string, number: number): string {
  const safe = userId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const user = safe && safe === userId ? safe : `${safe || 'u'}-${hash(userId).slice(0, 6)}`;
  return `testimony-${user}-r${number}`;
}

/** Testimony Texts live in the shared texts table; UI/GoLearn filter with this. */
export function isTestimonyText(text: Text): boolean {
  return text.kind === 'testimony';
}

function testimonyDocument(userId: string, lang: LanguageCode, number: number, sentences: string[]): CorpusDocument {
  return {
    formatVersion: CORPUS_FORMAT_VERSION,
    lang,
    slug: testimonySlug(userId, number),
    title: `My testimony (revision ${number})`,
    kind: 'testimony',
    corpus: { id: `testimony:${userId}`, kind: 'testimony', title: 'My Testimony' },
    source: { id: `src:testimony:${userId}`, title: 'Learner testimony', rights: 'user-private', authorship: 'learner' },
    sourceNote: `The learner's own private writing, accepted as revision ${number} in GoTell. Never shared or used as course content.`,
    tags: ['private', 'testimony'],
    generated: false,
    sections: [{ paragraphs: [{ sentences: sentences.map((text) => ({ text })) }] }],
  };
}

export const MAX_SUGGESTIONS_PER_SENTENCE = 3;
export const MAX_SUGGESTIONS_PER_DRAFT = 6;

const STRENGTH: Record<ProductionKind, number> = { independent: 3, 'self-repaired': 2, assisted: 1, copied: 0 };
const unique = <T,>(xs: T[]): T[] => [...new Set(xs)];
const levelIdx = (l: string) => LEVEL_ORDER.indexOf(l as (typeof LEVEL_ORDER)[number]);

/** Encountered in any way (reading/listening/writing/speaking evidence or an encounter count). */
export function isEncountered(k: ItemKnowledge | undefined): boolean {
  if (!k || !k.exists) return false;
  return k.encounterCount > 0 || [k.reading, k.listening, k.writing, k.speaking].some((d) => levelIdx(d.level) > 0);
}

function refOf(k: ItemKnowledge): ProvenanceRef {
  return {
    itemId: k.itemId, itemKind: k.itemKind, encounterCount: k.encounterCount, textIds: [...k.textIds],
    readingLevel: k.reading.level, listeningLevel: k.listening.level, writingLevel: k.writing.level,
  };
}

export function createGoTell(deps: GoTellDeps): GoTellService {
  const { store, bus, adapters, golearn, golisten } = deps;
  const clock = deps.clock ?? (() => new Date().toISOString());
  const providers: SuggestionProvider[] = [new RuleBasedSuggestionProvider({ adapters }), ...(deps.providers ?? [])];

  const common = (userId: string, lang: LanguageCode, session: string, dedupeKey: string) => ({
    userId, lang, surface: 'testimony' as const, session, dedupeKey, at: clock(),
  });

  // ───────────────────────── learner-state queries ─────────────────────────

  async function knownPhrases(userId: string, lang: LanguageCode): Promise<KnownPhrase[]> {
    const rows = await golearn.listKnown(userId, lang, 'reading', 'recognized');
    const out: KnownPhrase[] = [];
    for (const r of rows) {
      if (r.itemKind !== 'phrase') continue;
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
      const rec = (k?: ItemKnowledge) => !!k && levelIdx(k.reading.level) >= levelIdx('recognized');
      if (rec(form) || rec(lemma)) familiarTokens++;
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
  async function finalize(userId: string, lang: LanguageCode, adapter: LanguageAdapter, known: KnownPhrase[], proposal: ProposedSuggestion, order: number): Promise<Candidate | undefined> {
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
    for (const pid of usedPhraseIds) {
      const k = kmap.get(pid);
      if (isEncountered(k)) familiar.push(refOf(k!));
      else newItems.push({ itemId: pid, itemKind: 'phrase' });
    }
    for (const id of introduced) {
      const i = firstIndex.get(id)!;
      const norm = sug.tokens[i].normalized;
      const k = kmap.get(id);
      if (isEncountered(k)) { familiar.push(refOf(k!)); continue; }
      const lid = lemmaOf(i);
      const lk = lid ? kmap.get(lid) : undefined;
      if (isEncountered(lk)) { familiar.push(refOf(lk!)); continue; }
      if (k?.relatedSeen) continue; // an inflection of something the learner has met
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

    const computed = keyTermChange(lang, orig, sug);
    const meaningChange = [proposal.meaningChange, computed].filter((x): x is string => !!x).join(' ') || undefined;
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
      order,
    };
  }

  function keyTermMap(lang: LanguageCode, p: Parsed): Map<ConceptId, string> {
    const m = new Map<ConceptId, string>();
    for (const i of wordIndexes(p)) {
      const lemma = bestCandidate(p.analyses[i])?.lemma;
      for (const c of conceptsForToken(lang, p.tokens[i].normalized, lemma)) if (CONCEPTS[c].keyTerm && !m.has(c)) m.set(c, p.tokens[i].surface);
    }
    return m;
  }

  function keyTermChange(lang: LanguageCode, orig: Parsed, sug: Parsed): string | undefined {
    const a = keyTermMap(lang, orig);
    const b = keyTermMap(lang, sug);
    const removed = [...a.keys()].filter((c) => !b.has(c));
    const added = [...b.keys()].filter((c) => !a.has(c));
    const fmt = (m: Map<ConceptId, string>, cs: ConceptId[]) => cs.map((c) => `"${m.get(c)}" (${c})`).join(', ');
    if (removed.length && added.length) return `Changes a key term: ${fmt(a, removed)} becomes ${fmt(b, added)}. These are not interchangeable - accept only if it says what you mean.`;
    if (removed.length) return `Removes the key term ${fmt(a, removed)}. Accept only if you meant to leave it out.`;
    if (added.length) return `Introduces the key term ${fmt(b, added)}. Accept only if you meant to say it.`;
    return undefined;
  }

  async function analyzeCore(args: { userId: string; lang: LanguageCode; text: string; task: ProductionTask; contextId: string }, persist: boolean): Promise<ProductionAnalysis> {
    const { userId, lang, text, task, contextId } = args;
    const adapter = adapters.get(lang);
    // The draft hash is scoped to user + context so two learners' identical drafts never share suggestion ids.
    // TODO(contract): ids.suggestion(draftHash, sentenceIndex, n) has no user scope of its own.
    const draftHash = hash(`${userId}|${contextId}|${text}`);
    const known = await knownPhrases(userId, lang);
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
          const fin = await finalize(userId, lang, adapter, known, prop, order++);
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
      if (!persist) { suggestions.push(s); continue; }
      const existing = await store.suggestions.get(s.id);
      if (existing && existing.status !== 'shown') { suggestions.push(existing); continue; } // keep the learner's decision
      await store.suggestions.put(s);
      suggestions.push(s);
      await bus.emit<GoTellSuggestionShown>({ type: 'GoTellSuggestionShown', ...common(userId, lang, `gotell:${contextId}`, `gts-shown:${s.id}`), suggestionId: s.id, kind: s.kind });
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

  // ───────────────────────── revisions: classification ─────────────────────────

  interface ItemEvidence { itemId: string; itemKind: ItemKind; kind: ProductionKind; suggestionId?: string }

  function classifySentence(adapter: LanguageAdapter, lang: LanguageCode, text: string, sugs: StoredSuggestion[]): { items: ItemEvidence[]; used: Set<string> } {
    const p = parse(adapter, text);
    const errTokens = new Set<number>();
    for (const e of adapter.checkProduction(p.tokens, p.analyses, text)) if (e.confidence >= MIN_ERROR_CONFIDENCE) e.tokenIndexes.forEach((i) => errTokens.add(i));
    const tSet = normSet(p);
    const applied = (s: StoredSuggestion) => (s.status === 'edited' ? s.finalText ?? s.suggested : s.suggested);

    // the suggestion family this sentence descends from (best token overlap with any original/applied text)
    let best: StoredSuggestion | undefined;
    let bestSim = 0;
    for (const s of sugs) {
      for (const cand of [s.original, applied(s)]) {
        const sim = dice(tSet, normSet(parse(adapter, cand)));
        if (sim > bestSim) { bestSim = sim; best = s; }
      }
    }
    const family = best && bestSim >= 0.5 ? sugs.filter((s) => s.original === best!.original) : [];
    const origSet = family.length ? normSet(parse(adapter, family[0].original)) : new Set<string>();
    const introducedBy = (s: StoredSuggestion) => { const sg = normSet(parse(adapter, s.suggested)); return new Set([...sg].filter((n) => !origSet.has(n))); };
    const touchedBy = (s: StoredSuggestion) => { const sg = normSet(parse(adapter, s.suggested)); return new Set([...origSet].filter((n) => !sg.has(n))); };
    const introduced = new Map(family.map((s) => [s.id, introducedBy(s)]));
    const alteredSpot = family.some((s) => [...touchedBy(s)].some((n) => !tSet.has(n)));

    const used = new Set<string>();
    const tokenKind = new Map<number, { kind: ProductionKind; suggestionId?: string }>();
    for (const i of wordIndexes(p)) {
      if (errTokens.has(i)) continue;
      const n = p.tokens[i].normalized;
      if (family.length === 0 || origSet.has(n)) { tokenKind.set(i, { kind: 'independent' }); continue; }
      const accepted = family.find((s) => (s.status === 'accepted' || s.status === 'edited') && introduced.get(s.id)!.has(n));
      if (accepted) { used.add(accepted.id); tokenKind.set(i, { kind: 'assisted', suggestionId: accepted.id }); continue; }
      const shown = family.find((s) => introduced.get(s.id)!.has(n));
      if (shown) { tokenKind.set(i, { kind: 'copied', suggestionId: shown.id }); continue; }
      tokenKind.set(i, { kind: alteredSpot ? 'self-repaired' : 'independent' });
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
    const ownedSuggestion = async (id: string): Promise<StoredSuggestion> => {
      const s = (await store.suggestions.get(id)) as StoredSuggestion | undefined;
      if (!s) throw new Error('GoTell: suggestion not found or not owned by this user');
      assertActor(s.userId);
      return s;
    };

    const gt: GoTell = {
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

      async submitDraft(testimonyId, text) {
        const t = await ownedTestimony(testimonyId);
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
        await store.suggestions.put({ ...s, status: 'edited', finalText } as StoredSuggestion);
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
        const sugs = ((await store.suggestions.where('testimonyId', testimonyId)) as StoredSuggestion[]).filter((s) => s.userId === t.userId);

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
          const doc = testimonyDocument(t.userId, t.lang, number, sentences.map((x) => x.text));
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

        const session = `gotell:${testimonyId}`;
        await bus.emit<TestimonyRevisionAccepted>({ type: 'TestimonyRevisionAccepted', ...common(t.userId, t.lang, session, `rev:${revisionId}`), testimonyId, revisionId, number });
        const independent: string[] = [];
        for (const { sentence, items } of evidence) {
          for (const it of items) {
            const ev = await bus.emit<ProductionRecorded>({
              type: 'ProductionRecorded',
              ...common(t.userId, t.lang, session, `prod:${testimonyId}:${sentence.textHash}:${it.kind}:${it.itemId}`),
              itemId: it.itemId, itemKind: it.itemKind, kind: it.kind, modality: 'writing', revisionId, sentenceText: sentence.text,
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

  function surfaceFor(adapter: LanguageAdapter, lang: LanguageCode, text: string, itemId: string): string | undefined {
    const p = parse(adapter, text);
    for (const i of wordIndexes(p)) if (ids.form(lang, p.tokens[i].normalized) === itemId) return p.tokens[i].surface;
    return undefined;
  }

  async function intentProposal(req: IntentRequest): Promise<IntentProposal> {
    const { userId, lang } = req;
    const adapter = adapters.get(lang);
    const sep = adapter.display.wordSeparator;
    const requested = englishConcepts(req.english);
    const keyTerms = requested.filter((r) => CONCEPTS[r.concept].keyTerm).map((r) => r.word);
    const keyNote = keyTerms.length ? `Key terms in what you said (${keyTerms.join(', ')}) are not interchangeable; GoTell will not swap one for another - choose the word you mean.` : undefined;

    // ── with an attempt: repair it from his own language ──
    if (req.attempt && req.attempt.trim()) {
      const analysis = await analyzeCore({ userId, lang, text: req.attempt, task: req.task ?? 'free', contextId: 'intent' }, false);
      const pick = (allowExpansion: boolean) => analysis.sentences.map((s) => {
        const sug = analysis.suggestions.find((x) => x.sentenceIndex === s.index && !x.meaningChange && (allowExpansion || x.kind !== 'expansion'));
        return sug ? { text: sug.suggested, sug } : { text: s.text, sug: undefined };
      });
      const withNew = pick(true);
      const without = pick(false);
      const proposal = withNew.map((x) => x.text).join(' ');
      const familiar = unique(withNew.flatMap((x) => x.sug?.familiar ?? []).map((f) => f.itemId)).map((id) => withNew.flatMap((x) => x.sug?.familiar ?? []).find((f) => f.itemId === id)!);
      const newItems: IntentProposal['newItems'] = [];
      for (const x of withNew) {
        for (const n of x.sug?.newItems ?? []) {
          newItems.push({ itemId: n.itemId, surface: surfaceFor(adapter, lang, x.text, n.itemId) ?? n.itemId, ...(n.gloss ? { gloss: n.gloss } : {}), whyNeeded: 'Needed for the fix to your attempt; you have not met this word yet.' });
        }
      }
      const attemptParsed = analysis.sentences.map((s) => parse(adapter, s.text));
      const present = new Set<ConceptId>();
      for (const pp of attemptParsed) for (const i of wordIndexes(pp)) conceptsForToken(lang, pp.tokens[i].normalized, bestCandidate(pp.analyses[i])?.lemma).forEach((c) => present.add(c));
      const missing = requested.filter((r) => !present.has(r.concept)).map((r) => r.word);
      const notes = [keyNote, missing.length ? `Your attempt does not yet include: ${missing.join(', ')}.` : undefined].filter(Boolean).join(' ');
      const fallbackText = without.map((x) => x.text).join(' ');
      return {
        proposal,
        familiar,
        newItems,
        ...(newItems.length > 0 && fallbackText !== proposal ? { fallbackWithoutNew: { text: fallbackText, lossNote: 'Leaves out fixes that need language you have not met yet; may be less correct.' } } : {}),
        ...(notes ? { meaningNote: notes } : {}),
      };
    }

    // ── without an attempt: a word bank for his ideas, chosen from what he knows ──
    const concepts = requested.map((r) => ({ ...r, lexemes: lexemesFor(lang, r.concept) }));
    const supported = concepts.filter((c) => c.lexemes.length > 0);
    const unsupported = concepts.filter((c) => c.lexemes.length === 0).map((c) => c.word);
    const formIdOf = (lx: string) => ids.form(lang, adapter.normalize(lx));
    // a lexeme is "known" if its form or its lemma (lemma ids carry a POS when the analysis had one) was met
    const LEMMA_POS: Array<PartOfSpeech | undefined> = [undefined, 'VERB', 'NOUN', 'ADJ', 'ADV', 'PROPN'];
    const idsFor = (lx: string) => [formIdOf(lx), ...LEMMA_POS.map((pos) => ids.lemma(lang, adapter.normalize(lx), pos))];
    const kmap = await query(userId, lang, supported.flatMap((c) => c.lexemes.flatMap(idsFor)));
    const bestKnowledge = (lx: string): ItemKnowledge | undefined => idsFor(lx)
      .map((id) => kmap.get(id))
      .filter((k): k is ItemKnowledge => isEncountered(k))
      .sort((a, b) => levelIdx(b.reading.level) - levelIdx(a.reading.level) || b.encounterCount - a.encounterCount)[0];
    const chosen = supported.map((c) => {
      const knownLx = c.lexemes
        .filter((lx) => bestKnowledge(lx))
        .sort((a, b) => levelIdx(bestKnowledge(b)!.reading.level) - levelIdx(bestKnowledge(a)!.reading.level) || bestKnowledge(b)!.encounterCount - bestKnowledge(a)!.encounterCount)[0];
      return { concept: c.concept, english: c.word, lexemes: c.lexemes, word: knownLx ?? c.lexemes[0], known: !!knownLx, knowledge: knownLx ? bestKnowledge(knownLx) : undefined };
    });

    const phrases = await knownPhrases(userId, lang);
    const phraseUse = (() => {
      for (const ph of phrases) {
        if (ph.pattern.filter((w) => w === '_').length > 1) continue;
        for (const c of chosen) {
          const hit = ph.pattern.some((w) => w !== '_' && c.lexemes.some((lx) => related(adapter, w, adapter.normalize(lx))));
          if (hit) return { phrase: ph, covers: c.concept };
        }
      }
      return undefined;
    })();
    const pk = phraseUse ? (await query(userId, lang, [phraseUse.phrase.phraseId])).get(phraseUse.phrase.phraseId) : undefined;
    const coversIdx = phraseUse ? chosen.findIndex((c) => c.concept === phraseUse.covers) : -1;
    const slotAfter = !!phraseUse && phraseUse.phrase.pattern[phraseUse.phrase.pattern.length - 1] === '_';
    const hasSlot = !!phraseUse && phraseUse.phrase.pattern.includes('_');
    const slotConcept = phraseUse && hasSlot ? chosen[slotAfter ? coversIdx + 1 : coversIdx - 1] : undefined;

    const assemble = (include: (c: (typeof chosen)[number]) => boolean) => {
      const slotC = slotConcept && include(slotConcept) ? slotConcept : undefined;
      const parts: string[] = [];
      for (const c of chosen) {
        if (phraseUse && c.concept === phraseUse.covers) {
          parts.push(phraseUse.phrase.pattern.filter((w) => w !== '_' || slotC).map((w) => (w === '_' ? slotC!.word : w)).join(sep));
        } else if (c === slotC) continue;
        else if (include(c)) parts.push(c.word);
      }
      return parts.join(sep);
    };

    const proposal = assemble(() => true);
    const familiar: ProvenanceRef[] = [];
    if (phraseUse && pk && isEncountered(pk)) familiar.push(refOf(pk));
    const newItems: IntentProposal['newItems'] = [];
    for (const c of chosen) {
      if (phraseUse && c.concept === phraseUse.covers) continue;
      if (c.known && c.knowledge) familiar.push(refOf(c.knowledge));
      else newItems.push({ itemId: formIdOf(c.word), surface: c.word, gloss: c.english, whyNeeded: `Needed to say "${c.english}"; you have not met a word for it yet.` });
    }
    const knownCount = chosen.filter((c) => c.known || (phraseUse && c.concept === phraseUse.covers)).length;
    const fallbackText = assemble((c) => c.known);
    const missing = chosen.filter((c) => !c.known && !(phraseUse && c.concept === phraseUse.covers)).map((c) => c.english);
    const notes = [
      'This is a set of words for the ideas in your English, not a finished sentence - put them together yourself.',
      keyNote,
      unsupported.length ? `No wording available yet for: ${unsupported.join(', ')}.` : undefined,
    ].filter(Boolean).join(' ');
    return {
      proposal,
      familiar,
      newItems,
      ...(newItems.length > 0 && knownCount > 0 ? { fallbackWithoutNew: { text: fallbackText, lossNote: `Leaves out: ${missing.join(', ')} - you have not met words for ${missing.length > 1 ? 'them' : 'it'} yet, so this says less than you meant.` } } : {}),
      meaningNote: notes,
    };
  }

  const service = build(deps.actor ?? (() => undefined));
  return { ...service, forUser: (userId: string) => build(() => userId) };
}


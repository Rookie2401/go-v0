/**
 * Test doubles for GoTell: a tiny configurable LanguageAdapter (Latin/Devanagari regex tokenizer,
 * greedy lexicon segmentation for Thai — no whitespace assumption) and a fake GoLearn that answers
 * the four queries GoTell uses from an in-memory map of per-learner state.
 * These are TEST-ONLY; production code depends on the contracts in src/core only.
 */
import { createMemoryStore, StoreEventBus, ids, itemKindOf, LEVEL_ORDER, buildFixtureText, seedBasics } from '../../src/core';
import type {
  AdapterRegistry, AdapterSupport, AnalyzedToken, AppStore, DimensionState, Encounter, ErrorCandidate, ErrorCategory, ItemKnowledge, LanguageAdapter,
  LanguageCode, LearnerItemState, LearnerLevel, PartOfSpeech, PhraseCandidate, RawToken, Script, FixtureSentence,
} from '../../src/core';
import type { GoLearnReader } from '../../src/gotell';
import { createGoTell } from '../../src/gotell';

export interface FakeLex { lemma: string; pos: PartOfSpeech; morph?: Record<string, string>; gloss?: string }
export interface FakeRule {
  match: string[];
  replace: string[];
  category: ErrorCategory;
  message: string;
  affectsMeaning?: boolean;
  confidence?: number;
  /** Sentence must also contain all of these (normalized) tokens for the rule to fire. */
  requires?: string[];
  /** The checker detects this issue but has no replacement for it (a problem it cannot fix). */
  detectOnly?: boolean;
}
export interface FakeAdapterConfig {
  lang: LanguageCode;
  lexicon: Record<string, FakeLex>;
  rules?: FakeRule[];
  phrases?: string[][];
  support?: Partial<AdapterSupport>;
}

const scriptOf = (lang: LanguageCode): Script => (lang === 'th' ? 'Thai' : lang === 'hi' ? 'Deva' : 'Latn');

export function makeFakeAdapter(cfg: FakeAdapterConfig): LanguageAdapter {
  const { lang, lexicon } = cfg;
  const caseless = lang === 'th' || lang === 'hi';
  const norm = (s: string) => (caseless ? s.normalize('NFC') : s.normalize('NFC').toLowerCase());
  const lex = new Map(Object.entries(lexicon).map(([k, v]) => [norm(k), v]));
  const sep = lang === 'th' ? '' : ' ';
  const isWordStr = (s: string) => /[\p{L}\p{N}]/u.test(s);

  const tokenize = (text: string): RawToken[] => {
    const out: RawToken[] = [];
    if (lang === 'th') {
      const keys = [...lex.keys()].sort((a, b) => b.length - a.length);
      let i = 0;
      let unknownStart = -1;
      const flushUnknown = (end: number) => {
        if (unknownStart >= 0) {
          const surface = text.slice(unknownStart, end);
          out.push({ surface, start: unknownStart, end, isWord: true, normalized: norm(surface) });
          unknownStart = -1;
        }
      };
      while (i < text.length) {
        if (/\s/u.test(text[i])) { flushUnknown(i); i++; continue; }
        const k = keys.find((key) => text.startsWith(key, i));
        if (k) { flushUnknown(i); out.push({ surface: k, start: i, end: i + k.length, isWord: true, normalized: norm(k) }); i += k.length; }
        else { if (unknownStart < 0) unknownStart = i; i++; }
      }
      flushUnknown(text.length);
      return out;
    }
    for (const m of text.matchAll(/[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu)) {
      out.push({ surface: m[0], start: m.index!, end: m.index! + m[0].length, isWord: isWordStr(m[0]), normalized: norm(m[0]) });
    }
    return out;
  };

  const analyze = (tokens: RawToken[]): AnalyzedToken[] => tokens.map((token) => {
    const l = token.isWord ? lex.get(token.normalized) : undefined;
    return {
      token,
      candidates: l ? [{ lemma: l.lemma, pos: l.pos, morph: l.morph ?? {}, confidence: 0.9, gloss: l.gloss }] : [],
      analyzer: `fake-${lang}@1`,
    };
  });

  const support: AdapterSupport = {
    tokenization: 'limited', sentenceSegmentation: 'limited', lemmatization: 'seed-only', morphology: 'seed-only', phraseDetection: 'seed-only',
    productionChecks: 'seed-only', limitations: ['Test adapter: a handful of hand-written rules.'], ...cfg.support,
  };
  return {
    lang,
    name: `fake-${lang}`,
    script: scriptOf(lang),
    version: '1',
    support,
    segmentSentences(text) {
      const re = lang === 'th' ? /\S+/gu : /[^.!?।]+[.!?।]*/gu;
      const spans: Array<{ start: number; end: number; text: string }> = [];
      for (const m of text.matchAll(re)) {
        const raw = m[0];
        const lead = raw.length - raw.trimStart().length;
        const t = raw.trim();
        if (!t) continue;
        spans.push({ start: m.index! + lead, end: m.index! + lead + t.length, text: t });
      }
      return spans;
    },
    tokenize,
    normalize: norm,
    searchNormalize: norm,
    analyze,
    detectPhrases(tokens): PhraseCandidate[] {
      const out: PhraseCandidate[] = [];
      for (const pattern of cfg.phrases ?? []) {
        const fixed = pattern.filter((w) => w !== '_').map(norm);
        for (let i = 0; i + fixed.length <= tokens.length; i++) {
          if (fixed.every((w, k) => tokens[i + k].isWord && tokens[i + k].normalized === w)) {
            out.push({ pattern: pattern.map((w) => (w === '_' ? w : norm(w))), display: pattern.map((w) => (w === '_' ? '…' : w)).join(sep), kind: 'frame', tokenIndexes: fixed.map((_, k) => i + k), confidence: 0.9 });
          }
        }
      }
      return out;
    },
    detectPatterns: () => [],
    pronunciation: () => ({}),
    speechNormalize: (t) => ({ speechText: t, transformations: [], normalizerVersion: 'fake@1' }),
    display: { wordSeparator: sep, showBoundariesOnHighlight: lang === 'th' },
    checkProduction(tokens, _analyses, _sentence): ErrorCandidate[] {
      const out: ErrorCandidate[] = [];
      const all = new Set(tokens.filter((t) => t.isWord).map((t) => t.normalized));
      for (const rule of cfg.rules ?? []) {
        if (rule.requires && !rule.requires.every((r) => all.has(norm(r)))) continue;
        const match = rule.match.map(norm);
        for (let i = 0; i + match.length <= tokens.length; i++) {
          if (!match.every((w, k) => tokens[i + k].isWord && tokens[i + k].normalized === w)) continue;
          if (rule.detectOnly) {
            out.push({ category: rule.category, tokenIndexes: match.map((_, k) => i + k), message: rule.message, confidence: rule.confidence ?? 0.9, affectsMeaning: rule.affectsMeaning ?? false });
            continue;
          }
          let pre = 0;
          while (pre < match.length && pre < rule.replace.length && match[pre] === norm(rule.replace[pre])) pre++;
          let suf = 0;
          while (suf < match.length - pre && suf < rule.replace.length - pre && match[match.length - 1 - suf] === norm(rule.replace[rule.replace.length - 1 - suf])) suf++;
          const midTokens = match.length - pre - suf;
          if (midTokens <= 0) continue;
          const replacement = rule.replace.slice(pre, rule.replace.length - suf).join(sep);
          out.push({
            category: rule.category,
            tokenIndexes: match.map((_, k) => i + k),
            message: rule.message,
            suggestion: { start: tokens[i + pre].start, end: tokens[i + match.length - suf - 1].end, replacement },
            confidence: rule.confidence ?? 0.9,
            affectsMeaning: rule.affectsMeaning ?? false,
          });
        }
      }
      return out;
    },
    relate(a, b) {
      if (a === b) return 'same';
      const la = lex.get(a)?.lemma;
      const lb = lex.get(b)?.lemma;
      return la && lb && la === lb ? 'inflection' : 'none';
    },
  };
}

export function makeRegistry(adapters: LanguageAdapter[]): AdapterRegistry {
  const m = new Map(adapters.map((a) => [a.lang, a]));
  return {
    get(lang) { const a = m.get(lang); if (!a) throw new Error(`no fake adapter for ${lang}`); return a; },
    all: () => [...m.values()],
  };
}

// ───────────────────────── fake GoLearn ─────────────────────────

const unseen = (): DimensionState => ({ level: 'unseen', confidence: 0, evidence: 0, exposures: 0, estimatedFamiliar: false, unassisted: 0, assisted: 0 });
const levelIdx = (l: LearnerLevel) => LEVEL_ORDER.indexOf(l);

export class FakeGoLearn implements GoLearnReader {
  private rows = new Map<string, LearnerItemState>();
  queries = 0;
  constructor(private readonly store: AppStore) {}

  /** Record that `userId` has met `itemId` (reading evidence at `level`). */
  learn(userId: string, lang: LanguageCode, itemId: string, opts: { level?: LearnerLevel; count?: number; textIds?: string[]; dimension?: 'reading' | 'listening' | 'writing' } = {}) {
    const key = ids.learnerItem(userId, itemId);
    const level = opts.level ?? 'recognized';
    const count = opts.count ?? 2;
    const row: LearnerItemState = this.rows.get(key) ?? {
      id: key, userId, lang, itemId, itemKind: itemKindOf(itemId), reading: unseen(), listening: unseen(), writing: unseen(), speaking: unseen(),
      encounterCount: 0, textIds: [],
    };
    const dim = opts.dimension ?? 'reading';
    const cur = row[dim];
    row[dim] = { level: levelIdx(level) > levelIdx(cur.level) ? level : cur.level, confidence: 0.8, evidence: cur.evidence + count, exposures: cur.exposures + count, estimatedFamiliar: false, unassisted: cur.unassisted + count, assisted: 0 };
    row.encounterCount += count;
    row.textIds = [...new Set([...row.textIds, ...(opts.textIds ?? [])])];
    this.rows.set(key, row);
  }

  /** Mark every form, lemma and phrase of a fixture text as read by the learner. */
  async learnText(userId: string, textId: string, level: LearnerLevel = 'recognized') {
    const text = (await this.store.texts.get(textId))!;
    const surface = text.kind === 'scripture' ? 'scripture' : 'corpus';
    for (const t of await this.store.tokens.where('textId', textId)) {
      if (!t.isWord) continue;
      this.learn(userId, text.lang, t.formId, { level, count: 1, textIds: [textId] });
      await this.encounter(userId, text.lang, t.formId, t.sentenceId, textId, surface);
      for (const a of await this.store.analyses.where('tokenId', t.id)) {
        if (!a.lemmaId) continue;
        this.learn(userId, text.lang, a.lemmaId, { level, count: 1, textIds: [textId] });
        await this.encounter(userId, text.lang, a.lemmaId, t.sentenceId, textId, surface);
      }
    }
    for (const po of await this.store.phraseOccurrences.where('textId', textId)) {
      this.learn(userId, text.lang, po.phraseId, { level, count: 2, textIds: [textId] });
      await this.encounter(userId, text.lang, po.phraseId, po.sentenceId, textId, surface);
    }
  }

  /** The encounter row GoLearn would have written (sources and intent retrieval read these). */
  async encounter(userId: string, lang: LanguageCode, itemId: string, sentenceId: string, textId: string, surface: Encounter['surface'] = 'corpus') {
    const id = ids.encounter(userId, itemId, sentenceId, 'reading', 'fixture');
    await this.store.encounters.put({
      id, userId, lang, itemId, itemKind: itemKindOf(itemId), sentenceId, textId, surface, modality: 'reading', at: '2026-01-15T00:00:00.000Z',
      evidenceKind: 'exposure', assistance: 0, priorLevel: 'unseen', weight: 0,
    });
  }

  private knowledge(userId: string, itemId: string): ItemKnowledge {
    const row = this.rows.get(ids.learnerItem(userId, itemId));
    if (!row) {
      return { itemId, itemKind: itemKindOf(itemId), exists: false, encounterCount: 0, textIds: [], reading: unseen(), listening: unseen(), writing: unseen(), speaking: unseen(), exactFormSeen: false, relatedSeen: false, exposureCount: 0, assistedCount: 0, demonstratedCount: 0, productionEvidence: { independent: 0, selfRepaired: 0, assisted: 0, copied: 0 } };
    }
    return { itemId, itemKind: row.itemKind, exists: true, encounterCount: row.encounterCount, textIds: [...row.textIds], reading: row.reading, listening: row.listening, writing: row.writing, speaking: row.speaking, exactFormSeen: true, relatedSeen: false, exposureCount: row.reading.exposures, assistedCount: 0, demonstratedCount: 0, productionEvidence: { independent: 0, selfRepaired: 0, assisted: 0, copied: 0 } };
  }

  async getItemState(userId: string, itemId: string) { return this.rows.get(ids.learnerItem(userId, itemId)); }
  async queryItem(userId: string, ref: { itemId?: string; surface?: string; lang: LanguageCode }) {
    this.queries++;
    return this.knowledge(userId, ref.itemId ?? ids.form(ref.lang, ref.surface ?? ''));
  }
  async queryItems(userId: string, refs: Array<{ itemId?: string; surface?: string; lang: LanguageCode }>) {
    this.queries += refs.length;
    return refs.map((r) => this.knowledge(userId, r.itemId ?? ids.form(r.lang, r.surface ?? '')));
  }
  async listKnown(userId: string, lang: LanguageCode, modality: 'reading' | 'listening' | 'writing', minLevel: string) {
    const min = LEVEL_ORDER.indexOf(minLevel as LearnerLevel);
    return [...this.rows.values()].filter((r) => r.userId === userId && r.lang === lang && levelIdx(r[modality].level) >= min);
  }
}

// ───────────────────────── world builder ─────────────────────────

export function tok(surface: string, lemma?: string, pos?: PartOfSpeech, gloss?: string) {
  return { surface, lemma, pos, gloss };
}
export const punct = (surface: string) => ({ surface, isWord: false });

export interface World {
  store: AppStore;
  bus: StoreEventBus;
  golearn: FakeGoLearn;
  registry: AdapterRegistry;
  gotell: ReturnType<typeof createGoTell>;
  now: () => string;
}

export async function makeWorld(adapters: LanguageAdapter[], extra: Partial<Parameters<typeof createGoTell>[0]> = {}): Promise<World> {
  const store = createMemoryStore();
  await seedBasics(store, 'A');
  await store.users.put({ id: 'B', displayName: 'B', courseId: 'honduras-es', createdAt: '2026-01-01T00:00:00.000Z' });
  let t = 0;
  const now = () => new Date(Date.UTC(2026, 1, 1, 0, 0, t++)).toISOString();
  const bus = new StoreEventBus(store, now);
  const golearn = new FakeGoLearn(store);
  const registry = makeRegistry(adapters);
  const gotell = createGoTell({ store, bus, adapters: registry, golearn, clock: now, ...extra });
  return { store, bus, golearn, registry, gotell, now };
}

export { buildFixtureText };
export type { FixtureSentence };

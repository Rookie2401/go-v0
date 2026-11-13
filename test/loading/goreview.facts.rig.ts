/**
 * A realistic input for the intake fact fetch (2026-11-11): the REAL Albanian pack (adapter + the dictionary shards under public/dict/sq),
 * served from disk through a fetch that counts every request, a facts provider whose pack runtime counts every `gloss` call, and a
 * deterministic candidate list spread across the whole dictionary. Nothing here is imported by production code.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ReviewCandidate } from '../../packages/repository-contract/src';
import { gatherCandidates } from '../../packages/goreview/src/intake/fetch';
import { createFactsProvider, type RepositoryUnit } from '../../packages/goreview/src/facts/provider';
import type { DeckItem, FactsProvider, IntakeOutcome, ReviewPreferences } from '../../packages/goreview/src/types';
import { albanianManifest, createPackRuntime } from '../../packages/language-packs/src';
import { createReviewEngine } from '../../packages/goreview/app/engine';
import { evidenceFor, ratingFor, registry } from '../../packages/goreview/src';
import { sqAdapter } from '../../src/adapters/sq';
import { BASE, diskFetch } from '../language-packs/helpers';
import { candidate, deckItem, knowledge, NOW, prefs, scheduleState } from '../goreview/intake/fixtures';

const DICT = path.resolve(__dirname, '../../public/dict/sq');

/** A deterministic pseudo-random number in [0,1) from a string. */
const unit01 = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
};

let headwordsCache: Array<{ form: string; lemma: string; pos: string }> | undefined;
/** Headwords of the real dictionary, spread over every shard, in a fixed order. */
function headwords(): Array<{ form: string; lemma: string; pos: string }> {
  if (headwordsCache) return headwordsCache;
  const out: Array<{ form: string; lemma: string; pos: string }> = [];
  for (const file of fs.readdirSync(DICT).filter((f) => /^s-[0-9a-f]+\.json$/u.test(f)).sort()) {
    const shard = JSON.parse(fs.readFileSync(path.join(DICT, file), 'utf8')) as Record<string, Array<{ p?: string; m?: Array<[string, number]> }>>;
    for (const form of Object.keys(shard).sort().slice(0, 12)) {
      const e = shard[form]?.[0];
      if (e?.p && e.m?.[0] && /^\p{L}+$/u.test(form)) out.push({ form, lemma: e.m[0][0], pos: e.p });
    }
  }
  return (headwordsCache = out);
}

/** n candidates (mixed forms and lemmas, scores spread over 0.05..0.95 and ties broken by id), first letters spread across the alphabet. */
export function makeCandidates(n: number): ReviewCandidate[] {
  const all = headwords();
  const step = Math.max(1, Math.floor(all.length / n));
  const out: ReviewCandidate[] = [];
  for (let i = 0; i < n; i++) {
    const h = all[(i * step + (i % step)) % all.length]!;
    const isLemma = i % 3 === 0 && ['NOUN', 'VERB', 'ADJ'].includes(h.pos);
    const unitId = isLemma ? `lemma:sq:${h.lemma}:${h.pos}` : `form:sq:${h.form}`;
    out.push(candidate({ unitId, kind: isLemma ? 'lexeme' : 'form', score: Math.round((0.05 + 0.9 * unit01(unitId)) * 100) / 100 }));
  }
  const seen = new Set<string>();
  return out.filter((c) => (seen.has(c.unitId) ? false : (seen.add(c.unitId), true)));
}

export interface Counts {
  candidates: number; factsFor: number; prime: number; gloss: number; fetches: number; shardFetches: number; distinctShards: number;
}

export interface Rig {
  runApp(candidates: ReviewCandidate[], over?: Partial<ReviewPreferences>, deck?: DeckItem[], failIds?: ReadonlySet<string>): Promise<{ out: IntakeOutcome[]; counts: Counts }>;
  run(candidates: ReviewCandidate[], over?: Partial<ReviewPreferences>, deck?: DeckItem[], extra?: Record<string, unknown>): Promise<{ out: IntakeOutcome[]; counts: Counts }>;
}

/** The Repository's row for a unit: verified for most, conflicted for about one in twelve, absent for about one in twenty (as a real account has all three). */
function repositoryRow(unitId: string): RepositoryUnit | undefined {
  const r = unit01(`row:${unitId}`);
  if (r < 0.05) return undefined;
  const isLemma = unitId.startsWith('lemma:sq:');
  const body = unitId.replace(/^(?:lemma|form):sq:/u, '');
  const m = isLemma ? /^(.*):([A-Z]+)$/u.exec(body) : null;
  const manifest = albanianManifest();
  return { relations: [], analyses: [], unit: {
    unitId, kind: isLemma ? 'lexeme' : 'form', languageId: 'sq', label: m ? m[1]! : body, ...(m ? { pos: m[2]! } : {}),
    packId: manifest.packId, packVersion: manifest.version, provenance: { source: 'dictionary', ref: 'test', confidence: 0.95 },
    status: r < 0.13 ? 'conflicted' : 'verified', createdAt: NOW } };
}

/** A fresh world per run: a fresh runtime (empty shard cache) and fresh counters. `failIds`: units whose facts lookup throws (a dictionary that could not be read). */
function world(failIds: ReadonlySet<string> = new Set()) {
  const fetch = diskFetch();
  const manifest = albanianManifest();
  const runtime = createPackRuntime(manifest, { fetch, baseUrl: BASE });
  let gloss = 0, factsFor = 0, prime = 0;
  const provider = createFactsProvider({
    unit: async (unitId) => repositoryRow(unitId),
    pack: { manifest, runtime: { gloss: async (...a: Parameters<typeof runtime.gloss>) => { gloss++; return runtime.gloss(...a); } } },
    adapter: sqAdapter, now: () => NOW,
  });
  const facts: FactsProvider & { prime(ids: string[]): Promise<void>; clearPrime(): void } = {
    factsFor: async (...a) => { factsFor++; if (failIds.has(a[0])) throw new Error('dictionary shard could not be read'); return provider.factsFor(...a); },
    prime: async (ids) => { prime++; await provider.prime(ids); },
    clearPrime: () => provider.clearPrime(),
  };
  const counts = (n: number): Counts => {
    const shardCalls = fetch.calls.filter((u) => /\/dict\/sq\/s-[0-9a-f]+\.json$/u.test(u));
    return { candidates: n, factsFor, prime, gloss, fetches: fetch.calls.length, shardFetches: shardCalls.length, distinctShards: new Set(shardCalls).size };
  };
  return { facts, counts };
}
const audioOk = { available: true, eligibleForEvidence: true, reason: 'test' };

export function makeRig(): Rig {
  return {
    async run(candidates, over = {}, deck = [], extra = {}) {
      const w = world((extra.failIds as Set<string> | undefined) ?? new Set());
      const knowledgeRows = Object.fromEntries(candidates.map((c) => [c.unitId, knowledge(c.unitId)]));
      const { failIds: _f, ...deps } = extra;
      const out = await gatherCandidates({
        api: { candidates: async () => candidates, knowledge: async () => knowledgeRows },
        facts: w.facts, audio: async () => audioOk, deck, saved: new Set(),
        preferences: prefs({ maxNew: 10, ...over }), now: NOW, enrolmentId: '', limit: candidates.length || 1, ...deps,
      });
      return { out, counts: w.counts(candidates.length) };
    },
    /** The app's own call: `createReviewEngine(...).intake`, which is what the review workspace uses (no budget is passed from here). */
    async runApp(candidates, over = {}, deck = [], failIds = new Set()) {
      const w = world(failIds);
      const engine = createReviewEngine({ builders: registry, evidenceFor, ratingFor, now: () => NOW, random: () => 0.5, factsFor: () => w.facts });
      const out = await engine.intake({ api: {} as never, candidates, knowledge: candidates.map((c) => knowledge(c.unitId)), deck, saved: new Set(),
        prefs: prefs({ maxNew: 10, ...over }), audio: audioOk, now: NOW });
      return { out, counts: w.counts(candidates.length) };
    },
  };
}

/** The projection of an outcome that matters downstream: what the planner, the home screen and My vocab read. */
export const project = (o: IntakeOutcome) => ({ unitId: o.unitId, decision: o.decision, proposed: o.proposed ?? null, reasons: o.reasons });

/** n written-recognition cards for forms that are NOT among the candidates (a learner's history). */
export function makeDeckForms(n: number, avoid: ReviewCandidate[]): DeckItem[] {
  const taken = new Set(avoid.map((c) => c.unitId));
  const out: DeckItem[] = [];
  for (const h of headwords().slice().reverse()) {
    if (out.length >= n) break;
    const unitId = `form:sq:${h.form}`;
    if (taken.has(unitId)) continue;
    out.push(deckItem({ unitId, schedule: scheduleState({ due: "2026-12-01T10:00:00.000Z" }) }));
  }
  return out;
}

/**
 * Shared set-up for the GoTell engine tests: the REAL Albanian pack runtime (adapter-sq, the pack's manifest and grammar text), plus
 * a way to wrap the real adapter so that its `checkProduction` says something chosen by the test (to reach cases the real checker does
 * not produce: a deleted negation, a replacement that adds a noun, a checker that throws).
 */
import { sqAdapter } from '../../src/adapters/sq';
import { albanianManifest, createPackRuntime, germanManifest } from '../../packages/language-packs/src';
import type { PackManifest, PackRuntime } from '../../packages/language-packs/src';
import { createAnalyzer } from '../../packages/gotell/src/engine';
import type { Analyzer } from '../../packages/gotell/src/engine';
import type { WriterProfile } from '../../packages/gotell/src/types';

export const NOW = '2026-10-09T10:00:00.000Z';
const noNetwork = (async () => { throw new Error('the engine must not use the network'); }) as unknown as typeof fetch;

export type SqAdapter = typeof sqAdapter;
export type CheckFn = SqAdapter['checkProduction'];

export function realRuntime(adapter?: SqAdapter): { manifest: PackManifest; runtime: PackRuntime } {
  const manifest = albanianManifest();
  return { manifest, runtime: createPackRuntime(manifest, { fetch: noNetwork, baseUrl: '/', ...(adapter ? { adapter } : {}) }) };
}

export function realAnalyzer(opts: { adapter?: SqAdapter; packSentences?: string[] } = {}): Analyzer {
  const { manifest, runtime } = realRuntime(opts.adapter);
  return createAnalyzer({ languageId: 'sq', runtime, manifest, now: () => NOW, ...(opts.packSentences ? { packSentences: opts.packSentences } : {}) });
}

/** The real adapter with its production checker replaced (the real one is still available as `real`). */
export function withChecker(check: (real: CheckFn, ...args: Parameters<CheckFn>) => ReturnType<CheckFn>): SqAdapter {
  const real = sqAdapter.checkProduction.bind(sqAdapter);
  return { ...sqAdapter, checkProduction: (tokens, analyses, sentence) => check(real, tokens, analyses, sentence) } as SqAdapter;
}

/** An analyser for a language whose pack has no real analyser: words and sentences by the browser's segmenter only. */
export function germanAnalyzer(): Analyzer {
  const manifest = germanManifest();
  const runtime = createPackRuntime(manifest, { fetch: noNetwork, baseUrl: '/' });
  return createAnalyzer({ languageId: 'de', runtime, manifest, now: () => NOW });
}

export function profile(over: Partial<WriterProfile> = {}): WriterProfile {
  return {
    learnerId: 'L1', languageId: 'sq', productive: [], recognisedOnly: [], weakConstructions: [], recurringErrors: [], recent: [],
    explanationDepth: 'brief', goals: [], band: { level: 'first-sentences', basis: [] }, ...over,
  };
}

/** Deep freeze, so that any write into an analysis or a profile throws in strict mode. */
export function deepFreeze<T>(x: T): T {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x as Record<string, unknown>)) deepFreeze(v);
  }
  return x;
}

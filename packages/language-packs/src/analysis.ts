/**
 * Reading a selected word through a pack's analyser, and running a manifest's validation cases against it.
 *
 * `statusOf` restates the Repository resolver's rule (packages/repository-linguistics/src/resolver.ts `statusFor`) so
 * that a pack can prove itself without importing the Repository; a test compares the two on every validation case.
 */
import type { AnalysisCandidate, AnalyzedToken, LanguageAdapter, RawToken } from '../../../src/core';
import type { ValidationCase } from './manifest';

/** Two readings this close in confidence compete (the Repository uses the same number). */
export const CLOSE = 0.15;
export const HIGH_CONFIDENCE = 0.85;

export type ReadingStatus = 'high-confidence' | 'conflicted' | 'provisional';

export interface SelectionReading {
  /** The top reading, or undefined when the analyser gives none. */
  top?: AnalysisCandidate;
  candidates: AnalysisCandidate[];
  status: ReadingStatus;
  /** True when the surface was found among the sentence's words. */
  found: boolean;
}

const featureKey = (m: Record<string, string> | undefined): string =>
  Object.keys(m ?? {}).sort().map((k) => `${k}=${(m as Record<string, string>)[k]}`).join('|');
const sameReading = (a: AnalysisCandidate, b: AnalysisCandidate): boolean =>
  (a.lemma ?? '') === (b.lemma ?? '') && (a.pos ?? '') === (b.pos ?? '') && featureKey(a.morph) === featureKey(b.morph);

/** conflicted / high-confidence / provisional, exactly as the Repository decides it for an unreviewed source. */
export function statusOf(candidate: AnalysisCandidate, all: AnalysisCandidate[]): ReadingStatus {
  const others = all.filter((c) => c !== candidate);
  const top = Math.max(candidate.confidence, ...others.map((c) => c.confidence));
  if (candidate.confidence >= top - CLOSE && others.some((c) => c.confidence >= top - CLOSE && !sameReading(c, candidate))) return 'conflicted';
  const rule = candidate.unconfirmed === true || candidate.origin === 'rule' || (!candidate.origin && candidate.notes?.source === 'rule');
  if (!rule && candidate.confidence >= HIGH_CONFIDENCE && !others.some((c) => Math.abs(c.confidence - candidate.confidence) <= CLOSE)) return 'high-confidence';
  return 'provisional';
}

/** Tokenise and analyse `sentence` (or the surface alone) and return the reading of the first word equal to `surface`. */
export function readSelection(adapter: Pick<LanguageAdapter, 'tokenize' | 'analyze' | 'normalize'>, surface: string, sentence?: string): SelectionReading {
  const text = sentence ?? surface;
  const tokens: RawToken[] = adapter.tokenize(text);
  const analysed: AnalyzedToken[] = adapter.analyze(tokens);
  const want = adapter.normalize(surface);
  const at = analysed.find((a) => a.token.isWord && (a.token.surface === surface || a.token.normalized === want));
  if (!at) return { candidates: [], status: 'provisional', found: false };
  const candidates = at.candidates;
  const top = candidates[0];
  return { ...(top ? { top } : {}), candidates, status: top ? statusOf(top, candidates) : 'provisional', found: true };
}

export interface CaseResult { id: string; pass: boolean; got?: string }

const describe = (r: SelectionReading): string => {
  if (!r.found) return 'the word was not found in the sentence';
  if (!r.top) return 'no reading';
  const f = Object.entries(r.top.morph ?? {}).map(([k, v]) => `${k}=${v}`).join(' ');
  return `${r.top.lemma ?? '?'} ${r.top.pos ?? '?'}${f ? ` ${f}` : ''} [${r.status}${r.candidates.length > 1 ? `, ${r.candidates.length} readings` : ''}]`;
};

/** Run one validation case; a failing case says what the analyser really read. */
export function runCase(adapter: Pick<LanguageAdapter, 'tokenize' | 'analyze' | 'normalize'>, c: ValidationCase): CaseResult {
  let r: SelectionReading;
  try { r = readSelection(adapter, c.surface, c.sentence); } catch (e) {
    return { id: c.id, pass: false, got: `the analyser threw: ${e instanceof Error ? e.message : String(e)}` };
  }
  const e = c.expect;
  const problems: string[] = [];
  if (!r.found) problems.push('word not found');
  if (e.readings === 'none' && r.candidates.length > 0) problems.push('expected no reading');
  if (e.readings !== 'none' && (e.lemma !== undefined || e.pos !== undefined || e.features !== undefined) && !r.top) problems.push('no reading');
  if (r.top) {
    if (e.lemma !== undefined && r.top.lemma !== e.lemma) problems.push(`lemma ${r.top.lemma}`);
    if (e.pos !== undefined && r.top.pos !== e.pos) problems.push(`pos ${r.top.pos}`);
    for (const [k, v] of Object.entries(e.features ?? {})) if ((r.top.morph ?? {})[k] !== v) problems.push(`${k}=${(r.top.morph ?? {})[k] ?? '(none)'}`);
  }
  if (e.status !== undefined && r.status !== e.status) problems.push(`status ${r.status}`);
  return problems.length === 0 ? { id: c.id, pass: true } : { id: c.id, pass: false, got: `${describe(r)} — differs: ${problems.join('; ')}` };
}

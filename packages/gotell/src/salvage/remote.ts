/**
 * adapted from src/gotell/productive/interpret.ts (2026-10-09) — validation of an advisory provider's raw output.
 *
 * The legacy module checked an interpreter's answer against a strict shape and rejected anything malformed, out of range or
 * naming unknown things, with a reason. The same discipline applies to a remote assistant's proposals: shape first (here), then
 * the language checks and the never-add-content rule (engine/analyze.ts `validateRewrite`). No provider is wired anywhere.
 */
export interface RemoteProposal { suggested: string; explanation: string; confidence: number }

const MAX_SENTENCE = 800;
const MAX_NOTE = 400;

export function validateProposalShape(raw: unknown): { ok: true; proposal: RemoteProposal } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' };
  const r = raw as Record<string, unknown>;
  if (typeof r.suggested !== 'string' || r.suggested.trim() === '') return { ok: false, reason: 'suggested must be a non-empty string' };
  if (r.suggested.length > MAX_SENTENCE) return { ok: false, reason: 'suggested is too long to be one sentence' };
  if (/[\r\n]/u.test(r.suggested.trim())) return { ok: false, reason: 'suggested must be one sentence on one line' };
  if (typeof r.explanation !== 'string') return { ok: false, reason: 'explanation must be a string' };
  if (r.explanation.length > MAX_NOTE) return { ok: false, reason: 'explanation must be short' };
  if (typeof r.confidence !== 'number' || !Number.isFinite(r.confidence) || r.confidence < 0 || r.confidence > 1) return { ok: false, reason: 'confidence must be a number in 0..1' };
  return { ok: true, proposal: { suggested: r.suggested.trim(), explanation: r.explanation.trim(), confidence: r.confidence } };
}

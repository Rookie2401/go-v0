/**
 * Graduated assistance: the smallest help that lets the learner continue, and no more.
 *
 *   1 identify      where, and what kind of problem — no fix:            "Possible problem at “libër”: definiteness."
 *   2 hint          the TYPE of problem, in the pack's own words
 *   3 targeted      the word, inflection or construction to look at; the checker's replacement is NAMED, never applied
 *   4 correction    the revised sentence, why, and the meaning-change flag when there is one
 *   5 alternatives  variants and register notes the pack knows — or an honest "none is known"
 *   6 model         ONLY when asked for explicitly: the learner's own earlier sentence, else a pack sentence, else a consented remote
 *                   proposal (validated, unreviewed); otherwise a refusal that says nothing was sent
 *
 * Levels are monotone per request: asking for level N reveals levels 1..N, and `revealedUnitIds` accumulates over them (and over the
 * steps already shown in `prior`). `through` returns every step the request reveals so the caller can record all of them; `step`
 * returns the one asked for. No function here changes the draft, the analysis or any stored record.
 *
 * `prior` is the list of steps already shown for THIS issue of this sentence (a step carries no issue reference of its own).
 */
import { planRepairs, validateProposalShape } from '../salvage';
import type { AssistanceLevel, AssistanceRequest, AssistanceStep, ConsentGate, Correction, DraftAnalysis, Issue, IssueClass, RemoteAssistant, SentenceAnalysis } from '../types';
import type { Analyzer } from './analyze';
import { isoOf, sentenceScopeHash, unique } from './text';

export interface AssistanceDeps {
  analyzer: Analyzer;
  /** The remote port. Nothing in this repository wires one; without it Level 6 can only come from the learner or the pack. */
  remote?: RemoteAssistant;
  consent: ConsentGate;
  now: () => Date | string;
  /** How long a remote proposal is waited for. */
  remoteTimeoutMs?: number;
}

export interface Refusal { refused: true; reason: string }
export type AssistanceResult = AssistanceStep | Refusal;

export interface AssistanceContext {
  /** The learner's own earlier independent sentence for the same prompt or meaning (the first choice for a model). */
  ownSentence?: string;
  /** What the learner meant, in their words; sent to the remote assistant only if the learner consented. */
  intendedMeaning?: string;
}

export interface Assistance {
  /** The step for the level asked for (or a refusal). The steps below it are revealed too: see `through`. */
  step(analysis: DraftAnalysis, req: AssistanceRequest, prior: readonly AssistanceStep[], ctx?: AssistanceContext): Promise<AssistanceResult>;
  /** Every step this request reveals that is not already in `prior`, in order of level; the last one is the level asked for. */
  through(analysis: DraftAnalysis, req: AssistanceRequest, prior: readonly AssistanceStep[], ctx?: AssistanceContext): Promise<{ steps: AssistanceStep[] } | Refusal>;
}

export const NO_MODEL_WITHOUT_REMOTE = 'no model expression is available without a remote assistant; nothing was sent';

const CLASS_NOTE: Record<IssueClass, string> = {
  'grammatically-wrong': '',
  'semantically-unclear': 'it may be unclear what is meant',
  'acceptable-but-awkward': 'grammatical, but it may sound awkward',
  'regional-variation': 'a regional variation, not necessarily a mistake',
  'register-difference': 'a difference of register, not necessarily a mistake',
  'stylistic-alternative': 'a matter of style',
  'uncertain-analysis': 'the analysis is uncertain, so this may be a false alarm',
};

const LEVELS: readonly AssistanceLevel[] = [1, 2, 3, 4, 5, 6];

export function createAssistance(deps: AssistanceDeps): Assistance {
  const { analyzer, consent } = deps;
  const at = (req: AssistanceRequest): string => req.at || isoOf(deps.now());

  function resolve(analysis: DraftAnalysis, req: AssistanceRequest): { sentence: SentenceAnalysis; issue?: Issue } | Refusal {
    if (!LEVELS.includes(req.level)) return { refused: true, reason: `level ${String(req.level)} is not one of the six levels of assistance` };
    if (analysis.draftId !== req.draftId) return { refused: true, reason: 'the request is for a different draft than the analysis' };
    const sentence = analysis.sentences.find((s) => s.index === req.sentenceIndex);
    if (!sentence) return { refused: true, reason: `the draft has no sentence ${req.sentenceIndex}` };
    if (req.issueId !== undefined) {
      const issue = sentence.issues.find((i) => i.issueId === req.issueId);
      if (!issue) return { refused: true, reason: `sentence ${req.sentenceIndex} has no issue ${req.issueId}` };
      return { sentence, issue };
    }
    return sentence.issues[0] ? { sentence, issue: sentence.issues[0] } : { sentence };
  }

  const pickCorrection = (sentence: SentenceAnalysis, issue: Issue): Correction | undefined =>
    sentence.corrections.find((c) => c.issueIds.length === 1 && c.issueIds[0] === issue.issueId) ?? sentence.corrections.find((c) => c.issueIds.includes(issue.issueId));

  // ── levels 1–5: all from the analysis and the pack, no I/O ──
  function localStep(sentence: SentenceAnalysis, issue: Issue, level: 1 | 2 | 3 | 4 | 5, when: string): AssistanceStep {
    switch (level) {
      case 1: {
        const note = CLASS_NOTE[issue.class];
        return { level, content: `Possible problem at “${issue.surface}”: ${issue.category}${note ? ` (${note})` : ''}.`, revealedUnitIds: [], source: 'adapter-checker', at: when };
      }
      case 2: {
        const fromPack = analyzer.packText(issue.category).fromPack;
        return { level, content: issue.hint, revealedUnitIds: [], source: fromPack ? 'pack-grammar' : 'adapter-checker', at: when };
      }
      case 3: {
        const found = analyzer.locate(sentence, issue);
        const replacement = found?.error.suggestion;
        const reading = analyzer.describeWord(sentence.text, issue.span);
        const readingNote = reading ? ` (“${issue.surface}” reads as: ${reading}.)` : '';
        if (found && replacement) {
          const plan = planRepairs(sentence.text, [found.error])[0];
          const revealed = plan ? analyzer.validateRewrite(sentence.text, plan.suggested, { editedSpans: plan.spans }).introducedUnitIds : [];
          const named = replacement.replacement === '' ? 'to leave it out' : `“${replacement.replacement}”`;
          return {
            level, source: 'adapter-checker', at: when, revealedUnitIds: revealed,
            content: `Look at “${issue.surface}”. The checker names ${named} for this spot; compare it with what you wrote. Your sentence has not been changed.${readingNote}`,
          };
        }
        const full = analyzer.packText(issue.category).explanation;
        return {
          level, at: when, revealedUnitIds: [], source: full ? 'pack-grammar' : 'none',
          content: `Look at “${issue.surface}”. ${full ?? 'The checker has no specific form to name for this one.'}${readingNote}`,
        };
      }
      case 4: {
        const c = pickCorrection(sentence, issue);
        if (!c) {
          return {
            level, at: when, revealedUnitIds: [], source: 'none',
            content: `The checker found this problem but has no replacement to offer, so there is no revised sentence. ${issue.explanation ?? ''}`.trim(),
          };
        }
        const lines = [`Revised sentence: “${c.suggested}”`, `Why: ${c.explanation}`];
        if (c.meaningChange) lines.push(`Check the meaning: ${c.meaningChange} This change is shown for you to judge; it will not be applied automatically.`);
        if (c.validation.checkerClean) lines.push('The checker finds nothing more in the revised sentence; that does not show the sentence is correct.');
        else lines.push(`The checker is not satisfied with the revised sentence: ${c.validation.issues.join('; ')}.`);
        if (!c.validation.addsOnlyWithinSpans) lines.push('Warning: this revision adds or changes words beyond the place that was flagged.');
        lines.push('This is a proposal. Your sentence has not been changed.');
        const revealed = analyzer.validateRewrite(c.original, c.suggested).introducedUnitIds;
        return { level, content: lines.join('\n'), revealedUnitIds: revealed, source: 'adapter-checker', at: when };
      }
      case 5: {
        const c = pickCorrection(sentence, issue);
        const alts = c?.alternatives ?? [];
        if (!alts.length) {
          return { level, content: 'No alternative is known to this pack for this sentence: no variant and no register note.', revealedUnitIds: [], source: 'none', at: when };
        }
        const revealed = unique(alts.flatMap((a) => analyzer.unitIdsOf(a.text))).filter((u) => !sentence.unitIds.includes(u));
        return { level, content: `Alternatives:\n${alts.map((a) => `- “${a.text}” — ${a.note}`).join('\n')}`, revealedUnitIds: revealed, source: 'adapter-checker', at: when };
      }
    }
  }

  // ── level 6 ──
  async function remoteModel(sentence: SentenceAnalysis, ctx: AssistanceContext, when: string): Promise<AssistanceStep | Refusal> {
    const { remote } = deps;
    // only the boolean true is consent (a truthy string, a number, an object or a Promise is not)
    if (consent.remoteAssistance() !== true || !remote) return { refused: true, reason: NO_MODEL_WITHOUT_REMOTE };
    let raw: unknown;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      raw = await Promise.race([
        remote.propose({ languageId: analyzer.languageId, sentence: sentence.text, ...(ctx.intendedMeaning ? { intendedMeaning: ctx.intendedMeaning } : {}) }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('it did not answer in time')), deps.remoteTimeoutMs ?? 10_000); }),
      ]);
    } catch (e) {
      return { refused: true, reason: `the remote assistant could not be used (${e instanceof Error ? e.message : String(e)}); nothing from it is shown` };
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!Array.isArray(raw)) return { refused: true, reason: 'the remote assistant answered in a form that is not a list of proposals; nothing from it is shown' };
    const rejected: string[] = [];
    const accepted: Array<{ suggested: string; explanation: string; confidence: number; meaningChange?: string; units: string[] }> = [];
    for (const item of raw) {
      const shape = validateProposalShape(item);
      if (!shape.ok) { rejected.push(shape.reason); continue; }
      const p = shape.proposal;
      const check = analyzer.validateRewrite(sentence.text, p.suggested, { strict: true });
      if (!check.checkerClean || !check.addsOnlyWithinSpans) { rejected.push(`“${p.suggested}”: ${check.issues.join('; ') || 'the checker is not satisfied'}`); continue; }
      accepted.push({ ...p, ...(check.meaningChange ? { meaningChange: check.meaningChange } : {}), units: analyzer.unitIdsOf(p.suggested).filter((u) => !sentence.unitIds.includes(u)) });
    }
    const best = accepted.sort((a, b) => b.confidence - a.confidence)[0];
    if (!best) {
      return { refused: true, reason: `the remote assistant's proposals did not pass the checks (${rejected.join(' | ') || 'it proposed nothing'}); nothing from it is shown` };
    }
    const lines = [best.suggested];
    if (best.explanation) lines.push(best.explanation);
    if (best.meaningChange) lines.push(`Check the meaning: ${best.meaningChange}`);
    lines.push(`Proposed by a remote assistant (${deps.remote?.providerId ?? 'unknown'}); not reviewed by anyone. The checker finds nothing in it, which does not show it is correct.`);
    return { level: 6, content: lines.join('\n'), revealedUnitIds: best.units, source: 'remote-assistant', review: 'unreviewed', at: when };
  }

  async function modelStep(sentence: SentenceAnalysis, issue: Issue | undefined, prior: readonly AssistanceStep[], ctx: AssistanceContext, when: string): Promise<AssistanceStep | Refusal> {
    // 1. the learner's own earlier independent sentence
    const earlier = prior.find((p) => p.level === 6 && p.source === 'learner-own-sentence');
    const own = ctx.ownSentence?.trim() || earlier?.content.split('\n')[0]?.trim();
    if (own) {
      return { level: 6, content: `${own}\n(Your own earlier sentence.)`, revealedUnitIds: [], source: 'learner-own-sentence', review: 'learner-own', at: when };
    }
    // 2. a sentence of the pack that contains the units
    const found = analyzer.packSentenceFor(issue ? issue.unitIds : sentence.unitIds, sentence.text);
    if (found) {
      const name = analyzer.manifest.identity.name;
      return {
        level: 6, at: when, source: 'pack-sentence', review: found.reviewed ? 'reviewed' : 'unreviewed',
        revealedUnitIds: found.unitIds.filter((u) => !sentence.unitIds.includes(u)),
        content: `${found.text}\n(A sentence from the ${name} pack${found.reviewed ? '' : '; no native speaker has checked it'}. It uses the same word${(issue ? issue.unitIds : sentence.unitIds).length > 1 ? 's' : ''} as yours.)`,
      };
    }
    // 3. a remote assistant, only with consent
    return remoteModel(sentence, ctx, when);
  }

  async function through(analysis: DraftAnalysis, req: AssistanceRequest, prior: readonly AssistanceStep[], ctx: AssistanceContext = {}): Promise<{ steps: AssistanceStep[] } | Refusal> {
    const r = resolve(analysis, req);
    if ('refused' in r) return r;
    const { sentence, issue } = r;
    const when = at(req);
    const target = req.level;

    if (target < 6 && !issue) {
      return { refused: true, reason: 'the checker found no problem in this sentence, so there is nothing to identify or explain; that does not show the sentence is correct' };
    }

    // the model is asked for first: a refusal reveals nothing, not even the lower levels
    let model: AssistanceStep | undefined;
    if (target === 6) {
      const m = await modelStep(sentence, issue, prior, ctx, when);
      if ('refused' in m) return m;
      model = m;
    }

    const shown = new Set(prior.map((p) => p.level));
    const out: AssistanceStep[] = [];
    const topLocal = (target === 6 ? 5 : target) as 1 | 2 | 3 | 4 | 5;
    if (issue) {
      for (const level of [1, 2, 3, 4, 5] as const) {
        if (level > topLocal) break;
        if (shown.has(level) && level < target) continue; // already shown: its units are in `prior`
        out.push(localStep(sentence, issue, level, when));
      }
    }
    if (model) out.push(model);

    // accumulate what was revealed at or below each level, over the prior steps and the steps of this request
    const seen: AssistanceStep[] = [...prior];
    const sentenceHash = sentenceScopeHash(sentence.text);
    const steps = out.map((s) => {
      const revealed = unique([...seen.filter((p) => p.level <= s.level).flatMap((p) => p.revealedUnitIds), ...s.revealedUnitIds]);
      // every step records the sentence it was shown for, so authorship is judged per sentence
      const withAll: AssistanceStep = { ...s, revealedUnitIds: revealed, sentenceIndex: sentence.index, sentenceHash };
      seen.push(withAll);
      return withAll;
    });
    return { steps };
  }

  return {
    through,
    async step(analysis, req, prior, ctx) {
      const r = await through(analysis, req, prior, ctx);
      if ('refused' in r) return r;
      return r.steps[r.steps.length - 1];
    },
  };
}

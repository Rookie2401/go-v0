import { describe, expect, it } from 'vitest';
import {
  computePublished, validateDocument, type CorpusDocument, type PipelineActor, type PipelineChecklist, type PipelineEntry, type PipelineState,
} from '../../src/ingest';
import { advance, pipelineProblems, pipelineSummary, CHECKLIST_ITEMS, NEXT_STATES, PIPELINE_STATES } from '../../src/ingest/pipeline';
import { PIPELINE_REASONS } from '../../src/ingest/publish';
import { baseDoc, registry } from './helpers';

const clone = <T,>(x: T): T => structuredClone(x);
const tool: PipelineActor = { kind: 'tool', name: 'ladder drafting agent' };
const ana: PipelineActor = { kind: 'person', name: 'Ana Ruiz', competence: 'native', variety: 'es-HN', role: 'linguistic-reviewer' };
const okAll = (): PipelineChecklist => Object.fromEntries(CHECKLIST_ITEMS.map((k) => [k, { result: 'ok' as const }]));

/** A machine-drafted ladder unit (generated text, so the ordinary rules would hide it), pipeline at machine-draft. */
const unit = (): CorpusDocument => ({
  ...baseDoc(), id: 'es-a1-1-01', title: 'En casa', generated: true, editorialTags: ['machine-drafted'], variety: 'es-HN',
  source: { id: 'src:ladder', title: 'ladder', attribution: 'GoLearn ladder', provenance: 'machine-drafted for the ladder; not yet reviewed by a person', rights: 'generated', authorship: 'generated' },
  sections: [{ paragraphs: [{ sentences: [{ text: 'Me llamo Ana.', english: 'My name is Ana.' }, { text: 'Vivo en Tegucigalpa.' }] }] }],
  pipeline: { state: 'machine-draft', history: [{ state: 'machine-draft', at: '2026-10-05', by: tool }] },
});

/** Move a unit along the given states (the reviewer is Ana for everything past in-review). */
function walk(doc: CorpusDocument, states: PipelineState[], extras: Partial<Record<PipelineState, Parameters<typeof advance>[3]>> = {}): CorpusDocument {
  let d = doc;
  for (const s of states) {
    const r = advance(d, s, s === 'in-review' || s === 'machine-draft' ? ana : ana, extras[s]);
    if (!r.ok) throw new Error(`refused ${s}: ${r.refusals.map((x) => x.code).join(',')}`);
    d = r.doc;
  }
  return d;
}
const reviewedUnit = () => walk(unit(), ['in-review', 'reviewed']);
const audioReady = () => walk(unit(), ['in-review', 'reviewed', 'audio-ready'], { 'audio-ready': { recordings: 'recordings/es-a1-1-01 (Ana Ruiz, reviewed)' } });
const errorCodes = (doc: unknown) => validateDocument(doc, { registry }).filter((i) => i.severity === 'error').map((i) => i.code);
const codesOf = (doc: unknown) => pipelineProblems((doc as CorpusDocument).pipeline).filter((p) => p.severity === 'error').map((p) => p.code);
const withHistory = (history: PipelineEntry[], state?: PipelineState): CorpusDocument => ({ ...unit(), pipeline: { state: state ?? history[history.length - 1].state, history } });

describe('the pipeline block: validation', () => {
  it('a unit walked through every state is a valid document with no pipeline issue', () => {
    const d = walk(unit(), ['in-review', 'corrections-pending', 'in-review', 'reviewed', 'audio-ready', 'published']);
    expect(d.pipeline!.history.map((e) => e.state)).toEqual(['machine-draft', 'in-review', 'corrections-pending', 'in-review', 'reviewed', 'audio-ready', 'published']);
    expect(d.pipeline!.state).toBe('published');
    expect(pipelineProblems(d.pipeline)).toEqual([]);
    expect(errorCodes(d)).toEqual([]);
    expect(errorCodes(unit())).toEqual([]);
  });

  it('allows exactly the moves of the order; a correction may go back to in-review from any later state', () => {
    expect(NEXT_STATES['machine-draft']).toEqual(['in-review']);
    for (const s of ['corrections-pending', 'reviewed', 'audio-ready', 'published'] as const) expect(NEXT_STATES[s]).toContain('in-review');
    for (const from of PIPELINE_STATES) {
      for (const to of PIPELINE_STATES) {
        const legal = NEXT_STATES[from].includes(to);
        const probe = withHistory([{ state: 'machine-draft', at: '2026-10-05', by: ana }]);
        // reach `from` legally, then try `to`
        const path: Record<PipelineState, PipelineState[]> = {
          'machine-draft': [], 'in-review': ['in-review'], 'corrections-pending': ['in-review', 'corrections-pending'], 'reviewed': ['in-review', 'reviewed'],
          'audio-ready': ['in-review', 'reviewed', 'audio-ready'], 'published': ['in-review', 'reviewed', 'audio-ready', 'published'],
        };
        const at = walk(probe, path[from]);
        const r = advance(at, to, ana);
        expect(r.ok, `${from} -> ${to}`).toBe(legal);
        if (!r.ok) expect(r.refusals.map((x) => x.code)).toContain('pipeline-illegal-move');
      }
    }
  });

  it('pipeline-illegal-move: a history that skips a state, or does not start as a machine draft', () => {
    expect(codesOf(withHistory([{ state: 'machine-draft', at: '2026-10-05', by: tool }, { state: 'reviewed', at: '2026-10-06', by: ana }]))).toEqual(['pipeline-illegal-move']);
    expect(codesOf(withHistory([{ state: 'in-review', at: '2026-10-05', by: ana }]))).toEqual(['pipeline-illegal-move']);
    expect(codesOf(withHistory([
      { state: 'machine-draft', at: '2026-10-05', by: tool }, { state: 'in-review', at: '2026-10-06', by: ana }, { state: 'reviewed', at: '2026-10-07', by: ana }, { state: 'published', at: '2026-10-08' },
    ]))).toEqual(['pipeline-illegal-move']);
    expect(errorCodes(withHistory([{ state: 'machine-draft', at: '2026-10-05', by: tool }, { state: 'audio-ready', at: '2026-10-06', by: ana }]))).toContain('pipeline-illegal-move');
  });

  it('pipeline-tool-cannot-review: a tool past in-review is an error; before it, a tool is fine', () => {
    const history: PipelineEntry[] = [{ state: 'machine-draft', at: '2026-10-05', by: tool }, { state: 'in-review', at: '2026-10-06', by: tool }];
    expect(codesOf(withHistory(history))).toEqual([]);
    for (const state of ['corrections-pending', 'reviewed'] as const) {
      const d = withHistory([...history, { state, at: '2026-10-07', by: tool }]);
      expect(codesOf(d), state).toEqual(['pipeline-tool-cannot-review']);
      expect(errorCodes(d), state).toContain('pipeline-tool-cannot-review');
    }
    const audio = withHistory([...history, { state: 'reviewed', at: '2026-10-07', by: ana }, { state: 'audio-ready', at: '2026-10-08', by: tool }]);
    expect(codesOf(audio)).toEqual(['pipeline-tool-cannot-review']);
    const published = withHistory([...history, { state: 'reviewed', at: '2026-10-07', by: ana }, { state: 'audio-ready', at: '2026-10-08', by: ana }, { state: 'published', at: '2026-10-09', by: tool }]);
    expect(codesOf(published)).toEqual(['pipeline-tool-cannot-review']);
    // a published entry may omit "by" (docs/LADDER.md)
    expect(codesOf(withHistory([...history, { state: 'reviewed', at: '2026-10-07', by: ana }, { state: 'audio-ready', at: '2026-10-08', by: ana }, { state: 'published', at: '2026-10-09' }]))).toEqual([]);
  });

  it('pipeline-state-mismatch: state must equal the last history entry\'s', () => {
    const d = withHistory([{ state: 'machine-draft', at: '2026-10-05', by: tool }], 'in-review');
    expect(codesOf(d)).toEqual(['pipeline-state-mismatch']);
    expect(errorCodes(d)).toEqual(['pipeline-state-mismatch']);
  });

  it('shape errors: not an object, no history, bad state, bad date, person without competence or role, bad checklist, bad counts', () => {
    expect(errorCodes({ ...unit(), pipeline: 'done' })).toEqual(['invalid-value']);
    expect(errorCodes({ ...unit(), pipeline: { state: 'machine-draft', history: [] } })).toEqual(['missing-field']);
    expect(codesOf({ pipeline: { state: 'nearly', history: [{ state: 'machine-draft', at: '2026-10-05', by: tool }] } })).toEqual(['invalid-value']);
    expect(codesOf(withHistory([{ state: 'machine-draft', at: 'yesterday', by: tool }]))).toEqual(['invalid-value']);
    expect(codesOf(withHistory([{ state: 'machine-draft', at: '2026-10-05' }]))).toEqual(['missing-field']);
    const base: PipelineEntry[] = [{ state: 'machine-draft', at: '2026-10-05', by: tool }, { state: 'in-review', at: '2026-10-06', by: ana }];
    const bad = (e: Record<string, unknown>) => codesOf(withHistory([...base, { state: 'corrections-pending', at: '2026-10-07', by: ana, ...e } as PipelineEntry]));
    expect(bad({ by: { kind: 'person', name: 'Ana', role: 'linguistic-reviewer' } })).toEqual(['invalid-value']); // no competence
    expect(bad({ by: { kind: 'person', name: 'Ana', competence: 'native' } })).toEqual(['missing-field']); // no role
    expect(bad({ by: { kind: 'person', name: '', competence: 'native', role: 'r' } })).toEqual(['missing-field']); // no name
    expect(bad({ by: { kind: 'robot', name: 'x' } })).toEqual(['invalid-value']);
    expect(bad({ checklist: { naturalness: { result: 'fine' } } })).toEqual(['invalid-value']);
    expect(bad({ checklist: { naturalness: 'ok' } })).toEqual(['invalid-value']);
    expect(bad({ corrections: -1 })).toEqual(['invalid-value']);
    expect(bad({ corrections: 1.5 })).toEqual(['invalid-value']);
    expect(bad({ recordings: 5 })).toEqual(['invalid-value']);
    expect(bad({ checklist: okAll(), corrections: 7 })).toEqual([]);
    // unknown checklist items and history fields are warnings, not errors
    const warned = pipelineProblems(withHistory([...base, { state: 'corrections-pending', at: '2026-10-07', by: ana, checklist: { vibes: { result: 'ok' } }, mood: 'good' } as unknown as PipelineEntry]).pipeline);
    expect(warned.map((p) => `${p.severity}:${p.code}`)).toEqual(['warning:unknown-field', 'warning:unknown-field']);
  });

  it('a document without a pipeline block validates exactly as before (and "pipeline" is a known field)', () => {
    const d = { ...unit() } as Partial<CorpusDocument>;
    delete d.pipeline;
    expect(validateDocument(d, { registry }).filter((i) => i.code === 'unknown-field')).toEqual([]);
    expect(validateDocument(unit(), { registry }).filter((i) => i.code === 'unknown-field')).toEqual([]);
  });
});

describe('advance', () => {
  it('returns a new document, never mutates the input, and never touches the text', () => {
    const before = unit();
    const frozen = clone(before);
    const r = advance(before, 'in-review', ana, { at: '2026-10-06' });
    expect(before).toEqual(frozen);
    if (!r.ok) throw new Error('refused');
    expect(r.doc).not.toBe(before);
    expect(r.doc.sections).toEqual(before.sections);
    expect(r.doc.pipeline!.state).toBe('in-review');
    expect(r.entry).toEqual({ state: 'in-review', at: '2026-10-06', by: ana });
    expect(r.doc.pipeline!.history).toHaveLength(2);
    expect({ ...r.doc, pipeline: 0 }).toEqual({ ...before, pipeline: 0 });
  });

  it('records the checklist, the count and the recording on the entry it appends', () => {
    const r = advance(walk(unit(), ['in-review']), 'corrections-pending', ana, { at: '2026-10-07', checklist: okAll(), corrections: 7 });
    if (!r.ok) throw new Error('refused');
    expect(r.entry).toEqual({ state: 'corrections-pending', at: '2026-10-07', by: ana, checklist: okAll(), corrections: 7 });
  });

  it('refuses an illegal move, a tool past in-review, and a document with no pipeline', () => {
    const skip = advance(unit(), 'reviewed', ana);
    expect(skip.ok).toBe(false);
    if (!skip.ok) expect(skip.refusals.map((x) => x.code)).toEqual(['pipeline-illegal-move']);
    const byTool = advance(walk(unit(), ['in-review']), 'reviewed', tool);
    expect(byTool.ok).toBe(false);
    if (!byTool.ok) expect(byTool.refusals.map((x) => x.code)).toEqual(['pipeline-tool-cannot-review']);
    const noBy = advance(walk(unit(), ['in-review']), 'reviewed');
    expect(noBy.ok).toBe(false);
    const bare = { ...unit() } as Partial<CorpusDocument>;
    delete bare.pipeline;
    const none = advance(bare, 'in-review', ana);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.refusals[0].code).toBe('no-pipeline');
    const start = advance(bare, 'machine-draft', tool, { at: '2026-10-05' });
    expect(start.ok).toBe(true);
    if (start.ok) expect(start.doc.pipeline).toEqual({ state: 'machine-draft', history: [{ state: 'machine-draft', at: '2026-10-05', by: tool }] });
    expect(advance(unit(), 'in-review', ana, { at: '5 October' }).ok).toBe(false);
    expect(advance('nope', 'in-review', ana).ok).toBe(false);
  });

  it('refuses to move a unit whose pipeline is already invalid', () => {
    const broken = withHistory([{ state: 'machine-draft', at: '2026-10-05', by: tool }, { state: 'reviewed', at: '2026-10-06', by: tool }]);
    expect(advance(broken, 'audio-ready', ana).ok).toBe(false);
  });
});

describe('publication of a unit with a pipeline block', () => {
  const reasonsOf = (d: CorpusDocument) => computePublished(d).unpublishedReasons;

  it('a machine draft, a unit in review and a unit with corrections pending are not published, with plain reasons', () => {
    expect(computePublished(unit())).toEqual({ published: false, unpublishedReasons: ['waiting for a linguistic review by a person', 'waiting for a reviewed human recording'] });
    expect(reasonsOf(walk(unit(), ['in-review']))).toEqual([PIPELINE_REASONS.review, PIPELINE_REASONS.recording]);
    const pending = walk(unit(), ['in-review', 'corrections-pending'], { 'corrections-pending': { corrections: 2 } });
    expect(reasonsOf(pending)).toEqual([PIPELINE_REASONS.review, PIPELINE_REASONS.corrections, PIPELINE_REASONS.recording]);
    expect(PIPELINE_REASONS.corrections).toBe('corrections from the review are not resolved yet');
  });

  it('reviewed but not yet recorded: waiting for a reviewed human recording', () => {
    expect(computePublished(reviewedUnit())).toEqual({ published: false, unpublishedReasons: ['waiting for a reviewed human recording'] });
  });

  it('a corrected-and-reviewed unit with nothing pending is not held by the corrections', () => {
    const d = walk(unit(), ['in-review', 'corrections-pending', 'reviewed']);
    expect(reasonsOf(d)).toEqual([PIPELINE_REASONS.recording]);
  });

  it('a corrections-pending entry after the last reviewed holds an audio-ready unit; a later review releases it', () => {
    const d = withHistory([
      { state: 'machine-draft', at: '2026-10-05', by: tool }, { state: 'in-review', at: '2026-10-06', by: ana }, { state: 'reviewed', at: '2026-10-07', by: ana },
      { state: 'in-review', at: '2026-10-08', by: ana }, { state: 'corrections-pending', at: '2026-10-08', by: ana }, { state: 'reviewed', at: '2026-10-09', by: ana },
      { state: 'audio-ready', at: '2026-10-10', by: ana },
    ]);
    expect(computePublished(d)).toEqual({ published: true, unpublishedReasons: [] });
    // the same history without the final review: corrections are still open
    const open = withHistory([
      { state: 'machine-draft', at: '2026-10-05', by: tool }, { state: 'in-review', at: '2026-10-06', by: ana }, { state: 'reviewed', at: '2026-10-07', by: ana },
      { state: 'in-review', at: '2026-10-08', by: ana }, { state: 'corrections-pending', at: '2026-10-08', by: ana },
    ], 'audio-ready');
    expect(reasonsOf(open)).toEqual([PIPELINE_REASONS.corrections]);
  });

  it('a fully reviewed audio-ready unit publishes; so does a published one', () => {
    expect(computePublished(audioReady())).toEqual({ published: true, unpublishedReasons: [] });
    const done = walk(audioReady(), ['published']);
    expect(computePublished(done)).toEqual({ published: true, unpublishedReasons: [] });
  });

  it('an audio-ready state without a review by a person is not enough: a tool entry does not count as the review', () => {
    const d = withHistory([{ state: 'machine-draft', at: '2026-10-05', by: tool }, { state: 'in-review', at: '2026-10-06', by: tool }, { state: 'reviewed', at: '2026-10-07', by: tool }, { state: 'audio-ready', at: '2026-10-08', by: ana }]);
    expect(reasonsOf(d)).toEqual([PIPELINE_REASONS.review]);
    expect(codesOf(d)).toContain('pipeline-tool-cannot-review');
    expect(reasonsOf(withHistory([{ state: 'machine-draft', at: '2026-10-05', by: tool }], 'audio-ready'))).toEqual([PIPELINE_REASONS.review]);
  });

  it('a malformed block never publishes', () => {
    for (const pipeline of ['x', 3, [], {}, { state: 'published' }, { state: 'published', history: 'no' }, { state: 'published', history: [null, 4] }]) {
      expect(computePublished({ ...unit(), pipeline } as unknown as CorpusDocument).published).toBe(false);
    }
  });

  it('the text changed after the review: the review must be repeated', () => {
    const reviewed = walk(unit(), ['in-review', 'reviewed', 'audio-ready']);
    const entry = reviewed.pipeline!.history.find((e) => e.state === 'reviewed')!;
    entry.contentSignature = 'a-different-wording';
    expect(reasonsOf(reviewed)).toEqual([PIPELINE_REASONS.changed]);
    // without a recorded signature nothing is compared (hand-written blocks)
    delete entry.contentSignature;
    expect(computePublished(reviewed).published).toBe(true);
  });

  it('the pipeline replaces the single review block, but every other rule still applies', () => {
    const d = audioReady();
    expect(d.review).toEqual({ status: 'unreviewed' });
    expect(computePublished(d).published).toBe(true);
    // rights still unverified: the pipeline is not a way round them
    const unverified = { ...d, source: { ...d.source, rights: 'unverified' as const } };
    expect(reasonsOf(unverified)).toEqual(['rights are unverified — replace the text with a licensed or public-domain one, or establish the rights and update source.rights']);
    // a rejected review still blocks
    expect(reasonsOf({ ...d, review: { status: 'rejected' } })).toEqual(['review was rejected — fix the text and record a new review']);
  });

  it('documents without a pipeline block are decided exactly as before', () => {
    const draft = { ...unit() } as Partial<CorpusDocument>;
    delete draft.pipeline;
    const r = computePublished(draft);
    expect(r.published).toBe(false);
    expect(r.unpublishedReasons.join(' ')).toContain('machine-drafted text needs a native-speaker review');
    expect(r.unpublishedReasons).not.toContain(PIPELINE_REASONS.review);
    const reviewed = { ...baseDoc(), review: { status: 'reviewed' as const, reviewedBy: 'Ana', reviewedAt: '2026-01-01' } };
    expect(computePublished(reviewed)).toEqual({ published: false, unpublishedReasons: ['the review does not say which wording it covers — record it with npm run corpus:review'] });
  });
});

describe('pipelineSummary', () => {
  it('a document without a pipeline says so', () => {
    const d = { ...unit() } as Partial<CorpusDocument>;
    delete d.pipeline;
    expect(pipelineSummary(d)).toMatchObject({ hasPipeline: false, pipelineOpen: true, waitingFor: [] });
    expect(pipelineSummary(null).hasPipeline).toBe(false);
  });

  it('summarises state, reviewer, correction rounds and what the unit waits for', () => {
    const s0 = pipelineSummary(unit());
    expect(s0).toMatchObject({ hasPipeline: true, state: 'machine-draft', correctionRounds: 0, correctionsPending: false, pipelineOpen: false });
    expect(s0.waitingFor).toEqual([PIPELINE_REASONS.review, PIPELINE_REASONS.recording]);

    const pending = walk(unit(), ['in-review', 'corrections-pending'], { 'corrections-pending': { corrections: 7 } });
    expect(pipelineSummary(pending)).toMatchObject({ state: 'corrections-pending', correctionRounds: 1, correctionsTotal: 7, correctionsPending: true });

    const open = pipelineSummary(audioReady());
    expect(open).toMatchObject({ state: 'audio-ready', reviewedBy: 'Ana Ruiz', pipelineOpen: true, waitingFor: [], recordings: 'recordings/es-a1-1-01 (Ana Ruiz, reviewed)' });
    expect(open.line).toContain('open for learners');
    expect(pipelineSummary(reviewedUnit()).line).toBe('reviewed, reviewed by Ana Ruiz on ' + reviewedUnit().pipeline!.history.at(-1)!.at + ' - waiting for a reviewed human recording');
  });
});

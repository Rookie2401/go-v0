import { describe, expect, it } from 'vitest';
import { validateEvent } from '../../packages/repository-contract/src';
import type { GoEvent } from '../../packages/repository-contract/src';
import { newVersion, sentenceKey, toDocument } from '../../packages/gotell/src/documents';
import type { SentenceJudge } from '../../packages/gotell/src/documents';
import { assistanceKind, correctionAccepted, correctionRejected, isAssisted, observationMode, writingEvidence } from '../../packages/gotell/src/evidence';
import type { AssistanceLevel, Authorship, DraftAnalysis, DraftRecord, Identity, SentenceAnalysis } from '../../packages/gotell/src/types';
import { blankRecord, makeWorld } from './world';

const NOW = '2026-10-09T09:30:00.000Z';
const identity: Identity = { learnerId: 'learner-1', enrolmentId: 'enrol-1', deviceId: 'dev-1', languageId: 'sq' };

const S = {
  indep: 'Unë kam një shtëpi të madhe.',
  hint: 'Motra ime punon në spital.',
  fixed: 'Ne shkojmë në shkollë çdo ditë.',
  copied: 'Faleminderit shumë për ndihmën tuaj.',
  ai: 'Besimi im është themeli i jetës sime.',
};
const ALL = Object.values(S).join(' ');

function judgeBy(map: Record<string, { a: Authorship; l?: AssistanceLevel[] }>): SentenceJudge {
  return (s) => { const m = map[s]; return { authorship: m.a, assistance: m.l ?? [] }; };
}

function build(over: Partial<DraftRecord> = {}): { record: DraftRecord; events: GoEvent[]; summary: string[] } {
  const rec = blankRecord({ mode: 'guided', ...over });
  const record = newVersion(rec, ALL, judgeBy({
    [S.indep]: { a: 'independent' },
    [S.hint]: { a: 'after-hint', l: [1, 2, 3] },
    [S.fixed]: { a: 'revised-after-feedback', l: [4] },
    [S.copied]: { a: 'copied-from-model', l: [6] },
    [S.ai]: { a: 'ai-generated', l: [5, 6] },
  }), 'dev-1', NOW);
  const ev = writingEvidence(record, record.versions[0], identity, NOW);
  return { record, ...ev };
}

const produced = (events: GoEvent[]): GoEvent[] => events.filter((e) => e.kind === 'ProductionRecorded');
const byKey = (events: GoEvent[], sentence: string): GoEvent => produced(events).find((e) => e.payload.sentenceKey === sentenceKey(sentence))!;

describe('writingEvidence', () => {
  it('emits one valid DraftSaved and one valid ProductionRecorded per sentence, all from the tell producer', () => {
    const { events, record } = build();
    expect(events.filter((e) => e.kind === 'DraftSaved')).toHaveLength(1);
    expect(produced(events)).toHaveLength(5);
    for (const e of events) {
      expect(validateEvent(e)).toEqual([]);
      expect(e.producer).toMatchObject({ app: 'gopractice-tell', deviceId: 'dev-1' });
      expect(e).toMatchObject({ learnerId: 'learner-1', enrolmentId: 'enrol-1', languageId: 'sq', at: NOW, v: 3 });
      expect(e.dedupeKey).toBeTruthy();
    }
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    const saved = events[0];
    expect(saved.payload).toEqual({ draftId: record.draftId, versionId: record.versions[0].versionId, sentences: 5, wordCount: 29 });
    expect(saved.subject).toEqual({ draftId: record.draftId });
  });

  it('never carries any sentence text, anywhere in the event', () => {
    const { events, record } = build({ title: 'Shtëpia ime e madhe' });
    const json = JSON.stringify(events);
    for (const s of Object.values(S)) {
      expect(json).not.toContain(s);
      for (const word of s.replace(/[.,]/g, '').split(' ').filter((w) => w.length > 5)) expect(json).not.toContain(word);
    }
    expect(json).not.toContain(record.title);
    expect(json).not.toContain(record.text.slice(0, 20));
  });

  it('maps authorship, assistance levels and mode as specified', () => {
    const { events, record } = build();
    const indep = byKey(events, S.indep).payload;
    expect(indep).toMatchObject({ mode: 'guided', assisted: false, assistance: [], usedCorrectly: 'unjudged', authorship: 'independent', draftId: record.draftId, wordCount: 6 });
    expect(indep.sentenceKey).toBe(sentenceKey(S.indep));
    expect(String(indep.sentenceKey)).toMatch(/^[0-9a-f]{8}$/);

    const hint = byKey(events, S.hint).payload;
    expect(hint).toMatchObject({ assisted: true, assistance: ['hint', 'example'], authorship: 'after-hint' });
    const fixed = byKey(events, S.fixed).payload;
    expect(fixed).toMatchObject({ assisted: true, assistance: ['correction'], usedCorrectly: 'unjudged', authorship: 'revised-after-feedback' });

    expect(assistanceKind(1)).toBe('hint'); expect(assistanceKind(2)).toBe('hint'); expect(assistanceKind(3)).toBe('example');
    expect(assistanceKind(4)).toBe('correction'); expect(assistanceKind(5)).toBe('example'); expect(assistanceKind(6)).toBe('translation');
    expect(isAssisted('independent')).toBe(false); expect(isAssisted('reproduced-later')).toBe(false);
    expect(isAssisted('after-hint')).toBe(true);

    expect(observationMode('free')).toBe('free'); expect(observationMode('narrative')).toBe('free');
    for (const m of ['guided', 'missionary', 'testimony'] as const) expect(observationMode(m)).toBe('guided');
    expect(observationMode('targeted')).toBe('retrieval');
    const t = build({ mode: 'targeted' });
    expect(produced(t.events).every((e) => e.payload.mode === 'retrieval')).toBe(true);
  });

  it('a copied-from-model or AI sentence is history: assisted translation, unjudged, evidence quality none, no unit ids', () => {
    const { record } = build();
    const analysis = analysisFor(record.draftId, Object.values(S), { units: ['lemma:sq:shtëpi:NOUN'] });
    const { events } = writingEvidence(record, record.versions[0], identity, NOW, { analysis, checkerCovers: () => true });
    for (const s of [S.copied, S.ai]) {
      const e = byKey(events, s);
      expect(e.payload).toMatchObject({ assisted: true, assistance: ['translation'], usedCorrectly: 'unjudged' });
      expect(e.evidence).toMatchObject({ quality: 'none', assisted: true });
      expect(e.subject.itemIds).toBeUndefined();
    }
    expect(byKey(events, S.copied).payload.authorship).toBe('copied-from-model');
    expect(byKey(events, S.ai).payload.authorship).toBe('ai-generated');
    expect(byKey(events, S.indep).evidence?.quality).not.toBe('none');
    expect(events.find((e) => e.kind === 'DraftSaved')!.evidence?.quality).toBe('none');
  });

  it('usedCorrectly is true only for a clean, covered, non-corrected sentence; never from an accepted correction', () => {
    const { record } = build();
    const analysis = analysisFor(record.draftId, Object.values(S), { units: ['lemma:sq:shtëpi:NOUN', 'lemma:sq:madh:ADJ'] });
    // default coverage rule: the checker must have run on the sentence (coverageParts.checked) with a live analysis; the honesty line is never empty
    const strict = writingEvidence(record, record.versions[0], identity, NOW, { analysis });
    expect(produced(strict.events).every((e) => e.payload.usedCorrectly === 'unjudged')).toBe(true);

    const covered = writingEvidence(record, record.versions[0], identity, NOW, { analysis: analysisFor(record.draftId, Object.values(S), { units: ['lemma:sq:shtëpi:NOUN'], covered: true }) });
    expect(byKey(covered.events, S.indep).payload.usedCorrectly).toBe(true);
    expect(byKey(covered.events, S.indep).subject.itemIds).toEqual(['lemma:sq:shtëpi:NOUN']);
    expect(byKey(covered.events, S.hint).payload.usedCorrectly).toBe(true); // assisted, but written by the learner and clean
    expect(byKey(covered.events, S.fixed).payload.usedCorrectly).toBe('unjudged'); // came from an accepted correction
    expect(byKey(covered.events, S.copied).payload.usedCorrectly).toBe('unjudged');
    expect(byKey(covered.events, S.ai).payload.usedCorrectly).toBe('unjudged');

    // a sentence with detected issues is not true, and a stale analysis (different text) is ignored
    const issues = analysisFor(record.draftId, Object.values(S), { units: [], covered: true, issueOn: S.indep });
    expect(byKey(writingEvidence(record, record.versions[0], identity, NOW, { analysis: issues }).events, S.indep).payload.usedCorrectly).toBe('unjudged');
    const stale = analysisFor(record.draftId, ['Fjali tjetër krejt.'], { units: [], covered: true });
    expect(byKey(writingEvidence(record, record.versions[0], identity, NOW, { analysis: stale }).events, S.indep).payload.usedCorrectly).toBe('unjudged');
  });

  it('limits subject.itemIds to 24 unit ids', () => {
    const { record } = build();
    const units = Array.from({ length: 40 }, (_, i) => `lemma:sq:w${i}:NOUN`);
    const { events } = writingEvidence(record, record.versions[0], identity, NOW, { analysis: analysisFor(record.draftId, Object.values(S), { units, covered: true }) });
    const e = byKey(events, S.indep);
    expect(e.subject.itemIds).toHaveLength(24);
    expect(validateEvent(e)).toEqual([]);
  });

  it('states what was and was not claimed', () => {
    const { summary } = build();
    const joined = summary.join('\n');
    expect(joined).toMatch(/5 sentences/);
    expect(joined).toMatch(/3 sentences recorded as 1 independent, 1 written after a hint, 1 revised after feedback, judged unjudged\./);
    expect(joined).toMatch(/1 sentence copied from a model: no production credit\./);
    expect(joined).toMatch(/1 sentence AI-generated: no production credit\./);
    // only independent sentences
    const solo = newVersion(blankRecord(), 'Unë shkruaj. Ti lexon. Ai dëgjon.', () => ({ authorship: 'independent', assistance: [] }), 'dev-1', NOW);
    expect(writingEvidence(solo, solo.versions[0], identity, NOW).summary.join('\n')).toContain('3 sentences recorded as independent, judged unjudged.');
  });

  it('repeats the same dedupe keys for an unchanged sentence across versions, so it is stored once', () => {
    const rec1 = newVersion(blankRecord(), 'Unë shkruaj sot.', () => ({ authorship: 'independent', assistance: [] }), 'dev-1', NOW);
    const rec2 = newVersion(rec1, 'Unë shkruaj sot. Ti lexon.', (_s, p) => ({ authorship: p ? p.authorship : 'independent', assistance: [] }), 'dev-1', '2026-10-09T09:40:00.000Z');
    const a = produced(writingEvidence(rec1, rec1.versions[0], identity, NOW).events)[0];
    const b = produced(writingEvidence(rec2, rec2.versions[1], identity, NOW).events).find((e) => e.payload.sentenceKey === sentenceKey('Unë shkruaj sot.'))!;
    expect(b.dedupeKey).toBe(a.dedupeKey);
    expect(b.id).not.toBe(a.id);
    // identical sentences inside one version are one observation
    const dup = newVersion(blankRecord(), 'Po. Po.', () => ({ authorship: 'independent', assistance: [] }), 'dev-1', NOW);
    expect(produced(writingEvidence(dup, dup.versions[0], identity, NOW).events)).toHaveLength(1);
  });

  it('skips lines with no letters or numbers', () => {
    const rec = newVersion(blankRecord(), 'Mirë. ...\n---\nPo.', () => ({ authorship: 'independent', assistance: [] }), 'dev-1', NOW);
    const { events } = writingEvidence(rec, rec.versions[0], identity, NOW);
    expect(produced(events)).toHaveLength(2);
  });
});

describe('correction events', () => {
  it('builds valid CorrectionAccepted / CorrectionRejected events that reference an earlier event and carry no text', () => {
    const input = { correctionId: 'cor-1', issueIds: ['i1', 'i2'], categories: ['agreement', 'case'], meaningChange: 'negation added', draftId: 'draft-9', sentenceKey: sentenceKey(S.fixed), correctionOf: 'ev:earlier' };
    const acc = correctionAccepted(input, identity, NOW);
    const rej = correctionRejected({ ...input, correctionId: 'cor-2', correctionOf: undefined, meaningChange: undefined }, identity, NOW);
    expect(acc).toMatchObject({ kind: 'CorrectionAccepted', correctionOf: 'ev:earlier', payload: { correctionId: 'cor-1', issueIds: ['i1', 'i2'], categories: ['agreement', 'case'], meaningChange: 'negation added' } });
    expect(rej.kind).toBe('CorrectionRejected');
    expect(rej.correctionOf).toBeUndefined();
    expect(rej.payload).not.toHaveProperty('meaningChange');
    expect(rej.payload).toMatchObject({ correctionId: 'cor-2' });
    for (const e of [acc, rej]) {
      expect(validateEvent(e)).toEqual([]);
      expect(e.evidence?.quality).toBe('none');
      expect(JSON.stringify(e)).not.toContain(S.fixed);
      expect(e.payload).not.toHaveProperty('usedCorrectly');
    }
    expect(acc.dedupeKey).not.toBe(rej.dedupeKey);
  });
});

describe('the Repository accepts the events and keeps the words out of the log', () => {
  it('appends every event through the real service, and submitWriting stores the document beside the observation', async () => {
    const w = await makeWorld();
    const d = await w.device('dev-1');
    const id: Identity = d.identity;
    const record = newVersion(blankRecord({ mode: 'testimony', title: 'Dëshmia' }), ALL, judgeBy({
      [S.indep]: { a: 'independent' }, [S.hint]: { a: 'after-hint', l: [2] }, [S.fixed]: { a: 'revised-after-feedback', l: [4] },
      [S.copied]: { a: 'copied-from-model', l: [6] }, [S.ai]: { a: 'ai-generated', l: [6] },
    }), 'dev-1', NOW);
    const { events } = writingEvidence(record, record.versions[0], id, NOW);
    const [saved, first, ...rest] = events;

    const doc = toDocument(record, { learnerId: id.learnerId, deviceId: 'dev-1' }, 1, NOW);
    const sub = await d.api.submitWriting({ observation: first, document: { doc, expectedRevision: 0 } });
    expect(sub.ok).toBe(true);
    const append = await d.api.appendEvents([saved, ...rest]);
    expect(append.ok && append.data.outcomes.every((o) => o.stored)).toBe(true);
    // idempotent: the same events again are duplicates
    const again = await d.api.appendEvents([saved]);
    expect(again.ok && again.data.duplicates).toBe(1);
    const acc = await d.api.appendEvents([correctionAccepted({ correctionId: 'c1', issueIds: ['i'], categories: ['case'] }, id, NOW)]);
    expect(acc.ok && acc.data.stored).toBe(1);

    const log = await d.api.listEvents({ limit: 100 });
    const ours = log.ok ? log.data.events.filter((e) => e.producer.app === 'gopractice-tell') : [];
    expect(ours).toHaveLength(7);
    const dump = JSON.stringify(log.ok ? log.data.events : []);
    for (const s of Object.values(S)) expect(dump).not.toContain(s);
    // the text is in the private document, and only there
    const stored = await d.api.getDocument(record.draftId);
    expect(stored.ok && stored.data.document.kind).toBe('testimony');
    expect(stored.ok && stored.data.document.body).toContain(S.indep);
  });
});

function analysisFor(draftId: string, sentences: string[], o: { units: string[]; covered?: boolean; issueOn?: string }): DraftAnalysis {
  const sa = (text: string, index: number): SentenceAnalysis => ({
    index, text, tokens: text.split(' '), unitIds: o.units, familiarity: 0.9,
    issues: o.issueOn === text ? [{ issueId: 'i1', sentenceIndex: index, span: { start: 0, end: 2 }, surface: 'Unë', category: 'agreement', class: 'grammatically-wrong', confidence: 0.9, provenance: { source: 'adapter-checker', ref: 'x' }, hint: 'check', unitIds: [], affectsMeaning: false }] : [],
    corrections: [], checkerCoverage: o.covered ? 'Checked: definiteness. Not checked: 8 other areas.' : 'The checker did not run on this sentence.', coverageParts: { headline: o.covered ? 'checked' : 'not checked', limits: [], checked: !!o.covered }, analysisStatus: o.covered ? 'verified' : 'provisional',
  });
  return { draftId, languageId: 'sq', textHash: 'x', sentences: sentences.map(sa), analyzerId: 'adapter-sq@1', packVersion: '1', at: NOW };
}

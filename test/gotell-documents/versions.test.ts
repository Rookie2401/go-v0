import { describe, expect, it } from 'vitest';
import {
  decodeBody, diffVersions, encodeRecord, exportDraft, exportFileName, isUnchanged, judgeFromAssistance, newVersion, restoreVersion, splitSentences,
} from '../../packages/gotell/src/documents';
import type { SentenceJudge } from '../../packages/gotell/src/documents';
import { sentenceScopeHash } from '../../packages/gotell/src/engine';
import type { AssistanceStep, DraftRecord } from '../../packages/gotell/src/types';
import { blankRecord } from './world';

const T = (n: number): string => `2026-10-09T09:0${n}:00.000Z`;
const independent: SentenceJudge = () => ({ authorship: 'independent', assistance: [] });
const step = (level: AssistanceStep['level'], content: string, over: Partial<AssistanceStep> = {}): AssistanceStep => ({
  level, content, revealedUnitIds: [], source: 'pack-sentence', at: T(1), ...over,
});

describe('splitSentences', () => {
  it('splits on terminators, line breaks and full-width / danda marks, and keeps quotes with their sentence', () => {
    expect(splitSentences('Unë jam Ana. Ti kush je? Mirë!')).toEqual(['Unë jam Ana.', 'Ti kush je?', 'Mirë!']);
    expect(splitSentences('Një rresht\nDy rreshta.')).toEqual(['Një rresht', 'Dy rreshta.']);
    expect(splitSentences('मैं घर जाता हूँ।तुम कहाँ हो?')).toEqual(['मैं घर जाता हूँ।', 'तुम कहाँ हो?']);
    expect(splitSentences('Ai tha: "Po." Pastaj iku.')).toEqual(['Ai tha: "Po."', 'Pastaj iku.']);
    expect(splitSentences('Çmimi është 3.5 euro. Mirë.')).toEqual(['Çmimi është 3.5 euro.', 'Mirë.']);
    expect(splitSentences('  \n ')).toEqual([]);
  });
});

describe('newVersion', () => {
  it('appends an immutable version, judges each sentence and resets the assistance for the next round', () => {
    const rec = blankRecord({ assistance: [step(2, 'check the ending')] });
    const calls: Array<[string, boolean, number]> = [];
    const judge: SentenceJudge = (s, prior, i) => { calls.push([s, !!prior, i]); return { authorship: i === 0 ? 'independent' : 'after-hint', assistance: i === 0 ? [] : [2] }; };
    const v1 = newVersion(rec, 'Unë kam një libër. Ai është i ri.', judge, 'dev-1', T(1), 'first');

    expect(v1.versions).toHaveLength(1);
    expect(v1.text).toBe('Unë kam një libër. Ai është i ri.');
    expect(v1.assistance).toEqual([]);
    expect(v1.updatedAt).toBe(T(1));
    expect(v1.versions[0].sentences.map((s) => [s.text, s.authorship, s.assistance])).toEqual([['Unë kam një libër.', 'independent', []], ['Ai është i ri.', 'after-hint', [2]]]);
    expect(v1.versions[0]).toMatchObject({ deviceId: 'dev-1', at: T(1), note: 'first' });
    expect(v1.versions[0].versionId).toMatch(/^v1-/);
    expect(calls).toEqual([['Unë kam një libër.', false, 0], ['Ai është i ri.', false, 1]]);
    expect(rec.versions).toHaveLength(0); // the input record is untouched
    expect(rec.assistance).toHaveLength(1);
  });

  it('never changes an earlier version', () => {
    let rec = blankRecord();
    rec = newVersion(rec, 'Një. Dy.', independent, 'dev-1', T(1));
    const frozen = JSON.stringify(rec.versions[0]);
    rec = newVersion(rec, 'Një. Dy ndryshe. Tre.', () => ({ authorship: 'revised-after-feedback', assistance: [4] }), 'dev-2', T(2));
    rec = newVersion(rec, 'Tre.', independent, 'dev-1', T(3));
    expect(rec.versions).toHaveLength(3);
    expect(JSON.stringify(rec.versions[0])).toBe(frozen);
    const ids = rec.versions.map((v) => v.versionId);
    expect(new Set(ids).size).toBe(3);
    expect(rec.text).toBe('Tre.');
    // mutating a returned record cannot reach the one it came from
    const before = JSON.stringify(rec);
    const next = newVersion(rec, 'Katër.', independent, 'dev-1', T(4));
    next.versions[0].sentences[0].text = 'TAMPERED';
    expect(JSON.stringify(rec)).toBe(before);
  });

  it('gives the judge the identical prior sentence (so a carried-over sentence keeps its authorship) or the same-position one', () => {
    let rec = newVersion(blankRecord(), 'Pjesa një. Pjesa dy.', (_s, _p, i) => ({ authorship: i === 0 ? 'copied-from-model' : 'independent', assistance: i === 0 ? [6] : [] }), 'dev-1', T(1));
    const seen: Array<[string, string | undefined]> = [];
    rec = newVersion(rec, 'Pjesa një. Pjesa dy e ndryshuar.', (s, prior) => { seen.push([s, prior?.text]); return { authorship: prior && prior.text === s ? prior.authorship : 'independent', assistance: [] }; }, 'dev-1', T(2));
    expect(seen).toEqual([['Pjesa një.', 'Pjesa një.'], ['Pjesa dy e ndryshuar.', 'Pjesa dy.']]);
    expect(rec.versions[1].sentences[0]).toMatchObject({ authorship: 'copied-from-model', at: T(1) }); // carried over: same time, same authorship
    expect(rec.versions[1].sentences[1].at).toBe(T(2));
    expect(isUnchanged(rec, rec.text)).toBe(true);
    expect(isUnchanged(rec, 'other')).toBe(false);
  });
});

describe('judgeFromAssistance (the conservative default)', () => {
  const j = (steps: AssistanceStep[]) => judgeFromAssistance(steps);
  it('is independent when no help was shown, and a carried-over sentence keeps its earlier authorship', () => {
    expect(j([])('Unë shkruaj.', undefined, 0)).toEqual({ authorship: 'independent', assistance: [] });
    const prior = { text: 'Unë shkruaj.', authorship: 'after-hint' as const, assistance: [2 as const], at: T(1) };
    expect(j([step(2, 'hint')])('Unë shkruaj.', prior, 0)).toEqual({ authorship: 'after-hint', assistance: [] });
  });
  it('attributes a sentence equal to a shown model or correction, and ranks the sources', () => {
    expect(j([step(6, 'Unë jam student.')])('Unë jam student.', undefined, 0)).toMatchObject({ authorship: 'copied-from-model', assistance: [6] });
    expect(j([step(5, 'Alternativa A.\nUnë jam student.')])('unë jam student', undefined, 0).authorship).toBe('copied-from-model');
    expect(j([step(4, 'Unë shkoj në shkollë.')])('Unë shkoj në shkollë.', undefined, 0).authorship).toBe('revised-after-feedback');
    expect(j([step(4, 'Unë shkoj në shkollë.', { source: 'remote-assistant' })])('Unë shkoj në shkollë.', undefined, 0).authorship).toBe('ai-generated');
    expect(j([step(6, 'Unë shkoj.', { source: 'learner-own-sentence', review: 'learner-own' })])('Unë shkoj.', undefined, 0).authorship).toBe('reproduced-later');
  });
  it('assumes a changed sentence in a helped round was helped: hint levels → after-hint, level 4+ → revised-after-feedback', () => {
    expect(j([step(1, 'x'), step(2, 'y')])('Diçka e re.', undefined, 0)).toEqual({ authorship: 'after-hint', assistance: [1, 2] });
    expect(j([step(2, 'y'), step(4, 'Fjali tjetër.')])('Diçka e re.', undefined, 0)).toEqual({ authorship: 'revised-after-feedback', assistance: [2, 4] });
  });
});

describe('judgeFromAssistance, per sentence', () => {
  const forSentence = (i: number, text: string, level: AssistanceStep['level'], content: string): AssistanceStep => step(level, content, { source: 'adapter-checker', sentenceIndex: i, sentenceHash: sentenceScopeHash(text) });
  const steps = [forSentence(0, 'Unë shkoj te libër.', 1, 'x'), forSentence(0, 'Unë shkoj te libër.', 2, 'y')];

  it('a hint on sentence 0 leaves an edited sentence 1 independent', () => {
    const j = judgeFromAssistance(steps);
    expect(j('Unë shkoj te libri.', undefined, 0)).toEqual({ authorship: 'after-hint', assistance: [1, 2] });
    expect(j('Unë lexoj gazetën.', undefined, 1)).toEqual({ authorship: 'independent', assistance: [] });
  });

  it('through newVersion: two sentences, hint on sentence 0 only, both rewritten', () => {
    let rec = newVersion(blankRecord(), 'Unë shkoj te libër. Unë lexoj librin.', independent, 'dev-1', T(1));
    rec = { ...rec, assistance: steps };
    rec = newVersion(rec, 'Unë shkoj te libri. Unë lexoj gazetën.', judgeFromAssistance(rec.assistance), 'dev-1', T(2));
    expect(rec.versions[1].sentences.map((s) => s.authorship)).toEqual(['after-hint', 'independent']);
    expect(rec.versions[1].sentences.map((s) => s.assistance)).toEqual([[1, 2], []]);
  });

  it('steps with no sentence reference (legacy) still mark every changed sentence of the round', () => {
    const j = judgeFromAssistance([step(2, 'y')]);
    expect(j('Diçka e re.', undefined, 0).authorship).toBe('after-hint');
    expect(j('Diçka tjetër.', undefined, 1).authorship).toBe('after-hint');
  });

  it('the sentence reference survives the JSON round trip of the record', () => {
    let rec = blankRecord({ assistance: steps });
    rec = newVersion(rec, 'Unë shkoj te libri.', judgeFromAssistance(steps), 'dev-1', T(1));
    rec = { ...rec, assistance: steps };
    const back = decodeBody({ docId: rec.draftId, languageId: 'sq', kind: 'draft', title: '', updatedAt: T(1), body: encodeRecord(rec) });
    expect(back.assistance[0]).toMatchObject({ sentenceIndex: 0, sentenceHash: sentenceScopeHash('Unë shkoj te libër.') });
  });
});

describe('diffVersions', () => {
  const make = (...texts: string[]): DraftRecord => {
    let rec = blankRecord();
    texts.forEach((t, i) => { rec = newVersion(rec, t, independent, 'dev-1', T(i + 1)); });
    return rec;
  };
  it('reports added, removed, changed and unchanged sentences', () => {
    const rec = make('Një. Dy. Tre. Katër.', 'Një. Dy ndryshe. Katër. Pesë.');
    const d = diffVersions(rec.versions[0], rec.versions[1]);
    expect(d.entries.map((e) => [e.kind, e.before?.text, e.after?.text])).toEqual([
      ['unchanged', 'Një.', 'Një.'],
      ['changed', 'Dy.', 'Dy ndryshe.'],
      ['removed', 'Tre.', undefined],
      ['unchanged', 'Katër.', 'Katër.'],
      ['added', undefined, 'Pesë.'],
    ]);
    expect(d).toMatchObject({ added: 1, removed: 1, changed: 1, unchanged: 2 });
  });
  it('treats identical versions as all unchanged and an empty side as all added or removed', () => {
    const rec = make('A. B.', 'A. B.', '');
    expect(diffVersions(rec.versions[0], rec.versions[1])).toMatchObject({ added: 0, removed: 0, changed: 0, unchanged: 2 });
    expect(diffVersions(rec.versions[1], rec.versions[2])).toMatchObject({ added: 0, removed: 2, changed: 0, unchanged: 0 });
    expect(diffVersions(rec.versions[2], rec.versions[1])).toMatchObject({ added: 2, removed: 0 });
  });
});

describe('restoreVersion', () => {
  it('creates a new version equal to the old text and deletes nothing', () => {
    let rec = newVersion(blankRecord(), 'Fillimi. Mesi.', () => ({ authorship: 'after-hint', assistance: [2] }), 'dev-1', T(1));
    rec = newVersion(rec, 'Krejt ndryshe.', independent, 'dev-1', T(2));
    const v1 = rec.versions[0];
    const restored = restoreVersion(rec, v1.versionId, 'dev-2', T(3));
    expect(restored.versions).toHaveLength(3);
    expect(restored.versions.slice(0, 2)).toEqual(rec.versions);
    expect(restored.text).toBe('Fillimi. Mesi.');
    expect(restored.versions[2]).toMatchObject({ text: v1.text, textHash: v1.textHash, deviceId: 'dev-2', at: T(3) });
    expect(restored.versions[2].versionId).not.toBe(v1.versionId);
    expect(restored.versions[2].note).toContain(v1.versionId);
    expect(restored.versions[2].sentences.map((s) => s.authorship)).toEqual(['after-hint', 'after-hint']); // authorship is history; restoring does not launder it
    expect(restored.assistance).toEqual([]);
    expect(() => restoreVersion(rec, 'nope', 'dev-1', T(3))).toThrow(/No version/);
  });
});

describe('exportDraft', () => {
  const rec = newVersion(blankRecord({ title: 'Letra ime', varietyId: 'tosk' }), 'Të dashur miq.\nJu falënderoj.', independent, 'dev-1', '2026-10-09T09:05:00.000Z');
  it('json is the whole record', () => {
    expect(JSON.parse(exportDraft(rec, 'json'))).toEqual(rec);
  });
  it('text and markdown are the current text under a header with title, language, date and version count', () => {
    expect(exportDraft(rec, 'text')).toBe('Letra ime\nLanguage: sq (tosk)\nDate: 2026-10-09\nVersions: 1\n\nTë dashur miq.\nJu falënderoj.\n');
    expect(exportDraft(rec, 'markdown')).toBe('# Letra ime\n\n*Language: sq (tosk) · Date: 2026-10-09 · Versions: 1*\n\nTë dashur miq.\nJu falënderoj.\n');
    expect(exportDraft(rec, 'text')).not.toContain('versionId');
  });
  it('names files from the title', () => {
    expect(exportFileName(rec, 'markdown')).toBe('letra-ime.md');
    expect(exportFileName({ ...rec, title: '' }, 'json')).toBe('draft.json');
    expect(exportFileName({ ...rec, title: 'Dëshmia ime!' }, 'text')).toBe('dëshmia-ime.txt');
  });
});

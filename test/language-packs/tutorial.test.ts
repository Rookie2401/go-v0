import { describe, expect, it } from 'vitest';
import { sqAdapter } from '../../src/adapters/sq';
import { SQ_PASSAGE, SQ_TUTORIAL, SQ_TUTORIAL_STEPS, albanianManifest, readSelection } from '../../packages/language-packs/src';

const words = (text: string) => sqAdapter.analyze(sqAdapter.tokenize(text)).filter((a) => a.token.isWord);

describe('the Albanian orientation', () => {
  it('is marked machine-drafted and unreviewed everywhere it teaches the language', () => {
    expect(SQ_TUTORIAL).toMatchObject({ authorship: 'machine-drafted', reviewed: false, reviewNeeded: 'native speaker', skippable: true });
    expect(SQ_PASSAGE).toMatchObject({ authorship: 'machine-drafted', reviewed: false, reviewNeeded: 'native speaker' });
    expect(SQ_TUTORIAL.notice).toMatch(/not been checked by a native speaker/);
    expect(JSON.stringify(SQ_TUTORIAL)).not.toMatch(/native[- ]speaker[- ](verified|reviewed|approved|validated)/i);
  });

  it('covers the six parts of the brief', () => {
    const kinds = SQ_TUTORIAL_STEPS.map((s) => s.kind);
    for (const k of ['alphabet', 'sounds', 'words', 'patterns', 'passage', 'concept'] as const) expect(kinds, k).toContain(k);
    expect(new Set(SQ_TUTORIAL_STEPS.map((s) => s.id)).size).toBe(SQ_TUTORIAL_STEPS.length);
    const concepts = SQ_TUTORIAL_STEPS.filter((s) => s.kind === 'concept').map((s) => s.id);
    expect(concepts).toEqual(['concept-lemma', 'concept-morphology', 'concept-click', 'concept-pronunciation', 'concept-sentence', 'concept-encounters', 'concept-practice']);
  });

  it('teaches ë, ç and the nine digraphs, each digraph with an example', () => {
    const alphabet = SQ_TUTORIAL_STEPS.filter((s) => s.kind === 'alphabet');
    const text = alphabet.map((s) => s.body).join(' ');
    for (const l of ['ë', 'ç', 'dh', 'gj', 'll', 'nj', 'rr', 'sh', 'th', 'xh', 'zh']) expect(text, l).toContain(l);
    const examples = alphabet.flatMap((s) => s.examples ?? []).map((e) => e.surface);
    for (const l of ['dh', 'gj', 'll', 'nj', 'rr', 'sh', 'th', 'xh', 'zh', 'ë', 'ç']) expect(examples.some((e) => e.includes(l)), `example with ${l}`).toBe(true);
    const sounds = SQ_TUTORIAL_STEPS.filter((s) => s.kind === 'sounds').map((s) => s.body).join(' ');
    for (const l of [' j ', ' c ', ' x ', ' y ', ' q ']) expect(sounds, l).toContain(l);
  });

  it('has 10 to 12 common words, each read by the analyser', () => {
    const step = SQ_TUTORIAL_STEPS.find((s) => s.kind === 'words')!;
    expect(step.examples!.length).toBeGreaterThanOrEqual(10);
    expect(step.examples!.length).toBeLessThanOrEqual(12);
    for (const e of step.examples!) {
      const r = readSelection(sqAdapter, e.surface);
      expect(r.top, e.surface).toBeDefined();
      expect(r.top!.confidence, e.surface).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('has two sentence patterns with three example sentences each, every word read by the analyser', () => {
    const patterns = SQ_TUTORIAL_STEPS.filter((s) => s.kind === 'patterns');
    expect(patterns).toHaveLength(2);
    for (const p of patterns) {
      expect(p.examples).toHaveLength(3);
      for (const ex of p.examples!) for (const a of words(ex.surface)) expect(a.candidates[0]?.confidence ?? 0, `${a.token.surface} in ${ex.surface}`).toBeGreaterThanOrEqual(0.5);
    }
    expect(patterns[1].examples!.every((e) => e.surface.includes('është'))).toBe(true);
  });

  it('has a 5 to 7 sentence passage in which every word gets a reading with confidence >= 0.5', () => {
    expect(SQ_PASSAGE.sentences.length).toBeGreaterThanOrEqual(5);
    expect(SQ_PASSAGE.sentences.length).toBeLessThanOrEqual(7);
    for (const s of SQ_PASSAGE.sentences) {
      const ws = words(s.text);
      expect(ws.length, s.text).toBeGreaterThan(0);
      for (const a of ws) {
        const top = a.candidates[0];
        expect(top, `${a.token.surface} in “${s.text}”`).toBeDefined();
        expect(top!.confidence, `${a.token.surface} in “${s.text}”`).toBeGreaterThanOrEqual(0.5);
        expect(top!.unconfirmed, `${a.token.surface} is a guess`).not.toBe(true);
      }
      expect(s.gloss.length).toBeGreaterThan(0);
    }
    expect(SQ_TUTORIAL_STEPS.find((s) => s.kind === 'passage')!.passage).toBe(SQ_PASSAGE);
  });

  it('every practice task names a word that is in its sentence and that the analyser reads', () => {
    const tasks = SQ_TUTORIAL_STEPS.filter((s) => s.practice);
    expect(tasks.length).toBeGreaterThanOrEqual(4);
    for (const s of tasks) {
      const p = s.practice!;
      expect(p.sentence, s.id).toContain(p.target);
      const r = readSelection(sqAdapter, p.target, p.sentence);
      expect(r.found, s.id).toBe(true);
      expect(r.top, s.id).toBeDefined();
    }
  });

  it('is plain text (no markup), and its length agrees with the manifest', () => {
    for (const s of SQ_TUTORIAL_STEPS) {
      expect(s.body, s.id).not.toMatch(/[*_#`]|\]\(|<\w+>/);
      expect(s.body.length, s.id).toBeGreaterThan(40);
      expect(s.estimatedMinutes).toBeGreaterThan(0);
    }
    const m = albanianManifest();
    expect(m.tutorial).toEqual({ ref: 'tutorial/sq', estimatedMinutes: SQ_TUTORIAL.estimatedMinutes, skippable: true });
    expect(SQ_TUTORIAL.estimatedMinutes).toBe(SQ_TUTORIAL_STEPS.reduce((n, s) => n + s.estimatedMinutes, 0));
  });

  it('tells the learner what GoLearn stores and what it does not', () => {
    const body = SQ_TUTORIAL_STEPS.find((s) => s.id === 'concept-encounters')!.body;
    expect(body).toMatch(/does not store the sentence/);
    expect(body).toMatch(/export or delete/);
    const remote = SQ_TUTORIAL_STEPS.find((s) => s.id === 'concept-pronunciation')!.body;
    expect(remote).toMatch(/consent/);
  });
});

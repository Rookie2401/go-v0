/**
 * The ladder of help on a real issue of the real Albanian pack: identify → hint → targeted help → correction → alternatives, and a
 * model only when asked for by number. A remote assistant is a fake here (nothing is wired in the product); every claim about what it
 * is sent, and what is shown of what it returns, is tested against that fake.
 */
import { describe, expect, it } from 'vitest';
import { NO_MODEL_WITHOUT_REMOTE, createAssistance, hashText, sentenceScopeHash } from '../../packages/gotell/src/engine';
import type { Refusal } from '../../packages/gotell/src/engine';
import type { AssistanceLevel, AssistanceRequest, AssistanceStep, DraftAnalysis, RemoteAssistant } from '../../packages/gotell/src/types';
import { NOW, deepFreeze, realAnalyzer } from './helpers';

const analyzer = realAnalyzer();
const TEXT = 'Unë shkoj te libër. Unë lexoj librin. Unë dua të nuk shkoj. Unë shkoj me shoku. Ai asht këtu.';
const analysis: DraftAnalysis = analyzer.analyzeDraft('d1', TEXT);
const S = { definiteness: 0, clean: 1, negation: 2, uncertain: 3, dialect: 4 } as const;

const req = (sentenceIndex: number, level: AssistanceLevel, issueId?: string): AssistanceRequest => ({ draftId: 'd1', sentenceIndex, level, at: NOW, ...(issueId ? { issueId } : {}) });
const gate = (v: boolean) => ({ remoteAssistance: () => v });
const isRefusal = (x: unknown): x is Refusal => !!x && typeof x === 'object' && 'refused' in x;
const asStep = (x: AssistanceStep | Refusal): AssistanceStep => { if (isRefusal(x)) throw new Error(`refused: ${x.reason}`); return x; };

function fakeRemote(answer: unknown, over: { throws?: boolean } = {}): RemoteAssistant & { calls: Array<{ languageId: string; sentence: string; intendedMeaning?: string }> } {
  const calls: Array<{ languageId: string; sentence: string; intendedMeaning?: string }> = [];
  return {
    providerId: 'fake-remote@0', calls,
    async propose(input) { calls.push(input); if (over.throws) throw new Error('offline'); return answer as never; },
  };
}
const assist = (o: { remote?: RemoteAssistant; consent?: boolean; a?: typeof analyzer } = {}) => createAssistance({ analyzer: o.a ?? analyzer, ...(o.remote ? { remote: o.remote } : {}), consent: gate(o.consent ?? false), now: () => NOW });

describe('the six levels, in order, on a real definiteness error', () => {
  const issue = analysis.sentences[S.definiteness].issues[0];
  const a = assist();

  it('Level 1 identifies the place and the kind of problem and gives no fix', async () => {
    const s = asStep(await a.step(analysis, req(0, 1), []));
    expect(s.level).toBe(1);
    expect(s.content).toBe('Possible problem at “libër”: definiteness.');
    expect(s.content).not.toMatch(/libri/);
    expect(s.revealedUnitIds).toEqual([]);
    expect(s.source).toBe('adapter-checker');
    expect(s.at).toBe(NOW);
  });

  it('Level 2 gives the pack’s own description of the type of problem', async () => {
    const s = asStep(await a.step(analysis, req(0, 2), []));
    expect(s.content).toBe(issue.hint);
    expect(s.content).toMatch(/^Definiteness: Albanian adds “the”/);
    expect(s.source).toBe('pack-grammar');
    expect(s.revealedUnitIds).toEqual([]);
  });

  it('Level 3 names the checker’s replacement without applying it, and reveals its units', async () => {
    const s = asStep(await a.step(analysis, req(0, 3), []));
    expect(s.content).toMatch(/Look at “libër”\. The checker names “libri” for this spot/);
    expect(s.content).toMatch(/Your sentence has not been changed/);
    expect(s.content).not.toMatch(/Revised sentence/);
    expect(s.source).toBe('adapter-checker');
    expect(s.revealedUnitIds).toContain('lemma:sq:libër:NOUN');
  });

  it('Level 4 gives the revised sentence with its explanation, as a proposal', async () => {
    const s = asStep(await a.step(analysis, req(0, 4), []));
    expect(s.content).toMatch(/^Revised sentence: “Unë shkoj te libri\.”/);
    expect(s.content).toMatch(/Why: After "te" the noun takes its definite form/);
    expect(s.content).toMatch(/This is a proposal\. Your sentence has not been changed\./);
    expect(s.content).not.toMatch(/Check the meaning/); // no meaning change here, so no flag
    expect(s.source).toBe('adapter-checker');
  });

  it('Level 5 says plainly when no alternative is known', async () => {
    const s = asStep(await a.step(analysis, req(0, 5), []));
    expect(s.content).toMatch(/No alternative is known to this pack/);
    expect(s.source).toBe('none');
    expect(s.revealedUnitIds).toEqual(['lemma:sq:libër:NOUN']); // nothing new at this level; what levels 3 and 4 revealed carries over
  });

  it('Level 5 offers the variant and register notes the pack does know', async () => {
    const s = asStep(await a.step(analysis, req(S.dialect, 5), []));
    expect(s.content).toMatch(/^Alternatives:\n- “Ai asht këtu\.” — "asht" is a Gheg form/);
    expect(s.content).toMatch(/Nothing is wrong if you mean to write Gheg/);
  });

  it('Level 6 is refused without consent and without a provider, and says nothing was sent', async () => {
    // a sentence whose units no pack sentence contains
    const r = await a.step(analysis, req(S.uncertain, 6), []);
    expect(r).toEqual({ refused: true, reason: 'no model expression is available without a remote assistant; nothing was sent' });
    expect(NO_MODEL_WITHOUT_REMOTE).toBe('no model expression is available without a remote assistant; nothing was sent');
  });
});

describe('the ladder is monotone: asking for a level reveals the ones below, and units accumulate', () => {
  const a = assist();

  it('through(level 4) returns levels 1–4 in order', async () => {
    const r = await a.through(analysis, req(0, 4), []);
    if (isRefusal(r)) throw new Error(r.reason);
    expect(r.steps.map((s) => s.level)).toEqual([1, 2, 3, 4]);
  });

  it('revealedUnitIds only ever grow with the level, and level 4’s include level 3’s', async () => {
    const r = await a.through(analysis, req(0, 5), []);
    if (isRefusal(r)) throw new Error(r.reason);
    let seen: string[] = [];
    for (const s of r.steps) {
      expect(s.revealedUnitIds).toEqual(expect.arrayContaining(seen));
      expect(new Set(s.revealedUnitIds).size).toBe(s.revealedUnitIds.length);
      seen = s.revealedUnitIds;
    }
    expect(r.steps[3].revealedUnitIds).toEqual(expect.arrayContaining(r.steps[2].revealedUnitIds));
    expect(r.steps[3].revealedUnitIds.length).toBeGreaterThan(0);
  });

  it('step(level 4) alone carries what levels 1–3 revealed, even with nothing in prior', async () => {
    const l3 = asStep(await a.step(analysis, req(0, 3), []));
    const l4 = asStep(await a.step(analysis, req(0, 4), []));
    expect(l4.level).toBe(4);
    expect(l4.revealedUnitIds).toEqual(expect.arrayContaining(l3.revealedUnitIds));
  });

  it('steps already shown are not returned again, and their units carry forward', async () => {
    const first = await a.through(analysis, req(0, 3), []);
    if (isRefusal(first)) throw new Error(first.reason);
    const next = await a.through(analysis, req(0, 4), first.steps);
    if (isRefusal(next)) throw new Error(next.reason);
    expect(next.steps.map((s) => s.level)).toEqual([4]);
    expect(next.steps[0].revealedUnitIds).toEqual(expect.arrayContaining(first.steps[2].revealedUnitIds));
  });

  it('a later, lower request does not reveal more than it asks', async () => {
    const r = asStep(await a.step(analysis, req(0, 2), []));
    expect(r.revealedUnitIds).toEqual([]);
  });
});

describe('every step records the sentence it was shown for', () => {
  const a = assist();
  it('carries the 0-based sentence index and a hash of that sentence, on every level including a model', async () => {
    const r = await a.through(analysis, req(S.negation, 4), []);
    if (isRefusal(r)) throw new Error(r.reason);
    expect(r.steps.length).toBeGreaterThan(0);
    for (const s of r.steps) expect(s).toMatchObject({ sentenceIndex: S.negation, sentenceHash: sentenceScopeHash(analysis.sentences[S.negation].text) });
    const m = asStep(await a.step(analysis, req(S.clean, 6), []));
    expect(m).toMatchObject({ level: 6, sentenceIndex: S.clean });
  });
  it('the hash ignores case, spacing and end punctuation, so it identifies the same sentence after a light edit', () => {
    expect(sentenceScopeHash('Unë shkoj te libër.')).toBe(sentenceScopeHash('  unë  shkoj te LIBËR '));
    expect(sentenceScopeHash('Unë shkoj te libër.')).not.toBe(sentenceScopeHash('Unë shkoj te libri.'));
  });
});

describe('the step never changes the draft or the analysis', () => {
  it('works on a frozen analysis, leaves it equal to its snapshot, and the text hash still matches the text', async () => {
    const frozen = deepFreeze(analyzer.analyzeDraft('d1', TEXT));
    const snapshot = JSON.stringify(frozen);
    const a = assist({ consent: true, remote: fakeRemote([]) });
    for (const lvl of [1, 2, 3, 4, 5, 6] as const) await a.step(frozen, req(S.definiteness, lvl), []);
    await a.through(frozen, req(S.negation, 6), []);
    expect(JSON.stringify(frozen)).toBe(snapshot);
    expect(frozen.textHash).toBe(hashText(TEXT));
    expect(frozen.sentences.map((s) => s.text).join(' ')).toBe(TEXT);
  });
});

describe('a correction that changes meaning is shown flagged, never applied', () => {
  it('Level 4 on të nuk → të mos puts the meaning check next to the revised sentence', async () => {
    const s = asStep(await assist().step(analysis, req(S.negation, 4), []));
    expect(s.content).toMatch(/^Revised sentence: “Unë dua të mos shkoj\.”/);
    expect(s.content).toMatch(/Check the meaning: Changes the negation: "nuk" becomes "mos"/);
    expect(s.content).toMatch(/will not be applied automatically/);
    expect(analysis.sentences[S.negation].text).toBe('Unë dua të nuk shkoj.');
  });
});

describe('issues without a replacement, and sentences without an issue', () => {
  const a = assist();

  it('Level 3 falls back to the pack’s grammar text; Level 4 says there is no revised sentence', async () => {
    const l3 = asStep(await a.step(analysis, req(S.uncertain, 3), []));
    expect(l3.content).toMatch(/^Look at “me shoku”\. Case\. A noun changes its ending/);
    expect(l3.source).toBe('pack-grammar');
    const l4 = asStep(await a.step(analysis, req(S.uncertain, 4), []));
    expect(l4.content).toMatch(/has no replacement to offer, so there is no revised sentence/);
    expect(l4.source).toBe('none');
  });

  it('Level 1 on an uncertain analysis says it may be a false alarm', async () => {
    const s = asStep(await a.step(analysis, req(S.uncertain, 1), []));
    expect(s.content).toBe('Possible problem at “me shoku”: case (the analysis is uncertain, so this may be a false alarm).');
  });

  it('Levels 1–5 on a sentence the checker found nothing in are refused, without calling that correct', async () => {
    for (const lvl of [1, 2, 3, 4, 5] as const) {
      const r = await a.step(analysis, req(S.clean, lvl), []);
      expect(isRefusal(r), `level ${lvl}`).toBe(true);
      expect((r as Refusal).reason).toMatch(/found no problem[\s\S]*does not show the sentence is correct/);
    }
  });

  it('refuses a request that does not belong to the analysis', async () => {
    expect(await a.step(analysis, { ...req(0, 1), draftId: 'other' }, [])).toMatchObject({ refused: true, reason: expect.stringMatching(/different draft/) });
    expect(await a.step(analysis, req(99, 1), [])).toMatchObject({ refused: true, reason: expect.stringMatching(/no sentence 99/) });
    expect(await a.step(analysis, req(0, 1, 'd1:s0:i9'), [])).toMatchObject({ refused: true, reason: expect.stringMatching(/no issue/) });
    expect(await a.step(analysis, { ...req(0, 1), level: 7 as AssistanceLevel }, [])).toMatchObject({ refused: true, reason: expect.stringMatching(/six levels/) });
  });

  it('with several issues, the request names the one it means', async () => {
    const two = analyzer.analyzeDraft('d2', 'Ai asht këtu dhe Ana shkon në shtëpia.');
    const [first, second] = two.sentences[0].issues;
    const x = asStep(await assist().step(two, { draftId: 'd2', sentenceIndex: 0, level: 1, at: NOW, issueId: second.issueId }, []));
    expect(x.content).toMatch(/“shtëpia”: case/);
    const y = asStep(await assist().step(two, { draftId: 'd2', sentenceIndex: 0, level: 1, at: NOW }, [])); // default: the first
    expect(y.content).toMatch(new RegExp(`“${first.surface}”`));
  });
});

describe('Level 6: only when asked for, and only from honest sources', () => {
  it('is never produced by a lower level, whatever is available', async () => {
    const remote = fakeRemote([{ suggested: 'Unë shkoj te libri.', explanation: 'x', confidence: 0.9 }]);
    const a = assist({ consent: true, remote });
    for (const lvl of [1, 2, 3, 4, 5] as const) {
      const r = await a.through(analysis, req(S.definiteness, lvl), []);
      if (isRefusal(r)) throw new Error(r.reason);
      expect(r.steps.every((s) => s.level !== 6)).toBe(true);
    }
    expect(remote.calls).toHaveLength(0);
  });

  it('comes first from the learner’s own earlier independent sentence, then names it as theirs', async () => {
    const remote = fakeRemote([]);
    const s = asStep(await assist({ consent: true, remote }).step(analysis, req(S.clean, 6), [], { ownSentence: 'Unë shkoj te mësuesi.' }));
    expect(s).toMatchObject({ level: 6, source: 'learner-own-sentence', review: 'learner-own', revealedUnitIds: [] });
    expect(s.content.split('\n')[0]).toBe('Unë shkoj te mësuesi.');
    expect(remote.calls).toHaveLength(0);
  });

  it('the own sentence can also arrive in prior, as a step already shown', async () => {
    const prior: AssistanceStep[] = [{ level: 6, content: 'Unë shkoj te mësuesi.\n(Your own earlier sentence.)', revealedUnitIds: [], source: 'learner-own-sentence', review: 'learner-own', at: NOW }];
    const s = asStep(await assist().step(analysis, req(S.definiteness, 6), prior));
    expect(s.source).toBe('learner-own-sentence');
  });

  it('else comes from a sentence of the pack that contains the units, labelled as unreviewed', async () => {
    const remote = fakeRemote([{ suggested: 'Unë shkoj te libri.', explanation: 'x', confidence: 0.9 }]);
    const r = await assist({ consent: true, remote }).through(analysis, req(S.definiteness, 6), []);
    if (isRefusal(r)) throw new Error(r.reason);
    expect(r.steps.map((s) => s.level)).toEqual([1, 2, 3, 4, 5, 6]); // asking for the model also records the levels below it
    const s = r.steps[5];
    expect(s.source).toBe('pack-sentence');
    expect(s.review).toBe('unreviewed'); // the Albanian pack is machine-drafted
    expect(s.content.split('\n')[0]).toBe('Fëmijët lexojnë librin.');
    expect(s.content).toMatch(/no native speaker has checked it/);
    expect(s.revealedUnitIds).toEqual(expect.arrayContaining(['lemma:sq:lexoj:VERB']));
    expect(remote.calls).toHaveLength(0); // consent was given, and the remote assistant was still not asked: the pack answered
  });

  it('a pack sentence is only ever one the checker finds clean', async () => {
    const a = realAnalyzer({ packSentences: ['Unë lexon librin.', 'Unë lexoj librin e mirë.'] });
    const found = a.packSentenceFor(['lemma:sq:libër:NOUN'], 'Unë shkoj te libër.');
    expect(found?.text).not.toBe('Unë lexon librin.');
    expect(a.detect(found!.text)).toEqual([]);
  });

  it('refuses when the learner has not consented, even if a provider exists, and sends nothing', async () => {
    const remote = fakeRemote([{ suggested: 'Unë shkoj me shokun.', explanation: 'x', confidence: 0.9 }]);
    const r = await assist({ consent: false, remote }).step(analysis, req(S.uncertain, 6), []);
    expect(r).toEqual({ refused: true, reason: NO_MODEL_WITHOUT_REMOTE });
    expect(remote.calls).toHaveLength(0);
  });

  it('refuses when the learner has consented but nothing is wired', async () => {
    expect(await assist({ consent: true }).step(analysis, req(S.uncertain, 6), [])).toEqual({ refused: true, reason: NO_MODEL_WITHOUT_REMOTE });
  });

  it('a refusal reveals nothing, not even the levels below', async () => {
    const r = await assist().through(analysis, req(S.uncertain, 6), []);
    expect(r).toEqual({ refused: true, reason: NO_MODEL_WITHOUT_REMOTE });
  });

  it('with consent and a provider, a proposal that passes the checks is shown as unreviewed remote text', async () => {
    const remote = fakeRemote([{ suggested: 'Unë shkoj me shokun.', explanation: 'The friend is the object of me, so it takes the -n ending.', confidence: 0.8 }]);
    const s = asStep(await assist({ consent: true, remote }).step(analysis, req(S.uncertain, 6), [], { intendedMeaning: 'I go with the friend' }));
    expect(remote.calls).toEqual([{ languageId: 'sq', sentence: 'Unë shkoj me shoku.', intendedMeaning: 'I go with the friend' }]);
    expect(s).toMatchObject({ level: 6, source: 'remote-assistant', review: 'unreviewed' });
    expect(s.content.split('\n')[0]).toBe('Unë shkoj me shokun.');
    expect(s.content).toMatch(/Proposed by a remote assistant \(fake-remote@0\); not reviewed by anyone/);
    expect(s.revealedUnitIds.every((u) => !analysis.sentences[S.uncertain].unitIds.includes(u))).toBe(true); // only what the learner did not write
  });

  it('rejects a proposal that adds content the learner did not write, and shows nothing of it', async () => {
    const remote = fakeRemote([{ suggested: 'Unë shkoj me shokun e mirë në shkollë.', explanation: 'more natural', confidence: 0.95 }]);
    const r = await assist({ consent: true, remote }).step(analysis, req(S.uncertain, 6), []);
    expect(isRefusal(r)).toBe(true);
    const reason = (r as Refusal).reason;
    expect(reason).toMatch(/did not pass the checks/);
    expect(reason).toMatch(/adds the content word/);
  });

  it('rejects a proposal the checker still flags', async () => {
    const remote = fakeRemote([{ suggested: 'Unë shkoj te libër.', explanation: 'x', confidence: 0.9 }]);
    const r = await assist({ consent: true, remote }).step(analysis, req(S.uncertain, 6), []);
    expect(isRefusal(r)).toBe(true);
    expect((r as Refusal).reason).toMatch(/definiteness/);
  });

  it('rejects an unchanged sentence, and malformed output of every kind', async () => {
    for (const answer of [
      [{ suggested: 'Unë shkoj me shoku.', explanation: 'same', confidence: 0.9 }],
      [{ suggested: '', explanation: '', confidence: 0.9 }],
      [{ suggested: 'Unë shkoj me shokun.', explanation: 'x', confidence: 7 }],
      [{ suggested: 'Unë shkoj me shokun.\nUnë shkoj me shokët.', explanation: 'x', confidence: 0.5 }],
      [{ suggested: 42, explanation: 'x', confidence: 0.5 }],
      [null], [], 'not a list', { suggested: 'Unë shkoj me shokun.' },
    ]) {
      const r = await assist({ consent: true, remote: fakeRemote(answer) }).step(analysis, req(S.uncertain, 6), []);
      expect(isRefusal(r), JSON.stringify(answer)).toBe(true);
    }
  });

  it('uses the best valid proposal when there are several', async () => {
    const remote = fakeRemote([
      { suggested: 'Unë shkoj me shokët.', explanation: 'plural', confidence: 0.4 },
      { suggested: 'Unë shkoj me shokun e mirë në shkollë.', explanation: 'adds', confidence: 0.99 },
      { suggested: 'Unë shkoj me shokun.', explanation: 'singular', confidence: 0.7 },
    ]);
    const s = asStep(await assist({ consent: true, remote }).step(analysis, req(S.uncertain, 6), []));
    expect(s.content.split('\n')[0]).toBe('Unë shkoj me shokun.');
  });

  it('flags a remote proposal that changes meaning, instead of hiding it', async () => {
    const remote = fakeRemote([{ suggested: 'Unë nuk shkoj me shokun.', explanation: 'x', confidence: 0.9 }]);
    const s = asStep(await assist({ consent: true, remote }).step(analysis, req(S.uncertain, 6), []));
    expect(s.content).toMatch(/Check the meaning: Adds a negation "nuk"/);
  });

  it('a provider that fails, or never answers, is a refusal that shows nothing', async () => {
    const down = await assist({ consent: true, remote: fakeRemote([], { throws: true }) }).step(analysis, req(S.uncertain, 6), []);
    expect(down).toMatchObject({ refused: true, reason: expect.stringMatching(/could not be used \(offline\)/) });
    const slow: RemoteAssistant = { providerId: 'slow', propose: () => new Promise(() => undefined) };
    const timed = await createAssistance({ analyzer, remote: slow, consent: gate(true), now: () => NOW, remoteTimeoutMs: 20 }).step(analysis, req(S.uncertain, 6), []);
    expect(timed).toMatchObject({ refused: true, reason: expect.stringMatching(/did not answer in time/) });
  });

  it('is available without an issue: a clean sentence can still be shown a model from the pack', async () => {
    const r = await assist().through(analysis, req(S.clean, 6), []);
    if (isRefusal(r)) throw new Error(r.reason);
    expect(r.steps.map((s) => s.level)).toEqual([6]);
    expect(r.steps[0].source).toBe('pack-sentence');
    expect(r.steps[0].content.split('\n')[0]).not.toBe(analysis.sentences[S.clean].text);
  });
});

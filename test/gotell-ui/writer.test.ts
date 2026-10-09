// @vitest-environment jsdom
/** The writer: autosave, Save, Analyse, the ladder, accept / reject, versions, export, delete, keyboard. */
import { afterEach, describe, expect, it } from 'vitest';
import { queued } from '../gopractice/helpers';
import { draftIdFromHash, flush, makeTellRig, press, resetTellRig, typeInto, until, type TellRig } from './rig';

afterEach(() => resetTellRig());

const click = (el: Element | null | undefined): void => { if (!el) throw new Error('nothing to click'); (el as HTMLElement).click(); };
const text = (rig: TellRig): HTMLTextAreaElement => rig.q<HTMLTextAreaElement>('#writer-text');

async function startDraft(rig: TellRig, body = '', mode = 'free'): Promise<string> {
  await rig.open('tell', '#tell-new-draft');
  click(rig.q(`#tell-mode-${mode}`));
  click(rig.q('#tell-new-draft'));
  await until(() => !!rig.root.querySelector('#writer-text'), 'the writer');
  if (body) typeInto(text(rig), body);
  return draftIdFromHash();
}

/** Types, saves and analyses, so the text is a saved version and the check is on screen. */
async function analysed(rig: TellRig, body: string): Promise<string> {
  const id = await startDraft(rig, body);
  click(rig.q('#writer-analyse'));
  await until(() => !!rig.root.querySelector('#writer-analysis-summary'), 'the analysis');
  return id;
}

const ladderTo = async (rig: TellRig, issueId: string, level: number): Promise<void> => {
  for (let l = 1; l <= level; l++) {
    const btn = rig.q<HTMLButtonElement>(`[data-issue-card="${issueId}"] button[data-level="${l}"]`);
    expect(btn.disabled, `level ${l} should be open`).toBe(false);
    click(btn);
    await until(() => rig.qa(`[data-issue-card="${issueId}"] .tell-step`).length >= l || !!rig.root.querySelector(`[data-issue-card="${issueId}"] [data-model-confirm]`), `level ${l}`);
  }
};

describe('autosave and Save', () => {
  it('autosaves to the device only, then Save makes an independent version, pushes the document and submits evidence without text', async () => {
    const rig = await makeTellRig();
    const id = await startDraft(rig);
    rig.service.calls.length = 0;
    typeInto(text(rig), 'Unë jam mirë. Ti si je?');
    expect(rig.timers.pending()).toBe(1); // armed, not yet fired
    expect(rig.engine.localSaves).toBe(1); // only the creation
    rig.timers.fire();
    await until(() => rig.engine.localSaves === 2, 'the autosave');
    expect(rig.engine.localDocs.get(id)!.record.text).toBe('Unë jam mirë. Ti si je?');
    expect(rig.engine.remoteSaves).toBe(0);
    expect(rig.engine.remoteDocs.size).toBe(0);
    expect(rig.service.docs.size).toBe(0);
    expect(rig.service.calls).toEqual([]);
    expect(rig.writing).toEqual([]);
    expect(rig.q('#writer-status').textContent).toContain('Kept on this device');

    click(rig.q('#writer-save'));
    await until(() => rig.engine.remoteSaves === 1, 'the save');
    await until(() => rig.writing.length === 1, 'the evidence');
    const stored = rig.engine.remoteDocs.get(id)!.record;
    expect(stored.versions).toHaveLength(1);
    expect(stored.versions[0].sentences.map((s) => s.authorship)).toEqual(['independent', 'independent']);
    expect(rig.writing[0].kind).toBe('ProductionRecorded');
    expect(rig.writing[0].payload).toMatchObject({ assisted: false, authorship: 'independent' });
    expect(JSON.stringify(rig.writing[0])).not.toContain('Unë jam');
    expect(rig.q('#writer-save-state').textContent).toContain('Saved to your account');
    expect(rig.q('#writer-status').textContent).toContain('Saved as version 1');
    expect(rig.q('#writer-evidence-summary').textContent).toContain('recorded as independent');
    expect(rig.q('#writer-evidence').textContent).toContain('Your text is never part of this record');
    // sent directly, so nothing is waiting in the queue
    expect(await queued(rig)).toEqual([]);
  });

  it('falls back to the shell\'s offline queue when the service cannot take the observation, still without text', async () => {
    const rig = await makeTellRig();
    await startDraft(rig, 'Unë jam mirë.');
    rig.writingDown.value = true;
    click(rig.q('#writer-save'));
    await until(() => (rig.q('#writer-status').textContent ?? '').includes('waiting to be sent'), 'the queue');
    expect(rig.writing).toEqual([]);
    const q = await queued(rig);
    expect(q).toHaveLength(1);
    expect(JSON.stringify(q)).not.toContain('Unë jam');
  });

  it('keeps the draft on the device when the account is out of reach and says so', async () => {
    const rig = await makeTellRig();
    const id = await startDraft(rig, 'Pa internet.');
    rig.engine.offline = true;
    click(rig.q('#writer-save'));
    await until(() => (rig.q('#writer-save-state').textContent ?? '').includes('On this device only'), 'the device-only state');
    expect(rig.engine.localDocs.get(id)!.record.versions).toHaveLength(1);
    expect(rig.engine.remoteDocs.size).toBe(0);
    expect(rig.q('#writer-status').textContent).toContain('Kept on this device');
  });

  it('refuses to save an empty draft and does not make a version of unchanged text twice', async () => {
    const rig = await makeTellRig();
    const id = await startDraft(rig);
    click(rig.q('#writer-save'));
    await until(() => (rig.q('#writer-status').textContent ?? '').includes('Write something first'), 'the refusal');
    typeInto(text(rig), 'Një fjali.');
    click(rig.q('#writer-save'));
    await until(() => rig.engine.remoteSaves === 1, 'the first save');
    click(rig.q('#writer-save'));
    await until(() => rig.engine.remoteSaves === 2, 'the second save');
    expect(rig.engine.remoteDocs.get(id)!.record.versions).toHaveLength(1);
    expect(rig.writing).toHaveLength(1);
    expect(rig.q('#writer-status').textContent).toContain('no new version was made');
  });

  it('shows the other version when another device changed the draft, and points to the copy of the learner\'s own text', async () => {
    const rig = await makeTellRig();
    const id = await startDraft(rig, 'Teksti im.');
    const mine = rig.engine.localDocs.get(id)!.record;
    (rig.engine as unknown as { tweakRemote: Map<string, typeof mine> }).tweakRemote.set(id, { ...mine, text: 'Teksti i tyre.', title: '' });
    click(rig.q('#writer-save'));
    await until(() => !rig.q('#writer-conflict').hidden, 'the conflict notice');
    expect(text(rig).value).toBe('Teksti i tyre.');
    expect(rig.q('#writer-conflict-copy').getAttribute('href')).toBe(`#/tell/write/${id}-copy`);
    expect(rig.q('#writer-conflict').textContent).toContain('Another device changed this draft');
  });

  it('autosaves when the learner leaves the screen', async () => {
    const rig = await makeTellRig();
    const id = await startDraft(rig, 'Para se të largohem.');
    expect(rig.engine.localDocs.get(id)!.record.text).toBe('');
    await rig.open('tell', '#tell-modes');
    await until(() => rig.engine.localDocs.get(id)!.record.text === 'Para se të largohem.', 'the flush on leaving');
  });
});

describe('Analyse', () => {
  it('marks the issue with its class label, shows the checker coverage and leaves the text alone', async () => {
    const rig = await makeTellRig();
    const body = 'Unë kam gabim. Kjo është mirë.';
    await analysed(rig, body);
    const mark = rig.q('mark.issue-mark');
    expect(mark.textContent).toContain('gabim');
    expect(mark.getAttribute('data-class')).toBe('grammatically-wrong');
    expect(mark.textContent).toContain('Probably wrong');
    expect(rig.qa('[data-sentence-block]')).toHaveLength(2);
    expect(rig.q('[data-sentence-block="1"]').textContent).toContain('Nothing found here');
    expect(rig.q('#writer-coverage').textContent).toContain('cannot see word choice');
    expect(rig.q('#writer-analysis-summary').textContent).toContain('1 place(s) to look at');
    expect(rig.q('#writer-analysis-summary').textContent).toContain('has not been changed');
    expect(text(rig).value).toBe(body);
    expect(rig.q('#writer-analysis').getAttribute('aria-live')).toBe('polite');
    // before any help, no hint and no correction is on screen
    expect(rig.root.querySelector('.tell-step')).toBeNull();
    expect(rig.root.querySelector('.tell-correction')).toBeNull();
  });

  it('says nothing found is not the same as correct', async () => {
    const rig = await makeTellRig();
    await analysed(rig, 'Kjo është mirë.');
    expect(rig.q('#writer-analysis-summary').textContent).toContain('the checker saw nothing, not that the text is correct');
  });

  it('marks the check out of date when the text changes afterwards', async () => {
    const rig = await makeTellRig();
    await analysed(rig, 'Unë kam gabim.');
    typeInto(text(rig), 'Unë kam gabim. Edhe një.');
    await until(() => !!rig.root.querySelector('#writer-stale'), 'the stale notice');
    expect(rig.q('#writer-stale').textContent).toContain('Analyse again');
    // help is not offered on an out-of-date check
    expect(rig.qa<HTMLButtonElement>('button[data-level]').every((b) => b.disabled)).toBe(true);
  });

  it('says honestly when no checker exists for the language, and still lets the learner write', async () => {
    const rig = await makeTellRig({ engine: { analysisAvailable: false } });
    await startDraft(rig, 'Çdo gjë.');
    click(rig.q('#writer-analyse'));
    await until(() => !!rig.root.querySelector('#writer-analysis-error'), 'the message');
    expect(rig.q('#writer-analysis-error').textContent).toContain('No checker is installed');
    click(rig.q('#writer-save'));
    await until(() => rig.engine.remoteSaves === 1, 'the save still works');
  });
});

describe('the assistance ladder', () => {
  it('goes in order, one step at a time, and shows the correction only at step 4', async () => {
    const rig = await makeTellRig();
    await analysed(rig, 'Unë kam gabim.');
    const card = '[data-issue-card="i-0-g"]';
    const state = (): string => rig.qa<HTMLButtonElement>(`${card} button[data-level]`).map((b) => (b.disabled ? '-' : 'o')).join('');
    expect(state()).toBe('o-----');
    click(rig.q(`${card} button[data-level="1"]`));
    await until(() => rig.qa(`${card} .tell-step`).length === 1, 'step 1');
    expect(rig.q(`${card} .tell-step`).textContent).toContain('Possible problem at “gabim”');
    expect(state()).toBe('-o----');
    click(rig.q(`${card} button[data-level="3"]`)); // a disabled button does nothing
    await flush(3);
    expect(rig.engine.calls.filter((c) => c.startsWith('assist:'))).toEqual(['assist:1']);
    click(rig.q(`${card} button[data-level="2"]`));
    await until(() => rig.qa(`${card} .tell-step`).length === 2, 'step 2');
    click(rig.q(`${card} button[data-level="3"]`));
    await until(() => rig.qa(`${card} .tell-step`).length === 3, 'step 3');
    expect(rig.q(`${card} .tell-step[data-level="3"]`).textContent).toContain('shows 1 word(s) you did not have to produce');
    expect(rig.root.querySelector('.tell-correction')).toBeNull();
    expect(rig.root.textContent).not.toContain('Unë kam saktë');
    click(rig.q(`${card} button[data-level="4"]`));
    await until(() => !!rig.root.querySelector('.tell-correction'), 'the correction');
    expect(rig.q('.tell-correction').textContent).toContain('Unë kam saktë.');
    expect(rig.engine.calls.filter((c) => c.startsWith('assist:'))).toEqual(['assist:1', 'assist:2', 'assist:3', 'assist:4']);
    expect(text(rig).value).toBe('Unë kam gabim.'); // showing never changes the text
  });

  it('asks for an explicit second click before a model, and shows its source and review state', async () => {
    const rig = await makeTellRig();
    await analysed(rig, 'Unë kam gabim.');
    const card = '[data-issue-card="i-0-g"]';
    await ladderTo(rig, 'i-0-g', 5);
    click(rig.q(`${card} button[data-level="6"]`));
    await until(() => !!rig.root.querySelector(`${card} [data-model-confirm]`), 'the confirmation');
    expect(rig.engine.calls).not.toContain('assist:6');
    expect(rig.root.querySelector(`${card} .tell-step[data-level="6"]`)).toBeNull();
    expect(rig.q(`${card} [data-model-confirm]`).textContent).toContain('not yours');
    click(rig.q(`${card} [data-model-no]`));
    expect(rig.root.querySelector(`${card} [data-model-confirm]`)).toBeNull();
    expect(rig.engine.calls).not.toContain('assist:6');
    click(rig.q(`${card} button[data-level="6"]`));
    await until(() => !!rig.root.querySelector(`${card} [data-model-yes]`), 'the confirmation again');
    click(rig.q(`${card} [data-model-yes]`));
    await until(() => !!rig.root.querySelector(`${card} .tell-step[data-level="6"]`), 'the model');
    const step = rig.q(`${card} .tell-step[data-level="6"]`);
    expect(step.getAttribute('data-source')).toBe('pack-sentence');
    expect(step.getAttribute('data-review')).toBe('unreviewed');
    expect(step.textContent).toContain('a sentence from the language pack');
    expect(step.textContent).toContain('not reviewed by a person');
    expect(rig.engine.calls.filter((c) => c === 'assist:6')).toHaveLength(1);
  });

  it('shows a refused model as refused, with the reason, and nothing as a model', async () => {
    const rig = await makeTellRig({ engine: { refuseModel: 'no model expression is available without a remote assistant; nothing was sent' } });
    await analysed(rig, 'Unë kam gabim.');
    const card = '[data-issue-card="i-0-g"]';
    await ladderTo(rig, 'i-0-g', 5);
    click(rig.q(`${card} button[data-level="6"]`));
    await until(() => !!rig.root.querySelector(`${card} [data-model-yes]`), 'the confirmation');
    click(rig.q(`${card} [data-model-yes]`));
    await until(() => !!rig.root.querySelector(`${card} .tell-step.refused`), 'the refusal');
    const refused = rig.q(`${card} .tell-step.refused`);
    expect(refused.getAttribute('data-refused')).toBe('6');
    expect(refused.textContent).toContain('was not given');
    expect(refused.textContent).toContain('nothing was sent');
    expect(rig.root.querySelector(`${card} .tell-step[data-level="6"]`)).toBeNull();
    expect(rig.q('#writer-status').textContent).toContain('Step 6 was not given');
  });
});

describe('per-sentence authorship at Save', () => {
  it('a hint on sentence 0 does not make the rewritten sentence 1 "after hint"; each step records its sentence', async () => {
    const rig = await makeTellRig();
    const id = await analysed(rig, 'Unë kam gabim. Unë jam mirë.');
    await ladderTo(rig, 'i-0-g', 2);
    // the learner fixes sentence 0 and rewrites sentence 1 entirely
    typeInto(text(rig), 'Unë kam saktë. Unë jam shumë mirë sot.');
    expect(rig.engine.localDocs.get(id)!.record.assistance.every((s) => s.sentenceIndex === 0 && typeof s.sentenceHash === 'string')).toBe(true);
    click(rig.q('#writer-save'));
    await until(() => rig.engine.remoteSaves === 1, 'the save');
    const saved = rig.engine.remoteDocs.get(id)!.record;
    expect(saved.versions[0].sentences.map((s) => s.authorship)).toEqual(['after-hint', 'independent']);
    expect(saved.versions[0].sentences.map((s) => s.assistance)).toEqual([[1, 2], []]);
  });

  it('a hint on sentence 1 leaves an edited sentence 0 independent', async () => {
    const rig = await makeTellRig();
    const id = await analysed(rig, 'Unë jam mirë. Unë kam gabim.');
    await ladderTo(rig, 'i-1-g', 1);
    typeInto(text(rig), 'Unë jam shumë mirë. Unë kam saktë.');
    click(rig.q('#writer-save'));
    await until(() => rig.engine.remoteSaves === 1, 'the save');
    expect(rig.engine.remoteDocs.get(id)!.record.versions[0].sentences.map((s) => s.authorship)).toEqual(['independent', 'after-hint']);
  });
});

describe('accept and reject', () => {
  it('says, before the learner can click Accept, that an accepted correction counts as copied and earns no production credit', async () => {
    const rig = await makeTellRig();
    await analysed(rig, 'Unë kam gabim. Kjo është mirë.');
    await ladderTo(rig, 'i-0-g', 3);
    expect(rig.root.querySelector('[data-accept-notice]')).toBeNull(); // no correction yet, no notice yet
    click(rig.q('[data-issue-card="i-0-g"] button[data-level="4"]'));
    await until(() => !!rig.root.querySelector('.tell-correction'), 'the correction');
    const notice = rig.q('[data-accept-notice="c-0-g"]');
    expect(notice.textContent).toMatch(/counts as copied from the model/);
    expect(notice.textContent).toMatch(/no production credit/);
    expect(notice.textContent).toMatch(/Rewrite the sentence yourself/);
    // it comes BEFORE the Accept button in the page
    const accept = rig.q('[data-accept="c-0-g"]');
    expect(notice.compareDocumentPosition(accept) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // and the text has not been touched by showing it
    expect(text(rig).value).toBe('Unë kam gabim. Kjo është mirë.');
  });

  it('accept replaces exactly that sentence, keeps the earlier text in the versions and records CorrectionAccepted', async () => {
    const rig = await makeTellRig();
    const body = 'Unë kam gabim. Kjo është mirë.';
    const id = await analysed(rig, body);
    await ladderTo(rig, 'i-0-g', 4);
    click(rig.q('[data-accept]'));
    await until(() => text(rig).value !== body, 'the replacement');
    expect(text(rig).value).toBe('Unë kam saktë. Kjo është mirë.');
    await until(() => rig.engine.localDocs.get(id)!.record.versions.length === 1, 'the snapshot');
    const v = rig.engine.localDocs.get(id)!.record.versions[0];
    expect(v.text).toBe(body);
    expect(v.note).toBe('Before accepting a correction');
    // the replaced sentence's marker is gone, the other sentence is untouched
    await until(() => !rig.root.querySelector('mark.issue-mark'), 'no marker left');
    expect(rig.q('[data-sentence-block="0"]').textContent).toContain('Replaced with your accepted correction');
    expect(rig.q('[data-sentence-block="1"]').textContent).toContain('Kjo është mirë.');
    const events = (await rig.app.ctx.events('sq')).filter((e) => e.kind === 'CorrectionAccepted');
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ correctionId: 'c-0-g' });
    expect(JSON.stringify(events[0])).not.toContain('gabim');
    expect(rig.q('#writer-status').textContent).toContain('Sentence 1 replaced');
    expect(rig.q('#writer-status').textContent).toContain('earlier wording is in your versions');
    // Save afterwards: the saved text is the learner's accepted text and its authorship is not "independent"
    click(rig.q('#writer-save'));
    await until(() => rig.engine.remoteSaves === 1, 'the save');
    const saved = rig.engine.remoteDocs.get(id)!.record;
    expect(saved.versions).toHaveLength(2);
    expect(saved.versions[1].sentences[0].authorship).toBe('revised-after-feedback');
  });

  it('reject records CorrectionRejected, keeps the issue visible but muted, and changes nothing in the text', async () => {
    const rig = await makeTellRig();
    const body = 'Unë kam gabim.';
    await analysed(rig, body);
    await ladderTo(rig, 'i-0-g', 4);
    click(rig.q('[data-reject]'));
    await until(() => rig.q('mark.issue-mark').getAttribute('data-state') === 'rejected', 'the muted marker');
    expect(rig.q('[data-issue-card="i-0-g"]').getAttribute('data-state')).toBe('rejected');
    expect(rig.q('[data-issue-card="i-0-g"]').textContent).toContain('rejected, kept muted');
    expect(rig.root.querySelector('[data-accept]')).toBeNull();
    expect(text(rig).value).toBe(body);
    const events = (await rig.app.ctx.events('sq')).filter((e) => e.kind === 'CorrectionRejected');
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ correctionId: 'c-0-g' });
    expect((await rig.app.ctx.events('sq')).some((e) => e.kind === 'CorrectionAccepted')).toBe(false);
  });

  it('a correction that changes the meaning is never accepted in one click', async () => {
    const rig = await makeTellRig();
    const body = 'Ai nuk vjen.';
    await analysed(rig, body);
    await ladderTo(rig, 'i-0-n', 4);
    expect(rig.q('[data-meaning-warning]').textContent).toContain('This changes the meaning: the sentence would say the opposite');
    click(rig.q('[data-accept]'));
    await until(() => !!rig.root.querySelector('[data-meaning-confirm]'), 'the confirmation');
    expect(rig.q('[data-meaning-confirm]').textContent).toContain('This changes the meaning: the sentence would say the opposite. Accept anyway?');
    expect(text(rig).value).toBe(body);
    expect((await rig.app.ctx.events('sq')).some((e) => e.kind === 'CorrectionAccepted')).toBe(false);
    click(rig.q('[data-accept-cancel]'));
    expect(rig.root.querySelector('[data-meaning-confirm]')).toBeNull();
    expect(text(rig).value).toBe(body);
    click(rig.q('[data-accept]'));
    await until(() => !!rig.root.querySelector('[data-accept-anyway]'), 'the confirmation again');
    click(rig.q('[data-accept-anyway]'));
    await until(() => text(rig).value === 'Ai vjen.', 'the replacement after the second, explicit click');
    expect((await rig.app.ctx.events('sq')).filter((e) => e.kind === 'CorrectionAccepted')).toHaveLength(1);
  });

  it('cannot accept before the corrected sentence has been shown', async () => {
    const rig = await makeTellRig();
    await analysed(rig, 'Unë kam gabim.');
    expect(rig.root.querySelector('[data-accept]')).toBeNull();
    await ladderTo(rig, 'i-0-g', 3);
    expect(rig.root.querySelector('[data-accept]')).toBeNull();
  });
});

describe('versions, export, delete, keyboard', () => {
  it('lists versions, diffs one against the current text and restores it as a new version', async () => {
    const rig = await makeTellRig();
    const id = await startDraft(rig, 'Njëra. Dytë.');
    click(rig.q('#writer-save'));
    await until(() => rig.engine.remoteSaves === 1, 'the first save');
    typeInto(text(rig), 'Njëra. Tretë.');
    click(rig.q('#writer-versions-btn'));
    await until(() => !rig.q('#writer-versions').hidden, 'the panel');
    expect(rig.qa('#writer-versions li[data-version]')).toHaveLength(1);
    expect(rig.q('#writer-versions li').textContent).toContain('2 independent');
    click(rig.q('[data-diff="v1"]'));
    await until(() => !!rig.root.querySelector('[data-diff-for="v1"]'), 'the diff');
    const kinds = rig.qa('[data-diff-for="v1"] [data-kind]').map((l) => `${l.getAttribute('data-kind')}:${(l.textContent ?? '').replace(/^(added|removed|unchanged): /, '').trim()}`);
    expect(kinds).toContain('removed:- Dytë.');
    expect(kinds).toContain('added:+ Tretë.');
    expect(kinds).toContain('same:Njëra.');
    click(rig.q('[data-restore="v1"]'));
    await until(() => text(rig).value === 'Njëra. Dytë.', 'the restored text');
    const record = rig.engine.localDocs.get(id)!.record;
    // the unsaved text was kept first, then the restore was added: nothing was overwritten
    expect(record.versions.map((v) => v.text)).toEqual(['Njëra. Dytë.', 'Njëra. Tretë.', 'Njëra. Dytë.']);
    expect(record.versions[1].note).toBe('Before restoring an older version');
    expect(record.versions[2].note).toBe('Restored from v1');
    await until(() => rig.qa('#writer-versions li[data-version]').length === 3, 'three versions listed');
  });

  it('exports the draft in each format through a download', async () => {
    const rig = await makeTellRig();
    await startDraft(rig, 'Për ty.');
    click(rig.q('#writer-export-btn'));
    await until(() => !rig.q('#writer-export').hidden, 'the export panel');
    for (const f of ['json', 'text', 'markdown']) click(rig.q(`[data-export-as="${f}"]`));
    expect(rig.downloads.map((d) => d.filename)).toEqual(['draft.json', 'draft.txt', 'draft.md']);
    expect(rig.downloads[1].content).toBe('Për ty.');
  });

  it('deletes only after a confirmation, then returns to the drafts', async () => {
    const rig = await makeTellRig();
    const id = await startDraft(rig, 'Do ta fshij.');
    click(rig.q('#writer-delete'));
    await until(() => !rig.q('#writer-delete-panel').hidden, 'the confirmation');
    expect(rig.q('#writer-delete-panel').textContent).toContain('cannot be undone');
    click(rig.q('#writer-delete-cancel'));
    expect(rig.q('#writer-delete-panel').hidden).toBe(true);
    expect(rig.engine.calls.some((c) => c.startsWith('delete:'))).toBe(false);
    click(rig.q('#writer-delete'));
    click(rig.q('#writer-delete-confirm'));
    await until(() => rig.app.current() === 'tell', 'the drafts page');
    expect(rig.engine.calls).toContain(`delete:${id}`);
    expect(rig.engine.localDocs.has(id)).toBe(false);
    await until(() => (rig.root.textContent ?? '').includes('No drafts yet'), 'the empty list');
  });

  it('Ctrl+S saves, Esc closes the open panels, and the tab order runs toolbar, title, prompt, text', async () => {
    const rig = await makeTellRig();
    await startDraft(rig, 'Ruaj me tastierë.');
    const ev = press('s', { ctrl: true });
    expect(ev.defaultPrevented).toBe(true);
    await until(() => rig.engine.remoteSaves === 1, 'the save by keyboard');
    expect(rig.q('#writer-status').textContent).toContain('Saved as version 1');
    // a plain "s" does nothing
    expect(press('s').defaultPrevented).toBe(false);

    click(rig.q('#writer-versions-btn'));
    click(rig.q('#writer-export-btn'));
    expect(rig.q('#writer-export').hidden).toBe(false);
    press('Escape');
    await until(() => !!(rig.q("#writer-export").hidden && rig.q("#writer-versions").hidden), 'the panels closed');
    expect(document.activeElement).toBe(text(rig));

    const order = rig.qa('#tell-writer button, #tell-writer input, #tell-writer textarea, #tell-writer summary, #tell-writer a')
      .map((e) => e.id || e.tagName.toLowerCase()).filter(Boolean);
    expect(order.indexOf('writer-title')).toBeLessThan(order.indexOf('writer-text'));
    expect(order.indexOf('writer-save')).toBeLessThan(order.indexOf('writer-text'));
    expect(order.indexOf('writer-back')).toBe(0);
    expect(text(rig).getAttribute('lang')).toBe('sq-AL');
    expect(text(rig).getAttribute('dir')).toBe('ltr');
    expect(text(rig).getAttribute('spellcheck')).toBe('false');
  });

  it('Ctrl+S is ignored outside the writer', async () => {
    const rig = await makeTellRig();
    await rig.open('tell', '#tell-modes');
    expect(press('s', { ctrl: true }).defaultPrevented).toBe(false);
  });
});

describe('guidance and targeted expression', () => {
  it('shows the prompt and guidance in a collapsible panel; frames only on request', async () => {
    const rig = await makeTellRig();
    await rig.open('tell/prompts/guided', '[data-write="intro"]');
    click(rig.q('[data-write="intro"]'));
    await until(() => !!rig.root.querySelector('#writer-text'), 'the writer');
    const panel = rig.q<HTMLDetailsElement>('#writer-prompt');
    expect(panel.open).toBe(true);
    expect(panel.textContent).toContain('Introduce yourself to a neighbour');
    expect(panel.textContent).toContain('Try two or three short sentences.');
    expect(panel.textContent).toContain('shtëpi');
    expect(rig.root.querySelector('#writer-frames')).toBeNull();
    click(rig.q('#writer-show-frames'));
    expect(rig.q('#writer-frames').textContent).toContain('Unë quhem ___.');
    press('Escape');
    expect(panel.open).toBe(false);
  });

  it('keeps the English of a targeted expression on the device and shows familiar words and a frame', async () => {
    const rig = await makeTellRig();
    await rig.open('tell', '#tell-new-draft');
    click(rig.q('#tell-mode-targeted'));
    click(rig.q('#tell-new-draft'));
    await until(() => !!rig.root.querySelector('#tell-targeted-free'), 'the targeted picker');
    click(rig.q('#tell-targeted-free'));
    await until(() => !!rig.root.querySelector('#writer-intent'), 'the writer with its intent box');
    rig.service.calls.length = 0;
    typeInto(rig.q<HTMLTextAreaElement>('#writer-intent'), 'I want to thank you for dinner');
    expect(rig.engine.intentsSeen).toContain('I want to thank you for dinner');
    expect(rig.q('#writer-intent-box').textContent).toContain('It is not sent anywhere');
    expect(rig.q('#writer-familiar').textContent).toContain('shtëpi');
    expect(rig.q('#writer-frames').textContent).toContain('Unë dua të them ___.');
    typeInto(text(rig), 'Faleminderit për darkën.');
    rig.timers.fire();
    click(rig.q('#writer-save'));
    await until(() => rig.engine.remoteSaves === 1, 'the save');
    // the English appears in no stored document, no event and no service call
    const everything = JSON.stringify([...rig.engine.localDocs.values(), ...rig.engine.remoteDocs.values(), rig.writing, await queued(rig), rig.service.calls]);
    expect(everything).not.toContain('thank you for dinner');
    expect(rig.writing[0].payload).toMatchObject({ mode: 'retrieval' });
  });

  it('offers a model for a whole targeted sentence only after confirmation', async () => {
    const rig = await makeTellRig();
    await rig.open('tell/prompts/targeted', '#tell-targeted-free');
    click(rig.q('#tell-targeted-free'));
    await until(() => !!rig.root.querySelector('#writer-text'), 'the writer');
    typeInto(text(rig), 'Unë jam.');
    click(rig.q('#writer-analyse'));
    await until(() => !!rig.root.querySelector('[data-sentence-model-ask]'), 'the per-sentence model button');
    click(rig.q('[data-sentence-model-ask="0"]'));
    expect(rig.engine.calls).not.toContain('assist:6');
    click(rig.q('[data-sentence-model-yes="0"]'));
    await until(() => !!rig.root.querySelector('[data-sentence-model="0"] .tell-step'), 'the model');
    expect(rig.q('[data-sentence-model="0"] .tell-step').getAttribute('data-review')).toBe('unreviewed');
  });
});

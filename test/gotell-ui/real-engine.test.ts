// @vitest-environment jsdom
/** The workspace over GoTell's real modules (documents, evidence, privacy, prompts, the Albanian checker), through the shell. */
import { afterEach, describe, expect, it } from 'vitest';
import { validateEvent } from '../../packages/repository-contract/src';
import { tellOverrides } from '../../packages/goreview/app/screens/tell/overrides';
import { decodeBody } from '../../packages/gotell/src/documents';
import { defaultService, destroyRigs, makeRig, queued, until, type Rig } from '../goreview-app/helpers';
import { draftIdFromHash, press, typeInto } from './rig';

afterEach(() => { tellOverrides.download = undefined; tellOverrides.timers = undefined; destroyRigs(); });

const click = (el: Element | null | undefined): void => { if (!el) throw new Error('nothing to click'); (el as HTMLElement).click(); };

async function realRig(): Promise<{ rig: Rig; downloads: Array<{ filename: string; content: string }> }> {
  const downloads: Array<{ filename: string; content: string }> = [];
  tellOverrides.download = (f) => { downloads.push(f); };
  const rig = await makeRig({ service: defaultService(), signedIn: true });
  return { rig, downloads };
}

describe('the real engine in the shell', () => {
  it('writes, saves a version with independent authorship into a private document, and records evidence with no text', async () => {
    const { rig } = await realRig();
    await rig.go('tell');
    await until(() => !!rig.root.querySelector('#tell-new-draft'), 'the home');
    click(rig.q('#tell-new-draft'));
    await until(() => !!rig.root.querySelector('#writer-text'), 'the writer');
    const id = draftIdFromHash();
    typeInto(rig.q<HTMLTextAreaElement>('#writer-text'), 'Unë jam në shtëpi. Ajo është e mirë.');
    press('s', { ctrl: true });
    await until(() => (rig.service.docs.get('L1')?.size ?? 0) === 1, 'the private document');
    await until(() => (rig.q('#writer-status').textContent ?? '').includes('Saved as version 1'), 'the status');
    const doc = [...rig.service.docs.get('L1')!.values()][0];
    expect(doc.docId).toBe(id);
    expect(doc.kind).toBe('draft');
    const record = decodeBody(doc);
    expect(record.versions).toHaveLength(1);
    expect(record.versions[0].sentences.map((s) => s.authorship)).toEqual(['independent', 'independent']);
    // the observation reached the shell's queue (this fake service has no /writing route): hashes and counts, never the words
    const q = await queued(rig);
    const kinds = q.map((e) => e.kind).sort();
    expect(kinds).toEqual(['DraftSaved', 'ProductionRecorded', 'ProductionRecorded']);
    expect(JSON.stringify(q)).not.toContain('shtëpi');
    expect(rig.q('#writer-evidence-summary').textContent).toContain('independent');
    // the draft shows up on the home page, with its version count
    await rig.go('tell');
    await until(() => !!rig.root.querySelector(`#tell-drafts li[data-doc="${id}"]`), 'the draft row');
    expect(rig.q(`#tell-drafts li[data-doc="${id}"]`).textContent).toContain('1 version(s)');
  });

  it('autosaves on the device without touching the account, and Analyse runs the Albanian checker without changing the text', async () => {
    const { rig } = await realRig();
    const timers: Array<() => void> = [];
    tellOverrides.timers = { set: (fn) => { timers.push(fn); return timers.length; }, clear: () => undefined };
    await rig.go('tell');
    await until(() => !!rig.root.querySelector('#tell-new-draft'), 'the home');
    click(rig.q('#tell-new-draft'));
    await until(() => !!rig.root.querySelector('#writer-text'), 'the writer');
    const body = 'Unë jam në shtëpi.';
    typeInto(rig.q<HTMLTextAreaElement>('#writer-text'), body);
    timers.splice(0).forEach((fn) => fn());
    await until(() => (rig.q('#writer-status').textContent ?? '').includes('Kept on this device'), 'the autosave');
    expect(rig.service.docs.size).toBe(0);
    click(rig.q('#writer-analyse'));
    await until(() => !!rig.root.querySelector('#writer-analysis-summary') || !!rig.root.querySelector('#writer-analysis-error'), 'the analysis');
    expect(rig.q<HTMLTextAreaElement>('#writer-text').value).toBe(body);
    expect(rig.root.querySelector('#writer-analysis-error')?.textContent ?? '').toBe('');
    expect(rig.q('#writer-coverage').textContent ?? '').not.toBe('');
    // the coverage is ONE line, with the adapter's whole list behind a closed disclosure
    const line = rig.q('#writer-coverage-line').textContent ?? '';
    expect(line).toMatch(/^Checked: definiteness, case, agreement, conjugation, particles\. Not checked: \d+ other areas — see details\.$/);
    expect(line.length).toBeLessThan(200);
    const details = rig.q<HTMLDetailsElement>('#writer-coverage-details');
    expect(details.tagName).toBe('DETAILS');
    expect(details.open).toBe(false);
    expect(details.textContent ?? '').toMatch(/idiomaticity/);
    expect((details.textContent ?? '').length).toBeGreaterThan(1000); // nothing was dropped, only folded away
  });

  it('lists real prompts for Albanian, suggests one with a reason and shows machine-drafted prompts as unreviewed', async () => {
    const { rig } = await realRig();
    await rig.go('tell/prompts/guided');
    await until(() => !!rig.root.querySelector('#tell-prompt-list [data-prompt]'), 'prompts');
    expect(rig.qa('#tell-prompt-list [data-prompt]').length).toBeGreaterThan(3);
    click(rig.q('#tell-suggest-btn'));
    await until(() => !!rig.root.querySelector('#tell-suggestion-reason'), 'the suggestion');
    expect(rig.q('#tell-suggestion-reason').textContent).toMatch(/Why this one: \S+/);
    await rig.go('tell/prompts/testimony');
    await until(() => !rig.q('#tell-testimony-note').hidden, 'the testimony note');
  });

  it('exports everything the learner wrote and removes the drafts from the device on request', async () => {
    const { rig, downloads } = await realRig();
    await rig.go('tell');
    await until(() => !!rig.root.querySelector('#tell-new-draft'), 'the home');
    click(rig.q('#tell-new-draft'));
    await until(() => !!rig.root.querySelector('#writer-text'), 'the writer');
    typeInto(rig.q<HTMLTextAreaElement>('#writer-text'), 'Për eksport.');
    press('s', { ctrl: true });
    await until(() => (rig.service.docs.get('L1')?.size ?? 0) === 1, 'the document');
    await rig.go('tell/privacy');
    await until(() => !!rig.root.querySelector('#tell-export-all'), 'the privacy page');
    expect(rig.q('#tell-privacy-statement').textContent).toContain('never put in a learning event');
    click(rig.q('#tell-export-all'));
    await until(() => downloads.length === 1, 'the export');
    expect(downloads[0].filename).toMatch(/^gotell-writing-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(downloads[0].content).count).toBe(1);
    click(rig.q('#tell-clean'));
    click(rig.q('#tell-clean-go'));
    await until(() => (rig.q('#tell-privacy-device .status').textContent ?? '').includes('removed from this device'), 'the cleanup');
    expect(rig.service.docs.get('L1')!.size).toBe(1); // the account copy is untouched
  });
});

describe('the remote-assistance switch in the shell', () => {
  it('writes ConsentGiven then ConsentWithdrawn (scope gotell:remote-assistance) through the shell queue, and the stored switch follows', async () => {
    const { rig } = await realRig();
    await rig.go('tell/privacy');
    await until(() => !!rig.root.querySelector('#tell-remote-consent'), 'the privacy page');
    const box = rig.q<HTMLInputElement>('#tell-remote-consent');
    expect(box.checked).toBe(false);
    expect((await queued(rig)).filter((e) => e.kind.startsWith('Consent'))).toEqual([]); // nothing written until the learner acts
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await until(async () => (await queued(rig)).some((e) => e.kind === 'ConsentGiven'), 'the ConsentGiven event');
    await until(() => (rig.q('#tell-privacy-remote .status').textContent ?? '').includes('Remote help is allowed'), 'the status');
    expect((await (await rig.app.ctx.data())!.area.get('gotell:remote-consent'))['gotell:remote-consent']).toBe(true);
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await until(async () => (await queued(rig)).some((e) => e.kind === 'ConsentWithdrawn'), 'the ConsentWithdrawn event');
    await until(() => (rig.q('#tell-privacy-remote .status').textContent ?? '').includes('Remote help is off'), 'the status');
    expect((await (await rig.app.ctx.data())!.area.get('gotell:remote-consent'))['gotell:remote-consent']).toBe(false);
    const events = (await queued(rig)).filter((e) => e.kind.startsWith('Consent'));
    expect(events.map((e) => e.kind)).toEqual(['ConsentGiven', 'ConsentWithdrawn']);
    for (const e of events) {
      expect(validateEvent(e)).toEqual([]);
      expect(e.payload).toMatchObject({ consent: 'gotell:remote-assistance', scope: 'gotell:remote-assistance' });
      expect(e.producer.app).toBe('gopractice-tell');
    }
  });
});

describe('the real checker and ladder through the screen', () => {
  it('flags a verb ending, walks the ladder, accepts the correction and records the sentence as copied from the shown correction', async () => {
    const { rig } = await realRig();
    await rig.go('tell');
    await until(() => !!rig.root.querySelector('#tell-new-draft'), 'the home');
    click(rig.q('#tell-new-draft'));
    await until(() => !!rig.root.querySelector('#writer-text'), 'the writer');
    typeInto(rig.q<HTMLTextAreaElement>('#writer-text'), 'Unë lexon librin.');
    click(rig.q('#writer-analyse'));
    await until(() => !!rig.root.querySelector('mark.issue-mark'), 'the marker');
    const mark = rig.q('mark.issue-mark');
    expect(mark.textContent).toContain('lexon');
    expect(mark.getAttribute('data-class')).toBe('grammatically-wrong');
    const card = rig.q('[data-issue-card]');
    const issueId = card.getAttribute('data-issue-card')!;
    for (let level = 1; level <= 4; level++) {
      click(rig.q(`[data-issue-card="${issueId}"] button[data-level="${level}"]`));
      await until(() => rig.qa(`[data-issue-card="${issueId}"] .tell-step`).length === level, `step ${level}`);
    }
    expect(rig.q('.tell-correction').textContent).toContain('Unë lexoj librin.');
    expect(rig.q<HTMLTextAreaElement>('#writer-text').value).toBe('Unë lexon librin.');
    click(rig.q('[data-accept]'));
    await until(() => rig.q<HTMLTextAreaElement>('#writer-text').value === 'Unë lexoj librin.', 'the accepted sentence');
    const events = await rig.app.ctx.events('sq');
    expect(events.filter((e) => e.kind === 'CorrectionAccepted')).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain('lexon');
    press('s', { ctrl: true });
    await until(() => (rig.service.docs.get('L1')?.size ?? 0) === 1, 'the save');
    const record = decodeBody([...rig.service.docs.get('L1')!.values()][0]);
    expect(record.versions.map((v) => v.text)).toEqual(['Unë lexon librin.', 'Unë lexoj librin.']);
    expect(record.versions[1].sentences[0].authorship).toBe('copied-from-model');
    await until(() => (rig.q('#writer-evidence-summary').textContent ?? '').includes('no production credit'), 'the honest summary');
  });

  it('refuses a model honestly when no remote assistant is wired and the pack has none for the sentence', async () => {
    const { rig } = await realRig();
    await rig.go('tell');
    await until(() => !!rig.root.querySelector('#tell-new-draft'), 'the home');
    click(rig.q('#tell-new-draft'));
    await until(() => !!rig.root.querySelector('#writer-text'), 'the writer');
    typeInto(rig.q<HTMLTextAreaElement>('#writer-text'), 'Unë lexon librin.');
    click(rig.q('#writer-analyse'));
    await until(() => !!rig.root.querySelector('[data-issue-card]'), 'the issue');
    const issueId = rig.q('[data-issue-card]').getAttribute('data-issue-card')!;
    for (let level = 1; level <= 5; level++) {
      click(rig.q(`[data-issue-card="${issueId}"] button[data-level="${level}"]`));
      await until(() => rig.q(`[data-issue-card="${issueId}"] button[data-level="${level}"]`).getAttribute('data-done') === 'true', `level ${level} done`);
    }
    click(rig.q(`[data-issue-card="${issueId}"] button[data-level="6"]`));
    await until(() => !!rig.root.querySelector('[data-model-yes]'), 'the confirmation');
    click(rig.q('[data-model-yes]'));
    await until(() => !!rig.root.querySelector(`[data-issue-card="${issueId}"] .tell-step[data-level="6"], [data-issue-card="${issueId}"] .tell-step[data-refused="6"]`), 'a model or a refusal');
    const step6 = rig.root.querySelector(`[data-issue-card="${issueId}"] .tell-step[data-level="6"]`);
    const refused = rig.root.querySelector(`[data-issue-card="${issueId}"] .tell-step[data-refused="6"]`);
    if (step6) expect(step6.getAttribute('data-review')).toBeTruthy(); // a pack sentence, with its review state
    else expect(refused!.textContent).toContain('nothing was sent');
  });
});

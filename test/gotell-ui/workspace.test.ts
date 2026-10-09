// @vitest-environment jsdom
/** The GoTell workspace screens in the shell: routes, home, prompts, privacy, goals, independence. */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateEvent } from '../../packages/repository-contract/src';
import { foldGoals, GOAL_KEY } from '../../packages/gotell/src/workspace/goals';
import { queued } from '../gopractice/helpers';
import { draftIdFromHash, flush, makeTellRig, resetTellRig, typeInto, until } from './rig';

afterEach(() => resetTellRig());

const click = (el: Element | null | undefined): void => { if (!el) throw new Error('nothing to click'); (el as HTMLElement).click(); };

describe('routes', () => {
  it('serves #/tell, #/tell/prompts, #/tell/goals, #/tell/privacy and #/tell/write/<id>', async () => {
    const rig = await makeTellRig();
    await rig.open('tell', '#tell-modes');
    expect(rig.app.current()).toBe('tell');
    expect(rig.q('#tell-drafts').textContent).toContain('No drafts yet');
    expect(rig.q('#tell-goals').textContent).toContain('No goals yet');
    expect(rig.q('#tell-connection').textContent).toMatch(/Online|Offline/);
    expect(rig.q('#tell-privacy-link').getAttribute('href')).toBe('#/tell/privacy');

    await rig.open('tell/prompts', '#tell-prompt-picker');
    expect(rig.app.current()).toBe('tell/prompts');
    await rig.open('tell/goals', '#tell-goals');
    expect(rig.app.current()).toBe('tell/goals');
    await rig.open('tell/privacy', '#tell-privacy-statement');
    expect(rig.app.current()).toBe('tell/privacy');
    await rig.open('tell/write/nope', '#writer-missing');
    expect(rig.q('#writer-missing').textContent).toContain('not found');
  });

  it('shows the six modes and starts a free draft on the device only', async () => {
    const rig = await makeTellRig();
    await rig.open('tell', '#tell-new-draft');
    expect(rig.qa('input[name="tell-mode"]').map((i) => (i as HTMLInputElement).value)).toEqual(['free', 'guided', 'testimony', 'missionary', 'narrative', 'targeted']);
    expect((rig.q('#tell-mode-free') as HTMLInputElement).checked).toBe(true);
    click(rig.q('#tell-new-draft'));
    await until(() => !!rig.root.querySelector('#writer-text'), 'the writer');
    const id = draftIdFromHash();
    expect(id).toMatch(/^draft-/);
    expect(rig.engine.localDocs.has(id)).toBe(true);
    expect(rig.engine.remoteDocs.size).toBe(0); // creating a draft never reaches the account
    expect(rig.q('#tell-writer').getAttribute('data-mode')).toBe('free');
  });

  it('lists drafts with title, mode, version count and date; opens, exports and deletes them', async () => {
    const rig = await makeTellRig();
    await rig.open('tell', '#tell-new-draft');
    click(rig.q('#tell-new-draft'));
    await until(() => !!rig.root.querySelector('#writer-text'), 'the writer');
    const id = draftIdFromHash();
    typeInto(rig.q<HTMLInputElement>('#writer-title'), 'Mirëmëngjes');
    typeInto(rig.q<HTMLTextAreaElement>('#writer-text'), 'Mirëmëngjes. Si jeni?');
    click(rig.q('#writer-save'));
    await until(() => rig.engine.remoteSaves === 1, 'the save');
    await rig.open('tell', '#tell-drafts li');
    await until(() => !!rig.root.querySelector(`#tell-drafts li[data-doc="${id}"]`), 'the draft row');
    const row = rig.q(`#tell-drafts li[data-doc="${id}"]`);
    expect(row.textContent).toContain('Mirëmëngjes');
    expect(row.textContent).toContain('1 version(s)');
    expect(rig.q(`[data-open="${id}"]`).getAttribute('href')).toBe(`#/tell/write/${id}`);

    click(rig.q(`[data-export="${id}"]`));
    await until(() => rig.downloads.length === 1, 'the export');
    expect(rig.downloads[0].filename).toMatch(/\.json$/);

    click(rig.q(`[data-delete="${id}"]`));
    expect(rig.q(`.tell-draft-confirm`).hidden).toBe(false);
    click(rig.q(`[data-delete-cancel="${id}"]`));
    expect(rig.engine.localDocs.has(id)).toBe(true);
    click(rig.q(`[data-delete="${id}"]`));
    click(rig.q(`[data-delete-confirm="${id}"]`));
    await until(() => !rig.engine.localDocs.has(id), 'the deletion');
    await until(() => (rig.q('#tell-drafts').textContent ?? '').includes('No drafts yet'), 'the empty list');
  });
});

describe('independence', () => {
  it('gives a learner with no review history the full workspace, asking for no candidates and queueing nothing', async () => {
    const rig = await makeTellRig();
    rig.service.calls.length = 0;
    await rig.open('tell', '#tell-modes');
    await rig.open('tell/prompts', '#tell-prompt-picker');
    await rig.open('tell/privacy', '#tell-privacy-statement');
    expect(rig.service.calls).not.toContain('candidates');
    expect(await queued(rig)).toEqual([]);
    expect(rig.app.ctx.run.active).toBeUndefined();
    expect(await rig.app.ctx.events()).toEqual([]);
  });

  it('imports nothing of the review side, in the screens, the engine wiring or the workspace logic', () => {
    const root = path.resolve(__dirname, '../../packages');
    const files = [
      path.join(root, 'gopractice/screens/tell.ts'), path.join(root, 'gopractice/tellEngine.ts'),
      ...walk(path.join(root, 'gopractice/screens/tell')), ...walk(path.join(root, 'gotell/src/workspace')),
    ];
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const source = fs.readFileSync(f, 'utf8');
      const imports = [...source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const i of imports) expect(/goreview|golisten|golearn|\/src\/gotell|scheduler/i.test(i), `${path.basename(f)} imports ${i}`).toBe(false);
      const code = source.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
      expect(/\bdeck\b|foldDeck|createSessionRunner|createFsrsScheduler|ctx\.engine|ctx\.run|\.candidates\(/.test(code), `${path.basename(f)} touches the review side`).toBe(false);
    }
  });
});

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : /\.ts$/.test(d.name) ? [path.join(dir, d.name)] : []));
}

describe('the prompt picker', () => {
  it('shows category tabs and the prompts of the mode, with goal, instruction, difficulty and cultural notes', async () => {
    const rig = await makeTellRig();
    await rig.open('tell/prompts/guided', '#tell-prompt-list li');
    expect(rig.qa('#tell-categories [data-category]').map((b) => b.getAttribute('data-category'))).toEqual(['all', 'personal-background', 'mission-communication', 'testimony', 'scripture-theology', 'general']);
    expect(rig.q('[data-category="all"]').getAttribute('aria-selected')).toBe('true');
    const card = rig.q('[data-prompt="intro"]');
    expect(card.textContent).toContain('Introduce yourself to a neighbour');
    expect(card.textContent).toContain('First sentences');
    expect(card.textContent).toContain('A cultural note for intro.');
    expect(card.querySelector('[data-review="unreviewed"]')?.textContent).toContain('machine-drafted');
    click(rig.q('[data-category="general"]'));
    expect(rig.qa('#tell-prompt-list [data-prompt]').map((c) => c.getAttribute('data-prompt'))).toEqual(['thanks']);
    click(rig.q('[data-category="scripture-theology"]'));
    expect(rig.q('#tell-no-prompts').textContent).toContain('no prompts');
  });

  it('shows testimony prompts as an unordered set with the "only what is true" note', async () => {
    const rig = await makeTellRig();
    await rig.open('tell/prompts/testimony', '#tell-prompt-list li');
    const note = rig.q('#tell-testimony-note');
    expect(note.hidden).toBe(false);
    expect(note.textContent).toContain('only what is true for you');
    expect(note.textContent).toContain('skip what does not apply');
    expect(rig.q('#tell-prompt-list').tagName).toBe('UL');
    expect(rig.qa('#tell-prompt-list > li').length).toBe(2);
    expect(rig.root.querySelector('#tell-prompt-list ol')).toBeNull();
    expect(rig.q('#tell-prompt-list').textContent).not.toMatch(/\bstep\b|\bsecond\b|\bthird\b/i);
  });

  it('suggests one prompt with its reason and starts a draft from it', async () => {
    const rig = await makeTellRig();
    await rig.open('tell/prompts/missionary', '#tell-suggest-btn');
    click(rig.q('#tell-suggest-btn'));
    await until(() => !!rig.root.querySelector('#tell-suggestion-reason'), 'the suggestion');
    expect(rig.q('#tell-suggestion-reason').textContent).toContain('Why this one: Chosen because you have not tried it yet.');
    click(rig.q('#tell-suggestion [data-write="mission"]'));
    await until(() => !!rig.root.querySelector('#writer-text'), 'the writer');
    const id = draftIdFromHash();
    expect(rig.engine.localDocs.get(id)!.record).toMatchObject({ mode: 'missionary', promptId: 'mission' });
    expect(rig.q('#writer-prompt').textContent).toContain('Say why you are here');
  });
});

describe('goals', () => {
  it('adds a goal as a PreferenceChanged event (gotell:goal, explicit), lists it and marks it done', async () => {
    const rig = await makeTellRig();
    await rig.open('tell/goals', '#tell-goal-form');
    typeInto(rig.q<HTMLInputElement>('#tell-goal-text'), 'Introduce myself to a host family');
    rig.q<HTMLFormElement>('#tell-goal-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await until(() => !!rig.root.querySelector('[data-goal]'), 'the goal');
    const events = (await rig.app.ctx.events('sq')).filter((e) => e.kind === 'PreferenceChanged');
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(validateEvent(e)).toEqual([]);
    expect(e.payload).toMatchObject({ key: GOAL_KEY, origin: 'explicit', value: { text: 'Introduce myself to a host family' } });
    expect(e.producer.app).toBe('gopractice-tell');
    const value = (e.payload as { value: { goalId: string; createdAt: string; done?: boolean } }).value;
    expect(value.goalId).toMatch(/^goal-/);
    expect(value.done).toBeUndefined();

    click(rig.q(`[data-done-goal="${value.goalId}"]`));
    await until(() => rig.q(`[data-goal="${value.goalId}"]`).getAttribute('data-done') === 'true', 'the goal marked done');
    const after = (await rig.app.ctx.events('sq')).filter((x) => x.kind === 'PreferenceChanged');
    expect(after).toHaveLength(2);
    expect(after.every((x) => validateEvent(x).length === 0)).toBe(true);
    expect(foldGoals(after)).toEqual([{ goalId: value.goalId, text: 'Introduce myself to a host family', createdAt: value.createdAt, done: true }]);
    // the goal also shows on the home page
    await rig.open('tell', '#tell-goal-list [data-goal]');
    expect(rig.q('#tell-goals').textContent).toContain('Introduce myself to a host family');
  });

  it('refuses an empty goal', async () => {
    const rig = await makeTellRig();
    await rig.open('tell/goals', '#tell-goal-form');
    rig.q<HTMLFormElement>('#tell-goal-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await flush(4);
    expect(rig.q('#tell-goals .status').textContent).toContain('Write a goal');
    expect(await rig.app.ctx.events('sq')).toEqual([]);
  });
});

describe('the privacy page', () => {
  it('states what is kept, exports everything, keeps remote assistance off and names that no provider is configured', async () => {
    const rig = await makeTellRig();
    await rig.open('tell/privacy', '#tell-privacy-statement');
    expect(rig.q('#tell-privacy-statement').textContent).toContain('never put in a learning event');
    const consent = rig.q<HTMLInputElement>('#tell-remote-consent');
    expect(consent.checked).toBe(false);
    expect(rig.q('#tell-privacy-remote').textContent).toContain('No remote assistant is configured');
    consent.checked = true;
    consent.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => rig.engine.consentValue, 'consent');
    await until(() => (rig.q('#tell-privacy-remote .status').textContent ?? '').includes('no provider is configured'), 'the status');

    click(rig.q('#tell-export-all'));
    await until(() => rig.downloads.length === 1, 'the export');
    expect(rig.downloads[0].filename).toBe('gotell-writing.json');
  });

  it('cleans the device only after a confirmation', async () => {
    const rig = await makeTellRig();
    await rig.open('tell', '#tell-new-draft');
    click(rig.q('#tell-new-draft'));
    await until(() => !!rig.root.querySelector('#writer-text'), 'the writer');
    expect(rig.engine.localDocs.size).toBe(1);
    await rig.open('tell/privacy', '#tell-clean');
    click(rig.q('#tell-clean'));
    expect(rig.q('#tell-clean-confirm').hidden).toBe(false);
    click(rig.q('#tell-clean-cancel'));
    expect(rig.engine.localDocs.size).toBe(1);
    click(rig.q('#tell-clean'));
    click(rig.q('#tell-clean-go'));
    await until(() => rig.engine.localDocs.size === 0, 'the cleanup');
    await until(() => (rig.q('#tell-privacy-device .status').textContent ?? '').includes('1 draft(s) removed'), 'the message');
  });
});

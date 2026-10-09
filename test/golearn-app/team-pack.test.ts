// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { KEYS, type Session } from '../../packages/golearn-extension/app/state';
import { destroyRigs, choose, fakeBackground, flush, makeRig, signIn, submit, until, type Rig } from './helpers';

afterEach(() => destroyRigs());

const sessionOf = async (rig: Rig): Promise<Session | undefined> => (await rig.area.get(KEYS.session))[KEYS.session] as Session | undefined;
const enrolCall = (rig: Rig): Record<string, unknown> => rig.service.calls.filter((c) => c.method === 'enrol').at(-1)!.args[0] as Record<string, unknown>;

describe('Team and language', () => {
  it('asks to sign in first when there is no session', async () => {
    const rig = await makeRig();
    await rig.go('team');
    expect(rig.text()).toContain('Sign in first');
    expect(rig.root.querySelector('#enrol-form')).toBeNull();
  });

  it('keeps the team id and the language id apart: the enrolment carries both, plus variety, script, pack and version', async () => {
    const rig = await makeRig();
    await signIn(rig);
    await rig.go('team');
    expect([...rig.q<HTMLSelectElement>('#team').options].map((o) => o.value)).toEqual(['', 'albania', 'honduras', 'norway']);
    choose(rig.q('#team'), 'albania');
    // one language, nothing forced: preselected
    expect(rig.q<HTMLSelectElement>('#language').value).toBe('sq');
    submit(rig.q('#enrol-form'));
    await until(() => /Enrolled:/.test(rig.q('#enrol-form .status').textContent ?? ''));
    expect(enrolCall(rig)).toEqual({ teamId: 'albania', languageId: 'sq', varietyId: 'sq-standard', scriptId: 'Latn', packId: 'pack:sq', packVersion: '9', goals: [{ kind: 'reading' }] });
    const stored = rig.service.enrolments[0];
    expect(stored.teamId).toBe('albania');
    expect(stored.languageId).toBe('sq');
    expect(stored.teamId).not.toBe(stored.languageId);
    // the new enrolment becomes the active one in the session
    expect(await sessionOf(rig)).toMatchObject({ enrolmentId: stored.enrolmentId, languageId: 'sq' });
    // and is listed, with the cached profile refreshed
    await until(() => rig.root.querySelector('.enrolments li'));
    expect(rig.q('.enrolments li').getAttribute('data-team')).toBe('albania');
    expect(rig.q('.enrolments li').getAttribute('data-language')).toBe('sq');
    expect((await rig.app.ctx.state.getProfile())!.enrolments).toHaveLength(1);
  });

  it('Norway forces the written-standard choice: nothing is preselected and nothing is guessed', async () => {
    const rig = await makeRig();
    await signIn(rig);
    await rig.go('team');
    choose(rig.q('#team'), 'norway');
    const language = rig.q<HTMLSelectElement>('#language');
    expect(language.value).toBe('');
    expect([...language.options].map((o) => o.value)).toEqual(['', 'nb', 'nn']);
    expect(language.options[0].textContent).toMatch(/written standard/);
    submit(rig.q('#enrol-form'));
    await flush(10);
    expect(rig.q('#enrol-form .status').textContent).toMatch(/Bokmål \(nb\) and Nynorsk \(nn\)/);
    expect(rig.service.calls.filter((c) => c.method === 'enrol')).toHaveLength(0);
    // choosing a standard enrols with that standard as the language and the variety
    choose(language, 'nn');
    expect(rig.q('#pack-info').textContent).toMatch(/never guesses/);
    submit(rig.q('#enrol-form'));
    await until(() => /Enrolled:/.test(rig.q('#enrol-form .status').textContent ?? ''));
    expect(enrolCall(rig)).toMatchObject({ teamId: 'norway', languageId: 'nn', varietyId: 'nn', packId: 'pack:nn' });
  });

  it('one learner may hold several enrolments, and switching the active one changes the session', async () => {
    const rig = await makeRig();
    await signIn(rig);
    await rig.go('team');
    choose(rig.q('#team'), 'albania');
    submit(rig.q('#enrol-form'));
    await until(() => rig.service.enrolments.length === 1);
    await until(() => /Enrolled:/.test(rig.q('#enrol-form .status').textContent ?? ''));
    choose(rig.q('#team'), 'norway');
    choose(rig.q('#language'), 'nb');
    submit(rig.q('#enrol-form'));
    await until(() => rig.service.enrolments.length === 2);
    await until(() => rig.root.querySelectorAll('.enrolments li').length === 2);
    const [first, second] = rig.service.enrolments;
    expect((await sessionOf(rig))!.enrolmentId).toBe(second.enrolmentId);
    const useFirst = rig.q(`.enrolments li[data-enrolment="${first.enrolmentId}"] button`);
    useFirst.click();
    await flush(30);
    expect((await sessionOf(rig))).toMatchObject({ enrolmentId: first.enrolmentId, languageId: 'sq' });
  });

  it('a planned pack cannot be enrolled in: the button is off and the reason is given', async () => {
    const rig = await makeRig();
    await signIn(rig);
    await rig.go('team');
    choose(rig.q('#team'), 'honduras');
    expect(rig.q<HTMLButtonElement>('#enrol').disabled).toBe(true);
    expect(rig.q('#pack-info').textContent).toMatch(/planned, not installable/);
    submit(rig.q('#enrol-form'));
    await flush(10);
    expect(rig.service.calls.filter((c) => c.method === 'enrol')).toHaveLength(0);
    expect(rig.q('#enrol-form .status').textContent).toMatch(/planned, not installable/);
  });

  it('when the service does not list the learner in the team, says so and offers to enrol without a team', async () => {
    const rig = await makeRig();
    rig.service.members.clear();
    await signIn(rig);
    await rig.go('team');
    choose(rig.q('#team'), 'albania');
    submit(rig.q('#enrol-form'));
    await until(() => /not a member/.test(rig.q('#enrol-form .status').textContent ?? ''));
    const without = rig.q<HTMLButtonElement>('#enrol-no-team');
    expect(without.hidden).toBe(false);
    without.click();
    await until(() => /Enrolled:/.test(rig.q('#enrol-form .status').textContent ?? ''));
    expect(enrolCall(rig).teamId).toBeUndefined();
    expect(enrolCall(rig).languageId).toBe('sq');
  });
});

describe('Team and language in the extension', () => {
  it('enrols from this page (so the variety and script travel with it) and asks the worker to adopt the enrolment', async () => {
    const rig = await makeRig({ extension: true });
    const bg = fakeBackground(rig);
    await signIn(rig);
    await rig.go('team');
    choose(rig.q('#team'), 'albania');
    submit(rig.q('#enrol-form'));
    await until(() => /Enrolled:/.test(rig.q('#enrol-form .status').textContent ?? ''));
    expect(enrolCall(rig)).toMatchObject({ teamId: 'albania', languageId: 'sq', varietyId: 'sq-standard', scriptId: 'Latn' });
    const adopt = bg.messages.find((m) => m.type === 'golearn:select-enrolment')!;
    expect(adopt.enrolmentId).toBe(rig.service.enrolments[0].enrolmentId);
    expect(await sessionOf(rig)).toMatchObject({ enrolmentId: rig.service.enrolments[0].enrolmentId, languageId: 'sq' }); // written by the worker
  });

  it('without a worker that answers, the page writes the enrolment into golearn:session itself', async () => {
    const rig = await makeRig({ extension: true });
    fakeBackground(rig, []);
    await signIn(rig);
    await rig.go('team');
    choose(rig.q('#team'), 'albania');
    submit(rig.q('#enrol-form'));
    await until(() => /Enrolled:/.test(rig.q('#enrol-form .status').textContent ?? ''));
    expect(await sessionOf(rig)).toMatchObject({ enrolmentId: rig.service.enrolments[0].enrolmentId, languageId: 'sq' });
  });
});

describe('Language pack', () => {
  it('keeps the dictionary address in golearn:service (https or localhost only) and installs from it', async () => {
    const rig = await makeRig();
    await rig.go('pack');
    const input = rig.q<HTMLInputElement>('#asset-base');
    input.value = 'http://files.example.org/'; input.dispatchEvent(new Event('input', { bubbles: true }));
    rig.q('#asset-save').click();
    await until(() => rig.q('#asset-save').closest('section')!.querySelector('.status')!.getAttribute('data-kind') === 'error');
    expect(rig.q('#asset-save').closest('section')!.textContent).toMatch(/Dictionary address: .*https/);
    expect((await rig.area.get(KEYS.service))[KEYS.service]).toBeUndefined();
    input.value = 'https://files.example.org/app/'; input.dispatchEvent(new Event('input', { bubbles: true }));
    rig.q('#asset-save').click();
    await flush(30);
    expect((await rig.area.get(KEYS.service))[KEYS.service]).toEqual({ baseUrl: 'http://127.0.0.1:8790', assetBase: 'https://files.example.org/app' });
    let seen = '';
    rig.packs.nextInstall = async () => { return { ok: true, version: '9', checks: [] }; };
    const original = rig.packs.install.bind(rig.packs);
    rig.packs.install = async (pack, o) => { seen = o.baseUrl; return original(pack, o); };
    rig.q('[data-pack="pack:sq"] [data-action="install"]').click();
    await until(() => seen);
    expect(seen).toBe('https://files.example.org/app');
  });


  it('installs through the pack runtime and renders every verification result, passes and failures', async () => {
    const rig = await makeRig();
    await rig.go('pack');
    rig.q('[data-pack="pack:sq"] [data-action="install"]').click();
    await until(() => rig.root.querySelector('[data-pack="pack:sq"] .verify'));
    expect(rig.packs.installs.map((p) => p.packId)).toEqual(['pack:sq']);
    const checks = [...rig.root.querySelectorAll('[data-pack="pack:sq"] .checks li')];
    expect(checks.map((c) => c.getAttribute('data-check'))).toEqual(['dictionary-manifest', 'sample-shard', 'case:v-librin', 'case:v-pine']);
    expect(checks.map((c) => c.getAttribute('data-ok'))).toEqual(['true', 'true', 'true', 'false']);
    expect(checks[3].textContent).toContain('the analyser gave pi');
    expect(rig.q('[data-pack="pack:sq"] .verify').getAttribute('data-ok')).toBe('false');
    expect(rig.q('[data-pack="pack:sq"] .verify').textContent).toMatch(/Not verified: 1 of 4 checks failed/);
    // the outcome is remembered for the completion mark, with the version
    const rec = ((await rig.area.get(KEYS.app))[KEYS.app] as { packs: Record<string, { version: string; ok: boolean }> }).packs['pack:sq'];
    expect(rec).toMatchObject({ version: '9', ok: false });
    expect(rig.q('[data-pack="pack:sq"] .installed').textContent).toMatch(/version 9, verification failed/);
  });

  it('a passing install is marked verified, completes the step, and Re-verify reports through the same view', async () => {
    const rig = await makeRig();
    rig.packs.nextInstall = { ok: true, version: '9', checks: [{ id: 'dictionary-manifest', label: 'Dictionary description', ok: true }, { id: 'case:a', label: 'Validation case: a', ok: true }] };
    await signIn(rig);
    await rig.go('team');
    choose(rig.q('#team'), 'albania');
    submit(rig.q('#enrol-form'));
    await until(() => /Enrolled:/.test(rig.q('#enrol-form .status').textContent ?? ''));
    await rig.go('pack');
    expect(rig.root.querySelector('.rail li[data-route="pack"] .mark.done')).toBeNull();
    rig.q('[data-pack="pack:sq"] [data-action="install"]').click();
    await until(() => rig.root.querySelector('[data-pack="pack:sq"] .verify[data-ok="true"]'));
    await until(() => rig.root.querySelector('.rail li[data-route="pack"] .mark.done'));
    expect(rig.q('[data-pack="pack:sq"] .verify').textContent).toMatch(/Verified: all 2 checks passed/);
    rig.q('[data-pack="pack:sq"] [data-action="verify"]').click();
    await until(() => rig.packs.verifies.length === 1);
    await flush(10);
    expect(rig.q('[data-pack="pack:sq"] .verify').textContent).toMatch(/all 1 checks passed/);
  });

  it('shows progress while installing and survives an installer that throws', async () => {
    const rig = await makeRig();
    rig.packs.nextInstall = async () => { throw new Error('disk full'); };
    await rig.go('pack');
    rig.q('[data-pack="pack:sq"] [data-action="install"]').click();
    await until(() => /disk full/.test(rig.q('[data-pack="pack:sq"] .status').textContent ?? ''));
    expect(rig.q<HTMLButtonElement>('[data-pack="pack:sq"] [data-action="install"]').disabled).toBe(false);
  });

  it('lists a planned pack as planned, not installable, with no install button, and still shows its provenance', async () => {
    const rig = await makeRig();
    await rig.go('pack');
    const es = rig.q('[data-pack="pack:es"]');
    expect(es.getAttribute('data-status')).toBe('planned');
    expect(es.textContent).toMatch(/planned, not installable/i);
    expect(es.querySelector('[data-action="install"]')).toBeNull();
    expect(es.textContent).toContain('Planned, not installable.');
  });

  it('shows the version, the licences and the CC BY-SA attribution of the installable pack', async () => {
    const rig = await makeRig();
    await rig.go('pack');
    const sq = rig.q('[data-pack="pack:sq"]');
    expect(sq.textContent).toContain('version 9');
    expect(sq.querySelector('.attribution')!.textContent).toBe('Wiktionary, via kaikki.org — CC BY-SA 4.0');
    expect(sq.textContent).toContain('CC BY-SA 4.0');
    expect(sq.textContent).toContain('review status: machine-drafted');
    // the pack for the active language comes first
    await signIn(rig);
    await rig.go('team');
    choose(rig.q('#team'), 'norway');
    choose(rig.q('#language'), 'nn');
    submit(rig.q('#enrol-form'));
    await until(() => /Enrolled:/.test(rig.q('#enrol-form .status').textContent ?? ''));
    await rig.go('pack');
    expect(rig.root.querySelector('.pack')!.getAttribute('data-pack')).toBe('pack:nn');
  });
});

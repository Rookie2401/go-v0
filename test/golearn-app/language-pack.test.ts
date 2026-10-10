// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { KEYS, type ActiveChoice, type Session } from '../../packages/golearn-extension/app/state';
import { ES_FAKE, ES_OK_FAKE, LANGUAGES_FAKE, destroyRigs, choose, fakeBackground, fakePacks, flush, makeRig, signIn, submit, until, type Rig } from './helpers';

afterEach(() => destroyRigs());

const sessionOf = async (rig: Rig): Promise<Session | undefined> => (await rig.area.get(KEYS.session))[KEYS.session] as Session | undefined;
const choiceOf = async (rig: Rig): Promise<ActiveChoice | undefined> => (await rig.area.get(KEYS.choice))[KEYS.choice] as ActiveChoice | undefined;
const serverEnrols = (rig: Rig): Array<Record<string, unknown>> => rig.service.calls.filter((c) => c.method === 'enrol').map((c) => c.args[0] as Record<string, unknown>);
const done = (rig: Rig): boolean => /Chosen:/.test(rig.q('#enrol-form .status').textContent ?? '');
const withSpanish = () => { const p = fakePacks(); p.all = p.all.map((x) => (x.languageId === 'es' ? ES_OK_FAKE : x)); return p; };

describe('Choose your language', () => {
  it('shows the six languages from the catalogue in its order, each with what works, what does not, its level and its audio, and asks for no account', async () => {
    const rig = await makeRig();
    await rig.go('language');
    expect(rig.q('#screen h1').textContent).toBe('Choose your language');
    const cards = [...rig.root.querySelectorAll('#language-cards > .lang')];
    expect(cards.map((c) => c.getAttribute('data-language'))).toEqual(LANGUAGES_FAKE.map((l) => l.languageId));
    expect(cards.map((c) => c.querySelector('h2')!.firstChild!.textContent)).toEqual(['Norwegian', 'German', 'Albanian', 'Hindi', 'Thai', 'Spanish']);
    const albanian = rig.q('[data-language="sq"]');
    expect(albanian.querySelector('.native')!.textContent).toContain('shqip');
    expect(albanian.textContent).toContain('Latn script');
    expect(albanian.textContent).toContain('reference pack, machine-drafted, unreviewed');
    expect(albanian.querySelector('.works')!.textContent).toContain('reference analyser');
    expect(albanian.querySelector('.does-not')!.textContent).toContain('No person has reviewed');
    expect(albanian.querySelector('.audio')!.textContent).toContain('Browser voices');
    expect(rig.q('[data-language="de"]').textContent).toContain('experimental, seed-only');
    expect(rig.q('[data-language="hi"]').textContent).toContain('Deva script');
    expect(rig.q('[data-language="th"]').textContent).toContain('Thai script');
    // free choice: no account is needed and no team is asked for
    expect(rig.text()).not.toMatch(/sign in first/i);
    expect(rig.root.querySelector('#team')).toBeNull();
    expect(rig.text()).not.toMatch(/team|leader/i);
    expect([...rig.q<HTMLSelectElement>('#language').options].map((o) => o.value)).toEqual(['', ...LANGUAGES_FAKE.map((l) => l.languageId)]);
  });

  it('a card’s button picks the language in the form below it', async () => {
    const rig = await makeRig();
    await rig.go('language');
    rig.q('[data-language="de"] [data-action="choose"]').click();
    expect(rig.q<HTMLSelectElement>('#language').value).toBe('de');
    expect(rig.q('[data-language="de"]').classList.contains('chosen')).toBe(true);
    expect(rig.q('#pack-info').textContent).toMatch(/German: experimental, seed-only/);
  });

  it('without an account, picking a language makes a local enrolment and no server call; the choice is kept on this device', async () => {
    const rig = await makeRig();
    await rig.go('language');
    choose(rig.q('#language'), 'sq');
    submit(rig.q('#enrol-form'));
    await until(() => done(rig));
    expect(rig.q('#enrol-form .status').textContent).toContain('Saved on this device');
    expect(rig.local.enrolCalls).toEqual([{ languageId: 'sq', varietyId: 'sq-standard', scriptId: 'Latn', packId: 'pack:sq', packVersion: '9', goals: [{ kind: 'reading' }] }]);
    expect(rig.local.enrolCalls[0]).not.toHaveProperty('teamId');
    expect(rig.service.calls.filter((c) => c.method === 'enrol')).toHaveLength(0);
    expect(await sessionOf(rig)).toBeUndefined();
    expect(await choiceOf(rig)).toEqual({ enrolmentId: rig.local.enrolments[0].enrolmentId, languageId: 'sq', varietyId: 'sq-standard', packId: 'pack:sq' });
    // the completion mark and the list of languages follow
    await until(() => rig.root.querySelector('#enrolments li[data-language="sq"] .tag'));
    await until(() => rig.root.querySelector('.rail li[data-route="language"] .mark.done'));
    expect(rig.q('#enrolments li').textContent).toContain('Albanian');
    expect(rig.q('#enrolments li').textContent).toContain('reading now');
    expect(rig.q('#enrolments li').getAttribute('data-team')).toBeNull();
  });

  it('Norwegian asks for the written standard: nothing is preselected and nothing is guessed', async () => {
    const rig = await makeRig();
    await rig.go('language');
    choose(rig.q('#language'), 'nb');
    const standard = rig.q<HTMLSelectElement>('#variety');
    expect(rig.q('#variety').closest('label')!.hidden).toBe(false);
    expect(standard.closest('label')!.textContent).toMatch(/Written standard/);
    expect(standard.value).toBe('');
    expect([...standard.options].map((o) => o.value)).toEqual(['', 'nb', 'nn']);
    expect([...standard.options].map((o) => o.textContent)).toEqual(['Choose the written standard…', 'Bokmål', 'Nynorsk']);
    expect(rig.q('#pack-info').textContent).toMatch(/Bokmål \(nb\) and Nynorsk \(nn\)/);
    submit(rig.q('#enrol-form'));
    await flush(10);
    expect(rig.q('#enrol-form .status').textContent).toMatch(/Bokmål \(nb\) and Nynorsk \(nn\)/);
    expect(rig.local.enrolCalls).toHaveLength(0);
    choose(standard, 'nn');
    submit(rig.q('#enrol-form'));
    await until(() => done(rig));
    expect(rig.local.enrolCalls[0]).toMatchObject({ languageId: 'nn', varietyId: 'nn', packId: 'pack:nn' });
    expect(await choiceOf(rig)).toMatchObject({ languageId: 'nn', varietyId: 'nn', standard: 'nn', packId: 'pack:nn' });
    expect(rig.q('#enrol-form .status').textContent).toContain('Norwegian (Nynorsk)');
  });

  it('Spanish offers a regional preference that may be left alone; Honduras is recorded as the variety', async () => {
    const rig = await makeRig({ packs: withSpanish() });
    await rig.go('language');
    choose(rig.q('#language'), 'es');
    const variety = rig.q<HTMLSelectElement>('#variety');
    expect(variety.closest('label')!.hidden).toBe(false);
    expect(variety.closest('label')!.textContent).toMatch(/Regional preference/);
    expect([...variety.options].map((o) => o.value)).toEqual(['es-standard', 'es-HN']);
    expect(variety.value).toBe('es-standard'); // optional: the general variety stands unless one is picked
    choose(variety, 'es-HN');
    submit(rig.q('#enrol-form'));
    await until(() => done(rig));
    expect(rig.local.enrolCalls[0]).toMatchObject({ languageId: 'es', varietyId: 'es-HN', packId: 'pack:es' });
    expect(rig.q('#enrol-form .status').textContent).toContain('Spanish (Honduras)');
    // a different preference for the same language replaces the earlier one (its events stay under it); picking the same one twice adds nothing
    choose(variety, 'es-standard');
    submit(rig.q('#enrol-form'));
    await until(() => rig.local.enrolments.length === 2);
    await until(() => /General|Spanish/.test(rig.root.querySelector('#enrolments li')?.textContent ?? ''));
    expect(rig.local.enrolments.map((e) => [e.varietyId, !!e.endedAt])).toEqual([['es-HN', true], ['es-419', false]]);
    expect(rig.local.enrolCalls[1]).toMatchObject({ languageId: 'es', varietyId: 'es-419' }); // “General” is recorded as the pack’s general variety
    await until(() => done(rig));
    submit(rig.q('#enrol-form'));
    await flush(20);
    expect(rig.local.enrolments).toHaveLength(2);
    expect(rig.root.querySelectorAll('#enrolments li')).toHaveLength(1);
  });

  it('a planned pack cannot be chosen: the button is off and the reason is given', async () => {
    const rig = await makeRig(); // the default Spanish fake is planned
    expect(ES_FAKE.status).toBe('planned');
    await rig.go('language');
    choose(rig.q('#language'), 'es');
    expect(rig.q<HTMLButtonElement>('#enrol').disabled).toBe(true);
    expect(rig.q('#pack-info').textContent).toMatch(/planned, not installable/);
    submit(rig.q('#enrol-form'));
    await flush(10);
    expect(rig.local.enrolCalls).toHaveLength(0);
    expect(rig.q('#enrol-form .status').textContent).toMatch(/planned, not installable/);
  });

  it('signed in, the choice is also an enrolment on the account, and it becomes the account’s active one', async () => {
    const rig = await makeRig();
    await signIn(rig);
    await rig.go('language');
    choose(rig.q('#language'), 'sq');
    submit(rig.q('#enrol-form'));
    await until(() => done(rig));
    expect(rig.q('#enrol-form .status').textContent).toContain('on your account');
    expect(rig.local.enrolCalls).toHaveLength(1);
    expect(serverEnrols(rig)).toEqual([{ languageId: 'sq', varietyId: 'sq-standard', scriptId: 'Latn', packId: 'pack:sq', packVersion: '9', goals: [{ kind: 'reading' }] }]);
    expect(serverEnrols(rig)[0]).not.toHaveProperty('teamId');
    expect(await sessionOf(rig)).toMatchObject({ enrolmentId: rig.service.enrolments[0].enrolmentId, languageId: 'sq' });
  });

  it('when the account copy fails the device copy stands, and the screen says so', async () => {
    const rig = await makeRig();
    await signIn(rig);
    rig.service.sessions.clear(); // the session is no longer valid at the service
    await rig.go('language');
    choose(rig.q('#language'), 'sq');
    submit(rig.q('#enrol-form'));
    await until(() => done(rig));
    expect(rig.q('#enrol-form .status').textContent).toMatch(/Saved on this device; your account could not be updated/);
    expect(rig.local.enrolments).toHaveLength(1);
    expect(await choiceOf(rig)).toMatchObject({ languageId: 'sq' });
  });

  it('several languages may be active, and the list switches between them', async () => {
    const rig = await makeRig({ extension: true });
    fakeBackground(rig);
    await rig.go('language');
    choose(rig.q('#language'), 'sq');
    submit(rig.q('#enrol-form'));
    await until(() => done(rig));
    choose(rig.q('#language'), 'de');
    submit(rig.q('#enrol-form'));
    await until(() => rig.local.enrolments.length === 2);
    await until(() => rig.root.querySelectorAll('#enrolments li').length === 2);
    const [first, second] = rig.local.enrolments;
    expect((await choiceOf(rig))!.enrolmentId).toBe(second.enrolmentId);
    // the repository lives in the worker: the choice was made there (and so became the active one), and nothing was selected yet
    expect(rig.local.selected).toEqual([]);
    rig.q(`#enrolments li[data-enrolment="${first.enrolmentId}"] button`).click();
    await until(async () => (await choiceOf(rig))?.enrolmentId === first.enrolmentId);
    expect(await choiceOf(rig)).toMatchObject({ languageId: 'sq', packId: 'pack:sq' });
    expect(rig.local.selected).toEqual([first.enrolmentId]); // the worker is told to record against it
    await until(() => rig.root.querySelector(`#enrolments li[data-enrolment="${first.enrolmentId}"] .tag`));
  });

  it('where the on-device Repository is not available the choice is still kept, honestly', async () => {
    const rig = await makeRig({ local: false });
    await rig.go('language');
    choose(rig.q('#language'), 'sq');
    submit(rig.q('#enrol-form'));
    await until(() => done(rig));
    expect(await choiceOf(rig)).toMatchObject({ enrolmentId: 'local-enrolment:sq:sq-standard', languageId: 'sq', packId: 'pack:sq' });
    await until(() => rig.root.querySelector('#enrolments li'));
  });

  it('the language screen shows no team anywhere, signed in or not, with Norwegian and Spanish chosen', async () => {
    const rig = await makeRig({ packs: withSpanish() });
    await signIn(rig);
    for (const l of ['nb', 'es']) {
      await rig.go('language');
      choose(rig.q('#language'), l);
      if (l === 'nb') choose(rig.q('#variety'), 'nb');
      submit(rig.q('#enrol-form'));
      await until(() => done(rig));
      expect(rig.text()).not.toMatch(/team|leader/i);
    }
    expect(rig.root.querySelectorAll('#enrolments li')).toHaveLength(2);
  });
});

describe('Install the pack', () => {
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
    await rig.go('language');
    choose(rig.q('#language'), 'sq');
    submit(rig.q('#enrol-form'));
    await until(() => done(rig));
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

  it('shows the version, the licences and the CC BY-SA attribution of the installable pack, and puts the chosen language’s pack first', async () => {
    const rig = await makeRig();
    await rig.go('pack');
    const sq = rig.q('[data-pack="pack:sq"]');
    expect(sq.textContent).toContain('version 9');
    expect(sq.querySelector('.attribution')!.textContent).toBe('Wiktionary, via kaikki.org — CC BY-SA 4.0');
    expect(sq.textContent).toContain('CC BY-SA 4.0');
    expect(sq.textContent).toContain('review status: machine-drafted');
    expect(rig.text()).toMatch(/Choose your language/);
    await rig.go('language');
    choose(rig.q('#language'), 'nb');
    choose(rig.q('#variety'), 'nn');
    submit(rig.q('#enrol-form'));
    await until(() => done(rig));
    await rig.go('pack');
    expect(rig.root.querySelector('.pack')!.getAttribute('data-pack')).toBe('pack:nn');
  });
});

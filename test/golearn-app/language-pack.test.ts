// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { KEYS, type ActiveChoice, type Session } from '../../packages/golearn-extension/app/state';
import {
  ES_FAKE, ES_OK_FAKE, LANGUAGES_FAKE, cardOf, cardStatus, chooseOnWelcome, destroyRigs, failingInstall, fakeBackground, fakePacks, flush, makeRig, passingInstall,
  signIn, until, type Rig,
} from './helpers';

afterEach(() => destroyRigs());

const sessionOf = async (rig: Rig): Promise<Session | undefined> => (await rig.area.get(KEYS.session))[KEYS.session] as Session | undefined;
const choiceOf = async (rig: Rig): Promise<ActiveChoice | undefined> => (await rig.area.get(KEYS.choice))[KEYS.choice] as ActiveChoice | undefined;
const recordsOf = async (rig: Rig): Promise<Record<string, { version: string; ok: boolean }>> => ((await rig.area.get(KEYS.app))[KEYS.app] as { packs: Record<string, { version: string; ok: boolean }> } | undefined)?.packs ?? {};
const serverEnrols = (rig: Rig): Array<Record<string, unknown>> => rig.service.calls.filter((c) => c.method === 'enrol').map((c) => c.args[0] as Record<string, unknown>);
const withSpanish = () => { const p = fakePacks(); p.all = p.all.map((x) => (x.languageId === 'es' ? ES_OK_FAKE : x)); return p; };

describe('Welcome: choose your language', () => {
  it('shows the six languages from the catalogue in its order, each with what works, what does not, its level and its audio, and asks for no account', async () => {
    const rig = await makeRig();
    expect(rig.app.current()).toBe('welcome');
    expect(rig.q('#screen h1').textContent).toBe('Welcome');
    expect(rig.q('#choose-language h2').textContent).toBe('Choose your language');
    const cards = [...rig.root.querySelectorAll('#language-cards > .lang')];
    expect(cards.map((c) => c.getAttribute('data-language'))).toEqual(LANGUAGES_FAKE.map((l) => l.languageId));
    expect(cards.map((c) => c.querySelector('h3')!.firstChild!.textContent)).toEqual(['Norwegian', 'German', 'Albanian', 'Hindi', 'Thai', 'Spanish']);
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
    // free choice: no account is needed and no team is asked for; there is no separate install step and no language form any more
    expect(rig.text()).not.toMatch(/sign in first/i);
    expect(rig.root.querySelector('#team')).toBeNull();
    expect(rig.text()).not.toMatch(/team|leader/i);
    expect(rig.root.querySelector('#enrol-form, #language, #pack-info')).toBeNull();
    expect(rig.text()).not.toMatch(/Install the pack|Orientation/);
    expect(rig.root.querySelectorAll('[data-action="choose"]')).toHaveLength(6);
  });

  it('the card describes the pack as machine-drafted and not native-reviewed, and never says reviewed', async () => {
    const rig = await makeRig();
    const sq = rig.q('[data-language="sq"]');
    expect(sq.querySelector('.pack-info')!.textContent).toContain('machine-drafted, not native-reviewed');
    expect(sq.querySelector('.licences')!.textContent).toContain('Wiktionary, via kaikki.org — CC BY-SA 4.0');
    expect(sq.querySelector('.licences')!.textContent).toContain('CC BY-SA 4.0');
    await chooseOnWelcome(rig, 'sq');
    expect(rig.text()).not.toMatch(/(?<!not )native-reviewed|(?<!un)reviewed by a native/i);
  });

  it('choosing a language without an account makes a local enrolment and no server call, installs the pack and says it is ready', async () => {
    const rig = await makeRig();
    const said = await chooseOnWelcome(rig, 'sq');
    expect(said).toContain('Albanian is ready: 4 checks passed.');
    expect(said).toContain('Saved on this device');
    expect(rig.local.enrolCalls).toEqual([{ languageId: 'sq', varietyId: 'sq-standard', scriptId: 'Latn', packId: 'pack:sq', packVersion: '9', goals: [{ kind: 'reading' }] }]);
    expect(rig.local.enrolCalls[0]).not.toHaveProperty('teamId');
    expect(rig.service.calls.filter((c) => c.method === 'enrol')).toHaveLength(0);
    expect(rig.packs.installs.map((p) => p.packId)).toEqual(['pack:sq']);
    expect(await sessionOf(rig)).toBeUndefined();
    expect(await choiceOf(rig)).toEqual({ enrolmentId: rig.local.enrolments[0].enrolmentId, languageId: 'sq', varietyId: 'sq-standard', packId: 'pack:sq' });
    expect((await recordsOf(rig))['pack:sq']).toMatchObject({ version: '9', ok: true });
    // the list of languages, the card and the completion mark follow, and the page says what to do next
    await until(() => rig.root.querySelector('#enrolments li[data-language="sq"] .tag'));
    await until(() => rig.root.querySelector('.rail li[data-route="welcome"] .mark.done'));
    expect(rig.q('#enrolments li').textContent).toContain('Albanian');
    expect(rig.q('#enrolments li').textContent).toContain('reading now');
    expect(rig.q('#enrolments li').textContent).toContain('pack ready');
    expect(rig.q('#enrolments li').getAttribute('data-team')).toBeNull();
    expect(cardOf(rig, 'sq').getAttribute('data-state')).toBe('ready');
    expect(cardOf(rig, 'sq').querySelector('.installed')!.textContent).toMatch(/version 9, verified/);
    expect(rig.q('#next-note').textContent).toMatch(/Albanian is ready.*open a page in the language and switch on GoLearn Active in the extension popup/);
    expect(rig.q('#screen').textContent).toContain('Show the checks');
  });

  it('shows the progress while the pack installs', async () => {
    const rig = await makeRig();
    let release!: () => void;
    rig.packs.nextInstall = () => new Promise((resolve) => { release = () => resolve(passingInstall()); });
    cardOf(rig, 'sq').querySelector<HTMLButtonElement>('[data-action="choose"]')!.click();
    await until(() => /Installing Albanian/.test(cardStatus(rig, 'sq')));
    expect(cardOf(rig, 'sq').querySelector<HTMLProgressElement>('progress')!.hidden).toBe(false);
    expect(cardOf(rig, 'sq').querySelector('progress')).not.toBeNull();
    // while one install runs no card can start another
    expect(rig.q<HTMLButtonElement>('[data-language="de"] [data-action="choose"]').disabled).toBe(true);
    release();
    await until(() => /is ready/.test(cardStatus(rig, 'sq')));
    expect(cardOf(rig, 'sq').querySelector<HTMLProgressElement>('progress')!.hidden).toBe(true);
    expect(rig.q<HTMLButtonElement>('[data-language="de"] [data-action="choose"]').disabled).toBe(false);
  });

  it('a pack whose checks fail is reported honestly with the checks and a Retry button, and setup is not complete', async () => {
    const rig = await makeRig();
    rig.packs.nextInstall = failingInstall();
    const said = await chooseOnWelcome(rig, 'sq');
    expect(said).toMatch(/Albanian is chosen, but its pack did not pass verification: 1 of 4 checks failed/);
    expect(said).not.toMatch(/is ready/);
    const checks = [...rig.root.querySelectorAll('[data-language="sq"] .checks li')];
    expect(checks.map((c) => c.getAttribute('data-check'))).toEqual(['dictionary-manifest', 'sample-shard', 'case:v-librin', 'case:v-pine']);
    expect(checks.map((c) => c.getAttribute('data-ok'))).toEqual(['true', 'true', 'true', 'false']);
    expect(checks[3].textContent).toContain('the analyser gave pi');
    expect(rig.q('[data-language="sq"] .verify').getAttribute('data-ok')).toBe('false');
    expect(rig.q('[data-language="sq"] .status').getAttribute('data-kind')).toBe('error');
    expect((await recordsOf(rig))['pack:sq']).toMatchObject({ version: '9', ok: false });
    expect(cardOf(rig, 'sq').querySelector('.installed')!.textContent).toMatch(/version 9, verification failed/);
    expect(rig.root.querySelector('#next-note')).toBeNull();
    expect(rig.root.querySelector('.rail li[data-route="welcome"] .mark.done')).toBeNull();
    // Retry runs the install again; this time it passes
    rig.packs.nextInstall = passingInstall();
    rig.q('[data-language="sq"] [data-action="retry"]').click();
    await until(() => /Albanian is ready: 4 checks passed/.test(cardStatus(rig, 'sq')));
    expect(rig.root.querySelector('[data-language="sq"] [data-action="retry"]')).toBeNull();
    expect(rig.packs.installs).toHaveLength(2);
    expect(rig.local.enrolments).toHaveLength(1); // no second enrolment
    await until(() => rig.root.querySelector('.rail li[data-route="welcome"] .mark.done'));
    expect(rig.q('#next-note').textContent).toContain('GoLearn Active');
  });

  it('an installer that throws leaves the choice saved, says why, and offers Retry', async () => {
    const rig = await makeRig();
    rig.packs.nextInstall = async () => { throw new Error('disk full'); };
    const said = await chooseOnWelcome(rig, 'sq');
    expect(said).toMatch(/Albanian pack did not install: disk full/);
    expect(said).toContain('Your choice is saved');
    expect(await choiceOf(rig)).toMatchObject({ languageId: 'sq' });
    expect(rig.q<HTMLButtonElement>('[data-language="sq"] [data-action="choose"]').disabled).toBe(false);
    rig.packs.nextInstall = passingInstall();
    rig.q('[data-language="sq"] [data-action="retry"]').click();
    await until(() => /is ready/.test(cardStatus(rig, 'sq')));
  });

  it('choosing an installed language again does not install it twice; Re-verify and Reinstall are offered on the card', async () => {
    const rig = await makeRig();
    await chooseOnWelcome(rig, 'sq');
    expect(cardOf(rig, 'sq').querySelector('[data-action="choose"]')!.textContent).toBe('Use Albanian');
    const said = await chooseOnWelcome(rig, 'sq');
    expect(said).toContain('already installed and verified');
    expect(rig.packs.installs).toHaveLength(1);
    expect(rig.local.enrolments).toHaveLength(1);
    rig.q('[data-language="sq"] [data-action="verify"]').click();
    await until(() => rig.packs.verifies.length === 1);
    await until(() => /Verified Albanian/.test(cardStatus(rig, 'sq')));
    expect(rig.q('[data-language="sq"] .verify').textContent).toMatch(/all 1 checks passed/);
    rig.q('[data-language="sq"] [data-action="install"]').click();
    await until(() => rig.packs.installs.length === 2);
    await until(() => /is ready: 4 checks passed/.test(cardStatus(rig, 'sq')));
  });

  it('Norwegian asks for the written standard: nothing is preselected and nothing is guessed', async () => {
    const rig = await makeRig();
    const card = cardOf(rig, 'nb');
    const standard = card.querySelector<HTMLSelectElement>('select.variety')!;
    expect(standard.closest('label')!.textContent).toMatch(/Written standard/);
    expect(standard.value).toBe('');
    expect([...standard.options].map((o) => o.value)).toEqual(['', 'nb', 'nn']);
    expect([...standard.options].map((o) => o.textContent)).toEqual(['Choose the written standard…', 'Bokmål', 'Nynorsk']);
    expect(card.querySelector('.pack-info')!.textContent).toMatch(/Bokmål \(nb\) and Nynorsk \(nn\)/);
    const said = await chooseOnWelcome(rig, 'nb');
    expect(said).toMatch(/Bokmål \(nb\) and Nynorsk \(nn\)/);
    expect(rig.local.enrolCalls).toHaveLength(0);
    expect(rig.packs.installs).toHaveLength(0);
    const ready = await chooseOnWelcome(rig, 'nb', 'nn');
    expect(ready).toContain('Norwegian (Nynorsk) is ready');
    expect(rig.local.enrolCalls[0]).toMatchObject({ languageId: 'nn', varietyId: 'nn', packId: 'pack:nn' });
    expect(rig.packs.installs.map((p) => p.packId)).toEqual(['pack:nn']);
    expect(await choiceOf(rig)).toMatchObject({ languageId: 'nn', varietyId: 'nn', standard: 'nn', packId: 'pack:nn' });
  });

  it('Spanish offers a regional preference that may be left alone; Honduras is recorded as the variety', async () => {
    const rig = await makeRig({ packs: withSpanish() });
    rig.packs.nextInstall = passingInstall('2'); // the Spanish fake is version 2
    const card = cardOf(rig, 'es');
    const variety = card.querySelector<HTMLSelectElement>('select.variety')!;
    expect(variety.closest('label')!.textContent).toMatch(/Regional preference/);
    expect([...variety.options].map((o) => o.value)).toEqual(['es-standard', 'es-HN']);
    expect(variety.value).toBe('es-standard'); // optional: the general variety stands unless one is picked
    const said = await chooseOnWelcome(rig, 'es', 'es-HN');
    expect(rig.local.enrolCalls[0]).toMatchObject({ languageId: 'es', varietyId: 'es-HN', packId: 'pack:es' });
    expect(said).toContain('Spanish is ready');
    await until(() => /Spanish \(Honduras\)/.test(rig.root.querySelector('#enrolments li')?.textContent ?? ''));
    // a different preference for the same language replaces the earlier one (its events stay under it); picking the same one twice adds nothing
    await chooseOnWelcome(rig, 'es', 'es-standard');
    await until(() => rig.local.enrolments.length === 2);
    await until(() => /General|Spanish/.test(rig.root.querySelector('#enrolments li')?.textContent ?? ''));
    expect(rig.local.enrolments.map((e) => [e.varietyId, !!e.endedAt])).toEqual([['es-HN', true], ['es-419', false]]);
    expect(rig.local.enrolCalls[1]).toMatchObject({ languageId: 'es', varietyId: 'es-419' }); // “General” is recorded as the pack’s general variety
    await chooseOnWelcome(rig, 'es', 'es-standard');
    expect(rig.local.enrolments).toHaveLength(2);
    expect(rig.root.querySelectorAll('#enrolments li')).toHaveLength(1);
    expect(rig.packs.installs).toHaveLength(1); // the Spanish pack is installed once
  });

  it('a planned pack cannot be chosen: the button is off and the reason is given', async () => {
    const rig = await makeRig(); // the default Spanish fake is planned
    expect(ES_FAKE.status).toBe('planned');
    const card = cardOf(rig, 'es');
    expect(card.querySelector<HTMLButtonElement>('[data-action="choose"]')!.disabled).toBe(true);
    expect(card.querySelector('.pack-info')!.textContent).toMatch(/planned, not installable/);
    card.querySelector<HTMLButtonElement>('[data-action="choose"]')!.click();
    await flush(10);
    expect(rig.local.enrolCalls).toHaveLength(0);
    expect(rig.packs.installs).toHaveLength(0);
  });

  it('signed in, the choice is also an enrolment on the account, and it becomes the account’s active one', async () => {
    const rig = await makeRig();
    await signIn(rig);
    const said = await chooseOnWelcome(rig, 'sq');
    expect(said).toContain('Albanian is ready');
    expect(said).toContain('Saved on this device and on your account');
    expect(rig.local.enrolCalls).toHaveLength(1);
    expect(serverEnrols(rig)).toEqual([{ languageId: 'sq', varietyId: 'sq-standard', scriptId: 'Latn', packId: 'pack:sq', packVersion: '9', goals: [{ kind: 'reading' }] }]);
    expect(serverEnrols(rig)[0]).not.toHaveProperty('teamId');
    expect(await sessionOf(rig)).toMatchObject({ enrolmentId: rig.service.enrolments[0].enrolmentId, languageId: 'sq' });
  });

  it('when the account copy fails the device copy stands, the pack still installs, and the card says so', async () => {
    const rig = await makeRig();
    await signIn(rig);
    rig.service.sessions.clear(); // the session is no longer valid at the service
    const said = await chooseOnWelcome(rig, 'sq');
    expect(said).toMatch(/Saved on this device; your account could not be updated/);
    expect(said).toContain('Albanian is ready');
    expect(rig.local.enrolments).toHaveLength(1);
    expect(await choiceOf(rig)).toMatchObject({ languageId: 'sq' });
  });

  it('several languages may be chosen, and the list switches between them', async () => {
    const rig = await makeRig({ extension: true });
    fakeBackground(rig);
    await chooseOnWelcome(rig, 'sq');
    await chooseOnWelcome(rig, 'de');
    await until(() => rig.local.enrolments.length === 2);
    await until(() => rig.root.querySelectorAll('#enrolments li').length === 2);
    const [first, second] = rig.local.enrolments;
    expect((await choiceOf(rig))!.enrolmentId).toBe(second.enrolmentId);
    // the repository lives in the worker: the choice was made there (and so became the active one), and nothing was selected yet
    expect(rig.local.selected).toEqual([]);
    expect(cardOf(rig, 'de').getAttribute('data-active')).toBe('true');
    expect(cardOf(rig, 'sq').getAttribute('data-active')).toBe('false');
    rig.q(`#enrolments li[data-enrolment="${first.enrolmentId}"] button`).click();
    await until(async () => (await choiceOf(rig))?.enrolmentId === first.enrolmentId);
    expect(await choiceOf(rig)).toMatchObject({ languageId: 'sq', packId: 'pack:sq' });
    expect(rig.local.selected).toEqual([first.enrolmentId]); // the worker is told to record against it
    await until(() => rig.root.querySelector(`#enrolments li[data-enrolment="${first.enrolmentId}"] .tag`));
    await until(() => cardOf(rig, 'sq').getAttribute('data-active') === 'true');
  });

  it('where the on-device Repository is not available the choice is still kept, honestly', async () => {
    const rig = await makeRig({ local: false });
    const said = await chooseOnWelcome(rig, 'sq');
    expect(said).toContain('is ready');
    expect(await choiceOf(rig)).toMatchObject({ enrolmentId: 'local-enrolment:sq:sq-standard', languageId: 'sq', packId: 'pack:sq' });
    await until(() => rig.root.querySelector('#enrolments li'));
  });

  it('Welcome shows no team anywhere, signed in or not, with Norwegian and Spanish chosen', async () => {
    const rig = await makeRig({ packs: withSpanish() });
    await signIn(rig);
    await chooseOnWelcome(rig, 'nb', 'nb');
    expect(rig.text()).not.toMatch(/team|leader/i);
    await chooseOnWelcome(rig, 'es');
    expect(rig.text()).not.toMatch(/team|leader/i);
    expect(rig.root.querySelectorAll('#enrolments li')).toHaveLength(2);
  });
});

describe('the dictionary address (an advanced setting, under Diagnostics) and the install', () => {
  it('keeps the dictionary address in golearn:service (https or localhost only) and installs from it', async () => {
    const rig = await makeRig();
    await rig.go('diagnostics');
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
    const original = rig.packs.install.bind(rig.packs);
    rig.packs.install = async (pack, o) => { seen = o.baseUrl; return original(pack, o); };
    await chooseOnWelcome(rig, 'sq');
    expect(seen).toBe('https://files.example.org/app');
  });

  it('without a dictionary address the install uses this application’s own files', async () => {
    const rig = await makeRig({ config: { assetBaseUrl: 'https://app.example.org/golearn/' } });
    let seen = '';
    const original = rig.packs.install.bind(rig.packs);
    rig.packs.install = async (pack, o) => { seen = o.baseUrl; return original(pack, o); };
    await chooseOnWelcome(rig, 'sq');
    expect(seen).toBe('https://app.example.org/golearn/');
  });

  it('the pack check on Diagnostics lists packs and says how to update one: under its language on Welcome', async () => {
    const rig = await makeRig();
    await rig.go('diagnostics');
    expect(rig.q('#updates').textContent).toMatch(/Reinstall under its language on the Welcome page/);
    expect(rig.text()).not.toContain('Language pack screen');
  });

  it('lists the CC BY-SA attribution and the licences on the card of the installable pack', async () => {
    const rig = await makeRig();
    const sq = rig.q('[data-language="sq"]');
    expect(sq.querySelector('.attribution')!.textContent).toBe('Wiktionary, via kaikki.org — CC BY-SA 4.0');
    expect(sq.querySelector('.licences')!.textContent).toContain('Dictionary kaikki-sq');
    expect(sq.querySelector('.licences')!.textContent).toContain('Machine-drafted; no native speaker has checked it.');
  });
});

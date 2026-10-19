// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { computeCompletion, setupComplete } from '../../packages/golearn-extension/app/app';
import { KEYS, type ActiveChoice, type Session } from '../../packages/golearn-extension/app/state';
import {
  ES_FAKE, ES_OK_FAKE, LANGUAGES_FAKE, cardOf, cardStatus, downloadLanguage, destroyRigs, failingInstall, fakeBackground, fakePacks, flush, passingInstall,
  signIn, until, makeRig as baseRig, type Rig, type RigOptions,
} from './helpers';

afterEach(() => destroyRigs());

const sessionOf = async (rig: Rig): Promise<Session | undefined> => (await rig.area.get(KEYS.session))[KEYS.session] as Session | undefined;
const choiceOf = async (rig: Rig): Promise<ActiveChoice | undefined> => (await rig.area.get(KEYS.choice))[KEYS.choice] as ActiveChoice | undefined;
const recordsOf = async (rig: Rig): Promise<Record<string, { version: string; ok: boolean }>> => ((await rig.area.get(KEYS.app))[KEYS.app] as { packs: Record<string, { version: string; ok: boolean }> } | undefined)?.packs ?? {};
const serverEnrols = (rig: Rig): Array<Record<string, unknown>> => rig.service.calls.filter((c) => c.method === 'enrol').map((c) => c.args[0] as Record<string, unknown>);
/** These tests start on the languages page (the first page of a first run is the sign-in page). */
const makeRig = (o: RigOptions = {}): Promise<Rig> => baseRig({ startRoute: 'languages', ...o });
const rowsOf = (rig: Rig, languageId: string): HTMLElement[] => [...rig.root.querySelectorAll<HTMLElement>(`#language-cards [data-language="${languageId}"] .mine`)];
const withSpanish = () => { const p = fakePacks(); p.all = p.all.map((x) => (x.languageId === 'es' ? ES_OK_FAKE : x)); return p; };

describe('Languages: download your languages', () => {
  it('shows the seven languages (Latin last, since 2026-10-17) from the catalogue in its order, each with what works, what does not, its level and its audio, and asks for no account', async () => {
    const rig = await makeRig();
    expect(rig.app.current()).toBe('languages');
    expect(rig.q('#screen h1').textContent).toBe('Choose your languages');
    expect(rig.q('#languages h2').textContent).toBe('Languages');
    const cards = [...rig.root.querySelectorAll('#language-cards > .lang')];
    expect(cards.map((c) => c.getAttribute('data-language'))).toEqual(LANGUAGES_FAKE.map((l) => l.languageId));
    expect(cards.map((c) => c.querySelector('h3')!.firstChild!.textContent)).toEqual(['Norwegian', 'German', 'Albanian', 'Hindi', 'Thai', 'Spanish', 'Latin']);
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
    expect(rig.q('[data-language="la"]').textContent).toContain('Latn script');
    expect(rig.q('[data-language="la"]').textContent).toContain('experimental, seed-only');
    expect(rig.q('[data-language="la"] details.download > summary').textContent).toBe('Download language');
    // free choice: no account is needed and no team is asked for; there is no separate install step and no language form any more
    expect(rig.text()).not.toMatch(/sign in first/i);
    expect(rig.root.querySelector('#team')).toBeNull();
    expect(rig.text()).not.toMatch(/team|leader/i);
    expect(rig.root.querySelector('#enrol-form, #language, #pack-info')).toBeNull();
    expect(rig.text()).not.toMatch(/Install the pack|Orientation/);
    expect(rig.root.querySelectorAll('[data-action="choose"]')).toHaveLength(7);
    // each is a compact row with a “Download language” menu at the right; what works and what does not sit under a collapsed Details
    expect(cards.every((c) => c.tagName === 'LI')).toBe(true);
    expect(cards.map((c) => c.querySelector('details.download > summary')!.textContent)).toEqual(Array(7).fill('Download language'));
    expect(cards.every((c) => !(c.querySelector('details.about') as HTMLDetailsElement).open)).toBe(true);
    expect(albanian.querySelector('details.about > summary')!.textContent).toBe('Details');
    expect(albanian.querySelector('details.about')!.contains(albanian.querySelector('.works'))).toBe(true);
    expect(albanian.querySelector('details.about')!.contains(albanian.querySelector('.licences'))).toBe(true);
    expect(albanian.querySelector('.lang-level')!.textContent).toContain('reference pack, machine-drafted, unreviewed');
    expect(rig.q('#reader-link').getAttribute('href')).toBe('#/reader');
  });

  it('the card describes the pack as machine-drafted and not native-reviewed, and never says reviewed', async () => {
    const rig = await makeRig();
    const sq = rig.q('[data-language="sq"]');
    expect(sq.querySelector('.pack-info')!.textContent).toContain('machine-drafted, not native-reviewed');
    expect(sq.querySelector('.licences')!.textContent).toContain('Wiktionary, via kaikki.org — CC BY-SA 4.0');
    expect(sq.querySelector('.licences')!.textContent).toContain('CC BY-SA 4.0');
    await downloadLanguage(rig, 'sq');
    expect(rig.text()).not.toMatch(/(?<!not )native-reviewed|(?<!un)reviewed by a native/i);
  });

  it('choosing a language without an account makes a local enrolment and no server call, installs the pack and says it is ready', async () => {
    const rig = await makeRig();
    const said = await downloadLanguage(rig, 'sq');
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
    await until(() => rig.root.querySelector('[data-language="sq"] .mine .tag'));
    await until(() => rig.root.querySelector('#next-note'));
    expect(rowsOf(rig, 'sq')).toHaveLength(1);
    expect(rowsOf(rig, 'sq')[0].textContent).toContain('Reading now');
    expect(rowsOf(rig, 'sq')[0].textContent).toContain('Downloaded · ready');
    expect(rowsOf(rig, 'sq')[0].getAttribute('data-team')).toBeNull();
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
    await until(() => /Downloading Albanian/.test(cardStatus(rig, 'sq')));
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
    const said = await downloadLanguage(rig, 'sq');
    expect(said).toMatch(/Albanian is downloaded, but its pack did not pass verification: 1 of 4 checks failed/);
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
    expect(rowsOf(rig, 'sq')[0].textContent).toContain('Downloaded · did not verify');
    expect(setupComplete(await computeCompletion(rig.app.ctx))).toBe(false);
    // Retry runs the install again; this time it passes
    rig.packs.nextInstall = passingInstall();
    rig.q('[data-language="sq"] [data-action="retry"]').click();
    await until(() => /Albanian is ready: 4 checks passed/.test(cardStatus(rig, 'sq')));
    expect(rig.root.querySelector('[data-language="sq"] [data-action="retry"]')).toBeNull();
    expect(rig.packs.installs).toHaveLength(2);
    expect(rig.local.enrolments).toHaveLength(1); // no second enrolment
    await until(() => rig.root.querySelector('#next-note'));
    expect(rig.q('#next-note').textContent).toContain('GoLearn Active');
  });

  it('an installer that throws leaves the choice saved, says why, and offers Retry', async () => {
    const rig = await makeRig();
    rig.packs.nextInstall = async () => { throw new Error('disk full'); };
    const said = await downloadLanguage(rig, 'sq');
    expect(said).toMatch(/Albanian pack did not install: disk full/);
    expect(said).toContain('Your choice is saved');
    expect(await choiceOf(rig)).toMatchObject({ languageId: 'sq' });
    expect(rig.q<HTMLButtonElement>('[data-language="sq"] [data-action="choose"]').disabled).toBe(false);
    rig.packs.nextInstall = passingInstall();
    rig.q('[data-language="sq"] [data-action="retry"]').click();
    await until(() => /is ready/.test(cardStatus(rig, 'sq')));
  });

  it('downloading an installed language again does not install it twice; Re-verify and Reinstall are offered under Details', async () => {
    const rig = await makeRig();
    await downloadLanguage(rig, 'sq');
    expect(cardOf(rig, 'sq').querySelector('[data-action="choose"]')!.textContent).toBe('Use Albanian');
    const said = await downloadLanguage(rig, 'sq');
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
    const said = await downloadLanguage(rig, 'nb');
    expect(said).toMatch(/Bokmål \(nb\) and Nynorsk \(nn\)/);
    expect(rig.local.enrolCalls).toHaveLength(0);
    expect(rig.packs.installs).toHaveLength(0);
    const ready = await downloadLanguage(rig, 'nb', 'nn');
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
    const said = await downloadLanguage(rig, 'es', 'es-HN');
    expect(rig.local.enrolCalls[0]).toMatchObject({ languageId: 'es', varietyId: 'es-HN', packId: 'pack:es' });
    expect(said).toContain('Spanish is ready');
    await until(() => /Spanish \(Honduras\)/.test(rowsOf(rig, 'es')[0]?.textContent ?? ''));
    // a different preference for the same language replaces the earlier one (its events stay under it); picking the same one twice adds nothing
    await downloadLanguage(rig, 'es', 'es-standard');
    await until(() => rig.local.enrolments.length === 2);
    await until(() => rowsOf(rig, 'es').length === 1 && !/Honduras/.test(rowsOf(rig, 'es')[0].textContent ?? ''));
    expect(rig.local.enrolments.map((e) => [e.varietyId, !!e.endedAt])).toEqual([['es-HN', true], ['es-419', false]]);
    expect(rig.local.enrolCalls[1]).toMatchObject({ languageId: 'es', varietyId: 'es-419' }); // “General” is recorded as the pack’s general variety
    await downloadLanguage(rig, 'es', 'es-standard');
    expect(rig.local.enrolments).toHaveLength(2);
    expect(rowsOf(rig, 'es')).toHaveLength(1);
    expect(rig.packs.installs).toHaveLength(1); // the Spanish pack is installed once
  });

  it('a planned pack cannot be downloaded: the button is off and the reason is given', async () => {
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
    const said = await downloadLanguage(rig, 'sq');
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
    const said = await downloadLanguage(rig, 'sq');
    expect(said).toMatch(/Saved on this device; your account could not be updated/);
    expect(said).toContain('Albanian is ready');
    expect(rig.local.enrolments).toHaveLength(1);
    expect(await choiceOf(rig)).toMatchObject({ languageId: 'sq' });
  });

  it('several languages may be downloaded and all stay enabled; Use for reading switches between them', async () => {
    const rig = await makeRig({ extension: true });
    fakeBackground(rig);
    await downloadLanguage(rig, 'sq');
    await downloadLanguage(rig, 'de');
    await until(() => rig.local.enrolments.length === 2);
    await until(() => rowsOf(rig, 'sq').length === 1 && rowsOf(rig, 'de').length === 1);
    // both are downloaded and ready at once
    expect(rowsOf(rig, 'sq')[0].textContent).toContain('Downloaded · ready');
    expect(rowsOf(rig, 'de')[0].textContent).toContain('Downloaded · ready');
    expect(rig.packs.installs.map((x) => x.packId)).toEqual(['pack:sq', 'pack:de']);
    expect(rig.q('#next-note').textContent).toContain('German');
    const [first, second] = rig.local.enrolments;
    expect((await choiceOf(rig))!.enrolmentId).toBe(second.enrolmentId);
    // the repository lives in the worker: the choice was made there (and so became the active one), and nothing was selected yet
    expect(rig.local.selected).toEqual([]);
    expect(cardOf(rig, 'de').getAttribute('data-active')).toBe('true');
    expect(cardOf(rig, 'sq').getAttribute('data-active')).toBe('false');
    rig.q(`.mine[data-enrolment="${first.enrolmentId}"] [data-action="use"]`).click();
    await until(async () => (await choiceOf(rig))?.enrolmentId === first.enrolmentId);
    expect(await choiceOf(rig)).toMatchObject({ languageId: 'sq', packId: 'pack:sq' });
    expect(rig.local.selected).toEqual([first.enrolmentId]); // the worker is told to record against it
    await until(() => rig.root.querySelector(`.mine[data-enrolment="${first.enrolmentId}"] .tag`));
    expect(rig.q(`.mine[data-enrolment="${first.enrolmentId}"] .tag`).textContent).toBe('Reading now');
    expect(rig.root.querySelector(`.mine[data-enrolment="${second.enrolmentId}"] .tag`)).toBeNull();
    await until(() => cardOf(rig, 'sq').getAttribute('data-active') === 'true');
  });

  it('where the on-device Repository is not available the choice is still kept, honestly', async () => {
    const rig = await makeRig({ local: false });
    const said = await downloadLanguage(rig, 'sq');
    expect(said).toContain('is ready');
    expect(await choiceOf(rig)).toMatchObject({ enrolmentId: 'local-enrolment:sq:sq-standard', languageId: 'sq', packId: 'pack:sq' });
    await until(() => rowsOf(rig, 'sq').length === 1);
  });

  it('the languages page shows no team anywhere, signed in or not, with Norwegian and Spanish chosen', async () => {
    const rig = await makeRig({ packs: withSpanish() });
    await signIn(rig);
    await downloadLanguage(rig, 'nb', 'nb');
    expect(rig.text()).not.toMatch(/team|leader/i);
    await downloadLanguage(rig, 'es');
    expect(rig.text()).not.toMatch(/team|leader/i);
    expect(rig.root.querySelectorAll('#language-cards .mine')).toHaveLength(2);
  });

  it('Remove ends the device enrolment, keeps the other languages, and hands “Reading now” to the next one', async () => {
    const rig = await makeRig();
    await downloadLanguage(rig, 'sq');
    await downloadLanguage(rig, 'de');
    const [sqEnrolment, deEnrolment] = rig.local.enrolments;
    expect((await choiceOf(rig))!.enrolmentId).toBe(deEnrolment.enrolmentId);
    rig.q('[data-language="de"] .mine [data-action="remove"]').click();
    await until(() => rowsOf(rig, 'de').length === 0);
    expect(rig.local.enrolments.map((e) => [e.languageId, !!e.endedAt])).toEqual([['sq', false], ['de', true]]);
    expect((await choiceOf(rig))!.enrolmentId).toBe(sqEnrolment.enrolmentId);
    expect(rig.q('[data-language="sq"] .mine .tag').textContent).toBe('Reading now');
    // the row offers the download again, and what was removed says so
    expect(rig.q('[data-language="de"] details.download').hasAttribute('hidden')).toBe(false);
    expect(cardStatus(rig, 'de')).toContain('German is removed from this device');
    rig.q('[data-language="sq"] .mine [data-action="remove"]').click();
    await until(() => rowsOf(rig, 'sq').length === 0);
    expect(await choiceOf(rig)).toBeUndefined();
    expect(rig.root.querySelector('#next-note')).toBeNull();
  });

  it('a downloaded language whose pack did not install keeps a Retry on its row after the page is opened again', async () => {
    const rig = await makeRig();
    rig.packs.nextInstall = async () => { throw new Error('offline'); };
    await downloadLanguage(rig, 'sq');
    await rig.go('settings');
    await rig.go('languages');
    expect(rowsOf(rig, 'sq')[0].textContent).toContain('Download not finished');
    expect(rig.root.querySelector('[data-language="sq"] [data-action="retry"]')).not.toBeNull();
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
    await downloadLanguage(rig, 'sq');
    expect(seen).toBe('https://files.example.org/app');
  });

  it('without a dictionary address the install uses this application’s own files', async () => {
    const rig = await makeRig({ config: { assetBaseUrl: 'https://app.example.org/golearn/' } });
    let seen = '';
    const original = rig.packs.install.bind(rig.packs);
    rig.packs.install = async (pack, o) => { seen = o.baseUrl; return original(pack, o); };
    await downloadLanguage(rig, 'sq');
    expect(seen).toBe('https://app.example.org/golearn/');
  });

  it('the pack check on Diagnostics lists packs and says how to update one: under Details on its language on the Languages page', async () => {
    const rig = await makeRig();
    await rig.go('diagnostics');
    expect(rig.q('#updates').textContent).toMatch(/Reinstall under Details on its language on the Languages page/);
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

describe('the dictionary is found per language: the dictionary address, then this application\'s own files, then the hosted copy', () => {
  const OWN = 'https://app.example.org/golearn/';
  const HOSTED = 'https://hosted.example.org/go-v0';
  const config = { assetBaseUrl: OWN, dictionaryFallbackUrl: HOSTED };
  /** A fetch that answers 200 for the manifest of the given bases only. */
  const answering = (...bases: string[]) => {
    const asked: string[] = [];
    const fn = (async (input: RequestInfo | URL) => {
      const u = String(input);
      asked.push(u);
      return new Response('{}', { status: bases.some((b) => u === `${b.replace(/\/+$/, '')}/dict/sq/manifest.json`) ? 200 : 404 });
    }) as typeof fetch;
    return { fn, asked };
  };
  const seenBase = (rig: Rig): { value: string } => {
    const seen = { value: '' };
    const original = rig.packs.install.bind(rig.packs);
    rig.packs.install = async (pack, o) => { seen.value = o.baseUrl; return original(pack, o); };
    return seen;
  };

  it('falls back to the hosted copy when neither the dictionary address nor the application\'s own files have the language, and says so', async () => {
    const rig = await makeRig({ config });
    const f = answering(HOSTED);
    rig.deps.fetch = f.fn;
    const seen = seenBase(rig);
    const said = await downloadLanguage(rig, 'sq');
    expect(seen.value).toBe(HOSTED);
    expect(said).toMatch(/Albanian is ready: \d+ checks passed, dictionary from the hosted copy\./);
    expect(f.asked).toEqual([`${OWN}dict/sq/manifest.json`, `${HOSTED}/dict/sq/manifest.json`]);
  });

  it('prefers the application\'s own files over the hosted copy when they answer', async () => {
    const rig = await makeRig({ config });
    rig.deps.fetch = answering(OWN, HOSTED).fn;
    const seen = seenBase(rig);
    const said = await downloadLanguage(rig, 'sq');
    expect(seen.value).toBe(OWN);
    expect(said).toMatch(/dictionary from this application’s own files\./);
  });

  it('prefers the learner\'s dictionary address over both', async () => {
    const rig = await makeRig({ config });
    await rig.area.set({ [KEYS.service]: { baseUrl: 'http://127.0.0.1:8790', assetBase: 'https://files.example.org/app' } });
    rig.deps.fetch = answering('https://files.example.org/app', OWN, HOSTED).fn;
    const seen = seenBase(rig);
    const said = await downloadLanguage(rig, 'sq');
    expect(seen.value).toBe('https://files.example.org/app');
    expect(said).toMatch(/dictionary from your dictionary address\./);
  });

  it('when no place answers the install runs against the application\'s own files, as before, and reports the honest failure', async () => {
    const rig = await makeRig({ config });
    rig.deps.fetch = answering().fn;
    const seen = seenBase(rig);
    const said = await downloadLanguage(rig, 'sq');
    expect(seen.value).toBe(OWN);
    expect(said).not.toMatch(/dictionary from/);
  });

  it('a pack that declares no dictionary (Norwegian) is installed as before, with nothing probed', async () => {
    const rig = await makeRig({ config });
    rig.packs.all = rig.packs.all.map((x) => (x.languageId === 'nb' ? { ...x, manifest: { lexical: {} } } : x));
    const f = answering(HOSTED);
    rig.deps.fetch = f.fn;
    const seen = seenBase(rig);
    const said = await downloadLanguage(rig, 'nb', 'nb');
    expect(seen.value).toBe(OWN);
    expect(f.asked).toEqual([]);
    expect(said).not.toMatch(/dictionary from/);
  });

  it('Diagnostics says, per downloaded language, where meanings are read from and whether that place answers', async () => {
    const rig = await makeRig({ config });
    rig.deps.fetch = answering(HOSTED).fn;
    await downloadLanguage(rig, 'sq');
    await rig.go('diagnostics');
    await until(() => !!rig.root.querySelector('#dict-list li[data-language="sq"]'));
    const li = rig.q('#dict-list li[data-language="sq"]');
    expect(li.getAttribute('data-source')).toBe('hosted');
    expect(li.textContent).toBe(`Albanian: meanings are read from the hosted copy, ${HOSTED}. It answers.`);
    expect(rig.q('#dict-h').closest('section')!.textContent).toMatch(/first of three places/);
    expect(rig.q<HTMLTextAreaElement>('#report').value).toContain(`sq: read from hosted ${HOSTED}, answers`);
  });

  it('Diagnostics says plainly when no place answers', async () => {
    const rig = await makeRig({ config });
    rig.deps.fetch = answering().fn;
    await downloadLanguage(rig, 'sq');
    await rig.go('diagnostics');
    await until(() => !!rig.root.querySelector('#dict-list li[data-language="sq"]'));
    const li = rig.q('#dict-list li[data-language="sq"]');
    expect(li.getAttribute('data-ok')).toBe('false');
    expect(li.textContent).toMatch(/Albanian: no dictionary location answers \(.*the hosted copy .* does not answer\)/);
  });
});

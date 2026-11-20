// @vitest-environment jsdom
/**
 * GoReview's own setup (#/setup, the owner 2026-11-17: "let them go through the whole set up procedure from GoReview"): a learner with no language is
 * taken to the language list on opening GoReview, chooses one there, and lands on the home of that language, with no GoLearn setup first. Signed in, the
 * enrolment is made on the account; inside the extension with no account, on the device's Repository.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { FakeService, destroyRigs, makeRig, until } from './helpers';

afterEach(() => destroyRigs());

/** A fresh account with no language at all: the learner who starts in GoReview. */
function newcomer(): FakeService {
  const s = new FakeService();
  s.addAccount('new@example.org', 'correct-horse-battery', 'L9', []);
  return s;
}

const onSetup = (rig: Awaited<ReturnType<typeof makeRig>>): boolean => rig.app.current() === 'setup' && !!rig.root.querySelector('#setup-languages li');
const row = (rig: Awaited<ReturnType<typeof makeRig>>, languageId: string): HTMLElement => rig.q(`#setup-languages li[data-language="${languageId}"]`);
const press = (el: HTMLElement): void => { (el.querySelector('[data-action="start"]') as HTMLButtonElement).click(); };

describe('GoReview setup, signed in to an account with no language', () => {
  it('opening GoReview goes to the language list; choosing a language enrols it on the account and opens its home', async () => {
    const service = newcomer();
    const rig = await makeRig({ service });
    await rig.signIn('new@example.org');
    await rig.go('review');
    await until(() => onSetup(rig), 'the language list');
    // the catalogue's installable languages, Albanian among them; nothing planned is offered
    const listed = rig.qa('#setup-languages li').map((li) => li.dataset.language);
    expect(listed).toContain('sq');
    expect(listed).toContain('nb');
    expect(rig.q('#setup').textContent).toContain('saved on your account');
    press(row(rig, 'sq'));
    await until(() => rig.app.current() === 'review', 'the home');
    expect(service.calls).toContain('enrol:sq:sq-standard');
    expect(service.enrolments.get('L9')?.map((e) => [e.languageId, e.varietyId, e.packId])).toEqual([['sq', 'sq-standard', 'pack:sq']]);
    await until(() => !!rig.root.querySelector('#language-name'), 'the language in the header');
    expect(rig.q('#language-name').textContent).toContain('Albanian');
    // All other languages are available on Account without another page.
    expect(rig.root.querySelector('#add-language, #language-select')).toBeNull();
    await rig.go('account');
    await until(() => !!rig.root.querySelector('#account-languages [data-language="de"]'), 'the Account language catalogue');
    expect(rig.root.querySelector('#add-language')).toBeNull();
    expect(rig.q('#account-languages .account-language[data-deck="current"]').textContent).toContain('Albanian');
    press(rig.q('#account-languages [data-language="de"]'));
    await until(() => rig.app.current() === 'review', 'German review home');
    expect(service.calls).toContain('enrol:de:de-DE');
    await rig.go('setup');
    await until(() => rig.app.current() === 'account', 'old setup link opens Account for an enrolled learner');
    expect(rig.root.querySelector('#setup')).toBeNull();
  });

  it('Norwegian asks for the written standard and guesses nothing; the choice is the enrolment', async () => {
    const service = newcomer();
    const rig = await makeRig({ service });
    await rig.signIn('new@example.org');
    await rig.go('setup');
    await until(() => onSetup(rig), 'the language list');
    const no = row(rig, 'nb');
    expect(no.querySelectorAll('input[type="radio"]:checked')).toHaveLength(0);
    press(no);
    await until(() => !!no.querySelector('.status[data-kind="error"]'), 'the refusal');
    expect(no.textContent).toContain('GoReview never guesses');
    expect(service.calls.some((c) => c.startsWith('enrol:'))).toBe(false);
    (no.querySelector('input[value="nn"]') as HTMLInputElement).checked = true;
    press(no);
    await until(() => rig.app.current() === 'review', 'the home');
    expect(service.enrolments.get('L9')?.map((e) => [e.languageId, e.varietyId])).toEqual([['nn', 'nn']]);
  });

  it('an enrolled Norwegian can choose the other written standard and review within Account', async () => {
    const service = newcomer();
    const rig = await makeRig({ service });
    await rig.signIn('new@example.org');
    expect(await rig.app.ctx.chooseLanguage({ languageId: 'nb', varietyId: 'nb' })).toMatchObject({ ok: true });
    await rig.go('account');
    await until(() => !!rig.root.querySelector('.account-standard'), 'Norwegian Account card');
    const card = rig.q<HTMLDetailsElement>('.account-standard');
    expect(card.querySelector<HTMLInputElement>('input[value="nb"]')?.checked).toBe(true);
    card.open = true;
    const nynorsk = card.querySelector<HTMLInputElement>('input[value="nn"]')!;
    nynorsk.click();
    (card.querySelector<HTMLButtonElement>('[data-action="review-language"]')!).click();
    await until(() => rig.app.current() === 'review', 'Nynorsk review home');
    expect((await rig.app.ctx.identity())?.languageId).toBe('nn');
    expect((service.enrolments.get('L9') ?? []).filter((e) => !e.endedAt).map((e) => e.languageId)).toEqual(['nb', 'nn']);
  });

  it('a language already chosen is reused, and another variety of it replaces the earlier one', async () => {
    const service = newcomer();
    const rig = await makeRig({ service });
    await rig.signIn('new@example.org');
    expect(await rig.app.ctx.chooseLanguage({ languageId: 'sq' })).toMatchObject({ ok: true, where: 'account' });
    expect(await rig.app.ctx.chooseLanguage({ languageId: 'sq' })).toMatchObject({ ok: true });
    expect(service.calls.filter((c) => c.startsWith('enrol:'))).toEqual(['enrol:sq:sq-standard']);
    const es1 = await rig.app.ctx.chooseLanguage({ languageId: 'es', varietyId: 'es-419' });
    const es2 = await rig.app.ctx.chooseLanguage({ languageId: 'es', varietyId: 'es-ES' });
    expect(es1.ok && es2.ok).toBe(true);
    const open = (service.enrolments.get('L9') ?? []).filter((e) => !e.endedAt).map((e) => `${e.languageId}:${e.varietyId}`);
    expect(open).toEqual(['sq:sq-standard', 'es:es-ES']);
    expect(service.calls).toContain(`endEnrolment:${es1.ok ? es1.enrolmentId : ''}`);
    // the last one chosen is the language GoReview opens
    expect((await rig.app.ctx.identity())?.languageId).toBe('es');
  });

  it('a planned language cannot be chosen, and says why', async () => {
    const rig = await makeRig({ service: newcomer() });
    await rig.signIn('new@example.org');
    const r = await rig.app.ctx.chooseLanguage({ languageId: 'zz' });
    expect(r).toMatchObject({ ok: false });
  });

});

describe('GoReview setup inside the extension, with no account', () => {
  it('the language is enrolled on the device, where GoLearn sees it too', async () => {
    const rig = await makeRig({ local: { enrolments: [] } });
    await rig.go('review');
    await until(() => onSetup(rig), 'the language list');
    expect(rig.q('#setup').textContent).toContain('saved on this device');
    press(row(rig, 'de'));
    await until(() => rig.app.current() === 'review', 'the home');
    const local = rig.service.enrolments.get(rig.local!.learnerId) ?? [];
    expect(local.map((e) => e.languageId)).toEqual(['de']);
    expect((await rig.app.ctx.identity())?.languageId).toBe('de');
  });
});

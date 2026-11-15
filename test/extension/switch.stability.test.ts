// @vitest-environment jsdom
/**
 * GoLearn's language must not depend on the service answering (2026-11-08, the owner: "a hard time loading the language, switching the
 * language, and then … it often fails to work"; signed in; "Nothing happens", "Stuck message"). Measured before the fix, signed in with a
 * slow or hanging service: the popup took 2.6 s to list the languages, a switch sat on "Switching to …" for 18–42 s, and when the service
 * hung the account's old language undid the switch. Here the service never answers at all, and everything below must still be prompt.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { createRig, type Rig } from './rig';

/** Settles `p`, or fails the test when it takes longer than `ms` (the old code waited 2.5 s and more on a hanging service). */
const within = async <T>(p: Promise<T>, ms = 1000): Promise<T> => {
  let t: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => { t = setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms); });
  try { return await Promise.race([p, late]); } finally { clearTimeout(t); }
};

async function signedInWithTwoLanguages(): Promise<Rig> {
  const rig = createRig();
  await rig.signUp();
  await rig.connect();
  await rig.fireTimers();
  // German chosen on the account (as the hosted setup app does) and downloaded on this device; Albanian is the account's first enrolment
  expect((await rig.page({ type: MSG.enrol, languageId: 'de', packId: 'pack:de', packVersion: '1', goals: [{ kind: 'reading' }] })).ok).toBe(true);
  expect(await rig.page({ type: MSG.localRepo, op: 'enrol', languageId: 'sq', packId: 'pack:sq', packVersion: '1' })).toMatchObject({ ok: true });
  expect(await rig.page({ type: MSG.localRepo, op: 'enrol', languageId: 'de', packId: 'pack:de', packVersion: '1' })).toMatchObject({ ok: true });
  expect(await rig.page({ type: MSG.useLanguage, languageId: 'sq' })).toMatchObject({ ok: true });
  await rig.page({ type: MSG.status }); // online: the account's languages are read and kept
  return rig;
}

describe('signed in, with a service that never answers', () => {
  it('the switch answers at once and holds: the page reads in the new language, then back again', async () => {
    const rig = await signedInWithTwoLanguages();
    rig.hanging.value = true;
    const to = await within(rig.page({ type: MSG.useLanguage, languageId: 'de' })) as { ok: boolean; languageId?: string };
    expect(to).toMatchObject({ ok: true, languageId: 'de' });
    expect((await within(rig.content({ type: MSG.status })) as { languageId: string }).languageId).toBe('de');
    const back = await within(rig.page({ type: MSG.useLanguage, languageId: 'sq' })) as { ok: boolean };
    expect(back.ok).toBe(true);
    expect((await within(rig.content({ type: MSG.status })) as { languageId: string }).languageId).toBe('sq');
  });

  it('the device\'s choice wins over the account\'s enrolment in what pages read in', async () => {
    const rig = await signedInWithTwoLanguages();
    rig.offline.value = true; // the account cannot follow the switch at all
    expect(await rig.page({ type: MSG.useLanguage, languageId: 'de' })).toMatchObject({ ok: true });
    expect((await rig.content({ type: MSG.status }) as { languageId: string }).languageId).toBe('de');
    rig.offline.value = false;
    expect((await rig.content({ type: MSG.status }) as { languageId: string }).languageId).toBe('de');
  });

  it('the popup lists the account\'s languages from the kept copy without waiting on the service', async () => {
    const rig = await signedInWithTwoLanguages();
    rig.hanging.value = true;
    const s = await within(rig.page({ type: MSG.status }), 800) as { chosenLanguages: string[]; accountLanguagesFresh: boolean };
    expect(s.chosenLanguages).toEqual(expect.arrayContaining(['sq', 'de']));
    expect(s.accountLanguagesFresh).toBe(true);
  });

  it('a language on the account only, with nothing kept and no answer, is still refused with the setup line rather than hanging', async () => {
    const rig = await signedInWithTwoLanguages();
    await rig.fake.storage.local.remove('golearn:account-languages');
    rig.offline.value = true;
    const r = await within(rig.page({ type: MSG.useLanguage, languageId: 'hi' }), 4000) as { ok: boolean; message?: string };
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Download it in GoLearn setup first/);
  });
});

describe('the content script after GoLearn was reloaded or updated', () => {
  const g = globalThis as unknown as Record<string, unknown>;
  let install: (chromeApi: unknown, doc: Document) => Promise<unknown>;
  beforeAll(async () => {
    g.__GOLEARN_NO_AUTOINSTALL = true;
    install = (await import('../../packages/golearn-extension/src/content/index')).install as typeof install;
  });
  afterEach(() => {
    const marker = g.__goLearnExtension as { controller: { dispose(): void }; active: { stop(): void } } | undefined;
    marker?.active.stop(); marker?.controller.dispose();
    delete g.__goLearnExtension;
  });

  it('a second injection reuses a live copy, but replaces one whose extension context is gone', async () => {
    delete g.__goLearnExtension;
    const rig = createRig();
    const first = rig.fake.contentChrome(7);
    const a = await install(first, document);
    expect(await install(first, document)).toBe(a); // injected twice by the same GoLearn: one copy, no stacked listeners
    (first.runtime as { id?: string }).id = undefined; // the extension reloaded: the old copy is orphaned
    const b = await install(rig.fake.contentChrome(7), document);
    expect(b).toBeDefined();
    expect(b).not.toBe(a);
    expect(await install(rig.fake.contentChrome(7), document)).toBe(b);
  });
});

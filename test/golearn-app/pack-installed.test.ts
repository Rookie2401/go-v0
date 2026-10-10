// @vitest-environment jsdom
/**
 * The setup page's installer records a `PackInstalled` (contract v3): which pack and analyser, how far the pack is built (`level`,
 * from `levelOf`) and how far its analysis is validated (`validation`, from `validationOf`; `incomplete` when a validation case did
 * not match at install). A failed install, a planned pack and a verification alone record nothing.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { validateEvent, type GoEvent } from '../../packages/repository-contract/src';
import { createPackBindings } from '../../packages/golearn-extension/app/bindings';
import { packInstalledEvent } from '../../packages/golearn-extension/app/packEvent';
import { EVENT_KEY_PREFIX } from '../../packages/golearn-extension/src/store';
import { PACKS, levelOf, validationOf } from '../../packages/language-packs/src';
import { SQ_FAKE, destroyRigs, fakeBackground, flush, makeRig, until, type Rig } from './helpers';

afterEach(() => destroyRigs());

const installed = async (rig: Rig): Promise<GoEvent[]> =>
  Object.entries(await rig.area.get(null)).filter(([k]) => k.startsWith(EVENT_KEY_PREFIX)).map(([, v]) => v as GoEvent).filter((e) => e.kind === 'PackInstalled');

describe('the installer records PackInstalled', () => {
  it('a passing install of an installable, machine-drafted pack: level installable, validation unreviewed, with the analyser', async () => {
    const rig = await makeRig();
    rig.packs.nextInstall = { ok: true, version: '9', checks: [{ id: 'dictionary-manifest', label: 'Dictionary description', ok: true }] };
    await rig.go('pack');
    rig.q('[data-pack="pack:sq"] [data-action="install"]').click();
    await until(() => rig.root.querySelector('[data-pack="pack:sq"] .verify[data-ok="true"]'));
    const [ev, ...rest] = await installed(rig);
    expect(rest).toEqual([]);
    expect(ev.payload).toEqual({ packId: 'pack:sq', packVersion: '9', analyzerId: 'adapter-sq@9', analyzerVersion: '9', level: 'installable', validation: 'unreviewed' });
    expect(ev.languageId).toBe('sq');
    expect(ev.producer).toMatchObject({ app: 'golearn-app', surface: 'pack' });
    expect(validateEvent(ev), JSON.stringify(ev)).toEqual([]);
  });

  it('an install whose validation case did not match is recorded as incomplete, never with the manifest’s more hopeful word', async () => {
    const rig = await makeRig(); // the default fake install has one failing case
    await rig.go('pack');
    rig.q('[data-pack="pack:sq"] [data-action="install"]').click();
    await until(() => rig.root.querySelector('[data-pack="pack:sq"] .verify'));
    const [ev] = await installed(rig);
    expect(ev.payload).toMatchObject({ packId: 'pack:sq', level: 'installable', validation: 'incomplete' });
    expect(validateEvent(ev)).toEqual([]);
  });

  it('an install that did not complete (no version) records nothing, and neither does a verification alone', async () => {
    const rig = await makeRig();
    rig.packs.nextInstall = { ok: false, message: 'fetch_failed: offline', checks: [{ id: 'fetch_failed', label: 'The install stopped (fetch_failed)', ok: false }] };
    await rig.go('pack');
    rig.q('[data-pack="pack:sq"] [data-action="install"]').click();
    await until(() => rig.root.querySelector('[data-pack="pack:sq"] .verify'));
    await flush(10);
    expect(await installed(rig)).toEqual([]);
    rig.q('[data-pack="pack:sq"] [data-action="verify"]').click();
    await until(() => rig.packs.verifies.length === 1);
    await flush(10);
    expect(await installed(rig)).toEqual([]);
  });

  it('inside the extension the event goes to the background worker, as the extension’s own producer', async () => {
    const rig = await makeRig({ extension: true });
    const bg = fakeBackground(rig);
    rig.packs.nextInstall = { ok: true, version: '9', checks: [{ id: 'dictionary-manifest', label: 'Dictionary description', ok: true }] };
    await rig.go('pack');
    rig.q('[data-pack="pack:sq"] [data-action="install"]').click();
    await until(() => bg.recorded.some((e) => e.kind === 'PackInstalled'));
    expect(bg.recorded.find((e) => e.kind === 'PackInstalled')).toMatchObject({ producer: { app: 'golearn-ext', surface: 'pack' }, payload: { packId: 'pack:sq', level: 'installable', validation: 'unreviewed' } });
  });
});

describe('level and validation come from the manifest', () => {
  it('every real pack: the view says what levelOf and validationOf say', () => {
    for (const view of createPackBindings().packs()) {
      const m = PACKS[view.languageId];
      expect(view.level, view.packId).toBe(levelOf(m));
      expect(view.validation, view.packId).toBe(validationOf(m));
      expect(view.analyzerId, view.packId).toBe(m.analyzer.id);
      expect(view.analyzerVersion, view.packId).toBe(m.analyzer.version);
    }
  });

  it('the documented mapping: installable + machine-drafted = unreviewed, experimental = experimental (planned = unsupported is the event builder’s case below)', () => {
    const view = (lang: string) => createPackBindings().packFor(lang)!;
    expect(view('sq')).toMatchObject({ level: 'installable', validation: 'unreviewed' });
    for (const lang of ['de', 'hi', 'th', 'nb', 'nn']) expect(view(lang), lang).toMatchObject({ level: 'experimental', validation: 'experimental' });
  });

  it('the event builder: experimental and planned packs keep their own word; a failed case only ever lowers an installable one', () => {
    const base = { learnerId: 'l', enrolmentId: 'e', deviceId: 'd', appVersion: '1', at: '2026-10-09T10:00:00.000Z', eventId: 'ev-1', inExtension: false } as const;
    const experimental = { ...SQ_FAKE, packId: 'pack:de', languageId: 'de', level: 'experimental' as const, validation: 'experimental' as const, analyzerId: 'adapter-de@4', analyzerVersion: '4' };
    expect(packInstalledEvent({ ...base, pack: experimental, validationFailed: false }).payload).toMatchObject({ level: 'experimental', validation: 'experimental' });
    expect(packInstalledEvent({ ...base, pack: experimental, validationFailed: true }).payload).toMatchObject({ level: 'experimental', validation: 'incomplete' });
    const planned = { ...SQ_FAKE, level: 'planned' as const, validation: 'unsupported' as const };
    expect(packInstalledEvent({ ...base, pack: planned, validationFailed: true }).payload).toMatchObject({ level: 'planned', validation: 'unsupported' });
    expect(validateEvent(packInstalledEvent({ ...base, pack: experimental, validationFailed: false }))).toEqual([]);
  });
});

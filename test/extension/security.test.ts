// @vitest-environment node
/**
 * The privileged side's gate: who may send which message, what a content script can learn, what the background
 * refuses to record, and that remote data is treated as data.
 */
import { describe, expect, it } from 'vitest';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { buildAssistanceEvent, buildSelectionEvent, PENDING_IDENTITY } from '../../packages/golearn-extension/src/store';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { createRig, pendingEvent, SERVICE } from './rig';

const FOREIGN = { id: 'some-other-extension', tab: { id: 7 }, url: 'https://example.test/' };

describe('message senders', () => {
  it('a message from another extension, or with no sender id, is refused and does nothing', async () => {
    const rig = createRig();
    await rig.signUp();
    for (const type of [MSG.record, MSG.status, MSG.settings, MSG.profile, MSG.gloss, MSG.connect, MSG.getState]) {
      expect(await rig.fake.dispatch({ type, event: pendingEvent(), baseUrl: SERVICE, tabId: 7 }, FOREIGN), type).toEqual({ ok: false, error: 'forbidden' });
      expect(await rig.fake.dispatch({ type, event: pendingEvent() }, { tab: { id: 7 }, url: 'https://example.test/' }), type).toEqual({ ok: false, error: 'forbidden' });
    }
    expect(rig.log).toEqual([]);
    expect(Object.keys(await rig.fake.local.get(null)).filter((k) => k.startsWith('golearn:event:'))).toHaveLength(0);
  });

  it('a sender that is neither an extension page nor a tab is refused', async () => {
    const rig = createRig();
    expect(await rig.fake.dispatch({ type: MSG.status }, { id: 'test-ext-id' })).toEqual({ ok: false, error: 'forbidden' });
    // a document that merely names the extension in its path is not an extension page
    expect(await rig.fake.dispatch({ type: MSG.connect, baseUrl: SERVICE }, { id: 'test-ext-id', tab: { id: 1 }, url: 'https://evil.test/chrome-extension://test-ext-id/' })).toEqual({ ok: false, error: 'forbidden' });
  });

  it('a content script (a tab) may not connect, sign out, sync, enrol, change the service or the settings, or clear anything', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    for (const msg of [
      { type: MSG.connect, baseUrl: SERVICE, email: 'ana@example.com', password: 'x' }, { type: MSG.createAccount, baseUrl: SERVICE, email: 'a@b.co', password: 'y' },
      { type: MSG.disconnect }, { type: MSG.syncNow }, { type: MSG.enrol, languageId: 'sq', packId: 'pack:sq', packVersion: '1' },
      { type: MSG.refreshSession }, { type: MSG.selectEnrolment, enrolmentId: 'x' }, { type: MSG.serviceConfig, op: 'set', baseUrl: 'https://evil.example' },
      { type: MSG.clearLocal }, { type: MSG.setEnabled, tabId: 7, enabled: true }, { type: MSG.getState, tabId: 7 },
    ]) {
      expect(await rig.content(msg), msg.type).toEqual({ ok: false, error: 'forbidden' });
    }
    // writing a setting from a tab is refused even though reading one is allowed
    expect(await rig.content({ type: MSG.settings, op: 'set', patch: { remoteSpeechConsent: true } })).toMatchObject({ ok: false, error: 'forbidden' });
    expect((await rig.content({ type: MSG.settings, op: 'get' })).settings.remoteSpeechConsent).toBe(false);
    expect((await rig.fake.local.get('golearn:service'))['golearn:service']).toEqual({ baseUrl: SERVICE });
    expect((await rig.page({ type: MSG.status })).connected).toBe(true);
  });

  it('an unknown golearn: message is refused, not executed; other messages are ignored', async () => {
    const rig = createRig();
    expect(await rig.page({ type: 'golearn:nonsense' })).toEqual({ ok: false, error: 'forbidden' }); // not in either allow-list
    expect(await rig.fake.dispatch({ type: 'other:thing' }, { id: 'test-ext-id' })).toBeUndefined();
    expect(await rig.fake.dispatch('not an object', { id: 'test-ext-id' })).toBeUndefined();
  });
});

describe('what a content script can learn', () => {
  it('nothing that identifies the learner or opens the account: no token, no email, no learner id, no enrolment id, no service address', async () => {
    const rig = createRig();
    const who = await rig.signUp();
    await rig.connect();
    const token = ((await rig.fake.local.get('golearn:session'))['golearn:session'] as { token: string }).token;
    const replies = [
      await rig.content({ type: MSG.status }), await rig.content({ type: MSG.settings, op: 'get' }),
      await rig.content({ type: MSG.profile, unitIds: ['lemma:sq:shtëpi:NOUN'], languageId: 'sq' }), await rig.content({ type: MSG.gloss, lemma: 'shtëpi', pos: 'NOUN', languageId: 'sq' }),
      await rig.content({ type: MSG.explain, languageId: 'sq', features: { Case: 'Acc' }, constructionIds: ['negation-nuk'] }), await rig.content({ type: MSG.pronounceInfo, languageId: 'sq' }),
      await rig.content({ type: MSG.record, event: pendingEvent() }), await rig.content({ type: MSG.correct, formId: 'form:sq:shtëpinë', languageId: 'sq', lexemeId: 'lemma:sq:shtëpi:NOUN' }),
    ];
    for (const r of replies) {
      const text = JSON.stringify(r);
      for (const secret of [token, who.learnerId, who.enrolmentId, 'ana@example.com', SERVICE, 'repo.example']) expect(text).not.toContain(secret);
    }
    // the redacted status still says what the card needs
    expect(replies[0]).toMatchObject({ ok: true, connected: true, languageId: 'sq', languageName: 'Albanian', packAvailable: true });
    expect(Object.keys(replies[0]).sort()).toEqual(['connected', 'installedLanguages', 'languageId', 'languageName', 'needsSignIn', 'ok', 'packAvailable']);
  });

  it('the setup page gets the email and the address, still no token and no learner id', async () => {
    const rig = createRig();
    const who = await rig.signUp();
    await rig.connect();
    const s = await rig.page({ type: MSG.status });
    expect(s).toMatchObject({ email: 'ana@example.com', baseUrl: SERVICE, hasEnrolment: true });
    const token = ((await rig.fake.local.get('golearn:session'))['golearn:session'] as { token: string }).token;
    expect(JSON.stringify(s)).not.toContain(token);
    expect(JSON.stringify(s)).not.toContain(who.learnerId);
  });
});

describe('what the background will record for a content script', () => {
  it('replaces the identity: a content script cannot choose the learner, the enrolment or the device', async () => {
    const rig = createRig();
    const who = await rig.signUp();
    await rig.connect();
    const e = { ...pendingEvent(), learnerId: 'victim-learner', enrolmentId: 'victim-enrolment', producer: { app: 'golearn-ext', version: '9.9.9', deviceId: 'forged-device' } };
    expect(await rig.content({ type: MSG.record, event: e })).toMatchObject({ ok: true, attributed: 'account' });
    const stored = Object.values(await rig.fake.local.get(null)).find((v) => (v as { kind?: string })?.kind === 'SelectionLookedUp') as { learnerId: string; enrolmentId: string; producer: { deviceId: string; version: string } };
    const deviceId = (await rig.fake.local.get('golearn:deviceId'))['golearn:deviceId'];
    expect(stored.learnerId).toBe(who.learnerId);
    expect(stored.enrolmentId).toBe(who.enrolmentId);
    expect(stored.producer).toMatchObject({ deviceId, version: '0.1.0' });
  });

  it('refuses kinds a reader never produces, another app\'s name, oversize events, invalid events, and anything that is not an event', async () => {
    const rig = createRig();
    const ok = pendingEvent();
    const reasons = [
      await rig.content({ type: MSG.record, event: { ...ok, kind: 'CardReviewed' } }),
      await rig.content({ type: MSG.record, event: { ...ok, kind: 'EnrolmentChanged' } }),
      await rig.content({ type: MSG.record, event: { ...ok, producer: { ...ok.producer, app: 'gopractice-review' } } }),
      await rig.content({ type: MSG.record, event: { ...ok, payload: { ...ok.payload, junk: 'x'.repeat(7000) } } }),
      await rig.content({ type: MSG.record, event: { ...ok, payload: { ...ok.payload, sentence: 'Unë po lexoj një libër.' } } }), // the contract refuses text in a payload
      await rig.content({ type: MSG.record, event: { ...ok, id: '' } }),
      await rig.content({ type: MSG.record, event: 'a string' }),
      await rig.content({ type: MSG.record }),
    ];
    for (const r of reasons) expect(r.ok).toBe(false);
    expect(reasons[0].error).toBe('kind-not-allowed');
    expect(reasons[2].error).toBe('producer-not-allowed');
    expect(reasons[3].error).toBe('too-large');
    expect(reasons[4].error).toMatch(/^invalid:payload\.sentence/);
    expect(Object.keys(await rig.fake.local.get(null)).filter((k) => k.startsWith('golearn:event:') || k.startsWith('queue:'))).toHaveLength(0);
  });

  it('records the layer events a card produces, and a repeat of the same one is a duplicate, not a second row', async () => {
    const rig = createRig();
    const card = parseSelection({ surface: 'shtëpinë', context: { kind: 'sentence', confidence: 0.9, sentence: 'Unë po lexoj një libër të bukur në shtëpinë time.', selStart: 33, selEnd: 41 } });
    const base = { card, readerId: 'web-generic', identity: { ...PENDING_IDENTITY }, version: '0.1.0', sessionId: 's1', now: new Date('2026-10-08T10:00:00Z') };
    expect(buildSelectionEvent(base).kind).toBe('SelectionLookedUp');
    const a = buildAssistanceEvent(base, 'grammar', 'brief');
    const b = buildAssistanceEvent({ ...base, now: new Date('2026-10-08T10:00:05Z') }, 'grammar', 'brief');
    expect(await rig.content({ type: MSG.record, event: a })).toMatchObject({ ok: true });
    expect(await rig.content({ type: MSG.record, event: b })).toMatchObject({ ok: true, duplicate: true });
  });
});

describe('settings', () => {
  it('default to everything off; keepSnippets is not implemented and stays off however it is asked', async () => {
    const rig = createRig();
    expect((await rig.page({ type: MSG.settings, op: 'get' })).settings).toEqual({ keepSnippets: false, remoteSpeechConsent: false, localOnlySpeech: true, externalProcessingConsent: false });
    const r = await rig.page({ type: MSG.settings, op: 'set', patch: { keepSnippets: true, remoteSpeechConsent: true, localOnlySpeech: false, explanationDepth: 'explanatory' } });
    expect(r.settings).toEqual({ keepSnippets: false, remoteSpeechConsent: true, localOnlySpeech: false, externalProcessingConsent: false, explanationDepth: 'explanatory' });
    expect(r.notes?.[0]).toMatch(/not available in this version/);
    expect((await rig.page({ type: MSG.settings, op: 'set', patch: { explanationDepth: 'whatever' } })).ok).toBe(false);
    expect((await rig.page({ type: MSG.settings, op: 'set', patch: { explanationDepth: null } })).settings.explanationDepth).toBeUndefined();
    expect((await rig.content({ type: MSG.pronounceInfo, languageId: 'sq' })).remoteConsent).toBe(true);
  });
});

describe('remote data is data', () => {
  it('a correction is validated again in the background: a bad form id, a lemma id with a separator or an oversized feature set is refused, and nothing is sent', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    const n = rig.log.length;
    for (const bad of [
      { formId: 'lemma:sq:x', languageId: 'sq', lexemeId: 'lemma:sq:x' }, { formId: 'form:sq:a,b', languageId: 'sq', lexemeId: 'lemma:sq:x' },
      { formId: 'form:sq:ok', languageId: 'sq', lexemeId: 'sense:sq:x' }, { formId: 'form:sq:ok', languageId: 'sq' }, { formId: 'form:sq:ok', languageId: 'Not A Language', lexemeId: 'lemma:sq:x' },
      { formId: 'form:sq:ok', languageId: 'sq', features: { a: 1 } },
    ]) expect((await rig.content({ type: MSG.correct, ...bad })).ok, JSON.stringify(bad)).toBe(false);
    expect(rig.log.length).toBe(n);
  });

  it('a correction goes to POST /corrections with the session\'s enrolment, and says so', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    const r = await rig.content({ type: MSG.correct, formId: 'form:sq:bukur', languageId: 'sq', lexemeId: 'lemma:sq:i bukur:ADJ', reason: 'chose another reading of this form' });
    expect(r).toEqual({ ok: true, posted: true });
    expect(rig.log.at(-1)).toMatchObject({ method: 'POST', path: '/corrections', status: 200 });
    expect(rig.h.linguistics.correctCalls[0]).toMatchObject({ formId: 'form:sq:bukur' });
    // not connected: nothing is sent and the card is told why
    const off = createRig();
    expect(await off.content({ type: MSG.correct, formId: 'form:sq:bukur', languageId: 'sq', lexemeId: 'lemma:sq:i bukur:ADJ' })).toEqual({ ok: true, posted: false, reason: 'not-connected' });
    expect(off.log).toEqual([]);
  });
});

describe('what an extension page may record in addition', () => {
  const app = (over: Record<string, unknown> = {}) => ({ ...pendingEvent(), producer: { app: 'golearn-app', version: '0.1.0', deviceId: 'pending', surface: 'tutorial' }, evidence: { quality: 'none', assisted: false }, ...over });

  it('the setup page records its tutorial lookups (producer golearn-app, surface tutorial) and the profile-family events; a tab may not', async () => {
    const rig = createRig();
    const who = await rig.signUp();
    await rig.connect();
    const tutorial = app();
    expect(await rig.page({ type: MSG.record, event: tutorial })).toMatchObject({ ok: true, attributed: 'account' });
    const consent = { ...app({ kind: 'ConsentGiven', subject: {}, payload: { consent: 'remote-speech' } }) };
    expect(await rig.page({ type: MSG.record, event: consent })).toMatchObject({ ok: true });
    const pref = app({ kind: 'PreferenceChanged', subject: {}, payload: { key: 'explanationDepth', value: 'brief', origin: 'explicit' } });
    expect(await rig.page({ type: MSG.record, event: pref })).toMatchObject({ ok: true });
    for (const kind of ['PackInstalled', 'ConsentWithdrawn']) expect(await rig.page({ type: MSG.record, event: app({ kind, subject: {}, payload: { packId: 'pack:sq' } }) }), kind).toMatchObject({ ok: true });
    const stored = Object.values(await rig.fake.local.get(null)).filter((v) => (v as { producer?: { app?: string } })?.producer?.app === 'golearn-app') as Array<{ learnerId: string; producer: { surface?: string } }>;
    expect(stored).toHaveLength(5);
    for (const e of stored) { expect(e.learnerId).toBe(who.learnerId); expect(e.producer.surface).toBe('tutorial'); }
    // the same events from a tab are refused, and a page still cannot use another app's name or a kind outside both lists
    expect(await rig.content({ type: MSG.record, event: tutorial })).toMatchObject({ ok: false, error: 'producer-not-allowed' });
    expect(await rig.content({ type: MSG.record, event: consent })).toMatchObject({ ok: false, error: 'kind-not-allowed' });
    expect(await rig.page({ type: MSG.record, event: app({ producer: { app: 'gopractice-review', version: '1', deviceId: 'x' } }) })).toMatchObject({ ok: false, error: 'producer-not-allowed' });
    expect(await rig.page({ type: MSG.record, event: app({ kind: 'CardReviewed' }) })).toMatchObject({ ok: false, error: 'kind-not-allowed' });
    // and a sender that is not this extension gets nothing, whatever the event
    expect(await rig.fake.dispatch({ type: MSG.record, event: tutorial }, { id: 'other', url: 'chrome-extension://other/app/index.html' })).toEqual({ ok: false, error: 'forbidden' });
  });
});

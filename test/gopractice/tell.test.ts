// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { destroyRigs, defaultService, knowledgeRow, makeRig, queued, type, unitOf, until } from './helpers';

afterEach(() => destroyRigs());

describe('GoTell in the shell', () => {
  it('renders with an empty log and no deck: no candidates asked for, nothing queued, no session', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    service.calls.length = 0;
    await rig.go('tell');
    await until(() => !!rig.root.querySelector('#tell-drafts'), 'the drafts');
    expect(rig.q('#tell-notice').textContent).toContain('needs neither a deck nor a session');
    expect(rig.q('#tell-notice').textContent).toContain('next phase');
    expect(rig.q('#tell-words').textContent).toContain('Nothing yet');
    expect(rig.q('#tell-drafts').textContent).toContain('No drafts yet');
    expect(service.calls).not.toContain('candidates');
    expect(await queued(rig)).toEqual([]);
    expect(rig.app.ctx.run.active).toBeUndefined();
    expect(await rig.app.ctx.events()).toEqual([]);
  });

  it('lists the words with production evidence, read-only, and leaves recognition-only words out', async () => {
    const service = defaultService();
    service.knowledge.set('L1', [
      knowledgeRow('L1', unitOf('zog'), 'sq', { productiveRetrieval: { score: 0.8, confidence: 0.6, observations: 3, positive: 3 } }),
      knowledgeRow('L1', unitOf('mace'), 'sq', { readingRecognition: { score: 0.9, confidence: 0.9, observations: 5, positive: 5 } }),
      knowledgeRow('L1', unitOf('shtepi'), 'sq', { contextualProduction: { score: 0.5, confidence: 0.4, observations: 1, positive: 1 } }),
      knowledgeRow('L1', unitOf('hund', 'de'), 'de', { productiveRetrieval: { score: 0.9, confidence: 0.9, observations: 4, positive: 4 } }),
      knowledgeRow('L1', unitOf('qen'), 'sq', { productiveRetrieval: { score: 0.1, confidence: 0.1, observations: 2, positive: 0, negative: 2 } }),
    ]);
    const rig = await makeRig({ service, signedIn: true });
    await rig.go('tell');
    await until(() => !!rig.root.querySelector('#tell-words li'), 'the words');
    const words = rig.qa('#tell-words li').map((li) => li.getAttribute('data-unit'));
    expect(words).toEqual([unitOf('zog'), unitOf('shtepi')]);
    expect(rig.q('#tell-words li').textContent).toContain('recalled');
    expect(rig.q('#tell-words li span').getAttribute('lang')).toBe('sq-AL');
    expect(await queued(rig)).toEqual([]); // reading wrote nothing
  });

  it('saves a draft as a private document with a revision per save, and lists it', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    await rig.go('tell');
    await until(() => !!rig.root.querySelector('#draft-body'), 'the editor');
    type(rig.q<HTMLInputElement>('#draft-title'), 'Mrekullia');
    type(rig.q<HTMLTextAreaElement>('#draft-body'), 'Unë shoh një zog.');
    expect(rig.q('#draft-body').getAttribute('lang')).toBe('sq-AL');
    rig.q('#draft-save').click();
    await until(() => rig.q('#draft-revision').textContent === 'Revision 1 (saved).', 'revision 1');
    type(rig.q<HTMLTextAreaElement>('#draft-body'), 'Unë shoh një zog dhe një mace.');
    rig.q('#draft-save').click();
    await until(() => rig.q('#draft-revision').textContent === 'Revision 2 (saved).', 'revision 2');
    const stored = [...service.docs.get('L1')!.values()];
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ revision: 2, title: 'Mrekullia', body: 'Unë shoh një zog dhe një mace.', kind: 'draft', languageId: 'sq' });
    expect(rig.q('#tell-drafts').textContent).toContain('Mrekullia');
    expect(rig.q('#tell-drafts').textContent).toContain('revision 2');
    // the text lives in the document only: no event carries it
    expect(JSON.stringify(await rig.app.ctx.events())).not.toContain('zog dhe');
    expect(await queued(rig)).toEqual([]);
    // a new draft starts again at revision 0
    rig.q('#draft-new').click();
    expect(rig.q('#draft-revision').textContent).toBe('New draft (not saved yet).');
  });

  it('opens a saved draft; a save against a newer revision keeps the text and offers the current version', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    await rig.go('tell');
    await until(() => !!rig.root.querySelector('#draft-body'), 'the editor');
    type(rig.q<HTMLTextAreaElement>('#draft-body'), 'version one');
    rig.q('#draft-save').click();
    await until(() => rig.q('#draft-revision').textContent === 'Revision 1 (saved).', 'revision 1');
    const doc = [...service.docs.get('L1')!.values()][0];
    // another device saves revision 2
    service.docs.get('L1')!.set(doc.docId, { ...doc, revision: 2, body: 'written elsewhere' });
    type(rig.q<HTMLTextAreaElement>('#draft-body'), 'my local edit');
    rig.q('#draft-save').click();
    await until(() => rig.q('#draft-save').parentElement!.nextElementSibling!.getAttribute('data-kind') === 'error', 'the conflict message');
    expect(rig.q<HTMLTextAreaElement>('#draft-body').value).toBe('my local edit'); // never overwritten
    expect(rig.q('#draft-reload').hasAttribute('hidden')).toBe(false);
    rig.q('#draft-reload').click();
    await until(() => rig.q<HTMLTextAreaElement>('#draft-body').value === 'written elsewhere', 'the current version');
    expect(rig.q('#draft-revision').textContent).toBe('Revision 2 (saved).');
  });

  it('keeps the text in the editor when the service cannot be reached', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    await rig.go('tell');
    await until(() => !!rig.root.querySelector('#draft-body'), 'the editor');
    type(rig.q<HTMLTextAreaElement>('#draft-body'), 'do not lose me');
    service.allDown = true;
    rig.q('#draft-save').click();
    await until(() => (rig.q('#draft-save').parentElement!.nextElementSibling!.textContent ?? '').includes('cannot be reached'), 'the message');
    expect(rig.q<HTMLTextAreaElement>('#draft-body').value).toBe('do not lose me');
  });
});

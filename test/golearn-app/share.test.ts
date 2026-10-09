// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateEvent, type GoEvent } from '../../packages/repository-contract/src';
import { KEYS } from '../../packages/golearn-extension/app/state';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { EVENT_KEY_PREFIX, buildSelectionEvent } from '../../packages/golearn-extension/src/store';
import { stubLayout } from './domtools';
import { ES_FAKE, SQ_FAKE, choose, destroyRigs, fakeBackground, fakePacks, flush, makeRig, type, until, type Rig, type RigOptions } from './helpers';

let restore: () => void;
beforeEach(() => { restore = stubLayout(); });
afterEach(() => { destroyRigs(); restore(); document.body.innerHTML = ''; window.history.replaceState(null, '', '/'); vi.restoreAllMocks(); });

const UNKNOWN = { textRetention: 'unknown', remoteProcessing: 'unknown', audioRetention: 'unknown', export: 'unknown', sharing: 'unknown', reviewExamples: 'unknown' } as const;
const SENTENCE = 'Unë po lexoj një libër të bukur në shtëpinë time.';
const FRAGMENT = `${SENTENCE} Ai është këtu. Ne flasim shqip.`;

const rows = async (rig: Rig): Promise<GoEvent[]> =>
  Object.entries(await rig.area.get(null)).filter(([k]) => k.startsWith(EVENT_KEY_PREFIX)).map(([, v]) => v as GoEvent);
const hostPresent = (): boolean => !!document.querySelector('[data-golearn-host]');
const words = (rig: Rig): HTMLButtonElement[] => [...rig.root.querySelectorAll<HTMLButtonElement>('#share-words button')];
const wordButton = (rig: Rig, w: string): HTMLButtonElement => {
  const b = words(rig).find((x) => x.textContent === w);
  if (!b) throw new Error(`no word button ${w}`);
  return b;
};
const query = (params: Record<string, string>): string => `/?${new URLSearchParams(params).toString()}`;
/** Open the share screen the way a web share target does: query in the address, the route in the hash. */
async function openShared(params: Record<string, string>, opts: RigOptions = {}): Promise<Rig> {
  window.history.replaceState(null, '', query(params));
  return makeRig({ ...opts, startRoute: 'share' });
}
async function setLanguage(rig: Rig, languageId: string): Promise<void> {
  await rig.area.set({ [KEYS.session]: { token: 't', learnerId: 'learner-9', enrolmentId: 'enr-9', languageId, expiresAt: '2027-01-01T00:00:00.000Z', email: 'ana@example.org' } });
}

describe('the share screen: a passage arriving through the web share target', () => {
  it('reads text, url and title from the query, shows the words to choose from, and records nothing before a choice', async () => {
    const rig = await openShared({ text: SENTENCE, url: 'https://reader.example/books/ch3?page=4', title: 'Një libër' });
    await until(() => words(rig).length > 0);
    expect(words(rig).map((b) => b.textContent)).toEqual(['Unë', 'po', 'lexoj', 'një', 'libër', 'të', 'bukur', 'në', 'shtëpinë', 'time']);
    expect(rig.q('#share-incoming').textContent).toContain(SENTENCE);
    expect(rig.q('#share-status').textContent).toContain('Nothing is recorded until you do');
    expect(hostPresent()).toBe(false);
    await flush(20);
    expect(await rows(rig)).toEqual([]);
    // the query is not left in the address bar or the history
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#/share');
  });

  it('choosing a word runs the real parser, shows the card and records the browser lookup’s event with readerId share-web', async () => {
    const rig = await openShared({ text: SENTENCE, url: 'https://reader.example/books/ch3?page=4#frag', title: 'Një libër' });
    await until(() => words(rig).length > 0);
    wordButton(rig, 'shtëpinë').click();
    await until(() => rig.root.querySelector('#share-result[data-recorded]'));
    expect(hostPresent()).toBe(true);
    expect(rig.q('#share-result').getAttribute('data-recorded')).toBe('recorded');
    expect(rig.q('#share-result').getAttribute('data-reader')).toBe('share-web');
    const [ev, ...rest] = await rows(rig);
    expect(rest).toEqual([]);
    expect(validateEvent(ev)).toEqual([]);
    expect(ev.kind).toBe('SelectionLookedUp');
    expect(ev.producer).toMatchObject({ app: 'golearn-app', surface: 'share', version: '0.1.0-test' });
    expect(ev.payload).toMatchObject({ readerId: 'share-web', surface: 'shtëpinë', contextKind: 'sentence', contextConfidence: 0.6 });
    expect(ev.subject.sourceRef).toEqual({ kind: 'share', mechanism: 'web-share-target', title: 'Një libër', locator: '/books/ch3', restrictions: UNKNOWN });

    // the same card and source, recorded by the browser path, differ only in the id, the producer and the reader id
    const card = parseSelection({ surface: 'shtëpinë', languageId: 'sq', context: { kind: 'sentence', confidence: 0.6, sentence: SENTENCE, selStart: SENTENCE.indexOf('shtëpinë'), selEnd: SENTENCE.indexOf('shtëpinë') + 'shtëpinë'.length, direction: 'ltr', pageLanguage: 'sq' } });
    const browser = buildSelectionEvent({
      card, source: { kind: 'share', mechanism: 'web-share-target', title: 'Një libër', locator: '/books/ch3', restrictions: { ...UNKNOWN } }, readerId: 'share-web',
      identity: { learnerId: ev.learnerId, enrolmentId: ev.enrolmentId, deviceId: ev.producer.deviceId },
      version: '0.1.0-test', sessionId: ev.dedupeKey!.split(':')[1], now: new Date(ev.at), direction: 'ltr', language: { basis: 'team-default', confidence: 0.3 },
    });
    expect({ ...ev, id: '', producer: { ...ev.producer, app: '', surface: undefined } }).toEqual({ ...browser, id: '', producer: { ...browser.producer, app: '', surface: undefined } });
  });

  it('never carries the passage, the title’s words beyond the reference, or the link’s query into the event', async () => {
    const rig = await openShared({ text: FRAGMENT, url: 'https://reader.example/read/1?quote=Ai+eshte+ketu#:~:text=flasim', title: 'Libri' });
    await until(() => words(rig).length > 0);
    wordButton(rig, 'flasim').click();
    await until(() => rig.root.querySelector('#share-result[data-recorded]'));
    const [ev] = await rows(rig);
    const json = JSON.stringify(ev);
    for (const piece of ['Ai është këtu', 'Ne flasim shqip', 'po lexoj', 'quote', 'text=']) expect(json).not.toContain(piece);
    expect(ev.payload).toMatchObject({ contextKind: 'fragment', contextConfidence: 0.4, surface: 'flasim', readerId: 'share-web' });
    expect(typeof (ev.payload as { fragmentKey?: unknown }).fragmentKey).toBe('string');
    expect(ev.subject.sentenceKey).toBeUndefined();
  });

  it('a single shared word needs no choice: it is looked up at once with no sentence context', async () => {
    const rig = await openShared({ text: 'shtëpinë' });
    await until(() => rig.root.querySelector('#share-result[data-recorded]'));
    expect(words(rig)).toEqual([]);
    const [ev] = await rows(rig);
    expect(ev.payload).toMatchObject({ readerId: 'share-web', surface: 'shtëpinë', contextKind: 'none', contextConfidence: 0 });
    expect(ev.subject.sourceRef).toEqual({ kind: 'share', mechanism: 'web-share-target', restrictions: UNKNOWN });
    expect(hostPresent()).toBe(true);
  });

  it('also reads the query when it is written after the hash route', async () => {
    window.history.replaceState(null, '', '/');
    const rig = await makeRig({ startRoute: 'share?text=shtëpinë&title=Libri' });
    await until(() => rig.root.querySelector('#share-result[data-recorded]'));
    const [ev] = await rows(rig);
    expect(ev.payload).toMatchObject({ surface: 'shtëpinë', readerId: 'share-web' });
    expect(ev.subject.sourceRef).toEqual({ kind: 'share', mechanism: 'web-share-target', title: 'Libri', restrictions: UNKNOWN });
  });

  it('records nothing for text that is refused, a link with no text, or an empty share', async () => {
    const long = Array.from({ length: 90 }, (_, i) => `fjalë${i}`).join(' ');
    for (const [params, expected] of [
      [{ text: long }, /Share a shorter passage/],
      [{ text: 'https://reader.example/books/ch3' }, /link, not text/],
      [{ url: 'https://reader.example/books/ch3', title: 'Libri' }, /link arrived without any text/],
    ] as const) {
      const rig = await openShared(params);
      await until(() => /\S/.test(rig.q('#share-status').textContent ?? ''));
      expect(rig.q('#share-status').textContent).toMatch(expected);
      expect(rig.q('#share-status').getAttribute('data-kind')).toBe('error');
      expect(words(rig)).toEqual([]);
      expect(hostPresent()).toBe(false);
      await flush(10);
      expect(await rows(rig)).toEqual([]);
      destroyRigs();
    }
  });

  it('looks up in the active enrolment’s language: Spanish with the Spanish parser, and says so for a language with no analyser', async () => {
    window.history.replaceState(null, '', '/');
    const es = await makeRig({ startRoute: 'share' });
    await setLanguage(es, 'es');
    await es.go('home');
    await es.go('share');
    expect(es.q('#share-language').textContent).toContain('Spanish');
    type(es.q<HTMLTextAreaElement>('#share-paste'), 'Yo leo un libro muy bonito en mi casa.');
    es.q<HTMLFormElement>('#share-paste-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await until(() => words(es).length > 0);
    wordButton(es, 'casa').click();
    await until(() => es.root.querySelector('#share-result[data-recorded]'));
    const [ev] = await rows(es);
    expect(ev.languageId).toBe('es');
    expect(ev.payload).toMatchObject({ surface: 'casa', readerId: 'clipboard' });
    destroyRigs();

    const nb = await makeRig({ startRoute: 'share' });
    await setLanguage(nb, 'nb');
    await nb.go('home');
    await nb.go('share');
    expect(nb.q('#share-paste-card').parentElement!.textContent).toContain('no analyser for Norwegian');
    type(nb.q<HTMLTextAreaElement>('#share-paste'), 'hus');
    nb.q<HTMLFormElement>('#share-paste-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await until(() => nb.q('#share-status').getAttribute('data-kind') === 'error');
    expect(nb.q('#share-status').textContent).toContain('nothing was recorded');
    await flush(10);
    expect(await rows(nb)).toEqual([]);
  });
});

describe('the share screen: pasted text', () => {
  const paste = (rig: Rig, text: string): void => {
    type(rig.q<HTMLTextAreaElement>('#share-paste'), text);
    rig.q<HTMLFormElement>('#share-paste-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  };

  it('offers a box labelled “Paste what you copied”, and never reads the clipboard by itself', async () => {
    const readText = vi.fn(async () => 'secret');
    Object.defineProperty(window.navigator, 'clipboard', { value: { readText, read: vi.fn(), writeText: vi.fn() }, configurable: true });
    const rig = await makeRig({ startRoute: 'share' });
    expect(rig.q('#share-paste-card').textContent).toContain('Paste what you copied');
    expect(rig.q('#share-paste-card').textContent).toContain('never reads your clipboard by itself');
    expect(rig.q('label.field').textContent).toContain('Paste what you copied');
    await flush(20);
    expect(readText).not.toHaveBeenCalled();
    expect(await rows(rig)).toEqual([]);
    paste(rig, SENTENCE);
    await until(() => words(rig).length > 0);
    expect(readText).not.toHaveBeenCalled();
  });

  it('pasting a sentence offers the words; choosing one records readerId clipboard, once, with no source', async () => {
    const rig = await makeRig({ startRoute: 'share' });
    paste(rig, `  ${SENTENCE}  `);
    await until(() => words(rig).length > 0);
    await flush(20);
    expect(await rows(rig)).toEqual([]);
    wordButton(rig, 'libër').click();
    await until(() => rig.root.querySelector('#share-result[data-recorded]'));
    const all = await rows(rig);
    expect(all).toHaveLength(1);
    expect(all[0].payload).toMatchObject({ readerId: 'clipboard', surface: 'libër', contextKind: 'sentence' });
    expect(all[0].subject.sourceRef).toEqual({ kind: 'share', mechanism: 'clipboard-import', restrictions: UNKNOWN });
    expect(rig.q('#share-result').getAttribute('data-reader')).toBe('clipboard');
    // choosing the same word again in the same visit is the same lookup
    wordButton(rig, 'libër').click();
    await until(() => rig.q('#share-result').getAttribute('data-recorded') === 'duplicate');
    expect(await rows(rig)).toHaveLength(1);
  });

  it('pasting one word looks it up at once; pasting nothing, or too much, records nothing', async () => {
    const rig = await makeRig({ startRoute: 'share' });
    paste(rig, '“shtëpinë.”');
    await until(() => rig.root.querySelector('#share-result[data-recorded]'));
    expect((await rows(rig)).map((e) => e.payload)).toEqual([expect.objectContaining({ surface: 'shtëpinë', contextKind: 'none', readerId: 'clipboard' })]);
    paste(rig, '   ');
    await until(() => /Nothing readable/.test(rig.q('#share-status').textContent ?? ''));
    paste(rig, Array.from({ length: 100 }, () => 'fjalë').join(' '));
    await until(() => /shorter passage/.test(rig.q('#share-status').textContent ?? ''));
    await flush(10);
    expect(await rows(rig)).toHaveLength(1);
    expect(words(rig)).toEqual([]);
  });

  it('a second paste replaces the first one’s choices and card', async () => {
    const rig = await makeRig({ startRoute: 'share' });
    paste(rig, SENTENCE);
    await until(() => words(rig).length > 0);
    paste(rig, 'Ai është këtu dhe ne flasim shqip.');
    await until(() => words(rig).some((b) => b.textContent === 'flasim'));
    expect(words(rig).some((b) => b.textContent === 'libër')).toBe(false);
    expect(await rows(rig)).toEqual([]);
  });
});

describe('the share screen in the extension and in the app', () => {
  it('is reachable from the status page and is not part of the setup navigation', async () => {
    const rig = await makeRig({ startRoute: 'home' });
    expect(rig.root.querySelector('a[href="#/share"]')).not.toBeNull();
    expect(rig.root.querySelector('.rail li[data-route="share"]')).toBeNull();
    await rig.go('share');
    expect(document.title).toBe('GoLearn — Look up shared text');
    expect(rig.root.querySelector('footer a[href="#/home"]')).not.toBeNull();
  });

  it('inside the extension the event goes through the worker’s recording path as the extension’s own producer', async () => {
    window.history.replaceState(null, '', query({ text: 'shtëpinë' }));
    const rig = await makeRig({ extension: true, startRoute: 'share' });
    const bg = fakeBackground(rig, ['record']);
    // the first render may have run before the fake worker was listening: look it up again from the paste box
    type(rig.q<HTMLTextAreaElement>('#share-paste'), 'shtëpinë');
    rig.q<HTMLFormElement>('#share-paste-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await until(() => bg.recorded.length > 0);
    expect(bg.recorded[0]).toMatchObject({ kind: 'SelectionLookedUp', producer: { app: 'golearn-ext', surface: 'share' }, payload: { readerId: 'clipboard', surface: 'shtëpinë' } });
  });
});

describe('the share screen: the language of a lookup is recorded as decided', () => {
  const twoLanguages = (): ReturnType<typeof fakePacks> => {
    const packs = fakePacks();
    const all = [SQ_FAKE, { ...ES_FAKE, status: 'installable' as const, level: 'experimental' as const, validation: 'experimental' as const }];
    packs.packs = () => all;
    packs.packFor = (id) => all.find((p) => p.languageId === id);
    return packs;
  };
  const language = (ev: GoEvent): Record<string, unknown> => (ev.payload as { language: Record<string, unknown> }).language;

  it('the enrolment’s language (or the default) is a team-default: nothing in a shared passage declares its language', async () => {
    const rig = await openShared({ text: 'shtëpinë' }, { packs: twoLanguages() });
    await until(() => rig.root.querySelector('#share-result[data-recorded]'));
    const [ev] = await rows(rig);
    expect(language(ev)).toEqual({ languageId: 'sq', basis: 'team-default', confidence: 0.3, override: false });
    expect(validateEvent(ev)).toEqual([]);
  });

  it('a language the learner chooses on this screen is an override, and the lookup uses it', async () => {
    window.history.replaceState(null, '', '/');
    const rig = await makeRig({ startRoute: 'share', packs: twoLanguages() });
    const select = rig.q<HTMLSelectElement>('#share-language-select');
    expect([...select.options].map((o) => o.value)).toEqual(['sq', 'es']);
    expect(select.value).toBe('sq');
    choose(select, 'es');
    expect(rig.q('#share-language').textContent).toContain('the language you chose');
    type(rig.q<HTMLTextAreaElement>('#share-paste'), 'Yo leo un libro muy bonito en mi casa.');
    rig.q<HTMLFormElement>('#share-paste-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await until(() => words(rig).length > 0);
    wordButton(rig, 'casa').click();
    await until(() => rig.root.querySelector('#share-result[data-recorded]'));
    const [ev] = await rows(rig);
    expect(ev.languageId).toBe('es');
    expect(language(ev)).toEqual({ languageId: 'es', basis: 'override', confidence: 1, override: true });
    expect(ev.subject.sourceRef).toMatchObject({ kind: 'share', mechanism: 'clipboard-import' });
    expect(validateEvent(ev)).toEqual([]);
  });

  it('the active enrolment’s language, not chosen here, is still a team-default', async () => {
    window.history.replaceState(null, '', '/');
    const rig = await makeRig({ startRoute: 'share', packs: twoLanguages() });
    await setLanguage(rig, 'es');
    await rig.go('home');
    await rig.go('share');
    expect(rig.q<HTMLSelectElement>('#share-language-select').value).toBe('es');
    type(rig.q<HTMLTextAreaElement>('#share-paste'), 'casa');
    rig.q<HTMLFormElement>('#share-paste-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await until(() => rig.root.querySelector('#share-result[data-recorded]'));
    const [ev] = await rows(rig);
    expect(language(ev)).toEqual({ languageId: 'es', basis: 'team-default', confidence: 0.3, override: false });
  });
});

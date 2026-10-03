// @vitest-environment jsdom
// The alphabet trainer (#/alphabet): Thai and Hindi letters, 10 at a time, with spaced repetition. Thai is the language under
// test for the drill; time is the test's own clock so reviews can fall due.
import { afterEach, describe, expect, it } from 'vitest';
import { deckFor } from '../../src/alphabet/decks';
import type { AlphabetState } from '../../src/alphabet/srs';
import { DAY, MINUTE } from '../../src/alphabet/srs';
import { GERMAN_COURSE_ID, GERMAN_STREAMS } from '../../src/course/german';
import { HINDI_COURSE_ID, HINDI_STREAMS, THAI_COURSE_ID, THAI_STREAMS } from '../../src/course';
import { AppRoutes, Shell } from '../../src/ui/App';
import { AlphabetPage, alphabetMetaId } from '../../src/ui/alphabet/AlphabetPage';
import type { Harness, Mounted } from './harness';
import { USER, button, click, flush, makeHarness, pressKey, q, qa } from './harness';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const T0 = Date.UTC(2026, 9, 3, 9, 0, 0);
let clock = T0;
const now = () => clock;
const page = () => <AlphabetPage now={now} />;
const app = () => <Shell><AppRoutes /></Shell>;
const thai = (o: Parameters<typeof makeHarness>[0] = {}) => makeHarness({ courseId: THAI_COURSE_ID, streams: THAI_STREAMS, ...o });
const hindi = (o: Parameters<typeof makeHarness>[0] = {}) => makeHarness({ courseId: HINDI_COURSE_ID, streams: HINDI_STREAMS, ...o });

const group = (i: number) => q(mounted!.container, `[data-group="batch:${i}"]`)!;
const head = (i: number) => q<HTMLButtonElement>(group(i), ':scope > button.lib__head')!;
const text = (el: Element | null) => el?.textContent ?? '';
const glyph = () => text(q(mounted!.container, '[data-testid="alpha-glyph"]'));
const phase = () => q(mounted!.container, '[data-phase]')?.getAttribute('data-phase');
const choiceTexts = () => qa(mounted!.container, '.alpha__choice-text').map((e) => e.textContent ?? '');
const summary = () => q(mounted!.container, '[data-testid="alpha-summary"]');

async function stored(h: Harness, lang = 'th'): Promise<AlphabetState> {
  const row = await h.store.meta.get(alphabetMetaId(USER, lang));
  return JSON.parse(row!.value) as AlphabetState;
}

/** Take the current card to the end of its turn: meet it if it is new, answer it right or wrong with the keyboard, and go on. */
async function turn(lang: 'th' | 'hi', right: boolean): Promise<string> {
  const g = glyph();
  const card = deckFor(lang)!.cards.find((c) => c.glyph === g)!;
  if (phase() === 'intro') await pressKey('Enter');
  expect(phase()).toBe('ask');
  const texts = choiceTexts();
  expect(texts).toHaveLength(4);
  const at = texts.findIndex((t) => (t === card.answer) === right);
  expect(at, `${card.id}: ${texts.join(' | ')}`).toBeGreaterThanOrEqual(0);
  await pressKey(String(at + 1));
  expect(phase()).toBe('result');
  await pressKey('Enter');
  return g;
}

/** Answer everything in the session right until the summary shows. */
async function finishSession(lang: 'th' | 'hi', cap = 60): Promise<number> {
  let n = 0;
  while (!summary() && n < cap) { await turn(lang, true); n++; }
  expect(summary()).not.toBeNull();
  return n;
}

describe('the overview (Thai)', () => {
  it('lists the deck as batches of 10 with their glyphs and a state, the first batch open', async () => {
    clock = T0;
    const h = await thai();
    mounted = await h.mount(page(), { router: '/alphabet' });
    const nav = q(mounted.container, 'nav.lib[aria-label="Letters"]')!;
    expect(q(mounted.container, '.disclosure-page')).not.toBeNull();
    const titles = qa(nav, '.lib__group--3 > button .lib__title').map((x) => x.textContent);
    expect(titles).toEqual(['Letters 1–10', 'Letters 11–20', 'Letters 21–30', 'Letters 31–40', 'Letters 41–50', 'Letters 51–60', 'Letters 61–70', 'Letters 71–77']);
    expect(qa(nav, '.lib__group--3 > button .lib__meta').every((x) => x.textContent === 'not started')).toBe(true);
    // batch 1: the first ten consonants, as glyphs on the head and as tiles in the opened panel
    expect(text(q(head(0), '.lib__native'))).toBe('ก ข ฃ ค ฅ ฆ ง จ ฉ ช');
    expect(q(head(0), '.lib__native')!.getAttribute('lang')).toBe('th');
    expect(head(0).getAttribute('aria-expanded')).toBe('true');
    expect(head(1).getAttribute('aria-expanded')).toBe('false');
    const tiles = qa(group(0), '.alpha__tile-glyph');
    expect(tiles.map((t) => t.textContent).join('')).toBe('กขฃคฅฆงจฉช');
    expect(tiles).toHaveLength(10);
    // nothing met yet: no answers on the tiles, 10 new, and the explicit way on
    expect(text(q(mounted.container, '[data-testid="alpha-count"]'))).toBe('10 new');
    expect(button(mounted.container, 'Start the next 10 now')).toBeDefined();
    expect(text(q(mounted.container, '.alpha'))).toMatch(/0 letters of 77 learned/);
    // the batches open and close like the Scripture and Read dropdowns
    await click(head(1));
    expect(head(1).getAttribute('aria-expanded')).toBe('true');
    expect(qa(group(1), '.alpha__tile')).toHaveLength(10);
    await click(head(1));
    expect(head(1).getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the Hindi deck in the same form', async () => {
    clock = T0;
    const h = await hindi();
    mounted = await h.mount(page(), { router: '/alphabet' });
    expect(text(q(mounted.container, '.alpha__title'))).toBe('Devanagari letters');
    expect(text(q(head(0), '.lib__native'))).toBe('अ आ इ ई उ ऊ ऋ ए ऐ ओ');
    expect(q(head(0), '.lib__native')!.getAttribute('lang')).toBe('hi');
    expect(qa(mounted.container, '.lib__group--3')).toHaveLength(8);
    expect(text(q(mounted.container, '.alpha'))).toMatch(/0 letters of 71 learned/);
  });
});

describe('another course language', () => {
  it('says the trainer is for Thai and Hindi and links back home', async () => {
    const h = await makeHarness(); // Spanish
    mounted = await h.mount(app(), { router: '/alphabet' });
    const note = q(mounted.container, '[data-testid="alpha-unsupported"]')!;
    expect(note.textContent).toMatch(/Thai and Hindi/);
    expect(qa(mounted.container, 'nav.lib')).toHaveLength(0);
    const link = qa<HTMLAnchorElement>(mounted.container, 'a').find((a) => a.textContent === 'Back to Home')!;
    expect(link.getAttribute('href')).toBe('/');
    expect(await h.store.meta.get(alphabetMetaId(USER, 'es'))).toBeUndefined();
  });
});

describe('the drill (Thai)', () => {
  it('meets a new letter, asks four choices, shows the details, and stores the answer in meta', async () => {
    clock = T0;
    const h = await thai();
    mounted = await h.mount(page(), { router: '/alphabet' });
    expect(await h.store.meta.get(alphabetMetaId(USER, 'th'))).toBeUndefined();
    await click(q(mounted.container, '[data-testid="alpha-practise"]'));

    // the first card is ก, new: its answer is shown first
    expect(glyph()).toBe('ก');
    expect(q(mounted.container, '[data-testid="alpha-glyph"]')!.getAttribute('lang')).toBe('th');
    expect(phase()).toBe('intro');
    expect(text(q(mounted.container, '[data-testid="alpha-answer"]'))).toBe('k /k/');
    await click(button(mounted.container, 'Now try it'));
    expect(phase()).toBe('ask');
    expect(text(q(mounted.container, '.alpha__prompt'))).toBe('What sound?');
    const choices = choiceTexts();
    expect(choices).toHaveLength(4);
    expect(new Set(choices).size).toBe(4);
    expect(choices.filter((c) => c === 'k /k/')).toHaveLength(1);
    expect(qa(mounted.container, '.alpha__num').map((e) => e.textContent)).toEqual(['1', '2', '3', '4']);

    // right, by clicking the button
    const rightAt = choices.indexOf('k /k/');
    await click(qa<HTMLButtonElement>(mounted.container, 'button.alpha__choice')[rightAt]);
    expect(phase()).toBe('result');
    expect(text(q(mounted.container, '[data-testid="alpha-verdict"]'))).toMatch(/^Right\./);
    const detailText = text(q(mounted.container, '.alpha__details'));
    expect(detailText).toMatch(/ไก่/);
    expect(detailText).toMatch(/mid class/);
    expect(detailText).toMatch(/As an initial/);
    expect(detailText).toMatch(/As a final/);
    const s1 = await stored(h);
    expect(s1.cards['th:consonant:ก']).toMatchObject({ box: 1, due: T0 + 10 * MINUTE, reps: 1, lapses: 0 });
    expect(Object.keys(s1.cards)).toEqual(['th:consonant:ก']);

    // next: ข, new; then answered wrong with the key for a wrong choice
    await pressKey(' ');
    expect(glyph()).toBe('ข');
    expect(await turn('th', false)).toBe('ข');
    const s2 = await stored(h);
    expect(s2.cards['th:consonant:ข']).toMatchObject({ box: 0, due: T0, reps: 1, lapses: 1 });
  });

  it('shows a wrong card again a few cards later in the same session, without its introduction', async () => {
    clock = T0;
    const h = await thai();
    mounted = await h.mount(page(), { router: '/alphabet' });
    await click(q(mounted.container, '[data-testid="alpha-practise"]'));
    const seen: string[] = [];
    seen.push(await turn('th', true)); // ก right
    seen.push(await turn('th', false)); // ข wrong
    seen.push(await turn('th', true)); // ฃ
    seen.push(await turn('th', true)); // ค
    seen.push(await turn('th', true)); // ฅ
    expect(seen).toEqual(['ก', 'ข', 'ฃ', 'ค', 'ฅ']);
    expect(glyph()).toBe('ข'); // three cards in between
    expect(phase()).toBe('ask'); // no introduction the second time
    await turn('th', true);
    const s = await stored(h);
    expect(s.cards['th:consonant:ข']).toMatchObject({ box: 1, lapses: 1, reps: 2 });
    expect(glyph()).toBe('ฆ');
  });

  it('answers with the keys 1–4 and moves on with Enter or Space, and ignores them when they do not apply', async () => {
    clock = T0;
    const h = await thai();
    mounted = await h.mount(page(), { router: '/alphabet' });
    await click(q(mounted.container, '[data-testid="alpha-practise"]'));
    await pressKey('1'); // a number on the introduction does nothing
    expect(phase()).toBe('intro');
    await pressKey(' ');
    expect(phase()).toBe('ask');
    await pressKey('Enter'); // Enter while asking does nothing
    expect(phase()).toBe('ask');
    await pressKey('5');
    expect(phase()).toBe('ask');
    await pressKey('4');
    expect(phase()).toBe('result');
    await pressKey('2'); // a second answer is not taken
    expect(phase()).toBe('result');
    expect((await stored(h)).cards['th:consonant:ก'].reps).toBe(1);
    await pressKey('Enter');
    expect(glyph()).toBe('ข');
  });

  it('ends the session when nothing is due, and says when the next review is', async () => {
    clock = T0;
    const h = await thai();
    mounted = await h.mount(page(), { router: '/alphabet' });
    await click(q(mounted.container, '[data-testid="alpha-practise"]'));
    expect(await finishSession('th')).toBe(10);
    expect(text(summary())).toMatch(/Practice finished: 10 right, 0 wrong\./);
    expect(text(summary())).toMatch(/Next review in 10 minutes\./);
    // back on the overview: the batch is being learned, the next one has not been opened by itself
    expect(text(q(head(0), '.lib__meta'))).toBe('learning');
    expect(text(q(head(1), '.lib__meta'))).toBe('not started');
    expect(q(mounted.container, '[data-testid="alpha-practise"]')).toBeNull();
    const s = await stored(h);
    expect(Object.keys(s.cards)).toHaveLength(10);
    expect(Object.values(s.cards).every((c) => c.box === 1)).toBe(true);
  });
});

describe('batches of 10 through the page', () => {
  it('opens the second batch only when the first is learned, and has "Start the next 10 now" for the learner who cannot wait', async () => {
    clock = T0;
    const h = await thai();
    mounted = await h.mount(page(), { router: '/alphabet' });
    await click(q(mounted.container, '[data-testid="alpha-practise"]'));
    await finishSession('th'); // the ten, once

    // ten minutes later they are due; nothing of letters 11–20 is offered with them
    await mounted.unmount();
    clock = T0 + 10 * MINUTE;
    mounted = await h.mount(page(), { router: '/alphabet' });
    expect(text(q(mounted.container, '[data-testid="alpha-count"]'))).toBe('10 to review');
    await click(q(mounted.container, '[data-testid="alpha-practise"]'));
    expect(await finishSession('th')).toBe(10);
    expect(text(summary())).toMatch(/Next review tomorrow\./);
    const s = await stored(h);
    expect(Object.keys(s.cards)).toHaveLength(10); // the 11th letter has not been touched
    expect(Object.values(s.cards).every((c) => c.box === 2)).toBe(true);

    // now batch 1 is learned and batch 2 opens by itself
    await mounted.unmount();
    mounted = await h.mount(page(), { router: '/alphabet' });
    expect(text(q(head(0), '.lib__meta'))).toBe('learned');
    expect(text(q(mounted.container, '[data-testid="alpha-count"]'))).toBe('10 new');
    expect(text(q(mounted.container, '.alpha'))).toMatch(/10 letters of 77 learned/);
    await click(q(mounted.container, '[data-testid="alpha-practise"]'));
    expect(glyph()).toBe('ซ'); // letter 11
  });

  it('starts the next 10 on request before the first batch is learned', async () => {
    clock = T0;
    const h = await thai();
    mounted = await h.mount(page(), { router: '/alphabet' });
    await click(q(mounted.container, '[data-testid="alpha-practise"]'));
    await finishSession('th');
    expect(q(mounted.container, '[data-testid="alpha-practise"]')).toBeNull(); // nothing due, nothing new
    await click(button(mounted.container, 'Start the next 10 now'));
    expect(glyph()).toBe('ซ');
    expect(phase()).toBe('intro');
    expect((await stored(h)).started).toBe(2);
  });
});

describe('resuming', () => {
  it('a new mount on the same store continues where the learner stopped', async () => {
    clock = T0;
    const h = await thai();
    mounted = await h.mount(page(), { router: '/alphabet' });
    await click(q(mounted.container, '[data-testid="alpha-practise"]'));
    await turn('th', true); // ก
    await turn('th', false); // ข (wrong, due at once)
    await turn('th', true); // ฃ
    expect(glyph()).toBe('ค');
    await mounted.unmount();

    // the same store, a new page: three letters have been met, one of them is due at once
    mounted = await h.mount(page(), { router: '/alphabet' });
    expect(text(q(head(0), '.lib__meta'))).toBe('learning');
    expect(text(q(mounted.container, '[data-testid="alpha-count"]'))).toBe('1 to review · 7 new');
    const boxes = qa(group(0), '.alpha__tile').map((t) => text(q(t, '.alpha__tile-box')));
    expect(boxes.slice(0, 4)).toEqual(['box 1', 'box 0', 'box 1', '']);
    // the met tiles show their answer, the others do not
    expect(text(q(qa(group(0), '.alpha__tile')[0], '.alpha__tile-answer'))).toBe('k /k/');
    expect(text(q(qa(group(0), '.alpha__tile')[3], '.alpha__tile-answer'))).toBe('');

    // practising goes to the due letter first, then to the unmet ones
    await click(q(mounted.container, '[data-testid="alpha-practise"]'));
    expect(glyph()).toBe('ข');
    expect(phase()).toBe('ask');
    await turn('th', true);
    expect(glyph()).toBe('ค');
    expect(phase()).toBe('intro');

    // ten minutes later the other two are due too
    await mounted.unmount();
    clock = T0 + 11 * MINUTE;
    mounted = await h.mount(page(), { router: '/alphabet' });
    expect(text(q(mounted.container, '[data-testid="alpha-count"]'))).toBe('3 to review · 7 new');
  });

  it('keeps one learner’s and one language’s state apart', async () => {
    clock = T0;
    const h = await thai();
    await h.store.meta.put({ id: alphabetMetaId('someone-else', 'th'), value: JSON.stringify({ version: 1, started: 1, cards: { 'th:consonant:ก': { box: 7, due: T0 + 90 * DAY, reps: 9, lapses: 0, last: T0 } } }), updatedAt: new Date(T0).toISOString() });
    mounted = await h.mount(page(), { router: '/alphabet' });
    expect(text(q(mounted.container, '.alpha'))).toMatch(/0 letters of 77 learned/);
    await click(q(mounted.container, '[data-testid="alpha-practise"]'));
    await turn('th', true);
    expect((await h.store.meta.get(alphabetMetaId('someone-else', 'th')))!.value).toContain('"box":7');
    expect(await h.store.meta.get(alphabetMetaId(USER, 'th'))).toBeDefined();
    expect(await h.store.meta.get(alphabetMetaId(USER, 'hi'))).toBeUndefined();
  });
});

describe('the drill (Hindi)', () => {
  it('asks what a sign does for the marks and the sound for a letter', async () => {
    clock = T0;
    const h = await hindi();
    mounted = await h.mount(page(), { router: '/alphabet' });
    await click(q(mounted.container, '[data-testid="alpha-practise"]'));
    expect(glyph()).toBe('अ');
    expect(q(mounted.container, '[data-testid="alpha-glyph"]')!.getAttribute('lang')).toBe('hi');
    expect(text(q(mounted.container, '[data-testid="alpha-answer"]'))).toBe('a /ə/');
    await turn('hi', true);
    expect(glyph()).toBe('आ');
    const s = await stored(h, 'hi');
    expect(s.cards['hi:vowel:अ'].box).toBe(1);
  });
});

describe('the Read page entry', () => {
  it('shows the Alphabet line for Thai and Hindi, linking to /alphabet', async () => {
    for (const make of [thai, hindi]) {
      const h = await make();
      mounted = await h.mount(app(), { router: '/read' });
      const link = qa<HTMLAnchorElement>(mounted.container, 'a').find((a) => a.textContent === 'Alphabet');
      expect(link, 'Alphabet link').toBeDefined();
      expect(link!.getAttribute('href')).toBe('/alphabet');
      expect(text(link!.parentElement)).toBe('Alphabet · learn the letters, 10 at a time');
      // and it sits beside the Team Texts line
      expect(qa(mounted.container, 'a').some((a) => a.textContent === 'Team Texts')).toBe(true);
      await mounted.unmount();
      mounted = undefined;
    }
  });

  it('does not show it for Spanish or German', async () => {
    for (const make of [() => makeHarness(), () => makeHarness({ courseId: GERMAN_COURSE_ID, streams: GERMAN_STREAMS })]) {
      const h = await make();
      mounted = await h.mount(app(), { router: '/read' });
      await flush();
      expect(qa(mounted.container, 'a').some((a) => a.getAttribute('href') === '/alphabet')).toBe(false);
      expect(text(mounted.container)).not.toMatch(/learn the letters/);
      expect(qa(mounted.container, 'a').some((a) => a.textContent === 'Team Texts')).toBe(true);
      await mounted.unmount();
      mounted = undefined;
    }
  });
});

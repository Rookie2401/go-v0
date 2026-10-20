// @vitest-environment jsdom
/**
 * Guided help in the testimony editor (docs/GOTELL-GUIDED.md, Package C): the hint is drawn behind the text and never
 * inserted; it appears only once a letter of a word is typed; "(water)" supplies the word, which stays in italics.
 * The word index and the reverse dictionary are scripted; the prediction rules themselves are the real engine's.
 */
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import { Testimony } from '../../src/ui/testimony/Testimony';
import { getPref, setPref } from '../../src/ui/prefs';
import { button, byLabel, click, flush, installMediaStubs, makeHarness, q, qa } from './harness';
import type { Harness, Mounted } from './harness';
import type { WordIndex } from '../../src/gotell/predict';

const hoisted = vi.hoisted(() => ({
  lookup: vi.fn(async (_english: string): Promise<Array<{ lemma: string; pos?: string; frequencyRank?: number }>> => []),
  build: vi.fn(),
}));

vi.mock('../../src/dict/reverse', () => ({
  createReverseSource: () => ({ lookupEnglish: hoisted.lookup }),
}));
vi.mock('../../src/gotell/predict', async (importActual) => {
  const actual = await importActual<typeof import('../../src/gotell/predict')>();
  return { ...actual, buildWordIndex: hoisted.build };
});

const word = (normalized: string, count: number, surface = normalized) => ({
  itemId: `form:es:${normalized}`, normalized, surface, count, level: 'recognized' as const,
});
function makeIndex(): WordIndex {
  const words = new Map([word('casa', 6), word('caso', 1), word('agua', 4), word('creo', 3), word('dios', 5, 'Dios')].map((w) => [w.normalized, w]));
  return { lang: 'es', userId: 'u1', words, bigrams: new Map(), builtAt: '2026-01-01T00:00:00.000Z', textCount: 3 };
}

let h: Harness;
let mounted: Mounted | undefined;

beforeEach(async () => {
  installMediaStubs();
  hoisted.lookup.mockReset();
  hoisted.lookup.mockImplementation(async () => []);
  hoisted.build.mockReset();
  hoisted.build.mockImplementation(async () => makeIndex());
  h = await makeHarness();
  h.services.adapters = createAdapterRegistry(); // the UI harness has none; guided help needs the language adapter
  mounted = await h.mount(<Testimony />);
});
afterEach(async () => { await mounted?.unmount(); mounted = undefined; vi.unstubAllGlobals(); });

const editor = () => byLabel<HTMLTextAreaElement>(mounted!.container, 'Your testimony');
const ghost = () => q(mounted!.container, '.ghost-editor__backdrop .ghost');
const backdrop = () => q(mounted!.container, '.ghost-editor__backdrop')!;

/** Type the whole value with the caret where a real keystroke would leave it (the harness `type()` does not move it). */
async function typeAt(value: string, caret = value.length) {
  const el = editor();
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.selectionStart = el.selectionEnd = caret;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await flush(3);
}

describe('Your Testimony: the page', () => {
  it('is titled "Your Testimony", has no link to the practice page, and offers Guided help with its note', () => {
    const c = mounted!.container;
    expect(c.textContent).toContain('Your Testimony');
    expect(qa<HTMLAnchorElement>(c, 'a').some((a) => (a.getAttribute('href') ?? '').startsWith('/tell'))).toBe(false);
    expect(c.textContent).not.toContain('Practise saying parts of your testimony');
    const box = byLabel<HTMLInputElement>(c, 'Guided help');
    expect(box.type).toBe('checkbox');
    expect(box.checked).toBe(true);
    expect(c.textContent).toContain('Shows a faint hint of a word you know as you type it. Nothing is typed for you.');
    expect(getPref('guidedHelp')).toBe(true);
  });

  it('keeps the textarea (labelled, in the target language) over an aria-hidden backdrop', () => {
    expect(editor().getAttribute('lang')).toBe('es');
    expect(backdrop().getAttribute('aria-hidden')).toBe('true');
    expect(editor().closest('.ghost-editor')).toBe(backdrop().closest('.ghost-editor'));
    expect(backdrop().textContent?.endsWith('​')).toBe(true); // keeps the last line's height
  });
});

describe('the hint (ghost)', () => {
  it('appears only once a letter of a word is typed, never at a boundary', async () => {
    await typeAt('Yo ');
    expect(ghost()).toBeNull();
    await typeAt('Yo c');
    expect(ghost()?.textContent).toBe('asa');
    await typeAt('Yo casa ');
    expect(ghost()).toBeNull();
    await typeAt('');
    expect(ghost()).toBeNull();
  });

  it('shrinks letter by letter, switches words when the typed letters stop matching, and ends on an exact match', async () => {
    await typeAt('Yo c');
    expect(ghost()?.textContent).toBe('asa'); // casa is read more often than caso
    await typeAt('Yo ca');
    expect(ghost()?.textContent).toBe('sa');
    await typeAt('Yo cas');
    expect(ghost()?.textContent).toBe('a');
    await typeAt('Yo casa');
    expect(ghost()).toBeNull();
    await typeAt('Yo caso'.slice(0, 6));
    await typeAt('Yo casx');
    expect(ghost()).toBeNull();
    await typeAt('Yo a');
    expect(ghost()?.textContent).toBe('gua');
  });

  it('is drawn at the caret in the backdrop and is never part of the text', async () => {
    await typeAt('Yo ca');
    const text = backdrop().textContent!;
    expect(text.replace('​', '')).toBe('Yo casa');
    expect(backdrop().querySelector('.ghost')?.previousSibling?.textContent).toBe('Yo ca');
    expect(editor().value).toBe('Yo ca');
    expect(editor().style.color).toBe(''); // transparency comes from the stylesheet; the value is untouched
  });

  it('does not appear when the caret sits inside a word', async () => {
    await typeAt('Yo cb', 4); // caret between c and b
    expect(ghost()).toBeNull();
  });

  it('is never inserted: Tab, Enter and the arrows change nothing', async () => {
    await typeAt('Yo c');
    for (const key of ['Tab', 'Enter', 'ArrowRight', 'ArrowDown', 'End']) {
      await act(async () => { editor().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
    }
    await flush(2);
    expect(editor().value).toBe('Yo c');
    expect(ghost()?.textContent).toBe('asa');
  });

  it('is switched off by the Guided help checkbox, and the choice is kept', async () => {
    await typeAt('Yo c');
    expect(ghost()).not.toBeNull();
    await click(byLabel(mounted!.container, 'Guided help'));
    expect(getPref('guidedHelp')).toBe(false);
    expect(ghost()).toBeNull();
    await typeAt('Yo ca');
    expect(ghost()).toBeNull();
    await click(byLabel(mounted!.container, 'Guided help'));
    expect(ghost()?.textContent).toBe('sa');
  });

  it('is not predicted while an input method is composing, and returns when composition ends', async () => {
    await act(async () => { editor().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); });
    await typeAt('Yo c');
    expect(ghost()).toBeNull();
    await act(async () => { editor().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); });
    await flush(3);
    expect(ghost()?.textContent).toBe('asa');
  });

  it('does not pick up words the learner does not know', async () => {
    await typeAt('Yo z');
    expect(ghost()).toBeNull();
  });
});

describe('English in parentheses', () => {
  beforeEach(() => {
    hoisted.lookup.mockImplementation(async (english) => (english === 'water' ? [{ lemma: 'agua' }] : english === 'fox' ? [{ lemma: 'zorro' }] : []));
  });

  it('supplies the word as a hint after one space (a known word is not marked new)', async () => {
    await typeAt('Yo bebo (water)');
    expect(hoisted.lookup).toHaveBeenCalledWith('water');
    expect(ghost()?.textContent).toBe(' agua');
    expect(ghost()?.classList.contains('ghost--new')).toBe(false);
    expect(editor().value).toBe('Yo bebo (water)'); // nothing inserted
  });

  it('marks a word the learner has never met as new', async () => {
    await typeAt('Yo veo un (fox)');
    expect(ghost()?.textContent).toBe(' zorro');
    expect(ghost()?.classList.contains('ghost--new')).toBe(true);
  });

  it('shrinks as the supplied word is typed, and shows nothing once it goes wrong', async () => {
    await typeAt('Yo bebo (water) a');
    expect(ghost()?.textContent).toBe('gua');
    await typeAt('Yo bebo (water) ag');
    expect(ghost()?.textContent).toBe('ua');
    await typeAt('Yo bebo (water) ax');
    expect(ghost()).toBeNull();
    expect(editor().value).toBe('Yo bebo (water) ax');
  });

  it('works with guided help off', async () => {
    await click(byLabel(mounted!.container, 'Guided help'));
    await typeAt('Yo bebo (water)');
    expect(ghost()?.textContent).toBe(' agua');
  });

  it('shows nothing when the dictionary has no word for it', async () => {
    await typeAt('Yo bebo (zzyzx)');
    expect(ghost()).toBeNull();
  });

  it('on the last letter deletes the parenthetical, keeps the word in italics and puts the caret after it', async () => {
    await typeAt('Yo bebo (water)');
    await typeAt('Yo bebo (water) agua');
    expect(editor().value).toBe('Yo bebo agua');
    expect(editor().selectionStart).toBe('Yo bebo agua'.length);
    const italic = backdrop().querySelector('i.supplied');
    expect(italic?.textContent).toBe('agua');
    expect(ghost()).toBeNull();
    // permanently: later text does not disturb it, and typing before it moves it along
    await typeAt('Yo bebo agua.');
    expect(backdrop().querySelector('i.supplied')?.textContent).toBe('agua');
    await typeAt('Hoy yo bebo agua.', 3);
    expect(backdrop().querySelector('i.supplied')?.textContent).toBe('agua');
    expect(backdrop().textContent).toContain('Hoy yo bebo ');
  });

  it('accepts the word typed in a different case, and without the space', async () => {
    await typeAt('Yo bebo (water)');
    await typeAt('Yo bebo (water)Agua');
    expect(editor().value).toBe('Yo bebo Agua');
    expect(backdrop().querySelector('i.supplied')?.textContent).toBe('Agua');
  });

  it('forgets the request when the parenthetical is edited away', async () => {
    await typeAt('Yo bebo (water)');
    expect(ghost()).not.toBeNull();
    await typeAt('Yo bebo (wate)');
    expect(ghost()).toBeNull();
    await typeAt('Yo bebo ');
    expect(ghost()).toBeNull();
  });
});

describe('evidence: what travels with a saved version', () => {
  it('passes the supplied word and its range to acceptRevision, and rebuilds the word index', async () => {
    hoisted.lookup.mockImplementation(async () => [{ lemma: 'agua' }]);
    await typeAt('Yo bebo (water)');
    await typeAt('Yo bebo (water) agua');
    const builds = hoisted.build.mock.calls.length;
    await click(button(mounted!.container, 'Save this version'));
    await flush(6);
    const call = h.tell.acceptRevision.mock.calls[0] as unknown as unknown[];
    expect(call[1]).toBe('Yo bebo agua');
    expect(call[2]).toEqual({
      assist: { supplied: [{ start: 8, end: 12 }], guided: [] },
      supplied: [{ english: 'water', surface: 'agua', itemId: 'form:es:agua', known: true }],
    });
    expect(hoisted.build.mock.calls.length).toBe(builds + 1);
  });

  it('records a word typed while its hint was showing as guided, once the word is finished', async () => {
    await typeAt('Yo c');
    await typeAt('Yo ca');
    await typeAt('Yo cas');
    await typeAt('Yo casa');
    await typeAt('Yo casa '); // the boundary finishes the word
    await click(button(mounted!.container, 'Save this version'));
    await flush(6);
    const call = h.tell.acceptRevision.mock.calls[0] as unknown as unknown[];
    expect(call[2]).toEqual({ assist: { supplied: [], guided: [{ start: 3, end: 7 }] }, supplied: [] });
  });

  it('does not count a word typed without a hint, or one that differs from the hinted word', async () => {
    await typeAt('Yo c');
    await typeAt('Yo ca');
    await typeAt('Yo cax');
    await typeAt('Yo cax ');
    await typeAt('Yo cax pecado');
    await click(button(mounted!.container, 'Save this version'));
    await flush(6);
    expect(h.tell.acceptRevision.mock.calls[0]).toHaveLength(2); // nothing to report: called as before
  });

  it('autosave carries the assist once there is one', async () => {
    hoisted.lookup.mockImplementation(async () => [{ lemma: 'agua' }]);
    await typeAt('Yo bebo (water)');
    await typeAt('Yo bebo (water) agua');
    await act(async () => { editor().dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    await flush(6);
    const opts = h.tell.saveDraft.mock.calls.at(-1)![3] as unknown as { assist?: unknown };
    expect(opts.assist).toEqual({ supplied: [{ start: 8, end: 12 }], guided: [] });
  });

  it('autosave of plain writing is exactly as before (no assist key)', async () => {
    await typeAt('Yo creo en Dios.');
    await act(async () => { editor().dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    await flush(6);
    expect(h.tell.saveDraft).toHaveBeenLastCalledWith('u1', 'es', 'Yo creo en Dios.', { expectedSeq: 0, basedOnRevisionId: undefined });
  });
});

describe('the default', () => {
  it('guided help is on until the learner turns it off', () => {
    setPref('guidedHelp', true);
    expect(getPref('guidedHelp')).toBe(true);
  });
});

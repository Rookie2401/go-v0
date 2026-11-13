// @vitest-environment jsdom
/**
 * GoLearn Active reads every language of the learner's that a page holds (the owner, 2026-11-09: "make it recognize whatever language is
 * currently present on the page"). Measured on the owner's page (Mechon Mamre, Psalm 110: Hebrew beside English, no lang attribute):
 * with Albanian selected the page was read as Albanian, its English words were underlined as Albanian and its Hebrew was not read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActiveMode } from '../../packages/golearn-extension/src/content/active';
import type { HighlightLike } from '../../packages/golearn-extension/src/active/highlight';
import { latinLanguageOf, planPage, wordInScript } from '../../packages/golearn-extension/src/active/pageLanguages';
import { clearAnalysers, getAnalyser, registerAnalyser } from '../../packages/golearn-extension/src/parser';
import type { KnowledgeView, ProfileReply } from '../../packages/golearn-extension/src/protocol';
import { heAdapter } from '../../src/adapters/he';
import { esAdapter } from '../../src/adapters/es';
import { sqAdapter } from '../../src/adapters/sq';
import { flush, makeRig, setBody, stubLayout, type Rig } from './dom';

class FakeHighlight implements HighlightLike {
  ranges = new Set<Range>();
  add(r: Range) { this.ranges.add(r); return this; }
  delete(r: Range) { return this.ranges.delete(r); }
  clear() { this.ranges.clear(); }
  get size() { return this.ranges.size; }
}
const w = window as unknown as { CSS?: { highlights?: Map<string, HighlightLike> }; Highlight?: typeof FakeHighlight };

const he = (...cps: number[]): string => String.fromCharCode(...cps);
// unpointed Hebrew built from code points (never typed): God, the land, the heavens, and, said
const ELOHIM = he(0x5D0, 0x5DC, 0x5D4, 0x5D9, 0x5DD);
const HAARETS = he(0x5D4, 0x5D0, 0x5E8, 0x5E5);
const HASHAMAYIM = he(0x5D4, 0x5E9, 0x5DE, 0x5D9, 0x5DD);
const VEET = he(0x5D5, 0x5D0, 0x5EA);
const HEBREW = `${ELOHIM} ${HASHAMAYIM} ${VEET} ${HAARETS}`;
const ENGLISH = 'The Lord saith unto my lord: Sit thou at my right hand, until I make thine enemies thy footstool.';
const ALBANIAN = 'Unë lexoj librin në shtëpi çdo ditë me motrën time.';

let restore: () => void;
let registry: Map<string, HighlightLike>;
let rig: Rig;
let active: ActiveMode | undefined;

beforeEach(() => {
  restore = stubLayout();
  registry = new Map();
  w.CSS = { highlights: registry }; w.Highlight = FakeHighlight;
  registerAnalyser('he', heAdapter);
  rig = makeRig({ analysers: ['sq', 'he'] });
});
afterEach(() => {
  active?.stop(); active = undefined;
  rig.controller.dispose(); restore(); clearAnalysers(['sq']);
  w.CSS = undefined; w.Highlight = undefined; document.documentElement.removeAttribute('lang');
});

const profile = async (): Promise<ProfileReply> => ({ ok: true, connected: false, source: 'device', rows: {} as Record<string, KnowledgeView>, depth: 'brief', depthOrigin: 'default' });
function make(): ActiveMode {
  active = new ActiveMode({ doc: document, controller: rig.controller, adapters: rig.deps.adapters, ui: rig.ui, adapterOf: getAnalyser, profile, viewport: 'all' });
  return active;
}
const marked = (): string[] => [...registry.values()].flatMap((h) => [...(h as FakeHighlight).ranges].map((r) => r.toString()));
const englishWords = ENGLISH.match(/[A-Za-z]+/g)!;

describe('a page in several languages', () => {
  it('Hebrew beside English with no declared language (the Psalm page): the Hebrew is read as Hebrew, the English is left alone', async () => {
    setBody(`<table><tr><td id="h">${HEBREW}</td><td id="e">1 ${ENGLISH}</td></tr></table>`);
    const s = await make().start({ speak: false });
    expect(s.languages).toEqual(['he']);
    expect(s.languageId).toBe('he');
    const m = marked();
    expect(m.some((x) => /\p{Script=Hebrew}/u.test(x))).toBe(true);
    expect(m.filter((x) => englishWords.includes(x))).toEqual([]); // before: English words the Albanian list happens to hold were underlined as Albanian
  });

  it('Albanian, Hebrew and English on one page: the Albanian and the Hebrew are both read, each in its own language; the English is not', async () => {
    setBody(`<p id="a">${ALBANIAN}</p><p id="h">${HEBREW}</p><p id="e">${ENGLISH}</p>`);
    const s = await make().start({ speak: false });
    expect(new Set(s.languages)).toEqual(new Set(['sq', 'he']));
    const m = marked();
    expect(m).toContain('lexoj');
    expect(m.some((x) => /\p{Script=Hebrew}/u.test(x))).toBe(true);
    expect(m.filter((x) => englishWords.includes(x))).toEqual([]);
  });

  it('a word clicked is looked up in the language it was read in', async () => {
    setBody(`<p id="a">${ALBANIAN}</p><p id="h">${HEBREW}</p>`);
    await make().start({ speak: false });
    const lookup = vi.spyOn(rig.controller, 'lookup').mockResolvedValue({ status: 'silent', reason: 'test' });
    const node = document.getElementById('h')!.firstChild as Text;
    Object.defineProperty(document, 'caretRangeFromPoint', { configurable: true, value: () => { const r = document.createRange(); r.setStart(node, 2); r.setEnd(node, 2); return r; } });
    document.getElementById('h')!.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, clientX: 5, clientY: 5 }));
    for (let i = 0; i < 20 && !lookup.mock.calls.length; i++) await flush(10);
    expect(lookup).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'click', languageOverride: 'he' }));
    Reflect.deleteProperty(document, 'caretRangeFromPoint');
  });

  it('a page with none of the learner\'s languages says so and underlines nothing', async () => {
    setBody(`<p>${ENGLISH}</p><p>${ENGLISH}</p>`);
    const s = await make().start({ speak: false });
    expect(s.languages).toBeUndefined();
    expect(marked()).toEqual([]);
    expect(s.reason).toMatch(/found no words in your languages/);
  });
});

describe('deciding the language of each piece of text', () => {
  const blocks = (html: string): Text[] => {
    setBody(html);
    const out: Text[] = [];
    const walk = document.createTreeWalker(document.body, 4);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if ((n as Text).data.trim()) out.push(n as Text);
    return out;
  };
  const adapterOf = (l: string) => ({ sq: sqAdapter, he: heAdapter, es: esAdapter } as Record<string, typeof sqAdapter>)[l];

  it('a script read by one pack decides by itself; Latin-script blocks are decided one by one; a block in no installed language is left out', () => {
    const nodes = blocks(`<p>${ALBANIAN}</p><p>${HEBREW}</p><p>${ENGLISH}</p>`);
    const plan = planPage(nodes, { installed: ['sq', 'he'], adapterOf });
    expect(plan.byLanguage.get('sq')?.map((n) => n.data)).toEqual([ALBANIAN]);
    expect(plan.byLanguage.get('he')?.map((n) => n.data)).toEqual([HEBREW]);
    expect([...plan.byLanguage.values()].flat().some((n) => n.data === ENGLISH)).toBe(false);
  });

  it('a mixed-script text node is read in both of its languages, each keeping its own script\'s words', () => {
    const nodes = blocks(`<p>${ALBANIAN} ${ELOHIM}</p>`);
    const plan = planPage(nodes, { installed: ['sq', 'he'], adapterOf });
    expect(plan.nodeLanguages.get(nodes[0])).toEqual(['he', 'sq']);
    expect(wordInScript(ELOHIM, 'he')).toBe(true);
    expect(wordInScript(ELOHIM, 'sq')).toBe(false);
    expect(wordInScript('lexoj', 'he')).toBe(false);
  });

  it('a declared lang= decides a block: a pack language the learner has, or a language with no pack (nothing read)', () => {
    const nodes = blocks(`<p lang="sq">${ENGLISH}</p><p lang="en">${ALBANIAN}</p>`);
    const plan = planPage(nodes, { installed: ['sq', 'he'], adapterOf });
    expect(plan.byLanguage.get('sq')?.map((n) => n.data)).toEqual([ENGLISH]);
  });

  it('a block too short to tell takes the page\'s language only when that rests on evidence; never the selected language alone', () => {
    const latin = [{ id: 'sq', adapter: sqAdapter }, { id: 'es', adapter: esAdapter }];
    expect(latinLanguageOf('Psalm 110', latin, undefined)).toEqual({ why: 'short' });
    expect(latinLanguageOf('Psalm 110', latin, 'sq')).toEqual({ languageId: 'sq', why: 'page' });
    // the page's language holds a block no other language claims; another language that clearly reads it takes it
    expect(latinLanguageOf(ALBANIAN, latin, 'sq').languageId).toBe('sq');
    expect(latinLanguageOf('Los niños leyeron los libros en casa con su madre.', latin, 'sq').languageId).toBe('es');
    expect(latinLanguageOf(ENGLISH, latin, undefined)).toEqual({ why: 'none' });
  });
});

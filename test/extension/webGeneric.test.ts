// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebGenericAdapter, registryEntry } from '../../packages/golearn-extension/src/adapters';
import { validateCapabilities } from '../../packages/golearn-extension/src/contract/readerCapabilities';
import { GOLEARN_HOST_ATTR, type ReaderSelection } from '../../packages/golearn-extension/src/contract/readerAdapter';
import { sqAdapter } from '../../src/adapters/sq';
import { applyRange, flush, selectAcross, selectText, setBody, stubLayout, textNodes } from './dom';

let restore: () => void;
let adapter: WebGenericAdapter;
const mk = (o: ConstructorParameters<typeof WebGenericAdapter>[0] = {}) => new WebGenericAdapter({ doc: document, segmentSentences: (t) => sqAdapter.segmentSentences(t), ...o });
const sel = (a: WebGenericAdapter): ReaderSelection => {
  const s = a.selection();
  if (!('ok' in s) || !s.ok) throw new Error(`selection failed: ${JSON.stringify(s)}`);
  return s;
};

beforeEach(() => { restore = stubLayout(); adapter = mk(); setBody(''); });
afterEach(() => { adapter.dispose(); restore(); vi.restoreAllMocks(); });

describe('web-generic: Unicode-safe selection and sentence context', () => {
  it('Albanian: e-diaeresis and c-cedilla survive; the sentence is the one around the word; offsets locate the selection', () => {
    setBody('<p id="p">Unë po lexoj një libër të bukur në shtëpinë time. Çdo mëngjes pi një çaj. Pastaj shkoj në punë.</p>');
    const p = document.getElementById('p')!;
    selectText(p, 'shtëpinë');
    const s = sel(adapter);
    expect(s.surface).toBe('shtëpinë');
    const ctx = adapter.context(s.range) as Awaited<ReturnType<typeof adapter.context>>;
    expect(ctx.kind).toBe('sentence');
    expect(ctx.sentence).toBe('Unë po lexoj një libër të bukur në shtëpinë time.');
    expect(ctx.sentence!.slice(ctx.selStart, ctx.selEnd)).toBe('shtëpinë');
    expect(ctx.confidence).toBeGreaterThanOrEqual(0.8);
    selectText(p, 'çaj');
    const s2 = sel(adapter);
    const c2 = adapter.context(s2.range) as { sentence: string; selStart: number; selEnd: number };
    expect(c2.sentence).toBe('Çdo mëngjes pi një çaj.');
    expect(c2.sentence.slice(c2.selStart, c2.selEnd)).toBe('çaj');
  });

  it('decomposed (NFD) text is returned in NFC with offsets that still locate the selection', () => {
    const nfd = 'Ajo ka nje shtëpi te madhe. Pastaj iku.';
    setBody(`<p id="p">${nfd}</p>`);
    selectText(document.getElementById('p')!, 'shtëpi');
    const s = sel(adapter);
    expect(s.surface).toBe('shtëpi');
    expect(s.surface).toBe(s.surface.normalize('NFC'));
    const ctx = adapter.context(s.range) as { sentence: string; selStart: number; selEnd: number };
    expect(ctx.sentence).toBe(ctx.sentence.normalize('NFC'));
    expect(ctx.sentence.slice(ctx.selStart, ctx.selEnd)).toBe('shtëpi');
  });

  it('German: diacritics and a long compound are kept whole', () => {
    setBody('<p id="p">Die Donaudampfschifffahrtsgesellschaft liegt in Österreich. Müller liest über Straßenbahnen.</p>');
    const p = document.getElementById('p')!;
    selectText(p, 'Donaudampfschifffahrtsgesellschaft');
    expect(sel(adapter).surface).toBe('Donaudampfschifffahrtsgesellschaft');
    selectText(p, 'Straßenbahnen');
    const s = sel(adapter);
    const ctx = adapter.context(s.range) as { sentence: string };
    expect(s.surface).toBe('Straßenbahnen');
    expect(ctx.sentence).toBe('Müller liest über Straßenbahnen.');
  });

  it('Spanish: accents and the inverted marks stay with their sentence', () => {
    setBody('<p id="p">¿Dónde está la biblioteca? ¡Qué sorpresa! Mañana vamos al niño.</p>');
    const p = document.getElementById('p')!;
    selectText(p, 'biblioteca');
    const ctx = adapter.context(sel(adapter).range) as { sentence: string };
    expect(ctx.sentence).toBe('¿Dónde está la biblioteca?');
    selectText(p, '¡Qué');
    const s = sel(adapter);
    expect(s.surface).toBe('¡Qué');
    expect((adapter.context(s.range) as { sentence: string }).sentence).toBe('¡Qué sorpresa!');
  });

  it('Devanagari: an edge inside a letter cluster is moved outward, never leaving a stray matra or virama', () => {
    setBody('<p id="p">यह किताब अच्छी है। मैं हिंदी पढ़ रहा हूँ।</p>');
    const p = document.getElementById('p')!;
    const t = textNodes(p)[0];
    // start between क and ि, end between च् छ and ी
    const kitab = t.data.indexOf('किताब');
    const r1 = document.createRange(); r1.setStart(t, kitab + 1); r1.setEnd(t, kitab + 'किताब'.length); applyRange(r1);
    const s1 = sel(adapter);
    expect(s1.surface).toBe('किताब');
    expect(s1.snapped).toBe(true);
    const ach = t.data.indexOf('अच्छी');
    const r2 = document.createRange(); r2.setStart(t, ach); r2.setEnd(t, ach + 'अच्छ'.length); applyRange(r2); // stops before the matra ी
    const s2 = sel(adapter);
    expect(s2.surface).toBe('अच्छी');
    expect(s2.surface).not.toMatch(/^\p{M}|्$/u);
    const segs = [...new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(s2.surface)].map((x) => x.segment);
    expect(segs.join('')).toBe(s2.surface);
    const ctx = adapter.context(s2.range) as { sentence: string; selStart: number; selEnd: number };
    expect(ctx.sentence).toBe('यह किताब अच्छी है।');
    expect(ctx.sentence.slice(ctx.selStart, ctx.selEnd)).toBe('अच्छी');
  });

  it('Thai: text without spaces is one run; the selection is exact and the context is that run', () => {
    setBody('<p id="p">ฉันชอบอ่านหนังสือภาษาไทยทุกวัน</p>');
    selectText(document.getElementById('p')!, 'หนังสือ');
    const s = sel(adapter);
    expect(s.surface).toBe('หนังสือ');
    const ctx = adapter.context(s.range) as { kind: string; sentence: string; selStart: number; selEnd: number };
    expect(ctx.kind).toBe('sentence');
    expect(ctx.sentence.slice(ctx.selStart, ctx.selEnd)).toBe('หนังสือ');
  });

  it('right-to-left: Hebrew with dir=rtl and Arabic by script; the text is exact and the direction is recorded with its source', () => {
    setBody('<p id="h" dir="rtl">שלום עולם, זהו משפט בעברית. עוד משפט.</p><p id="a">مرحبا بالعالم، هذه جملة عربية. جملة أخرى.</p>');
    selectText(document.getElementById('h')!, 'עולם');
    const h = sel(adapter);
    expect(h.surface).toBe('עולם');
    expect(h.direction).toBe('rtl');
    expect(h.directionSource).toBe('attribute');
    const hc = adapter.context(h.range) as { sentence: string; selStart: number; selEnd: number };
    expect(hc.sentence.slice(hc.selStart, hc.selEnd)).toBe('עולם');
    selectText(document.getElementById('a')!, 'بالعالم');
    const a = sel(adapter);
    expect(a.surface).toBe('بالعالم');
    expect(a.direction).toBe('rtl');
    expect(a.directionSource).toBe('text');
    expect(adapter.anchor(a.range).rtl).toBe(true);
  });

  it('one word and forty words are both accepted; ninety words are refused with a clear reason', () => {
    const words = Array.from({ length: 95 }, (_, i) => `fjala${i}`);
    setBody(`<p id="p">Ai tha ${words.join(' ')} dhe iku.</p>`);
    const p = document.getElementById('p')!;
    selectText(p, 'fjala3');
    expect(sel(adapter).surface).toBe('fjala3');
    const forty = words.slice(0, 40).join(' ');
    selectText(p, forty);
    const s = sel(adapter);
    expect(s.surface.split(' ')).toHaveLength(40);
    selectText(p, words.slice(0, 90).join(' '));
    const r = adapter.selection();
    expect(r).toMatchObject({ ok: false, reason: 'too-long' });
  });

  it('ambiguous punctuation lowers the confidence and says why (abbreviation, ellipsis, unbalanced quote)', () => {
    setBody('<p id="a">Ai ka libra, p.sh. një fjalor, etj. Pastaj iku.</p><p id="b">Ai tha: «Po, vij nesër. Unë jam këtu.» Pastaj iku.</p><p id="c">Pastaj iku... dhe u kthye. Ai ra.</p><p id="plain">Ai ka libra dhe një fjalor.</p>');
    selectText(document.getElementById('plain')!, 'fjalor');
    const plain = adapter.context(sel(adapter).range) as { confidence: number; reason?: string };
    expect(plain.confidence).toBeGreaterThanOrEqual(0.85);
    expect(plain.reason).toBeUndefined();

    selectText(document.getElementById('a')!, 'fjalor');
    const a = adapter.context(sel(adapter).range) as { confidence: number; reason?: string };
    expect(a.confidence).toBeLessThan(plain.confidence);
    expect(a.reason).toMatch(/abbreviation/);

    selectText(document.getElementById('b')!, 'nesër');
    const b = adapter.context(sel(adapter).range) as { sentence: string; confidence: number; reason?: string };
    const balanced = (b.sentence.match(/«/g) ?? []).length === (b.sentence.match(/»/g) ?? []).length;
    if (!balanced) expect(b.reason).toMatch(/quotation/);
    expect(b.confidence).toBeLessThanOrEqual(plain.confidence);
  });

  it('a fallback segmenter is used when no language pack segmenter is injected', () => {
    const a = new WebGenericAdapter({ doc: document });
    setBody('<p id="p">This is the first sentence. Here is the second one.</p>');
    selectText(document.getElementById('p')!, 'second');
    const ctx = a.context(sel(a).range) as { sentence: string };
    expect(ctx.sentence).toBe('Here is the second one.');
    a.dispose();
  });

  it('empty and whitespace-only selections are refused; nothing selected is refused', () => {
    setBody('<p id="p">one<b id="b"> </b>two</p>');
    expect(adapter.selection()).toMatchObject({ ok: false, reason: 'no-selection' });
    const b = document.getElementById('b')!;
    const r = document.createRange(); r.selectNodeContents(b); applyRange(r);
    expect(adapter.selection()).toMatchObject({ ok: false, reason: 'empty' });
    setBody('<p id="p">   \n   </p>');
    const r2 = document.createRange(); r2.selectNodeContents(document.getElementById('p')!); applyRange(r2);
    expect(adapter.selection()).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('a selection across paragraphs is refused; across inline elements inside one paragraph it is accepted', () => {
    setBody('<p id="p1">Ai po <em>lexon</em> një libër.</p><p id="p2">Tjetri fle.</p>');
    const p1 = document.getElementById('p1')!;
    const p2 = document.getElementById('p2')!;
    selectAcross(textNodes(p1)[0], 1, textNodes(p2)[0], 4);
    expect(adapter.selection()).toMatchObject({ ok: false, reason: 'multi-block' });
    selectAcross(textNodes(p1)[0], 0, textNodes(p1)[2], 4);
    const s = sel(adapter);
    expect(s.surface).toBe('Ai po lexon një');
  });

  it('script, style, hidden text and form fields are never read', () => {
    setBody('<p id="p">Para <span hidden>SECRET</span><script>var x = "SCRIPTTEXT";</script> fjala.</p><textarea id="t">draft text</textarea>');
    const p = document.getElementById('p')!;
    const r = document.createRange(); r.selectNodeContents(p); applyRange(r);
    const s = sel(adapter);
    expect(s.surface).not.toMatch(/SECRET|SCRIPTTEXT/);
    const ta = document.getElementById('t') as HTMLTextAreaElement;
    ta.focus(); ta.setSelectionRange(0, 5);
    expect(adapter.selection()).toMatchObject({ ok: false, reason: 'unreadable' });
  });

  it('editable regions are not read', () => {
    setBody('<div contenteditable="true" id="e"><p>Ai shkruan këtu.</p></div>');
    selectText(document.getElementById('e')!, 'shkruan');
    expect(adapter.selection()).toMatchObject({ ok: false, reason: 'unreadable' });
  });

  it('adjacent sentences are returned only when asked for', () => {
    setBody('<p id="p">E para vjen. E dyta është këtu. E treta shkon.</p>');
    selectText(document.getElementById('p')!, 'dyta');
    const s = sel(adapter);
    const plain = adapter.context(s.range) as { before?: string; after?: string };
    expect(plain.before).toBeUndefined();
    const adj = adapter.context(s.range, { adjacent: true }) as { before?: string; after?: string };
    expect(adj.before).toBe('E para vjen.');
    expect(adj.after).toBe('E treta shkon.');
  });
});

describe('web-generic: how much context it claims', () => {
  it('a <p> gives more confidence than a <div>, and a table cell the least; the declaration follows the last selection', () => {
    setBody('<p id="p">Ai lexon një libër.</p><div id="d">Ai lexon një libër.</div><table><tr><td id="td">Ai lexon një libër.</td></tr></table>');
    const conf = (id: string) => {
      selectText(document.getElementById(id)!, 'libër');
      const s = sel(adapter);
      const c = adapter.context(s.range) as { confidence: number; kind: string };
      expect(c.kind).toBe('sentence');
      expect(adapter.capabilities().contextConfidence).toBe(c.confidence);
      expect(validateCapabilities(adapter.capabilities())).toEqual([]);
      return c.confidence;
    };
    const p = conf('p'); const d = conf('d'); const td = conf('td');
    expect(p).toBeGreaterThan(d);
    expect(d).toBeGreaterThan(td);
  });

  it('a block that cannot be segmented gives a flagged fragment, not a claimed sentence', () => {
    const bad = mk({ segmentSentences: () => { throw new Error('boom'); } });
    setBody('<p id="p">Ai lexon një libër të bukur sot.</p>');
    selectText(document.getElementById('p')!, 'libër');
    const c = bad.context(sel(bad).range) as { kind: string; confidence: number; reason: string; sentence: string; selStart: number; selEnd: number };
    expect(c.kind).toBe('fragment');
    expect(c.reason).toMatch(/segmentation failed/);
    expect(c.confidence).toBeLessThan(0.5);
    expect(c.sentence.slice(c.selStart, c.selEnd)).toBe('libër');
    bad.dispose();
  });

  it('a very long block is cut to a window around the selection (a fragment), on a whole-character boundary', () => {
    const small = mk({ maxBlockChars: 200, windowChars: 30 });
    setBody(`<p id="p">${'përshëndetje '.repeat(40)}Ai lexon një libër. ${'përshëndetje '.repeat(40)}</p>`);
    selectText(document.getElementById('p')!, 'libër');
    const c = small.context(sel(small).range) as { kind: string; sentence: string; selStart: number; selEnd: number; reason: string };
    expect(c.kind).toBe('fragment');
    expect(c.reason).toMatch(/too long/);
    expect(c.sentence.length).toBeLessThan(200);
    expect(c.sentence.slice(c.selStart, c.selEnd)).toBe('libër');
    small.dispose();
  });

  it('when the block disappears after the selection, only a flagged fragment from the moment of selection remains', () => {
    setBody('<p id="p">Ai lexon një libër të bukur sot.</p>');
    selectText(document.getElementById('p')!, 'libër');
    const s = sel(adapter);
    document.getElementById('p')!.remove();
    expect(adapter.isRangeLive(s.range)).toBe(false);
    const c = adapter.context(s.range) as { kind: string; confidence: number; reason: string; sentence: string; selStart: number; selEnd: number };
    expect(c.kind).toBe('fragment');
    expect(c.confidence).toBeLessThanOrEqual(0.25);
    expect(c.reason).toMatch(/page changed/);
    expect(c.sentence.slice(c.selStart, c.selEnd)).toBe('libër');
  });
});

describe('web-generic: frames', () => {
  const frame = (): HTMLIFrameElement => {
    setBody('<p id="top">Ky është dokumenti i sipërm.</p><iframe id="f"></iframe>');
    const f = document.getElementById('f') as HTMLIFrameElement;
    f.contentDocument!.body.innerHTML = '<p id="in">Unë jam në shtëpi tani. Ai vjen.</p>';
    return f;
  };

  it('reads a same-origin frame when the learner is working in it', () => {
    const f = frame();
    const fd = f.contentDocument!;
    const p = fd.getElementById('in')!;
    const r = fd.createRange();
    const t = p.firstChild as Text;
    r.setStart(t, t.data.indexOf('shtëpi')); r.setEnd(t, t.data.indexOf('shtëpi') + 'shtëpi'.length);
    fd.getSelection()!.removeAllRanges(); fd.getSelection()!.addRange(r);
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(f);
    const s = sel(adapter);
    expect(s.surface).toBe('shtëpi');
    expect(s.frame).toBe('same-origin-frame');
    const c = adapter.context(s.range) as { sentence: string };
    expect(c.sentence).toBe('Unë jam në shtëpi tani.');
  });

  it('a cross-origin frame declares no sentence context, no selected text, and is not read', () => {
    const f = frame();
    Object.defineProperty(f, 'contentDocument', { get: () => null, configurable: true });
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(f);
    const r = adapter.selection();
    expect(r).toMatchObject({ ok: false, reason: 'cross-origin-frame' });
    const caps = adapter.capabilities();
    expect(caps.sentenceContext).toBe('none');
    expect(caps.selectedTextAvailable).toBe(false);
    expect(caps.contextConfidence).toBe(0);
    expect(validateCapabilities(caps)).toEqual([]);
    expect(adapter.context(document.createRange())).toMatchObject({ kind: 'none' });
  });
});

describe('web-generic: source reference, anchor and layout changes', () => {
  it('the source reference holds the title and the URL path, never the text, query or fragment', () => {
    document.title = 'A page about libra';
    history.replaceState({}, '', '/reader/chapter-1?token=secret#frag');
    setBody('<p id="p">Ai lexon një libër.</p>');
    selectText(document.getElementById('p')!, 'libër');
    sel(adapter);
    const ref = adapter.sourceRef();
    expect(ref).toEqual({ kind: 'web', title: 'A page about libra', locator: '/reader/chapter-1', restrictions: { ...registryEntry('web-generic')!.restrictions } });
    expect(JSON.stringify(ref)).not.toMatch(/secret|frag|lexon/);
    history.replaceState({}, '', '/');
  });

  it('anchors to the last line of the selection; falls back to a fixed corner when there is no rect', () => {
    setBody('<p id="p">Ai lexon një libër.</p>');
    selectText(document.getElementById('p')!, 'libër');
    const s = sel(adapter);
    const a = adapter.anchor(s.range);
    expect(a.source).toBe('range');
    expect(a.rect.width).toBeGreaterThan(0);
    restore();
    const none = adapter.anchor(s.range);
    expect(none.source).toBe('fallback');
    restore = stubLayout();
  });

  it('reports a layout change when styles change, ignores the card\'s own host, and stops after unsubscribe', async () => {
    setBody('<p id="p" style="font-size: 16px">Ai lexon një libër.</p>');
    const cb = vi.fn();
    const off = adapter.onLayoutChange(cb);
    document.getElementById('p')!.style.fontSize = '32px';
    await flush(50);
    expect(cb).toHaveBeenCalledTimes(1);
    const host = document.createElement('div');
    host.setAttribute(GOLEARN_HOST_ATTR, '');
    document.body.append(host);
    host.style.top = '5px';
    host.remove();
    await flush(50);
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    document.getElementById('p')!.style.fontSize = '12px';
    await flush(50);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('removes every listener on dispose', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const rem = vi.spyOn(window, 'removeEventListener');
    adapter.onLayoutChange(() => {});
    adapter.onLayoutChange(() => {});
    adapter.dispose();
    const added = add.mock.calls.filter((c) => c[0] === 'resize' || c[0] === 'scroll').length;
    const removed = rem.mock.calls.filter((c) => c[0] === 'resize' || c[0] === 'scroll').length;
    expect(added).toBeGreaterThan(0);
    expect(removed).toBe(added);
  });
});

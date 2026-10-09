// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cleanText, contextFromRange, locate, selectionSurface, snapToGraphemes, splitSentences } from '../../packages/controlled-reader/src/sentences';
import { rangeOfText } from './helpers/book';

const docOf = (body: string): Document => {
  const d = document.implementation.createHTMLDocument('t');
  d.body.innerHTML = body;
  return d;
};
const ctx = (body: string, needle: string, occurrence = 0) => {
  const d = docOf(body);
  return contextFromRange(rangeOfText(d, needle, occurrence));
};

describe('surface text', () => {
  it('is NFC, trimmed, whitespace-collapsed and free of invisible marks', () => {
    const d = docOf('<p>le café ‏est  bon</p>');
    const r = rangeOfText(d, 'café ');
    expect(selectionSurface(r)).toBe('café');
    expect(selectionSurface(r).normalize('NFC')).toBe(selectionSurface(r));
    expect(cleanText('  a ­ b\n\tc ')).toBe('a b c');
  });

  it('snaps a selection that cuts a combining sequence outward to whole grapheme clusters', () => {
    const s = 'café ok';
    // selecting only the "e" of "e + combining acute" (offsets 3..4) must grow to include the accent
    expect(snapToGraphemes(s, 3, 4)).toEqual({ start: 3, end: 5, moved: true });
    const d = docOf('<p>café ok.</p>');
    const p = d.querySelector('p')!.firstChild as Text;
    const r = d.createRange();
    r.setStart(p, 3);
    r.setEnd(p, 4);
    const loc = locate(r);
    expect('failure' in loc).toBe(false);
    if (!('failure' in loc)) expect(loc.text.slice(loc.s, loc.e)).toBe('é');
  });
});

describe('sentence reconstruction across inline elements', () => {
  const html = '<p><em>Është</em> mëngjes. Beni <span class="w">zgjohet</span> herët. Ai <em>lahet <span>dhe</span></em> vishet.</p>';

  it('rebuilds a sentence whose words sit in <em> and <span>', () => {
    const c = ctx(html, 'zgjohet');
    expect(c.kind).toBe('sentence');
    expect(c.sentence).toBe('Beni zgjohet herët.');
    expect(c.sentence!.slice(c.selStart, c.selEnd)).toBe('zgjohet');
  });

  it('handles a selection that itself starts inside one inline element and ends in another', () => {
    const c = ctx(html, 'lahet dhe');
    expect(c.kind).toBe('sentence');
    expect(c.sentence).toBe('Ai lahet dhe vishet.');
    expect(c.sentence!.slice(c.selStart, c.selEnd)).toBe('lahet dhe');
  });

  it('gives the neighbouring sentences', () => {
    const c = ctx(html, 'zgjohet');
    expect(c.before).toBe('Është mëngjes.');
    expect(c.after).toBe('Ai lahet dhe vishet.');
  });

  it('a selection spanning two sentences is a fragment, never a guessed sentence', () => {
    const c = ctx(html, 'mëngjes. Beni zgjohet');
    expect(c.kind).toBe('fragment');
    expect(c.reason).toBe('selection-spans-sentences');
    expect(c.sentence).toBe('Është mëngjes. Beni zgjohet herët.');
    expect(c.confidence).toBeLessThan(0.6);
  });

  it('a selection across two paragraphs is a fragment of the selected text', () => {
    const c = ctx('<p>Ana lexon.</p><p>Beni shkruan.</p>', 'lexon.Beni');
    expect(c.kind).toBe('fragment');
    expect(c.reason).toBe('selection-spans-blocks');
  });

  it('a double-click that took the trailing space still gives the right selection offsets', () => {
    const c = ctx(html, 'herët. ');
    expect(c.kind).toBe('sentence');
    expect(c.sentence!.slice(c.selStart, c.selEnd)).toBe('herët.');
  });

  it('treats <br> as a sentence boundary and a nested block as a boundary', () => {
    expect(ctx('<p>Një rresht<br/>dy rreshta</p>', 'dy').sentence).toBe('dy rreshta');
    const c = ctx('<div>Hyrje pa pikë<p>Paragrafi.</p>Mbyllje.</div>', 'Mbyllje');
    expect(c.sentence).toBe('Mbyllje.');
  });

  it('skips <script>, <style> and ruby annotations', () => {
    const c = ctx('<p>Ana <script>var x = "Beni.";</script>lexon <ruby>libër<rt>XX</rt></ruby> sot.</p>', 'lexon');
    expect(c.sentence).toBe('Ana lexon libër sot.');
  });

  it('crosses page/column boundaries because it never looks at geometry: a long paragraph is one block', () => {
    const long = Array.from({ length: 80 }, (_, i) => `Fjalia numër ${i} është këtu.`).join(' ');
    const c = ctx(`<p>${long}</p>`, 'numër 41');
    expect(c.sentence).toBe('Fjalia numër 41 është këtu.');
    expect(c.before).toBe('Fjalia numër 40 është këtu.');
    expect(c.after).toBe('Fjalia numër 42 është këtu.');
  });
});

describe('neighbours across blocks, and where reconstruction stops', () => {
  const body = '<h1>Titulli</h1><p>E para. E dyta.</p><p>E treta. E katërta.</p>';

  it('the previous/next sentence may come from the neighbouring block of the same chapter document', () => {
    const c = ctx(body, 'E treta');
    expect(c.before).toBe('E dyta.');
    expect(c.after).toBe('E katërta.');
  });

  it('never takes a heading as the neighbouring sentence', () => {
    const c = ctx(body, 'E para');
    expect(c.before).toBeUndefined();
    expect(c.limits.join(' ')).toMatch(/No earlier sentence in this chapter document/);
  });

  it('the first sentence of a chapter has no `before` and the last has no `after`: other spine items are not read', () => {
    const last = ctx(body, 'E katërta');
    expect(last.after).toBeUndefined();
    expect(last.limits.join(' ')).toMatch(/No later sentence/);
    expect(last.limits[0]).toMatch(/other spine items are never loaded/);
  });

  it('a sentence the book breaks over two <p> elements is returned as two fragments (a known limit)', () => {
    const c = ctx('<p>Beni shkoi në</p><p>shtëpi të vjetër.</p>', 'shkoi');
    expect(c.sentence).toBe('Beni shkoi në');
  });
});

describe('segmentation', () => {
  const sentences = (t: string) => splitSentences(t).map((s) => t.slice(s.start, s.end));

  it('does not split after abbreviations, initials, numbers or before a lower-case word', () => {
    expect(sentences('Takova Dr. Beni sot. Pastaj u larguam.')).toEqual(['Takova Dr. Beni sot.', 'Pastaj u larguam.']);
    expect(sentences('Përdor p.sh. këtë fjalë. Mbaroi.')).toEqual(['Përdor p.sh. këtë fjalë.', 'Mbaroi.']);
    expect(sentences('J. Smith erdhi. Ai foli.')).toEqual(['J. Smith erdhi.', 'Ai foli.']);
    expect(sentences('Kushton 3.5 euro. Mirë.')).toEqual(['Kushton 3.5 euro.', 'Mirë.']);
  });

  it('splits after ? ! and closing quotes, and on script-specific terminators', () => {
    expect(sentences('A do çaj? — Po! Dua çaj.')).toEqual(['A do çaj?', '— Po!', 'Dua çaj.']);
    expect(sentences('Ai tha: "Eja." Ajo erdhi.')).toEqual(['Ai tha: "Eja."', 'Ajo erdhi.']);
    expect(sentences('— Ku është libri im? — pyet Ana. Beni nuk e di.')).toEqual(['— Ku është libri im? — pyet Ana.', 'Beni nuk e di.']);
    expect(sentences('"Eja!" tha ai. Ajo erdhi.')).toEqual(['"Eja!" tha ai.', 'Ajo erdhi.']);
    expect(sentences('मैं घर जाता हूँ। तुम कहाँ हो?')).toEqual(['मैं घर जाता हूँ।', 'तुम कहाँ हो?']);
    expect(sentences('我很好。你呢？')).toEqual(['我很好。', '你呢？']);
  });

  it('accepts a language pack segmenter in place of the default', () => {
    const d = docOf('<p>Një dy tre.</p>');
    const c = contextFromRange(rangeOfText(d, 'dy'), { segment: (t) => [{ start: 0, end: t.length }] });
    expect(c.sentence).toBe('Një dy tre.');
  });
});

describe('right-to-left text', () => {
  it('reconstructs a Hebrew sentence across an inline element with correct offsets', () => {
    const body = '<p>שלום, שמי דוד.</p><p>אני גר <em>בירושלים</em>.</p>';
    const d = docOf(`<div dir="rtl">${body}</div>`);
    const c = contextFromRange(rangeOfText(d, 'בירושלים'));
    expect(c.kind).toBe('sentence');
    expect(c.sentence).toBe('אני גר בירושלים.');
    expect(c.sentence!.slice(c.selStart, c.selEnd)).toBe('בירושלים');
    expect(c.before).toBe('שלום, שמי דוד.');
  });
});

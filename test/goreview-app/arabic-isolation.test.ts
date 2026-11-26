// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isolateArabic } from '../../packages/goreview/app/dom';

const BACK = 'alif: ā, a long "a" as in father · بَاب — door, gate · joins the letter before it (ـا) but never the letter after it';

describe('a card back that mixes English and Arabic', () => {
  it('isolates each run of Arabic, so the separators keep their logical order', () => {
    const box = document.createElement('div');
    box.setAttribute('dir', 'ltr');
    for (const c of isolateArabic(BACK)) box.append(c as Node | string);
    const runs = [...box.querySelectorAll('bdi')];
    expect(runs.map((r) => r.textContent)).toEqual(['بَاب', 'ـا']);
    for (const r of runs) { expect(r.getAttribute('lang')).toBe('ar'); expect(r.getAttribute('dir')).toBe('rtl'); }
    // the text content, node by node, is the logical string: no separator moved
    expect(box.textContent).toBe(BACK);
    // the separators are text nodes of the ltr element, in logical order around the isolated runs
    const parts = [...box.childNodes].map((n) => (n.nodeType === 3 ? n.textContent : `<${(n as Element).tagName.toLowerCase()}>`));
    expect(parts.join('')).toBe('alif: ā, a long "a" as in father · <bdi> — door, gate · joins the letter before it (<bdi>) but never the letter after it');
    expect(box.getAttribute('dir')).toBe('ltr');
  });

  it('keeps a multi-word Arabic phrase as one run and leaves text without Arabic alone', () => {
    expect(isolateArabic('plain English')).toEqual(['plain English']);
    const kids = isolateArabic('the phrase بَيْت كَبِير means big house');
    expect((kids[1] as Element).textContent).toBe('بَيْت كَبِير');
  });
});

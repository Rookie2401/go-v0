// @vitest-environment jsdom
/** GoLearn Active: the page scan reads only readable text, names each word's unit ids like the parser, and keeps nothing but a per-node cache. */
import { beforeEach, describe, expect, it } from 'vitest';
import { createScanner } from '../../packages/golearn-extension/src/active/scan';
import { getAnalyser } from '../../packages/golearn-extension/src/parser';
import { GOLEARN_HOST_ATTR } from '../../packages/golearn-extension/src/contract/readerAdapter';

const PAGE = `
<nav><a href="#">Kreu</a></nav>
<article>
  <p id="p1">Unë po lexoj një libër të bukur në shtëpinë time.</p>
  <p id="p2">Beni shkon në shkollë.</p>
  <p id="hidden" hidden>Fjalë e fshehur.</p>
  <p id="styled" style="display:none">Fjalë tjetër e fshehur.</p>
  <div contenteditable="true" id="edit">Shkruaj këtu.</div>
  <textarea id="ta">Tekst në fushë.</textarea>
  <div id="chrome" class="reader-menu">Menyja e lexuesit.</div>
  <div ${GOLEARN_HOST_ATTR}="">Karta e GoLearn.</div>
  <p id="num">12345 — 2026</p>
</article>`;

beforeEach(() => { document.body.innerHTML = PAGE; });

const make = (over: Partial<Parameters<typeof createScanner>[0]> = {}) => createScanner({ doc: document, adapterOf: getAnalyser, viewport: 'all', ...over });

describe('textNodes', () => {
  it('reads paragraphs and skips navigation, hidden text, editable regions, form fields, the card host and text without letters', () => {
    const ids = make().textNodes(document).map((n) => n.parentElement!.id || n.parentElement!.tagName);
    expect(ids).toEqual(['p1', 'p2', 'chrome']); // the nav link is page chrome, not text the learner reads
  });

  it('a site entry\'s ignore list removes reader chrome; its containers limit the reading area', () => {
    expect(make({ ignore: ['.reader-menu'] }).textNodes(document).map((n) => n.parentElement!.id)).toEqual(['p1', 'p2']);
    expect(make({ containers: ['#p2'] }).textNodes(document).map((n) => n.parentElement!.id)).toEqual(['p2']);
  });
});

describe('tokensIn', () => {
  it('tokenises with the language\'s analyser and names the form id and, for a creditable reading, the lemma id', () => {
    const s = make();
    const p1 = document.getElementById('p1')!.firstChild as Text;
    const tokens = s.tokensIn([p1], 'sq');
    expect(tokens.map((t) => t.surface)).toEqual(['Unë', 'po', 'lexoj', 'një', 'libër', 'të', 'bukur', 'në', 'shtëpinë', 'time']);
    const house = tokens.find((t) => t.surface === 'shtëpinë')!;
    expect(house.ids).toEqual(['form:sq:shtëpinë', 'lemma:sq:shtëpi:NOUN']);
    expect(house.node).toBe(p1);
    expect(p1.data.slice(house.start, house.end)).toBe('shtëpinë');
    for (const t of tokens) expect(t.ids[0]).toMatch(/^form:sq:/);
  });

  it('says which words the language knows (2026-10-25): a creditable reading is `known`; another language\'s word or a name on the same page is not, and gets no lemma id', () => {
    const p = document.getElementById('p2')!;
    p.textContent = 'Beni shkon në shkollë. The righteous flourish. אֱלֹהִים';
    const tokens = make().tokensIn([p.firstChild as Text], 'sq');
    const by = Object.fromEntries(tokens.map((t) => [t.surface, t]));
    expect(by['shkollë'].known).toBe(true);
    expect(by['shkollë'].ids).toHaveLength(2);
    // ("The" is left out of the list on purpose: it is an Albanian word too, the aorist "the" of them, and the analyser rightly knows it)
    for (const w of ['righteous', 'flourish', 'אֱלֹהִים']) {
      expect(by[w], w).toBeDefined();
      expect(by[w].known, w).toBe(false);
      expect(by[w].ids, w).toEqual([`form:sq:${by[w].ids[0].slice('form:sq:'.length)}`]); // the form id only: nothing creditable to credit
    }
  });

  it('caches per text node while its text is unchanged, and re-reads it after a change', () => {
    const s = make();
    const p2 = document.getElementById('p2')!.firstChild as Text;
    const a = s.tokensIn([p2], 'sq');
    expect(s.tokensIn([p2], 'sq')[0]).toBe(a[0]); // the same token objects: no second tokenisation
    p2.data = 'Ana lexon.';
    const b = s.tokensIn([p2], 'sq');
    expect(b[0]).not.toBe(a[0]);
    expect(b.map((t) => t.surface)).toEqual(['Ana', 'lexon']);
  });

  it('an unloaded language yields no tokens (nothing is guessed)', () => {
    expect(make().tokensIn([document.getElementById('p2')!.firstChild as Text], 'zz')).toEqual([]);
  });

  it('offsets index the node\'s own text even when it is not NFC', () => {
    const p = document.getElementById('p2')!;
    p.textContent = 'shtëpia e madhe'; // ë as e + combining diaeresis
    const t = p.firstChild as Text;
    const tokens = make().tokensIn([t], 'sq');
    expect(tokens[0].surface.normalize('NFC')).toBe('shtëpia');
    expect(t.data.slice(tokens[0].start, tokens[0].end)).toBe('shtëpia');
    expect(t.data.slice(tokens[2].start, tokens[2].end)).toBe('madhe');
  });
});

describe('tokenAt', () => {
  it('finds the word under an offset, including its edges, and nothing between words', () => {
    const s = make();
    const t = document.getElementById('p1')!.firstChild as Text;
    const at = t.data.indexOf('libër');
    expect(s.tokenAt(t, at + 2, 'sq')?.surface).toBe('libër');
    expect(s.tokenAt(t, at, 'sq')?.surface).toBe('libër');
    expect(s.tokenAt(t, at + 5, 'sq')?.surface).toBe('libër');
    expect(s.tokenAt(t, t.data.length, 'sq')?.surface).toBeUndefined(); // after the full stop
  });
});

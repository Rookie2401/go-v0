import { describe, expect, it } from 'vitest';
import {
  CONSTRUCTED_SEGMENTED_BY, CONSTRUCTED_UNIT_CASES, UNIT_SYSTEMS, aggregate, boundariesFromUnits, classifyErrors, coversParagraph, decodeUnit, encodeUnit,
  evaluateCase, evaluateSystem, fromEditing, goldSystem, isAbbreviationToken, median, parseJsonl, percentile, quotationRanges, runGuards, splitsAbbreviation,
  splitsNumber, toEditing, toJsonl, unitSystem, unitsOf, validateUnitCase, validateUnitCases, wordCount,
  type UnitGoldCase, type UnitSystem,
} from '../../src/bench/units';

const SRC = { title: 't', licence: 'l', rights: 'rights-safe' } as const;
function mk(id: string, units: string[], stratum = 'x'): UnitGoldCase {
  return { id, lang: 'th', stratum, ...boundariesFromUnits(units), source: SRC, segmentedBy: 'test' };
}

describe('gold format: units, validator', () => {
  it('boundaries are the starts of units 2..n and the units re-join to the paragraph', () => {
    const c = mk('a', ['ผมชื่อสมชายครับ ', 'ผมอยู่เชียงใหม่ครับ']);
    expect(c.unitBoundaries).toEqual([16]);
    expect(unitsOf(c)).toEqual(['ผมชื่อสมชายครับ ', 'ผมอยู่เชียงใหม่ครับ']);
    expect(unitsOf(c).join('')).toBe(c.paragraph);
    expect(validateUnitCase(c)).toEqual([]);
  });

  it('keeps the whitespace between units and the indentation: nothing is lost', () => {
    const c = mk('b', ['  ก ข\r\n', 'ค']);
    expect(unitsOf(c).join('')).toBe('  ก ข\r\nค');
    expect(validateUnitCase(c)).toEqual([]);
  });

  it('refuses a boundary on whitespace, at 0, at the end, repeated, out of order or not an integer', () => {
    const base = mk('c', ['กข ', 'คง']);
    const bad = (b: number[]) => validateUnitCase({ ...base, unitBoundaries: b });
    expect(bad([2]).join()).toMatch(/whitespace/);
    expect(bad([0]).join()).toMatch(/outside the text/);
    expect(bad([5]).join()).toMatch(/outside the text/);
    expect(bad([3, 3]).join()).toMatch(/strictly increasing/);
    expect(bad([1.5]).join()).toMatch(/integer/);
  });

  it('refuses a boundary inside a character cluster, before a vowel sign / tone mark, or after a leading vowel', () => {
    const p = 'ก่อนเดิน 😀 ดี';
    const mark = { ...mk('d', ['x']), paragraph: p };
    expect(validateUnitCase({ ...mark, unitBoundaries: [1] }).join()).toMatch(/vowel sign or tone mark|cluster/); // ก|่อน: the tone mark belongs to ก
    expect(validateUnitCase({ ...mark, unitBoundaries: [2] }).join()).toBe(''); // ก่|อน: a base letter may start a unit
    expect(validateUnitCase({ ...mark, unitBoundaries: [5] }).join()).toMatch(/leading vowel/); // เ|ดิน
    const emoji = p.indexOf('😀');
    expect(validateUnitCase({ ...mark, unitBoundaries: [emoji + 1] }).join()).toMatch(/cluster/);
  });

  it('refuses a unit that is only whitespace, a missing label, a bad language or rights value, and duplicate ids', () => {
    expect(validateUnitCase({ ...mk('e', ['ก']), paragraph: '  ก ข', unitBoundaries: [2] }).join()).toMatch(/only whitespace/);
    expect(validateUnitCase({ ...mk('f', ['ก']), segmentedBy: ' ' }).join()).toMatch(/segmentedBy/);
    expect(validateUnitCase({ ...mk('g', ['ก']), lang: 'de' as 'th' }).join()).toMatch(/lang/);
    expect(validateUnitCase({ ...mk('h', ['ก']), source: { ...SRC, rights: 'x' as 'rights-safe' } }).join()).toMatch(/rights/);
    expect(validateUnitCase({ ...mk('i', ['ก']), checkedBy: 'A' }).join()).toMatch(/checkedBy and checkedAt/);
    expect(validateUnitCases([mk('j', ['ก']), mk('j', ['ข'])]).join()).toMatch(/duplicate id/);
  });
});

describe('gold format: JSON Lines and the editing format', () => {
  it('JSON Lines round-trips and names the bad line', () => {
    const cases = [mk('a', ['ก ', 'ข']), mk('b', ['ค'])];
    expect(parseJsonl(toJsonl(cases))).toEqual(cases);
    expect(() => parseJsonl('{"id":"a"}\nnot json\n')).toThrow(/line 2/);
  });

  it('editing format: marks make edge whitespace, line breaks and tabs visible and reversible', () => {
    expect(encodeUnit('  กข ค\t\r\n')).toBe('␣␣กข ค⇥␍↵');
    expect(decodeUnit('␣␣กข ค⇥␍↵')).toBe('  กข ค\t\r\n');
    expect(encodeUnit('ก\nข ')).toBe('ก↵ข␣');
    expect(encodeUnit('ก ')).toBe('ก⍽');
    expect(decodeUnit(encodeUnit('ก　'))).toBe('ก　');
    expect(decodeUnit('  ก  ')).toBe('ก'); // an editor's stray blanks carry no meaning
  });

  it('editing format round-trips every constructed case exactly, one unit per line and a header per paragraph', () => {
    const text = toEditing(CONSTRUCTED_UNIT_CASES);
    const base = new Map(CONSTRUCTED_UNIT_CASES.map((c) => [c.id, c]));
    expect(fromEditing(text, { base })).toEqual(CONSTRUCTED_UNIT_CASES);
    const first = text.split('\n\n')[0].split('\n');
    expect(first[0]).toBe(`# ${CONSTRUCTED_UNIT_CASES[0].id} ${CONSTRUCTED_UNIT_CASES[0].stratum}`);
    expect(first.length - 1).toBe(unitsOf(CONSTRUCTED_UNIT_CASES[0]).length);
  });

  it('a person can move a boundary and the gold follows; changing the text is refused', () => {
    const base = new Map([['a', mk('a', ['ก ข ', 'ค'])]]);
    const moved = fromEditing('# a x\nก␣\nข␣ค\n', { base });
    expect(unitsOf(moved[0])).toEqual(['ก ', 'ข ค']);
    expect(() => fromEditing('# a x\nก\nข ค\n', { base })).toThrow(/no longer re-join/);
    expect(() => fromEditing('ก\n', { base })).toThrow(/before any header/);
    expect(() => fromEditing('# a\nก\n', { base })).toThrow(/bad header/);
  });

  it('a new paragraph needs defaults; a paragraph that holds a mark character cannot be written', () => {
    expect(() => fromEditing('# n x\nก\n')).toThrow(/no defaults/);
    const made = fromEditing('# n y\nก␣\nข\n', { defaults: { source: SRC, segmentedBy: 'draft' } });
    expect(made[0]).toMatchObject({ id: 'n', stratum: 'y', paragraph: 'ก ข', unitBoundaries: [2] });
    expect(() => toEditing([mk('m', ['ก␣ข'])])).toThrow(/mark character/);
  });
});

describe('metrics, hand-computed', () => {
  it('classifies over-split, under-split and shifted', () => {
    const p = 'x'.repeat(40);
    expect(classifyErrors(p, [10, 20], [10, 25]).map((e) => [e.kind, e.at])).toEqual([['under-split', 20], ['over-split', 25]]);
    expect(classifyErrors(p, [10], [12]).map((e) => [e.kind, e.at, e.goldAt])).toEqual([['shifted', 12, 10]]);
    expect(classifyErrors(p, [10], [10])).toEqual([]);
  });

  it('precision, recall, F1 and paragraph exact-match over two paragraphs', () => {
    // paragraph a is cut exactly right; paragraph c gets one right and one wrong boundary.
    const a = mk('a', ['ก ', 'ข ', 'ค']);        // gold [2, 4]
    const sys: UnitSystem = {
      id: 'fake', label: 'fake',
      split: () => [{ start: 0, end: 1, text: 'ก' }, { start: 2, end: 3, text: 'ข' }, { start: 4, end: 5, text: 'ค' }],
    };
    const ra = evaluateCase(a, sys);
    expect(ra).toMatchObject({ tp: 2, fp: 0, fn: 0, exact: true });
    // Make the second paragraph wrong: the system adds a boundary inside the first word of a longer text.
    const c = mk('c', ['กขคง ', 'จ']);
    const sys2: UnitSystem = { id: 's2', label: 's2', split: () => [{ start: 0, end: 2, text: 'กข' }, { start: 2, end: 4, text: 'คง' }, { start: 5, end: 6, text: 'จ' }] };
    const rc = evaluateCase(c, sys2);
    expect(rc).toMatchObject({ tp: 1, fp: 1, fn: 0, exact: false });
    const agg = aggregate([ra, rc]);
    expect(agg).toMatchObject({ tp: 3, fp: 1, fn: 0, paragraphs: 2, exact: 1, exactRate: 0.5 });
    expect(agg.precision).toBeCloseTo(0.75, 10);
    expect(agg.recall).toBe(1);
    expect(agg.f1).toBeCloseTo((2 * 0.75) / 1.75, 10);
  });

  it('0/0 counts as 1 and the strata are reported separately', () => {
    const one = mk('p', ['กขค'], 's1');
    const two = mk('q', ['ก ', 'ข'], 's2');
    const r = evaluateSystem([one, two], unitSystem('paragraph'));
    expect(r.overall).toMatchObject({ tp: 0, fp: 0, fn: 1, precision: 1, recall: 0, f1: 0 });
    expect(r.byStratum.find((s) => s.stratum === 's1')).toMatchObject({ precision: 1, recall: 1, exactRate: 1 });
    expect(r.byStratum.find((s) => s.stratum === 's2')).toMatchObject({ recall: 0, exact: 0 });
    expect(r.failing.map((x) => x.id)).toEqual(['q']);
  });
});

describe('systems', () => {
  it('paragraph is one unit, spaces splits every run, adapter splits after a final particle', () => {
    expect(unitSystem('paragraph').split('  ผมชื่อสมชายครับ ผมอยู่เชียงใหม่ครับ ').map((s) => s.text)).toEqual(['ผมชื่อสมชายครับ ผมอยู่เชียงใหม่ครับ']);
    expect(unitSystem('spaces').split('ก  ข\nค').map((s) => s.text)).toEqual(['ก', 'ข', 'ค']);
    expect(unitSystem('adapter').split('ผมชื่อสมชายครับ ผมอยู่เชียงใหม่ครับ').map((s) => s.text)).toEqual(['ผมชื่อสมชายครับ', 'ผมอยู่เชียงใหม่ครับ']);
    expect(() => unitSystem('nope')).toThrow(/unknown unit system/);
  });

  it('every system slices every constructed paragraph exactly (units re-join to the text, no character lost)', () => {
    for (const sys of UNIT_SYSTEMS) {
      for (const c of CONSTRUCTED_UNIT_CASES) expect(coversParagraph(c.paragraph, sys.split(c.paragraph)), `${sys.id} ${c.id}`).toBe(true);
    }
  });

  it('the gold system reproduces the gold units', () => {
    const gs = goldSystem(CONSTRUCTED_UNIT_CASES);
    for (const c of CONSTRUCTED_UNIT_CASES) {
      expect(coversParagraph(c.paragraph, gs.split(c.paragraph))).toBe(true);
      expect(evaluateCase(c, gs).exact).toBe(true);
    }
  });

  it('the bounds behave as bounds on the constructed set: paragraph finds nothing, spaces finds every gold boundary', () => {
    const para = evaluateSystem(CONSTRUCTED_UNIT_CASES, unitSystem('paragraph'));
    const spaces = evaluateSystem(CONSTRUCTED_UNIT_CASES, unitSystem('spaces'));
    expect(para.overall.tp + para.overall.fp).toBe(0);
    expect(spaces.overall.recall).toBe(1);
    const adapter = evaluateSystem(CONSTRUCTED_UNIT_CASES, unitSystem('adapter'));
    expect(adapter.overall.tp + adapter.overall.fn).toBe(para.overall.fn); // same gold
    expect(adapter.overall.f1).toBeGreaterThan(0);
    expect(adapter.overall.f1).toBeLessThan(1); // the set contains hazards on purpose
  });
});

describe('guards', () => {
  it('median and nearest-rank percentile', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([5])).toBe(5);
    expect(median([])).toBe(0);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
  });

  it('finds quotations that open and close inside the paragraph, curly and straight, and ignores an unclosed one', () => {
    expect(quotationRanges('“ก” ข “ค”')).toEqual([[0, 2], [6, 8]]);
    expect(quotationRanges('"ก" ข "ค')).toEqual([[0, 2]]);
    const t = 'เขาว่า “ก ข ค”';
    expect(quotationRanges(t)).toEqual([[t.indexOf('“'), t.indexOf('”')]]);
    expect(quotationRanges('“ไม่ปิด')).toEqual([]);
  });

  it('recognises numbers and abbreviations split by a boundary', () => {
    const n = 'ราคา 3.14 บาท';
    expect(splitsNumber(n, n.indexOf('14'))).toBe(true); // 3.|14
    expect(splitsNumber(n, n.indexOf('บาท'))).toBe(false);
    expect(splitsNumber('1,250 บาท', 2)).toBe(true);
    expect(splitsNumber('12', 1)).toBe(true); // between two digits
    const a = 'ปี พ.ศ. 2565';
    expect(splitsAbbreviation(a, a.indexOf('2565'))).toBe(true);
    expect(splitsAbbreviation('ดร. สมชาย', 4)).toBe(true);
    expect(splitsAbbreviation('ไปโรงเรียน. เขา', 12)).toBe(false);
    expect(splitsAbbreviation('Dr. Smith', 4)).toBe(true);
    expect(splitsAbbreviation('ก็ OK. แล้ว', 7)).toBe(false);
    expect(isAbbreviationToken('(ร.ร.')).toBe(true);
    expect(isAbbreviationToken('น.')).toBe(false); // can end a sentence
  });

  it('counts words per unit, long units, one-word units, quotation and number / abbreviation splits on a scripted system', () => {
    const quote = '“ฉัน ไม่ ไป ครับ” เขา พูด';
    const half: UnitSystem = {
      id: 'half', label: 'half',
      split: (t) => {
        const i = t.indexOf('ไม่');
        return [{ start: 0, end: i - 1, text: t.slice(0, i - 1) }, { start: i, end: t.length, text: t.slice(i) }];
      },
    };
    const g = runGuards([quote], half);
    expect(g.units).toBe(2);
    expect(g.quoteEnd).toBe(1); // the first unit ends inside the quotation
    expect(g.quoteBegin).toBe(1); // the second begins inside it
    expect(g.quoteEither).toBe(2);
    expect(g.words).toBeGreaterThan(0);
    expect(g.words).toBe(wordCount(quote.slice(0, quote.indexOf('ไม่') - 1)) + wordCount(quote.slice(quote.indexOf('ไม่'))));

    const price = 'ราคา 3.14 บาท';
    const cutAt = (at: number): UnitSystem => ({ id: 'n', label: 'n', split: (t) => [{ start: 0, end: at, text: t.slice(0, at) }, { start: at, end: t.length, text: t.slice(at) }] });
    expect(runGuards([price], cutAt(price.indexOf('14'))).numberSplits).toBe(1); // 3.|14
    expect(runGuards([price], cutAt(price.indexOf('บาท'))).numberSplits).toBe(0);
    const abbr = 'ปี พ.ศ. 2565 ฝนตก';
    const cut = abbr.indexOf('2565');
    const abbrSplit: UnitSystem = { id: 'a', label: 'a', split: (t) => [{ start: 0, end: cut - 1, text: t.slice(0, cut - 1) }, { start: cut, end: t.length, text: t.slice(cut) }] };
    expect(runGuards([abbr], abbrSplit)).toMatchObject({ abbreviationSplits: 1 });

    const long = Array.from({ length: 45 }, () => 'ฉัน').join(' ');
    const g2 = runGuards([long, 'ครับ'], unitSystem('paragraph'));
    expect(g2.overLong).toBe(1);
    expect(g2.oneWord).toBe(1);
    expect(g2.wordsPerUnit.max).toBeGreaterThan(40);
  });

  it('on the gold units no abbreviation or number is split; the adapter splits abbreviations', () => {
    const paragraphs = CONSTRUCTED_UNIT_CASES.map((c) => c.paragraph);
    const gold = runGuards(paragraphs, goldSystem(CONSTRUCTED_UNIT_CASES));
    expect(gold.abbreviationSplits).toBe(0);
    expect(gold.numberSplits).toBe(0);
    expect(gold.notCovering).toBe(0);
    for (const sys of UNIT_SYSTEMS) expect(runGuards(paragraphs, sys).notCovering, sys.id).toBe(0);
    expect(runGuards(paragraphs, unitSystem('adapter')).abbreviationSplits).toBeGreaterThan(0);
    expect(runGuards(paragraphs, unitSystem('paragraph')).quoteEither).toBe(0);
  });
});

describe('the constructed set', () => {
  it('is labelled as constructed, machine-drafted, not native-reviewed, rights-safe, and carries no reviewer', () => {
    expect(CONSTRUCTED_SEGMENTED_BY).toBe('constructed by the benchmark author (machine-drafted Thai, not native-reviewed)');
    for (const c of CONSTRUCTED_UNIT_CASES) {
      expect(c.segmentedBy).toBe(CONSTRUCTED_SEGMENTED_BY);
      expect(c.source.rights).toBe('rights-safe');
      expect(c.checkedBy).toBeUndefined();
      expect(c.checkedAt).toBeUndefined();
    }
  });

  it('is valid, has about 80 or more cases with unique ids, is NFC and covers the named hazards', () => {
    expect(validateUnitCases(CONSTRUCTED_UNIT_CASES)).toEqual([]);
    expect(CONSTRUCTED_UNIT_CASES.length).toBeGreaterThanOrEqual(80);
    for (const c of CONSTRUCTED_UNIT_CASES) expect(c.paragraph.normalize('NFC'), c.id).toBe(c.paragraph);
    const strata = new Set(CONSTRUCTED_UNIT_CASES.map((c) => c.stratum));
    for (const h of ['dialogue-curly', 'dialogue-straight', 'quote-multi', 'speech-tag', 'final-particle', 'ellipsis', 'paiyannoi', 'maiyamok', 'abbreviation', 'number', 'time', 'latin', 'list-comma', 'parenthesis', 'narrative-clause-space', 'one-word', 'heading-line', 'hard-break', 'indentation']) {
      expect(strata.has(h), h).toBe(true);
    }
    const all = CONSTRUCTED_UNIT_CASES.map((c) => c.paragraph).join('\n');
    for (const needle of ['“', '"', 'ฯลฯ', 'ๆ', 'พ.ศ.', 'ร.ร.', 'ดร.', '3.14', '1,250', '10.30', 'iPhone', '(', '\n', '…']) expect(all.includes(needle), needle).toBe(true);
    expect(CONSTRUCTED_UNIT_CASES.some((c) => /^\s/.test(c.paragraph))).toBe(true);
    expect(CONSTRUCTED_UNIT_CASES.some((c) => c.paragraph.trim().length > 0 && !/\s/.test(c.paragraph.trim()))).toBe(true); // a one-word paragraph
  });
});

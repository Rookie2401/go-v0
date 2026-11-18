// @vitest-environment node
/**
 * Reading Analysis, the knowledge half: `classifyWord` (src/reading/classify.ts, pure) and the arithmetic of coverage.ts.
 * Rows are built by hand (the shape of `UnitKnowledge`) or folded from events by the real engine, exactly as test/varieties/*.test.ts do.
 * Needs no local data and no analyser: the words are unit ids.
 */
import { describe, expect, it } from 'vitest';
import type { UnitKnowledge, VarietyKnowledge } from '../../packages/repository-contract/src';
import { DIMENSIONS } from '../../packages/repository-contract/src/learner';
import { KNOWLEDGE_LEVELS, type KnowledgeLevel } from '../../packages/repository-contract/src/knowledge-levels';
import { classifyWord, type RowOf } from '../../packages/golearn-extension/src/reading/classify';
import { bucketOf, coverageOf, formatPercent, type CountedVerdict } from '../../packages/golearn-extension/src/reading/coverage';
import type { WireVerdict, WireWord } from '../../packages/golearn-extension/src/reading/protocol';
import { levelOfRows } from '../../packages/golearn-extension/src/active/levels';
import { compactKnowledge } from '../../packages/golearn-extension/src/background/profile';
import { day, knowledgeOf, lookup, mark, met } from '../varieties/helpers';

const T1 = '2026-10-01T10:00:00.000Z';
const T2 = '2026-10-02T10:00:00.000Z';
const T3 = '2026-10-03T10:00:00.000Z';
const isKnown = (l: KnowledgeLevel): boolean => l === 'known' || l === 'automatic';

// ───────────────────────────── row builders ─────────────────────────────
const dimensions = (level: KnowledgeLevel): UnitKnowledge['dimensions'] =>
  Object.fromEntries(DIMENSIONS.map((d) => [d, {
    score: 0.5, confidence: 0, observations: 0, positive: 0, negative: d === 'exposure' && level === 'seen' ? 1 : 0, weight: 0, contexts: 0,
    independentPositiveEvents: 0, delayedIndependentPositiveEvents: 0,
  }])) as UnitKnowledge['dimensions'];
const slice = (level: KnowledgeLevel, selfMark?: { mark: KnowledgeLevel; at: string }): VarietyKnowledge => ({
  dimensions: dimensions(level), retention: { estimate: 0, halfLifeDays: 7, basedOn: 'none' }, uncertainty: 0.5, level, encounters: 3,
  ...(selfMark ? { selfMark } : {}), basis: { events: 3 }, own: { level, events: 3, reader: 3, review: 0 },
});
interface RowOpts { level?: KnowledgeLevel; selfMark?: { mark: KnowledgeLevel; at: string }; varieties?: UnitKnowledge['varieties']; unclassified?: UnitKnowledge['unclassified'] }
function row(unitId: string, o: RowOpts = {}): UnitKnowledge {
  const level = o.level ?? 'new';
  return {
    learnerId: 'l1', unitId, languageId: unitId.split(':')[1]!, dimensions: dimensions(level), retention: { estimate: 0, halfLifeDays: 7, basedOn: 'none' }, uncertainty: 0.5,
    level, encounters: level === 'new' ? 0 : 3, ...(o.selfMark ? { selfMark: o.selfMark } : {}), modelVersion: 'test', basis: { events: level === 'new' ? 0 : 3 },
    ...(o.varieties ? { varieties: o.varieties } : {}), ...(o.unclassified ? { unclassified: o.unclassified } : {}),
  };
}
const rowsOf = (...rows: UnitKnowledge[]): RowOf => { const m = new Map(rows.map((r) => [r.unitId, r])); return (id) => m.get(id); };
const FORM = 'form:es:libros';
const LEMMA = 'lemma:es:libro:NOUN';
const word = (...ids: string[]): WireWord => ids as unknown as WireWord;

// ───────────────────────────── a. six levels, one reading ─────────────────────────────
describe('classifyWord: one reading, the six levels', () => {
  it.each(KNOWLEDGE_LEVELS.map((l) => [l]))('lemma row at %s', (level) => {
    const v = classifyWord(word(FORM, LEMMA), rowsOf(row(LEMMA, { level })), 'es');
    expect(v).toEqual(isKnown(level) ? ['known', level] : ['below', level]);
  });
  it.each(KNOWLEDGE_LEVELS.map((l) => [l]))('form row at %s (the lemma has no record)', (level) => {
    const v = classifyWord(word(FORM, LEMMA), rowsOf(row(FORM, { level })), 'es');
    expect(v).toEqual(isKnown(level) ? ['known', level] : ['below', level]);
  });
  it('only Known and Automatic are credited', () => {
    const credited = KNOWLEDGE_LEVELS.filter((l) => classifyWord(word(FORM, LEMMA), rowsOf(row(LEMMA, { level: l })), 'es')[0] === 'known');
    expect(credited).toEqual(['known', 'automatic']);
  });
  it('no row at all: below, new', () => {
    expect(classifyWord(word(FORM, LEMMA), rowsOf(), 'es')).toEqual(['below', 'new']);
  });
  it('a row of the contract that says seen only because the word was met in passing is shown as new', () => {
    // exposure observed, nothing else, no lookup: "seen" is displayed as "new" by the page's rule, and the analysis reads the same rule
    const r = row(LEMMA, { level: 'seen' });
    (r.dimensions.exposure as { negative: number }).negative = 0;
    expect(classifyWord(word(FORM, LEMMA), rowsOf(r), 'es')).toEqual(['below', 'new']);
  });
});

// ───────────────────────────── b. form versus lemma ─────────────────────────────
describe('classifyWord: the form row and the lemma row', () => {
  it('a Known lemma and no form row: known', () => {
    expect(classifyWord(word(FORM, LEMMA), rowsOf(row(LEMMA, { level: 'known' })), 'es')).toEqual(['known', 'known']);
  });
  it('a form marked Known by the learner over a lemma at Seen: known (the learner decides)', () => {
    const f = row(FORM, { level: 'known', selfMark: { mark: 'known', at: T2 } });
    const l = row(LEMMA, { level: 'seen' });
    expect(classifyWord(word(FORM, LEMMA), rowsOf(f, l), 'es')).toEqual(['known', 'known']);
  });
  it('the newest own mark decides: an older Known mark under a newer mark of New is not known', () => {
    const l = row(LEMMA, { level: 'known', selfMark: { mark: 'known', at: T1 } });
    const f = row(FORM, { level: 'new', selfMark: { mark: 'new', at: T3 } });
    const [verdict, level] = classifyWord(word(FORM, LEMMA), rowsOf(f, l), 'es');
    expect(verdict).toBe('below');
    expect(level).toBe('new');
  });
  it('the newest own mark decides: a newer Known mark over an older mark of Recognized is known', () => {
    const l = row(LEMMA, { level: 'recognized', selfMark: { mark: 'recognized', at: T1 } });
    const f = row(FORM, { level: 'known', selfMark: { mark: 'known', at: T3 } });
    expect(classifyWord(word(FORM, LEMMA), rowsOf(f, l), 'es')).toEqual(['known', 'known']);
  });
  it('a newer mark BELOW Known beats older evidence of Known', () => {
    const l = row(LEMMA, { level: 'known' });
    const f = row(FORM, { level: 'recognized', selfMark: { mark: 'recognized', at: T2 } });
    expect(classifyWord(word(FORM, LEMMA), rowsOf(f, l), 'es')).toEqual(['below', 'recognized']);
  });
  it('without a mark the highest level either row supports wins', () => {
    expect(classifyWord(word(FORM, LEMMA), rowsOf(row(FORM, { level: 'familiar' }), row(LEMMA, { level: 'automatic' })), 'es')).toEqual(['known', 'automatic']);
    expect(classifyWord(word(FORM, LEMMA), rowsOf(row(FORM, { level: 'known' }), row(LEMMA, { level: 'seen' })), 'es')).toEqual(['known', 'known']);
  });

  /** Every row a property loop may meet: none; each level, unmarked; each level with a mark of each level at two instants. */
  const optionsFor = (unit: string): Array<UnitKnowledge | undefined> => {
    const out: Array<UnitKnowledge | undefined> = [undefined];
    for (const level of KNOWLEDGE_LEVELS) {
      out.push(row(unit, { level }));
      for (const m of KNOWLEDGE_LEVELS) for (const at of [T1, T3]) out.push(row(unit, { level: m === 'new' ? level : m, selfMark: { mark: m, at } }));
    }
    return out;
  };
  it('for a single-reading word classifyWord ALWAYS equals what levelOfRows gives for [form, lemma] (property loop)', () => {
    const forms = optionsFor(FORM);
    const lemmas = optionsFor(LEMMA);
    let n = 0;
    for (const f of forms) for (const l of lemmas) {
      const rows = [f, l].filter((r): r is UnitKnowledge => !!r);
      const expectedLevel = levelOfRows([f, l].map((r) => (r ? compactKnowledge(r) : undefined)));
      const expected: WireVerdict = isKnown(expectedLevel) ? ['known', expectedLevel] : ['below', expectedLevel];
      const got = classifyWord(word(FORM, LEMMA), rowsOf(...rows), 'es');
      if (JSON.stringify(got) !== JSON.stringify(expected)) throw new Error(`form=${JSON.stringify(f && { level: f.level, mark: f.selfMark })} lemma=${JSON.stringify(l && { level: l.level, mark: l.selfMark })}: classifyWord ${JSON.stringify(got)} but levelOfRows says ${expectedLevel}`);
      n++;
    }
    expect(n).toBe(forms.length * lemmas.length);
    expect(n).toBeGreaterThan(5000);
  });
  it('the same loop for a word with a form row and no reading', () => {
    for (const f of optionsFor(FORM)) {
      const expectedLevel = levelOfRows([f ? compactKnowledge(f) : undefined]);
      const got = classifyWord(word(FORM), rowsOf(...(f ? [f] : [])), 'es');
      expect(got).toEqual(f ? (isKnown(expectedLevel) ? ['known', expectedLevel] : ['below', expectedLevel]) : ['unidentified', 'new']);
    }
  });
});

// ───────────────────────────── c. several readings ─────────────────────────────
describe('classifyWord: a spelling with several readings', () => {
  const R1 = 'lemma:es:a:NOUN', R2 = 'lemma:es:b:VERB', R3 = 'lemma:es:c:ADJ';
  const w3 = word(FORM, R1, R2, R3);
  it('all Known (Known or Automatic): known, at the lowest of them', () => {
    expect(classifyWord(w3, rowsOf(row(R1, { level: 'known' }), row(R2, { level: 'automatic' }), row(R3, { level: 'known' })), 'es')).toEqual(['known', 'known']);
    expect(classifyWord(w3, rowsOf(row(R1, { level: 'automatic' }), row(R2, { level: 'automatic' }), row(R3, { level: 'automatic' })), 'es')).toEqual(['known', 'automatic']);
  });
  it('none Known: below, at the most established of them', () => {
    expect(classifyWord(w3, rowsOf(row(R1, { level: 'seen' }), row(R2, { level: 'familiar' })), 'es')).toEqual(['below', 'familiar']);
    expect(classifyWord(w3, rowsOf(), 'es')).toEqual(['below', 'new']);
  });
  it('some Known and some not: ambiguous, never known', () => {
    for (const rows of [
      [row(R1, { level: 'known' })],
      [row(R1, { level: 'known' }), row(R2, { level: 'automatic' })],
      [row(R3, { level: 'automatic' }), row(R2, { level: 'recognized' })],
    ]) {
      const [verdict, level] = classifyWord(w3, rowsOf(...rows), 'es');
      expect(verdict).toBe('ambiguous');
      expect(KNOWLEDGE_LEVELS).toContain(level);
    }
  });
  it('two readings behave the same way', () => {
    const w2 = word(FORM, R1, R2);
    expect(classifyWord(w2, rowsOf(row(R1, { level: 'known' }), row(R2, { level: 'known' })), 'es')[0]).toBe('known');
    expect(classifyWord(w2, rowsOf(row(R1, { level: 'known' })), 'es')[0]).toBe('ambiguous');
    expect(classifyWord(w2, rowsOf(row(R1, { level: 'familiar' })), 'es')[0]).toBe('below');
  });
  it('a form row marked Known by the learner is known whatever the readings say', () => {
    const f = row(FORM, { level: 'known', selfMark: { mark: 'known', at: T2 } });
    expect(classifyWord(w3, rowsOf(f), 'es')).toEqual(['known', 'known']);
    expect(classifyWord(w3, rowsOf(f, row(R1, { level: 'known' }), row(R2, { level: 'seen' })), 'es')[0]).toBe('known');
    expect(classifyWord(w3, rowsOf(f, row(R1, { level: 'new' })), 'es')[0]).toBe('known');
  });
  it('a form row with Known evidence (no mark) counts for every reading, the cautious rule being the same one as for one reading', () => {
    expect(classifyWord(w3, rowsOf(row(FORM, { level: 'known' })), 'es')[0]).toBe('known');
  });
});

// ───────────────────────────── d. no reading ─────────────────────────────
describe('classifyWord: a word with no reading', () => {
  it('no form row: unidentified (never assumed unknown)', () => {
    expect(classifyWord(word(FORM), rowsOf(), 'es')).toEqual(['unidentified', 'new']);
    expect(classifyWord(word(FORM), rowsOf(row(LEMMA, { level: 'known' })), 'es')).toEqual(['unidentified', 'new']);
  });
  it.each(KNOWLEDGE_LEVELS.map((l) => [l]))('a form row at %s: that row\'s level', (level) => {
    expect(classifyWord(word(FORM), rowsOf(row(FORM, { level })), 'es')).toEqual(isKnown(level) ? ['known', level] : ['below', level]);
  });
});

// ───────────────────────────── e. varieties ─────────────────────────────
describe('classifyWord: languages with learning varieties', () => {
  const EL = 'lemma:el:logos:NOUN';
  const ELF = 'form:el:logos';
  const HE = 'lemma:he:melekh:NOUN';
  const HEF = 'form:he:melekh';

  describe('hand-built rows', () => {
    const koineKnown = row(EL, { level: 'known', varieties: { 'el-koi': slice('known') } });
    it('classified Known in el-koi: known when the text is el-koi', () => {
      expect(classifyWord(word(ELF, EL), rowsOf(koineKnown), 'el', 'el-koi')).toEqual(['known', 'known']);
    });
    it('the same row read as el-mod is NOT known: new, below', () => {
      expect(classifyWord(word(ELF, EL), rowsOf(koineKnown), 'el', 'el-mod')).toEqual(['below', 'new']);
    });
    it('aliases of a variety are the variety', () => {
      expect(classifyWord(word(ELF, EL), rowsOf(koineKnown), 'el', 'grc-koine')).toEqual(['known', 'known']);
    });
    it('Hebrew: Known in he-bib is known in he-bib and not in he-mod', () => {
      const r = row(HE, { level: 'automatic', varieties: { 'he-bib': slice('automatic') } });
      expect(classifyWord(word(HEF, HE), rowsOf(r), 'he', 'he-bib')).toEqual(['known', 'automatic']);
      expect(classifyWord(word(HEF, HE), rowsOf(r), 'he', 'he-mod')).toEqual(['below', 'new']);
    });
    it('a whole-variety row (every record of the unit belongs to one variety) is that variety\'s knowledge only', () => {
      const r = row(EL, { level: 'known', varieties: { 'el-koi': { whole: true } } });
      expect(classifyWord(word(ELF, EL), rowsOf(r), 'el', 'el-koi')).toEqual(['known', 'known']);
      expect(classifyWord(word(ELF, EL), rowsOf(r), 'el', 'el-mod')).toEqual(['below', 'new']);
    });
    it.each([['el', 'el-koi', EL, ELF], ['he', 'he-bib', HE, HEF]])('%s: a legacy language-wide Known mark with no varieties at all is unsettled in every variety', (lang, v, lemma, form) => {
      const legacy = row(lemma, { level: 'known', selfMark: { mark: 'known', at: T1 } });
      expect(classifyWord(word(form, lemma), rowsOf(legacy), lang, v)).toEqual(['unsettled', 'known']);
      for (const other of lang === 'el' ? ['el-mod', 'el-att', 'el-hom', 'el-koi'] : ['he-mod', 'he-bib']) {
        expect(classifyWord(word(form, lemma), rowsOf(legacy), lang, other)[0], other).toBe('unsettled');
      }
    });
    it('a legacy Known row that also has Automatic evidence from nowhere stays unsettled (never known)', () => {
      const legacy = row(EL, { level: 'automatic' });
      expect(classifyWord(word(ELF, EL), rowsOf(legacy), 'el', 'el-koi')).toEqual(['unsettled', 'automatic']);
    });
    it('Known via an unclassified mark plus classified but LOWER evidence in the variety: unsettled, not known', () => {
      const r = row(EL, {
        level: 'known', selfMark: { mark: 'known', at: T3 },
        varieties: { 'el-koi': { ...slice('known', { mark: 'known', at: T3 }), own: { level: 'recognized', events: 2, reader: 2, review: 0 } } },
      });
      expect(classifyWord(word(ELF, EL), rowsOf(r), 'el', 'el-koi')).toEqual(['unsettled', 'known']);
    });
    it('Known in el-koi (classified) and a legacy Known mark: still known in el-koi because the variety\'s own evidence says so', () => {
      const r = row(EL, { level: 'known', varieties: { 'el-koi': slice('known', { mark: 'known', at: T1 }) } });
      expect(classifyWord(word(ELF, EL), rowsOf(r), 'el', 'el-koi')).toEqual(['known', 'known']);
    });
    it('a legacy mark is read in a variety the unit has no classified evidence in: still the unclassified record, unsettled', () => {
      const unclassified = { ...slice('known', { mark: 'known', at: T1 }) } as UnitKnowledge['unclassified'];
      const { own: _own, ...loose } = unclassified as VarietyKnowledge;
      const r = row(EL, { level: 'known', varieties: { 'el-koi': slice('recognized') }, unclassified: loose });
      expect(classifyWord(word(ELF, EL), rowsOf(r), 'el', 'el-mod')).toEqual(['unsettled', 'known']);
    });
    it('several readings in a variety language: credited only when every reading is credited', () => {
      const A = 'lemma:el:a:NOUN', B = 'lemma:el:b:NOUN';
      const known = (id: string) => row(id, { level: 'known', varieties: { 'el-koi': slice('known') } });
      expect(classifyWord(word(ELF, A, B), rowsOf(known(A), known(B)), 'el', 'el-koi')).toEqual(['known', 'known']);
      // one reading Known in the variety, the other Known only through a legacy record: both are "Known", not credited as a whole
      const legacy = row(B, { level: 'known' });
      expect(classifyWord(word(ELF, A, B), rowsOf(known(A), legacy), 'el', 'el-koi')).toEqual(['unsettled', 'known']);
      // one Known in the variety, the other not Known there: ambiguous
      expect(classifyWord(word(ELF, A, B), rowsOf(known(A)), 'el', 'el-koi')[0]).toBe('ambiguous');
    });
    it('without a variety a variety language never credits Known (the caller must name one): unsettled, with the level it rests on', () => {
      expect(classifyWord(word(ELF, EL), rowsOf(koineKnown), 'el')).toEqual(['unsettled', 'known']);
    });
    it('a language without learning varieties ignores the variety argument', () => {
      const r = row(LEMMA, { level: 'known' });
      for (const v of [undefined, 'el-koi', 'he-bib', 'nonsense', '']) expect(classifyWord(word(FORM, LEMMA), rowsOf(r), 'es', v), String(v)).toEqual(['known', 'known']);
      const low = row(LEMMA, { level: 'familiar' });
      for (const v of [undefined, 'el-koi']) expect(classifyWord(word(FORM, LEMMA), rowsOf(low), 'es', v)).toEqual(['below', 'familiar']);
      // Aramaic is a heritage variety of Hebrew, not a language with varieties of its own here
      const arc = row('lemma:arc:x:NOUN', { level: 'known' });
      expect(classifyWord(word('form:arc:x', 'lemma:arc:x:NOUN'), rowsOf(arc), 'arc', 'he-bib')).toEqual(['known', 'known']);
    });
  });

  describe('rows folded by the real engine (the events a reader and a mark really produce)', () => {
    it('Known classified in el-koi: known in el-koi, below (new) in el-mod', () => {
      const unit = 'lemma:el:fold1:NOUN';
      const [r] = knowledgeOf(met(unit, 'el-koi', 1, 'known'));
      expect(classifyWord(word('form:el:fold1', unit), rowsOf(r!), 'el', 'el-koi')).toEqual(['known', 'known']);
      expect(classifyWord(word('form:el:fold1', unit), rowsOf(r!), 'el', 'el-mod')).toEqual(['below', 'new']);
    });
    it('Known classified in he-bib: the same for Hebrew', () => {
      const unit = 'lemma:he:fold2:NOUN';
      const [r] = knowledgeOf(met(unit, 'he-bib', 1, 'known'));
      expect(classifyWord(word('form:he:fold2', unit), rowsOf(r!), 'he', 'he-bib')[0]).toBe('known');
      expect(classifyWord(word('form:he:fold2', unit), rowsOf(r!), 'he', 'he-mod')).toEqual(['below', 'new']);
    });
    it('a legacy mark with nothing classified is unsettled in every variety', () => {
      const unit = 'lemma:el:fold3:NOUN';
      const [r] = knowledgeOf([mark(unit, 'known', { at: day(1) })]);
      expect(r!.varieties).toBeUndefined();
      for (const v of ['el-koi', 'el-mod', 'el-att']) expect(classifyWord(word('form:el:fold3', unit), rowsOf(r!), 'el', v), v).toEqual(['unsettled', 'known']);
    });
    it('classified evidence below Known and a NEWER legacy Known mark: unsettled, not known', () => {
      const unit = 'lemma:el:fold4:NOUN';
      const [r] = knowledgeOf([...met(unit, 'el-koi', 1, 'recognized'), mark(unit, 'known', { at: day(5) })]);
      const [verdict, level] = classifyWord(word('form:el:fold4', unit), rowsOf(r!), 'el', 'el-koi');
      expect(verdict).toBe('unsettled');
      expect(level).toBe('known');
    });
    it('an unclassified lookup (only the enrolment default speaks) classifies nothing: a Known mark on it is unsettled', () => {
      const unit = 'lemma:el:fold5:NOUN';
      const [r] = knowledgeOf([lookup(unit, { at: day(1), weak: 'el-mod' }), mark(unit, 'known', { at: day(2) })]);
      expect(classifyWord(word('form:el:fold5', unit), rowsOf(r!), 'el', 'el-mod')[0]).toBe('unsettled');
    });
    it('Known in el-koi, then newly met in el-mod below Known: el-mod is below, el-koi stays known', () => {
      const unit = 'lemma:el:fold6:NOUN';
      const [r] = knowledgeOf([...met(unit, 'el-koi', 1, 'known'), ...met(unit, 'el-mod', 3, 'recognized')]);
      expect(classifyWord(word('form:el:fold6', unit), rowsOf(r!), 'el', 'el-koi')[0]).toBe('known');
      expect(classifyWord(word('form:el:fold6', unit), rowsOf(r!), 'el', 'el-mod')).toEqual(['below', 'recognized']);
    });
  });
});

// ───────────────────────────── f. coverage ─────────────────────────────
const counted = (spec: Array<[WireVerdict, number]>): CountedVerdict[] => spec.map(([verdict, occurrences]) => ({ verdict, occurrences }));
const sumOfBuckets = (c: ReturnType<typeof coverageOf>['counts']): number => c.known + c.automatic + c.familiar + c.recognized + c.seen + c.new + c.unsettled + c.ambiguous + c.unidentified;

describe('coverageOf and formatPercent', () => {
  it('2,000 occurrences: 1,200 Known + 500 Automatic + 200 Familiar + 80 Recognized + 20 New is exactly 85.0%', () => {
    const cov = coverageOf(counted([[['known', 'known'], 1200], [['known', 'automatic'], 500], [['below', 'familiar'], 200], [['below', 'recognized'], 80], [['below', 'new'], 20]]));
    expect(cov.counts).toEqual({ total: 2000, known: 1200, automatic: 500, familiar: 200, recognized: 80, seen: 0, new: 20, unsettled: 0, ambiguous: 0, unidentified: 0 });
    expect(cov.knownOccurrences).toBe(1700);
    expect(cov.knownPercent).toBeCloseTo(85, 10);
    expect(formatPercent(cov.knownOccurrences, cov.counts.total)).toBe('85.0%');
    expect(cov.exact).toBe(true);
    expect(cov.upperPercent).toBeCloseTo(85, 10);
    expect(cov.distinctWords).toBe(5);
    expect(sumOfBuckets(cov.counts)).toBe(cov.counts.total);
  });
  it('1,000 occurrences: 500 + 350 + 100 + 50 is 85.0%, and moving a 40-occurrence word from Familiar to Known makes it 89.0%', () => {
    const before = coverageOf(counted([[['known', 'known'], 500], [['known', 'automatic'], 350], [['below', 'familiar'], 40], [['below', 'familiar'], 60], [['below', 'recognized'], 50]]));
    expect(formatPercent(before.knownOccurrences, before.counts.total)).toBe('85.0%');
    const after = coverageOf(counted([[['known', 'known'], 500], [['known', 'known'], 40], [['known', 'automatic'], 350], [['below', 'familiar'], 60], [['below', 'recognized'], 50]]));
    expect(after.counts.total).toBe(1000);
    expect(after.counts.known).toBe(540);
    expect(after.counts.familiar).toBe(60);
    expect(formatPercent(after.knownOccurrences, after.counts.total)).toBe('89.0%');
    expect(sumOfBuckets(before.counts)).toBe(1000);
    expect(sumOfBuckets(after.counts)).toBe(1000);
  });
  it('the undecided buckets are counted, never credited, and bound the upper figure', () => {
    const cov = coverageOf(counted([[['known', 'known'], 60], [['unsettled', 'known'], 10], [['ambiguous', 'seen'], 10], [['unidentified', 'new'], 10], [['below', 'seen'], 10]]));
    expect(cov.counts).toMatchObject({ total: 100, known: 60, unsettled: 10, ambiguous: 10, unidentified: 10, seen: 10 });
    expect(cov.knownPercent).toBeCloseTo(60, 10);
    expect(cov.upperPercent).toBeCloseTo(90, 10);
    expect(cov.exact).toBe(false);
    expect(sumOfBuckets(cov.counts)).toBe(100);
  });
  it('an empty text has no percentage', () => {
    const cov = coverageOf([]);
    expect(cov.counts.total).toBe(0);
    expect(cov.knownPercent).toBeNull();
    expect(cov.upperPercent).toBeNull();
    expect(cov.exact).toBe(true);
    expect(formatPercent(0, 0)).toBe('–');
  });
  it('counts always sum to total, for every verdict combination a classifier can produce', () => {
    const all: WireVerdict[] = [];
    for (const l of KNOWLEDGE_LEVELS) all.push(isKnown(l) ? ['known', l] : ['below', l], ['unsettled', l], ['ambiguous', l], ['unidentified', l]);
    const cov = coverageOf(counted(all.map((v, i) => [v, i + 1] as [WireVerdict, number])));
    expect(cov.counts.total).toBe(all.reduce((_, __, i) => _ + i + 1, 0));
    expect(sumOfBuckets(cov.counts)).toBe(cov.counts.total);
  });
  it('a malformed verdict throws', () => {
    for (const bad of [['known', 'familiar'], ['known', 'new'], ['below', 'known'], ['below', 'automatic'], ['bogus', 'new'], ['known', 'nonsense'], ['below', 'nonsense']] as unknown as WireVerdict[]) {
      expect(() => bucketOf(bad), JSON.stringify(bad)).toThrow(RangeError);
      expect(() => coverageOf([{ verdict: bad, occurrences: 1 }]), JSON.stringify(bad)).toThrow(RangeError);
    }
  });
  it('a count that is not a whole, positive number throws', () => {
    for (const n of [0, -1, 1.5, NaN, Infinity]) expect(() => coverageOf([{ verdict: ['known', 'known'], occurrences: n }]), String(n)).toThrow(RangeError);
  });

  describe('formatPercent: one decimal, half up, on exact integers', () => {
    it.each([
      [1, 3, '33.3%'], [2, 3, '66.7%'], [8760, 10000, '87.6%'], [0, 10, '0.0%'], [10, 10, '100.0%'], [1, 2, '50.0%'],
      [1, 8, '12.5%'], [1, 16, '6.3%'], // 6.25 rounds half up
      [8505, 10000, '85.1%'], // 85.05 is not a binary fraction: half up on the exact value
      [1, 2000, '0.1%'], // 0.05 rounds up
      [1999, 2000, '99.9%'], // 99.95 would round to 100.0: never shown as 100 unless all
    ])('%i of %i is %s', (part, total, shown) => {
      expect(formatPercent(part, total)).toBe(shown);
    });
    it('9,995 of 10,000 is not shown as 100.0%', () => {
      expect(formatPercent(9995, 10000)).not.toBe('100.0%');
      expect(formatPercent(9995, 10000)).toBe('99.9%');
    });
    it('1 of 100,000 is not shown as 0.0%', () => {
      expect(formatPercent(1, 100000)).not.toBe('0.0%');
      expect(formatPercent(1, 100000)).toBe('0.1%');
    });
    it('100.0% appears only when every occurrence is counted, and 0.0% only when none is', () => {
      for (const total of [3, 7, 1000, 99999]) {
        expect(formatPercent(total, total)).toBe('100.0%');
        expect(formatPercent(0, total)).toBe('0.0%');
        expect(formatPercent(total - 1, total)).not.toBe('100.0%');
        expect(formatPercent(1, total)).not.toBe('0.0%');
      }
    });
    it('is monotone in the part, for a fixed total', () => {
      const total = 977;
      let prev = -1;
      for (let part = 0; part <= total; part++) {
        const v = parseFloat(formatPercent(part, total));
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    });
  });
});

/**
 * Tests of the treebank comparison. The adapter here is a FAKE defined in this file, so nothing depends on the real
 * Albanian engine. The sentences are those of the HAND-MADE test/bench/fixtures/sq-sample.conllu (not an extract of any
 * treebank) or small inline ones.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnalysisCandidate, PartOfSpeech } from '../../src/core';
import { parseConllu, type UdSentence } from '../../src/bench/sq/conllu';
import { compareWithTreebank, fnv1a, isContentToken, pct, splitOf, type ComparableAdapter, type Split } from '../../src/bench/sq/compare';
import { formatReport } from '../../src/bench/sq/report';

// ───────────────────────────── a fake adapter ─────────────────────────────

type Dict = Record<string, AnalysisCandidate[]>;
const norm = (s: string): string => s.normalize('NFC').toLowerCase();

function fake(dict: Dict, opts: { splitApostrophe?: boolean } = {}): ComparableAdapter {
  const re = opts.splitApostrophe ? /\p{L}+|\p{N}+|[^\s\p{L}\p{N}]/gu : /\p{L}+(?:'\p{L}+)?|\p{N}+|[^\s\p{L}\p{N}]/gu;
  return {
    lang: 'sq', name: 'fake', version: '0', normalize: norm,
    tokenize: (text) => [...text.matchAll(re)].map((m) => ({
      surface: m[0], start: m.index!, end: m.index! + m[0].length, isWord: /\p{L}/u.test(m[0]), normalized: norm(m[0]),
    })),
    analyze: (tokens) => tokens.map((t) => ({ token: t, candidates: t.isWord ? dict[norm(t.surface)] ?? [] : [], analyzer: 'fake@1' })),
  };
}

const cand = (lemma: string, pos: string, morph: Record<string, string> = {}, extra: Partial<AnalysisCandidate> = {}): AnalysisCandidate =>
  ({ lemma, pos: pos as PartOfSpeech, morph, confidence: 0.9, ...extra });

/** The dictionary that reads every word of the given sentences exactly as the treebank has it (first met first). */
function perfectDict(sentences: UdSentence[]): Dict {
  const dict: Dict = {};
  for (const s of sentences) {
    for (const t of s.tokens.filter(isContentToken)) {
      const w = t.words[0];
      const c = cand(w.lemma!, w.upos!, { ...w.feats }, t.multiword
        ? { parts: t.words.map((x) => ({ text: x.form, start: 0, end: 0, lemma: x.lemma, pos: x.upos as PartOfSpeech })) }
        : {});
      const list = (dict[norm(t.form)] ??= []);
      if (!list.some((x) => JSON.stringify(x) === JSON.stringify(c))) list.push(c);
    }
  }
  return dict;
}

// ───────────────────────────── sentences ─────────────────────────────

const sample = parseConllu(fs.readFileSync(path.resolve('test/bench/fixtures/sq-sample.conllu'), 'utf8'));

/** Fresh sentence ids that fall in the wanted split. */
function idsFor(split: Split, n: number): string[] {
  const out: string[] = [];
  for (let k = 0; out.length < n; k++) if (splitOf(`t-${k}`) === split) out.push(`t-${k}`);
  return out;
}
const inSplit = (sentences: UdSentence[], split: Split): UdSentence[] => {
  const ids = idsFor(split, sentences.length);
  return sentences.map((s, i) => ({ ...s, id: ids[i] }));
};
const devSample = inSplit(sample, 'dev');

const W = (id: number, form: string, lemma: string, upos: string, feats = '_', misc = '_'): string => [id, form, lemma, upos, '_', feats, '0', 'dep', '_', misc].join('\t');
function small(split: Split, text: string, ...rows: string[]): UdSentence {
  const [s] = parseConllu([`# sent_id = ${idsFor(split, 1)[0]}`, `# text = ${text}`, ...rows].join('\n'));
  return s;
}

// ───────────────────────────── tokens ─────────────────────────────

describe('tokens', () => {
  it('a faithful adapter tokenizes every sample sentence exactly', () => {
    const r = compareWithTreebank(devSample, fake(perfectDict(sample)), { split: 'dev' });
    expect(r.sentences).toBe(12);
    expect(r.tokens.sentencesExact).toEqual({ n: 12, of: 12 });
    expect(r.tokens.treebankTokens).toBe(43); // punctuation excluded; a multiword token counted once
    expect(r.tokens.adapterTokens).toBe(43);
    expect(r.tokens.matched).toBe(43);
    expect(r.tokens.precision).toEqual({ n: 43, of: 43 });
    expect(r.tokens.recall).toEqual({ n: 43, of: 43 });
    expect(r.tokens.f1).toBe(1);
  });

  it('an adapter that splits at apostrophes loses the sentences with t\'i and s\'ka, and the F1 shows it', () => {
    const r = compareWithTreebank(devSample, fake(perfectDict(sample), { splitApostrophe: true }), { split: 'dev' });
    expect(r.tokens.sentencesExact).toEqual({ n: 10, of: 12 });
    // S'ka -> S + ka, t'i -> t + i : two treebank tokens are missed, four adapter tokens are wrong
    expect(r.tokens.matched).toBe(41);
    expect(r.tokens.treebankTokens).toBe(43);
    expect(r.tokens.adapterTokens).toBe(45);
    expect(r.tokens.precision).toEqual({ n: 41, of: 45 });
    expect(r.tokens.recall).toEqual({ n: 41, of: 43 });
    const p = 41 / 45, rc = 41 / 43;
    expect(r.tokens.f1).toBeCloseTo((2 * p * rc) / (p + rc), 10);
    expect(pct(r.tokens.recall)).toBe('95.3%');
  });

  it('counts a sentence with no content token as exact, and ignores numerals and punctuation on both sides', () => {
    const s = small('dev', '1990 !', W(1, '1990', '1990', 'NUM'), W(2, '!', '!', 'PUNCT'));
    const r = compareWithTreebank([s], fake({}), { split: 'dev' });
    expect(r.tokens.sentencesExact).toEqual({ n: 1, of: 1 });
    expect(r.tokens.treebankTokens).toBe(0);
    expect(r.tokens.precision.of).toBe(0);
    expect(r.tokens.f1).toBe(0);
    expect(pct(r.tokens.precision)).toBe('n/a');
  });
});

// ───────────────────────────── multiword tokens ─────────────────────────────

describe('multiword tokens', () => {
  const run = (dict: Dict, opts: { splitApostrophe?: boolean } = {}) => compareWithTreebank(devSample, fake(dict, opts), { split: 'dev' });

  it('a faithful adapter gets all five (ta, Ma, S\'ka, t\'i, ma): one token, parts, lemmas', () => {
    const r = run(perfectDict(sample));
    expect(r.multiword.total).toBe(5);
    expect(r.multiword.oneToken).toEqual({ n: 5, of: 5 });
    expect(r.multiword.partsFirst).toEqual({ n: 5, of: 5 });
    expect(r.multiword.partsAny).toEqual({ n: 5, of: 5 });
    expect(r.multiword.lemmasFirst).toEqual({ n: 5, of: 5 });
    expect(r.multiword.lemmasAny).toEqual({ n: 5, of: 5 });
  });

  it('tabulates the forms by frequency with what the adapter said', () => {
    const r = run(perfectDict(sample));
    const forms = r.multiword.table.map((x) => x.form);
    expect(forms).toHaveLength(4); // Ma and ma are one row
    expect(r.multiword.table[0].count).toBe(2);
    expect(r.multiword.table[0].count).toBeGreaterThanOrEqual(r.multiword.table[3].count);
    const ta = r.multiword.table.find((x) => x.form === 'ta')!;
    expect(ta).toMatchObject({ count: 1, oneToken: 1, partsFirst: 1, lemmasFirst: 1 });
    expect(ta.said[0].what).toBe('parts të/ti + e/ai');
    // 'Ma' and 'ma' are one row (normalized), with two occurrences
    expect(r.multiword.table.filter((x) => norm(x.form) === 'ma')).toHaveLength(1);
    expect(r.multiword.table.find((x) => norm(x.form) === 'ma')!.count).toBe(2);
  });

  it('counts parts by number and lemmas apart, and the first reading apart from any reading', () => {
    const base = perfectDict(sample);
    const ta = base.ta[0];
    const threeParts = { ...ta, parts: [...ta.parts!, { text: 'x', start: 0, end: 0, lemma: 'x', pos: 'PRON' as PartOfSpeech }] };
    const wrongLemma = { ...ta, parts: ta.parts!.map((p, i) => (i === 0 ? { ...p, lemma: 'unë' } : p)) };
    const noParts = { ...ta, parts: undefined };

    const a = run({ ...base, ta: [threeParts] });
    expect(a.multiword.oneToken.n).toBe(5);
    expect(a.multiword.partsFirst.n).toBe(4);
    expect(a.multiword.lemmasFirst.n).toBe(4);

    const b = run({ ...base, ta: [wrongLemma] });
    expect(b.multiword.partsFirst.n).toBe(5); // right number
    expect(b.multiword.lemmasFirst.n).toBe(4); // wrong lemma of the first component

    const c = run({ ...base, ta: [noParts, ta] }); // the right reading is second
    expect(c.multiword.partsFirst.n).toBe(4);
    expect(c.multiword.partsAny.n).toBe(5);
    expect(c.multiword.lemmasFirst.n).toBe(4);
    expect(c.multiword.lemmasAny.n).toBe(5);

    const d = run({ ...base, ta: [] }); // one token, no reading at all
    expect(d.multiword.oneToken.n).toBe(5);
    expect(d.multiword.partsAny.n).toBe(4);
    expect(d.multiword.table.find((x) => x.form === 'ta')!.said[0].what).toBe('no reading');
  });

  it('records a multiword token the adapter splits as not one token, and says how it split it', () => {
    const r = run(perfectDict(sample), { splitApostrophe: true });
    expect(r.multiword.total).toBe(5);
    expect(r.multiword.oneToken).toEqual({ n: 3, of: 5 }); // ta, ma, Ma survive; S'ka and t'i do not
    expect(r.multiword.partsFirst.n).toBe(3);
    expect(r.multiword.lemmasFirst.n).toBe(3);
    const ti = r.multiword.table.find((x) => x.form === "t'i")!;
    expect(ti.oneToken).toBe(0);
    expect(ti.said[0].what).toBe("tokens: t | ' | i");
  });
});

// ───────────────────────────── words ─────────────────────────────

describe('part of speech', () => {
  const sent = (split: Split = 'dev') => small(split, 'Ai është këtu',
    W(1, 'Ai', 'ai', 'PRON'), W(2, 'është', 'jam', 'AUX'), W(3, 'këtu', 'këtu', 'ADV'));

  it('counts AUX/VERB and CCONJ/SCONJ as tolerated confusions, listed apart from errors', () => {
    const adapter = fake({
      ai: [cand('ai', 'PRON')],
      'është': [cand('jam', 'VERB')], // the treebank says AUX
      'këtu': [cand('këtu', 'ADJ'), cand('këtu', 'ADV')], // wrong first, right second
    });
    const r = compareWithTreebank([sent()], adapter, { split: 'dev' });
    const p = r.words.pos;
    expect(p.first).toEqual({ n: 1, of: 3 });
    expect(p.firstLenient).toEqual({ n: 2, of: 3 });
    expect(p.any).toEqual({ n: 2, of: 3 }); // ADV is among the readings of "këtu"; VERB is not AUX
    expect(p.anyLenient).toEqual({ n: 3, of: 3 });
    expect(p.confusion).toEqual([
      { gold: 'AUX', adapter: 'VERB', count: 1, kind: 'tolerated' },
      { gold: 'ADV', adapter: 'ADJ', count: 1, kind: 'error' },
    ].sort((a, b) => b.count - a.count).map((x) => expect.objectContaining(x)));
  });

  it('reads the older CONJ tag as CCONJ and SCONJ as a tolerated neighbour', () => {
    const s = small('dev', 'dhe se', W(1, 'dhe', 'dhe', 'CCONJ'), W(2, 'se', 'se', 'SCONJ'));
    const r = compareWithTreebank([s], fake({ dhe: [cand('dhe', 'CONJ')], se: [cand('se', 'CONJ')] }), { split: 'dev' });
    expect(r.words.pos.first).toEqual({ n: 1, of: 2 }); // dhe: CONJ = CCONJ; se: CONJ is not SCONJ strictly
    expect(r.words.pos.firstLenient).toEqual({ n: 2, of: 2 });
    expect(r.words.pos.confusion).toEqual([{ gold: 'SCONJ', adapter: 'CCONJ', count: 1, kind: 'tolerated' }]);
  });

  it('counts a word with no reading as a miss, with "(none)" in the table', () => {
    const r = compareWithTreebank([sent()], fake({}), { split: 'dev' });
    expect(r.words.pos.first).toEqual({ n: 0, of: 3 });
    expect(r.words.pos.confusion.every((c) => c.adapter === '(none)' && c.kind === 'error')).toBe(true);
    expect(r.coverage).toEqual({ words: 3, none: 3, onlyUnconfirmed: 0, confident: 0 });
  });
});

describe('lemma', () => {
  it('reports "lemma equal" after normalization, and lists the differing pairs instead of calling them errors', () => {
    const s = small('dev', 'Librat e mia', W(1, 'Librat', 'Libër', 'NOUN'), W(2, 'e', 'e', 'DET'), W(3, 'mia', 'im', 'DET'));
    const adapter = fake({
      librat: [cand('libër', 'NOUN')], // equal once normalized (case)
      e: [cand('ai', 'PRON'), cand('e', 'DET')], // first differs, any equal
      mia: [cand('imi', 'DET')], // a convention difference
    });
    const r = compareWithTreebank([s], adapter, { split: 'dev' });
    expect(r.words.lemma.first).toEqual({ n: 1, of: 3 });
    expect(r.words.lemma.any).toEqual({ n: 2, of: 3 });
    expect(r.words.lemma.disagreements).toEqual([{ gold: 'e', adapter: 'ai', count: 1 }, { gold: 'im', adapter: 'imi', count: 1 }].map((x) => expect.objectContaining(x)));
  });

  it('compares a multiword token through its first component', () => {
    const s = small('dev', 'Ma jep', '1-2\tMa\t_\t_\t_\t_\t_\t_\t_\t_', W(1, 'Më', 'unë', 'PRON'), W(2, 'e', 'ai', 'PRON'), W(3, 'jep', 'jap', 'VERB'));
    const r = compareWithTreebank([s], fake({
      ma: [cand('unë', 'PRON', {}, { parts: [] })],
      jep: [cand('jap', 'VERB')],
    }), { split: 'dev' });
    expect(r.words.aligned).toBe(2);
    expect(r.words.alignedMultiword).toBe(1);
    expect(r.words.lemma.first).toEqual({ n: 2, of: 2 });
  });
});

describe('features', () => {
  const sent = small('dev', 'librit',
    W(1, 'librit', 'libër', 'NOUN', 'Case=Dat|Definite=Def|Gender=Masc|Number=Sing'));

  it('a comma union that contains the treebank value does not contradict it', () => {
    const r = compareWithTreebank([sent], fake({ librit: [cand('libër', 'NOUN', { Case: 'Gen,Dat,Abl', Number: 'Sing', Definite: 'Def', Gender: 'Masc' })] }), { split: 'dev' });
    expect(r.words.features.Case.first).toEqual({ n: 1, of: 1 });
    expect(r.words.features.Number.first).toEqual({ n: 1, of: 1 });
    expect(r.words.features.Definite.first).toEqual({ n: 1, of: 1 });
    expect(r.words.features.Gender.first).toEqual({ n: 1, of: 1 });
  });

  it('a union without the value contradicts it; a feature one side does not state is not counted', () => {
    const r = compareWithTreebank([sent], fake({ librit: [cand('libër', 'NOUN', { Case: 'Nom,Acc', Number: 'Plur' })] }), { split: 'dev' });
    expect(r.words.features.Case.first).toEqual({ n: 0, of: 1 });
    expect(r.words.features.Number.first).toEqual({ n: 0, of: 1 });
    expect(r.words.features.Definite.first).toEqual({ n: 0, of: 0 }); // the adapter states no Definite
    expect(r.words.features.Tense.first).toEqual({ n: 0, of: 0 }); // the treebank states no Tense
  });

  it('first and any reading differ: a later reading may agree where the first contradicts', () => {
    const r = compareWithTreebank([sent], fake({
      librit: [cand('libër', 'NOUN', { Case: 'Nom' }), cand('libër', 'NOUN', { Case: 'Dat' }), cand('libër', 'NOUN', {})],
    }), { split: 'dev' });
    expect(r.words.features.Case.first).toEqual({ n: 0, of: 1 });
    expect(r.words.features.Case.any).toEqual({ n: 1, of: 1 });
  });
});

describe('coverage', () => {
  it('separates no reading, only unconfirmed readings, and a confident reading', () => {
    const s = small('dev', 'a b c d', W(1, 'a', 'a', 'X'), W(2, 'b', 'b', 'X'), W(3, 'c', 'c', 'X'), W(4, 'd', 'd', 'X'));
    const r = compareWithTreebank([s], fake({
      a: [],
      b: [cand('b', 'NOUN', {}, { unconfirmed: true })],
      c: [cand('c', 'NOUN', {}, { unconfirmed: true }), cand('c', 'VERB')],
      d: [cand('d', 'NOUN')],
    }), { split: 'dev' });
    expect(r.coverage).toEqual({ words: 4, none: 1, onlyUnconfirmed: 1, confident: 2 });
  });
});

// ───────────────────────────── the split ─────────────────────────────

describe('split', () => {
  it('is FNV-1a of the sent_id, even = dev, and is stable', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(splitOf('a')).toBe('dev');
    expect(splitOf('')).toBe('test');
    for (const s of sample) expect(splitOf(s.id)).toBe(splitOf(s.id));
    const kinds = new Set(sample.map((s) => splitOf(s.id)));
    expect(kinds).toEqual(new Set(['dev', 'test'])); // the twelve sample ids fall on both sides
  });

  it('puts every sentence in exactly one split, and compares only the chosen one', () => {
    const adapter = fake(perfectDict(sample));
    const dev = compareWithTreebank(sample, adapter, { split: 'dev' });
    const test = compareWithTreebank(sample, adapter, { split: 'test' });
    expect(dev.sentences + test.sentences).toBe(12);
    expect(dev.sentences).toBe(sample.filter((s) => splitOf(s.id) === 'dev').length);
    expect(dev.sentencesTotal).toBe(12);
    expect(compareWithTreebank(sample, adapter, { split: 'dev' })).toEqual(dev);
    expect(dev.tokens.treebankTokens + test.tokens.treebankTokens).toBe(43);
  });

  it('collects examples only when asked, at most `show` per kind, and refuses them for the test split', () => {
    const s = small('dev', 'a b c', W(1, 'a', 'a', 'X'), W(2, 'b', 'b', 'X'), W(3, 'c', 'c', 'X'));
    const none = compareWithTreebank([s], fake({}), { split: 'dev' });
    expect(none.examples).toEqual([]);
    const some = compareWithTreebank([s], fake({}), { split: 'dev', show: 2 });
    expect(some.examples.filter((e) => e.kind === 'coverage')).toHaveLength(2);
    expect(some.examples[0]).toMatchObject({ sentId: s.id, text: 'a b c' });

    const t = small('test', 'a b c', W(1, 'a', 'a', 'X'), W(2, 'b', 'b', 'X'), W(3, 'c', 'c', 'X'));
    expect(() => compareWithTreebank([t], fake({}), { split: 'test', show: 1 })).toThrow(/refused for the held-out test split/);
    expect(compareWithTreebank([t], fake({}), { split: 'test' }).examples).toEqual([]);
  });

  it('withholds the tables that would print words from the test split, but keeps the counts and the POS confusion', () => {
    const base = perfectDict(sample);
    const wrong = { ...base, 'libër': [cand('liber', 'ADJ')] };
    const r = compareWithTreebank(inSplit(sample, 'test'), fake(wrong), { split: 'test' });
    expect(r.tablesWithheld).toBe(true);
    expect(r.multiword.table).toEqual([]);
    expect(r.words.lemma.disagreements).toEqual([]);
    expect(r.multiword.total).toBe(5);
    expect(r.words.lemma.first.of).toBeGreaterThan(0);
    expect(r.words.pos.confusion.length).toBeGreaterThan(0);
    expect(formatReport(r).join('\n')).toMatch(/withheld for the held-out split/);

    const d = compareWithTreebank(devSample, fake(wrong), { split: 'dev' });
    expect(d.tablesWithheld).toBe(false);
    expect(d.words.lemma.disagreements[0]).toMatchObject({ gold: 'libër', adapter: 'liber' });
  });
});

describe('report', () => {
  it('prints every percentage with its counts', () => {
    const r = compareWithTreebank(devSample, fake(perfectDict(sample)), { split: 'dev', show: 1, name: 'sample' });
    const text = formatReport(r).join('\n');
    expect(text).toContain('100.0% (12/12)');
    expect(text).toContain('MULTIWORD TOKENS (5 in the treebank');
    expect(text).toMatch(/PRON .* -> /s);
    const withoutF1 = text.split('\n').filter((l) => !l.includes('F1')).join('\n');
    expect(withoutF1).not.toMatch(/\d%(?! \()/); // no bare percentage except the F1 line
  });
});

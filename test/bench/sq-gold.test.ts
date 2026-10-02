/**
 * Tests of the Albanian gold-set machinery: the validator, the status, drafting, accepting, the regression check, and
 * the command-line tool. The adapter in the unit tests is a FAKE defined here; the command-line tests run the real
 * adapter but assert only what does not depend on how good it is. No sentence here is gold: they are test data.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { AnalysisCandidate, PartOfSpeech } from '../../src/core';
import {
  AcceptRefused, GOLD_CATEGORIES, GOLD_TARGETS, GOLD_TARGET_TOTAL, acceptGoldItem, checkAgainstGold, draftGoldItem, goldStatus,
  parseGoldJsonl, toGoldJsonl, validateGoldItem, type ComparableGoldAdapter, type GoldItem,
} from '../../src/bench/sq/gold';
import { runNode } from '../helpers/cli';

// ───────────────────────────── fixtures ─────────────────────────────

const norm = (s: string): string => s.normalize('NFC').toLowerCase();
type Dict = Record<string, AnalysisCandidate[]>;

function fake(dict: Dict): ComparableGoldAdapter {
  const re = /\p{L}+(?:'\p{L}+)?|\p{N}+|[^\s\p{L}\p{N}]/gu;
  return {
    lang: 'sq', name: 'fake', version: '7', normalize: norm,
    tokenize: (text) => [...text.matchAll(re)].map((m) => ({ surface: m[0], start: m.index!, end: m.index! + m[0].length, isWord: /\p{L}/u.test(m[0]), normalized: norm(m[0]) })),
    analyze: (tokens) => tokens.map((t) => ({ token: t, candidates: t.isWord ? dict[norm(t.surface)] ?? [] : [], analyzer: 'fake@7' })),
  };
}
const cand = (lemma: string, pos: string, morph: Record<string, string> = {}, extra: Partial<AnalysisCandidate> = {}): AnalysisCandidate =>
  ({ lemma, pos: pos as PartOfSpeech, morph, confidence: 0.9, ...extra });

const DICT: Dict = {
  nuk: [cand('nuk', 'PART')],
  e: [cand('e', 'PRON', { Clitic: 'Yes' })],
  di: [cand('di', 'VERB', { Person: '1', Number: 'Sing', Tense: 'Pres' })],
  ta: [cand('të', 'PRON', {}, { parts: [{ text: 'të', start: 0, end: 2, lemma: 'ti', pos: 'PRON' }, { text: 'e', start: 2, end: 3, lemma: 'ai', pos: 'PRON' }] })],
  librit: [cand('libër', 'NOUN', { Case: 'Gen,Dat,Abl', Number: 'Sing' })],
};
const adapter = fake(DICT);
const NOW = () => new Date('2026-10-01T10:00:00Z');

/** A reviewed item written by hand (not drafted by the machine). */
function reviewed(over: Partial<GoldItem> = {}): GoldItem {
  return {
    id: 'sq-negation-test0001',
    text: 'Nuk e di.',
    variety: 'sq',
    categories: ['negation', 'clitic'],
    tokens: [
      { form: 'Nuk', start: 0, end: 3, lemma: 'nuk', upos: 'PART', feats: {} },
      { form: 'e', start: 4, end: 5, lemma: 'e', upos: 'PRON', feats: { Clitic: 'Yes' } },
      { form: 'di', start: 6, end: 8, lemma: 'di', upos: 'VERB', feats: { Person: '1', Number: 'Sing', Tense: 'Pres' } },
    ],
    source: { kind: 'reviewer-written' },
    review: { status: 'native-reviewed', reviewer: 'Test Reviewer', reviewedAt: '2026-10-01' },
    analysisVersion: 'fake@7',
    createdAt: '2026-10-01T09:00:00.000Z',
    ...over,
  };
}
const draftOf = (text = 'Nuk e di.', category: 'negation' | 'clitic' = 'negation') => draftGoldItem(text, adapter, { category, now: NOW });

// ───────────────────────────── the validator ─────────────────────────────

describe('validateGoldItem', () => {
  it('accepts a well-formed reviewed item and a well-formed draft', () => {
    expect(validateGoldItem(reviewed())).toEqual([]);
    expect(validateGoldItem(draftOf())).toEqual([]);
  });

  it('refuses offsets that do not slice the text exactly', () => {
    const bad = reviewed();
    bad.tokens[1] = { ...bad.tokens[1], start: 3, end: 4 };
    expect(validateGoldItem(bad).join('\n')).toMatch(/token 2: offsets 3-4 slice " ", not "e"/);
    const past = reviewed();
    past.tokens[2] = { ...past.tokens[2], end: 99 };
    expect(validateGoldItem(past).join('\n')).toMatch(/token 3: offsets 6-99 are not a span inside the text/);
    const overlap = reviewed();
    overlap.tokens[1] = { form: 'k e', start: 2, end: 5, lemma: 'e', upos: 'PRON', feats: {} };
    expect(validateGoldItem(overlap).join('\n')).toMatch(/token 2: overlaps/);
  });

  it('requires a reviewer and a date for a native-reviewed or approved item', () => {
    for (const status of ['native-reviewed', 'approved'] as const) {
      expect(validateGoldItem(reviewed({ review: { status } })).join('\n')).toMatch(/must name its reviewer/);
      expect(validateGoldItem(reviewed({ review: { status, reviewer: 'A. Person' } })).join('\n')).toMatch(/must carry the date/);
      expect(validateGoldItem(reviewed({ review: { status, reviewer: 'A. Person', reviewedAt: 'yesterday' } })).join('\n')).toMatch(/must carry the date/);
      expect(validateGoldItem(reviewed({ review: { status, reviewer: '  ', reviewedAt: '2026-10-01' } })).join('\n')).toMatch(/must name its reviewer/);
    }
    expect(validateGoldItem(reviewed({ review: { status: 'draft' } }))).toEqual([]);
    expect(validateGoldItem(reviewed({ review: { status: 'rejected', note: 'not Albanian' } }))).toEqual([]);
  });

  it('requires a treebank-derived item to carry its licence and its origin, and never lets it be course-authored', () => {
    expect(validateGoldItem(reviewed({ source: { kind: 'treebank-derived' } })).join('\n')).toMatch(/must carry its licence/);
    expect(validateGoldItem(reviewed({ source: { kind: 'treebank-derived', licence: 'CC BY-SA 4.0' } })).join('\n')).toMatch(/must name where it came from/);
    expect(validateGoldItem(reviewed({ source: { kind: 'treebank-derived', licence: 'CC BY-SA 4.0', ref: 'UD_Albanian-TSA sent 3' } }))).toEqual([]);
    expect(validateGoldItem(reviewed({ source: { kind: 'course-authored', ref: 'UD_Albanian-TSA sent 3' } })).join('\n')).toMatch(/can never be course-authored/);
    expect(validateGoldItem(reviewed({ source: { kind: 'course-authored', ref: 'unit 3, written by the author' } }))).toEqual([]);
    expect(validateGoldItem(reviewed({ source: { kind: 'invented' as never } })).join('\n')).toMatch(/source.kind/);
  });

  it('knows its categories and its UPOS tags, and keeps unions out of reviewed items only', () => {
    expect(validateGoldItem(reviewed({ categories: ['nonsense'] })).join('\n')).toMatch(/unknown category "nonsense"/);
    expect(validateGoldItem(reviewed({ categories: [] })).join('\n')).toMatch(/at least one category/);
    expect(validateGoldItem(reviewed({ categories: ['case', 'case'] })).join('\n')).toMatch(/named twice/);
    const odd = reviewed();
    odd.tokens[0] = { ...odd.tokens[0], upos: 'CONJ' };
    expect(validateGoldItem(odd).join('\n')).toMatch(/upos "CONJ"/);
    const union = reviewed();
    union.tokens[2] = { ...union.tokens[2], feats: { Case: 'Gen,Dat' } };
    expect(validateGoldItem(union).join('\n')).toMatch(/is a union/);
    const d = reviewed({ review: { status: 'draft' } });
    d.tokens[2] = { ...d.tokens[2], feats: { Case: 'Gen,Dat' } };
    expect(validateGoldItem(d)).toEqual([]);
  });

  it('checks parts, NFC and non-objects', () => {
    const one = reviewed();
    one.tokens[0] = { ...one.tokens[0], parts: [{ form: 'x', lemma: 'x', upos: 'PRON' }] };
    expect(validateGoldItem(one).join('\n')).toMatch(/at least two/);
    expect(validateGoldItem(reviewed({ text: 'Nuk ë di.' })).join('\n')).toMatch(/not NFC/);
    expect(validateGoldItem(null)).toEqual(['not an object']);
    expect(validateGoldItem({}).length).toBeGreaterThan(5);
  });
});

// ───────────────────────────── targets and status ─────────────────────────────

describe('targets and status', () => {
  it('has a target for each of the sixteen categories, summing to 1,500 (inside 1,000-2,000)', () => {
    expect(GOLD_CATEGORIES).toHaveLength(16);
    expect(Object.keys(GOLD_TARGETS).sort()).toEqual([...GOLD_CATEGORIES].sort());
    expect(GOLD_TARGET_TOTAL).toBe(1500);
    expect(GOLD_TARGET_TOTAL).toBeGreaterThanOrEqual(1000);
    expect(GOLD_TARGET_TOTAL).toBeLessThanOrEqual(2000);
    expect(GOLD_CATEGORIES).toEqual(expect.arrayContaining([
      'noun-paradigm', 'definiteness', 'case', 'plural', 'irregular-verb', 'tense-mood-voice', 'clitic', 'clitic-cluster',
      'clitic-doubling', 'negation', 'linking-article', 'pronoun', 'subordinate-clause', 'tokenization', 'apostrophe', 'dialect',
    ]));
  });

  it('counts by status and by primary category; later categories are tags that do not count toward a target', () => {
    const items = [
      reviewed({ id: 'a' }),
      reviewed({ id: 'b', categories: ['clitic', 'negation'], review: { status: 'approved', reviewer: 'R', reviewedAt: '2026-10-01' } }),
      reviewed({ id: 'c', review: { status: 'draft' } }),
      reviewed({ id: 'd', review: { status: 'rejected', note: 'x' } }),
    ];
    const s = goldStatus(items);
    expect(s.total).toBe(4);
    expect(s.byStatus).toEqual({ draft: 1, 'native-reviewed': 1, approved: 1, rejected: 1 });
    expect(s.reviewed).toBe(2);
    expect(s.targetTotal).toBe(1500);
    const neg = s.categories.find((c) => c.category === 'negation')!;
    expect(neg).toMatchObject({ target: 80, reviewed: 1, draft: 1, rejected: 1, tagged: 1 });
    const clitic = s.categories.find((c) => c.category === 'clitic')!;
    expect(clitic).toMatchObject({ target: 100, reviewed: 1, tagged: 3 });
  });

  it('reports an empty set honestly', () => {
    const s = goldStatus([]);
    expect(s.reviewed).toBe(0);
    expect(s.total).toBe(0);
    expect(s.categories.every((c) => c.reviewed === 0 && c.draft === 0)).toBe(true);
  });
});

// ───────────────────────────── drafting and accepting ─────────────────────────────

describe('draftGoldItem', () => {
  it('writes the adapter\'s first reading as a DRAFT, valid, stable and flagged as the machine\'s opinion', () => {
    const d = draftGoldItem('Ta di.', adapter, { category: 'clitic-cluster', now: NOW });
    expect(d.review.status).toBe('draft');
    expect(d.review.reviewer).toBeUndefined();
    expect(d.review.note).toMatch(/machine draft/);
    expect(d.analysisVersion).toBe('fake@7');
    expect(d.createdAt).toBe('2026-10-01T10:00:00.000Z');
    expect(d.tokens.map((t) => [t.form, t.start, t.end])).toEqual([['Ta', 0, 2], ['di', 3, 5]]);
    expect(d.tokens[0].parts).toEqual([{ form: 'të', lemma: 'ti', upos: 'PRON' }, { form: 'e', lemma: 'ai', upos: 'PRON' }]);
    expect(d.categories).toEqual(['clitic-cluster']);
    expect(validateGoldItem(d)).toEqual([]);
    expect(draftGoldItem('Ta di.', adapter, { category: 'clitic-cluster', now: NOW }).id).toBe(d.id);
  });

  it('falls back to the normalized form and X for a word the adapter does not know, instead of inventing', () => {
    const d = draftGoldItem('Zzzq', adapter, { category: 'dialect' });
    expect(d.tokens[0]).toMatchObject({ form: 'Zzzq', lemma: 'zzzq', upos: 'X', feats: {} });
  });
});

describe('acceptGoldItem', () => {
  it('refuses without a reviewer name', () => {
    expect(() => acceptGoldItem(draftOf(), {})).toThrow(AcceptRefused);
    expect(() => acceptGoldItem(draftOf(), { by: '   ' })).toThrow(/--by/);
  });

  it('refuses a draft left exactly as the machine wrote it, unless the reviewer says the machine was right', () => {
    expect(() => acceptGoldItem(draftOf(), { by: 'N. Reviewer' })).toThrow(/exactly as the machine drafted/);
    const ok = acceptGoldItem(draftOf(), { by: 'N. Reviewer', confirmUnchanged: true, now: NOW });
    expect(ok.review).toMatchObject({ status: 'native-reviewed', reviewer: 'N. Reviewer', reviewedAt: '2026-10-01' });
    expect(ok.review.draftDigest).toBeUndefined();
    expect(validateGoldItem(ok)).toEqual([]);
  });

  it('accepts an edited draft, and refuses what is not a draft', () => {
    const d = draftOf();
    d.tokens[2] = { ...d.tokens[2], lemma: 'di', feats: { Person: '1' } };
    const ok = acceptGoldItem(d, { by: 'N. Reviewer', now: NOW });
    expect(ok.review.status).toBe('native-reviewed');
    expect(() => acceptGoldItem(ok, { by: 'Another' })).toThrow(/only a draft can be accepted/);
    expect(() => acceptGoldItem({ ...d, review: { status: 'rejected' } }, { by: 'N. Reviewer' })).toThrow(/only a draft/);
  });

  it('refuses an item the validator rejects once it would be reviewed (a union left in the features)', () => {
    const d = draftGoldItem('librit', adapter, { category: 'case' }); // the fake reads "Gen,Dat,Abl"
    expect(d.tokens[0].feats.Case).toBe('Gen,Dat,Abl');
    expect(() => acceptGoldItem(d, { by: 'N. Reviewer', confirmUnchanged: true })).toThrow(/is a union/);
  });

  it('refuses a treebank-derived draft that carries no licence', () => {
    const d = draftGoldItem('Nuk e di.', adapter, { category: 'negation', source: { kind: 'treebank-derived' } });
    expect(validateGoldItem(d).join('\n')).toMatch(/licence/);
    expect(() => acceptGoldItem(d, { by: 'N. Reviewer', confirmUnchanged: true })).toThrow(/licence/);
  });
});

// ───────────────────────────── the check ─────────────────────────────

describe('checkAgainstGold', () => {
  it('checks nothing when there are no reviewed items: drafts and rejected items are never evidence', () => {
    const wrongDraft = draftOf();
    wrongDraft.tokens[2] = { ...wrongDraft.tokens[2], lemma: 'something else entirely' };
    const res = checkAgainstGold([wrongDraft, reviewed({ id: 'r', review: { status: 'rejected' } })], adapter);
    expect(res).toEqual({ checked: 0, skipped: 2, invalid: [], regressions: [] });
    expect(checkAgainstGold([], adapter).checked).toBe(0);
  });

  it('passes a reviewed item the adapter agrees with', () => {
    const res = checkAgainstGold([reviewed()], adapter);
    expect(res.checked).toBe(1);
    expect(res.regressions).toEqual([]);
  });

  it('detects a regression against a reviewed item: wrong lemma, wrong UPOS, contradicting feature', () => {
    const lemma = reviewed(); lemma.tokens[2] = { ...lemma.tokens[2], lemma: 'jam' };
    const upos = reviewed(); upos.tokens[0] = { ...upos.tokens[0], upos: 'ADV' };
    const feat = reviewed(); feat.tokens[2] = { ...feat.tokens[2], feats: { Person: '3' } };
    for (const item of [lemma, upos, feat]) {
      const res = checkAgainstGold([item], adapter);
      expect(res.checked).toBe(1);
      expect(res.regressions).toHaveLength(1);
      expect(res.regressions[0]).toMatchObject({ id: item.id, kind: 'no-reading' });
    }
    expect(checkAgainstGold([lemma], adapter).regressions[0].token).toBe('di');
  });

  it('detects tokenization differences, a correct reading that is not first, and wrong parts', () => {
    const tok = reviewed({ text: 'Nuk e di', tokens: [{ form: 'Nuk e', start: 0, end: 5, lemma: 'nuk', upos: 'PART', feats: {} }, { form: 'di', start: 6, end: 8, lemma: 'di', upos: 'VERB', feats: {} }] });
    expect(checkAgainstGold([tok], adapter).regressions[0]).toMatchObject({ kind: 'tokenization', expected: 'Nuk e | di', got: 'Nuk | e | di' });

    const second = fake({ ...DICT, di: [cand('jam', 'AUX'), ...DICT.di] });
    expect(checkAgainstGold([reviewed()], second).regressions).toEqual([expect.objectContaining({ kind: 'not-first', token: 'di' })]);

    const withParts = reviewed({
      text: 'Ta di.',
      tokens: [
        { form: 'Ta', start: 0, end: 2, lemma: 'të', upos: 'PRON', feats: {}, parts: [{ form: 'të', lemma: 'ti', upos: 'PRON' }, { form: 'e', lemma: 'ai', upos: 'PRON' }] },
        { form: 'di', start: 3, end: 5, lemma: 'di', upos: 'VERB', feats: {} },
      ],
    });
    expect(checkAgainstGold([withParts], adapter).regressions).toEqual([]);
    const noParts = fake({ ...DICT, ta: [cand('të', 'PRON')] });
    expect(checkAgainstGold([withParts], noParts).regressions).toEqual([expect.objectContaining({ kind: 'parts', token: 'Ta', got: '(no parts)' })]);
    const threeParts = fake({ ...DICT, ta: [{ ...DICT.ta[0], parts: [...DICT.ta[0].parts!, { text: 'x', start: 0, end: 0, lemma: 'x', pos: 'PRON' as PartOfSpeech }] }] });
    expect(checkAgainstGold([withParts], threeParts).regressions[0].kind).toBe('parts');
  });

  it('does not check a reviewed item the validator rejects, and says so', () => {
    const bad = reviewed({ id: 'bad', review: { status: 'native-reviewed' } });
    const res = checkAgainstGold([bad, reviewed()], adapter);
    expect(res.checked).toBe(1);
    expect(res.invalid).toEqual([expect.objectContaining({ id: 'bad' })]);
  });
});

describe('jsonl', () => {
  it('round-trips items, skips blank lines and reports a bad line by number', () => {
    const items = [reviewed({ id: 'a' }), draftOf()];
    const text = toGoldJsonl(items);
    expect(text.split('\n').filter(Boolean)).toHaveLength(2);
    expect(parseGoldJsonl(text)).toEqual({ items, problems: [] });
    const parsed = parseGoldJsonl(`${text}\n{not json}\n[1]\n`);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.problems.map((p) => p.line)).toEqual([4, 5]);
    expect(toGoldJsonl([])).toBe('');
  });

  it('every item in data/benchmarks/sq/gold validates (there are none yet)', () => {
    const dir = path.resolve('data/benchmarks/sq/gold');
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
      const parsed = parseGoldJsonl(fs.readFileSync(path.join(dir, f), 'utf8'));
      expect(parsed.problems).toEqual([]);
      for (const it of parsed.items) expect(validateGoldItem(it), `${f} ${it.id}`).toEqual([]);
    }
  });
});

// ───────────────────────────── the command-line tool ─────────────────────────────

const cli = path.resolve('node_modules/vite-node/dist/cli.mjs');
const run = async (...args: string[]) => {
  const r = await runNode([cli, 'scripts/sq-gold.mts', ...args], { cwd: path.resolve('.'), timeout: 120_000 });
  return { status: r.status, out: r.out };
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-gold-'));
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe('npm run sq:gold', () => {
  it('status and check on an empty gold directory say so plainly', async () => {
    const dir = path.join(tmp, 'empty');
    fs.mkdirSync(dir);
    const status = await run('status', '--dir', dir);
    expect(status.status, status.out).toBe(0);
    expect(status.out).toMatch(/0 item\(s\)/);
    expect(status.out).toMatch(/No reviewed item exists yet/);
    expect(status.out).toMatch(/negation\s+80/);
    expect(status.out).toMatch(/total\s+1500/);

    const check = await run('check', '--dir', dir);
    expect(check.status, check.out).toBe(0);
    expect(check.out).toContain('no reviewed items yet: nothing is being checked');
    expect(check.out).not.toMatch(/passed/i);
  }, 600_000);

  it('rejects bad arguments with exit 1', async () => {
    expect((await run()).status).toBe(1);
    expect((await run('nonsense')).status).toBe(1);
    const dir = path.join(tmp, 'args');
    fs.mkdirSync(dir);
    const sentences = path.join(dir, 's.txt');
    fs.writeFileSync(sentences, 'Unë kam një libër.\n', 'utf8');
    const badCat = await run('draft', '--dir', dir, '--in', sentences, '--category', 'nonsense');
    expect(badCat.status).toBe(1);
    expect(badCat.out).toMatch(/unknown category/);
    expect((await run('draft', '--dir', dir, '--in', path.join(dir, 'missing.txt'), '--category', 'case')).status).toBe(1);
    expect((await run('accept', '--dir', dir, '--id', 'nope', '--by', 'X')).status).toBe(1);
  }, 600_000);

  it('drafts are the machine\'s opinion: written as drafts, never checked, and accepted only through a named reviewer', async () => {
    const dir = path.join(tmp, 'flow');
    fs.mkdirSync(dir);
    const sentences = path.join(dir, 'sentences.txt');
    fs.writeFileSync(sentences, '# a comment line\nUnë kam një libër.\n\nNuk e di.\n', 'utf8');

    const draft = await run('draft', '--dir', dir, '--in', sentences, '--category', 'negation');
    expect(draft.status, draft.out).toBe(0);
    expect(draft.out).toMatch(/2 draft item\(s\) written/);
    expect(draft.out).toMatch(/MACHINE'S OPINION/);
    expect(draft.out).toMatch(/not gold/);
    const file = path.join(dir, 'negation.jsonl');
    const parsed = parseGoldJsonl(fs.readFileSync(file, 'utf8'));
    expect(parsed.problems).toEqual([]);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items.every((i) => i.review.status === 'draft' && validateGoldItem(i).length === 0)).toBe(true);

    // a second run skips what is already there
    const again = await run('draft', '--dir', dir, '--in', sentences, '--category', 'negation');
    expect(again.out).toMatch(/0 draft item\(s\) written.*2 already/);
    expect(parseGoldJsonl(fs.readFileSync(file, 'utf8')).items).toHaveLength(2);

    const status = await run('status', '--dir', dir);
    expect(status.out).toMatch(/draft 2 .*native-reviewed 0/);
    expect(status.out).toMatch(/No reviewed item exists yet/);

    // drafts are not evidence
    const check = await run('check', '--dir', dir);
    expect(check.status, check.out).toBe(0);
    expect(check.out).toContain('no reviewed items yet: nothing is being checked');
    expect(check.out).toMatch(/2 draft or rejected item\(s\) left out/);

    // accept refuses without --by, and an unedited draft without --confirm-unchanged; the file is untouched
    const before = fs.readFileSync(file, 'utf8');
    const id = parsed.items[1].id;
    const noBy = await run('accept', '--dir', dir, '--id', id);
    expect(noBy.status).toBe(1);
    expect(noBy.out).toMatch(/--by/);
    const unchanged = await run('accept', '--dir', dir, '--id', id, '--by', 'N. Reviewer');
    expect(unchanged.status).toBe(1);
    expect(unchanged.out).toMatch(/confirm-unchanged|exactly as the machine/);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);

    // the reviewer corrects the analysis (here: decides every feature), then accepts
    const edited = parsed.items.map((i) => (i.id === id ? { ...i, tokens: i.tokens.map((t) => ({ ...t, feats: {} })) } : i));
    fs.writeFileSync(file, toGoldJsonl(edited), 'utf8');
    const ok = await run('accept', '--dir', dir, '--id', id, '--by', 'N. Reviewer');
    expect(ok.status, ok.out).toBe(0);
    expect(ok.out).toMatch(/native-reviewed by N\. Reviewer/);
    expect(ok.out).toMatch(/cannot verify/);
    const after = parseGoldJsonl(fs.readFileSync(file, 'utf8')).items;
    expect(after.find((i) => i.id === id)!.review).toMatchObject({ status: 'native-reviewed', reviewer: 'N. Reviewer' });
    expect(after.find((i) => i.id !== id)!.review.status).toBe('draft');
    expect((await run('accept', '--dir', dir, '--id', id, '--by', 'Another')).status).toBe(1); // no longer a draft

    // now one reviewed item is checked (whether the installed adapter agrees with it depends on the adapter)
    const checked = await run('check', '--dir', dir);
    expect(checked.out).toMatch(/1 reviewed item\(s\) checked/);
    expect(checked.out).not.toContain('nothing is being checked');
    expect(checked.status, checked.out).toBe(/regression\(s\):/.test(checked.out) ? 1 : 0);
  }, 600_000);

  it('check exits 0 for a reviewed item the adapter agrees with and 1 for one it contradicts (items independent of the engine)', async () => {
    const dir = path.join(tmp, 'verdict');
    fs.mkdirSync(dir);
    // a numeral is not a word token for either side, so this item holds for any adapter
    const numeral = reviewed({ id: 'sq-tokenization-num', text: '1990', categories: ['tokenization'], tokens: [{ form: '1990', start: 0, end: 4, lemma: '1990', upos: 'NUM', feats: {} }] });
    const file = path.join(dir, 'a.jsonl');
    fs.writeFileSync(file, toGoldJsonl([numeral]), 'utf8');
    const pass = await run('check', '--dir', dir);
    expect(pass.status, pass.out).toBe(0);
    expect(pass.out).toMatch(/1 reviewed item\(s\) checked/);
    expect(pass.out).toMatch(/no regressions in the 1 reviewed item/);

    // a word no adapter can read as this lemma
    const wrong = reviewed({ id: 'sq-negation-wrong', text: 'Nuk', tokens: [{ form: 'Nuk', start: 0, end: 3, lemma: 'zzzzzz', upos: 'PART', feats: {} }] });
    fs.writeFileSync(file, toGoldJsonl([numeral, wrong]), 'utf8');
    const fail = await run('check', '--dir', dir);
    expect(fail.status, fail.out).toBe(1);
    expect(fail.out).toMatch(/1 regression\(s\)/);
    expect(fail.out).toMatch(/\[no-reading\] sq-negation-wrong "Nuk"/);
  }, 600_000);

  it('stops on a malformed gold file instead of skipping it', async () => {
    const dir = path.join(tmp, 'broken');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'x.jsonl'), '{"id": "a"}\n{nope\n', 'utf8');
    const r = await run('check', '--dir', dir);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/line 2: not valid JSON/);
    const s = await run('status', '--dir', dir);
    expect(s.status).toBe(1);
  }, 600_000);
});

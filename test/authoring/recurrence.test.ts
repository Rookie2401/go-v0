import { describe, expect, it } from 'vitest';
import { analyseCorpus } from '../../src/authoring/analyse';
import { recurrenceReport, renderRecurrenceMarkdown, type RecurrenceOptions } from '../../src/authoring/recurrence';
import { stageOfFromMap } from '../../src/authoring/select';
import { fakeAdapter, mkDoc, seq } from './fake';
import type { CorpusDocument } from '../../src/ingest/format';

const stageOf = stageOfFromMap({ 'work-a': '0', 'work-b': '1', 'work-c': '2' });
const report = (docs: CorpusDocument[], opts?: RecurrenceOptions) => recurrenceReport(analyseCorpus(docs, fakeAdapter, { stageOf }), opts);
const lemma = (r: ReturnType<typeof report>, key: string) => r.lemmas.find((l) => l.key === key)!;

describe('lemma flags', () => {
  it('once / twice: introduced and not repeated', () => {
    const r = report([mkDoc('a', ['luna sol sol f1 f1'])]);
    expect(lemma(r, 'luna|NOUN').flags).toContain('once');
    expect(lemma(r, 'luna|NOUN').flags).not.toContain('twice');
    expect(lemma(r, 'sol|NOUN').flags).toContain('twice');
    expect(lemma(r, 'sol|NOUN').flags).not.toContain('once');
    expect(lemma(r, 'filler|PART').flags).not.toContain('once');
  });

  it('single-text needs three or more occurrences, all in one document', () => {
    const r = report([
      mkDoc('a', ['mesa mesa mesa casa casa sol sol']),
      mkDoc('b', ['casa']),
    ]);
    expect(lemma(r, 'mesa|NOUN').flags).toContain('single-text');
    expect(lemma(r, 'casa|NOUN').flags).not.toContain('single-text'); // two documents
    expect(lemma(r, 'sol|NOUN').flags).not.toContain('single-text'); // only twice
    expect(lemma(r, 'sol|NOUN').flags).toContain('twice');
  });

  it('one-form: at least 6 occurrences, more than 85 % in one form, only for inflecting parts of speech', () => {
    const r = report([mkDoc('a', [
      'pan pan pan pan pan pan', // 6/6 one form NOUN → flagged
      'libro libro libro libro libro libro libro libros', // 7/8 = 87.5 % → flagged
      'rojo rojo rojo rojo rojo rojos', // 5/6 = 83 % → not flagged
      'gato gato gato gato gato', // only 5 occurrences → not flagged
      'aqui aqui aqui aqui aqui aqui aqui', // ADV does not inflect → not flagged
    ])]);
    expect(lemma(r, 'pan|NOUN').flags).toContain('one-form');
    expect(lemma(r, 'libro|NOUN').flags).toContain('one-form');
    expect(lemma(r, 'rojo|ADJ').flags).not.toContain('one-form');
    expect(lemma(r, 'gato|NOUN').flags).not.toContain('one-form');
    expect(lemma(r, 'aquí|ADV').flags).not.toContain('one-form');
    expect(lemma(r, 'libro|NOUN').forms).toEqual([{ form: 'libro', count: 7 }, { form: 'libros', count: 1 }]);
  });

  it('clustered: four occurrences within 60 running words (span below 60), not 60 or more', () => {
    const r = report([mkDoc('a', [
      seq(200, { 0: 'ave', 10: 'ave', 20: 'ave', 59: 'ave', 100: 'ola', 120: 'ola', 140: 'ola', 160: 'ola' }),
    ])]);
    expect(lemma(r, 'ave|NOUN').flags).toContain('clustered');
    expect(lemma(r, 'ola|NOUN').flags).not.toContain('clustered'); // 0..60 apart: span 60
    expect(lemma(r, 'ola|NOUN').gapWords).toEqual({ min: 20, median: 20, max: 20 });
  });

  it('late-gap: more than maxGapWords (default 3000) between two occurrences; the option moves the limit', () => {
    const docs = [mkDoc('a', [seq(3200, { 0: 'lejos', 3001: 'lejos', 5: 'cerca', 3005: 'cerca' })])];
    const r = report(docs);
    expect(lemma(r, 'lejos|NOUN').flags).toContain('late-gap'); // gap 3001
    expect(lemma(r, 'cerca|NOUN').flags).not.toContain('late-gap'); // gap 3000
    const r2 = report(docs, { maxGapWords: 5000 });
    expect(lemma(r2, 'lejos|NOUN').flags).not.toContain('late-gap');
    const r3 = report(docs, { maxGapWords: 100 });
    expect(lemma(r3, 'cerca|NOUN').flags).toContain('late-gap');
  });

  it('gaps: min / median / max in running words and in documents', () => {
    const r = report([
      mkDoc('a', [seq(30, { 0: 'ave', 5: 'ave', 20: 'ave' })]),
      mkDoc('b', [seq(5)]),
      mkDoc('c', [seq(5, { 2: 'ave' })]),
    ]);
    const ave = lemma(r, 'ave|NOUN');
    expect(ave.gapWords).toEqual({ min: 5, median: 15, max: 17 });
    expect(ave.gapDocs).toEqual({ min: 0, median: 0, max: 2 });
    expect(ave.documents).toBe(2);
    expect(ave.first).toEqual({ docId: 'a', sentence: 0 });
    expect(lemma(report([mkDoc('a', ['sol'])]), 'sol|NOUN').gapWords).toBeUndefined();
  });

  it('the median of an even number of gaps is the mean of the two middle ones', () => {
    const r = report([mkDoc('a', [seq(40, { 0: 'ave', 2: 'ave', 6: 'ave', 16: 'ave', 36: 'ave' })])]);
    expect(lemma(r, 'ave|NOUN').gapWords).toEqual({ min: 2, median: 7, max: 20 }); // gaps 2, 4, 10, 20
  });
});

describe('per-form, per-stage, per-document and per-construction figures', () => {
  const docs = () => [
    mkDoc('a1', ['quiero gato gato.', 'quiero tengo.'], { slug: 'work-a', chapter: 1 }),
    mkDoc('a2', ['el gatos perro. por favor.'], { slug: 'work-a', chapter: 2 }),
    mkDoc('b1', ['el gato libro libro.', 'por favor por favor por favor.'], { slug: 'work-b', chapter: 1 }),
  ];

  it('forms: frequency and the lemma(s) of each form', () => {
    const r = report(docs());
    expect(r.forms.find((f) => f.form === 'gato')).toEqual({ form: 'gato', count: 3, lemmas: ['gato|NOUN'] });
    expect(r.forms.find((f) => f.form === 'gatos')?.count).toBe(1);
    expect(r.forms[0].count).toBeGreaterThanOrEqual(r.forms[1].count);
  });

  it('stages: words, sentences, new and cumulative distinct lemmas (never decreasing), by earliest stage', () => {
    const r = report(docs());
    expect(r.stages.map((s) => s.stage)).toEqual(['0', '1']);
    const [s0, s1] = r.stages;
    expect(s0).toMatchObject({ documents: 2, sentences: 3, words: 10 });
    // stage 0 lemmas: quiero(querer) gato tengo(tener) el perro por favor
    expect(s0.distinctLemmas).toBe(7);
    expect(s0.newLemmas).toBe(7);
    expect(s0.cumulativeLemmas).toBe(7);
    // stage 1 adds only "libro"; el, gato, por, favor are old
    expect(s1.distinctLemmas).toBe(5);
    expect(s1.newLemmas).toBe(1);
    expect(s1.cumulativeLemmas).toBe(8);
    expect(lemma(r, 'gato|NOUN').byStage).toEqual({ '0': 3, '1': 1 });
  });

  it('documents: new lemmas, new per 100 words, constructions met for the first time', () => {
    const r = report(docs());
    const [a1, a2, b1] = r.docs;
    expect(a1).toMatchObject({ id: 'a1', words: 5, newLemmas: 3 }); // querer gato tener
    expect(a1.newPer100).toBeCloseTo(60, 5);
    expect(a1.newConstructions).toEqual(['pat:querer', 'pat:tener']);
    expect(a2.newLemmas).toBe(4); // el perro por favor (gatos is gato)
    expect(a2.newConstructions).toEqual([]);
    expect(b1.newLemmas).toBe(1);
  });

  it('constructions and phrase units: occurrences, documents, first occurrence, flags', () => {
    const r = report(docs());
    const q = r.constructions.find((c) => c.key === 'pat:querer')!;
    expect(q).toMatchObject({ occurrences: 2, documents: 1, first: { docId: 'a1', sentence: 0 }, flags: [] });
    expect(r.constructions.find((c) => c.key === 'pat:tener')!.flags).toEqual(['once']);
    const pf = r.phrases.find((p) => p.key === 'por favor')!;
    expect(pf).toMatchObject({ occurrences: 4, documents: 2, flags: [] });
    const single = report([mkDoc('a', ['quiero. quiero. quiero. por favor.'])]);
    expect(single.constructions[0].flags).toEqual(['single-text']);
    expect(single.phrases[0].flags).toEqual(['once']);
  });

  it('a guess or an unread token is not a lemma and appears in the stage figures', () => {
    const r = report([mkDoc('a', ['gato casi zzz'])]);
    expect(r.lemmas.map((l) => l.key)).toEqual(['gato|NOUN']);
    expect(r.stages[0]).toMatchObject({ guesses: 1, unread: 1, distinctLemmas: 1 });
  });
});

describe('renderRecurrenceMarkdown', () => {
  const docs = [
    mkDoc('a1', ['quiero gato gato luna.', 'sol sol.'], { slug: 'work-a' }),
    mkDoc('b1', ['el gato | pipe.'], { slug: 'work-b' }),
  ];
  const md = (opts?: { date?: string }) => renderRecurrenceMarkdown(report(docs), opts).split('\n');

  it('is deterministic and carries no date unless one is passed', () => {
    expect(md()).toEqual(md());
    expect(md().join('\n')).not.toMatch(/20\d\d-\d\d-\d\d/);
    expect(md({ date: '2026-10-01' })).toContain('Date: 2026-10-01');
  });

  it('puts the summary and the lists that need an eye before the full lemma table', () => {
    const lines = md();
    const at = (h: string) => lines.indexOf(h);
    expect(at('## Summary by stage')).toBeGreaterThan(0);
    expect(at('## Summary by stage')).toBeLessThan(at("## Needs a designer's eye"));
    expect(at("## Needs a designer's eye")).toBeLessThan(at('## All lemmas, in order of first occurrence'));
    expect(lines).toContain(`### Lemmas met once (${report(docs).lemmas.filter((l) => l.flags.includes('once')).length})`);
    expect(lines.some((l) => l.startsWith('- luna (NOUN) — a1 s1'))).toBe(true);
    expect(lines.some((l) => l.startsWith('- sol (NOUN) — first a1 s2'))).toBe(true);
    expect(lines.some((l) => l.startsWith('- pat:querer') )).toBe(true); // construction met once
  });

  it('lists the full lemma table by first occurrence, one row per lemma', () => {
    const lines = md();
    const start = lines.indexOf('## All lemmas, in order of first occurrence');
    const rows = lines.slice(start + 4).filter((l) => l.startsWith('| '));
    const names = rows.map((r) => r.split(' | ')[0].replace(/^\| /, ''));
    expect(names.slice(0, 4)).toEqual(['querer (VERB)', 'gato (NOUN)', 'luna (NOUN)', 'sol (NOUN)']);
    expect(rows.find((r) => r.startsWith('| gato (NOUN) | 3 | 2 |'))).toBeDefined();
  });

  it('escapes the pipe of a lemma key in table cells', () => {
    expect(md().some((l) => l.includes('gato\\|NOUN'))).toBe(true);
    expect(md().some((l) => /^\| gato \| 3 \| gato\|NOUN/.test(l))).toBe(false);
  });
});

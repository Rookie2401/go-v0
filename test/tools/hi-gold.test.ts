/**
 * The Hindi gold set's review workflow (scripts/hi-gold-lib.mts): drafts are questions, gold is what a named person
 * accepted, an item changed after acceptance is stale, and a tool or a model can never be the reviewer.
 * The judge is exercised on synthetic items only; nothing here measures the adapter.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DRAFT_FILE, GOLD_FILE, acceptDrafts, hashOf, readItems, soundGold, type GoldItem } from '../../scripts/hi-gold-lib.mts';
import { judge } from '../../scripts/hi-gold-judge.mts';

const draft = (id: string, over: Partial<GoldItem> = {}): GoldItem => ({
  id, category: 'agreement', sentence: 'यह घर है।', english: 'This is a house.', harm: 'synthetic', status: 'draft', draftedBy: 'AI model (unreviewed)', ...over,
});

describe('accepting drafts', () => {
  const drafts = [draft('a-1'), draft('a-2'), draft('b-1', { category: 'ne' })];

  it('needs a named person: no name, a tool and a model are all refused', () => {
    expect(acceptDrafts(drafts, [], { all: true })).toMatchObject({ ok: false });
    for (const by of ['', '  ', 'Claude', 'GPT-5', 'an AI assistant', 'the model', 'script', 'automatic check', 'gold bot']) {
      const r = acceptDrafts(drafts, [], { by, all: true });
      expect(r.ok, by).toBe(false);
    }
    expect(acceptDrafts(drafts, [], { by: 'Anita Sharma', all: true }).ok).toBe(true);
  });

  it('accepts the chosen drafts as they stand, with the reviewer, the date and a hash; the rest stay drafts', () => {
    const r = acceptDrafts(drafts, [], { by: 'Anita Sharma', ids: ['a-2'], date: '2026-10-05' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.accepted).toEqual(['a-2']);
    expect(r.gold).toHaveLength(1);
    expect(r.gold[0]).toMatchObject({ id: 'a-2', status: 'accepted', acceptedBy: 'Anita Sharma', acceptedAt: '2026-10-05' });
    expect(r.gold[0].acceptedHash).toBe(hashOf(r.gold[0]));
    expect(soundGold(r.gold)).toMatchObject({ sound: [{ id: 'a-2' }], stale: [] });
  });

  it('refuses an unknown id, an empty choice and a malformed date', () => {
    expect(acceptDrafts(drafts, [], { by: 'Anita Sharma', ids: ['nope'] })).toMatchObject({ ok: false });
    expect(acceptDrafts(drafts, [], { by: 'Anita Sharma' })).toMatchObject({ ok: false });
    expect(acceptDrafts(drafts, [], { by: 'Anita Sharma', all: true, date: '5 Oct' })).toMatchObject({ ok: false });
  });

  it('an accepted item changed afterwards is stale and not counted; bookkeeping and notes do not make it stale', () => {
    const r = acceptDrafts(drafts, [], { by: 'Anita Sharma', all: true, date: '2026-10-05' });
    if (!r.ok) throw new Error(r.reason);
    const edited = r.gold.map((g) => (g.id === 'a-1' ? { ...g, sentence: 'यह किताब है।' } : g.id === 'a-2' ? { ...g, notes: 'a remark' } : g));
    const { sound, stale } = soundGold(edited);
    expect(stale.map((x) => x.id)).toEqual(['a-1']);
    expect(sound.map((x) => x.id).sort()).toEqual(['a-2', 'b-1']);
    // an item marked accepted with no reviewer (a hand edit) is never sound
    expect(soundGold([{ ...draft('x'), status: 'accepted' }]).sound).toEqual([]);
  });

  it('accepting again replaces the earlier acceptance of the same id and keeps the others', () => {
    const first = acceptDrafts(drafts, [], { by: 'Anita Sharma', ids: ['a-1', 'b-1'], date: '2026-10-05' });
    if (!first.ok) throw new Error(first.reason);
    const corrected = drafts.map((d) => (d.id === 'a-1' ? { ...d, english: 'This is a home.' } : d));
    const second = acceptDrafts(corrected, first.gold, { by: 'Ravi Verma', ids: ['a-1'], date: '2026-10-06' });
    if (!second.ok) throw new Error(second.reason);
    expect(second.gold.map((g) => [g.id, g.acceptedBy])).toEqual([['a-1', 'Ravi Verma'], ['b-1', 'Anita Sharma']]);
    expect(soundGold(second.gold).stale).toEqual([]);
  });
});

describe('the files in the repository', () => {
  it('the drafts are well-formed, all of them drafts by a model; no gold item exists that a person did not accept', () => {
    const drafts = readItems(DRAFT_FILE);
    expect(drafts.problems).toEqual([]);
    for (const d of drafts.items) {
      expect(d.status, d.id).toBe('draft');
      expect(d.acceptedBy, d.id).toBeUndefined();
      expect(d.draftedBy, d.id).toMatch(/unreviewed/);
      expect(d.sentence, d.id).toBe(d.sentence.normalize('NFC'));
      expect(d.sentence, d.id).not.toMatch(/[A-Za-z]{3,}/); // Hindi, not transliteration
    }
    const gold = readItems(GOLD_FILE);
    expect(gold.problems).toEqual([]);
    const { sound, stale } = soundGold(gold.items);
    expect(stale, 'stale gold items').toEqual([]);
    for (const g of sound) expect(g.acceptedBy, g.id).toBeTruthy();
    // until a reviewer has worked, the gold file does not exist or is empty: nothing may be called measured
    if (!fs.existsSync(GOLD_FILE)) expect(gold.items).toEqual([]);
  });
});

describe('the judge (synthetic items)', () => {
  it('passes a statement that holds, fails one that does not, and says what it found', () => {
    const ok = judge(draft('j-1', { sentence: 'यह घर है।', tokens: [{ surface: 'घर', lemma: 'घर', pos: 'NOUN' }], sentences: 1 }));
    expect(ok).toEqual({ verdict: 'pass', failures: [] });
    const bad = judge(draft('j-2', { sentence: 'यह घर है।', tokens: [{ surface: 'घर', lemma: 'मकान' }, { surface: 'किताब', pos: 'NOUN' }], sentences: 2 }));
    expect(bad.verdict).toBe('fail');
    expect(bad.failures.join(' | ')).toMatch(/expected मकान/);
    expect(bad.failures.join(' | ')).toMatch(/not a token/);
    expect(bad.failures.join(' | ')).toMatch(/expected 2/);
  });

  it('a multiword unit that must not be found fails the item when it is found', () => {
    const found = judge(draft('j-3', { sentence: 'किताब मेज़ के ऊपर है।', phrases: [['का', 'ऊपर']] }));
    expect(found.verdict).toBe('pass');
    expect(judge(draft('j-4', { sentence: 'किताब मेज़ के ऊपर है।', notPhrases: [['का', 'ऊपर']] })).verdict).toBe('fail');
  });
});

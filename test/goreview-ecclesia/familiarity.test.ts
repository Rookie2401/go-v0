import { describe, expect, it } from 'vitest';
import { FAMILIARITY_HEURISTIC } from '../../packages/goreview-ecclesia/src/contract';
import type { UnitStanding } from '../../packages/goreview-ecclesia/src/contract';
import { GREEK } from '../../packages/goreview-ecclesia/src/languages';
import { nextBestPassage, passageFamiliarity, rankPassages } from '../../packages/goreview-ecclesia/src/familiarity';
import { frequencyFromPassages, frequencyTable, noFrequency } from '../../packages/goreview-ecclesia/src/frequency';
import { standingOrNew } from '../../packages/goreview-ecclesia/src/profile';
import { JOHN_1_1_18, NT_FREQUENCY, lexemeOf, passage } from './fixtures/greek-john';

/** Standings that say "known" (level familiar) for the given lexemes and nothing for the rest. */
const knowing = (lexemeIds: string[], level: UnitStanding['level'] = 'familiar'): Map<string, UnitStanding> =>
  new Map(lexemeIds.map((id) => [id, { ...standingOrNew(new Map(), id), level, encounters: 3 }]));

const KNOWN_FUNCTION_WORDS = ['ὁ:DET', 'καί:CCONJ', 'ἐν:ADP', 'εἰμί:VERB', 'αὐτός:PRON', 'εἰς:ADP', 'οὐ:ADV', 'διά:ADP', 'ἐκ:ADP', 'οὗτος:PRON', 'ὅς:PRON', 'θεός:NOUN', 'λόγος:NOUN', 'γίνομαι:VERB']
  .map((s) => { const [lemma, pos] = s.split(':') as [string, 'DET']; return lexemeOf(lemma, pos); });

describe('corpus frequency', () => {
  it('ranks by count with competition ranking and deterministic ties', () => {
    const f = frequencyTable('grc', 'test', { a: 5, b: 9, c: 5, d: 1 });
    expect([f.rankOf('b'), f.rankOf('a'), f.rankOf('c'), f.rankOf('d'), f.rankOf('zzz')]).toEqual([1, 2, 2, 4, undefined]);
    expect(f.total).toBe(20);
    expect(f.perMillion('b')).toBe(450000);
    expect(f.countOf('zzz')).toBe(0);
  });
  it('is built from tokenised passages with the profile’s ids', () => {
    const f = frequencyFromPassages(GREEK, [JOHN_1_1_18], 'john-1-prologue');
    expect(f.total).toBe(252);
    expect(f.rankOf(lexemeOf('ὁ', 'DET'))).toBe(1);
    expect(f.countOf(lexemeOf('λόγος', 'NOUN'))).toBe(4);
    expect(() => frequencyFromPassages(GREEK, [{ ...JOHN_1_1_18, language: 'la' }], 'x')).toThrow(/not grc/);
  });
  it('the NT counts from the Biblia index rank the article first and λόγος well inside the top hundred', () => {
    expect(NT_FREQUENCY.rankOf(lexemeOf('ὁ', 'DET'))).toBe(1);
    expect(NT_FREQUENCY.rankOf(lexemeOf('λόγος', 'NOUN'))!).toBeLessThan(100);
    expect(NT_FREQUENCY.countOf(lexemeOf('μονογενής', 'ADJ'))).toBeGreaterThan(0);
  });
});

describe('passage familiarity (provisional heuristic)', () => {
  it('is labelled provisional and counts known tokens by level', () => {
    const f = passageFamiliarity({ profile: GREEK, passage: passage(1, 1), standings: knowing([lexemeOf('ὁ', 'DET'), lexemeOf('καί', 'CCONJ'), lexemeOf('εἰμί', 'VERB')]) });
    expect(f.heuristic).toBe(FAMILIARITY_HEURISTIC);
    expect(f.provisional).toBe(true);
    expect(f.tokens).toBe(17);
    expect(f.knownTokens).toBe(4 + 2 + 3); // ὁ ×4, καί ×2, ἦν ×3
    expect(f.familiarity).toBeCloseTo(9 / 17, 6);
    expect(f.inTargetBand).toBe(false);
    expect(f.distanceFromBand).toBeCloseTo(0.8 - 9 / 17, 6);
    expect(f.reliability).toBeCloseTo(9 / 17, 6);
    expect([...f.unknownLexemes.map((u) => u.lemma)].sort()).toEqual(['θεός', 'λόγος', 'ἐν', 'ἀρχή', 'πρός'].sort());
    expect(f.unknownLexemes.find((u) => u.lemma === 'λόγος')!.occurrences).toBe(3);
    expect(f.notes[0]).toMatch(/provisional/);
    expect(f.notes.some((n) => /no corpus-frequency provider/.test(n))).toBe(true);
  });
  it('orders unknown lexemes by corpus rank when a provider is given, else by occurrences', () => {
    const standings = knowing([lexemeOf('ὁ', 'DET'), lexemeOf('καί', 'CCONJ'), lexemeOf('εἰμί', 'VERB')]);
    const byRank = passageFamiliarity({ profile: GREEK, passage: passage(1, 1), standings, frequency: NT_FREQUENCY });
    expect(byRank.unknownLexemes[0]!.lemma).toBe('ἐν'); // the commonest in the NT of the unknown ones
    expect(byRank.unknownLexemes.every((u) => u.frequencyRank !== undefined)).toBe(true);
    const byOcc = passageFamiliarity({ profile: GREEK, passage: passage(1, 1), standings, frequency: noFrequency('grc') });
    expect(byOcc.unknownLexemes[0]!.occurrences).toBeGreaterThanOrEqual(byOcc.unknownLexemes[1]!.occurrences);
    expect(byOcc.unknownLexemes[0]!.frequencyRank).toBeUndefined();
  });
  it('a level below the policy floor does not count as known; a known FORM counts when formsCount is on', () => {
    const seen = passageFamiliarity({ profile: GREEK, passage: passage(1, 1), standings: knowing([lexemeOf('ὁ', 'DET')], 'recognized') });
    expect(seen.knownTokens).toBe(0);
    const formOnly = new Map<string, UnitStanding>([['form:el:λόγος', { ...standingOrNew(new Map(), 'form:el:λόγος'), level: 'known' }]]);
    expect(passageFamiliarity({ profile: GREEK, passage: passage(1, 1), standings: formOnly }).knownTokens).toBe(3); // λόγος, λόγος, λόγος. (λόγον is another form)
    expect(passageFamiliarity({ profile: GREEK, passage: passage(1, 1), standings: formOnly, policy: { formsCount: false } }).knownTokens).toBe(0);
  });
  it('an empty passage estimates nothing and says so; a bad band is refused', () => {
    const f = passageFamiliarity({ profile: GREEK, passage: { language: 'grc', ref: { book: 'JHN', chapter: 1, verse: 1 }, verses: [] }, standings: new Map() });
    expect(f).toMatchObject({ tokens: 0, familiarity: 0, inTargetBand: false, reliability: 0 });
    expect(f.notes.some((n) => /empty/.test(n))).toBe(true);
    expect(() => passageFamiliarity({ profile: GREEK, passage: passage(1, 1), standings: new Map(), policy: { targetLow: 0.9, targetHigh: 0.8 } })).toThrow(/band/);
    expect(() => passageFamiliarity({ profile: GREEK, passage: { ...passage(1, 1), language: 'he' }, standings: new Map() })).toThrow(/profile is grc/);
  });
  it('ranks passages: in band first, then nearest, deterministic; nextBestPassage is the first', () => {
    const standings = knowing(KNOWN_FUNCTION_WORDS);
    const candidates = [passage(1, 2), passage(3, 5), passage(6, 8), passage(9, 13), passage(14, 18)];
    const ranked = rankPassages(candidates.map((p) => passageFamiliarity({ profile: GREEK, passage: p, standings, frequency: NT_FREQUENCY })));
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < ranked.length; i++) {
      const a = ranked[i - 1]!.familiarity, b = ranked[i]!.familiarity;
      expect(Number(b.inTargetBand) <= Number(a.inTargetBand)).toBe(true);
      if (a.inTargetBand === b.inTargetBand) expect(a.distanceFromBand).toBeLessThanOrEqual(b.distanceFromBand);
    }
    expect(ranked[0]!.reasons.join(' ')).toMatch(/band/);
    const best = nextBestPassage({ profile: GREEK, passages: candidates, standings, frequency: NT_FREQUENCY })!;
    expect(best.familiarity.ref).toEqual(ranked[0]!.familiarity.ref);
    // the same input twice: the same order
    expect(rankPassages(candidates.map((p) => passageFamiliarity({ profile: GREEK, passage: p, standings, frequency: NT_FREQUENCY }))).map((r) => r.familiarity.ref)).toEqual(ranked.map((r) => r.familiarity.ref));
    expect(nextBestPassage({ profile: GREEK, passages: [], standings })).toBeUndefined();
  });
  it('John 1:1–2 with the function words and θεός/λόγος known sits in the 80–90 % band', () => {
    const f = passageFamiliarity({ profile: GREEK, passage: passage(1, 2), standings: knowing(KNOWN_FUNCTION_WORDS) });
    expect(f.tokens).toBe(24);
    expect(f.familiarity).toBeGreaterThanOrEqual(0.8);
    expect(f.familiarity).toBeLessThanOrEqual(0.9);
    expect(f.inTargetBand).toBe(true);
    expect(f.unknownLexemes.map((u) => u.lemma).sort()).toEqual(['πρός', 'ἀρχή'].sort());
  });
});

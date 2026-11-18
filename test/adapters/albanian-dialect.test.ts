/**
 * Albanian dialect: a sentence is told apart as Gheg or Standard on its own forms; a sentence that shows nothing is not assigned.
 * The sentences are ordinary constructed examples (machine-drafted, like the adapter's rules; no speaker has checked either).
 */
import { describe, expect, it } from 'vitest';
import { sqAdapter } from '../../src/adapters/sq';
import { DIALECT_RULES, sentenceDialect, stampSqDialect } from '../../src/adapters/albanian/dialect';
import { ghegListing } from '../../src/adapters/albanian/gheg';
import { SQ_ANALYZER } from '../../src/adapters/albanian/version';
import { canonicalVarietyId } from '../../packages/repository-contract/src';

function read(sentence: string) {
  const tokens = sqAdapter.tokenize(sentence);
  const analysed = sqAdapter.analyze(tokens);
  const candidates = analysed.map((a) => a.candidates);
  return { tokens, analysed, candidates, decision: sentenceDialect(tokens, candidates) };
}
const notesOf = (sentence: string) => {
  const { analysed } = read(sentence);
  return analysed.filter((a) => a.token.isWord && a.candidates.length).map((a) => a.candidates[0]!.notes ?? {});
};

describe('Albanian: the dialect of a sentence', () => {
  it('reads a sentence with Gheg forms as Gheg, on the text', () => {
    for (const s of ['Ai asht nji djalë i mirë.', 'Kjo âsht shpia e tij.', 'Ai asht tue punue.', 'Nâna asht në shpi.']) {
      const d = read(s).decision;
      expect(d, s).toMatchObject({ dialect: 'aln', evidence: 'text' });
      expect(d.ghegPoints).toBeGreaterThanOrEqual(DIALECT_RULES.threshold);
      expect(d.basis).toMatch(/Gheg forms/);
    }
    const d = read('Ai asht nji djalë i mirë.').decision;
    expect(d.ghegForms).toEqual(['asht', 'nji']);
    expect(d.standardForms).toEqual([]);
  });

  it('reads a sentence with forms only the Standard writes, and no Gheg form, as Standard on the text', () => {
    for (const s of ['Ai është një djalë i mirë.', 'Unë jam duke punuar në shtëpi.', 'Ajo është duke lexuar.']) {
      const d = read(s).decision;
      expect(d, s).toMatchObject({ dialect: 'sq', evidence: 'text', ghegPoints: 0 });
      expect(d.standardPoints).toBeGreaterThanOrEqual(DIALECT_RULES.standardThreshold);
    }
    expect(read('Ai është një djalë i mirë.').decision.standardForms).toEqual(['është', 'një']);
  });

  it('does not assign a sentence whose words are written alike in both: Standard by default, and it says so', () => {
    for (const s of ['Kam ujë.', 'Djali ka libra.', 'Ne shkojmë në shkollë.']) {
      const d = read(s).decision;
      expect(d, s).toMatchObject({ dialect: 'sq', evidence: 'default', ghegPoints: 0 });
      expect(d.basis).toMatch(/by default/);
    }
  });

  it('one leaning form is not enough: tash or çka alone settle nothing', () => {
    expect(ghegListing('tash')).toBe('weak');
    expect(ghegListing('çka')).toBe('weak');
    expect(ghegListing('asht')).toBe('strong');
    expect(ghegListing('libër')).toBeUndefined();
    const d = read('Tash kam ujë.').decision;
    expect(d).toMatchObject({ dialect: 'sq', evidence: 'default', ghegPoints: 1 });
    expect(d.basis).toMatch(/not enough/);
  });

  it('the Standard needs more than Gheg does, and no Gheg form at all: forms Gheg speakers use too settle nothing', () => {
    // një and duke are heard in Gheg speech beside ni and tu; "tani" is everywhere in it and counts for nothing
    for (const s of ['Kam një libër.', 'Jam duke punuar.', 'Ajo është në shkollë tani.', 'Një djalë dhe një vajzë.']) {
      const d = read(s).decision;
      expect(d, s).toMatchObject({ dialect: 'sq', evidence: 'default', ghegPoints: 0 });
      expect(d.standardPoints).toBeLessThan(DIALECT_RULES.standardThreshold);
    }
    expect(read('Kam një libër.').decision.basis).toMatch(/lean Standard/);
    // a repeated form counts once
    expect(read('Një djalë dhe një vajzë.').decision.standardPoints).toBe(1);
  });

  it('a Gheg sentence with a Standard word in it is still Gheg; one with as many Standard forms as Gheg ones is not settled', () => {
    expect(read('Ai asht një djalë.').decision).toMatchObject({ dialect: 'aln', evidence: 'text', ghegPoints: 2, standardPoints: 1 });
    const d = read('Ai asht këtu, por ajo është duke punuar në shtëpi.').decision;
    expect(d).toMatchObject({ dialect: 'sq', evidence: 'default' });
    expect(d.ghegPoints).toBe(2);
    expect(d.standardPoints).toBeGreaterThanOrEqual(d.ghegPoints);
    expect(d.basis).toMatch(/mixes/);
  });

  it('everyday spoken Gheg is recognised by its own words and its participles cut short', () => {
    for (const s of ['Une kom ni libër.', 'Aj osht ktu.', 'Ka shku në shpi.', 'Du me punu nesër.']) {
      expect(read(s).decision, s).toMatchObject({ dialect: 'aln', evidence: 'text' });
    }
    expect(read('Une kom ni libër.').decision.ghegForms).toEqual(['kom', 'ni']);
    expect(read('Du me punu nesër.').decision.ghegForms).toEqual(['punu', 'me punu']);
    // "punu" is Gheg because the list knows "punuar"; an unknown word ending in -u is not
    expect(read('Kam blorgu.').decision.ghegPoints).toBe(0);
  });

  it('the Gheg infinitive, me + participle, counts for Gheg; "me" before a noun does not', () => {
    const inf = read('Kam me punue nesër.').decision;
    expect(inf).toMatchObject({ dialect: 'aln', evidence: 'text' });
    expect(inf.ghegForms).toEqual(['punue', 'me punue']);
    const withNoun = read('Ai vjen me djalin.').decision;
    expect(withNoun.ghegPoints).toBe(0);
  });

  it('the Standard non-active aorist after "u" is not taken for a Gheg participle (u thye)', () => {
    const d = read('Dritarja u thye nga era.').decision;
    expect(d.ghegPoints).toBe(0);
    expect(d.dialect).toBe('sq');
  });

  it('a nasal vowel is a Gheg form by itself, even on a word the list does not know', () => {
    const d = read('Zâni i tij asht i bukur.').decision;
    expect(d).toMatchObject({ dialect: 'aln', evidence: 'text' });
    expect(d.ghegForms).toContain('zâni');
  });

  it('is decided per sentence: the same word is stamped by the sentence it stands in', () => {
    const gheg = notesOf('Djali asht nji nxënës.');
    const standard = notesOf('Djali është një nxënës.');
    expect(gheg[0]).toMatchObject({ period: 'aln', periodEvidence: 'text' });
    expect(standard[0]).toMatchObject({ period: 'sq', periodEvidence: 'text' });
    for (const n of gheg) expect(n.period).toBe('aln');
    for (const n of standard) expect(n.period).toBe('sq');
    expect(String(gheg[0]!.periodBasis)).toMatch(/asht/);
  });
});

describe('Albanian: the stamp every reading carries', () => {
  it('writes notes.period, periodBasis and periodEvidence on every reading of every word, and changes nothing else', () => {
    const { tokens, candidates } = read('Ai asht nji djalë i mirë.');
    for (let i = 0; i < tokens.length; i++) {
      if (!tokens[i]!.isWord) { expect(candidates[i]).toEqual([]); continue; }
      for (const c of candidates[i]!) expect(c.notes).toMatchObject({ period: 'aln', periodEvidence: 'text' });
    }
    const bare = candidates.map((cs) => cs.map((c) => { const { period: _p, periodBasis: _b, periodEvidence: _e, ...notes } = c.notes ?? {}; return { ...c, notes }; }));
    const again = stampSqDialect(tokens, bare);
    expect(again).toEqual(candidates); // stamping is a pure function of the readings
    expect(bare[0]![0]!.notes).not.toHaveProperty('period'); // and the input was not written to
  });

  it('refine stamps as analyze does', () => {
    const tokens = sqAdapter.tokenize('Ai asht nji djalë.');
    const analysed = sqAdapter.analyze(tokens);
    const refined = sqAdapter.refine!(tokens, analysed, new Set([SQ_ANALYZER]));
    for (const a of refined) if (a.token.isWord) expect(a.candidates[0]?.notes).toMatchObject({ period: 'aln', periodEvidence: 'text' });
  });

  it('the codes are ones the variety registry knows as Albanian learning varieties', () => {
    expect(canonicalVarietyId('sq', 'aln')).toBe('sq-gheg');
    expect(canonicalVarietyId('sq', 'sq')).toBe('sq-standard');
    expect(sqAdapter.varieties?.aln?.label).toBe('Gheg');
    expect(sqAdapter.varieties?.sq?.label).toBe('Standard Albanian');
  });

  it('a Gheg form keeps its own reading through the Standard equivalent', () => {
    const { analysed } = read('Ai asht nji djalë.');
    const asht = analysed.find((a) => a.token.normalized === 'asht')!.candidates[0]!;
    expect(asht.varieties).toContain('aln');
    expect(asht.orthography?.modern).toBe('është');
    expect(asht.lemma).toBe('jam');
  });
});

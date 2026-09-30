import { describe, expect, it } from 'vitest';
import { E, Lexicon, matchPhraseRules, morph, splitSentences, makeWordTokenizer, speechNormalizeGeneric } from '../../src/adapters';
import { run } from './helpers';

describe('morph tags', () => {
  it('expands shorthand and unions repeated keys', () => {
    expect(morph('1s pres')).toEqual({ Person: '1', Number: 'Sing', Tense: 'Pres', Mood: 'Ind' });
    expect(morph('nom acc')).toEqual({ Case: 'Acc,Nom' });
    expect(morph('Case=Erg m')).toEqual({ Case: 'Erg', Gender: 'Masc' });
    expect(() => morph('bogus')).toThrow();
  });
});

describe('Lexicon', () => {
  const lex = new Lexicon([
    E('a', 'NOUN', 'first', ['x:m sg']),
    E('b', 'VERB', 'second', ['x:3s pres', 'y:3s pres']),
  ], (s) => s.toLowerCase());

  it('ambiguous surfaces lower confidence and keep lexicon order', () => {
    const c = lex.toCandidates(lex.lookup('x'));
    expect(c.map((k) => k.lemma)).toEqual(['a', 'b']);
    expect(c.every((k) => k.confidence <= 0.6)).toBe(true);
  });

  it('unique surfaces are confident', () => {
    const c = lex.toCandidates(lex.lookup('y'));
    expect(c).toHaveLength(1);
    expect(c[0].confidence).toBeGreaterThan(0.9);
  });

  it('unknown surfaces produce no candidates', () => {
    expect(lex.toCandidates(lex.lookup('zzz'))).toEqual([]);
  });
});

describe('splitSentences', () => {
  it('does not split after abbreviations, single letters or before lower case', () => {
    const cfg = { terminators: '.!?', abbreviations: ['dr'] };
    const t = 'Dr. Smith came. He left! Why? x. y and z.';
    expect(splitSentences(t, cfg).map((s) => s.text)).toEqual(['Dr. Smith came.', 'He left!', 'Why?', 'x. y and z.']);
  });
  it('splits on newlines', () => {
    expect(splitSentences('one\ntwo', { terminators: '.' }).map((s) => s.text)).toEqual(['one', 'two']);
  });
});

describe('makeWordTokenizer', () => {
  it('re-joins listed compounds and keeps exact offsets', () => {
    const tok = makeWordTokenizer({ locale: 'th', normalize: (s) => s, compounds: ['นิรันดร์'] });
    const text = 'ชีวิตนิรันดร์';
    const t = tok(text);
    expect(t.map((x) => x.surface)).toContain('นิรันดร์');
    t.forEach((x) => expect(text.slice(x.start, x.end)).toBe(x.surface));
  });
});

describe('matchPhraseRules', () => {
  const norm = (s: string) => s.toLowerCase();
  const tokens = (ws: string[]) => {
    let at = 0;
    return ws.map((w) => { const start = at; at += w.length + 1; return { surface: w, start, end: start + w.length, isWord: true, normalized: w }; });
  };
  const an = (toks: ReturnType<typeof tokens>) => toks.map((t) => ({ token: t, candidates: [], analyzer: 't' }));

  it('matches with a bounded gap, lowers confidence per skipped token, rejects too wide a gap', () => {
    const rule = { pattern: ['a', 'c'], display: 'a c', gloss: '', kind: 'collocation' as const, variants: [['a', { gap: 2 }, 'c']] };
    const t1 = tokens(['a', 'c']);
    const t2 = tokens(['a', 'x', 'c']);
    const t3 = tokens(['a', 'x', 'y', 'z', 'c']);
    const m1 = matchPhraseRules(t1, an(t1), [rule], norm);
    const m2 = matchPhraseRules(t2, an(t2), [rule], norm);
    expect(m1).toHaveLength(1);
    expect(m2).toHaveLength(1);
    expect(m2[0].confidence).toBeLessThan(m1[0].confidence);
    expect(matchPhraseRules(t3, an(t3), [rule], norm)).toHaveLength(0);
    expect(m2[0].tokenIndexes).toEqual([0, 2]);
  });

  it('slots capture a word, variants share one pattern', () => {
    const rule = { pattern: ['x', '_'], display: '', gloss: '', kind: 'frame' as const, variants: [['x', { slot: true as const }], [{ slot: true as const }, 'x']] };
    const t = tokens(['p', 'x']);
    const m = matchPhraseRules(t, an(t), [rule], norm);
    expect(m).toHaveLength(1);
    expect(m[0].pattern).toEqual(['x', '_']);
  });
});

describe('speechNormalizeGeneric', () => {
  it('is deterministic and records only steps that changed something', () => {
    const cfg = { tool: 'speech-x@1', numberToWords: (n: number) => (n === 3 ? 'three' : null) };
    const a = speechNormalizeGeneric('See [16] 3 and 99.', cfg);
    const b = speechNormalizeGeneric('See [16] 3 and 99.', cfg);
    expect(a).toEqual(b);
    expect(a.speechText).toBe('See three and 99.');
    const all = a.transformations.map((r) => r.description).join('|');
    expect(all).toMatch(/verse markers: \[16\]/);
    expect(all).toMatch(/left unexpanded.*99/);
    expect(speechNormalizeGeneric('plain', cfg).transformations).toEqual([]);
  });
});

describe('run helper sanity', () => {
  it('tokenizes Spanish', () => {
    expect(run('es', 'Hola, Ana.').tokens.map((t) => t.surface)).toEqual(['Hola', ',', 'Ana', '.']);
  });
});

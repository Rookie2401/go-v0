import { describe, expect, it } from 'vitest';
import { sqAdapter } from '../../src/adapters/sq';
import { parseSelection } from '../../packages/golearn-extension/src/parser';

function analyze(text: string) {
  const tokens = sqAdapter.tokenize(text);
  return { tokens, analyses: sqAdapter.analyze(tokens) };
}

function card(text: string, surface: string) {
  const start = text.indexOf(surface);
  if (start < 0) throw new Error(`selection ${surface} is not in ${text}`);
  return parseSelection({
    surface, languageId: 'sq',
    context: { kind: 'sentence', confidence: 0.9, sentence: text, selStart: start, selEnd: start + surface.length },
  });
}

describe('attested Gheg participles used with the linking article', () => {
  it('reads Migjeni’s title as two articulated participles while keeping the written tokens', () => {
    const { tokens, analyses } = analyze('Sokrat i vuejtun apo derr i kënaqun');
    expect(tokens.map((t) => t.surface)).toEqual(['Sokrat', 'i', 'vuejtun', 'apo', 'derr', 'i', 'kënaqun']);

    for (const [article, word, standard] of [[1, 2, 'vuajtur'], [5, 6, 'kënaqur']] as const) {
      const articleReadings = analyses[article].candidates;
      expect(articleReadings[0]?.lemma).toBe(`i ${standard}`);
      expect(articleReadings[0]?.unit?.pieces).toEqual([article, word]);

      const adjective = analyses[word].candidates[0];
      expect(adjective?.pos).toBe('ADJ');
      expect(adjective?.lemma).toBe(`i ${standard}`);
      expect(adjective?.notes?.articulated).toBe('yes');
      expect(adjective?.varieties).toContain('aln');
      expect(adjective?.orthography?.modern).toBe(standard);
    }
  });

  it('does not turn arbitrary -un forms into Standard participles', () => {
    const { analyses } = analyze('Sokrat i kuptun apo derr i dritun');
    expect(analyses[2].candidates.some((c) => c.orthography?.modern)).toBe(false);
    expect(analyses[6].candidates.some((c) => c.orthography?.modern)).toBe(false);
  });

  it('keeps the standalone participle reading when no linking article is present', () => {
    const { analyses } = analyze('Vuejtun kënaqun');
    expect(analyses[0].candidates.some((c) => c.pos === 'VERB' && c.morph.VerbForm === 'Part')).toBe(true);
    expect(analyses[1].candidates.some((c) => c.pos === 'VERB' && c.morph.VerbForm === 'Part')).toBe(true);
  });

  it.each(['djali e vuejtun', 'djali e kënaqun', 'djemtë i vuejtun', 'djemtë i kënaqun'])(
    'does not build an agreeing adjective unit for mismatched article/head features in %s',
    (text) => {
      const { tokens, analyses } = analyze(text);
      const articleIndex = tokens.findIndex((t) => ['i', 'e', 'të', 'së'].includes(t.surface));
      const adjectiveIndex = articleIndex + 1;
      expect(analyses[articleIndex].candidates[0]?.notes?.context).toContain('left as a separate linking article');
      expect(analyses[articleIndex].candidates.some((c) => c.unit !== undefined)).toBe(false);
      expect(analyses[adjectiveIndex].candidates.some((c) => c.unit !== undefined)).toBe(false);
    },
  );

  it('returns a selected-word card for the articulated Gheg form', () => {
    const c = card('Sokrat i vuejtun apo derr i kënaqun', 'vuejtun');
    expect(c).toMatchObject({ lemma: 'i vuajtur', pos: 'ADJ', gloss: 'suffering', provenance: 'lexicon' });
    expect(c.notes.join(' ')).toContain('Spelling differs from today\'s standard (vuajtur).');
    expect(c.notes.join(' ')).toContain('Variety: aln.');
    expect(Object.fromEntries(c.features.map((f) => [f.key, f.value]))).toMatchObject({ Gender: 'Masc', Number: 'Sing' });

    const articleCard = card('Sokrat i vuejtun apo derr i kënaqun', 'i');
    expect(articleCard).toMatchObject({ lemma: 'i vuajtur', pos: 'ADJ' });
    expect(articleCard.syntaxNotes.join(' ')).toContain('Part of the unit');
  });

  it.each([
    ['djali i vuajtur', 'i', 'vuajtur', 'Masc', 'Sing', 'Nom'],
    ['vajza e kënaqur', 'e', 'kënaqur', 'Fem', 'Sing', 'Nom'],
    ['djalin e vuajtur', 'e', 'vuajtur', 'Masc', 'Sing', 'Acc'],
    ['vajzës së kënaqur', 'së', 'kënaqur', 'Fem', 'Sing', 'Gen,Dat,Abl'],
    ['djemtë e vuajtur', 'e', 'vuajtur', 'Masc', 'Plur', 'Nom,Acc'],
    ['vajzat e kënaqura', 'e', 'kënaqura', 'Fem', 'Plur', 'Nom,Acc'],
  ])('preserves gender, number, and case in %s', (text, article, adjective, gender, number, grammaticalCase) => {
    const { tokens, analyses } = analyze(text);
    const articleIndex = tokens.findIndex((t) => t.surface === article);
    const adjectiveIndex = tokens.findIndex((t) => t.surface === adjective);
    const a = analyses[articleIndex].candidates[0];
    const adj = analyses[adjectiveIndex].candidates[0];
    expect(a?.lemma).toBe(`i ${adjective.replace(/a$/, '')}`);
    expect(a?.morph.Gender).toBe(gender);
    expect(a?.morph.Number).toBe(number);
    expect(a?.morph.Case).toBe(grammaticalCase);
    expect(adj?.pos).toBe('ADJ');
    expect(adj?.morph.Gender).toBe(gender);
    expect(adj?.morph.Number).toBe(number);
  });
});

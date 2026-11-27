/**
 * Confident misreadings found by the deck audit (entre as a verb, parfait as a participle, "parce" as a conjunction of its own),
 * through the real adapter. Machine-drafted, not native-reviewed.
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisCandidate } from '../../src/core';
import { frAdapter } from '../../src/adapters/fr';

function readings(sentence: string, target: string): AnalysisCandidate[] {
  const tokens = frAdapter.tokenize(sentence);
  const analyses = frAdapter.analyze(tokens);
  const i = tokens.findIndex((t) => t.isWord && t.normalized === target);
  expect(i).toBeGreaterThanOrEqual(0);
  return analyses[i].candidates;
}
/** The first reading, and whether it stands alone (no other reading within 0.15 of it). */
function lead(sentence: string, target: string) {
  const c = readings(sentence, target);
  return { pos: c[0].pos, lemma: c[0].lemma, clear: c.slice(1).every((o) => c[0].confidence - o.confidence > 0.15) };
}

describe('entre between a noun and a noun phrase is the preposition', () => {
  it.each([
    'La route entre les deux villages reste fermée.',
    'Un accord entre Paris et Lyon est signé.',
    'La distance entre deux points est courte.',
  ])('%s', (s) => {
    expect(lead(s, 'entre')).toEqual({ pos: 'ADP', lemma: 'entre', clear: true });
  });
  it('the verb stays where the sentence shows a verb', () => {
    expect(lead('Le train entre en gare.', 'entre').pos).toBe('VERB');
    expect(lead('Elle entre dans la maison.', 'entre').pos).toBe('VERB');
  });
});

describe('parfait after être is the adjective, after avoir the participle', () => {
  it.each([
    'À huit heures, ce serait parfait.',
    'Le résultat est parfait.',
    'Ce plan est parfait pour nous.',
  ])('%s', (s) => {
    expect(lead(s, 'parfait')).toEqual({ pos: 'ADJ', lemma: 'parfait', clear: true });
  });
  it('after avoir, with an object, it is the verb parfaire', () => {
    expect(lead('Il a parfait son travail.', 'parfait').lemma).toBe('parfaire');
  });
});

describe('"parce" in parce que is a fragment, not a confirmed conjunction', () => {
  it.each([
    'Il reste ici parce que la pluie tombe.',
    "Elle sourit parce qu'il chante.",
    'Nous partons parce que nous sommes fatigués.',
  ])('%s', (s) => {
    const c = readings(s, 'parce');
    expect(c.every((x) => x.unconfirmed === true && x.confidence <= 0.6)).toBe(true);
  });
  it('the phrase unit is still found', () => {
    const tokens = frAdapter.tokenize('Il reste ici parce que la pluie tombe.');
    const phrases = frAdapter.detectPhrases?.(tokens, frAdapter.analyze(tokens)) ?? [];
    expect(JSON.stringify(phrases)).toContain('parce');
  });
  it('a word that is not before que is left alone', () => {
    expect(readings('Pourquoi tandis lundi ?', 'tandis').some((x) => x.unconfirmed === true)).toBe(false);
  });
});

/**
 * French constructions (src/adapters/french/constructions.ts + construction-texts.ts), through the real adapter.
 * Every construction id of docs/french/PLAN.md: one sentence where it is reported on the named word, and a near miss where it
 * is not reported at all. The sentences are this file's own, not the fixtures'. Then: one text per id, every id has a text,
 * and a 2,000-word text is analysed with its patterns in well under 1.5 s. Machine-drafted, not native-reviewed.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { frAdapter } from '../../src/adapters/fr';
import { FRENCH_CONSTRUCTION_TEXTS } from '../../src/adapters/french/construction-texts';
import { FRENCH_CONSTRUCTIONS } from '../../src/adapters/french/constructions';
import type { PatternCandidate } from '../../src/core';

function patterns(sentence: string): { words: string[]; found: PatternCandidate[]; index: (w: string) => number } {
  const tokens = frAdapter.tokenize(sentence);
  const found = frAdapter.detectPatterns!(tokens, frAdapter.analyze(tokens));
  return { words: tokens.map((t) => t.normalized), found, index: (w) => tokens.findIndex((t) => t.isWord && t.normalized === frAdapter.normalize(w)) };
}

/** [id, a sentence that has it, a word the pattern must cover, a near miss that must not have it]. */
const CASES: ReadonlyArray<[string, string, string, string]> = [
  ['passe-compose', 'Nous avons mangé une tarte.', 'mangé', 'Nous avons une tarte.'],
  ['plus-que-parfait', 'Tu avais oublié ta clé.', 'avais', 'Tu avais ta clé.'],
  ['futur-anterieur', 'Ils auront terminé demain.', 'terminé', 'Ils auront du temps demain.'],
  ['conditionnel-passe', 'Nous aurions aimé venir.', 'aurions', 'Nous aimerions venir.'],
  ['subjonctif-passe', 'Bien qu\'il ait travaillé, il échoue.', 'ait', 'Bien qu\'il travaille, il échoue.'],
  ['passe-anterieur', 'Lorsqu\'elle eut mangé, elle partit.', 'eut', 'Lorsqu\'elle eut faim, elle partit.'],
  ['passe-simple', 'Le roi parla longtemps.', 'parla', 'Le roi parle longtemps.'],
  ['imparfait', 'Nous chantions souvent.', 'chantions', 'Nous chantons souvent.'],
  ['futur-simple', 'Vous parlerez demain.', 'parlerez', 'Vous parlez demain.'],
  ['futur-proche', 'Elle va chanter ce soir.', 'chanter', 'Elle va au cinéma ce soir.'],
  ['passe-recent', 'Je viens de terminer.', 'terminer', 'Je viens de Lyon.'],
  ['etre-en-train-de', 'Il est en train de lire.', 'train', 'Il est dans le train.'],
  ['passive-voice', 'Le gâteau est mangé par les enfants.', 'mangé', 'Le garçon est arrivé.'],
  ['pronominal-verb', 'Je me lave.', 'me', 'Je te lave.'],
  ['participle-agreement-etre', 'Elles sont venues.', 'venues', 'Il est venu.'],
  ['participle-agreement-preceding-object', 'Ces robes, je les ai achetées.', 'achetées', 'J\'ai acheté ces robes.'],
  ['participle-no-agreement', 'Elles ont acheté des robes.', 'acheté', 'Il a acheté des robes.'],
  ['negation', 'Il ne parle jamais.', 'jamais', 'Il parle toujours.'],
  ['negation-ne-que', 'Elle ne lit que des romans.', 'que', 'Elle ne lit pas de romans.'],
  ['negation-ne-dropped', 'Je veux pas.', 'pas', 'Je ne veux pas.'],
  ['object-pronouns', 'Tu la regardes.', 'la', 'Tu regardes la mer.'],
  ['double-object-pronouns', 'Elle nous les montre.', 'les', 'Elle nous montre.'],
  ['pronoun-y', 'Nous y allons.', 'y', 'Nous allons là-bas.'],
  ['pronoun-en', 'Tu en veux ?', 'en', 'Tu viens en voiture ?'],
  ['imperative-pronouns', 'Prends-les !', 'les', 'Prends les clés !'],
  ['inversion-question', 'Viens-tu demain ?', 'tu', 'Tu viens demain ?'],
  ['est-ce-que', 'Est-ce que tu dors ?', 'que', 'Tu dors ?'],
  ['relative-qui', 'Le chien qui aboie est petit.', 'qui', 'Qui aboie ?'],
  ['relative-que', 'La pomme que tu manges est rouge.', 'que', 'Je pense que tu manges.'],
  ['relative-dont', 'La femme dont je rêve est loin.', 'dont', 'Je rêve de la femme.'],
  ['relative-ou', 'La maison où nous habitons est vieille.', 'où', 'Où habites-tu ?'],
  ['relative-lequel', 'L\'ami avec lequel je voyage est parti.', 'lequel', 'Lequel veux-tu ?'],
  ['partitive-article', 'Elle boit du café.', 'du', 'Elle sort du café.'],
  ['contraction-article', 'Il parle au voisin.', 'au', 'Il parle à la voisine.'],
  ['elision', 'L\'enfant dort.', 'enfant', 'Le héros dort.'],
  ['il-y-a', 'Il y a un chat.', 'y', 'Il a un chat.'],
  ['subjunctive-after-que', 'Je veux que tu partes.', 'partes', 'Je sais que tu pars.'],
  ['literary-subjunctive-imperfect', 'Il fallait qu\'elle partît.', 'partît', 'Il fallait qu\'elle parte.'],
  ['adjective-position', 'C\'est un ancien élève.', 'ancien', 'C\'est un élève sérieux.'],
  ['gerondif', 'Il mange en lisant.', 'lisant', 'Il vit en France.'],
  ['comparative', 'Paul est plus grand que Marc.', 'plus', 'Paul est le plus grand.'],
  ['superlative', 'C\'est la plus belle maison.', 'plus', 'Cette maison est plus belle.'],
  ['c-est', 'C\'est mon livre.', 'c\'', 'Ce livre est à moi.'],
];

/** The construction ids of docs/french/PLAN.md, read from the contract itself. */
function planIds(): string[] {
  const plan = readFileSync(fileURLToPath(new URL('../../docs/french/PLAN.md', import.meta.url)), 'utf8');
  const block = plan.slice(plan.indexOf('Construction ids:'), plan.indexOf('ONE explanation per id'));
  return [...block.matchAll(/`([a-z-]+)`/gu)].map((m) => m[1]);
}

describe('French constructions: each id, with a near miss', () => {
  for (const [id, sentence, word, nearMiss] of CASES) {
    it(`${id}: "${sentence}" has it on "${word}"; "${nearMiss}" does not`, () => {
      const yes = patterns(sentence);
      const at = yes.index(word);
      expect(at, `${word} in ${sentence}`).toBeGreaterThanOrEqual(0);
      const hits = yes.found.filter((p) => p.key === id);
      expect(hits.map((p) => p.tokenIndexes), `${id} in ${sentence}: ${yes.found.map((p) => p.key).join(', ')}`).not.toEqual([]);
      expect(hits.some((p) => p.tokenIndexes.includes(at)), `${id} covers ${word}`).toBe(true);
      for (const p of hits) {
        expect(p.confidence).toBeGreaterThan(0);
        expect(p.confidence).toBeLessThanOrEqual(0.95);
      }
      const no = patterns(nearMiss);
      expect(no.found.filter((p) => p.key === id).map((p) => p.tokenIndexes.map((k) => no.words[k]).join(' ')), `${id} in the near miss ${nearMiss}`).toEqual([]);
    });
  }

  it('reports être + participle of a verb of motion as the compound tense, with a lower confidence when avoir is possible too', () => {
    const { found } = patterns('Il est descendu vite.');
    const pc = found.find((p) => p.key === 'passe-compose');
    expect(pc).toBeDefined();
    expect(pc!.confidence).toBeLessThan(0.8);
    expect(found.some((p) => p.key === 'passive-voice')).toBe(false);
  });

  it('does not take plus meaning "more" for a dropped ne, nor "pas mal" for a negation', () => {
    expect(patterns('Il travaille plus.').found.some((p) => p.key === 'negation-ne-dropped')).toBe(false);
    expect(patterns('C\'est pas mal du tout.').found.some((p) => p.key === 'negation-ne-dropped')).toBe(false);
  });
});

describe('French constructions: the texts', () => {
  it('has a label and one explanation for every id of docs/french/PLAN.md, and no other', () => {
    const ids = planIds();
    expect(ids.length).toBe(43);
    expect([...FRENCH_CONSTRUCTIONS].sort()).toEqual([...ids].sort());
    for (const id of ids) {
      const t = FRENCH_CONSTRUCTION_TEXTS[id];
      expect(t, id).toBeDefined();
      expect(t.label.length, id).toBeGreaterThan(3);
      // (a question mark inside a French example, viens-tu ?, does not end an English sentence)
      const sentences = t.explain.trim().split(/(?<=\.)\s+/u).length;
      expect(sentences, `${id}: ${t.explain}`).toBeGreaterThanOrEqual(2);
      expect(sentences, `${id}: ${t.explain}`).toBeLessThanOrEqual(4);
    }
  });

  it('every id of the contract is exercised by this file', () => {
    expect(new Set(CASES.map((c) => c[0]))).toEqual(new Set(planIds()));
  });

  it('gives the same explanation for one id in two different sentences (one text per id, never per sentence)', () => {
    const pairs: Array<[string, string, string]> = [
      ['passe-compose', 'Nous avons mangé une tarte.', 'Elle a lu le journal.'],
      ['negation', 'Il ne parle jamais.', 'Je ne vois rien.'],
      ['relative-que', 'La pomme que tu manges est rouge.', 'Le film que nous voyons est long.'],
      ['object-pronouns', 'Tu la regardes.', 'Il me voit.'],
    ];
    for (const [id, a, b] of pairs) {
      const pa = patterns(a).found.find((p) => p.key === id);
      const pb = patterns(b).found.find((p) => p.key === id);
      expect(pa && pb, id).toBeTruthy();
      expect(pa!.explanation).toBe(pb!.explanation);
      expect(pa!.title).toBe(pb!.title);
      expect(pa!.explanation).toBe(FRENCH_CONSTRUCTION_TEXTS[id].explain);
    }
  });
});

describe('French constructions: speed', () => {
  it('analyses a 2,000-word text with its patterns in well under 1.5 s', () => {
    const sentences = CASES.flatMap((c) => [c[1], c[3]]);
    const parts: string[] = [];
    let words = 0;
    for (let k = 0; words < 2000; k++) {
      const s = sentences[k % sentences.length];
      parts.push(s);
      words += frAdapter.tokenize(s).filter((t) => t.isWord).length;
    }
    const text = parts.join(' ');
    frAdapter.analyze(frAdapter.tokenize('Il était une fois un roi.')); // load the module's tables once
    const t0 = performance.now();
    const tokens = frAdapter.tokenize(text);
    const analyses = frAdapter.analyze(tokens);
    const found = frAdapter.detectPatterns!(tokens, analyses);
    const ms = performance.now() - t0;
    expect(tokens.filter((t) => t.isWord).length).toBeGreaterThanOrEqual(2000);
    expect(found.length).toBeGreaterThan(100);
    expect(ms).toBeLessThan(1500);
  });
});

/**
 * French shallow syntax (src/adapters/french/syntax.ts), through the real adapter. Machine-drafted rules, not a parser: the tests
 * show each relation kind on real sentences, the agreement evidence, the clitic order, the relative clauses, the notes, and the speed.
 * The assertions name relations as "dependent:relation:head" (surfaces) and hold whatever order the neighbouring-word package gives a
 * word's readings, because the sentences avoid words whose first reading that package may change.
 */
import { describe, expect, it } from 'vitest';
import { frAdapter } from '../../src/adapters/fr';
import type { SyntaxAnalysis, SyntaxRelation } from '../../src/core/syntax';

function analyse(sentence: string): { sx: SyntaxAnalysis; surfaces: string[]; edges: string[]; rel: (dep: string) => SyntaxRelation | undefined } {
  const tokens = frAdapter.tokenize(sentence);
  const analyses = frAdapter.analyze(tokens);
  const sx = frAdapter.syntax?.(tokens, analyses);
  expect(sx, sentence).toBeDefined();
  const surfaces = tokens.map((t) => t.surface);
  const edges = sx!.relations.map((r) => `${surfaces[r.dependent]}:${r.relation}:${r.head === undefined ? '-' : surfaces[r.head]}`);
  const rel = (dep: string) => sx!.relations.find((r) => surfaces[r.dependent] === dep);
  return { sx: sx!, surfaces, edges, rel };
}

/** [sentence, expected edges] */
const EDGES: ReadonlyArray<readonly [string, readonly string[]]> = [
  // determiner, adjective, subject, root, preposition, adverbial phrase
  ['Le chat noir dort sur la table.', ['Le:det:chat', 'noir:amod:chat', 'chat:nsubj:dort', 'dort:root:-', 'sur:case:table', 'la:det:table', 'table:obl:dort']],
  ['Les petits enfants dorment dans la maison.', ['Les:det:enfants', 'petits:amod:enfants', 'enfants:nsubj:dorment', 'dans:case:maison', 'maison:obl:dorment']],
  // the de-complement of a noun
  ['La maison de Paul brille.', ['La:det:maison', 'de:case:Paul', 'Paul:nmod:maison', 'maison:nsubj:brille']],
  ['Le chien du voisin dort.', ['Le:det:chien', 'du:case:voisin', 'voisin:nmod:chien', 'chien:nsubj:dort']],
  // auxiliary, object, negation
  ['Il a mangé la soupe.', ['Il:nsubj:mangé', 'a:aux:mangé', 'la:det:soupe', 'soupe:obj:mangé']],
  ['Elle a vu le chat.', ['Elle:nsubj:vu', 'a:aux:vu', 'chat:obj:vu']],
  ['Je ne le vois pas.', ['Je:nsubj:vois', 'ne:advmod:vois', 'le:obj:vois', 'pas:advmod:vois']],
  ['Il ne dort jamais.', ['Il:nsubj:dort', 'ne:advmod:dort', 'jamais:advmod:dort']],
  // clitic pronouns
  ['Elle me le donne.', ['Elle:nsubj:donne', 'me:iobj:donne', 'le:obj:donne']],
  ['Je lui parle.', ['Je:nsubj:parle', 'lui:iobj:parle']],
  ['Il y pense.', ['Il:nsubj:pense', 'y:obl:pense', 'pense:root:-']],
  ['Elle en mange.', ['Elle:nsubj:mange', 'en:obl:mange']],
  ['Il se lave.', ['Il:nsubj:lave', 'se:expl:lave']],
  ['Elle se dépêche.', ['Elle:nsubj:dépêche', 'se:expl:dépêche']],
  // relative clauses: qui, que, dont, où
  ['La femme qui chante dort.', ['qui:nsubj:chante', 'chante:acl:femme']],
  ['Le chat que j\'ai vu dort.', ['que:obj:vu', 'vu:acl:chat', 'ai:aux:vu']],
  ['Le livre dont je parle dort.', ['dont:obl:parle', 'parle:acl:livre']],
  ['La ville où il habite dort.', ['où:obl:habite', 'habite:acl:ville']],
  // que the conjunction, other subordinating words
  ['Je sais qu\'il vient.', ['qu\':mark:vient', 'vient:ccomp:sais']],
  ['Il dit que le chat dort.', ['que:mark:dort', 'dort:ccomp:dit']],
  ['Parce que tu viens, je reste.', ['Parce:mark:viens', 'que:fixed:Parce', 'viens:advcl:reste']],
  // infinitives
  ['Il veut partir.', ['partir:xcomp:veut']],
  ['Il va manger.', ['manger:xcomp:va']],
  ['Il commence à partir.', ['à:mark:partir', 'partir:xcomp:commence']],
  ['Il essaie de partir.', ['de:mark:partir', 'partir:xcomp:essaie']],
  ['Il dort pour manger.', ['pour:mark:manger', 'manger:advcl:dort']],
  ['Il le veut voir.', ['voir:xcomp:veut']],
  // inverted subject, postposed pronouns
  ['Veut-il partir ?', ['il:nsubj:Veut', 'partir:xcomp:Veut']],
  ['Donne-le-moi.', ['le:obj:Donne', 'moi:iobj:Donne']],
  // coordination
  ['Paul et Marie mangent des pommes.', ['Paul:nsubj:mangent', 'et:cc:Marie', 'Marie:conj:Paul', 'pommes:obj:mangent']],
  ['Elle aime le chat et le chien.', ['et:cc:chien', 'chien:conj:chat']],
  ['Il dort et elle mange.', ['elle:nsubj:mange', 'et:cc:mange', 'mange:conj:dort']],
];

describe('relations on real sentences', () => {
  it.each(EDGES)('%s', (sentence, expected) => {
    const { edges } = analyse(sentence);
    for (const e of expected) expect(edges, `${sentence}: ${e}`).toContain(e);
  });

  it('every relation kind of the brief is shown on at least two sentences', () => {
    const kinds = ['det', 'amod', 'nsubj', 'aux', 'obj', 'iobj', 'advmod', 'case', 'nmod', 'obl', 'acl', 'mark', 'ccomp', 'xcomp', 'advcl', 'conj', 'cc', 'expl', 'root'];
    const count = new Map<string, number>();
    for (const [, expected] of EDGES) for (const kind of new Set(expected.map((e) => e.split(':')[1]!))) count.set(kind, (count.get(kind) ?? 0) + 1);
    for (const k of kinds) expect(count.get(k) ?? 0, k).toBeGreaterThanOrEqual(2);
  });
});

describe('the contracted article inside au, du, des', () => {
  it('names the two halves in the basis of the preposition', () => {
    const { rel } = analyse('Il parle au chat.');
    const r = rel('au');
    expect(r?.relation).toBe('case');
    expect(r?.basis.join(' ')).toMatch(/contraction of à \+ le/);
  });
});

describe('agreement as evidence', () => {
  it('an article and a noun that agree say so', () => {
    const r = analyse('Le chat dort.').rel('Le')!;
    expect(r.basis.join(' ')).toMatch(/both masculine singular/);
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
    expect(r.status).toBe('generated');
  });
  it('a mismatch lowers the confidence and says so', () => {
    const r = analyse('Une chat dort.').rel('Une')!;
    expect(r.relation).toBe('det');
    expect(r.basis.join(' ')).toMatch(/do not agree/);
    expect(r.confidence).toBeLessThan(0.6);
    expect(r.status).toBe('conflicted');
  });
  it('an adjective that does not agree with its noun is attached with less confidence', () => {
    const ok = analyse('Le chat noir dort.').rel('noir')!;
    const bad = analyse('Le chat noire dort.').rel('noire')!;
    expect(bad.confidence).toBeLessThan(ok.confidence);
    expect(bad.basis.join(' ')).toMatch(/do not agree/);
  });
  it('the verb ending is evidence for the subject, and a mismatch is said', () => {
    const ok = analyse('Je dors.').rel('Je')!;
    expect(ok.basis.join(' ')).toMatch(/fits/);
    const bad = analyse('Les chats dort.').rel('chats')!;
    expect(bad.relation).toBe('nsubj');
    expect(bad.basis.join(' ')).toMatch(/does not match/);
    expect(bad.confidence).toBeLessThan(ok.confidence);
  });
});

describe('the clitic order', () => {
  it('me te se nous vous · le la les · lui leur · y · en: the usual order is read plainly', () => {
    const { rel } = analyse('Je le lui donne.');
    expect(rel('le')?.relation).toBe('obj');
    expect(rel('lui')?.relation).toBe('iobj');
    expect(rel('le')?.basis.join(' ')).not.toMatch(/not in the usual order/);
  });
  it('an order that is not the usual one lowers the confidence and says so', () => {
    const usual = analyse('Je le lui donne.').rel('le')!;
    const odd = analyse('Je lui le donne.').rel('le')!;
    expect(odd.basis.join(' ')).toMatch(/not in the usual order/);
    expect(odd.confidence).toBeLessThan(usual.confidence);
  });
  it('me before le is the indirect object (il me le donne)', () => {
    expect(analyse('Il me le donne.').rel('me')?.relation).toBe('iobj');
  });
  it('a lone me is a direct object with the indirect and the reflexive reading kept as alternatives', () => {
    const r = analyse('Il me voit.').rel('me')!;
    expect(r.relation).toBe('obj');
    expect(r.alternatives?.map((a) => a.relation)).toEqual(expect.arrayContaining(['iobj', 'expl']));
    expect(r.status).toBe('conflicted');
  });
});

describe('alternatives are kept where the rules cannot rule one out', () => {
  it('a prepositional phrase after a verb and a noun is the verb\'s or the noun\'s', () => {
    const r = analyse('Il mange la soupe dans la cuisine.').rel('cuisine')!;
    expect(r.relation).toBe('obl');
    expect(r.alternatives?.some((a) => a.relation === 'nmod')).toBe(true);
    expect(r.status).toBe('conflicted');
  });
  it('que after a noun is the relative pronoun with the conjunction kept as an alternative', () => {
    const r = analyse('Le chat que j\'ai vu dort.').rel('que')!;
    expect(r.relation).toBe('obj');
    expect(r.alternatives?.some((a) => a.relation === 'mark')).toBe(true);
  });
});

describe('the shape of every analysis', () => {
  const SENTENCES = EDGES.map(([s]) => s);
  it('has the language, the tokens, indexes in range, a basis, no loop and one relation per word', () => {
    for (const s of SENTENCES) {
      const tokens = frAdapter.tokenize(s);
      const { sx } = analyse(s);
      expect(sx.languageId).toBe('fr');
      expect(sx.tokens).toEqual(tokens.map((t) => t.surface));
      const seen = new Set<number>();
      for (const r of sx.relations) {
        expect(tokens[r.dependent]?.isWord, `${s}: dependent is a word`).toBe(true);
        if (r.head !== undefined) expect(tokens[r.head]?.isWord, `${s}: head is a word`).toBe(true);
        expect(r.basis.length, `${s}: ${r.relation}`).toBeGreaterThan(0);
        expect(r.label.length).toBeGreaterThan(0);
        expect(r.confidence).toBeGreaterThan(0);
        expect(r.confidence).toBeLessThanOrEqual(1);
        expect(seen.has(r.dependent), `${s}: two relations for one word`).toBe(false);
        seen.add(r.dependent);
        // no loop
        let h = r.head;
        for (let steps = 0; h !== undefined && steps <= tokens.length; steps++) {
          expect(h, `${s}: loop`).not.toBe(r.dependent);
          h = sx.relations.find((x) => x.dependent === h)?.head;
        }
      }
      expect(sx.attached).toBeGreaterThanOrEqual(0);
      expect(sx.attached).toBeLessThanOrEqual(1);
    }
  });
  it('`attached` is the share of word tokens that got a relation', () => {
    const { sx, surfaces } = analyse('Le chat noir dort sur la table.');
    const words = frAdapter.tokenize('Le chat noir dort sur la table.').filter((t) => t.isWord).length;
    expect(sx.attached).toBeCloseTo(sx.relations.length / words, 2);
    expect(surfaces.length).toBeGreaterThan(words);
  });
  it('exactly one root when there is a verb', () => {
    for (const s of ['Le chat dort.', 'Il a mangé la soupe.', 'Je ne le vois pas.']) {
      expect(analyse(s).sx.relations.filter((r) => r.relation === 'root')).toHaveLength(1);
    }
  });
  it('clause spans, when given, are in range and name their kind', () => {
    const { sx } = analyse('La femme qui chante dort.');
    expect(sx.clauses?.some((c) => c.kind === 'relative')).toBe(true);
    for (const c of sx.clauses ?? []) { expect(c.start).toBeLessThanOrEqual(c.end); expect(c.label.length).toBeGreaterThan(0); }
  });
});

describe('what the rules cannot place', () => {
  it('a sentence of unknown words gives few relations and a note', () => {
    const { sx } = analyse('Zxqv blorf flimbo.');
    expect(sx.attached).toBeLessThanOrEqual(0.7);
    expect(sx.notes.join(' ')).toMatch(/No reading for|could not place|No finite verb/);
  });
  it('an unknown word among known ones is named in a note and gets no relation', () => {
    const { sx, rel } = analyse('Nous avons des problèmes avec le glouboulou.');
    expect(rel('glouboulou')).toBeUndefined();
    expect(sx.notes.join(' ')).toMatch(/glouboulou/);
  });
  it('a sentence with no verb says so', () => {
    const { sx } = analyse('Le chat noir.');
    expect(sx.notes.join(' ')).toMatch(/No finite verb/);
  });
  it('a long sentence says the rules may be less reliable', () => {
    const long = `${Array.from({ length: 24 }, () => 'Le chat dort et le chien mange').join(', ')}.`;
    const { sx } = analyse(long);
    expect(sx.notes.join(' ')).toMatch(/long sentence/);
  });
  it('no words gives no analysis', () => {
    const tokens = frAdapter.tokenize('… !');
    expect(frAdapter.syntax?.(tokens, frAdapter.analyze(tokens))).toBeUndefined();
  });
});

describe('speed', () => {
  it('a 2,000-word text is analysed in under 1.5 s', () => {
    const base = 'Le petit chat noir dort sur la table de la cuisine pendant que Marie et Paul mangent la soupe que j\'ai faite. Il ne le voit pas et elle lui parle de la femme qui chante dans le jardin où il habite. ';
    let text = '';
    while (text.split(/\s+/).length < 2000) text += base;
    const tokens = frAdapter.tokenize(text);
    const analyses = frAdapter.analyze(tokens);
    const t0 = performance.now();
    const sx = frAdapter.syntax?.(tokens, analyses);
    const ms = performance.now() - t0;
    expect(sx?.relations.length).toBeGreaterThan(1000);
    expect(ms, `${ms.toFixed(0)} ms`).toBeLessThan(1500);
  });
});

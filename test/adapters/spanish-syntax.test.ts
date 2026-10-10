/** Spanish contextual syntax (Stage 4): expected heads and relations, kept alternatives, nothing invented, and the gold-file floors as measured. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { adapter } from './helpers';
import { spanishSyntax } from '../../src/adapters/spanish/syntax';
import type { SyntaxAnalysis } from '../../src/core/syntax';

const es = adapter('es');

function run(text: string) {
  const tokens = es.tokenize(text);
  const analyses = es.analyze(tokens);
  const sx = spanishSyntax(tokens, analyses);
  const at = (word: string, nth = 0) => {
    const idx = tokens.map((t, i) => (t.surface === word ? i : -1)).filter((i) => i >= 0)[nth];
    if (idx === undefined) throw new Error(`no token ${word} in ${text}`);
    const r = sx.relations.find((x) => x.dependent === idx);
    return r ? { head: r.head === undefined ? 'ROOT' : tokens[r.head]!.surface, rel: r.relation, status: r.status, alts: (r.alternatives ?? []).map((a) => a.relation), conf: r.confidence, basis: r.basis.join(' | ') } : undefined;
  };
  return { sx, at, tokens, analyses };
}

describe('Spanish syntax: wiring', () => {
  it('the adapter offers syntax() and it agrees with the module', () => {
    expect(typeof es.syntax).toBe('function');
    const t = es.tokenize('Juan tiene un libro.');
    const a = es.analyze(t);
    expect(es.syntax!(t, a)).toEqual(spanishSyntax(t, a));
    expect(es.syntax!(t, a)!.languageId).toBe('es');
  });
  it('is deterministic', () => {
    const t = es.tokenize('Cuando era joven, yo no entendía mi corazón.');
    const a = es.analyze(t);
    expect(JSON.stringify(spanishSyntax(t, a))).toBe(JSON.stringify(spanishSyntax(t, a)));
  });
});

describe('Spanish syntax: expected relations', () => {
  it('copula: the predicate is the root, the subject agrees', () => {
    const r = run('La casa es pequeña.');
    expect(r.at('pequeña')).toMatchObject({ head: 'ROOT', rel: 'root' });
    expect(r.at('es')).toMatchObject({ head: 'pequeña', rel: 'cop' });
    expect(r.at('casa')).toMatchObject({ head: 'pequeña', rel: 'nsubj' });
    expect(r.at('La')).toMatchObject({ head: 'casa', rel: 'det' });
    expect(r.at('La')!.basis).toMatch(/agree/);
  });
  it('locative copula: the noun of the phrase is the predicate, the preposition its case', () => {
    const r = run('El libro está sobre la mesa.');
    expect(r.at('mesa')).toMatchObject({ rel: 'root' });
    expect(r.at('sobre')).toMatchObject({ head: 'mesa', rel: 'case' });
    expect(r.at('libro')).toMatchObject({ head: 'mesa', rel: 'nsubj' });
  });
  it('clitics before the verb: iobj, obj, and the "a mí" phrase', () => {
    const r = run('Ella me lo dio a mí.');
    expect(r.at('me')).toMatchObject({ head: 'dio', rel: 'iobj' });
    expect(r.at('lo')).toMatchObject({ head: 'dio', rel: 'obj' });
    expect(r.at('a')).toMatchObject({ head: 'mí', rel: 'case' });
  });
  it('near future: ir a + infinitive', () => {
    const r = run('Va a comer la manzana con sus amigos.');
    expect(r.at('Va')).toMatchObject({ head: 'comer', rel: 'aux' });
    expect(r.at('a')).toMatchObject({ head: 'comer', rel: 'mark' });
    expect(r.at('comer')).toMatchObject({ rel: 'root' });
    expect(r.at('con')).toMatchObject({ head: 'amigos', rel: 'case' });
  });
  it('compound tense and progressive', () => {
    const a = run('Han comido tres manzanas rojas.');
    expect(a.at('Han')).toMatchObject({ head: 'comido', rel: 'aux' });
    expect(a.at('tres')).toMatchObject({ head: 'manzanas', rel: 'nummod' });
    expect(a.at('rojas')).toMatchObject({ head: 'manzanas', rel: 'amod' });
    expect(a.at('manzanas')).toMatchObject({ head: 'comido', rel: 'obj' });
    const b = run('Estoy leyendo un libro.');
    expect(b.at('Estoy')).toMatchObject({ head: 'leyendo', rel: 'aux' });
    expect(b.at('leyendo')).toMatchObject({ rel: 'root' });
  });
  it('modal + infinitive, and the objects of the infinitive', () => {
    const r = run('Quiero ver a mi madre y a mis hermanos.');
    expect(r.at('ver')).toMatchObject({ head: 'Quiero', rel: 'xcomp' });
    expect(r.at('madre')).toMatchObject({ head: 'ver', rel: 'obj' });
    expect(r.at('hermanos')).toMatchObject({ head: 'madre', rel: 'conj' });
    expect(r.at('y')).toMatchObject({ head: 'hermanos', rel: 'cc' });
  });
  it('clitic climbing: the pronoun is the object of the infinitive', () => {
    expect(run('Lo quiero ver.').at('Lo')).toMatchObject({ head: 'ver', rel: 'obj' });
  });
  it('personal a: object after a verb of seeing, indirect object after dar', () => {
    expect(run('Veo a Juan.').at('Juan')).toMatchObject({ head: 'Veo', rel: 'obj' });
    expect(run('Doy el libro a Juan.').at('Juan')).toMatchObject({ head: 'Doy', rel: 'iobj' });
    expect(run('Dáselo a Juan.').at('Juan')).toMatchObject({ head: 'Dáselo', rel: 'iobj' });
  });
  it('pronouns written onto the verb are named in the basis of the verb', () => {
    expect(run('Dáselo a Juan.').at('Dáselo')!.basis).toMatch(/se.*lo/);
  });
  it('relative clause: que is the subject of its clause, the clause describes the noun', () => {
    const r = run('Los niños que juegan en el parque son felices.');
    expect(r.at('que')).toMatchObject({ head: 'juegan', rel: 'nsubj' });
    expect(r.at('juegan')).toMatchObject({ head: 'niños', rel: 'acl' });
    expect(r.at('felices')).toMatchObject({ rel: 'root' });
    expect(r.at('son')).toMatchObject({ head: 'felices', rel: 'cop' });
  });
  it('complement and adverbial clauses', () => {
    const r = run('Dijo que no quería comer porque estaba cansado.');
    expect(r.at('quería')).toMatchObject({ head: 'Dijo', rel: 'ccomp' });
    expect(r.at('que')).toMatchObject({ head: 'quería', rel: 'mark' });
    expect(r.at('comer')).toMatchObject({ head: 'quería', rel: 'xcomp' });
    expect(r.at('porque')).toMatchObject({ rel: 'mark' });
    expect(r.at('cansado')).toMatchObject({ head: 'quería', rel: 'advcl' });
  });
  it('subordinate clause first: the main verb is the root', () => {
    const r = run('Cuando era joven, yo no entendía mi corazón.');
    expect(r.at('entendía')).toMatchObject({ rel: 'root' });
    expect(r.at('joven')).toMatchObject({ head: 'entendía', rel: 'advcl' });
    expect(r.at('Cuando')).toMatchObject({ head: 'joven', rel: 'mark' });
    expect(r.at('yo')).toMatchObject({ head: 'entendía', rel: 'nsubj', status: 'generated' });
  });
  it('coordination: all items hang on the first', () => {
    const r = run('Pedro, Rosa y Luis comen pan.');
    expect(r.at('Pedro')).toMatchObject({ head: 'comen', rel: 'nsubj' });
    expect(r.at('Rosa')).toMatchObject({ head: 'Pedro', rel: 'conj' });
    expect(r.at('Luis')).toMatchObject({ head: 'Pedro', rel: 'conj' });
  });
  it('vocative and imperative', () => {
    expect(run('Juan, ven aquí.').at('Juan')).toMatchObject({ head: 'ven', rel: 'vocative' });
  });
  it('question word first: the subject follows (kept as an alternative)', () => {
    const r = run('¿Dónde vive tu abuela?');
    expect(r.at('Dónde')).toMatchObject({ head: 'vive', rel: 'advmod' });
    expect(r.at('abuela')).toMatchObject({ head: 'vive', rel: 'nsubj' });
    expect(r.at('abuela')!.alts).toContain('obj');
  });
});

describe('Spanish syntax: alternatives are kept where the rules cannot decide', () => {
  it('two nouns of the same number around a finite verb', () => {
    const r = run('Juan tiene un libro.');
    expect(r.at('Juan')).toMatchObject({ head: 'tiene', rel: 'nsubj', status: 'conflicted' });
    expect(r.at('Juan')!.alts).toContain('obj');
    expect(r.at('libro')).toMatchObject({ head: 'tiene', rel: 'obj', status: 'conflicted' });
    expect(r.at('libro')!.alts).toContain('nsubj');
  });
  it('"se" + verb + noun: passive or impersonal', () => {
    const r = run('Se venden casas.');
    expect(r.at('casas')).toMatchObject({ head: 'venden', rel: 'nsubj', status: 'conflicted' });
    expect(r.at('casas')!.alts).toContain('obj');
    expect(r.at('Se')!.status).toBe('conflicted');
  });
  it('si after a verb of knowing: "whether" or "if"', () => {
    const r = run('No sé si él viene mañana.');
    expect(r.at('viene')).toMatchObject({ head: 'sé', rel: 'ccomp', status: 'conflicted' });
    expect(r.at('viene')!.alts).toContain('advcl');
  });
  it('a prepositional phrase right after an object: verb or noun', () => {
    const r = run('Va a comer la manzana con sus amigos.');
    expect(r.at('amigos')).toMatchObject({ rel: 'obl', status: 'conflicted' });
    expect(r.at('amigos')!.alts).toContain('nmod');
  });
  it('every conflicted relation names its alternatives and the reason', () => {
    const r = run('Juan da el libro a Ana, y Marta quiere un perro.');
    for (const x of r.sx.relations) {
      if (x.status === 'conflicted') for (const a of x.alternatives ?? []) expect(a.why.length).toBeGreaterThan(5);
      else expect(x.alternatives ?? []).toEqual([]);
    }
  });
});

describe('Spanish syntax: pro-drop and honesty about unknown words', () => {
  it('no subject word: no nsubj, and a note says why', () => {
    const r = run('Quiero ver a Juan.');
    expect(r.sx.relations.some((x) => x.relation === 'nsubj')).toBe(false);
    expect(r.sx.notes.join(' ')).toMatch(/No subject word for “Quiero”/);
  });
  it('a word with no reading gets no relation and a note', () => {
    const r = run('Xqzt blorf corre.');
    expect(r.at('Xqzt')).toBeUndefined();
    expect(r.at('blorf')).toBeUndefined();
    expect(r.sx.attached).toBeLessThan(0.5);
    expect(r.sx.notes.join(' ')).toMatch(/No reading for “Xqzt”/);
  });
  it('a word the list does not know but whose position settles it is marked as guessed, with low confidence', () => {
    const r = run('El ruido es insoportable.');
    expect(r.at('ruido')).toMatchObject({ head: 'insoportable', rel: 'nsubj' });
    expect(r.at('ruido')!.conf).toBeLessThanOrEqual(0.45);
    expect(r.sx.notes.join(' ')).toMatch(/Not in the word list/);
  });
  it('empty and punctuation-only input', () => {
    for (const t of ['', '   ', '¿?', '...']) {
      const r = run(t);
      expect(r.sx.relations.filter((x) => x.relation !== 'punct')).toEqual([]);
      expect(r.sx.attached).toBe(1);
    }
  });
});

describe('Spanish syntax: structural guarantees over the bundled corpus', () => {
  const docs: string[] = [];
  for (const f of ['story-01', 'dialogue-01', 'camino-1-03', 'camino-2-04', 'camino-3-02', 'bible-1john-1', 'honduras-lecturas-1-02']) {
    const d = JSON.parse(readFileSync(`data/corpus/es/${f}.json`, 'utf8')) as { sections: { paragraphs: { sentences?: { text: string }[] }[] }[] };
    for (const s of d.sections) for (const p of s.paragraphs) for (const x of p.sentences ?? []) docs.push(x.text);
  }
  const all: { text: string; sx: SyntaxAnalysis; n: number; words: number }[] = docs.map((text) => {
    const t = es.tokenize(text);
    return { text, sx: spanishSyntax(t, es.analyze(t)), n: t.length, words: t.filter((x) => x.isWord).length };
  });
  it('one relation per token, heads in range, a basis everywhere, at most one root, no loops', () => {
    for (const { text, sx, n } of all) {
      const seen = new Set<number>();
      let roots = 0;
      for (const r of sx.relations) {
        expect(seen.has(r.dependent), text).toBe(false);
        seen.add(r.dependent);
        expect(r.basis.length, text).toBeGreaterThan(0);
        expect(r.basis.every((b) => b.trim().length > 0), text).toBe(true);
        expect(r.confidence).toBeGreaterThanOrEqual(0);
        expect(r.confidence).toBeLessThanOrEqual(1);
        if (r.head === undefined) { if (r.relation === 'root') roots++; } else expect(r.head >= 0 && r.head < n, text).toBe(true);
        expect(r.status === 'conflicted', text).toBe((r.alternatives ?? []).length > 0);
        let h = r.head, steps = 0;
        while (h !== undefined && steps++ <= n) { expect(h, text).not.toBe(r.dependent); h = sx.relations.find((z) => z.dependent === h)?.head; }
      }
      expect(roots, text).toBeLessThanOrEqual(1);
    }
  });
  it('measured floors: attached share, alternatives share, speed', () => {
    const words = all.reduce((s, x) => s + x.words, 0);
    const attached = all.reduce((s, x) => s + Math.round(x.sx.attached * x.words), 0);
    expect(attached / words).toBeGreaterThanOrEqual(0.98);
    const rels = all.flatMap((x) => x.sx.relations.filter((r) => r.relation !== 'punct'));
    expect(rels.filter((r) => r.alternatives?.length).length / rels.length).toBeLessThanOrEqual(0.12);
    const t0 = performance.now();
    for (let k = 0; k < 5; k++) for (const x of all) spanishSyntax(es.tokenize(x.text), es.analyze(es.tokenize(x.text)));
    expect((performance.now() - t0) / (5 * all.length)).toBeLessThan(2);
  });
});

describe('Spanish syntax: gold files (AI-labelled, unreviewed)', () => {
  interface Gold { sentences: { text: string; tokens: string[]; heads: number[]; relations: string[] }[] }
  function score(path: string) {
    const gold = JSON.parse(readFileSync(path, 'utf8')) as Gold;
    let n = 0, uas = 0, las = 0;
    for (const g of gold.sentences) {
      const t = es.tokenize(g.text);
      const sx = spanishSyntax(t, es.analyze(t));
      const wi = t.map((x, i) => (x.isWord ? i : -1)).filter((i) => i >= 0);
      expect(wi.map((i) => t[i]!.surface), g.text).toEqual(g.tokens);
      const pos = new Map<number, number>();
      wi.forEach((i, j) => pos.set(i, j));
      wi.forEach((i, j) => {
        n++;
        const r = sx.relations.find((x) => x.dependent === i);
        const head = !r ? -2 : r.head === undefined ? -1 : (pos.get(r.head) ?? -3);
        if (head === g.heads[j]) { uas++; if (r!.relation === g.relations[j]) las++; }
      });
    }
    return { sentences: gold.sentences.length, uas: uas / n, las: las / n };
  }
  it('dev set (rules were developed against it): measured UAS 0.993, LAS 0.980', () => {
    const s = score('data/gold/es/syntax-dev.json');
    expect(s.sentences).toBeGreaterThanOrEqual(40);
    expect(s.uas).toBeGreaterThanOrEqual(0.97);
    expect(s.las).toBeGreaterThanOrEqual(0.95);
  });
  it('second set (first pass before fixes: UAS 0.942, LAS 0.925; after: 0.954, 0.942)', () => {
    const s = score('data/gold/es/syntax-heldout.json');
    expect(s.uas).toBeGreaterThanOrEqual(0.93);
    expect(s.las).toBeGreaterThanOrEqual(0.91);
  });
});

/**
 * German contextual syntax (Linguistic Engine V2, Stage 4): the shallow dependency rules of src/adapters/german/syntax.ts on the real
 * engine. Every case is written from the grammar of German (what the clause, the verb group and the noun phrase decide, and what
 * they must leave open), then run. The last block holds the measured floors against the hand-labelled gold files in data/gold/de
 * (AI-judged, unreviewed): the floors are set a little under the measured values, so a regression shows, a gain does not break.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnalyzedToken, RawToken } from '../../src/core';
import type { SyntaxAnalysis, SyntaxRelation } from '../../src/core/syntax';
import { relationOf } from '../../src/core/syntax';
import { deAdapter as de } from '../../src/adapters/de';
import { germanSyntax } from '../../src/adapters/german/syntax';

interface P { text: string; tokens: RawToken[]; analyzed: AnalyzedToken[]; a: SyntaxAnalysis }
const parse = (text: string): P => {
  const tokens = de.tokenize(text);
  const analyzed = de.analyze(tokens);
  return { text, tokens, analyzed, a: de.syntax!(tokens, analyzed)! };
};
const at = (p: P, surface: string, nth = 0): number => {
  let seen = 0;
  for (let i = 0; i < p.tokens.length; i++) if (p.tokens[i].surface === surface && seen++ === nth) return i;
  throw new Error(`no token "${surface}" (${nth}) in "${p.text}"`);
};
const rel = (p: P, surface: string, nth = 0): SyntaxRelation | undefined => relationOf(p.a, at(p, surface, nth));
/** "relation -> head surface" of a word, or "none". */
const arc = (p: P, surface: string, nth = 0): string => {
  const r = rel(p, surface, nth);
  return r ? `${r.relation} -> ${r.head === undefined ? 'ROOT' : p.tokens[r.head].surface}` : 'none';
};
const basisOf = (p: P, surface: string, nth = 0): string => (rel(p, surface, nth)?.basis ?? []).join(' | ');

describe('German syntax: the adapter offers it', () => {
  it('is wired into the adapter and names its analyzer', () => {
    expect(typeof de.syntax).toBe('function');
    const p = parse('Ich habe ein Haus.');
    expect(p.a.languageId).toBe('de');
    expect(p.a.analyzer).toMatch(/^syntax-de@/);
    expect(p.a.tokens).toEqual(p.tokens.map((t) => t.surface));
  });
});

describe('German syntax: main clause (verb second) and subordinate clause (verb last)', () => {
  it('V2: the finite verb is the root; subject, object and adverbial hang on it', () => {
    const p = parse('Am Mittwochabend liegt das Handy auf dem Tisch.');
    expect(arc(p, 'liegt')).toBe('root -> ROOT');
    expect(arc(p, 'Handy')).toBe('nsubj -> liegt');
    expect(arc(p, 'Mittwochabend')).toBe('obl -> liegt');
    expect(arc(p, 'Tisch')).toBe('obl -> liegt');
    expect(arc(p, 'Am')).toBe('case -> Mittwochabend');
  });

  it('verb-final: dass opens a subordinate clause whose last word is its head, completing the verb before', () => {
    const p = parse('Opa sagt, dass er und Oma mit dem Zug kommen.');
    expect(arc(p, 'sagt')).toBe('root -> ROOT');
    expect(arc(p, 'kommen')).toBe('ccomp -> sagt');
    expect(arc(p, 'dass')).toBe('mark -> kommen');
    expect(arc(p, 'er')).toBe('nsubj -> kommen');
    expect(arc(p, 'Oma')).toBe('conj -> er');
    expect(basisOf(p, 'er')).toMatch(/plural/);
    const sub = p.a.clauses!.find((c) => c.kind === 'subordinate')!;
    expect(sub).toBeTruthy();
    expect(p.tokens[sub.marker!].surface).toBe('dass');
    expect(p.tokens[sub.end].surface).toBe('kommen');
  });

  it('weil / wenn clauses are adverbial clauses, also in front of the main clause', () => {
    const a = parse('Wenn es regnet, bleibe ich zu Hause.');
    expect(arc(a, 'bleibe')).toBe('root -> ROOT');
    expect(arc(a, 'regnet')).toBe('advcl -> bleibe');
    expect(arc(a, 'Wenn')).toBe('mark -> regnet');
    const b = parse('Daniel wählt Deutsch, weil er üben will.');
    expect(arc(b, 'will')).toBe('advcl -> wählt');
    expect(arc(b, 'üben')).toBe('xcomp -> will');
  });

  it('a relative clause ends in its verb and describes the noun before the comma', () => {
    const p = parse('Das Buch, das ich lese, ist gut.');
    expect(arc(p, 'gut')).toBe('root -> ROOT');
    expect(arc(p, 'Buch')).toBe('nsubj -> gut');
    expect(arc(p, 'lese')).toBe('acl -> Buch');
    expect(arc(p, 'das')).toBe('obj -> lese');
    expect(arc(p, 'ich')).toBe('nsubj -> lese');
    expect(p.a.clauses!.some((c) => c.kind === 'relative' && p.tokens[c.marker!].surface === 'das')).toBe(true);
  });

  it('a quotation after a colon completes the verb of saying', () => {
    const p = parse('Anna sagt: „Hallo, Lena! Hast du Hunger?“');
    expect(arc(p, 'sagt')).toBe('root -> ROOT');
    expect(arc(p, 'Hast')).toBe('ccomp -> sagt');
    expect(arc(p, 'Hallo')).toBe('discourse -> Hast');
    expect(arc(p, 'Lena')).toBe('vocative -> Hast');
    expect(p.a.clauses!.some((c) => c.kind === 'quote')).toBe(true);
  });
});

describe('German syntax: the verb group', () => {
  it('a separable verb: the prefix at the end of the clause is the verb\'s compound, with the unit as the basis', () => {
    const p = parse('Er steht um sieben Uhr auf.');
    expect(arc(p, 'auf')).toBe('compound -> steht');
    expect(rel(p, 'auf')!.label).toMatch(/separable prefix/);
    expect(basisOf(p, 'auf')).toMatch(/aufstehen/);
    expect(arc(p, 'Uhr')).toBe('obl -> steht');
    expect(arc(p, 'sieben')).toBe('nummod -> Uhr');
  });

  it('a separable verb written together in a verb-final clause has no separate prefix', () => {
    const p = parse('Ich weiß, dass er um sieben aufsteht.');
    expect(arc(p, 'aufsteht')).toBe('ccomp -> weiß');
    expect(p.a.relations.some((r) => r.relation === 'compound')).toBe(false);
  });

  it('perfect tense: the participle at the end is the head, haben / sein its auxiliary', () => {
    const a = parse('Paul hat das Buch gelesen.');
    expect(arc(a, 'gelesen')).toBe('root -> ROOT');
    expect(arc(a, 'hat')).toBe('aux -> gelesen');
    expect(arc(a, 'Buch')).toBe('obj -> gelesen');
    const b = parse('Sie sind mit dem Zug gekommen.');
    expect(arc(b, 'sind')).toBe('aux -> gekommen');
    expect(arc(b, 'Zug')).toBe('obl -> gekommen');
  });

  it('a modal verb heads its infinitive (xcomp); the object belongs to the infinitive', () => {
    const p = parse('Ich will ein Buch lesen.');
    expect(arc(p, 'will')).toBe('root -> ROOT');
    expect(arc(p, 'lesen')).toBe('xcomp -> will');
    expect(arc(p, 'Ich')).toBe('nsubj -> will');
    expect(arc(p, 'Buch')).toBe('obj -> lesen');
  });

  it('zu + infinitive: zu is the marker of the infinitive, which completes the verb; um … zu is an adverbial clause', () => {
    const a = parse('Wir fangen morgen an zu arbeiten.');
    expect(arc(a, 'zu')).toBe('mark -> arbeiten');
    expect(arc(a, 'arbeiten')).toBe('xcomp -> fangen');
    expect(arc(a, 'an')).toBe('compound -> fangen');
    const b = parse('Er geht nach Hause, um zu schlafen.');
    expect(arc(b, 'schlafen')).toBe('advcl -> geht');
    expect(arc(b, 'um')).toBe('mark -> schlafen');
    expect(arc(b, 'zu')).toBe('mark -> schlafen');
  });

  it('sein with no other verb is the copula of its predicate; the subject hangs on the predicate', () => {
    const p = parse('Das Haus ist klein.');
    expect(arc(p, 'klein')).toBe('root -> ROOT');
    expect(arc(p, 'ist')).toBe('cop -> klein');
    expect(arc(p, 'Haus')).toBe('nsubj -> klein');
    expect(basisOf(p, 'klein')).toMatch(/copula/);
  });

  it('two infinitives joined by und: the words behind und belong to the second verb', () => {
    const p = parse('Wenn es nicht regnet, können wir im Garten Kaffee trinken und Kuchen essen.');
    expect(arc(p, 'können')).toBe('root -> ROOT');
    expect(arc(p, 'trinken')).toBe('xcomp -> können');
    expect(arc(p, 'essen')).toBe('conj -> trinken');
    expect(arc(p, 'Kaffee')).toBe('obj -> trinken');
    expect(arc(p, 'Kuchen')).toBe('obj -> essen');
  });
});

describe('German syntax: case decides the arguments', () => {
  it('accusative → obj, dative → iobj', () => {
    const p = parse('Er gibt dem Kind den Ball.');
    expect(arc(p, 'Kind')).toBe('iobj -> gibt');
    expect(arc(p, 'Ball')).toBe('obj -> gibt');
    expect(basisOf(p, 'Ball')).toMatch(/accusative/);
  });

  it('an unambiguous accusative in front of the verb makes the other noun phrase the subject (object first)', () => {
    const p = parse('Den Mann sieht die Frau.');
    expect(arc(p, 'Mann')).toBe('obj -> sieht');
    expect(arc(p, 'Frau')).toBe('nsubj -> sieht');
    expect(rel(p, 'Frau')!.alternatives).toBeUndefined();
  });

  it('feminine nouns look the same in nominative and accusative: the first is the subject and the swapped reading is kept', () => {
    const p = parse('Die Frau sieht die Tochter.');
    expect(arc(p, 'Frau')).toBe('nsubj -> sieht');
    expect(arc(p, 'Tochter')).toBe('obj -> sieht');
    const s = rel(p, 'Frau')!;
    expect(s.alternatives?.some((x) => x.relation === 'obj' && /nominative and accusative/.test(x.why))).toBe(true);
    expect(rel(p, 'Tochter')!.alternatives?.some((x) => x.relation === 'nsubj')).toBe(true);
    expect(s.confidence).toBeLessThan(0.8);
    expect(s.status).toBe('conflicted');
    expect(rel(p, 'Tochter')!.status).toBe('conflicted');
    expect(basisOf(p, 'Frau')).toMatch(/first one is read as the subject|clearer nominative|agrees/);
  });

  it('two nominative noun phrases around sein: the first is the subject, the second the predicate, no swapped reading is offered', () => {
    const p = parse('Die Frau ist die Tochter.');
    expect(arc(p, 'Frau')).toBe('nsubj -> Tochter');
    expect(arc(p, 'Tochter')).toBe('root -> ROOT');
    expect(rel(p, 'Frau')!.alternatives).toBeUndefined();
    expect(basisOf(p, 'Frau')).toMatch(/second as the predicate/);
  });

  it('a clear nominative (der Mann) keeps no alternative', () => {
    const p = parse('Der Mann liest das Buch.');
    expect(rel(p, 'Mann')!.alternatives).toBeUndefined();
    expect(rel(p, 'Mann')!.status).toBe('generated');
    expect(arc(p, 'Buch')).toBe('obj -> liest');
  });

  it('a coordinated clause that opens with its verb shares the subject: the noun after it is an object', () => {
    const p = parse('Paul isst das Brot und trinkt das Wasser.');
    expect(arc(p, 'trinkt')).toBe('conj -> isst');
    expect(arc(p, 'und')).toBe('cc -> trinkt');
    expect(arc(p, 'Wasser')).toBe('obj -> trinkt');
    expect(arc(p, 'Brot')).toBe('obj -> isst');
  });

  it('the polite Sie takes a plural verb', () => {
    const p = parse('Doch, Sie sprechen schon sehr gut!');
    expect(arc(p, 'Sie')).toBe('nsubj -> sprechen');
    expect(arc(p, 'sehr')).toBe('advmod -> gut');
  });
});

describe('German syntax: prepositions and two-way prepositions', () => {
  it('a two-way preposition with a dative phrase names a location', () => {
    const p = parse('Das Buch ist auf dem Tisch.');
    expect(arc(p, 'auf')).toBe('case -> Tisch');
    expect(basisOf(p, 'auf')).toMatch(/two-way preposition/);
    expect(basisOf(p, 'auf')).toMatch(/location/);
    expect(arc(p, 'Tisch')).toBe('root -> ROOT');
  });

  it('a two-way preposition with an accusative phrase names a direction', () => {
    const p = parse('Ich gehe an den Tisch.');
    expect(arc(p, 'an')).toBe('case -> Tisch');
    expect(basisOf(p, 'an')).toMatch(/accusative/);
    expect(basisOf(p, 'an')).toMatch(/direction|where to/);
    expect(arc(p, 'Tisch')).toBe('obl -> gehe');
  });

  it('a preposition that takes the dative says so; a contraction counts as preposition + article', () => {
    const a = parse('Ich fahre mit dem Zug.');
    expect(basisOf(a, 'mit')).toMatch(/dative/);
    const b = parse('Die Kinder spielen im Garten.');
    expect(arc(b, 'im')).toBe('case -> Garten');
    expect(basisOf(b, 'im')).toMatch(/contraction/);
  });
});

describe('German syntax: the noun phrase', () => {
  it('an article agrees with its noun and says in what', () => {
    const p = parse('Der Mann liest das Buch.');
    expect(arc(p, 'Der')).toBe('det -> Mann');
    expect(basisOf(p, 'Der')).toMatch(/agrees with 'Mann'/);
  });

  it('an adjective with an ending before a noun describes it; a genitive behind a noun is its attribute', () => {
    const a = parse('Der kleine Hund schläft.');
    expect(arc(a, 'kleine')).toBe('amod -> Hund');
    const b = parse('Das Haus des Mannes ist groß.');
    expect(arc(b, 'Mannes')).toBe('nmod -> Haus');
    expect(arc(b, 'des')).toBe('det -> Mannes');
  });

  it('coordinated noun phrases: the second hangs on the first, und on the second', () => {
    const p = parse('Anna und Paul haben ein Kind.');
    expect(arc(p, 'Anna')).toBe('nsubj -> haben');
    expect(arc(p, 'Paul')).toBe('conj -> Anna');
    expect(arc(p, 'und')).toBe('cc -> Paul');
  });

  it('a list with commas does not split the clause; its items hang on the first', () => {
    const p = parse('Heute will sie Äpfel, Tomaten und Kartoffeln kaufen.');
    expect(arc(p, 'will')).toBe('root -> ROOT');
    expect(arc(p, 'Äpfel')).toBe('obj -> kaufen');
    expect(arc(p, 'Tomaten')).toBe('conj -> Äpfel');
    expect(arc(p, 'Kartoffeln')).toBe('conj -> Äpfel');
  });

  it('a title and a name are one name (flat)', () => {
    const p = parse('Heute geht Anna mit Lena zu Frau Weber.');
    expect(arc(p, 'Weber')).toBe('flat -> Frau');
    expect(arc(p, 'Frau')).toBe('obl -> geht');
    expect(arc(p, 'zu')).toBe('case -> Frau');
  });
});

describe('German syntax: honesty about what it does not know', () => {
  it('a word with no reading gets no relation and a note; a guessed word is capped at 0.5', () => {
    const p = parse('Xyzzy plugh frobnicate.');
    const noReading = p.analyzed.findIndex((a, i) => p.tokens[i].isWord && a.candidates.length === 0);
    if (noReading >= 0) {
      expect(relationOf(p.a, noReading)).toBeUndefined();
      expect(p.a.notes.some((n) => n.includes(p.tokens[noReading].surface))).toBe(true);
      expect(p.a.attached).toBeLessThan(1);
    }
    for (const r of p.a.relations) {
      const guess = p.analyzed[r.dependent]?.candidates[0]?.unconfirmed || (r.head !== undefined && p.analyzed[r.head]?.candidates[0]?.unconfirmed);
      if (guess) expect(r.confidence).toBeLessThanOrEqual(0.5);
    }
    const q = parse('Das Qwxzt schläft.');
    expect(rel(q, 'Qwxzt')!.confidence).toBeLessThanOrEqual(0.5);
  });

  it('empty and punctuation-only input give an empty analysis, not an error', () => {
    for (const text of ['', '...', '„“']) {
      const p = parse(text);
      expect(p.a.relations.filter((r) => r.relation !== 'punct')).toHaveLength(0);
      expect(p.a.attached).toBe(0);
    }
  });

  it('a one-word sentence is its own root; a verbless greeting is discourse for the clause after it', () => {
    expect(arc(parse('Hallo'), 'Hallo')).toBe('root -> ROOT');
    const p = parse('Hallo, Anna, wie geht es dir?');
    expect(arc(p, 'Hallo')).toBe('discourse -> geht');
    expect(arc(p, 'Anna')).toBe('vocative -> geht');
    expect(arc(p, 'dir')).toBe('iobj -> geht');
  });
});

describe('German syntax: invariants over every gold sentence and every corpus sentence', () => {
  const root = path.resolve(__dirname, '../..');
  const goldFiles = ['syntax-dev.json', 'syntax-heldout.json', 'syntax-unseen.json'];
  const texts: string[] = [];
  for (const f of goldFiles) for (const s of JSON.parse(fs.readFileSync(path.join(root, 'data/gold/de', f), 'utf8')).sentences as Array<{ text: string }>) texts.push(s.text);
  const corpusDir = path.join(root, 'data/corpus/de');
  const collect = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(collect); return; }
    if (!node || typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    if (Array.isArray(o.sentences)) for (const s of o.sentences as Array<{ text?: string }>) if (typeof s?.text === 'string') texts.push(...de.segmentSentences(s.text).map((x) => x.text.trim()).filter(Boolean));
    for (const k of Object.keys(o)) if (k !== 'sentences') collect(o[k]);
  };
  for (const f of fs.readdirSync(corpusDir).filter((x) => x.endsWith('.json'))) collect(JSON.parse(fs.readFileSync(path.join(corpusDir, f), 'utf8')));

  it('every relation has a non-empty basis, a head inside the sentence, no self-loop, and the heads form a forest with one root at most', () => {
    expect(texts.length).toBeGreaterThan(800);
    for (const text of texts) {
      const p = parse(text);
      const byDep = new Map<number, SyntaxRelation>();
      for (const r of p.a.relations) {
        expect(byDep.has(r.dependent), `${text}: two relations for one word`).toBe(false);
        byDep.set(r.dependent, r);
        expect(r.basis.length > 0 && r.basis.every((b) => b.trim().length > 0), `${text}: empty basis at ${r.dependent}`).toBe(true);
        expect(r.label.trim().length > 0).toBe(true);
        expect(r.confidence >= 0 && r.confidence <= 1).toBe(true);
        if (r.head !== undefined) { expect(r.head >= 0 && r.head < p.tokens.length && r.head !== r.dependent, `${text}: bad head`).toBe(true); }
        else expect(r.relation).toBe('root');
        for (const a of r.alternatives ?? []) expect(a.why.trim().length > 0).toBe(true);
      }
      expect(p.a.relations.filter((r) => r.relation === 'root').length, `${text}: roots`).toBeLessThanOrEqual(1);
      for (const r of p.a.relations) {
        const seen = new Set<number>([r.dependent]);
        let k = r.head;
        while (k !== undefined) { expect(seen.has(k), `${text}: cycle`).toBe(false); seen.add(k); k = byDep.get(k)?.head; }
      }
      const words = p.tokens.filter((t) => t.isWord).length;
      const got = p.tokens.filter((t, i) => t.isWord && byDep.has(i)).length;
      expect(p.a.attached).toBeCloseTo(words ? got / words : 0, 2);
      for (const c of p.a.clauses ?? []) expect(c.start <= c.end && c.end < p.tokens.length).toBe(true);
    }
  });

  it('it neither changes the analyses it is given nor depends on a previous call', () => {
    for (const text of texts.slice(0, 150)) {
      const tokens = de.tokenize(text);
      const analyzed = de.analyze(tokens);
      const before = JSON.stringify(analyzed);
      const a1 = germanSyntax(tokens, analyzed);
      expect(JSON.stringify(analyzed)).toBe(before);
      const a2 = germanSyntax(tokens, de.analyze(de.tokenize(text)));
      expect(JSON.stringify(a2)).toBe(JSON.stringify(a1));
    }
  });

  it('twenty words take well under 2 ms', () => {
    const p = parse('Ich habe heute Morgen mit meiner Schwester in der Küche gesessen, und wir haben Kaffee getrunken, weil es draußen sehr kalt war.');
    const words = p.tokens.filter((t) => t.isWord).length;
    expect(words).toBeGreaterThanOrEqual(20);
    de.syntax!(p.tokens, p.analyzed);
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) de.syntax!(p.tokens, p.analyzed);
    expect((performance.now() - t0) / 200).toBeLessThan(2);
  });

  it('the corpus and gold sentences are attached to a measured share (97 % of the word tokens; floor 95 %)', () => {
    let words = 0;
    let got = 0;
    for (const text of texts) {
      const p = parse(text);
      const w = p.tokens.filter((t) => t.isWord).length;
      words += w;
      got += Math.round(p.a.attached * w);
    }
    expect(got / words).toBeGreaterThan(0.95);
  });
});

describe('German syntax: measured floors against the hand-labelled gold files (AI-judged, unreviewed)', () => {
  const root = path.resolve(__dirname, '../..');
  interface Gold { text: string; tokens: string[]; heads: number[]; relations: string[] }
  const score = (file: string) => {
    const gold = JSON.parse(fs.readFileSync(path.join(root, 'data/gold/de', file), 'utf8')) as { sentences: Gold[] };
    let total = 0, uas = 0, las = 0;
    for (const g of gold.sentences) {
      const p = parse(g.text);
      const wordIdx = p.tokens.map((t, i) => (t.isWord ? i : -1)).filter((i) => i >= 0);
      expect(wordIdx.map((i) => p.tokens[i].surface), g.text).toEqual(g.tokens);
      const pos = new Map<number, number>();
      wordIdx.forEach((ti, k) => pos.set(ti, k));
      wordIdx.forEach((ti, k) => {
        total++;
        const r = relationOf(p.a, ti);
        const head = r ? (r.head === undefined ? -1 : pos.get(r.head) ?? -2) : undefined;
        if (r && head === g.heads[k]) { uas++; if (r.relation === g.relations[k]) las++; }
      });
    }
    return { sentences: gold.sentences.length, total, uas: uas / total, las: las / total };
  };

  // Measured 2026-10-10 on the final rules: dev 99.8 / 99.8, held-out 99.6 / 99.3, unseen 99.1 / 98.2 (UAS / LAS).
  // The dev set was used while writing the rules; the held-out and unseen sets were labelled blind and scored once BEFORE the
  // faults they showed were fixed (first run: held-out 89.3 / 87.4, unseen 96.1 / 94.3), so only those first-run numbers are
  // estimates for new text; the floors below guard the final rules against regression.
  it('dev set: at least 40 sentences', () => {
    const r = score('syntax-dev.json');
    expect(r.sentences).toBeGreaterThanOrEqual(40);
    expect(r.uas).toBeGreaterThan(0.98);
    expect(r.las).toBeGreaterThan(0.98);
  });
  it('held-out set (labelled blind, then used to fix generic faults)', () => {
    const r = score('syntax-heldout.json');
    expect(r.sentences).toBeGreaterThanOrEqual(25);
    expect(r.uas).toBeGreaterThan(0.97);
    expect(r.las).toBeGreaterThan(0.96);
  });
  it('unseen set (labelled blind; four generic faults fixed after the first run)', () => {
    const r = score('syntax-unseen.json');
    expect(r.sentences).toBeGreaterThanOrEqual(25);
    expect(r.uas).toBeGreaterThan(0.96);
    expect(r.las).toBeGreaterThan(0.95);
  });
});

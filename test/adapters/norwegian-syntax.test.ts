/**
 * Norwegian contextual syntax (Linguistic Engine V2, Stage 4): src/adapters/norwegian/syntax.ts, Bokmål and Nynorsk.
 *
 * MACHINE-DRAFTED rules, tested against hand-labelled sentences that no native speaker has seen. The floors in the last block are
 * MEASURED on 2026-10-10 (scripts/probe-syntax-no.mts), not targets; the held-out files were labelled after the rules were tuned on
 * the dev files and scored once before any rule was changed for them (docs/ecosystem/linguistics/SYNTAX-nb-nn.md).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { LanguageCode } from '../../src/core';
import { dependentsOf, relationOf, type SyntaxAnalysis, type SyntaxRelation } from '../../src/core/syntax';
import { adapter } from './helpers';

function parse(lang: 'nb' | 'nn', text: string): { a: SyntaxAnalysis; words: string[]; rel: (surface: string, nth?: number) => (SyntaxRelation & { headSurface?: string }) | undefined; idx: (surface: string, nth?: number) => number } {
  const ad = adapter(lang as LanguageCode);
  const tokens = ad.tokenize(text);
  const analyses = ad.analyze(tokens);
  const a = ad.syntax!(tokens, analyses)!;
  const idx = (surface: string, nth = 0): number => {
    let seen = 0;
    for (let i = 0; i < tokens.length; i++) if (tokens[i].surface === surface && seen++ === nth) return i;
    throw new Error(`no token "${surface}" in "${text}"`);
  };
  return { a, words: tokens.map((t) => t.surface), rel: (s, nth = 0) => relationOf(a, idx(s, nth)), idx };
}

describe('Norwegian syntax: the adapter offers it for both standards', () => {
  it('nb and nn have a syntax method, and the analysis names its language and analyzer', () => {
    for (const lang of ['nb', 'nn'] as const) {
      expect(typeof adapter(lang).syntax).toBe('function');
      const p = parse(lang, lang === 'nb' ? 'Jeg elsker Gud.' : 'Eg elskar Gud.');
      expect(p.a.languageId).toBe(lang);
      expect(p.a.analyzer).toContain(`adapter-${lang}@`);
      expect(p.a.tokens).toEqual(p.words);
    }
  });
});

describe('Norwegian syntax (Bokmål)', () => {
  it('verb second: the subject follows the verb after a fronted adverb, and the object follows the subject', () => {
    const p = parse('nb', 'Nå forstår jeg det også.');
    expect(p.rel('forstår')?.relation).toBe('root');
    expect(p.rel('jeg')).toMatchObject({ relation: 'nsubj', headSurface: 'forstår' });
    expect(p.rel('Nå')).toMatchObject({ relation: 'advmod', headSurface: 'forstår' });
    expect(p.rel('det')).toMatchObject({ relation: 'obj', headSurface: 'forstår' });
    expect(p.rel('jeg')?.basis.join(' ')).toMatch(/subject-case pronoun/);
  });

  it('a subordinate clause has the adverb before the verb: ikke belongs to kommer, at is its mark, the clause is a ccomp', () => {
    const p = parse('nb', 'Jeg vet at han ikke kommer.');
    expect(p.rel('at')).toMatchObject({ relation: 'mark', headSurface: 'kommer' });
    expect(p.rel('han')).toMatchObject({ relation: 'nsubj', headSurface: 'kommer' });
    expect(p.rel('ikke')).toMatchObject({ relation: 'advmod', headSurface: 'kommer' });
    expect(p.rel('kommer')).toMatchObject({ relation: 'ccomp', headSurface: 'vet' });
    expect(p.a.clauses?.some((c) => c.kind === 'subordinate' && c.marker === p.idx('at'))).toBe(true);
  });

  it('a fronted subordinate clause: the main verb comes right after it, the subject follows the verb', () => {
    const p = parse('nb', 'Når jeg er trøtt, sover jeg.');
    expect(p.rel('sover')?.relation).toBe('root');
    expect(p.rel('trøtt')).toMatchObject({ relation: 'advcl', headSurface: 'sover' });
    expect(p.rel('Når')).toMatchObject({ relation: 'mark', headSurface: 'trøtt' });
    expect(p.rel('er')).toMatchObject({ relation: 'cop', headSurface: 'trøtt' });
    expect(p.rel('jeg', 1)).toMatchObject({ relation: 'nsubj', headSurface: 'sover' });
  });

  it('pronoun case decides what the position cannot: a fronted object, an object-case pronoun before the verb', () => {
    const a = parse('nb', 'Det forstår jeg ikke.');
    expect(a.rel('Det')).toMatchObject({ relation: 'obj', headSurface: 'forstår' });
    expect(a.rel('jeg')).toMatchObject({ relation: 'nsubj', headSurface: 'forstår' });
    expect(a.rel('Det')?.alternatives).toBeUndefined();
    const b = parse('nb', 'Meg ser han ikke.');
    expect(b.rel('Meg')).toMatchObject({ relation: 'obj', headSurface: 'ser' });
    expect(b.rel('han')).toMatchObject({ relation: 'nsubj', headSurface: 'ser' });
  });

  it('double definiteness: den + adjective + a noun with the definite ending; the basis says so', () => {
    const p = parse('nb', 'Jeg ser den store boka.');
    expect(p.rel('den')).toMatchObject({ relation: 'det', headSurface: 'boka' });
    expect(p.rel('den')?.basis.join(' ')).toMatch(/double definiteness/);
    expect(p.rel('store')).toMatchObject({ relation: 'amod', headSurface: 'boka' });
    expect(p.rel('boka')).toMatchObject({ relation: 'obj', headSurface: 'ser' });
  });

  it('article agreement is checked, and a clash lowers the confidence and says so', () => {
    const ok = parse('nb', 'Vi bor i et lite hus.');
    expect(ok.rel('et')).toMatchObject({ relation: 'det', headSurface: 'hus' });
    expect(ok.rel('et')?.basis.join(' ')).toMatch(/agrees/);
    const bad = parse('nb', 'Vi bor i en lite hus.');
    expect(bad.rel('en')?.relation).toBe('det');
    expect(bad.rel('en')?.basis.join(' ')).toMatch(/does not agree/);
    expect(bad.rel('en')!.confidence).toBeLessThan(ok.rel('et')!.confidence);
  });

  it('the postposed possessive hangs on its noun (synden min)', () => {
    const p = parse('nb', 'Gud tilga synden min.');
    expect(p.rel('min')).toMatchObject({ relation: 'det', headSurface: 'synden' });
    expect(p.rel('synden')).toMatchObject({ relation: 'obj', headSurface: 'tilga' });
  });

  it('auxiliary chains: perfect, modal + infinitive, and å + infinitive', () => {
    const a = parse('nb', 'Hun har ikke sett ham.');
    expect(a.rel('sett')?.relation).toBe('root');
    expect(a.rel('har')).toMatchObject({ relation: 'aux', headSurface: 'sett' });
    expect(a.rel('ikke')).toMatchObject({ relation: 'advmod', headSurface: 'sett' });
    const b = parse('nb', 'Vi må kjøpe brød og melk i butikken.');
    expect(b.rel('må')).toMatchObject({ relation: 'aux', headSurface: 'kjøpe' });
    expect(b.rel('kjøpe')?.relation).toBe('root');
    const c = parse('nb', 'Jeg har også begynt å forstå det.');
    expect(c.rel('begynt')?.relation).toBe('root');
    expect(c.rel('å')).toMatchObject({ relation: 'mark', headSurface: 'forstå' });
    expect(c.rel('forstå')).toMatchObject({ relation: 'xcomp', headSurface: 'begynt' });
    expect(c.rel('det')).toMatchObject({ relation: 'obj', headSurface: 'forstå' });
  });

  it('a som-clause describes the noun before it: acl, and som is the mark of its verb; the copula takes the predicate noun', () => {
    const p = parse('nb', 'Mannen som står der er min far.');
    expect(p.rel('står')).toMatchObject({ relation: 'acl', headSurface: 'Mannen' });
    expect(p.rel('som')).toMatchObject({ relation: 'mark', headSurface: 'står' });
    expect(p.rel('far')?.relation).toBe('root');
    expect(p.rel('er')).toMatchObject({ relation: 'cop', headSurface: 'far' });
    expect(p.rel('Mannen')).toMatchObject({ relation: 'nsubj', headSurface: 'far' });
    expect(p.a.clauses?.some((c) => c.kind === 'relative')).toBe(true);
  });

  it('a relative clause without som, with its own subject, is an acl of the noun before it', () => {
    const p = parse('nb', 'Hva er det du ikke forstår?');
    expect(p.rel('forstår')).toMatchObject({ relation: 'acl', headSurface: 'det' });
    expect(p.rel('du')).toMatchObject({ relation: 'nsubj', headSurface: 'forstår' });
    expect(p.rel('Hva')?.relation).toBe('root');
  });

  it('an embedded question: the question adverb belongs to the embedded verb', () => {
    const p = parse('nb', 'Jeg forstår ikke hvorfor Gud tilgir synd.');
    expect(p.rel('hvorfor')).toMatchObject({ relation: 'advmod', headSurface: 'tilgir' });
    expect(p.rel('tilgir')).toMatchObject({ relation: 'ccomp', headSurface: 'forstår' });
    expect(p.rel('ikke')).toMatchObject({ relation: 'advmod', headSurface: 'forstår' });
  });

  it('coordination: two nouns, two adjectives, and two clauses', () => {
    const a = parse('nb', 'Vi kjøper brød og melk.');
    expect(a.rel('melk')).toMatchObject({ relation: 'conj', headSurface: 'brød' });
    expect(a.rel('og')).toMatchObject({ relation: 'cc', headSurface: 'melk' });
    const b = parse('nb', 'Huset er stort og rødt.');
    expect(b.rel('rødt')).toMatchObject({ relation: 'conj', headSurface: 'stort' });
    const c = parse('nb', 'Jeg tror på Gud, og Gud elsker oss.');
    expect(c.rel('elsker')).toMatchObject({ relation: 'conj', headSurface: 'tror' });
    expect(c.rel('og')).toMatchObject({ relation: 'cc', headSurface: 'elsker' });
    expect(c.rel('Gud', 1)).toMatchObject({ relation: 'nsubj', headSurface: 'elsker' });
    expect(c.a.clauses?.map((x) => x.kind)).toContain('coordinate');
  });

  it('what the order cannot decide stays an alternative with its reason: two bare nouns around the verb', () => {
    const p = parse('nb', 'Gud elsker verden.');
    const s = p.rel('Gud')!;
    expect(s.relation).toBe('nsubj');
    expect(s.status).toBe('conflicted');
    expect(s.alternatives?.[0]).toMatchObject({ relation: 'obj' });
    expect(s.alternatives?.[0].why).toMatch(/same form as subject and object/);
    expect(p.rel('verden')).toMatchObject({ relation: 'obj', status: 'conflicted' });
    expect(p.rel('verden')?.alternatives?.[0].relation).toBe('nsubj');
    // a subject-case pronoun decides: no alternative
    const q = parse('nb', 'Jeg elsker Gud.');
    expect(q.rel('Jeg')?.alternatives).toBeUndefined();
    expect(q.rel('Jeg')?.status).toBe('generated');
  });

  it('a prepositional phrase after an object keeps the noun attachment as an alternative', () => {
    const p = parse('nb', 'Nå har jeg fred i hjertet.');
    expect(p.rel('hjertet')).toMatchObject({ relation: 'obl', headSurface: 'har', status: 'conflicted' });
    expect(p.rel('hjertet')?.alternatives?.[0]).toMatchObject({ relation: 'nmod', head: p.idx('fred') });
    expect(p.rel('i')).toMatchObject({ relation: 'case', headSurface: 'hjertet' });
  });

  it('an imperative has no subject; an object pronoun before a noun is the receiver', () => {
    const p = parse('nb', 'Gi meg boka!');
    expect(p.a.relations.some((r) => r.relation === 'nsubj')).toBe(false);
    expect(p.rel('meg')?.relation).toBe('iobj');
    expect(p.rel('boka')?.relation).toBe('obj');
  });

  it('vocative and greeting: a name between commas is the person addressed', () => {
    const p = parse('nb', 'Hei, Anna, hvordan har du det?');
    expect(p.rel('Anna')).toMatchObject({ relation: 'vocative', headSurface: 'har' });
    expect(p.rel('Hei')).toMatchObject({ relation: 'discourse', headSurface: 'har' });
    expect(p.rel('hvordan')).toMatchObject({ relation: 'advmod', headSurface: 'har' });
    // a comma list of nouns is not a row of vocatives
    const l = parse('nb', 'Jeg trenger mel, vann, salt og gjær.');
    expect(l.a.relations.some((r) => r.relation === 'vocative')).toBe(false);
    expect(l.rel('salt')).toMatchObject({ relation: 'conj', headSurface: 'mel' });
  });

  it('a particle verb: the particle and the reflexive pronoun hang on the verb', () => {
    const p = parse('nb', 'Hun tok på seg jakken.');
    expect(p.rel('på')).toMatchObject({ relation: 'compound', headSurface: 'tok' });
    expect(p.rel('seg')).toMatchObject({ relation: 'expl', headSurface: 'tok' });
    expect(p.rel('jakken')).toMatchObject({ relation: 'obj', headSurface: 'tok' });
  });

  it('a time noun with hver is an adverbial, not an object', () => {
    const p = parse('nb', 'Hun drikker kaffe hver dag.');
    expect(p.rel('kaffe')?.relation).toBe('obj');
    expect(p.rel('dag')).toMatchObject({ relation: 'obl', headSurface: 'drikker' });
    expect(p.rel('hver')).toMatchObject({ relation: 'det', headSurface: 'dag' });
  });

  it('several sentences in one selection are read one by one, each with its own root', () => {
    const p = parse('nb', 'Jeg kommer. Du går hjem!');
    expect(p.a.relations.filter((r) => r.relation === 'root').map((r) => p.words[r.dependent])).toEqual(['kommer', 'går']);
    expect(p.rel('hjem')).toMatchObject({ relation: 'advmod', headSurface: 'går' });
    expect(p.a.notes.join(' ')).toMatch(/more than one sentence/);
  });
});

describe('Norwegian syntax (Nynorsk)', () => {
  it('verb second and the subject forms eg / me / ho / dei decide subject and object', () => {
    const p = parse('nn', 'No forstår eg det òg.');
    expect(p.rel('eg')).toMatchObject({ relation: 'nsubj', headSurface: 'forstår' });
    expect(p.rel('det')).toMatchObject({ relation: 'obj', headSurface: 'forstår' });
    const q = parse('nn', 'Det forstår eg ikkje.');
    expect(q.rel('Det')).toMatchObject({ relation: 'obj', headSurface: 'forstår' });
    expect(q.rel('eg')).toMatchObject({ relation: 'nsubj', headSurface: 'forstår' });
  });

  it('subordinate clause: at, ikkje before the verb', () => {
    const p = parse('nn', 'Eg veit at ho ikkje kjem.');
    expect(p.rel('at')).toMatchObject({ relation: 'mark', headSurface: 'kjem' });
    expect(p.rel('ikkje')).toMatchObject({ relation: 'advmod', headSurface: 'kjem' });
    expect(p.rel('kjem')).toMatchObject({ relation: 'ccomp', headSurface: 'veit' });
  });

  it('double definiteness and agreement in Nynorsk: det gamle huset', () => {
    const p = parse('nn', 'Det gamle huset er stort.');
    expect(p.rel('Det')).toMatchObject({ relation: 'det', headSurface: 'huset' });
    expect(p.rel('Det')?.basis.join(' ')).toMatch(/double definiteness/);
    expect(p.rel('gamle')).toMatchObject({ relation: 'amod', headSurface: 'huset' });
    expect(p.rel('stort')?.relation).toBe('root');
    expect(p.rel('er')?.relation).toBe('cop');
  });

  it('the postposed possessive and the perfect with å + infinitive', () => {
    const p = parse('nn', 'Eg har òg byrja å forstå synda mi.');
    expect(p.rel('mi')).toMatchObject({ relation: 'det', headSurface: 'synda' });
    expect(p.rel('forstå')).toMatchObject({ relation: 'xcomp', headSurface: 'byrja' });
    expect(p.rel('har')).toMatchObject({ relation: 'aux', headSurface: 'byrja' });
  });

  it('relative clause without som and an embedded question in Nynorsk', () => {
    const p = parse('nn', 'Kva er det du ikkje forstår?');
    expect(p.rel('forstår')).toMatchObject({ relation: 'acl', headSurface: 'det' });
    const q = parse('nn', 'Eg forstår ikkje kvifor Gud tilgir synd.');
    expect(q.rel('kvifor')).toMatchObject({ relation: 'advmod', headSurface: 'tilgir' });
    expect(q.rel('tilgir')).toMatchObject({ relation: 'ccomp', headSurface: 'forstår' });
  });

  it('a fronted conditional clause with so in the main clause (so = then, an adverb)', () => {
    const p = parse('nn', 'Dersom me segjer at me ikkje hev synd, so dårar me oss sjølve.');
    expect(p.rel('dårar')?.relation).toBe('root');
    expect(p.rel('segjer')).toMatchObject({ relation: 'advcl', headSurface: 'dårar' });
    expect(p.rel('hev')).toMatchObject({ relation: 'ccomp', headSurface: 'segjer' });
    expect(p.rel('so')).toMatchObject({ relation: 'advmod', headSurface: 'dårar' });
    expect(p.rel('sjølve')).toMatchObject({ relation: 'appos', headSurface: 'oss' });
  });

  it('plural article + adjective + definite plural noun, and a bare noun pair keeps its alternative', () => {
    const p = parse('nn', 'Dei små borna søv.');
    expect(p.rel('Dei')).toMatchObject({ relation: 'det', headSurface: 'borna' });
    expect(p.rel('små')).toMatchObject({ relation: 'amod', headSurface: 'borna' });
    expect(p.rel('borna')).toMatchObject({ relation: 'nsubj', headSurface: 'søv' });
    const q = parse('nn', 'Gud elskar verda.');
    expect(q.rel('Gud')?.status).toBe('conflicted');
  });
});

describe('Norwegian syntax: honesty', () => {
  it('a word the word list does not know gets no relation, is nobody’s head, and the notes say so', () => {
    const p = parse('nb', 'Gud elsker zxqvblorf kumpadassi.');
    for (const w of ['zxqvblorf', 'kumpadassi']) {
      expect(p.rel(w)).toBeUndefined();
      expect(p.a.relations.some((r) => r.head === p.idx(w))).toBe(false);
      expect(p.a.notes.join(' ')).toContain(w);
    }
    expect(p.a.attached).toBeLessThan(1);
    expect(p.rel('elsker')?.relation).toBe('root');
  });

  it('a verb the word list does not know is not invented as the root; the first phrase is, at half confidence', () => {
    const p = parse('nb', 'Hunden bjeffer.');
    expect(p.rel('bjeffer')).toBeUndefined();
    expect(p.rel('Hunden')).toMatchObject({ relation: 'root', confidence: 0.5 });
  });

  it('every relation has a basis, a label and a confidence in [0, 1]; attached counts only word tokens; the result is deterministic', () => {
    const texts = ['Dersom vi sier at vi ikke har synd, da dårer vi oss selv, og sannheten er ikke i oss;', 'Hva heter du?', 'Han tilga meg mine synder.', 'Jeg ba, og Gud svarte på bønnen min.', '', '...', 'å'];
    for (const t of texts) {
      const a = parse('nb', t);
      const b = parse('nb', t);
      expect(JSON.stringify(a.a)).toBe(JSON.stringify(b.a));
      for (const r of a.a.relations) {
        expect(r.basis.length).toBeGreaterThan(0);
        expect(r.basis.every((x) => x.length > 0)).toBe(true);
        expect(r.label.length).toBeGreaterThan(0);
        expect(r.confidence).toBeGreaterThanOrEqual(0);
        expect(r.confidence).toBeLessThanOrEqual(1);
        expect(r.dependent).not.toBe(r.head);
      }
      expect(a.a.attached).toBeGreaterThanOrEqual(0);
      expect(a.a.attached).toBeLessThanOrEqual(1);
    }
    const q = parse('nn', 'Takk, Per!');
    expect(q.a.relations.filter((r) => r.relation === 'punct').length).toBe(2);
    expect(q.a.attached).toBe(1);
  });

  it('the head chain of every word reaches a root (no cycles), on all the gold and corpus sentences', () => {
    for (const lang of ['nb', 'nn'] as const) {
      for (const t of goldSentences(lang).map((g) => g.text)) {
        const { a } = parse(lang, t);
        const byDep = new Map(a.relations.map((r) => [r.dependent, r]));
        for (const r of a.relations) {
          let h = r.head;
          let steps = 0;
          while (h !== undefined && steps++ < 200) h = byDep.get(h)?.head;
          expect(steps, t).toBeLessThan(200);
        }
        expect(a.relations.filter((r) => r.relation === 'root').length, t).toBeLessThanOrEqual(1);
      }
    }
  });

  it('the innermost clause comes first, so a lookup by token finds the subordinate clause for a word inside it', () => {
    const p = parse('nb', 'Jeg vet at han ikke kommer.');
    const i = p.idx('kommer');
    const hit = p.a.clauses!.find((c) => i >= c.start && i <= c.end)!;
    expect(hit.kind).toBe('subordinate');
    expect(dependentsOf(p.a, i).map((r) => p.words[r.dependent])).toEqual(['at', 'han', 'ikke']);
  });

  it('runs in well under 2 ms for a 20-word sentence', () => {
    const ad = adapter('nb' as LanguageCode);
    const text = 'Dersom vi sier at vi ikke har synd, da dårer vi oss selv, og sannheten er ikke i oss.';
    const tokens = ad.tokenize(text);
    const analyses = ad.analyze(tokens);
    ad.syntax!(tokens, analyses);
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) ad.syntax!(tokens, analyses);
    expect((performance.now() - t0) / 100).toBeLessThan(2);
  });
});

// ───────────────────────────── gold floors ─────────────────────────────

interface Gold { text: string; tokens: string[]; heads: number[]; relations: string[] }
const goldPath = (lang: string, file: string): string => path.join(process.cwd(), 'data', 'gold', lang, file);
const loadGold = (lang: string, file: string): Gold[] => JSON.parse(fs.readFileSync(goldPath(lang, file), 'utf8')).sentences as Gold[];
function goldSentences(lang: 'nb' | 'nn'): Gold[] {
  return [...loadGold(lang, 'syntax-dev.json'), ...loadGold(lang, 'syntax-heldout.json')];
}

function score(lang: 'nb' | 'nn', gold: Gold[]): { words: number; uas: number; las: number } {
  const ad = adapter(lang as LanguageCode);
  let words = 0; let uas = 0; let las = 0;
  for (const g of gold) {
    const tokens = ad.tokenize(g.text);
    const a = ad.syntax!(tokens, ad.analyze(tokens))!;
    const wordIdx = tokens.map((t, i) => (t.isWord ? i : -1)).filter((i) => i >= 0);
    expect(wordIdx.map((i) => tokens[i].surface), g.text).toEqual(g.tokens);
    const no = new Map(wordIdx.map((ti, k) => [ti, k + 1]));
    const byDep = new Map(a.relations.map((r) => [r.dependent, r]));
    g.tokens.forEach((_f, k) => {
      words++;
      const r = byDep.get(wordIdx[k]);
      const head = r ? (r.head === undefined ? 0 : no.get(r.head) ?? -1) : -2;
      if (head === g.heads[k]) { uas++; if (r?.relation === g.relations[k]) las++; }
    });
  }
  return { words, uas: uas / words, las: las / words };
}

describe('Norwegian syntax: the gold files (AI-labelled, unreviewed, no native speaker)', () => {
  it('the gold files are well-formed: at least 30 sentences, heads inside the sentence, one root, UD labels', () => {
    for (const lang of ['nb', 'nn'] as const) {
      const doc = JSON.parse(fs.readFileSync(goldPath(lang, 'syntax-dev.json'), 'utf8'));
      expect(doc.language).toBe(lang);
      expect(doc.labelled_by).toBe('Claude (AI-judged, unreviewed; no native speaker)');
      expect(doc.created).toBe('2026-10-10');
      expect(doc.sentences.length).toBeGreaterThanOrEqual(30);
      for (const g of [...doc.sentences, ...loadGold(lang, 'syntax-heldout.json')] as Gold[]) {
        expect(g.tokens.length).toBe(g.heads.length);
        expect(g.tokens.length).toBe(g.relations.length);
        expect(g.heads.filter((h) => h === 0).length, g.text).toBe(1);
        expect(g.heads.every((h) => h >= 0 && h <= g.tokens.length)).toBe(true);
        expect(g.relations.every((r) => /^[a-z]+$/.test(r))).toBe(true);
      }
    }
  });

  // floors = the numbers measured on 2026-10-10 by scripts/probe-syntax-no.mts, rounded down to the next half point
  const FLOORS: Array<['nb' | 'nn', string, number, number]> = [
    ['nb', 'syntax-dev.json', 0.99, 0.99],
    ['nb', 'syntax-heldout.json', 0.97, 0.97],
    ['nn', 'syntax-dev.json', 0.96, 0.95],
    ['nn', 'syntax-heldout.json', 0.93, 0.92],
  ];
  for (const [lang, file, uasFloor, lasFloor] of FLOORS) {
    it(`${lang} ${file}: UAS >= ${uasFloor}, LAS >= ${lasFloor}`, () => {
      const s = score(lang, loadGold(lang, file));
      expect(s.uas).toBeGreaterThanOrEqual(uasFloor);
      expect(s.las).toBeGreaterThanOrEqual(lasFloor);
    });
  }

  it('the attached share on the course corpus is at least the measured 0.97 (nb 1.00, nn 0.97)', () => {
    for (const [lang, floor] of [['nb', 0.99], ['nn', 0.97]] as const) {
      const ad = adapter(lang as LanguageCode);
      let words = 0; let attached = 0;
      for (const f of ['story-01', 'dialogue-01', 'bible-1john-1']) {
        const j = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'corpus', lang, `${f}.json`), 'utf8'));
        for (const s of j.sections) for (const para of s.paragraphs) for (const x of para.sentences) {
          const tokens = ad.tokenize(x.text);
          const a = ad.syntax!(tokens, ad.analyze(tokens))!;
          const w = tokens.filter((t) => t.isWord).length;
          words += w; attached += a.attached * w;
        }
      }
      expect(attached / words, lang).toBeGreaterThanOrEqual(floor);
    }
  });
});

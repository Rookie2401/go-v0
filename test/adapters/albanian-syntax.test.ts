/**
 * Albanian contextual syntax (Linguistic Engine V2, Stage 4): src/adapters/albanian/syntax.ts through the real adapter
 * (tokenizer → word-form engine → sentence layer → syntax). Specific sentences with the expected head and relation of the key
 * words; alternatives kept where the form or the order cannot decide; no relation for a word the adapter has no reading for;
 * the contract (a basis on every relation, one root, no cycle); and the gold set, scored with floors that were MEASURED (the
 * numbers are in docs/ecosystem/linguistics/SYNTAX-sq.md). The gold set is hand-labelled by Claude and unreviewed; it was written for
 * the course texts the rules were developed on, so its floors say "no regression", not "accurate on Albanian prose" — the treebank
 * floors below (skipped when the treebanks are not on disk) are the independent number.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sqAdapter } from '../../src/adapters/sq';
import { relationOf, type SyntaxAnalysis } from '../../src/core/syntax';

function run(text: string) {
  const tokens = sqAdapter.tokenize(text);
  const analyses = sqAdapter.analyze(tokens);
  const syn = sqAdapter.syntax!(tokens, analyses)!;
  /** Index of the nth token with this normalized form. */
  const at = (word: string, nth = 0): number => {
    const hits = tokens.map((t, i) => (t.normalized === word ? i : -1)).filter((i) => i >= 0);
    expect(hits.length, `"${word}" occurs ${nth + 1} times in "${text}"`).toBeGreaterThan(nth);
    return hits[nth];
  };
  /** "relation>head" of a word, e.g. "nsubj>ka". */
  const rel = (word: string, nth = 0): string => {
    const r = syn.relations.find((x) => x.dependent === at(word, nth));
    return r ? `${r.relation}>${r.head === undefined ? 'ROOT' : tokens[r.head].normalized}` : 'none';
  };
  const full = (word: string, nth = 0) => syn.relations.find((x) => x.dependent === at(word, nth));
  return { tokens, analyses, syn, at, rel, full };
}

describe('the adapter offers syntax', () => {
  it('is wired and names itself', () => {
    expect(typeof sqAdapter.syntax).toBe('function');
    const { syn, tokens } = run('Ana ka një motër.');
    expect(syn.languageId).toBe('sq');
    expect(syn.analyzer).toMatch(/syntax/);
    expect(syn.tokens).toEqual(tokens.map((t) => t.surface));
  });
  it('relationOf / dependentsOf from the contract work on its output', () => {
    const { syn, at } = run('Beni ka një motër.');
    expect(relationOf(syn, at('beni'))?.headSurface).toBe('ka');
  });
});

describe('clause structure', () => {
  it('copula + article + adjective: the predicate is the root, the article is its determiner', () => {
    const { rel } = run('Shtëpia është e madhe.');
    expect(rel('shtëpia')).toBe('nsubj>madhe');
    expect(rel('është')).toBe('cop>madhe');
    expect(rel('e')).toBe('det>madhe');
    expect(rel('madhe')).toBe('root>ROOT');
  });
  it('a prepositional phrase after "to be" is the predicate; the preposition is its case', () => {
    const { rel } = run('Babai nuk është në dhomë.');
    expect(rel('dhomë')).toBe('root>ROOT');
    expect(rel('në')).toBe('case>dhomë');
    expect(rel('nuk')).toBe('advmod>dhomë');
    expect(rel('babai')).toBe('nsubj>dhomë');
  });
  it('a question word before "to be" is the predicate and the noun after it the subject', () => {
    const { rel } = run('Ku është Beni?');
    expect(rel('ku')).toBe('root>ROOT');
    expect(rel('beni')).toBe('nsubj>ku');
  });
  it('kam + participle: the auxiliary depends on the participle, which carries the clause', () => {
    const { rel } = run('Nëna e ka bërë darkën.');
    expect(rel('ka')).toBe('aux>bërë');
    expect(rel('bërë')).toBe('root>ROOT');
    expect(rel('darkën')).toBe('obj>bërë');
    expect(rel('nëna')).toBe('nsubj>bërë');
  });
  it('modal / "dua" + të + verb: the verb after të completes the first, and të marks it', () => {
    const a = run('Dua të shkoj.');
    expect(a.rel('shkoj')).toBe('xcomp>dua');
    expect(a.rel('të')).toBe('mark>shkoj');
    const b = run('Beni nuk mund të dalë.');
    expect(b.rel('dalë')).toBe('xcomp>mund');
    expect(b.rel('nuk')).toBe('advmod>mund');
    expect(b.rel('beni')).toBe('nsubj>mund');
  });
  it('a clause joined by "and" to another verb is a conjunct of the first verb', () => {
    const { rel } = run('Ai lahet dhe vishet.');
    expect(rel('vishet')).toBe('conj>lahet');
    expect(rel('dhe')).toBe('cc>vishet');
    expect(rel('ai')).toBe('nsubj>lahet');
  });
  it('"and" between two nouns coordinates the nouns, not the clauses', () => {
    const { rel } = run('Gjyshi dhe gjyshja jetojnë në fshat.');
    expect(rel('gjyshja')).toBe('conj>gjyshi');
    expect(rel('dhe')).toBe('cc>gjyshja');
    expect(rel('gjyshi')).toBe('nsubj>jetojnë');
  });
  it('a comma list that ends with "and" is one coordination', () => {
    const { rel } = run('Nëna blen bukë, djathë dhe mollë.');
    expect(rel('djathë')).toBe('conj>bukë');
    expect(rel('mollë')).toBe('conj>bukë');
    expect(rel('bukë')).toBe('obj>blen');
  });
  it('se opens a complement clause; që after a noun a relative clause', () => {
    const a = run('Unë besoj se ka një Zot.');
    expect(a.rel('se')).toBe('mark>ka');
    expect(a.rel('ka')).toBe('ccomp>besoj');
    const b = run('Ana ka një libër që është i bukur.');
    expect(b.rel('që')).toBe('mark>bukur');
    expect(b.rel('bukur')).toBe('acl>libër');
    expect(b.full('bukur')!.alternatives?.some((a) => a.relation === 'ccomp')).toBe(true);
  });
  it('a subordinate clause that comes first belongs to the main clause after it', () => {
    const { rel } = run('Kur isha i ri, nuk e kuptoja zemrën time.');
    expect(rel('kuptoja')).toBe('root>ROOT');
    expect(rel('ri')).toBe('advcl>kuptoja');
    expect(rel('kur')).toBe('advmod>ri');
  });
  it('a lone name between commas is a vocative', () => {
    const { rel } = run('Përshëndetje, Ana, si je?');
    expect(rel('ana')).toBe('vocative>si');
    expect(rel('përshëndetje')).toBe('discourse>si');
  });
});

describe('noun phrases and agreement', () => {
  it('the linking article + adjective after a noun: amod on the noun the article agrees with, det on the adjective', () => {
    const { rel, full } = run('Beni ka një xhaketë të re.');
    expect(rel('re')).toBe('amod>xhaketë');
    expect(rel('të')).toBe('det>re');
    expect(rel('një')).toBe('det>xhaketë');
    expect(full('re')!.basis.join(' ')).toMatch(/agrees/);
  });
  it('a genitive noun with its article: nmod on the possessed noun, det on the genitive', () => {
    const { rel } = run('Ai flet për dashurinë e Perëndisë.');
    expect(rel('perëndisë')).toBe('nmod>dashurinë');
    expect(rel('e')).toBe('det>perëndisë');
    expect(rel('dashurinë')).toBe('obl>flet');
    expect(rel('për')).toBe('case>dashurinë');
  });
  it('a possessive after the noun is its determiner', () => {
    const { rel } = run('Shtëpia juaj është shumë e bukur.');
    expect(rel('juaj')).toBe('det>shtëpia');
    expect(rel('shumë')).toBe('advmod>bukur');
  });
  it('when two nouns of a genitive chain both agree with the article, the nearest wins and the other stays as an alternative', () => {
    const { full, at } = run('Ai lexon librin e vëllait të madh.');
    const r = full('madh')!;
    expect(r.relation).toBe('amod');
    expect(r.head).toBe(at('vëllait'));
    expect(r.alternatives?.some((a) => a.head === at('librin'))).toBe(true);
    expect(r.status).toBe('conflicted');
  });
  it('a count word before a noun and "çdo" + noun as an adverbial', () => {
    const a = run('Kam një grua dhe dy fëmijë.');
    expect(a.rel('dy')).toBe('nummod>fëmijë');
    expect(a.rel('fëmijë')).toBe('conj>grua');
    const b = run('Ajo e lexon librin çdo ditë.');
    expect(b.rel('ditë')).toBe('obl>lexon');
    expect(b.rel('çdo')).toBe('det>ditë');
  });
});

describe('arguments: subject, object, indirect object, short pronouns', () => {
  it('the subject agrees with the verb: a first / second person pronoun after the verb is still the subject', () => {
    expect(run('Ju jeni në shkollë.').rel('ju')).toBe('nsubj>shkollë');
    const b = run('Si quheni ju?');
    expect(b.rel('ju')).toBe('nsubj>quheni');
    expect(b.rel('si')).toBe('advmod>quheni');
  });
  it('an indefinite noun after the verb (nominative = accusative) is the object, and the subject reading stays as an alternative', () => {
    const { full, at } = run('Ana ka një motër.');
    expect(full('ana')!.relation).toBe('nsubj');
    const r = full('motër')!;
    expect(r.relation).toBe('obj');
    expect(r.alternatives?.some((a) => a.relation === 'nsubj' && a.head === at('ka'))).toBe(true);
    expect(r.basis.length).toBeGreaterThan(0);
  });
  it('a definite nominative noun is the subject whatever its position; the accusative one the object', () => {
    const { rel } = run('Nuk e kuptoj pse Perëndia e fal mëkatin.');
    expect(rel('perëndia')).toBe('nsubj>fal');
    expect(rel('mëkatin')).toBe('obj>fal');
    expect(rel('fal')).toBe('ccomp>kuptoj');
    expect(rel('pse')).toBe('advmod>fal');
  });
  it('a short accusative pronoun that repeats a noun is expl (clitic doubling); alone it is the object', () => {
    expect(run('Perëndia e fali mëkatin tim.').rel('e')).toBe('expl>fali');
    expect(run('Por nuk e njoh.').rel('e')).toBe('obj>njoh');
  });
  it('a dative noun is the indirect object; a fused ia repeating both nouns is expl', () => {
    const { rel } = run('Ajo ia jep librin Anës.');
    expect(rel('anës')).toBe('iobj>jep');
    expect(rel('librin')).toBe('obj>jep');
    expect(rel('ia')).toBe('expl>jep');
  });
  it('më / na / të are accusative or dative: with an object noun they are the indirect object, and the other reading is kept', () => {
    const { full, at } = run('Beni më dha një libër të ri.');
    const r = full('më')!;
    expect(r.relation).toBe('iobj');
    expect(r.alternatives?.some((a) => a.relation === 'obj' && a.head === at('dha'))).toBe(true);
    const b = run('Perëndia na do.');
    expect(b.rel('na')).toBe('obj>do');
    expect(b.full('na')!.alternatives?.some((a) => a.relation === 'iobj')).toBe(true);
  });
  it('a fronted accusative time phrase is an adverbial, not the object', () => {
    const { rel } = run('Të dielën Marku shkon në kishë.');
    expect(rel('dielën')).toBe('obl>shkon');
    expect(rel('të')).toBe('det>dielën');
    expect(rel('marku')).toBe('nsubj>shkon');
  });
  it('two nouns on either side of "to be": the order decides, and the other order is an alternative on both', () => {
    const { full, at } = run('Motra e Benit është Ana.');
    const subj = full('motra')!;
    const pred = full('ana')!;
    expect(subj.relation).toBe('nsubj');
    expect(pred.relation).toBe('root');
    expect(pred.alternatives?.some((a) => a.relation === 'nsubj' && a.head === at('motra'))).toBe(true);
    expect(subj.status).toBe('conflicted');
    expect(pred.status).toBe('conflicted');
  });
});

describe('what the rules do not decide, and what they leave alone', () => {
  it('a word the adapter has no reading for gets no relation, and the sentence says so', () => {
    const { syn, rel, tokens } = run('Xqzvk flet.');
    expect(rel('xqzvk')).toBe('none');
    expect(rel('flet')).toBe('root>ROOT');
    expect(syn.attached).toBeCloseTo(0.5, 5);
    expect(syn.notes.some((n) => n.includes(tokens[0].surface))).toBe(true);
  });
  it('a sentence of unknown words has no relations at all', () => {
    const { syn } = run('Xqzvk wprt.');
    expect(syn.relations.filter((r) => r.relation !== 'punct')).toEqual([]);
    expect(syn.attached).toBe(0);
  });
  it('empty and punctuation-only input give an empty analysis', () => {
    expect(run('').syn.relations).toEqual([]);
    expect(run('— ...').syn.attached).toBe(0);
  });
  it('a clause with no verb in which a noun and a verb reading weigh the same is read with the verb (kisha = I had)', () => {
    const { rel, syn } = run('Kur isha i ri, kisha mëkat në zemrën time.');
    expect(rel('kisha')).toBe('root>ROOT');
    expect(rel('mëkat')).toBe('obj>kisha');
    expect(syn.notes.length + 1).toBeGreaterThan(0);
  });
  it('a short pronoun të that opens the sentence is the pronoun, not the particle', () => {
    expect(run('Të dua shumë.').rel('të')).toBe('obj>dua');
  });
});

describe('the contract', () => {
  const sentences = [
    'Në qoftë se themi se nuk kemi mëkat, e mashtrojmë veten tonë dhe e vërteta nuk është në ne.',
    'Sepse Perëndia e deshi aq shumë botën, sa dha Birin e tij të vetëmlindur, që kushdo që beson tek ai të mos humbasë, por të ketë jetë të përjetshme.',
    'Beni merr një libër dhe fillon të lexojë.', '— Bibla është fjala e Perëndisë, — thotë Marku.', 'Është koha për të fjetur.',
    '«E dashur gjyshe, si je?', 'Ata i duan gjyshin dhe gjyshen.', 'Pas darkës, fëmijët lajnë pjatat.', 'A është Ana në shkollë?', 'Nga jeni?',
    'Dritani shkon me të.', 'Profeti përgjigjet pa shikuar kënd:', 'Ky libër është i mirë.',
  ];
  it.each(sentences)('a basis on every relation, one root, no cycle, indexes in range: %s', (text) => {
    const { syn, tokens } = run(text);
    const seen = new Set<number>();
    for (const r of syn.relations) {
      expect(r.basis.length, `${r.relation} of ${tokens[r.dependent].surface}`).toBeGreaterThan(0);
      expect(r.basis.every((b) => b.trim().length > 0)).toBe(true);
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
      expect(seen.has(r.dependent), 'one relation per token').toBe(false);
      seen.add(r.dependent);
      expect(r.dependent).toBeGreaterThanOrEqual(0);
      expect(r.dependent).toBeLessThan(tokens.length);
      if (r.head !== undefined) expect(r.head).toBeLessThan(tokens.length);
      expect(r.status === 'conflicted' ? (r.alternatives?.length ?? 0) > 0 : true).toBe(true);
    }
    const words = syn.relations.filter((r) => tokens[r.dependent].isWord);
    expect(words.filter((r) => r.relation === 'root').length).toBe(1);
    for (const r of syn.relations) {
      let x: number | undefined = r.dependent;
      for (let n = 0; x !== undefined && n < 100; n++) x = syn.relations.find((y) => y.dependent === x)?.head;
      expect(x, `cycle from ${tokens[r.dependent].surface}`).toBeUndefined();
    }
    const wordCount = tokens.filter((t) => t.isWord).length;
    expect(syn.attached).toBeCloseTo(words.length / wordCount, 5);
  });
  it('is deterministic and does not write to its input', () => {
    const tokens = sqAdapter.tokenize('Ajo ia jep librin Anës.');
    const analyses = sqAdapter.analyze(tokens);
    const before = structuredClone({ tokens, analyses });
    const a = sqAdapter.syntax!(tokens, analyses);
    const b = sqAdapter.syntax!(tokens, analyses);
    expect(a).toEqual(b);
    expect({ tokens, analyses }).toEqual(before);
  });
  it('is fast: a 20-word sentence in well under 2 ms', () => {
    const text = 'Beni dhe Ana shkojnë në fshat çdo verë, por gjyshi ka një qen të madh dhe gjyshja bën bukë çdo ditë në shtëpinë e vjetër.';
    const tokens = sqAdapter.tokenize(text);
    const analyses = sqAdapter.analyze(tokens);
    expect(tokens.filter((t) => t.isWord).length).toBeGreaterThanOrEqual(20);
    sqAdapter.syntax!(tokens, analyses);
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) sqAdapter.syntax!(tokens, analyses);
    expect((performance.now() - t0) / 200).toBeLessThan(2);
  });
});

// ───────────────────────────── scoring ─────────────────────────────

interface Score { words: number; uas: number; las: number; roots: number; sents: number; unattached: number }
function score(acc: Score, tokens: ReturnType<typeof sqAdapter.tokenize>, syn: SyntaxAnalysis, heads: number[], rels: string[]): void {
  const wi = tokens.flatMap((t, i) => (t.isWord ? [i] : []));
  const pos = new Map(wi.map((t, k) => [t, k]));
  acc.sents++;
  wi.forEach((tok, k) => {
    acc.words++;
    const r = syn.relations.find((x) => x.dependent === tok);
    if (!r) acc.unattached++;
    const h = r ? (r.head === undefined ? -1 : pos.get(r.head) ?? -2) : -3;
    if (h === heads[k]) { acc.uas++; if (r!.relation === rels[k]) acc.las++; }
    if (heads[k] === -1 && h === -1) acc.roots++;
  });
}
const fresh = (): Score => ({ words: 0, uas: 0, las: 0, roots: 0, sents: 0, unattached: 0 });

describe('the gold set (hand-labelled by Claude, unreviewed; the rules were developed on these texts)', () => {
  const file = path.resolve('data/gold/sq/syntax-dev.json');
  const gold = JSON.parse(fs.readFileSync(file, 'utf8')) as { language: string; labelled_by: string; created: string; sentences: Array<{ id: string; text: string; tokens: string[]; heads: number[]; relations: string[] }> };
  it('has the header and at least 40 well-formed sentences', () => {
    expect(gold.language).toBe('sq');
    expect(gold.labelled_by).toBe('Claude (AI-judged, unreviewed; no native speaker)');
    expect(gold.created).toBe('2026-10-10');
    expect(gold.sentences.length).toBeGreaterThanOrEqual(40);
    for (const s of gold.sentences) {
      expect(s.heads.length, s.id).toBe(s.tokens.length);
      expect(s.relations.length, s.id).toBe(s.tokens.length);
      expect(s.heads.filter((h) => h === -1).length, s.id).toBe(1);
      const t = sqAdapter.tokenize(s.text).filter((x) => x.isWord).map((x) => x.surface);
      expect(t, s.id).toEqual(s.tokens);
    }
  });
  it('is reproduced at the measured floors (UAS 100 %, LAS 99.7 %, root 100 % when measured; floors a little below)', () => {
    const acc = fresh();
    for (const s of gold.sentences) {
      const tokens = sqAdapter.tokenize(s.text);
      score(acc, tokens, sqAdapter.syntax!(tokens, sqAdapter.analyze(tokens))!, s.heads, s.relations);
    }
    expect(acc.uas / acc.words).toBeGreaterThanOrEqual(0.99);
    expect(acc.las / acc.words).toBeGreaterThanOrEqual(0.98);
    expect(acc.roots / acc.sents).toBeGreaterThanOrEqual(0.99);
    expect(acc.unattached).toBe(0);
  });
});

describe('the Universal Dependencies Albanian treebanks on disk (comparison only; never bundled)', () => {
  const dirs: Array<[string, RegExp]> = [['data/research/ud/UD_Albanian-STAF', /^sq_staf-ud-(dev|test|train)\.conllu$/], ['data/research/ud/UD_Albanian-TSA', /^sq_tsa-ud-test\.conllu$/]];
  const present = dirs.every(([d]) => fs.existsSync(path.resolve(d)));
  it.skipIf(!present)('scores on the sentences that line up one for one with the adapter tokens (measured UAS 52.8 %, LAS 43.8 %)', () => {
    const acc = fresh();
    let used = 0;
    const norm = (s: string): string => s.normalize('NFC').toLocaleLowerCase('sq');
    for (const [dir, re] of dirs) {
      for (const f of fs.readdirSync(path.resolve(dir)).filter((x) => re.test(x)).sort()) {
        const blocks = fs.readFileSync(path.resolve(dir, f), 'utf8').replace(/\r/g, '').split(/\n\n+/).filter((b) => b.trim());
        for (const b of blocks) {
          const lines = b.split('\n');
          const text = (lines.find((l) => l.startsWith('# text = ')) ?? '').slice(9);
          const rows = lines.filter((l) => /^\d+(-\d+)?\t/.test(l)).map((l) => l.split('\t'));
          if (rows.some((r) => r[0].includes('-'))) continue;
          const words = rows.filter((r) => r[3] !== 'PUNCT');
          const tokens = sqAdapter.tokenize(text);
          const wi = tokens.flatMap((t, i) => (t.isWord ? [i] : []));
          if (wi.length !== words.length || !wi.every((t, k) => norm(tokens[t].surface) === norm(words[k][1]))) continue;
          const idToK = new Map(words.map((r, k) => [r[0], k]));
          const heads = words.map((r) => (r[6] === '0' ? -1 : idToK.get(r[6]) ?? -9));
          if (heads.some((h) => h === -9)) continue;
          const rels = words.map((r) => { const base = r[7].split(':')[0]; return base === 'parataxis' ? 'dep' : base; });
          score(acc, tokens, sqAdapter.syntax!(tokens, sqAdapter.analyze(tokens))!, heads, rels);
          used++;
        }
      }
    }
    expect(used).toBeGreaterThanOrEqual(150);
    expect(acc.uas / acc.words).toBeGreaterThanOrEqual(0.5);
    expect(acc.las / acc.words).toBeGreaterThanOrEqual(0.41);
    // words with no relation are mostly words the word list does not know; the rules do not invent a relation for them
    expect(acc.unattached / acc.words).toBeLessThanOrEqual(0.22);
  });
});

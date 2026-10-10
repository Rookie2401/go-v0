/**
 * Thai contextual syntax (Linguistic Engine V2, Stage 4): thai/syntax.ts, wired as thAdapter.syntax. Rule cases on hand-made
 * sentences, the honesty rules (nothing invented for unknown words, alternatives kept, a non-empty basis everywhere), and the
 * floors of the hand-labelled gold set data/gold/th/syntax-dev.json (AI-judged, unreviewed). The floors are MEASURED values
 * with a margin, not targets: see docs/ecosystem/linguistics/SYNTAX-th.md and scripts/probe-syntax-th.mts.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { thAdapter } from '../../src/adapters/th';
import { thaiSyntax } from '../../src/adapters/thai/syntax';
import { relationOf, dependentsOf, type DependencyRelation, type SyntaxAnalysis } from '../../src/core/syntax';
import { run, indexOf } from './helpers';

/** Tokenize, analyze and parse one sentence. */
function parse(text: string): { sx: SyntaxAnalysis; ix: (surface: string, nth?: number) => number } {
  const r = run('th', text);
  const sx = thAdapter.syntax!(r.tokens, r.analyses)!;
  return { sx, ix: (surface, nth = 0) => indexOf(r, surface, nth) };
}
/** The relation of a word as `relation→head` (head surface or ROOT), for compact assertions. */
function rel(text: string, surface: string, nth = 0): string | undefined {
  const { sx, ix } = parse(text);
  const r = relationOf(sx, ix(surface, nth));
  return r ? `${r.relation}→${r.head === undefined ? 'ROOT' : sx.tokens[r.head]}` : undefined;
}

describe('thai syntax: wiring and shape', () => {
  it('is an optional adapter method that returns a Thai analysis', () => {
    expect(typeof thAdapter.syntax).toBe('function');
    const { sx } = parse('ฉันกินข้าว');
    expect(sx.languageId).toBe('th');
    expect(sx.analyzer).toMatch(/^syntax-th@/u);
    expect(sx.tokens).toEqual(['ฉัน', 'กิน', 'ข้าว']);
  });
  it('is deterministic', () => {
    const r = run('th', 'พ่อหัวเราะและบอกว่าไปได้เลย');
    expect(thaiSyntax(r.tokens, r.analyses)).toEqual(thaiSyntax(r.tokens, r.analyses));
  });
  it('returns an empty analysis for a text with no words', () => {
    const r = run('th', '');
    const sx = thaiSyntax(r.tokens, r.analyses);
    expect(sx.relations).toEqual([]);
    expect(sx.attached).toBe(0);
  });
  it('a 20-word sentence takes well under 2 ms', () => {
    const r = run('th', 'ถ้าเราสารภาพบาปของเรา พระองค์ทรงสัตย์ซื่อและทรงยุติธรรมที่จะโปรดยกบาปของเรา และชำระเราให้พ้นจากความอธรรมทั้งสิ้น');
    thaiSyntax(r.tokens, r.analyses); // warm up
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) thaiSyntax(r.tokens, r.analyses);
    expect((performance.now() - t0) / 200).toBeLessThan(2);
  });
});

describe('thai syntax: clause structure', () => {
  it('subject – verb – object', () => {
    expect(rel('ฉันกินข้าว', 'ฉัน')).toBe('nsubj→กิน');
    expect(rel('ฉันกินข้าว', 'กิน')).toBe('root→ROOT');
    expect(rel('ฉันกินข้าว', 'ข้าว')).toBe('obj→กิน');
  });
  it('a verb of motion takes a place (obl), not an object', () => {
    expect(rel('วันเสาร์ ฉันไปตลาดกับพ่อ', 'ตลาด')).toBe('obl→ไป');
    expect(rel('วันเสาร์ ฉันไปตลาดกับพ่อ', 'วัน')).toBe('obl→ไป'); // a time phrase before the subject
  });
  it('serial verbs: the first verb is the root; a direction word is a compound, a second action an xcomp', () => {
    const t = 'ตอนเย็น ทุกคนกลับมานั่งคุยกันที่บ้าน';
    expect(rel(t, 'กลับ')).toBe('root→ROOT');
    expect(rel(t, 'มา')).toBe('compound→กลับ');
    expect(rel(t, 'นั่ง')).toBe('xcomp→กลับ');
    const { sx, ix } = parse(t);
    expect(relationOf(sx, ix('มา'))!.basis.join(' ')).toMatch(/serial verb/u);
    expect(relationOf(sx, ix('นั่ง'))!.basis.join(' ')).toMatch(/serial verb/u);
    // a verb after an object noun phrase is still a second action of the same chain
    expect(rel('ฉันเก็บจานไปล้างเมื่อเรากินเสร็จ', 'ล้าง')).toBe('xcomp→เก็บ');
    expect(rel('ฉันเก็บจานไปล้างเมื่อเรากินเสร็จ', 'ไป')).toBe('compound→เก็บ');
  });
  it('a number and a classifier follow the noun they count (nummod + clf)', () => {
    const t = 'นกสองตัวบินลงมาที่พื้น';
    expect(rel(t, 'สอง')).toBe('nummod→นก');
    expect(rel(t, 'ตัว')).toBe('clf→นก');
    expect(rel(t, 'นก')).toBe('nsubj→บิน');
    expect(rel('เขาอ่านหนังสือเล่มนี้', 'เล่ม')).toBe('clf→หนังสือ');
    expect(rel('เขาอ่านหนังสือเล่มนี้', 'นี้')).toBe('det→หนังสือ');
  });
  it('an adjective after a noun is amod, and a bare noun after a noun modifies it', () => {
    expect(rel('แมวสีขาวนอนอยู่ใต้โต๊ะ', 'ขาว')).toBe('amod→สี');
    expect(rel('แมวสีขาวนอนอยู่ใต้โต๊ะ', 'สี')).toBe('nmod→แมว');
  });
  it('aspect and modal markers are aux, each labelled', () => {
    const t = 'แม่กำลังทอดไข่ในกระทะ';
    const { sx, ix } = parse(t);
    const a = relationOf(sx, ix('กำลัง'))!;
    expect(a.relation).toBe('aux');
    expect(a.label).toMatch(/progressive/u);
    expect(rel('แมวสีขาวนอนอยู่ใต้โต๊ะ', 'อยู่')).toBe('aux→นอน');
    expect(relationOf(parse('แมวสีขาวนอนอยู่ใต้โต๊ะ').sx, 3 + 1)!.label).toMatch(/continuing-state/u);
    expect(rel('ฉันอยากกินข้าว', 'อยาก')).toBe('aux→กิน');
    expect(rel('ฉันกินข้าวแล้ว', 'แล้ว')).toBe('aux→กิน');
    expect(rel('ฉันจะไม่ไป', 'จะ')).toBe('aux→ไป');
    expect(rel('ฉันจะไม่ไป', 'ไม่')).toBe('advmod→ไป'); // negation
  });
  it('the copula links the subject to a predicate noun', () => {
    expect(rel('เขาเป็นครู', 'เป็น')).toBe('cop→ครู');
    expect(rel('เขาเป็นครู', 'ครู')).toBe('root→ROOT');
    expect(rel('เขาเป็นครู', 'เขา')).toBe('nsubj→ครู');
  });
  it('final particles are discourse; a polite or question particle says so in its basis', () => {
    expect(rel('ฉันกินข้าวครับ', 'ครับ')).toBe('discourse→กิน');
    const { sx, ix } = parse('คุณไปตลาดไหม');
    const q = relationOf(sx, ix('ไหม'))!;
    expect(q.relation).toBe('discourse');
    expect(q.basis.join(' ')).toMatch(/yes\/no question/u);
    expect(relationOf(parse('ฉันกินข้าวครับ').sx, 3)!.basis.join(' ')).toMatch(/polite/u);
  });
  it('a possessive ของ phrase: the possessor is nmod and ของ is its case', () => {
    const t = 'น้องเติมน้ำในแก้วของฉัน';
    expect(rel(t, 'ฉัน')).toBe('nmod→แก้ว');
    expect(rel(t, 'ของ')).toBe('case→ฉัน');
    expect(rel(t, 'ใน')).toBe('case→แก้ว');
  });
  it('ที่ before a noun is "at" (case); ที่ before a clause after a noun is a relative marker', () => {
    expect(rel('เรากินข้าวที่บ้าน', 'ที่')).toBe('case→บ้าน');
    expect(rel('เรากินข้าวที่บ้าน', 'บ้าน')).toBe('obl→กิน');
    const t = 'เพื่อนช่วยอธิบายคำที่ฉันไม่รู้';
    expect(rel(t, 'ที่')).toBe('mark→ไม่รู้');
    expect(rel(t, 'ไม่รู้')).toBe('acl→คำ');
  });
  it('ว่า opens a clause object (ccomp); the verb of saying is its head', () => {
    const t = 'แม่ถามว่าวันนี้ฉันอยากทำอะไร';
    expect(rel(t, 'ว่า')).toBe('mark→ทำ');
    expect(rel(t, 'ทำ')).toBe('ccomp→ถาม');
    expect(rel(t, 'ฉัน')).toBe('nsubj→ทำ');
    expect(rel(t, 'อะไร')).toBe('obj→ทำ');
  });
  it('subordinate clauses: เมื่อ is mark, the clause is advcl of the main predicate', () => {
    const t = 'เมื่อถึงบ้าน แม่ดีใจที่ได้ของสด';
    expect(rel(t, 'เมื่อ')).toBe('mark→ถึง');
    expect(rel(t, 'ถึง')).toBe('advcl→ดีใจ');
    expect(rel(t, 'ดีใจ')).toBe('root→ROOT');
    expect(rel(t, 'ที่')).toBe('mark→ได้');
  });
  it('coordination: nouns with และ (conj + cc), clauses with แต่, verbs sharing a subject', () => {
    expect(rel('ฉันวางจานและช้อนบนโต๊ะ', 'ช้อน')).toBe('conj→จาน');
    expect(rel('ฉันวางจานและช้อนบนโต๊ะ', 'และ')).toBe('cc→ช้อน');
    const t = 'ฉันอ่านช้าแต่พยายามอ่านให้จบ';
    expect(rel(t, 'แต่')).toBe('cc→พยายาม');
    expect(rel(t, 'พยายาม')).toBe('conj→อ่าน');
    expect(rel('พ่อหัวเราะและบอกว่าไปได้เลย', 'บอก')).toBe('conj→หัวเราะ');
  });
  it('ให้: "let / make" before a verb (mark + ccomp), "for" before a person (case + obl), "give" as the verb', () => {
    const t = 'แม่บอกให้เราไปโรงเรียน';
    expect(rel(t, 'ให้')).toBe('mark→ไป');
    expect(rel(t, 'ไป')).toBe('ccomp→บอก');
    expect(rel(t, 'เรา')).toBe('nsubj→ไป');
    expect(rel('พ่อซื้อตั๋วให้ทุกคน', 'ให้')).toBe('case→ทุกคน');
    expect(rel('พ่อซื้อตั๋วให้ทุกคน', 'ทุกคน')).toBe('obl→ซื้อ');
    expect(rel('พ่อให้ฉันหนังสือหนึ่งเล่ม', 'ให้')).toBe('root→ROOT');
    expect(rel('พ่อให้ฉันหนังสือหนึ่งเล่ม', 'ฉัน')).toBe('iobj→ให้');
    expect(rel('พ่อให้ฉันหนังสือหนึ่งเล่ม', 'หนังสือ')).toBe('obj→ให้');
  });
  it('a vocative before a comma, and punctuation attached to the main word', () => {
    const t = 'สมชาย, คุณมาจากไหน';
    expect(rel(t, 'สมชาย')).toBe('vocative→มา');
    expect(rel(t, ',')).toBe('punct→มา');
  });
  it('a child lookup helper returns the dependents of a head in order', () => {
    const { sx, ix } = parse('ฉันกินข้าวครับ');
    expect(dependentsOf(sx, ix('กิน')).map((r) => sx.tokens[r.dependent])).toEqual(['ฉัน', 'ข้าว', 'ครับ']);
  });
});

describe('thai syntax: honesty', () => {
  it('an adjective with no verb in the clause is the predicate, and the modifier reading is kept', () => {
    const { sx, ix } = parse('ท้องฟ้าใส');
    const r = relationOf(sx, ix('ใส'))!;
    expect(r.relation).toBe('root');
    expect(r.status).toBe('conflicted');
    expect(r.alternatives!.some((a) => a.relation === 'amod' && a.head === ix('ท้องฟ้า'))).toBe(true);
    expect(r.alternatives![0].why).toMatch(/no other verb/u);
    expect(rel('ท้องฟ้าใส', 'ท้องฟ้า')).toBe('nsubj→ใส');
  });
  it('an adjective in a clause that has a verb is just amod, with no alternative', () => {
    const { sx, ix } = parse('ฉันเห็นรูปเก่า');
    const r = relationOf(sx, ix('เก่า'))!;
    expect(r.relation).toBe('amod');
    expect(r.alternatives).toBeUndefined();
    expect(r.status).toBe('generated');
  });
  it('a preposition phrase after a chain of verbs keeps the other verb as an alternative (status conflicted)', () => {
    const { sx, ix } = parse('ฉันเก็บจานไปล้างที่บ้าน');
    const r = relationOf(sx, ix('บ้าน'))!;
    expect(r.relation).toBe('obl');
    expect(r.status).toBe('conflicted');
    expect(r.alternatives!.some((a) => a.head === ix('เก็บ'))).toBe(true);
    expect(r.alternatives!.every((a) => a.why.length > 0)).toBe(true);
  });
  it('a noun and a verb in one word are kept: an auxiliary read as the main verb says so', () => {
    const { sx, ix } = parse('ฉันได้กลิ่นข้าวร้อนจากครัว');
    const r = relationOf(sx, ix('ได้'))!;
    expect(r.relation).toBe('root');
    expect(r.status).toBe('conflicted');
    expect(r.basis.join(' ')).toMatch(/auxiliary/u);
    expect(rel('ฉันได้กลิ่นข้าวร้อนจากครัว', 'กลิ่น')).toBe('obj→ได้');
  });
  it('a sentence of unknown words gets no relation, only a note', () => {
    const { sx } = parse('ฟฟฟ');
    expect(sx.relations).toEqual([]);
    expect(sx.attached).toBe(0);
    expect(sx.notes.join(' ')).toContain('ฟฟฟ');
  });
  it('a pronoun and an unknown word: the unknown word gets nothing invented', () => {
    const { sx, ix } = parse('ฉัน ฟฟฟ');
    expect(relationOf(sx, ix('ฟฟฟ'))).toBeUndefined();
    expect(dependentsOf(sx, ix('ฟฟฟ'))).toEqual([]);
    expect(sx.notes.join(' ')).toMatch(/Not in the word list.*ฟฟฟ/u);
  });
  it('an unknown word is read from its place only when a function word fixes it, and the relation is weak and says why', () => {
    const { sx, ix } = parse('แม่กำลังทอดไข่');
    const r = relationOf(sx, ix('ทอด'))!;
    expect(r.relation).toBe('root');
    expect(r.confidence).toBeLessThanOrEqual(0.55);
    expect(r.basis.join(' ')).toContain('กำลัง');
    expect(r.status).toBe('conflicted');
    expect(rel('แม่กำลังทอดไข่', 'ไข่')).toBe('obj→ทอด');
  });
  it('the attached share counts the word tokens that have a relation', () => {
    const { sx } = parse('ฉัน ฟฟฟ');
    expect(sx.attached).toBe(0.5);
    const full = parse('ฉันกินข้าวครับ').sx;
    expect(full.attached).toBe(1);
  });
});

describe('thai syntax: invariants over the course corpus', () => {
  const dir = 'data/corpus/th';
  const sentences: string[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { sections?: Array<{ paragraphs?: Array<{ sentences?: Array<{ text?: string }> }> }> };
    for (const s of doc.sections ?? []) for (const p of s.paragraphs ?? []) for (const x of p.sentences ?? []) if (x.text) sentences.push(x.text);
  }
  const RELATIONS = new Set<DependencyRelation>(['root', 'nsubj', 'obj', 'iobj', 'obl', 'nmod', 'amod', 'det', 'case', 'aux', 'cop', 'mark', 'advmod', 'advcl', 'acl', 'ccomp', 'xcomp', 'conj', 'cc', 'nummod', 'appos', 'vocative', 'discourse', 'expl', 'compound', 'flat', 'fixed', 'clf', 'punct', 'dep']);

  it('has the sentences', () => { expect(sentences.length).toBeGreaterThan(150); });

  it('every relation is well formed: a non-empty basis, a known relation name, valid indexes, no self-head, no cycle, one root', () => {
    for (const text of sentences) {
      const r = run('th', text);
      const sx = thAdapter.syntax!(r.tokens, r.analyses)!;
      const seen = new Set<number>();
      for (const x of sx.relations) {
        expect(x.basis.length, text).toBeGreaterThan(0);
        expect(x.basis.every((b) => b.length > 0), text).toBe(true);
        expect(x.label.length, text).toBeGreaterThan(0);
        expect(RELATIONS.has(x.relation), x.relation).toBe(true);
        expect(x.dependent).toBeGreaterThanOrEqual(0);
        expect(x.dependent).toBeLessThan(r.tokens.length);
        expect(seen.has(x.dependent), `${text}: ${x.dependent} twice`).toBe(false);
        seen.add(x.dependent);
        if (x.head !== undefined) { expect(x.head).not.toBe(x.dependent); expect(x.head).toBeLessThan(r.tokens.length); }
        expect(x.confidence).toBeGreaterThan(0);
        expect(x.confidence).toBeLessThanOrEqual(1);
        expect(x.status).toBe(x.alternatives?.length ? 'conflicted' : 'generated');
        expect(x.relation === 'root').toBe(x.head === undefined);
      }
      expect(sx.relations.filter((x) => x.relation === 'root').length, text).toBe(1);
      const head = new Map(sx.relations.map((x) => [x.dependent, x.head]));
      for (const [dep] of head) {
        let cur: number | undefined = dep;
        let steps = 0;
        while (cur !== undefined && steps < 200) { cur = head.get(cur); steps++; }
        expect(steps, `${text}: cycle`).toBeLessThan(200);
      }
    }
  });

  it('floors, as measured: most word tokens are attached, root found everywhere, a minority of relations keep alternatives', () => {
    let words = 0, attached = 0, rels = 0, alts = 0;
    for (const text of sentences) {
      const r = run('th', text);
      const sx = thAdapter.syntax!(r.tokens, r.analyses)!;
      const w = r.tokens.filter((t) => t.isWord).length;
      words += w;
      attached += Math.round(sx.attached * w);
      for (const x of sx.relations) if (x.relation !== 'punct') { rels++; if (x.alternatives?.length) alts++; }
    }
    expect(attached / words).toBeGreaterThan(0.92); // measured 95.3 %
    expect(alts / rels).toBeGreaterThan(0.08); // measured 16.3 %
    expect(alts / rels).toBeLessThan(0.3);
  });
});

describe('thai syntax: gold set (AI-judged, unreviewed)', () => {
  interface GoldSentence { text: string; split?: string; tokens: string[]; heads: Array<number | null>; relations: Array<string | null> }
  const gold = JSON.parse(fs.readFileSync('data/gold/th/syntax-dev.json', 'utf8')) as { language: string; labelled_by: string; created: string; sentences: GoldSentence[] };

  it('has the stated header and at least 40 sentences from the course corpus', () => {
    expect(gold.language).toBe('th');
    expect(gold.labelled_by).toBe('Claude (AI-judged, unreviewed; no native speaker)');
    expect(gold.created).toBe('2026-10-10');
    expect(gold.sentences.length).toBeGreaterThanOrEqual(40);
    const corpus = fs.readdirSync('data/corpus/th').filter((f) => f.endsWith('.json')).map((f) => fs.readFileSync(path.join('data/corpus/th', f), 'utf8')).join('\n');
    for (const g of gold.sentences) expect(corpus.includes(JSON.stringify(g.text).slice(1, -1)) || corpus.includes(g.text), g.text).toBe(true);
  });

  it('every gold sentence matches the adapter tokenization and is a tree with one root', () => {
    const known = new Set(['root', 'nsubj', 'obj', 'iobj', 'obl', 'nmod', 'amod', 'det', 'case', 'aux', 'cop', 'mark', 'advmod', 'advcl', 'acl', 'ccomp', 'xcomp', 'conj', 'cc', 'nummod', 'appos', 'vocative', 'discourse', 'expl', 'compound', 'flat', 'fixed', 'clf', 'punct', 'dep']);
    for (const g of gold.sentences) {
      expect(thAdapter.tokenize(g.text).map((t) => t.surface), g.text).toEqual(g.tokens);
      expect(g.heads.length).toBe(g.tokens.length);
      expect(g.relations.length).toBe(g.tokens.length);
      expect(g.heads.filter((h) => h === -1).length, g.text).toBe(1);
      g.heads.forEach((h, i) => {
        if (h === null) return;
        expect(known.has(g.relations[i]!), `${g.text}: ${g.relations[i]}`).toBe(true);
        let cur: number | null = i;
        let steps = 0;
        while (cur !== null && cur !== -1 && steps < 100) { cur = g.heads[cur]; steps++; }
        expect(cur, `${g.text}: cycle at ${i}`).toBe(-1);
      });
    }
  });

  function score(sentences: GoldSentence[]): { n: number; attached: number; uas: number; las: number } {
    let n = 0, attached = 0, uas = 0, las = 0;
    for (const g of sentences) {
      const r = run('th', g.text);
      const sx = thAdapter.syntax!(r.tokens, r.analyses)!;
      g.tokens.forEach((_, i) => {
        const gh = g.heads[i];
        if (gh === null || !r.tokens[i].isWord) return;
        n++;
        const x = sx.relations.find((y) => y.dependent === i);
        if (!x) return;
        attached++;
        if ((x.head ?? -1) === gh) { uas++; if (x.relation === g.relations[i]) las++; }
      });
    }
    return { n, attached, uas, las };
  }

  it('floors, as measured on all gold words (an unattached word counts as wrong): UAS 87.5 %, LAS 86.5 %, attached 95.3 %', () => {
    const s = score(gold.sentences);
    expect(s.n).toBeGreaterThan(450);
    expect(s.attached / s.n).toBeGreaterThan(0.92);
    expect(s.uas / s.n).toBeGreaterThan(0.84);
    expect(s.las / s.n).toBeGreaterThan(0.82);
  });
  it('floors on the sentences the rules were NOT tuned against (held-out before the fixes: UAS 75.2 %; now 82+ %): kept lower', () => {
    const s = score(gold.sentences.filter((g) => g.split === 'heldout'));
    expect(s.n).toBeGreaterThan(100);
    expect(s.uas / s.n).toBeGreaterThan(0.75);
    expect(s.las / s.n).toBeGreaterThan(0.72);
  });
});

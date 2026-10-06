/**
 * What the Thai ladder plan (data/ladder/th/PLAN.md, sections 6 and 7) asked of the adapter (adapter-th@4): the cast's names
 * read as names only where the text shows a name, words ICU cuts differently from context to context kept whole, the tens
 * and สิบเอ็ด as numerals, หน้าที่ / ตากลม not merged wrongly, and one rule for ๆ.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { thAdapter, thLexicon } from '../../src/adapters/th';
import { THAI_COMPOUNDS, THAI_PINNED, thaiTokenize } from '../../src/adapters/thai/text';
import type { CorpusDocument } from '../../src/ingest';
import { analyseDocument } from '../../src/ladder';

const words = (text: string) => thAdapter.tokenize(text).filter((t) => t.isWord).map((t) => t.surface);
/** The readings (parts of speech, first first) of the word `surface` in `text`. */
const pos = (text: string, surface: string): string[] => {
  const toks = thAdapter.tokenize(text);
  const an = thAdapter.analyze(toks);
  const i = toks.findIndex((t) => t.surface === surface);
  expect(i, `${surface} in ${text}`).toBeGreaterThanOrEqual(0);
  return an[i].candidates.map((c) => c.pos as string);
};
const firstPos = (text: string, surface: string) => pos(text, surface)[0];
const docOf = (...sentences: string[]): CorpusDocument =>
  ({ schemaVersion: 2, id: 'x', lang: 'th', title: 'x', contentType: 'story', sections: [{ paragraphs: [{ sentences: sentences.map((text) => ({ text })) }] }] }) as unknown as CorpusDocument;

describe('Thai ladder: the cast names', () => {
  it('แซม and สมชาย have no everyday reading: proper nouns wherever they stand', () => {
    expect(pos('ผมชื่อแซมครับ', 'แซม')).toEqual(['PROPN']);
    expect(pos('วันนี้ของแซม', 'แซม')).toEqual(['PROPN']);
    expect(pos('สมชายเป็นศิษยาภิบาล', 'สมชาย')).toEqual(['PROPN']);
  });

  it('ต้น, มะลิ, บอล, แดง and เล็ก are names after a title or ชื่อ, joined to another name, or as a clause subject', () => {
    for (const [text, w] of [
      ['คุณต้นไปตลาด', 'ต้น'], ['ผมชื่อต้นครับ', 'ต้น'], ['ฉันชื่อมะลิค่ะ', 'มะลิ'], ['ผมเจอป้าแดงที่ตลาดครับ', 'แดง'], ['ลุงเล็กขับรถ', 'เล็ก'],
      ['พ่อบอลอยู่ที่บ้าน', 'บอล'], ['แซมกับมะลิไปโบสถ์', 'มะลิ'], ['ต้นและบอลไปโรงเรียน', 'บอล'],
      ['ต้นอยู่ที่ไหน', 'ต้น'], ['วันนี้บอลอยู่ที่บ้าน', 'บอล'], ['เพราะต้นไม่นอน', 'ต้น'], ['บอลหิวมากแต่ไม่มีเงิน', 'บอล'],
      ['ต้นเหนื่อยมาก', 'ต้น'], ['มะลิทำงานที่โรงพยาบาล', 'มะลิ'], ['บอลอยากซื้อขนม', 'บอล'], ['บอลไม่กินขนม', 'บอล'],
    ] as const) expect(firstPos(text, w), text).toBe('PROPN');
  });

  it('ต้น keeps its tree and classifier readings, and the other words keep theirs, where the text shows no name', () => {
    expect(firstPos('ต้นไม้สูงมาก', 'ต้นไม้')).toBe('NOUN');
    expect(firstPos('ฉันกินเค้กสามต้น', 'ต้น')).toBe('CLF');
    expect(firstPos('ต้นนี้สูงมาก', 'ต้น')).toBe('NOUN');
    expect(firstPos('ผมเห็นบอลที่บ้าน', 'บอล')).toBe('NOUN');
    expect(firstPos('ไข่แดงอร่อย', 'แดง')).toBe('ADJ');
    expect(firstPos('ฉันชอบสีแดง', 'แดง')).toBe('ADJ');
    expect(firstPos('น้องเล็กไปโรงเรียน', 'เล็ก')).toBe('ADJ'); // "the youngest sibling"
    expect(firstPos('บ้านหลังเล็ก', 'เล็ก')).toBe('ADJ');
    // the name stays available, below the everyday readings and with little confidence
    expect(pos('ต้นไม้สูงมาก', 'ต้นไม้')).not.toContain('PROPN');
    expect(pos('ฉันกินเค้กสามต้น', 'ต้น')).toEqual(['CLF', 'NOUN', 'PROPN']);
    expect(thAdapter.analyze(thAdapter.tokenize('ฉันกินเค้กสามต้น')).at(-1)!.candidates.at(-1)!.confidence).toBeLessThanOrEqual(0.3);
  });

  it('for the gate: a name is known, the tree is a lemma', () => {
    const name = analyseDocument(thAdapter, docOf('ผมชื่อต้นครับ', 'ต้นอยู่ที่ไหน'));
    expect(name.lemmas.has('ต้น')).toBe(false);
    expect(name.auto).toBe(2);
    const tree = analyseDocument(thAdapter, docOf('ฉันกินเค้กสามต้น'));
    expect(tree.lemmas.get('ต้น')).toBe(1);
  });
});

describe('Thai ladder: words that stay one token wherever they stand', () => {
  it('ซิม, แชท, โอเค and เหรอ are stable (ICU cut them in some contexts)', () => {
    expect(words('ผมซื้อซิมที่ร้าน')).toEqual(['ผม', 'ซื้อ', 'ซิม', 'ที่', 'ร้าน']);
    expect(words('แชทกลุ่มของเรา')).toEqual(['แชท', 'กลุ่ม', 'ของ', 'เรา']);
    expect(words('โอเคครับ')).toEqual(['โอเค', 'ครับ']);
    expect(words('คุณไปเหรอคะ')).toEqual(['คุณ', 'ไป', 'เหรอ', 'คะ']);
    expect(words('ผมซื้อซิมการ์ดและไซส์ใหญ่')).toContain('ซิมการ์ด');
  });

  it('the church, mission and Scripture words and the names the plan avoided are one lemma each', () => {
    expect(words('ศิษยาภิบาลสมชายเป็นมิชชันนารี')).toEqual(['ศิษยาภิบาล', 'สมชาย', 'เป็น', 'มิชชันนารี']);
    expect(words('ชาวสะมาเรียไปเยริโคในวันอีสเตอร์')).toEqual(['ชาว', 'สะมาเรีย', 'ไป', 'เยริโค', 'ใน', 'วัน', 'อีสเตอร์']);
    expect(words('บัพติศมาของฟาริสี')).toEqual(['บัพติศมา', 'ของ', 'ฟาริสี']);
    expect(words('เปโตรกับดาวิดและอับราฮัม')).toEqual(['เปโตร', 'กับ', 'ดาวิด', 'และ', 'อับราฮัม']);
    expect(words('เอมี่กับมาร์ค')).toEqual(['เอมี่', 'กับ', 'มาร์ค']);
    expect(words('พระบิดาและพระวจนะและพระวิญญาณ')).toEqual(['พระบิดา', 'และ', 'พระวจนะ', 'และ', 'พระวิญญาณ']);
    for (const w of THAI_PINNED) expect(thLexicon.has(w), w).toBe(true); // a pinned word is never an unknown token
    for (const w of THAI_PINNED) expect(words(w), w).toEqual([w]);
    expect(THAI_PINNED.every((w) => THAI_COMPOUNDS.includes(w))).toBe(true);
  });

  it('a pinned word is not cut out of a longer word (ซิมา is not ซิม + า) and offsets stay exact', () => {
    expect(thAdapter.analyze(thAdapter.tokenize('ซิมา'))[0].candidates.map((c) => c.lemma)).not.toContain('ซิม');
    for (const text of ['ผมซื้อซิมที่ร้านแล้วแชทกลุ่ม', 'ไปโอเค ศิษยาภิบาลครับ', 'ยี่สิบห้าบาท พระบิดา']) {
      for (const t of thAdapter.tokenize(text)) expect(text.slice(t.start, t.end)).toBe(t.surface);
    }
  });

  it('compounds the plan lists as their parts stay in their parts (the lists are lists of ICU tokens)', () => {
    expect(words('ห้างสรรพสินค้า')).toEqual(['ห้าง', 'สรรพ', 'สินค้า']);
    expect(words('รถสองแถว')).toEqual(['รถ', 'สอง', 'แถว']);
    expect(words('ผู้ใหญ่บ้าน')).toEqual(['ผู้ใหญ่', 'บ้าน']);
    expect(words('ไม่เป็นไร')).toEqual(['ไม่', 'เป็นไร']);
  });
});

describe('Thai ladder: numerals', () => {
  it('the tens are NUM, one token each, and สิบเอ็ด is สิบ + เอ็ด, both NUM', () => {
    for (const w of ['ยี่สิบ', 'สามสิบ', 'สี่สิบ', 'ห้าสิบ', 'หกสิบ', 'เจ็ดสิบ', 'แปดสิบ', 'เก้าสิบ']) {
      expect(words(w), w).toEqual([w]);
      expect(firstPos(w, w), w).toBe('NUM');
    }
    expect(words('ยี่สิบห้า')).toEqual(['ยี่สิบ', 'ห้า']);
    expect(words('สิบเอ็ด')).toEqual(['สิบ', 'เอ็ด']);
    expect(words('ยี่สิบเอ็ด')).toEqual(['ยี่สิบ', 'เอ็ด']);
    expect(firstPos('สิบเอ็ด', 'เอ็ด')).toBe('NUM');
    const stat = analyseDocument(thAdapter, docOf('ผมอายุยี่สิบเอ็ดปี', 'ราคาเก้าสิบบาท'));
    expect(stat.lemmas.has('ยี่สิบ')).toBe(false);
    expect(stat.lemmas.has('เก้าสิบ')).toBe(false);
    expect(stat.lemmas.has('เอ็ด')).toBe(false);
  });
});

describe('Thai ladder: หน้าที่ and ตากลม are not merged wrongly', () => {
  it('หน้าที่ is "duty" after มี / ทำ / เป็น and before ของ / คือ, and หน้า + ที่ elsewhere', () => {
    expect(words('หน้าที่ของครู')).toEqual(['หน้าที่', 'ของ', 'ครู']);
    expect(words('คุณมีหน้าที่อะไร')).toContain('หน้าที่');
    expect(words('เขาทำหน้าที่ครู')).toContain('หน้าที่');
    expect(words('ไปหน้าที่ตลาด')).toEqual(['ไป', 'หน้า', 'ที่', 'ตลาด']);
    expect(words('ผมเห็นหน้าที่ครู')).toEqual(['ผม', 'เห็น', 'หน้า', 'ที่', 'ครู']);
    expect(firstPos('หน้าที่ของครู', 'หน้าที่')).toBe('NOUN');
  });

  it('ตากลม is "round eyes" (ตา + กลม) unless it follows ไป / นั่ง / ออก ("to take the air")', () => {
    expect(words('ตากลม')).toEqual(['ตา', 'กลม']);
    expect(words('เขามีตากลม')).toEqual(['เขา', 'มี', 'ตา', 'กลม']);
    expect(words('เขาไปตากลมที่บ้าน')).toEqual(['เขา', 'ไป', 'ตากลม', 'ที่', 'บ้าน']);
  });

  it("a text with the publisher's U+200B word marks is left as the publisher wrote it", () => {
    const ZW = String.fromCharCode(0x200b);
    expect(words(['ไป', 'หน้าที่', 'ตลาด'].join(ZW))).toEqual(['ไป', 'หน้าที่', 'ตลาด']);
  });
});

describe('Thai ladder: ๆ, one rule', () => {
  it('glued to a word the list has: one token, read as the stem (as before); written with a space: the single lemma ๆ', () => {
    expect(words('เด็กๆ เล่นกัน')).toEqual(['เด็กๆ', 'เล่น', 'กัน']);
    expect(thAdapter.analyze(thAdapter.tokenize('เด็กๆ'))[0].candidates[0]).toMatchObject({ lemma: 'เด็ก', pos: 'NOUN' });
    expect(words('ช้า ๆ')).toEqual(['ช้า', 'ๆ']);
    expect(thAdapter.analyze(thAdapter.tokenize('ช้า ๆ'))[1].candidates[0]).toMatchObject({ lemma: 'ๆ', pos: 'PART' });
  });

  it('glued to a word the list does not have: cut into the word and ๆ, as if written with a space (no lemma of its own like ว่าวๆ)', () => {
    expect(words('ว่าวๆ')).toEqual(['ว่าว', 'ๆ']);
    expect(words('นิ่งๆ')).toEqual(['นิ่ง', 'ๆ']);
    const stat = analyseDocument(thAdapter, docOf('ว่าวๆ', 'ว่าว'));
    expect(stat.lemmas.get('ว่าว')).toBe(2);
    expect(stat.lemmas.has('ว่าวๆ')).toBe(false);
    for (const t of thAdapter.tokenize('ว่าวๆ')) expect('ว่าวๆ'.slice(t.start, t.end)).toBe(t.surface);
    // ทั้งๆที่ (a phrase unit) is still found in running text
    const toks = thAdapter.tokenize('ทั้งๆที่เขาป่วย');
    expect(thAdapter.detectPhrases!(toks, thAdapter.analyze(toks)).map((p) => p.pattern[0])).toContain('ทั้งๆที่');
  });
});

describe('Thai ladder: every lemma of the plan reads as planned in neutral carrier sentences', () => {
  const planFile = path.resolve('data/ladder/th/PLAN.md');
  // read-as-planned: the planned token (or, for a word written inside a compound, the compound's planned parts) in five frames
  const FRAMES: Array<[string, string]> = [['ผมซื้อ', 'ค่ะ'], ['', 'ไม่ใช่ของผม'], ['ผมไป', 'นะ'], ['เขาพูดว่า', 'ค่ะ'], ['คุณ', 'ไหม']];
  // forms a frame cannot decide: เจ้า + ค่ะ is the word เจ้าค่ะ; the others were planned as pieces and are joined or cut by design
  const BY_DESIGN = new Set(['เจ้า', 'นิ่งๆ', 'พระวจนะ']);

  it.runIf(fs.existsSync(planFile))('no planned lemma breaks in two or more frames (the plan found ศิษยาภิบาล and ๆ)', () => {
    const items: Array<{ word: string; compound?: string }> = [];
    const lines = fs.readFileSync(planFile, 'utf8').split('\n');
    const from = lines.findIndex((l) => l.startsWith('### 3.2')), to = lines.findIndex((l) => l.startsWith('### 3.3'));
    for (const l of lines.slice(from, to)) {
      const m = /^- \*\*(New|Seeds|Stage 0 top-up|Unknown at this point|Words still off the plan|Never met before)[^*]*\*\*\s*(.*)$/u.exec(l);
      if (!m) continue;
      for (const raw of m[2].split(' — ')[0].split(/\s+/)) {
        const mm = /^([ก-๛]+?)(?:×\d+)?(?:\(←([ก-๛]+)\))?\.?$/u.exec(raw);
        if (mm && mm[1] !== 'ๆ') items.push({ word: mm[1], compound: mm[2] });
      }
    }
    expect(items.length).toBeGreaterThan(800);
    const parts = new Map<string, string[]>();
    for (const it of items) {
      const key = it.compound ?? it.word;
      const list = parts.get(key) ?? [];
      if (!list.includes(it.word)) list.push(it.word);
      parts.set(key, list);
    }
    const broken: string[] = [];
    for (const [text, want] of parts) {
      if (BY_DESIGN.has(text)) continue;
      let bad = 0;
      for (const [pre, post] of FRAMES) {
        const s = pre + text + post;
        const toks = thAdapter.tokenize(s).filter((t) => t.isWord);
        const a = pre.length, b = a + text.length;
        const inside = toks.filter((t) => t.start >= a && t.end <= b).map((t) => t.normalized);
        const aligned = toks.every((t) => t.end <= a || t.start >= b || (t.start >= a && t.end <= b)) && toks.some((t) => t.start === a) && toks.some((t) => t.end === b);
        const single = want.length === 1 && want[0] === text;
        const ok = aligned && (single ? inside.join('|') === text : inside.join('') === text && want.every((p) => inside.includes(p)));
        if (!ok) bad++;
      }
      if (bad >= 2) broken.push(`${text} (${bad}/5)`);
    }
    expect(broken).toEqual([]);
  });

  it('thaiTokenize and the adapter agree on texts without ๆ or U+200B (the adapter adds only those two rules)', () => {
    for (const text of ['ผมซื้อซิมที่ร้าน', 'ศิษยาภิบาลสมชาย', 'ไปหน้าที่ตลาด', 'ยี่สิบห้าบาท']) expect(thAdapter.tokenize(text)).toEqual(thaiTokenize(text));
  });
});

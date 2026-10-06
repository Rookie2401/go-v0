/**
 * The Thai adapter on the Open Thai Common Version's own word marks (U+200B), names, the repetition mark, and the
 * everyday words whose first dictionary sense is the wrong one for a beginner (bridge texts, Stage 0 scenes).
 */
import { describe, expect, it } from 'vitest';
import { thAdapter, thLexicon } from '../../src/adapters/th';
import { THAI_COMPOUNDS, isChunkToken, thaiTokenize } from '../../src/adapters/thai/text';

const ZW = String.fromCharCode(0x200b);
const marked = (...words: string[]) => words.join(ZW);
const surfaces = (text: string) => thAdapter.tokenize(text).filter((t) => t.isWord).map((t) => t.surface);
const first = (text: string, surface: string) => {
  const toks = thAdapter.tokenize(text);
  const an = thAdapter.analyze(toks);
  const i = toks.findIndex((t) => t.surface === surface);
  expect(i, `${surface} in ${text}`).toBeGreaterThanOrEqual(0);
  return an[i].candidates[0];
};

describe('Thai tokenizer: a text whose words are marked with U+200B', () => {
  it('keeps a name whole where ICU would cut it into fragments (the publisher wrote it as one word)', () => {
    expect(thaiTokenize('อับรามกับภรรยา').map((t) => t.surface)).toEqual(['อับ', 'ราม', 'กับ', 'ภรรยา']); // plain ICU
    expect(surfaces(marked('อับราม', 'กับ', 'ภรรยา', 'จาก', 'เบธเอล', 'ถึง', 'โสโดม')))
      .toEqual(['อับราม', 'กับ', 'ภรรยา', 'จาก', 'เบธเอล', 'ถึง', 'โสโดม']);
  });

  it('a name the word list does not have stays whole too, as an unlisted chunk', () => {
    const toks = thAdapter.tokenize(marked('ทัปปูวาห์', 'และ', 'ฮาชาบิยาห์')); // ICU: ทัป|ปู|วาห์ and ฮา|ชา|บิ|ยาห์
    expect(toks.map((t) => t.surface)).toEqual(['ทัปปูวาห์', 'และ', 'ฮาชาบิยาห์']);
    expect(isChunkToken(toks[0])).toBe(true);
    expect(isChunkToken(toks[1])).toBe(false); // และ is a word of the list
  });

  it('offsets stay exact: every token slices the input', () => {
    const text = marked('ดาวิด', 'และ', 'ทัปปูวาห์') + ' “' + marked('ฮาชาบิยาห์', 'พูด') + '”';
    for (const t of thAdapter.tokenize(text)) expect(text.slice(t.start, t.end)).toBe(t.surface);
  });

  it('an ordinary compound of real words, which the list lacks, keeps the ICU split', () => {
    expect(surfaces(marked('ชอบธรรม'))).toEqual(['ชอบ', 'ธรรม']);
    expect(surfaces(marked('ยิ่งใหญ่', 'ทั้งหลาย'))).toEqual(['ยิ่ง', 'ใหญ่', 'ทั้ง', 'หลาย']);
  });

  it('a chunk of pieces the list all knows keeps the ICU split, and a chunk the list knows whole is one token', () => {
    expect(thLexicon.has('พระวิญญาณ')).toBe(true);
    expect(surfaces(marked('ขณะ', 'นั้น', 'พระวิญญาณ'))).toEqual(['ขณะ', 'นั้น', 'พระวิญญาณ']);
    expect(surfaces(marked('ทุกคน', 'ทำ'))).toEqual(['ทุกคน', 'ทำ']); // THAI_COMPOUNDS
    expect(THAI_COMPOUNDS).toContain('ทุกคน');
  });

  it('text WITHOUT U+200B is segmented exactly as before: ICU plus the course compounds', () => {
    for (const text of ['อับรามกับภรรยา', 'พระยาห์เวห์ตรัสกับโมเสส', 'เด็กๆ เล่นกันที่บ้าน', 'ฉันซ่อนของขวัญไว้ในกล่อง']) {
      expect(thAdapter.tokenize(text)).toEqual(thaiTokenize(text));
    }
    expect(thAdapter.tokenize('อับราม').some(isChunkToken)).toBe(false);
  });

  it('ICU does not join ให้ + การบ้าน ("to give" + "homework") into ให้การ ("to testify") + บ้าน', () => {
    expect(surfaces('ครูให้การบ้านหนึ่งหน้า')).toEqual(['ครู', 'ให้', 'การบ้าน', 'หนึ่ง', 'หน้า']);
    expect(surfaces('ให้การต่อศาล')).toContain('ให้การ'); // the other reading is left alone
  });
});

describe('Thai analysis: names and words of the Scripture', () => {
  it('names the publisher keeps whole are proper nouns with their English form', () => {
    const text = marked('อับราม', 'กับ', 'ภรรยา', 'จาก', 'เบธเอล', 'ถึง', 'โสโดม', 'พระยาห์เวห์');
    expect(first(text, 'อับราม')).toMatchObject({ pos: 'PROPN', gloss: 'Abram', origin: 'hand' });
    expect(first(text, 'เบธเอล')).toMatchObject({ pos: 'PROPN', gloss: 'Bethel' });
    expect(first(text, 'โสโดม')).toMatchObject({ pos: 'PROPN', gloss: 'Sodom' });
    expect(first(text, 'ยาห์เวห์')).toMatchObject({ pos: 'PROPN', lemma: 'ยาห์เวห์' }); // พระ + ยาห์เวห์ (ICU)
    expect(first(text, 'ยาห์เวห์').gloss).toMatch(/Yahweh/);
  });

  it('a name the list lacks is a guess: a proper noun with no gloss, by rule, and the dictionary may overrule it', () => {
    const c = first(marked('ทัปปูวาห์', 'และ'), 'ทัปปูวาห์');
    expect(c).toMatchObject({ pos: 'PROPN', lemma: 'ทัปปูวาห์', origin: 'rule', unconfirmed: true });
    expect(c.gloss).toBeUndefined();
    expect(c.confidence).toBeLessThan(0.5);
    expect(c.notes).toMatchObject({ nameGuess: 'yes', source: 'rule' });
    // the same letters in a text without the publisher's marks are not claimed to be a name
    expect(thAdapter.analyze(thAdapter.tokenize('ทัปปูวาห์')).every((a) => a.candidates.every((c) => !c.notes?.nameGuess))).toBe(true);
  });

  it('ดังนี้ is "as follows; thus", and one token', () => {
    expect(surfaces('ดังนี้')).toEqual(['ดังนี้']);
    expect(first('ดังนี้', 'ดังนี้')).toMatchObject({ pos: 'ADV', gloss: 'as follows; thus' });
  });

  it('ๆ is the repetition mark: a gloss, and a decoding note that it has no sound of its own', () => {
    expect(first('ทำ ๆ', 'ๆ')).toMatchObject({ pos: 'PART', gloss: '(repeat the previous word)', role: 'repetition mark (mai yamok)' });
    const notes = thAdapter.pronunciation!({ surface: 'ๆ', start: 0, end: 1, isWord: true, normalized: 'ๆ' }, undefined).notes?.join(' ') ?? '';
    expect(notes).toMatch(/not read as a sound/);
    expect(notes).toMatch(/say the word before it again/);
  });

  it('a word written with ๆ takes the reading of its stem, marked as repeated (by rule, below a lexicon word)', () => {
    const c = first('ช้าๆ', 'ช้าๆ');
    expect(c).toMatchObject({ lemma: 'ช้า', pos: 'ADJ', origin: 'rule' });
    expect(c.notes).toMatchObject({ repeated: 'ๆ' });
    expect(c.notes?.translit).toBeUndefined(); // the stem's romanization is not this word's
    expect(c.confidence).toBeLessThanOrEqual(0.6);
    // a stem the list does not have: nothing is invented
    expect(thAdapter.analyze(thAdapter.tokenize('นิ่งๆ'))[0].candidates).toEqual([]);
  });
});

describe('Thai analysis: everyday words whose first dictionary sense is not the one a beginner needs', () => {
  const gloss = (text: string, surface: string) => first(text, surface).gloss;

  it('เหนือ is "above, over", and "north" after ทิศ / ทาง / ภาค', () => {
    expect(first('เมฆสีดำลอยเหนือถนน', 'เหนือ')).toMatchObject({ pos: 'ADP', gloss: 'above, over' });
    expect(first(marked('ทิศ', 'เหนือ'), 'เหนือ')).toMatchObject({ pos: 'NOUN', gloss: 'north' });
    expect(first('ภาคเหนือ', 'เหนือ')).toMatchObject({ pos: 'NOUN', gloss: 'north' });
  });

  it('ตกลง is "to agree", and "to fall down" in ฝนตกลงมา', () => {
    expect(gloss('เราตกลงกัน', 'ตกลง')).toBe('to agree; to decide');
    expect(gloss('ฝนตกลงมาเสียงดัง', 'ตกลง')).toBe('to fall down (ตก + ลง)');
    expect(gloss('ใบไม้ตกลงบนพื้น', 'ตกลง')).toBe('to fall down (ตก + ลง)');
  });

  it('ไว้ after a verb is a "keep / for later" particle, not "to place"', () => {
    expect(first('ฉันเก็บผ้าที่ตากไว้', 'ไว้')).toMatchObject({ pos: 'PART' });
    expect(gloss('ฉันเก็บผ้าที่ตากไว้', 'ไว้')).toMatch(/set aside, in place, for later/);
    expect(first('ฉันเก็บผ้าที่ตากไว้', 'เก็บ')).toMatchObject({ pos: 'VERB', gloss: 'to pick up; to collect; to put away; to keep' });
  });

  it('ช้อน is the spoon (and "to scoop" before ปลา / ขึ้น), ซอย the side street, ปู "to spread" before เสื่อ, เกาะ "to cling" before อยู่', () => {
    expect(first('ฉันวางจานและช้อนบนโต๊ะ', 'ช้อน')).toMatchObject({ pos: 'NOUN', gloss: 'spoon' });
    expect(first('ช้อนปลา', 'ช้อน')).toMatchObject({ pos: 'VERB' });
    expect(first('ปากซอย', 'ซอย')).toMatchObject({ pos: 'NOUN' });
    expect(first('ซอยผัก', 'ซอย')).toMatchObject({ pos: 'VERB' });
    expect(first('แม่ปูเสื่อ', 'ปู')).toMatchObject({ pos: 'VERB' });
    expect(first('ปูอยู่ในน้ำ', 'ปู')).toMatchObject({ pos: 'NOUN', gloss: 'crab' });
    expect(first('ใบไม้มีน้ำเกาะอยู่', 'เกาะ')).toMatchObject({ pos: 'VERB' });
    expect(first('ทะเลมีเกาะ', 'เกาะ')).toMatchObject({ pos: 'NOUN', gloss: 'island' });
  });

  it('the days of the week are days, not planets or gods', () => {
    expect(first('วันเสาร์', 'เสาร์').gloss).toMatch(/^Saturday/);
    expect(first('วันจันทร์', 'จันทร์').gloss).toMatch(/^Monday/);
    expect(first('วันศุกร์', 'ศุกร์').gloss).toMatch(/^Friday/);
  });

  it('other first senses are corrected: เลิก, ตั้ง, สถานี, ค่ำ, นาฬิกา, ของขวัญ', () => {
    expect(gloss('หลังเลิกเรียน', 'เลิก')).toMatch(/to stop, quit; to end/);
    expect(first('ฉันตั้งชื่อแมว', 'ตั้ง')).toMatchObject({ pos: 'VERB' });
    expect(gloss('สถานี', 'สถานี')).toMatch(/^station/);
    expect(gloss('ก่อนค่ำ', 'ค่ำ')).toBe('evening, nightfall');
    expect(gloss('นาฬิกาดัง', 'นาฬิกา')).toMatch(/^clock/);
    expect(surfaces('ฉันซ่อนของขวัญไว้')).toContain('ของขวัญ');
    expect(gloss('ฉันซ่อนของขวัญไว้', 'ของขวัญ')).toBe('gift, present');
  });
});

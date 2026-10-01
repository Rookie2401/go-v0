/**
 * The constructed reading-unit stress cases (`data/benchmarks/th/constructed-units.gold.jsonl` is generated from this
 * file by `npm run bench:units -- --write-constructed`, and a test keeps the two identical).
 *
 * WHAT THIS IS: short Thai paragraphs written by the benchmark author (machine-drafted, NOT native-reviewed), each built
 * around one known hazard of cutting Thai text into reading units: dialogue, quotation marks, abbreviations,
 * paragraphing, book formatting. The cuts are the author's reading of where a reader would want a new unit. They test
 * BEHAVIOUR on known hazards. They say nothing about accuracy on real prose, and nothing here is a measure of how often
 * the splitter is right on a book.
 *
 * HOW TO READ A CASE: the units are written out one by one; each unit carries the whitespace that follows it (the
 * first also its indentation), so a boundary always lands on the first character of the next unit. Where Thai writes no
 * mark at all (a plain space between two sentences) the cut is the author's reading and the case's note says so.
 * Choices that are conventions rather than facts: a multi-sentence quotation is cut at its sentence ends (the
 * quotation marks stay with the first and last unit); a quotation and its reporting clause form one unit; a numbered
 * list marker belongs to its item.
 */
import { CONSTRUCTED_SEGMENTED_BY, boundariesFromUnits, type UnitGoldCase } from './gold';

const SOURCE = { title: 'Constructed stress cases (benchmark author)', licence: 'Written for this benchmark; no third-party text', rights: 'rights-safe' } as const;

const cases: UnitGoldCase[] = [];
function c(id: string, stratum: string, units: string[], notes?: string): void {
  cases.push({ id, lang: 'th', stratum, ...boundariesFromUnits(units), source: { ...SOURCE }, segmentedBy: CONSTRUCTED_SEGMENTED_BY, ...(notes ? { notes } : {}) });
}

// ── dialogue with curly quotation marks ──
c('dc-01', 'dialogue-curly', ['“วันนี้ฝนตกหนักมาก” แม่พูด'], 'One quotation with its reporting clause: one unit.');
c('dc-02', 'dialogue-curly', ['“ไปไหนมา” แม่ถาม ', '“ไปตลาดครับ” ผมตอบ'], 'Two turns, each with its reporting clause, separated by one space.');
c('dc-03', 'dialogue-curly', ['“กินข้าวหรือยัง” เขาถาม ', '“ยังครับ” ฉันตอบ ', '“งั้นไปกินด้วยกัน” เขาพูด'], 'Three turns.');
c('dc-04', 'dialogue-curly', ['เขามองหน้าฉันแล้วพูดว่า “ไปเถอะ”'], 'Reporting clause first, then the speech: one unit.');
c('dc-05', 'dialogue-curly', ['แม่ถามว่า “กินอะไรดี” ', 'ฉันตอบว่า “อะไรก็ได้ค่ะ”'], 'Two turns, speech-verb first; a final particle inside the second quotation.');
c('dc-06', 'dialogue-curly', ['“ขอบคุณค่ะ” เธอตอบ ', '“ไม่เป็นไรครับ” เขาพูด'], 'Final particles before a closing quotation mark.');
c('dc-07', 'dialogue-curly', ['“ทำไมมาสายล่ะ?” ครูถาม ', '“รถติดครับ” ผมตอบ'], 'A question mark inside the quotation; the reporting clause stays with it.');
c('dc-08', 'dialogue-curly', ['เขาพูดว่า “ฉันได้ยินเธอพูดว่า ‘ไม่ไป’ เมื่อวาน”'], 'A quotation inside a quotation.');
c('dc-09', 'dialogue-curly', ['“ไปไหน” ', '“ตลาด” ', '“ไปด้วย”'], 'Bare turns with no reporting clause: each is its own unit.');

// ── dialogue with straight quotation marks ──
c('ds-01', 'dialogue-straight', ['"ไปด้วยกันไหม" เขาถาม ', '"ไปสิ" ฉันตอบ']);
c('ds-02', 'dialogue-straight', ['"สวัสดีครับ" ครูพูด'], 'A final particle before the closing straight quotation mark.');
c('ds-03', 'dialogue-straight', ['เขาตะโกนว่า "ช่วยด้วย"']);
c('ds-04', 'dialogue-straight', ['"ขอบคุณนะ" เธอพูด ', '"ยินดีค่ะ" เขาตอบ']);
c('ds-05', 'dialogue-straight', ['"ไปให้พ้น!" เขาตะโกน'], 'An exclamation mark inside the quotation; the reporting clause stays with it.');

// ── a quotation containing several sentences ──
c('qm-01', 'quote-multi', ['“ทำไมไม่มา? ', 'ฉันรอตั้งนาน” เขาพูด'], 'Cut at the question mark inside the quotation (convention of this set).');
c('qm-02', 'quote-multi', ['“ผมไม่รู้ครับ ', 'ขอโทษด้วยนะครับ” เขาตอบ'], 'Two sentences in one quotation, joined by a space after a final particle.');
c('qm-03', 'quote-multi', ['“ฝนตกแล้ว! ', 'รีบเข้ามาเร็ว” แม่ตะโกน']);

// ── speech with a reporting clause ──
c('st-01', 'speech-tag', ['“ไม่ไปหรอก” เขาพูดเสียงเบา']);
c('st-02', 'speech-tag', ['เขาพูดเสียงเบาว่า “ไม่ไปหรอก”']);

// ── final particles before a space ──
c('fp-01', 'final-particle', ['ผมชื่อสมชายครับ ', 'ผมอยู่เชียงใหม่ครับ']);
c('fp-02', 'final-particle', ['ฉันไม่ไปค่ะ ', 'คุณล่ะคะ']);
c('fp-03', 'final-particle', ['ไปด้วยกันนะ ', 'พรุ่งนี้เจอกัน']);
c('fp-04', 'final-particle', ['ขอบคุณมากนะคะ ', 'ฉันดีใจจริง ๆ']);
c('vp-01', 'vocative-particle', ['พี่ครับ ช่วยผมหน่อย'], 'ครับ addresses the person: the space after it does not end the sentence.');
c('vp-02', 'vocative-particle', ['คุณครูคะ หนูขอถามหน่อยค่ะ'], 'Vocative คะ in the middle, ค่ะ at the end.');
c('vp-03', 'vocative-particle', ['คุณแม่คะ วันนี้หนูกลับบ้านช้านะคะ']);
c('vp-04', 'vocative-particle', ['น้องครับ ขอน้ำหนึ่งแก้วครับ']);
c('vp-05', 'vocative-particle', ['“พี่ครับ ช่วยผมหน่อย” น้องพูด'], 'The same vocative inside a quotation.');
c('nm-01', 'no-marker', ['วันนี้อากาศดีจัง ', 'ไปเดินเล่นกันไหม'], 'Two sentences, no mark and no particle between them: the cut is the author\'s reading.');
c('nm-02', 'no-marker', ['แม่ทำกับข้าวอยู่ในครัว ', 'พ่อไปตลาดตั้งแต่เช้า'], 'Two clauses with different subjects: the cut is the author\'s reading.');

// ── ellipsis ──
c('el-01', 'ellipsis', ['“ฉัน… ฉันไม่รู้” เขาพูด'], 'Hesitation: the ellipsis does not end the sentence.');
c('el-02', 'ellipsis', ['“ฉันคิดว่า…” เขาพูดเบา ๆ'], 'A trailing-off quotation followed by its reporting clause.');
c('el-03', 'ellipsis', ['เขาเดินจากไป…']);
c('el-04', 'ellipsis', ['รอเดี๋ยว... เดี๋ยวฉันไปด้วย'], 'Three full stops used as an ellipsis in the middle of an utterance.');
c('el-05', 'ellipsis', ['ฝนหยุดแล้ว… ', 'ฟ้าสว่างขึ้นมาก'], 'An ellipsis that ends a sentence, followed by a new one (author\'s reading).');

// ── ฯ and ฯลฯ ──
c('pn-01', 'paiyannoi', ['ผู้ว่าฯ มาเปิดงานเมื่อวานนี้'], 'ฯ abbreviates a long title; the space after it does not end the sentence.');
c('pn-02', 'paiyannoi', ['กรุงเทพฯ เป็นเมืองหลวงของประเทศไทย']);
c('pn-03', 'paiyannoi', ['ในตลาดมีผัก ผลไม้ เนื้อ ปลา ฯลฯ ขายทุกวัน'], 'ฯลฯ in the middle of a sentence.');

// ── ๆ ──
c('my-01', 'maiyamok', ['เด็ก ๆ เล่นกันอยู่ในสวน']);
c('my-02', 'maiyamok', ['ค่อย ๆ เดินนะ ', 'ระวังหกล้ม']);
c('my-03', 'maiyamok', ['พวกเราไปเที่ยวบ่อย ๆ ในฤดูหนาว']);

// ── abbreviations with full stops ──
c('ab-01', 'abbreviation', ['ปี พ.ศ. 2565 เป็นปีที่ฝนตกมาก']);
c('ab-02', 'abbreviation', ['ร.ร. ของเราอยู่ใกล้บ้าน']);
c('ab-03', 'abbreviation', ['ดร. สมชายมาถึงแล้ว']);
c('ab-04', 'abbreviation', ['นพ. สมศักดิ์ตรวจคนไข้ทุกเช้า']);
c('ab-05', 'abbreviation', ['วันที่ 5 ก.ค. 2566 เป็นวันหยุด']);
c('ab-06', 'abbreviation', ['เขาเกิดเมื่อ พ.ศ. 2540 ที่เชียงใหม่']);
c('ab-07', 'abbreviation', ['อ. สมหญิงสอนภาษาอังกฤษ']);
c('ab-08', 'abbreviation', ['คุณ ก. กับคุณ ข. ไปด้วยกัน']);
c('ab-09', 'abbreviation', ['Dr. Smith ไปถึงแล้ว'], 'Latin-script abbreviation inside Thai text.');

// ── numbers and times ──
c('nu-01', 'number', ['ราคา 3.14 บาท ไม่แพงเลย']);
c('nu-02', 'number', ['เขาซื้อของ 1,250 บาท']);
c('nu-03', 'number', ['ผลสอบได้ร้อยละ 85.5 ของคะแนนเต็ม']);
c('nu-04', 'number', ['ฉันมีเงิน ๑๒๓.๕๐ บาท'], 'Thai digits with a decimal point.');
c('nu-05', 'number', ['ประชากรประมาณ 1,000,000 คน อาศัยอยู่ที่นี่']);
c('tm-01', 'time', ['ประชุมเวลา 10.30 น. ที่ห้องประชุม']);
c('tm-02', 'time', ['รถออกเวลา 08:30 น. ทุกวัน']);
c('tm-03', 'time', ['เขาตื่นตอน 6.00 น. ทุกเช้า']);
c('tm-04', 'time', ['ตี 5.45 น. ฉันก็ตื่นแล้ว']);

// ── Latin-script words and names ──
c('la-01', 'latin', ['เขาใช้ iPhone ทุกวัน']);
c('la-02', 'latin', ['A. B. Smith ทำงานที่นี่'], 'Two initials with full stops at the start of the unit.');
c('la-03', 'latin', ['Good morning. ', 'My name is Anna.'], 'Two English sentences.');
c('la-04', 'latin', ['เธอตอบว่า "Yes, I do." แล้วก็ยิ้ม'], 'A full stop inside a straight-quoted English answer.');
c('la-05', 'latin', ['คุณ Anna ชอบกาแฟร้อน']);
c('la-06', 'latin', ['ฉันดู YouTube กับ Facebook ทุกวัน']);

// ── numbered and lettered list markers ──
c('lm-01', 'list-marker', ['1. ล้างมือ ', '2. กินข้าว'], 'A marker belongs to its item.');
c('lm-02', 'list-marker', ['ก. ข้าว ', 'ข. น้ำ'], 'Thai letters as list markers.');
c('lm-03', 'list-marker', ['1) ล้างมือ ', '2) กินข้าว']);

// ── lists with commas, parentheses ──
c('lc-01', 'list-comma', ['แม่ซื้อไข่, นม, ขนมปัง และผลไม้']);
c('lc-02', 'list-comma', ['เขาชอบแมว สุนัข นก และปลา']);
c('pa-01', 'parenthesis', ['ศาลากลาง (ที่เก่าแก่ที่สุด) อยู่ใกล้ตลาด']);
c('pa-02', 'parenthesis', ['เขาบอกไว้ (ไปด้วยนะ ถ้าว่าง) แต่ฉันไม่ว่าง'], 'A final particle and a space inside a parenthesis.');
c('pa-03', 'parenthesis', ['พี่ชาย (อายุ 20 ปี) ทำงานที่กรุงเทพฯ']);
c('pa-04', 'parenthesis', ['เขาตอบ (เบา ๆ) ว่า “ไม่เป็นไร”']);

// ── narrative with clause spaces only ──
c('nc-01', 'narrative-clause-space', ['เช้านี้ฝนตกเบา ๆ ', 'ฉันเดินไปโรงเรียนกับเพื่อน'], 'Sentences separated by one plain space: the cut is the author\'s reading.');
c('nc-02', 'narrative-clause-space', [
  'ตอนเช้าแม่ตื่นขึ้นมาทำอาหารให้ทุกคนในบ้าน ',
  'พ่อออกไปทำงานที่ไร่ตั้งแต่ฟ้ายังไม่สว่าง ',
  'ส่วนฉันกับน้องช่วยกันเก็บผ้าและกวาดบ้าน',
], 'Three sentences of 11 to 12 words each (ICU word tokens), one space between them.');
c('nc-03', 'narrative-clause-space', [
  'หมู่บ้านของเราอยู่ริมแม่น้ำและมีต้นมะม่วงใหญ่อยู่หน้าวัดมาตั้งแต่สมัยปู่ย่า ',
  'ทุกเย็นเด็ก ๆ จะมานั่งเล่นใต้ต้นไม้ใหญ่และฟังคนแก่เล่านิทานเก่า ๆ ให้ฟัง ',
  'พอฟ้ามืดลงทุกคนก็แยกย้ายกันกลับบ้านไปกินข้าวกับครอบครัว ',
  'บางคืนลมพัดแรงจนใบไม้ร่วงลงมาเต็มลานวัด',
], 'A long paragraph of four sentences, 68 word tokens, clause spaces only (author\'s reading).');
c('nc-04', 'narrative-clause-space', [
  'เมื่อฝนหยุดตกในตอนเย็น ชาวบ้านก็พากันออกมาดูน้ำที่ท่วมทุ่งนา แล้วช่วยกันขนข้าวของขึ้นที่สูง เพราะกลัวว่าน้ำจะขึ้นมาอีกในตอนกลางคืน และทุกคนต้องการให้เด็ก ๆ กับคนแก่ปลอดภัยก่อนที่ฟ้าจะมืดลงอีกครั้ง',
], 'ONE long sentence of 58 word tokens with clause spaces. The gold keeps it whole; the adapter divides spans of more than 28 words on purpose (readability), so a split here is a recorded trade-off, not only an error.');
c('nc-05', 'narrative-clause-space', [
  'วันนี้ครูพาเด็กทุกคนไปเที่ยวที่สวนสัตว์ใกล้โรงเรียน ',
  'เด็ก ๆ ได้เห็นช้างและยีราฟตัวใหญ่ที่สุดในสวน ',
  'ตอนบ่ายทุกคนนั่งกินข้าวด้วยกันใต้ต้นไม้ใหญ่',
], 'Three sentences of 11 to 12 word tokens each, 35 together.');

// ── one-word paragraph, heading-like lines ──
c('ow-01', 'one-word', ['สวัสดี']);
c('ow-02', 'one-word', ['ครับ']);
c('ow-03', 'one-word', ['“ใช่”']);
c('hl-01', 'heading-line', ['บทที่ ๑']);
c('hl-02', 'heading-line', ['บทที่ 3 ฝนแรกของปี']);
c('hl-03', 'heading-line', ['ตอนที่ 2 บ้านริมน้ำ']);
c('hl-04', 'heading-line', ['คำนำ']);
c('hl-05', 'heading-line', ['* * *'], 'A scene break.');
c('hl-06', 'heading-line', ['บทที่ 12. ฝนแรก'], 'A chapter number followed by a full stop.');

// ── a hard line break inside a sentence (book formatting) ──
c('hb-01', 'hard-break', ['ฉันเดินไปที่ตลาด\nเพื่อซื้อผักและผลไม้'], 'The line break is where a printed line wrapped, not the end of a sentence.');
c('hb-02', 'hard-break', ['“เราจะไปเที่ยวทะเล\nด้วยกันในวันหยุด” เขาพูด'], 'A wrapped line inside a quotation.');
c('hb-03', 'hard-break', ['ปี พ.ศ.\n2565 เป็นปีที่ฝนตกมาก'], 'A wrap right after an abbreviation.');
c('hb-04', 'hard-break', ['เมื่อวานนี้ฉันไปเที่ยว\nกับเพื่อนที่สวนสาธารณะ\nใกล้บ้านของเรา'], 'Two wraps inside one sentence.');
c('hb-05', 'hard-break', ['เขากลับถึงบ้านตอนค่ำ\n', 'แม่รออยู่หน้าบ้าน'], 'A line break that does end a sentence. A wrap and a real break look the same on the page; the gold takes the sentence reading.');
c('hb-06', 'hard-break', ['ฉันกินข้าวแล้ว\r\n', 'เธอล่ะ'], 'CRLF at a sentence end.');
c('hb-07', 'hard-break', ['ผมไปครับ\n\n', 'คุณล่ะ'], 'A blank line inside the paragraph.');

// ── leading indentation and odd whitespace ──
c('in-01', 'indentation', ['    ฝนตกหนักทั้งคืน'], 'Four leading spaces.');
c('in-02', 'indentation', ['　　ฝนตกหนักทั้งคืนจนน้ำท่วมถนนหลายสาย'], 'Two ideographic spaces as indentation.');
c('in-03', 'indentation', ['\tเขาตื่นแต่เช้า']);
c('in-04', 'indentation', ['  ผมชื่อสมชายครับ ', 'ผมอยู่เชียงใหม่ครับ'], 'Indentation, then a particle space.');
c('ws-01', 'whitespace', ['ฉันหิวแล้ว  ', 'กินข้าวกันเถอะ'], 'Two spaces between sentences.');
c('ws-02', 'whitespace', ['ผมชื่อสมชายครับ ', 'ผมอยู่เชียงใหม่ครับ'], 'A no-break space after a final particle.');
c('ws-03', 'whitespace', ['ฉันกลับบ้านแล้วครับ   '], 'Trailing spaces at the end of the paragraph.');

// ── other end marks ──
c('pu-01', 'end-mark', ['เธอจะไปไหน? ', 'ฉันจะไปตลาด']);
c('pu-02', 'end-mark', ['โอ้โห! ', 'ใหญ่มากเลย']);
c('pu-03', 'end-mark', ['ทำไมเป็นอย่างนั้น?! ', 'ฉันไม่เข้าใจ']);
c('pu-04', 'end-mark', ['เธอถามว่า “จะไปไหน?” ', 'เขาไม่ตอบ'], 'The question ends the first unit after the closing quotation mark.');
c('pu-05', 'end-mark', ['"ใครน่ะ?" เขาถาม'], 'A question mark inside the quotation; the reporting clause stays with it.');

export const CONSTRUCTED_UNIT_CASES: readonly UnitGoldCase[] = cases;

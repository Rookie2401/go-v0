/**
 * Reviewed word lists for the Thai orthography engine. Data only: this file imports nothing, so it can never form a
 * cycle with orthography.ts.
 *
 * Why lists exist. The spelling of a polysyllabic word does not always settle its reading: Pali / Sanskrit loans hide
 * linking syllables (ราชการ is ราด-ชะ-กาน), a ◌ำ syllable sometimes passes its class on (ตำรวจ) and sometimes does not
 * (สำนัก), and an unwritten vowel can be read either as part of one syllable or as a syllable of its own (ตลาด,
 * ประตู). The rules can only guess those, so they give them a low confidence. Words the author is certain of are
 * listed here with a phonemic respelling (regular by construction, decoded by the same rules) and are then read with
 * high confidence. A wrong entry would be a confident wrong tone, so only common words whose tones the author has
 * checked are listed. Each respelling syllable is read exactly as written (ะ ิ ุ explicit; ฺ joins two consonants).
 *
 * Two lists:
 *  - THAI_ORTH_EXCEPTIONS: the spelling is irregular, the rules cannot produce the spoken form.
 *  - THAI_ORTH_SETTLED: the rules do produce the right form, but only as one guess among several (the division of the
 *    letters, or a carried class); listing the word confirms it. Tests check that the rules agree with every entry.
 */
export interface ThaiOrthException {
  /** The written word, NFC, exactly as it appears in a text. */
  surface: string;
  /** Phonemic respelling, syllables joined by "-". */
  respelling: string;
  /** Why the rules cannot read it (plain words; shown in the rule sentence of each syllable). */
  note: string;
}

export interface ThaiOrthSettled {
  surface: string;
  respelling: string;
}

/**
 * Where each spoken syllable of a listed word sits in the written word: the spelling cut into as many parts as the
 * respelling has syllables, joined by "-" (the parts concatenate to the spelling; a letter that does double duty, like
 * the ร of สารภาพ, takes a part of its own). Words that are not here are laid over the whole spelling.
 */
export const THAI_ORTH_SPLITS: Readonly<Record<string, string>> = {
  สาเหตุ: 'สา-เหตุ',
  ประวัติ: 'ประ-วัติ',
  กษัตริย์: 'ก-ษัตริย์',
  อังกฤษ: 'อัง-กฤษ',
  สามารถ: 'สา-มารถ',
  นิรันดร์: 'นิ-รันดร์',
  ยุติธรรม: 'ยุ-ติ-ธรรม',
  เศรษฐกิจ: 'เศรษ-ฐ-กิจ',
  โทรศัพท์: 'โท-ร-ศัพท์',
  โทรทัศน์: 'โท-ร-ทัศน์',
  โรงพยาบาล: 'โรง-พ-ยา-บาล',
  อุบัติเหตุ: 'อุ-บั-ติ-เหตุ',
  ศาสนา: 'ศา-ส-นา',
  ผลิต: 'ผ-ลิต',
  บรม: 'บ-รม',
  ธรรมดา: 'ธรร-ม-ดา',
  ธรรมชาติ: 'ธรร-ม-ชาติ',
  วิทยา: 'วิ-ท-ยา',
  วิทยุ: 'วิ-ท-ยุ',
  วิทยาศาสตร์: 'วิ-ท-ยา-ศาสตร์',
  มหาวิทยาลัย: 'ม-หา-วิ-ท-ยา-ลัย',
  กรกฎาคม: 'ก-ร-ก-ฎา-คม',
  สารภาพ: 'สา-ร-ภาพ',
  ราชการ: 'รา-ช-การ',
  ตุ๊กตา: 'ตุ๊-ก-ตา',
  สกปรก: 'ส-ก-ปรก',
  ชนบท: 'ช-น-บท',
  คุณภาพ: 'คุ-ณ-ภาพ',
  สุขภาพ: 'สุ-ข-ภาพ',
  รัฐบาล: 'รั-ฐ-บาล',
  สมาชิก: 'ส-มา-ชิก',
  สมาคม: 'ส-มา-คม',
  สมาธิ: 'ส-มา-ธิ',
  อนุญาต: 'อ-นุ-ญาต',
  ปรารถนา: 'ปราร-ถ-นา',
  วัฒนธรรม: 'วั-ฒ-น-ธรรม',
  สำเร็จ: 'สำ-เร็จ',
  สำรวจ: 'สำ-รวจ',
  ตำรวจ: 'ตำ-รวจ',
  กำเนิด: 'กำ-เนิด',
  ดำริ: 'ดำ-ริ',
  สำนัก: 'สำ-นัก',
  อำนาจ: 'อำ-นาจ',
};

export const THAI_ORTH_EXCEPTIONS: readonly ThaiOrthException[] = [
  // vowel length / sound the spelling does not show
  { surface: 'น้ำ', respelling: 'น้าม', note: 'written with a short vowel, said long' },
  { surface: 'ก็', respelling: 'ก้อ', note: 'ก with ็ and no final is said kɔɔ with a falling tone' },
  { surface: 'จริง', respelling: 'จิง', note: 'the ร is silent' },
  { surface: 'ธรรม', respelling: 'ทำ', note: 'รร is a short a; ธ is said as ท' },
  { surface: 'สระ', respelling: 'สะ', note: 'the ร is silent' },
  { surface: 'เพชร', respelling: 'เพ็ด', note: 'ชร is said as a final t' },
  // Pali / Sanskrit endings read as a final stop
  { surface: 'ชาติ', respelling: 'ชาด', note: 'ติ is said as a final t' },
  { surface: 'เหตุ', respelling: 'เหด', note: 'ตุ is said as a final t' },
  { surface: 'ธาตุ', respelling: 'ทาด', note: 'ตุ is said as a final t' },
  { surface: 'สาเหตุ', respelling: 'สา-เหด', note: 'ตุ is said as a final t' },
  { surface: 'พุทธ', respelling: 'พุด', note: 'ทธ is said as a final t' },
  { surface: 'อาทิตย์', respelling: 'อา-ทิด', note: 'ตย์ is silent after a final t' },
  { surface: 'ประวัติ', respelling: 'ประ-หวัด', note: 'ติ is said as a final t; ว takes the class of ห' },
  { surface: 'ปัจจุบัน', respelling: 'ปัด-จุ-บัน', note: 'the first จ ends one syllable and starts the next' },
  { surface: 'ผลิต', respelling: 'ผะ-หฺลิด', note: 'ผล is not a cluster here: ผ is a syllable of its own' },
  { surface: 'บรม', respelling: 'บอ-รม', note: 'บร is not a cluster here: บอ is a syllable of its own' },
  { surface: 'ศึกษา', respelling: 'สึก-สา', note: 'ศ and ษ are both said as s' },
  { surface: 'นักศึกษา', respelling: 'นัก-สึก-สา', note: 'ศ and ษ are both said as s' },
  // unwritten linking syllables
  { surface: 'ผลไม้', respelling: 'ผน-ละ-ไม้', note: 'an unwritten syllable ละ links the two parts' },
  { surface: 'ธรรมดา', respelling: 'ทำ-มะ-ดา', note: 'an unwritten syllable มะ links the two parts' },
  { surface: 'ธรรมชาติ', respelling: 'ทำ-มะ-ชาด', note: 'an unwritten syllable มะ; ติ is said as a final t' },
  { surface: 'ศาสนา', respelling: 'สาด-สะ-หฺนา', note: 'ศาส is said as a stop final; the unwritten ห of the carry-over applies' },
  { surface: 'วิทยา', respelling: 'วิด-ทะ-ยา', note: 'Pali compound: ท is both the end of วิด and the start of ทะ' },
  { surface: 'วิทยุ', respelling: 'วิด-ทะ-ยุ', note: 'Pali compound: ท is both the end of วิด and the start of ทะ' },
  { surface: 'วิทยาศาสตร์', respelling: 'วิด-ทะ-ยา-สาด', note: 'Pali compound with a shared ท' },
  { surface: 'มหาวิทยาลัย', respelling: 'มะ-หา-วิด-ทะ-ยา-ลัย', note: 'Pali compound with a shared ท' },
  { surface: 'กรกฎาคม', respelling: 'กะ-ระ-กะ-ดา-คม', note: 'month name: กร and กฎ each hide a syllable' },
  { surface: 'ตุลาคม', respelling: 'ตุ-ลา-คม', note: 'month name' },
  { surface: 'สารภาพ', respelling: 'สา-ระ-พาบ', note: 'an unwritten syllable ระ follows the final ร' },
  { surface: 'ราชการ', respelling: 'ราด-ชะ-กาน', note: 'an unwritten syllable ชะ follows the final ช' },
  { surface: 'ตุ๊กตา', respelling: 'ตุ๊ก-กะ-ตา', note: 'an unwritten syllable กะ follows the final ก' },
  { surface: 'สกปรก', respelling: 'สก-กะ-ปฺรก', note: 'an unwritten syllable กะ follows the final ก' },
  { surface: 'ชนบท', respelling: 'ชน-นะ-บด', note: 'an unwritten syllable นะ follows the final น' },
  { surface: 'คุณภาพ', respelling: 'คุน-นะ-พาบ', note: 'an unwritten syllable นะ follows the final ณ' },
  { surface: 'สุขภาพ', respelling: 'สุก-ขะ-พาบ', note: 'an unwritten syllable ขะ follows the final ข' },
  { surface: 'รัฐบาล', respelling: 'รัด-ถะ-บาน', note: 'an unwritten syllable ถะ follows the final ฐ' },
  // Pali prefixes and words where the class carry-over does not apply
  { surface: 'สมาชิก', respelling: 'สะ-มา-ชิก', note: 'no class carry-over: ม keeps its own class' },
  { surface: 'สมาคม', respelling: 'สะ-มา-คม', note: 'no class carry-over: ม keeps its own class' },
  { surface: 'สมาธิ', respelling: 'สะ-มา-ทิ', note: 'no class carry-over: ม keeps its own class' },
  { surface: 'อนุญาต', respelling: 'อะ-นุ-ยาด', note: 'no class carry-over: น keeps its own class' },
  { surface: 'มนุษย์', respelling: 'มะ-นุด', note: 'ษย์ is silent after a final t' },
  { surface: 'เกษตร', respelling: 'กะ-เสด', note: 'ษตร is said as a final t' },
  // ◌ำ followed by a low sonorant: the class is passed on in some words, not in others
  { surface: 'สำเร็จ', respelling: 'สำ-เหฺร็ด', note: 'ร takes the class of ห after ◌ำ' },
  { surface: 'สำรวจ', respelling: 'สำ-หฺรวด', note: 'ร takes the class of ห after ◌ำ' },
  { surface: 'ตำรวจ', respelling: 'ตำ-หฺรวด', note: 'ร takes the class of ห after ◌ำ' },
  { surface: 'กำเนิด', respelling: 'กำ-เหฺนิด', note: 'น takes the class of ห after ◌ำ' },
  { surface: 'ดำริ', respelling: 'ดำ-หฺริ', note: 'ร takes the class of ห after ◌ำ' },
  { surface: 'สำนัก', respelling: 'สำ-นัก', note: 'no class carry-over after ◌ำ: น keeps its own class' },
  { surface: 'อำนาจ', respelling: 'อำ-นาด', note: 'no class carry-over after ◌ำ: น keeps its own class' },
  // other Pali / Sanskrit words whose reading the letters do not show
  { surface: 'กษัตริย์', respelling: 'กะ-สัด', note: 'ษัตริย์ is said as a short a plus a final t' },
  { surface: 'ปรารถนา', respelling: 'ปราด-ถะ-หฺนา', note: 'รถ is said as a final t and ถะ is a syllable of its own' },
  { surface: 'อังกฤษ', respelling: 'อัง-กริด', note: 'ฤษ is said as ริด' },
  { surface: 'สามารถ', respelling: 'สา-มาด', note: 'รถ is said as a final t' },
  { surface: 'วัฒนธรรม', respelling: 'วัด-ทะ-นะ-ทำ', note: 'ฒ ends the first syllable and starts the next' },
  { surface: 'ยุติธรรม', respelling: 'ยุด-ติ-ทำ', note: 'ติ is said as ติ but ธรรม is said as ทำ' },
  { surface: 'เศรษฐกิจ', respelling: 'เสด-ถะ-กิด', note: 'ษฐ ends the first syllable and starts the next' },
  { surface: 'โทรศัพท์', respelling: 'โท-ระ-สับ', note: 'ทร is said as a syllable of its own here' },
  { surface: 'โทรทัศน์', respelling: 'โท-ระ-ทัด', note: 'ทร is said as a syllable of its own here' },
  { surface: 'อาจารย์', respelling: 'อา-จาน', note: 'รย์ is said as a final n' },
  { surface: 'นิรันดร์', respelling: 'นิ-รัน', note: 'ดร์ is silent' },
  { surface: 'โรงพยาบาล', respelling: 'โรง-พะ-ยา-บาน', note: 'พ is said พะ, a syllable of its own' },
  { surface: 'อุบัติเหตุ', respelling: 'อุ-บัด-ติ-เหด', note: 'บัติ is said บัด-ติ and ตุ is said as a final t' },
  { surface: 'พินาศ', respelling: 'พิ-นาด', note: 'ศ is said as a final t' },
];

export const THAI_ORTH_SETTLED: readonly ThaiOrthSettled[] = [
  // unwritten vowel and carried class: the second syllable takes the class of the first letter
  { surface: 'ขนม', respelling: 'ขะ-หฺนม' },
  { surface: 'ตลาด', respelling: 'ตะ-หฺลาด' },
  { surface: 'สนุก', respelling: 'สะ-หฺนุก' },
  { surface: 'ถนน', respelling: 'ถะ-หฺนน' },
  { surface: 'อร่อย', respelling: 'อะ-หฺร่อย' },
  { surface: 'จมูก', respelling: 'จะ-หฺมูก' },
  { surface: 'สบาย', respelling: 'สะ-บาย' },
  { surface: 'สวัสดี', respelling: 'สะ-หฺวัด-ดี' },
  { surface: 'ฝรั่ง', respelling: 'ฝะ-หฺรั่ง' },
  { surface: 'สมุด', respelling: 'สะ-หฺมุด' },
  { surface: 'ตลก', respelling: 'ตะ-หฺลก' },
  { surface: 'ขยัน', respelling: 'ขะ-หฺยัน' },
  { surface: 'สนาม', respelling: 'สะ-หฺนาม' },
  { surface: 'ฉลาด', respelling: 'ฉะ-หฺลาด' },
  { surface: 'ชนะ', respelling: 'ชะ-นะ' },
  { surface: 'ทหาร', respelling: 'ทะ-หาน' },
  { surface: 'มหา', respelling: 'มะ-หา' },
  { surface: 'กะทิ', respelling: 'กะ-ทิ' },
  { surface: 'ตะกร้า', respelling: 'ตะ-กร้า' },
  { surface: 'มะพร้าว', respelling: 'มะ-พร้าว' },
  { surface: 'ชำระ', respelling: 'ชำ-ระ' },
  { surface: 'สะอาด', respelling: 'สะ-อาด' },
  { surface: 'พยายาม', respelling: 'พะ-ยา-ยาม' },
  { surface: 'อนาคต', respelling: 'อะ-นา-คด' },
  { surface: 'อดีต', respelling: 'อะ-ดีด' },
  { surface: 'ธนาคาร', respelling: 'ทะ-นา-คาน' },
  { surface: 'นาฬิกา', respelling: 'นา-ลิ-กา' },
  { surface: 'สัปดาห์', respelling: 'สับ-ดา' },
  { surface: 'ประชาชน', respelling: 'ประ-ชา-ชน' },
  { surface: 'ประทาน', respelling: 'ประ-ทาน' },
  { surface: 'ประตู', respelling: 'ประ-ตู' },
  { surface: 'ประเทศ', respelling: 'ประ-เทด' },
  { surface: 'กระเป๋า', respelling: 'กระ-เป๋า' },
  { surface: 'อธรรม', respelling: 'อะ-ทำ' },
  // division of the letters: a cluster, a leading ห, or a final could also start the next syllable
  { surface: 'หนังสือ', respelling: 'หนัง-สือ' },
  { surface: 'ภาษา', respelling: 'พา-สา' },
  { surface: 'กรุงเทพ', respelling: 'กรุง-เทพ' },
  { surface: 'ผู้หญิง', respelling: 'ผู้-หฺยิง' },
  { surface: 'ครอบครัว', respelling: 'ครอบ-ครัว' },
  { surface: 'รถไฟ', respelling: 'รด-ไฟ' },
  { surface: 'ต้นไม้', respelling: 'ต้น-ไม้' },
  { surface: 'พระจันทร์', respelling: 'พระ-จัน' },
  { surface: 'พระอาทิตย์', respelling: 'พระ-อา-ทิด' },
  { surface: 'พรุ่งนี้', respelling: 'พรุ่ง-นี้' },
  { surface: 'กลางคืน', respelling: 'กลาง-คืน' },
  { surface: 'อย่างไร', respelling: 'อย่าง-ไร' },
  { surface: 'ตกใจ', respelling: 'ตก-ใจ' },
  { surface: 'กลับบ้าน', respelling: 'กลับ-บ้าน' },
  { surface: 'สังคม', respelling: 'สัง-คม' },
];

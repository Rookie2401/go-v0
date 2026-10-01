/**
 * The Thai course ladder (Thailand team): Stage 0 and Grades 1–9, then open-ended reading.
 *
 * Source of the ladder: the course owner's specification (docs/THAI_COURSE.md). Titles are as given there.
 *
 * RIGHTS: nothing in this file has been checked against a catalogue, a publisher or a lawyer. Every work is
 * therefore `canBundle: false`, `userImportOnly: true`, `verified: false`. Where an author is named it is
 * from general knowledge and still `bibliographyVerified: false`; where I was not sure, the author is left out
 * rather than guessed. A stated `basis` is a lead for verification, never a conclusion.
 */
import type { AssistanceProfile, HelpLayer, RegisterTag, Stage, Work, WorkRights, WorkRole } from '../core';
import { ids } from '../core';

export const THAI_COURSE_ID = 'thailand-th';
const LANG = 'th' as const;

// ───────────────────────────── assistance profiles ─────────────────────────────

const L = (...layers: HelpLayer[]): HelpLayer[] => layers;

/** The system removes itself as the learner advances. English rescue is present in every profile. */
export const THAI_ASSISTANCE: Record<string, AssistanceProfile> = {
  '0': { visibility: 'heavy', defaultHighlight: 'strong', layers: L('gloss', 'decoding', 'phrase', 'english', 'grammar', 'sentence', 'history'), englishRescue: 'easy', romanization: 'rescue', decodingFirst: true, targetLanguageDefinitions: false, chrome: 'full' },
  g1: { visibility: 'heavy', defaultHighlight: 'strong', layers: L('gloss', 'phrase', 'grammar', 'decoding', 'english', 'sentence', 'history'), englishRescue: 'easy', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: false, chrome: 'full' },
  g2: { visibility: 'heavy', defaultHighlight: 'subtle', layers: L('gloss', 'phrase', 'grammar', 'decoding', 'sentence', 'english', 'history'), englishRescue: 'easy', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: false, chrome: 'full' },
  g3: { visibility: 'contextual', defaultHighlight: 'subtle', layers: L('gloss', 'phrase', 'definition', 'grammar', 'decoding', 'sentence', 'english', 'history'), englishRescue: 'secondary', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'full' },
  g4: { visibility: 'contextual', defaultHighlight: 'subtle', layers: L('gloss', 'phrase', 'discourse', 'definition', 'grammar', 'sentence', 'english', 'decoding', 'history'), englishRescue: 'secondary', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'reduced' },
  g5: { visibility: 'light', defaultHighlight: 'subtle', layers: L('gloss', 'phrase', 'definition', 'discourse', 'note', 'grammar', 'sentence', 'english', 'history', 'decoding'), englishRescue: 'secondary', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'reduced' },
  g6: { visibility: 'clean', defaultHighlight: 'off', layers: L('gloss', 'phrase', 'definition', 'note', 'discourse', 'clause-structure', 'grammar', 'sentence', 'history', 'english', 'decoding'), englishRescue: 'deep', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'reduced' },
  g7: { visibility: 'clean', defaultHighlight: 'off', layers: L('gloss', 'phrase', 'definition', 'note', 'discourse', 'clause-structure', 'grammar', 'sentence', 'history', 'english', 'decoding'), englishRescue: 'deep', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'minimal' },
  g8: { visibility: 'clean', defaultHighlight: 'off', layers: L('gloss', 'note', 'phrase', 'definition', 'history', 'discourse', 'clause-structure', 'grammar', 'sentence', 'english', 'decoding'), englishRescue: 'deep', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'minimal' },
  g9: { visibility: 'invisible', defaultHighlight: 'off', layers: L('gloss', 'history', 'note', 'phrase', 'definition', 'discourse', 'clause-structure', 'grammar', 'sentence', 'english', 'decoding'), englishRescue: 'on-request', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'minimal' },
  open: { visibility: 'invisible', defaultHighlight: 'off', layers: L('gloss', 'history', 'note', 'phrase', 'definition', 'discourse', 'clause-structure', 'grammar', 'sentence', 'english', 'decoding'), englishRescue: 'on-request', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'minimal' },
};

// ───────────────────────────── stages ─────────────────────────────

const stage = (index: number, key: string, label: string, kind: Stage['kind'], purpose: string[], band?: string): Stage => ({
  id: ids.stage(THAI_COURSE_ID, key), courseId: THAI_COURSE_ID, lang: LANG, index, key, label, kind, purpose, band, assistance: THAI_ASSISTANCE[key],
});

export const THAI_STAGES: Stage[] = [
  stage(0, '0', 'Stage 0 — Pre-reader', 'pre-reader', ['Thai script: consonants, vowels, syllable structure', 'tone recognition and tone marks', 'final consonants and common spelling patterns', 'first very frequent words', 'from decoding into actual reading']),
  stage(1, 'g1', 'Grade 1', 'grade', ['first sustained narrative', 'very frequent verbs', 'people, animals, home, school, ordinary actions', 'simple dialogue', 'phrase recognition', 'basic Thai word order']),
  stage(2, 'g2', 'Grade 2', 'grade', ['sentence fluency', 'recurring narrative structures', 'short dialogue', 'high-frequency phrases', 'simple aspect and serial-verb constructions']),
  stage(3, 'g3', 'Grade 3', 'grade', ['paragraph comprehension', 'unfamiliar narratives in familiar grammar', 'first substantial cultural and literary exposure', 'growing automaticity']),
  stage(4, 'g4', 'Grade 4', 'grade', ['from school reader to real children\'s literature', 'longer narrative continuity', 'discourse particles', 'pronoun omission', 'classifiers', 'colloquial and narrative syntax', 'chapter-level comprehension']),
  stage(5, 'g5', 'Grade 5', 'grade', ['reading fluency', 'larger vocabulary', 'descriptive and imaginative language', 'author-specific vocabulary', 'more abstract language'], 'approximately A2 → B1'),
  stage(6, 'g6', 'Grade 6', 'grade', ['long-form native prose', 'cultural vocabulary', 'southern Thai context', 'Buddhist and Muslim community context', 'biography and cultural history', 'explanatory prose']),
  stage(7, 'g7', 'Grade 7', 'grade', ['emotional implication', 'literary economy and indirect meaning', 'more sophisticated prose', 'cultural explanation', 'biography, history, food and cultural vocabulary'], 'B1 toward B2'),
  stage(8, 'g8', 'Grade 8 — B2 consolidation', 'grade', ['breadth and volume so adult literature is not a new linguistic universe', 'standard vs literary vs regional vs historical Thai', 'short-story competence', 'older literary prose'], 'B2'),
  stage(9, 'g9', 'Grade 9 — adult literary entry', 'grade', ['sustained adult prose', 'vocabulary consolidation', 'cultural study', 'the assistance system all but disappears'], 'B2–C1'),
  stage(10, 'open', 'Open reading', 'open', ['native Thai reading recommended from the learner model, no grade numbers']),
];

// ───────────────────────────── works ─────────────────────────────

const UNKNOWN_RIGHTS: WorkRights = {
  copyrightStatus: 'unknown', permission: 'unknown', canBundle: false, userImportOnly: true, audiobook: 'unknown', verified: false,
  acquisitionNotes: 'Rights not researched. Treat as a curriculum recommendation: import a copy you are entitled to use.',
};
const modern = (basis: string): WorkRights => ({ ...UNKNOWN_RIGHTS, copyrightStatus: 'in-copyright', permission: 'none', basis: `${basis} Presumed in copyright; not verified.` });
const lead = (basis: string): WorkRights => ({ ...UNKNOWN_RIGHTS, basis: `${basis} A lead for verification, not a conclusion.` });

let order = 0;
interface W { slug: string; title: string; role?: WorkRole; author?: string; publisher?: string; step?: string; purpose?: string[]; registers?: RegisterTag[]; rights?: WorkRights; optional?: boolean; notes?: string }
const works = (stageKey: string, list: W[]): Work[] => list.map((w) => ({
  id: ids.work(THAI_COURSE_ID, w.slug), courseId: THAI_COURSE_ID, lang: LANG, stageId: ids.stage(THAI_COURSE_ID, stageKey),
  role: w.role ?? 'subsidiary', order: order++, step: w.step, title: w.title, author: w.author, publisher: w.publisher,
  purpose: w.purpose ?? [], registers: w.registers, rights: w.rights ?? UNKNOWN_RIGHTS, bibliographyVerified: false,
  optional: w.optional ?? (w.role === undefined || w.role === 'subsidiary' || w.role === 'extensive'), notes: w.notes,
}));

const MOE = modern('Thai Ministry of Education primary reader series (used in schools c. 1978–1994).');
const OBEC = lead('OBEC (สพฐ.) supplementary reader; distribution terms of the specific edition are not known.');
const TRADITIONAL = lead('Traditional / pre-20th-century text; modern school editions, annotations and retellings may be protected. Verify the exact edition.');

export const THAI_WORKS: Work[] = [
  // ── Stage 0 ──
  ...works('0', [
    { slug: 'an-an-an', title: 'อ่าน อาน อ๊าน — ระดับ 1–4', role: 'spine', purpose: ['script acquisition', 'decoding into reading', 'first frequent vocabulary'], rights: lead('Leveled reader series (about twenty very short books). Publisher and licence terms not checked.'), notes: 'Use the full available leveled series.' },
    { slug: 'pet-hai', title: 'เป็ดหาย', role: 'extensive' },
    { slug: 'yai-ka-ta', title: 'ยายกะตา', role: 'extensive' },
    { slug: 'mue-khong-chan', title: 'มือของฉัน', role: 'extensive' },
    { slug: 'keng', title: 'เก่ง', role: 'extensive' },
    { slug: 'tukkata-yot-rak', title: 'ตุ๊กตายอดรัก', role: 'extensive' },
  ]),
  // ── Grade 1 ──
  ...works('g1', [
    { slug: 'mana-mani-1', title: 'มานะ มานี ป.1', role: 'spine', publisher: 'กระทรวงศึกษาธิการ', rights: MOE, purpose: ['first sustained narrative', 'frequent verbs', 'simple dialogue', 'basic word order'] },
    { slug: 'chai-di-su-suea', title: 'ใจดีสู้เสือ', rights: OBEC },
    { slug: 'yak-mi-pik', title: 'อยากมีปีก', rights: OBEC },
    { slug: 'dai-thi-khi-phae-lai', title: 'ได้ที่ขี่แพะไล่', rights: OBEC },
    { slug: 'kratai-yae-suea', title: 'กระต่ายแหย่เสือ', rights: OBEC },
  ]),
  // ── Grade 2 ──
  ...works('g2', [
    { slug: 'mana-mani-2', title: 'มานะ มานี ป.2', role: 'spine', publisher: 'กระทรวงศึกษาธิการ', rights: MOE, purpose: ['sentence fluency', 'recurring narrative structures', 'aspect and serial verbs'] },
    { slug: 'obec-readers-p1-2', title: 'หนังสืออ่านเพิ่มเติม สพฐ. ป.1–2 (remaining suitable titles)', rights: OBEC },
    { slug: 'aesop-simple', title: 'นิทานอีสป (simple retellings)', rights: lead('The fables are ancient; each Thai retelling is its own work. Verify the edition used.') },
    { slug: 'thai-folktales-simple', title: 'นิทานพื้นบ้านไทย (simple)', rights: TRADITIONAL },
  ]),
  // ── Grade 3 ──
  ...works('g3', [
    { slug: 'mana-mani-3', title: 'มานะ มานี ป.3', role: 'spine', publisher: 'กระทรวงศึกษาธิการ', rights: MOE, purpose: ['paragraph comprehension', 'automaticity'] },
    { slug: 'chotmai-chak-phi-kaeo', title: 'จดหมายจากพี่แก้ว' },
    { slug: 'luk-sat-tang-tang', title: 'ลูกสัตว์ต่างๆ' },
    { slug: 'sang-thong-ti-khli', title: 'สังข์ทอง ตอน ตีคลี', registers: ['literary', 'archaic', 'royal'], rights: TRADITIONAL },
    { slug: 'lawichai-khawi', title: 'หลวิไชย–คาวี', registers: ['literary', 'archaic'], rights: TRADITIONAL },
  ]),
  // ── Grade 4 ──
  ...works('g4', [
    { slug: 'mana-mani-4', title: 'มานะ มานี ป.4', role: 'spine', publisher: 'กระทรวงศึกษาธิการ', rights: MOE },
    { slug: 'kaeo-chom-kaen', title: 'แก้วจอมแก่น', role: 'spine', author: 'แว่นแก้ว', rights: modern('Modern children\'s novel (first published 1978).'), purpose: ['the first real Thai book', 'chapter-level comprehension', 'discourse particles', 'colloquial narrative syntax'], notes: 'A milestone: it should feel like reading a real book, not completing course material.' },
    { slug: 'phap-phasit-thai', title: 'ภาพภาษิตไทย' },
    { slug: 'thai-legends-selected', title: 'ตำนานและนิทานพื้นบ้านไทย (selected)', rights: TRADITIONAL },
    { slug: 'readers-p3-4', title: 'หนังสืออ่านเพิ่มเติม ป.3–4 (additional appropriate titles)', rights: OBEC },
  ]),
  // ── Grade 5 ──
  ...works('g5', [
    { slug: 'mana-mani-5', title: 'มานะ มานี ป.5', role: 'spine', publisher: 'กระทรวงศึกษาธิการ', rights: MOE, notes: 'Increasingly fluency material rather than instruction.' },
    { slug: 'mana-mani-6', title: 'มานะ มานี ป.6', role: 'spine', publisher: 'กระทรวงศึกษาธิการ', rights: MOE, notes: 'Fluency material.' },
    { slug: 'som-si-muang', title: 'ส้มสีม่วง', role: 'spine', author: 'ดาวกระจาย', rights: modern('Modern children\'s novel.'), purpose: ['reading fluency', 'descriptive and imaginative language', 'author-specific vocabulary'] },
    { slug: 'si-thao-chao-tua-chiu', title: 'สีเทาเจ้าตัวจิ๋ว' },
    { slug: 'sano-noi', title: 'โสนน้อย' },
    { slug: 'nu-lo-kap-mo-mo', title: 'หนูหล่อกับมอมอ' },
    { slug: 'niyai-dao', title: 'นิยายดาว' },
  ]),
  // ── Grade 6 ──
  ...works('g6', [
    { slug: 'waeng-thi-rak', title: 'แว้งที่รัก', role: 'spine', author: 'ชบาบาน', registers: ['standard', 'regional-south'], rights: modern('Modern youth novel.'), purpose: ['long-form native prose', 'southern Thai context', 'Buddhist and Muslim community life'] },
    { slug: 'khwan-song', title: 'ขวัญสงฆ์', author: 'ชมัยภร แสงกระจ่าง', registers: ['standard', 'religious'], rights: modern('Modern youth novel.') },
    { slug: 'khuat-khon-yu-hon-dai', title: 'ฃวดฅนอยู่หนใด' },
    { slug: 'youth-fiction-lower-secondary', title: 'วรรณกรรมเยาวชนระดับมัธยมต้น (selected)' },
    { slug: 'dek-naeo', title: 'เด็กแนว', role: 'nonfiction', purpose: ['biography and cultural history', 'explanatory prose'] },
    { slug: 'cho-chang-kap-kho-khon', title: 'ช ช้าง กับ ฅ ฅน', role: 'nonfiction', purpose: ['cultural history', 'explanatory prose'] },
  ]),
  // ── Grade 7 ──
  ...works('g7', [
    { slug: 'khwam-suk-khong-kathi', title: 'ความสุขของกะทิ', role: 'spine', author: 'งามพรรณ เวชชาชีวะ', rights: modern('Modern novel (first published 2003).'), purpose: ['emotional implication', 'literary economy', 'indirect meaning'] },
    { slug: 'kathi-tam-ha-phra-chan', title: 'ความสุขของกะทิ ตอน ตามหาพระจันทร์', role: 'spine', author: 'งามพรรณ เวชชาชีวะ', rights: modern('Modern novel.'), notes: 'May finish Grade 7 or begin Grade 8 (step 8.1), depending on measured difficulty for the learner.' },
    { slug: 'nai-lok-bai-lek', title: 'ในโลกใบเล็ก', author: 'งามพรรณ เวชชาชีวะ', rights: modern('Modern novel.') },
    { slug: 'khanom-mae-oei', title: 'ขนมแม่เอ๊ย', role: 'nonfiction', author: 'ส. พลายน้อย', rights: modern('Modern nonfiction.'), purpose: ['food, history and cultural vocabulary', 'explanatory prose'] },
  ]),
  // ── Grade 8 ──
  ...works('g8', [
    { slug: 'dek-chai-maliwan', title: 'เด็กชายมะลิวัลย์', role: 'spine', step: '8.2', author: 'ประภัสสร เสวิกุล', rights: modern('Modern novel.'), purpose: ['accessible native historical / youth prose'] },
    { slug: 'phi-suea-lae-dok-mai', title: 'ผีเสื้อและดอกไม้', role: 'spine', step: '8.3', author: 'นิพพานฯ', registers: ['standard', 'regional-south'], rights: modern('Modern novel.'), purpose: ['sustained B2-range narrative'] },
    { slug: 'wela-nai-khuat-kaeo', title: 'เวลาในขวดแก้ว', role: 'spine', step: '8.4', author: 'ประภัสสร เสวิกุล', rights: modern('Modern novel.'), purpose: ['adolescent and adult themes', 'reflective prose'], notes: 'Political and social content is reading material, never persuasion.' },
    { slug: 'mom', title: 'มอม (in เพื่อนนอน)', role: 'spine', step: '8.5', author: 'ม.ร.ว. คึกฤทธิ์ ปราโมช', registers: ['literary'], rights: modern('Short story by an author who died in 1995.'), purpose: ['an older major stylist in short form'] },
    { slug: 'yu-kap-kong', title: 'อยู่กับก๋ง', role: 'spine', step: '8.6', author: 'หยก บูรพา', registers: ['standard', 'teochew'], rights: modern('Modern novel.'), purpose: ['Chinese-Thai life', 'Teochew cultural vocabulary', 'bridge to จดหมายจากเมืองไทย'] },
    { slug: 'luk-isan', title: 'ลูกอีสาน', role: 'spine', step: '8.7', author: 'คำพูน บุญทวี', registers: ['standard', 'regional-isan'], rights: modern('Modern novel.'), purpose: ['rural northeastern Thailand', 'Isan / Lao-influenced language'], notes: 'Regional vocabulary must be marked as regional, never presented as ordinary Central Thai.' },
    { slug: 'ko-kong-sai', title: 'ก่อกองทราย', role: 'spine', step: '8.8', author: 'ไพฑูรย์ ธัญญา', rights: modern('Modern short-story collection.'), purpose: ['short-story competence', 'rapid context reconstruction'] },
    { slug: 'khang-lang-phap', title: 'ข้างหลังภาพ', role: 'spine', step: '8.9', author: 'ศรีบูรพา', registers: ['literary', 'formal', 'historical'], rights: lead('First published 1937; the author died in 1974. Under a life + 50 years term the work may now be out of copyright in Thailand; other jurisdictions differ and a clean source text is still required.'), purpose: ['older literary prose', 'formal dialogue', 'pre-war register'] },
  ]),
  // ── Grade 9 ──
  ...works('g9', [
    { slug: 'chotmai-chak-mueang-thai', title: 'จดหมายจากเมืองไทย', role: 'spine', author: 'โบตั๋น', registers: ['standard', 'teochew', 'formal'], rights: modern('Modern novel (first published 1969).'), purpose: ['first adult literary capstone', 'Chinese immigration, family, commerce, generations', 'sustained reading'] },
  ]),
  // ── spoken corpora (GoListen, when audio and rights exist) ──
  ...works('0', [
    { slug: 'audio-nithan-phasom-phasa', title: 'นิทานผสมภาษาพาสนุก', role: 'audio' },
    { slug: 'audio-kids-hour', title: 'Kids Hour / ชั่วโมงนิทาน', role: 'audio' },
    { slug: 'audio-hu-yao-lao-rueang', title: 'หูยาวเล่าเรื่อง', role: 'audio' },
    { slug: 'audio-nithan-suphasit', title: 'นิทานสุภาษิต', role: 'audio' },
    { slug: 'audio-phra-athit-yim-chaeng', title: 'พระอาทิตย์ยิ้มแฉ่ง', role: 'audio' },
  ]),
  ...works('g5', [{ slug: 'audio-mong-adit', title: 'มองอดีต (easier episodes)', role: 'audio' }]),
  ...works('g8', [
    { slug: 'audio-pop-sci', title: 'POP SCI วิทย์ติดป๊อป', role: 'audio' },
    { slug: 'audio-beyond-chronicles', title: 'Beyond Chronicles', role: 'audio' },
    { slug: 'audio-sci-tech', title: 'Sci & Tech', role: 'audio' },
    { slug: 'audio-the-active', title: 'The Active Podcast', role: 'audio' },
    { slug: 'audio-back-to-basics', title: 'Back To Basics', role: 'audio' },
  ]),
];

/** Texts that never belong to the ladder: Scripture is its own continuous corpus, available from the beginning. */
export const THAI_OUTSIDE_LADDER = ['scripture', 'testimony'] as const;

/**
 * Scripture for the Thai course, as policy data (the course owner's decision of 2026-10-01). Nothing here is bundled,
 * and nothing here unblocks Thai Scripture: the Scripture gate (identified translation, verified wording, established
 * rights) applies unchanged.
 */
export const THAI_SCRIPTURE_POLICY = {
  /**
   * Was the intended production translation. Per the course owner's reference of 2026-10-01 the rights holder
   * declined both the text functions and third-party audio use. It is therefore not stored, displayed, analysed,
   * packaged or played inside the app; a learner's local import is not a substitute for that permission. The most the
   * app may do is link out to the publisher's own service, and such a link is never listening evidence.
   */
  declined: {
    id: 'THSV11', name: 'Thai Standard Version 2011', rightsHolder: 'Thailand Bible Society',
    status: 'permission-declined', canBundleText: false, canBundleAudio: false, externalLinkOnly: true,
  },
  /**
   * The replacement named in the course owner's reference. NOT adopted and NOT ingested: the licence is as stated by
   * the publisher's notice and still has to be verified from the metadata of the exact release that is downloaded
   * (translation id + immutable release id), with attribution and ShareAlike handling in place, before any text enters
   * the app. English rescue stays the public-domain World English Bible.
   */
  candidate: {
    name: 'Biblica Open Thai Common Version 2025', publisher: 'Biblica', statedLicence: 'CC BY-SA 4.0',
    status: 'candidate-unverified', releaseId: undefined as string | undefined, canBundleText: false, canBundleAudio: false,
  },
  /**
   * May be used ONLY as an explicitly labelled technical fixture for testing the Scripture pipeline: it is a draft
   * translation. It is never presented as the course Bible and never published in the normal library. Its
   * public-domain status is as stated by the course owner and must be recorded with its source when it is fetched.
   */
  technicalFixture: { name: 'Thai Freedom Bible', status: 'technical-fixture-only', draftTranslation: true },
  /** Not to be used as a workaround unless their licensing is separately approved for this use. */
  notApproved: ['Thai KJV', 'TH1940'],
} as const;

/** Audio rights are independent of text rights: a recording is attached only with its own rights and provenance on record. */
export const THAI_AUDIO_POLICY = { bundledRecordings: 'none', requires: ['explicit rights for the recording', 'provenance of the recording'] } as const;

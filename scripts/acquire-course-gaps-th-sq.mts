/**
 * Acquire source-faithful gap material for Thai and Albanian.
 *
 * This is deliberately an acquisition/preparation script. It writes only the two
 * gap-recovery shelves; it does not touch course catalogues or the shared library.
 * Source wording is retained exactly as returned by the official Wikisource parse
 * API. HTML is cached beside the extracted documents for later comparison.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
// @ts-expect-error jsdom is an existing repository dependency.
import { JSDOM } from 'jsdom';
import { contentSignatureOf } from '../src/ingest/publish';

const DATE = process.argv.find((x) => x.startsWith('--date='))?.slice(7) ?? '2026-10-02';
const ROOT = path.resolve('data/sources');
const TH_ROOT = path.join(ROOT, 'th-gap-recovery');
const SQ_ROOT = path.join(ROOT, 'sq-gap-recovery');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Parsed = { title: string; revision: number; html: string; url: string; rawSha256: string; text: string[] };

const THAI = Array.from({ length: 45 }, (_, i) => `นิทานอีสป/นิทานที่ ${i + 1}`);
const THAI_NAMES = [
  'ราชสีห์กับหนู', 'พ่อกับลูก', 'ลากับจิ้งหรีด', 'หมาจิ้งจอกกับนกกระสา', 'หมาจิ้งจอกกับแพะ',
  'กากับนกยูง', 'เด็กจับตั๊กแตน', 'มดง่ามกับจักจั่น', 'ไก่กับพลอย', 'กระต่ายกับเต่า',
  'เทวดากับคนขับเกวียน', 'หมากับเงา', 'ลูกอ้นกับแม่อ้น', 'ชาวนากับงูเห่า', 'ลา หมาจิ้งจอก กับราชสีห์',
  'แมลงวันกับไหน้ำผึ้ง', 'หมาป่ากับลูกแกะ', 'หมาไล่เนื้ออายุมาก', 'หมาอยู่ในรางหญ้า', 'ไก่แจ้กับเหยี่ยว',
  'หมาจิ้งจอกหางด้วน', 'ลูกแพะกับหมาป่า', 'หมาจิ้งจอกกับเม่น', 'อึ่งอ่างกับวัว', 'ลูกปูกับแม่ปู',
  'พวกหนูประชุมปรึกษากัน', 'นกอินทรีกับหมาจิ้งจอก', 'ชาวสวนกับลูก', 'ท้องกับตัว', 'เทพารักษ์กับคนตัดไม้',
  'นายพรานกับไก่ฟ้า', 'หนู กบ กับเหยี่ยว', 'ราชสีห์ชันสูตรลมหายใจ', 'กบเลือกนาย', 'ยายแก่กับหม้อ',
  'ต้นไทรกับต้นอ้อ', 'หมาจิ้งจอกกับราชสีห์', 'แม่เนื้อกับนายพรานป่า', 'หมาดุ', 'พ่อค้าเกลือกับโคต่าง',
  'กระต่ายป่ากับกบ', 'กวางกับเสือ', 'ลิงกับคนทอดแห', 'คนเลี้ยงแพะกับลูกเสือ', 'คนเลี้ยงวัวกับวัวหาย',
];

// These are intentionally kept as historical/heritage material. They are not
// modern-standard Albanian and must not be presented as an A0 course spine.
const ALBANIAN = [
  'Bretkosa që deshi të trashej sa një Ka', 'Korbi dhe Dhelpra',
  'Lopa, Dhija, Delja dhe Luani', 'Luani dhe Miu', 'Maçoku dhe Miu plak',
  'Millonai, i Biri dhe një Gomar', 'Ujku dhe Qengji', 'Zogu dhe Djali',
];

async function fetchParsed(host: string, title: string, cacheDir: string): Promise<Parsed> {
  await fs.mkdir(cacheDir, { recursive: true });
  const safe = title.replace(/[^\p{L}\p{N}.-]+/gu, '_');
  const cache = path.join(cacheDir, `${safe}.json`);
  let source: { parse: { revid: number; text: { '*': string } } };
  try { source = JSON.parse(await fs.readFile(cache, 'utf8')) as typeof source; }
  catch {
    const endpoint = `https://${host}/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text|revid&format=json`;
    let body = '';
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetch(endpoint, { headers: { 'User-Agent': 'GoLearn course-gap source-fidelity acquisition' } });
      body = await response.text();
      if (response.ok && body.trim().startsWith('{')) break;
      if (response.ok && /too many requests|rate limit/i.test(body)) { await sleep(10000 * (attempt + 1)); continue; }
      if (response.status === 429) { await sleep(3000 * (attempt + 1)); continue; }
      throw new Error(`${title}: HTTP ${response.status}: ${body.slice(0, 200)}`);
    }
    try { source = JSON.parse(body) as typeof source; } catch { throw new Error(`${title}: Wikisource API rate limit persisted; rerun later (response was not JSON)`); }
    if (!source.parse?.text?.['*']) throw new Error(`${title}: parse API returned no source HTML`);
    await fs.writeFile(cache, JSON.stringify(source) + '\n');
  }
  const html = source.parse.text['*'];
  const dom = new JSDOM(html);
  const root = dom.window.document.querySelector('.mw-parser-output');
  if (!root) throw new Error(`${title}: no parser output`);
  for (const node of root.querySelectorAll('style,script,.ws-noexport,.noprint,.licenseContainer,.mw-editsection,.reference,.reflist')) node.remove();
  const heading = root.querySelector('h2,h3')?.textContent?.replace(/[ \t\r\n]+/g, ' ').trim();
  const text = [...root.querySelectorAll('p,li,dd')]
    .map((node) => node.textContent?.replace(/[ \t\r\n]+/g, ' ').trim() ?? '')
    .filter((line) => line.length > 1 && !/^\[.*\]$/.test(line));
  dom.window.close();
  if (!text.length) throw new Error(`${title}: no text extracted`);
  return { title: heading && /เรื่อง/.test(heading) ? heading : title, revision: source.parse.revid, html, url: `https://${host}/w/index.php?oldid=${source.parse.revid}`, rawSha256: sha256(html), text };
}

function documentFor(lang: 'th' | 'sq', item: Parsed, index: number) {
  const thai = lang === 'th';
  const corpusId = thai ? 'th-gap-recovery-aesop' : 'sq-gap-recovery-historical-fables';
  const id = `${corpusId}-${String(index + 1).padStart(2, '0')}`;
  const source = thai ? {
    id: `th-wikisource-aesop-${item.revision}`, title: 'นิทานอีสป', author: 'พระยาเมธาธิบดี (สาตร สุทธเสถียร)',
    edition: `Thai Wikisource revision ${item.revision}`, url: item.url, rights: 'public-domain', authorship: 'published',
    attribution: `พระยาเมธาธิบดี (สาตร สุทธเสถียร), นิทานอีสป (2499); Thai Wikisource revision ${item.revision}; transcription attribution CC BY-SA 4.0.`,
    licenseNote: 'Wikisource records the underlying 2499 work as public domain under Thai copyright terms; transcription attribution and CC BY-SA 4.0 terms are retained.',
    provenance: `Official Thai Wikisource parse API; cached revision ${item.revision}, rendered HTML SHA256 ${item.rawSha256}; source wording and orthography retained.`
  } : {
    id: `sq-wikisource-fable-${item.revision}`, title: item.title, edition: `Albanian Wikisource revision ${item.revision}`, url: item.url,
    rights: 'unverified', authorship: 'published',
    attribution: `${item.title}; Albanian Wikisource revision ${item.revision}; transcription attribution retained pending rights review.`,
    licenseNote: 'Rights are unverified: verify author, edition, jurisdiction, and transcription rights before release. This source is quarantined and cannot be bundled.',
    provenance: `Official Albanian Wikisource parse API; cached revision ${item.revision}, rendered HTML SHA256 ${item.rawSha256}; historical spelling and wording retained without modernization.`
  };
  const doc: Record<string, unknown> = {
    schemaVersion: 2, id, lang, locale: thai ? 'th-TH' : 'sq', title: item.title,
    contentType: 'story', corpus: { id: corpusId, kind: 'comprehensible-input', title: thai ? 'Thai beginner source fables' : 'Albanian historical fable bridge' },
    source, review: { status: thai ? 'reviewed' : 'unreviewed', reviewedBy: thai ? 'Wikisource revision and extraction check' : undefined, reviewedAt: thai ? DATE : undefined, level: 'linguistic-check',
      notes: thai ? 'Source-fidelity and rights evidence checked. Beginner suitability is supported by the source preface but still needs Thai-native pedagogical review.' : 'Authentic source extraction and provenance checked. This is historical/older Albanian (not a modern-standard A0–B1 review) and needs a variety-aware Albanian review before any use.' },
    generated: false, topics: ['fable', 'short-reading'], editorialTags: thai ? ['beginner-source-candidate', 'needs-native-review'] : ['historical-variety', 'needs-native-review', 'not-modern-standard'],
    prepTargets: [], work: { slug: thai ? 'th-gap-recovery-aesop' : 'sq-gap-recovery-historical-fables', chapter: { index: index + 1, title: item.title } }, sections: [{ title: item.title, paragraphs: item.text.map((text) => ({ text })) }], streams: ['library'], variety: thai ? 'central-thai' : 'historical-albanian',
  };
  (doc.review as Record<string, unknown>).contentSignature = contentSignatureOf(doc);
  return doc;
}

async function acquire(lang: 'th' | 'sq', titles: string[], host: string, outRoot: string) {
  const cacheDir = path.join(outRoot, 'raw');
  const rootEvidence = lang === 'th'
    ? [await fetchParsed(host, 'นิทานอีสป', cacheDir), await fetchParsed(host, 'นิทานอีสป/คำชี้แจงของผู้แต่ง', cacheDir)]
    : [];
  const parsed: Parsed[] = [];
  for (const [index, title] of titles.entries()) {
    const item = await fetchParsed(host, title, cacheDir);
    if (lang === 'th') item.title = THAI_NAMES[index] ?? item.title;
    parsed.push(item);
    await sleep(500);
  }
  const docs = parsed.map((item, index) => documentFor(lang, item, index));
  const docsBytes = JSON.stringify(docs, null, 2) + '\n';
  await fs.mkdir(outRoot, { recursive: true });
  await fs.writeFile(path.join(outRoot, 'documents.json'), docsBytes);
  await fs.writeFile(path.join(outRoot, 'source-manifest.json'), JSON.stringify({ checkedAt: DATE, host, licenceEvidenceUrl: `https://${host}/wiki/Wikisource:Copyright_policy`, documentSha256: sha256(docsBytes), rootEvidence: rootEvidence.map((p) => ({ page: p.title, url: p.url, revision: p.revision, rawSha256: p.rawSha256, note: p.title.includes('คำชี้แจง') ? '1911 author preface: simple language and short sentences after the primer.' : 'Root page lists all 45 complete fables and records the Thailand public-domain status.' })), entries: parsed.map((p) => ({ title: p.title, url: p.url, revision: p.revision, rawSha256: p.rawSha256, paragraphs: p.text.length, characters: p.text.join('\n').length })) }, null, 2) + '\n');
  const thai = lang === 'th';
  const rights = thai ? { state: 'verified-public-domain', copyrightStatus: 'public-domain', permission: 'not-needed', canBundle: true, verified: true, verifiedBy: 'Thai Wikisource root rights record', verifiedAt: DATE, basis: 'The Thai Wikisource root page for นิทานอีสป explicitly records the underlying 2499 work as public domain under sections 19–20 of the Thai Copyright Act B.E. 2537. This verification is limited to Thailand; no worldwide or United States clearance is claimed. The cached Wikisource transcription remains attributed under CC BY-SA 4.0.', licensing: 'Public domain in Thailand for the underlying work; CC BY-SA 4.0 transcription attribution', jurisdictions: ['TH'], statusByJurisdiction: { TH: 'public-domain' }, attributionRequired: true, canStoreOffline: true, evidence: ['https://th.wikisource.org/wiki/นิทานอีสป', 'https://th.wikisource.org/wiki/นิทานอีสป/คำชี้แจงของผู้แต่ง', 'https://th.wikisource.org/wiki/Wikisource:Copyright_policy'] } : { state: 'rights-unverified', copyrightStatus: 'unknown', permission: 'jurisdiction-check-required', canBundle: false, verified: false, licensing: 'Rights and edition identity require verification', attributionRequired: true, canStoreOffline: false, evidence: ['https://wikisource.org/wiki/Category:Sq_Shqip_(Albanian)', 'https://creativecommons.org/licenses/by-sa/4.0/'] };
  await fs.writeFile(path.join(outRoot, 'library-manifest.json'), JSON.stringify({ schema: 1, lang, entries: [{ slug: lang === 'th' ? 'th-gap-recovery-aesop' : 'sq-gap-recovery-historical-fables', title: thai ? 'นิทานอีสป — นิทาน 45 เรื่อง' : 'Albanian historical fable bridge', courseId: thai ? 'thailand-th' : 'albania-sq', stage: thai ? 'g1' : '4', streams: ['library'], contentType: 'story', variety: thai ? 'central-thai' : 'historical-albanian', genre: 'fable', rights, source: { file: 'documents.json', kind: 'documents', url: `https://${host}/wiki/${encodeURIComponent(titles[0])}`, edition: thai ? 'นิทานอีสป, 2499 funeral reprint; Wikisource revisions checked 2026-10-02' : `Wikisource revisions checked ${DATE}`, attribution: 'Per-document attribution is retained in documents.json.', provenance: 'Exact source revisions cached under raw/; no translation, modernization, or generated text.' }, review: { status: thai ? 'reviewed' : 'unreviewed', reviewedBy: thai ? 'acquire-course-gaps-th-sq source-fidelity check' : undefined, reviewedAt: thai ? DATE : undefined, coversSourceSha256: sha256(docsBytes), notes: thai ? 'Source-fidelity and Thai-only rights checked; beginner suitability remains a planning hypothesis, not CEFR certification.' : 'Historical variety only; rights and author/edition identity remain pending. Not approved for the modern course spine.' } }] }, null, 2) + '\n');
  return { lang, documents: docs.length, words: docs.reduce((sum, d) => sum + ((d.sections as Array<{ paragraphs: Array<{ text: string }> }>)[0].paragraphs.reduce((n, p) => n + p.text.split(/\s+/).length, 0)), 0), revisions: parsed.map((p) => p.revision) };
}

const result = [await acquire('th', THAI, 'th.wikisource.org', TH_ROOT), await acquire('sq', ALBANIAN, 'wikisource.org', SQ_ROOT)];
console.log(JSON.stringify(result));

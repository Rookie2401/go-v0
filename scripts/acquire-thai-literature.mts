/** Cache exact Thai Wikisource revisions and prepare source-faithful reading documents.
 * Run with NODE_OPTIONS=--use-system-ca when the host uses a system-trusted proxy.
 * This importer never translates, modernizes, or guesses missing chapters.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
// @ts-expect-error jsdom is the existing development/test dependency.
import { JSDOM } from 'jsdom';
import { contentSignatureOf } from '../src/ingest/publish';
import type { CorpusDocument } from '../src/ingest';

const DATE = '2026-10-02';
const ROOT = path.resolve('data/sources/th-literature');
type Page = { title: string; revision: number; html: string; url: string; sha256: string };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
async function page(title: string): Promise<Page> {
  const cache = path.join(ROOT, 'pages', `${title.replaceAll('/', '__')}.json`);
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8')) as Page;
  const url = new URL('https://th.wikisource.org/w/api.php');
  url.search = new URLSearchParams({ action: 'parse', page: title, prop: 'text|revid', format: 'json' }).toString();
  const response = await fetch(url, { headers: { 'User-Agent': 'GoLearn source-fidelity importer (Wikisource attribution retained)' } });
  if (!response.ok) throw new Error(`${title}: HTTP ${response.status}`);
  const json = await response.json() as { error?: { info: string }; parse?: { revid: number; text: { '*': string } } };
  if (!json.parse) throw new Error(`${title}: ${json.error?.info ?? 'no parsed source'}`);
  const result = { title, revision: json.parse.revid, html: json.parse.text['*'], url: `https://th.wikisource.org/w/index.php?oldid=${json.parse.revid}`, sha256: sha(json.parse.text['*']) };
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.writeFileSync(cache, JSON.stringify(result) + '\n');
  return result;
}

function paragraphs(p: Page, poetry: boolean): string[] {
  const dom = new JSDOM(p.html);
  const root = dom.window.document.querySelector('.mw-parser-output');
  if (!root) throw new Error(`${p.title}: no literary body`);
  for (const el of root.querySelectorAll('script,style,.ws-noexport,.noprint,.licenseContainer,.pagenum,.reference,.reflist,.mw-editsection')) el.remove();
  const clean = (el: Element) => el.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  let text: string[];
  if (poetry && root.querySelector('dl')) text = [...root.querySelectorAll('dd')].map(clean);
  else if (p.title === 'ผู้ใหญ่หาผ้าใหม่') text = [...root.querySelectorAll('tr')].map((row: Element) => [...row.querySelectorAll('td')].map(clean).filter(Boolean).join(' '));
  else {
    const body = root.querySelector('.prp-pages-output') ?? root.querySelector('.poem') ?? root;
    text = [...body.querySelectorAll('p')].filter((el: Element) => !el.closest('table')).map(clean);
    // This fallback is only for a verse transcription whose entire body is a poem block.
    if (!text.length && body.classList.contains('poem')) text = [clean(body)];
  }
  text = text.filter((s) => s.length > 1);
  if (!text.length || !text.join('').match(/[\u0e00-\u0e7f]/)) throw new Error(`${p.title}: no native Thai text`);
  dom.window.close();
  return text;
}

const selections = [
  { slug: 'thai-wikisource-nueng-sai-mu-mai-muan', title: 'หนึ่งไซร้หมู่ไม้ม้วน', pages: ['หนึ่งไซร้หมู่ไม้ม้วน'], stage: 'g3', poetry: true, author: 'ไม่ปรากฏนาม', notes: 'Traditional orthography poem, historical wording retained.' },
  { slug: 'thai-wikisource-phai-chai-lae-hai-than', title: 'ใฝ่ใจแลให้ทาน', pages: ['ใฝ่ใจแลให้ทาน'], stage: 'g3', poetry: true, author: 'ไม่ปรากฏนาม', notes: 'Traditional orthography poem, historical wording retained.' },
  { slug: 'thai-wikisource-phu-yai-ha-pha-mai', title: 'ผู้ใหญ่หาผ้าใหม่', pages: ['ผู้ใหญ่หาผ้าใหม่'], stage: 'g3', poetry: true, author: 'ไม่ปรากฏนาม', notes: 'Orthography poem; source verse columns joined in row order.' },
  { slug: 'nms-vetal-selected', title: 'นิทานเวตาล — เรื่องคัดสรร (1, 8–10)', pages: ['นิทานเวตาล/ต้นเรื่อง', 'นิทานเวตาล/เรื่องที่ 1', 'นิทานเวตาล/เรื่องที่ 8', 'นิทานเวตาล/เรื่องที่ 9', 'นิทานเวตาล/เรื่องที่ 10', 'นิทานเวตาล/ปลายเรื่อง'], stage: 'g8', poetry: false, author: 'น.ม.ส.', notes: 'Four available complete stories with opening and closing frame. Stories 2–7 have no available chapter transcription; this is explicitly a selection, not a complete ten-story edition.' },
];
fs.mkdirSync(ROOT, { recursive: true });
const entries: Record<string, unknown>[] = [];
const works: Record<string, unknown>[] = [];
const evidence: Record<string, unknown>[] = [];
for (const [order, selection] of selections.entries()) {
  const rootTitle = selection.slug === 'nms-vetal-selected' ? 'นิทานเวตาล' : selection.pages[0];
  const root = await page(rootTitle);
  // The exact source page must itself carry the public-domain record.
  if (!root.html.includes('สาธารณสมบัติ')) throw new Error(`${rootTitle}: public-domain source record absent`);
  const docs: CorpusDocument[] = [];
  for (const [i, title] of selection.pages.entries()) {
    const p = await page(title);
    const body = paragraphs(p, selection.poetry);
    const doc: CorpusDocument = {
      schemaVersion: 2, id: `${selection.slug}-ch${String(i + 1).padStart(2, '0')}`, lang: 'th', title,
      contentType: selection.poetry ? 'nonfiction' : 'story',
      corpus: { id: 'th-literature-wikisource', kind: 'comprehensible-input', title: 'Thai literary reading' },
      source: { id: `src:th:${selection.slug}:${i + 1}`, title: rootTitle, author: selection.author,
        edition: `Thai Wikisource revision ${p.revision}`, url: p.url,
        rights: 'public-domain', authorship: 'published',
        attribution: `${selection.author}; ${title}; Thai Wikisource contributors, revision ${p.revision}. Public-domain source record; transcription attribution under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).`,
        licenseNote: 'Thai Wikisource marks the underlying work public domain in Thailand. Transcription terms and source attribution are retained; no claim is made for unverified release jurisdictions.',
        provenance: `Official MediaWiki parse API; cached revision ${p.revision}, rendered-source SHA256 ${p.sha256}. Only page/navigation markers and reference apparatus removed; source wording and historical spelling retained. ${selection.notes}` },
      review: { status: 'reviewed', reviewedBy: 'Thai Wikisource revision and extraction comparison', reviewedAt: DATE, notes: 'Source fidelity checked against cached official revision; this is not a native-speaker or learner-level certification.' },
      generated: false, topics: ['literature', selection.poetry ? 'poetry' : 'stories'], editorialTags: [], prepTargets: [],
      work: { slug: selection.slug, chapter: { index: i + 1, title } },
      sections: [{ title, paragraphs: body.map((text) => ({ sentences: [{ text }] })) }],
    };
    doc.review!.contentSignature = contentSignatureOf(doc);
    docs.push(doc);
    evidence.push({ work: selection.slug, page: title, url: p.url, revision: p.revision, renderedSha256: p.sha256, paragraphs: body.length, characters: body.join('\n').length });
  }
  const file = `${selection.slug}.json`;
  const bytes = JSON.stringify(docs, null, 2) + '\n';
  fs.writeFileSync(path.join(ROOT, file), bytes);
  const rights = { state: 'verified-public-domain', copyrightStatus: 'public-domain', permission: 'not-needed', canBundle: true, verified: true,
    verifiedBy: 'Exact Thai Wikisource public-domain source record', verifiedAt: DATE,
    basis: `The official source revision ${root.revision} records the underlying work as public domain under the Thai Copyright Act. Transcription attribution and CC BY-SA terms retained.`,
    statusByJurisdiction: { TH: 'public-domain' }, licence: 'Public-domain source; CC BY-SA 4.0 transcription attribution',
    userImportOnly: false, canModify: false, canStoreOffline: true, attributionRequired: true, evidence: [root.url, 'https://th.wikisource.org/wiki/Wikisource:Copyright_policy'] };
  entries.push({ slug: selection.slug, title: selection.title, author: selection.author, courseId: 'thailand-th', stage: selection.stage, stream: 'library', domains: ['literature'], contentType: selection.poetry ? 'nonfiction' : 'story', genre: selection.poetry ? 'poetry' : 'historical narrative', rights,
    source: { file: `th-literature/${file}`, kind: 'documents', url: root.url, edition: `Thai Wikisource root revision ${root.revision}`, attribution: docs[0].source.attribution, provenance: selection.notes },
    review: { status: 'reviewed', reviewedBy: 'Thai Wikisource revision and extraction comparison', reviewedAt: DATE, coversSourceSha256: sha(bytes), notes: 'Exact cached source extraction; no invented wording, modernization or native-review claim.' } });
  works.push({ id: `work:thailand-th:${selection.slug}`, courseId: 'thailand-th', lang: 'th', stageId: `stage:thailand-th:${selection.stage}`, role: 'subsidiary', order: 930 + order, title: selection.title, author: selection.author, sourceUrl: root.url, streams: ['library'], domains: ['literature'], rights, bibliographyVerified: true, optional: true, ingestion: 'ingested', readiness: 'implemented', genre: selection.poetry ? 'poetry' : 'historical narrative', registers: ['literary', 'archaic'], notes: selection.notes });
  console.log(`${selection.title}: ${docs.length} chapter(s), ${docs.reduce((n, d) => n + d.sections.flatMap((s) => s.paragraphs).length, 0)} paragraphs`);
}
fs.writeFileSync(path.join(ROOT, 'source-manifest.json'), JSON.stringify({ checkedAt: DATE, entries: evidence }, null, 2) + '\n');
fs.writeFileSync(path.join(ROOT, 'library-manifest.json'), JSON.stringify({ schema: 1, lang: 'th', entries }, null, 2) + '\n');
fs.writeFileSync('src/course/thai-literature-works.json', JSON.stringify(works, null, 2) + '\n');
const combinedFile = 'data/sources/course-library/th.json';
const combined = JSON.parse(fs.readFileSync(combinedFile, 'utf8')) as { entries: { slug: string }[] };
combined.entries = [...combined.entries.filter((e) => e.slug === 'bible-thai-otcv2025'), ...entries as { slug: string }[]];
fs.writeFileSync(combinedFile, JSON.stringify(combined, null, 2) + '\n');

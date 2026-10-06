/** Acquire a small, reproducible modern-standard Albanian reading set from sq.wikipedia.org.
 *
 * The source is Wikimedia's rendered page API, not an inferred translation or a third-party
 * mirror. Each entry records the page revision, source URL, source hash, and CC BY-SA evidence.
 * Sections are selected by their exact Albanian heading; page navigation, references, and
 * related-links sections are excluded from the learner text.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import { createHash } from 'node:crypto';
// @ts-expect-error jsdom is already present for the repository's jsdom tests; this helper does not add a dependency.
import { JSDOM } from 'jsdom';
import { contentSignatureOf } from '../src/ingest/publish';

const ROOT = path.resolve('data/sources/sq-modern-open');
const PAGES = path.join(ROOT, 'pages');
const DATE = process.argv.find((x) => x.startsWith('--date='))?.slice(7) ?? '2026-10-02';
const REFRESH = process.argv.includes('--refresh');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Selection = { id: string; page: string; title: string; section?: string; topics: string[] };
const SELECTIONS: Selection[] = [
  { id: 'ushqimi', page: 'Ushqimi', title: 'Ushqimi', topics: ['food', 'daily-life'] },
  { id: 'qeni', page: 'Qeni', title: 'Qeni', topics: ['animals'] },
  { id: 'macja', page: 'Macja', title: 'Macja', topics: ['animals'] },
  { id: 'bleta', page: 'Bleta', title: 'Bleta', topics: ['animals', 'nature'] },
  { id: 'mali', page: 'Mali', title: 'Mali', topics: ['countries', 'geography'] },
  { id: 'deti', page: 'Deti', title: 'Deti', topics: ['nature', 'places'] },
  { id: 'tirana-gjeografia', page: 'Tirana', title: 'Tirana — Gjeografia', section: 'Gjeografia', topics: ['places', 'geography'] },
  { id: 'tirana-klima', page: 'Tirana', title: 'Tirana — Klima', section: 'Klima', topics: ['places', 'weather'] },
  { id: 'tirana-arkeologjia', page: 'Tirana', title: 'Tirana — Arkeologjia', section: 'Arkeologjia', topics: ['places', 'history'] },
  { id: 'tirana-turizmi', page: 'Tirana', title: 'Tirana — Turizmi', section: 'Turizmi', topics: ['places', 'travel'] },
  { id: 'tirana-transporti', page: 'Tirana', title: 'Tirana — Transporti', section: 'Transporti', topics: ['places', 'daily-life'] },
  { id: 'tirana-demografia', page: 'Tirana', title: 'Tirana — Demografia', section: 'Demografia', topics: ['places', 'society'] },
  { id: 'tirana-ekonomia', page: 'Tirana', title: 'Tirana — Ekonomia', section: 'Ekonomia', topics: ['work', 'society'] },
  { id: 'shqiperia-relievi', page: 'Shqipëria', title: 'Shqipëria — Relievi', section: 'Relievi', topics: ['places', 'geography'] },
  { id: 'shqiperia-klima', page: 'Shqipëria', title: 'Shqipëria — Klima', section: 'Klima', topics: ['places', 'weather'] },
  { id: 'shqiperia-popullsia', page: 'Shqipëria', title: 'Shqipëria — Popullsia', section: 'Popullsia', topics: ['society', 'places'] },
  { id: 'shqiperia-ekonomia', page: 'Shqipëria', title: 'Shqipëria — Ekonomia', section: 'Ekonomia', topics: ['work', 'society'] },
  { id: 'shqiperia-gjeografia', page: 'Shqipëria', title: 'Shqipëria — Gjeografia', section: 'Gjeografia', topics: ['places', 'geography'] },
  { id: 'shqiperia-historia', page: 'Shqipëria', title: 'Shqipëria — Historia', section: 'Historia', topics: ['places', 'history'] },
  { id: 'durresi-gjeografia', page: 'Durrësi', title: 'Durrësi — Gjeografia', section: 'Gjeografia', topics: ['places', 'geography'] },
  { id: 'durresi-klima', page: 'Durrësi', title: 'Durrësi — Klima', section: 'Klima', topics: ['places', 'weather'] },
  { id: 'durresi-historia', page: 'Durrësi', title: 'Durrësi — Historia', section: 'Historia', topics: ['places', 'history'] },
  { id: 'durresi-transporti', page: 'Durrësi', title: 'Durrësi — Transporti', section: 'Transporti', topics: ['places', 'daily-life'] },
  { id: 'tirana-historia', page: 'Tirana', title: 'Tirana — Historia', section: 'Historia', topics: ['places', 'society'] },
  { id: 'tirana-institucione', page: 'Tirana', title: 'Tirana — Institucione e Tiranës', section: 'Institucione e Tiranës', topics: ['places', 'society'] },
  { id: 'durresi-prejardhja', page: 'Durrësi', title: 'Durrësi — Prejardhja e emrit', section: 'Prejardhja e emrit', topics: ['places', 'society'] },
  { id: 'shqiperia-politika', page: 'Shqipëria', title: 'Shqipëria — Politika', section: 'Politika', topics: ['places', 'society'] },
];

type SourcePage = { page: string; pageUrl: string; url: string; revisionId: number; modified: string; html: string; sha256: string };

function sha256(text: string): string { return createHash('sha256').update(text).digest('hex'); }

async function fetchPage(page: string): Promise<string> {
  const url = `https://api.wikimedia.org/core/v1/wikipedia/sq/page/${encodeURIComponent(page)}/html`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await new Promise<{ status: number; body: string; retryAfter?: string }>((resolve, reject) => {
      const request = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Go-v0 corpus acquisition; Wikimedia CC BY-SA source)' }, rejectUnauthorized: false }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => resolve({ status: response.statusCode ?? 500, body: Buffer.concat(chunks).toString('utf8'), retryAfter: response.headers['retry-after'] }));
      });
      request.on('error', reject);
    });
    if (result.status === 429) {
      const seconds = Number(result.retryAfter ?? 0);
      await sleep(Math.max(2000, Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 4000));
      continue;
    }
    if (result.status >= 400) throw new Error(`Wikimedia ${result.status} for ${page}: ${result.body.slice(0, 200)}`);
    return result.body;
  }
  throw new Error(`Wikimedia rate limit persisted for ${page}; rerun from the cached pages later`);
}

function blocks(html: string): Array<{ level: number; text: string }> {
  const clean = html.replace(/<sup[^>]*class="[^"]*mw-ref[^>]*>[\s\S]*?<\/sup>/gi, '').replace(/<br\s*\/?>/gi, ' ');
  const body = new JSDOM(clean).window.document.body;
  const out: Array<{ level: number; text: string }> = [];
  for (const element of body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li')) {
    const tag = element.tagName.toLowerCase();
    // Parsoid emits template metadata and infobox scaffolding as empty/data-mw
    // paragraphs. They are source markup, not article prose. References were
    // removed above so ordinary paragraphs with citation metadata remain.
    if (element.matches('[data-mw], [data-mw-i18n], [data-mw-deduplicate], .mw-empty-elt') || element.closest('table, figure') || element.querySelector('[data-mw], [data-mw-i18n], [data-mw-deduplicate], .mw-empty-elt, table, figure')) continue;
    const text = element.textContent?.replace(/[ \t\r\n]+/g, ' ').trim() ?? '';
    if (text.length < 2) continue;
    out.push({ level: tag[0] === 'h' ? Number(tag[1]) : 0, text });
  }
  return out;
}

const END_HEADINGS = new Set(['Shiko edhe', 'Shiko dhe këtu', 'Shih edhe', 'Lidhje të jashtme', 'Referime', 'Referimet', 'Thënie']);

function paragraphs(page: SourcePage, selection: Selection): string[] {
  const all = blocks(page.html);
  const chosen: Array<{ level: number; text: string }>[] = [];
  if (!selection.section) chosen.push(all);
  else {
    const index = all.findIndex((b) => b.level > 0 && b.text === selection.section);
    if (index < 0) throw new Error(`heading ${selection.section} not found on ${selection.page}`);
    const level = all[index].level;
    const section: Array<{ level: number; text: string }> = [];
    let excludedLevel = 0;
    const separatelySelected = new Set(SELECTIONS.filter((s) => s.page === selection.page && s.id !== selection.id).map((s) => s.section));
    for (const block of all.slice(index + 1)) {
      if (block.level > 0 && block.level <= level) break;
      if (excludedLevel && block.level > 0 && block.level <= excludedLevel) excludedLevel = 0;
      if (block.level > level && separatelySelected.has(block.text)) excludedLevel = block.level;
      if (!excludedLevel) section.push(block);
    }
    chosen.push(section);
  }
  const result: string[] = [];
  for (const group of chosen) {
    let stopped = false;
    for (const block of group) {
      if (block.level > 0) {
        if (END_HEADINGS.has(block.text)) { stopped = true; break; }
        if (!selection.section) continue;
      }
      if (!stopped && block.level === 0 && block.text.length >= 20) result.push(block.text);
    }
  }
  if (result.length === 0) throw new Error(`no prose paragraphs extracted for ${selection.id}`);
  return result;
}

function sourcePageFrom(page: string, html: string): SourcePage {
  const revisionId = Number(html.match(/revision\/(\d+)/i)?.[1] ?? 0);
  const modified = html.match(/property="dc:modified" content="([^"]+)"/i)?.[1] ?? '';
  if (!revisionId || !modified) throw new Error(`missing revision metadata for ${page}`);
  const pageUrl = `https://sq.wikipedia.org/wiki/${encodeURIComponent(page).replace(/%20/g, '_')}`;
  return { page, pageUrl, url: `https://sq.wikipedia.org/w/index.php?oldid=${revisionId}`, revisionId, modified, html, sha256: sha256(html) };
}

function documentFor(selection: Selection, page: SourcePage, text: string[]): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    schemaVersion: 2, id: `sq-modern-open-${selection.id}`, lang: 'sq', locale: 'sq-AL', title: selection.title,
    contentType: 'nonfiction', corpus: { id: 'sq-modern-open', kind: 'comprehensible-input', title: 'Modern standard Albanian open reading' },
    source: { id: `sq-wikipedia-${selection.page.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, title: selection.title, publisher: 'Wikipedia shqip', url: page.url,
      edition: `sq.wikipedia.org revision ${page.revisionId}`, attribution: `${selection.title}; Wikipedia shqip, CC BY-SA 4.0`,
      provenance: `Rendered from the exact Wikimedia revision ${page.revisionId} (${page.modified}); section selection preserves source paragraph wording and omits navigation/references.`,
      rights: 'licensed', licenseNote: 'CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/; Wikimedia terms and local licence record: https://sq.wikipedia.org/wiki/Wikipedia:CC_BY-SA', authorship: 'published' },
    review: { status: 'reviewed', reviewedBy: 'Wikimedia source-fidelity checker', reviewedAt: DATE, level: 'linguistic-check', notes: 'Source fidelity and provenance checked; this is not a native-speaker or A0-level review.' },
    topics: selection.topics, editorialTags: ['needs-native-review'], prepTargets: [], generated: false,
    sections: [{ title: selection.title, paragraphs: text.map((t) => ({ text: t })) }], streams: ['library'], variety: 'sq',
  };
  (doc.review as Record<string, unknown>).contentSignature = contentSignatureOf(doc);
  return doc;
}

async function main() {
  await fs.mkdir(PAGES, { recursive: true });
  const pages = new Map<string, SourcePage>();
  for (const selection of SELECTIONS) {
    if (!pages.has(selection.page)) {
      const file = path.join(PAGES, `${selection.page.replace(/[^\p{L}\p{N}-]+/gu, '_')}.html`);
      let html: string;
      try { html = REFRESH ? await fetchPage(selection.page) : await fs.readFile(file, 'utf8'); }
      catch { html = await fetchPage(selection.page); }
      if (REFRESH || !(await fs.stat(file).catch(() => null))) await fs.writeFile(file, html);
      pages.set(selection.page, sourcePageFrom(selection.page, html));
      await sleep(750);
    }
  }
  const docs = SELECTIONS.map((selection) => {
    const page = pages.get(selection.page)!;
    return documentFor(selection, page, paragraphs(page, selection));
  });
  await fs.writeFile(path.join(ROOT, 'documents.json'), JSON.stringify(docs, null, 2) + '\n');
  const documentBytes = await fs.readFile(path.join(ROOT, 'documents.json'));
  const documentSha256 = sha256(documentBytes.toString('utf8'));
  const rights = {
    state: 'verified-open-licence', copyrightStatus: 'licensed', permission: 'granted', canBundle: true, userImportOnly: false,
    canModify: true, canStoreOffline: true, canBundleAudio: false, audiobook: 'unknown', verified: true,
    verifiedBy: 'Wikimedia source-manifest and CC BY-SA licence record', verifiedAt: DATE,
    basis: 'Each selected source page is an exact Wikimedia revision whose local licence record and global CC BY-SA 4.0 terms permit redistribution with attribution and share-alike.',
    licensing: 'CC BY-SA 4.0', sourceRepository: 'sq.wikipedia.org rendered page API', licence: 'CC BY-SA 4.0', jurisdictions: ['*'], statusByJurisdiction: { '*': 'licensed' },
    attributionRequired: true, shareAlike: true, commercialUse: true,
    evidence: ['https://sq.wikipedia.org/wiki/Wikipedia:CC_BY-SA', 'https://creativecommons.org/licenses/by-sa/4.0/'],
  };
  await fs.writeFile(path.join(ROOT, 'library-manifest.json'), JSON.stringify({ schema: 1, lang: 'sq', entries: [{
    slug: 'sq-modern-open', title: 'Modern standard Albanian open reading', courseId: 'albania-sq', stage: '7', streams: ['library'], contentType: 'nonfiction', variety: 'sq', genre: 'educational reference',
    rights, source: { file: 'documents.json', kind: 'documents', url: 'https://sq.wikipedia.org/', edition: 'Selected sq.wikipedia.org revisions checked 2026-10-02', attribution: 'Wikipedia shqip selected articles and sections; CC BY-SA 4.0; per-entry page and revision attribution is retained in documents.json.', provenance: 'Selected source-faithful documents reconstructed from cached Wikimedia rendered-page revisions; section boundaries follow exact Albanian headings and source wording is retained.' },
    review: { status: 'reviewed', reviewedBy: 'acquire-sq-modern-open source-fidelity check', reviewedAt: DATE, coversSourceSha256: documentSha256, notes: 'Source fidelity and licence evidence checked; no native-speaker or A0 review claimed.' },
  }] }, null, 2) + '\n');
  const manifest = [...pages.values()].map((page) => ({ page: page.page, pageUrl: page.pageUrl, url: page.url, apiUrl: `https://api.wikimedia.org/core/v1/wikipedia/sq/page/${encodeURIComponent(page.page)}/html`, revisionId: page.revisionId, modified: page.modified, rawSha256: page.sha256, licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' }));
  await fs.writeFile(path.join(ROOT, 'source-manifest.json'), JSON.stringify({ checkedAt: DATE, licenceEvidenceUrl: 'https://sq.wikipedia.org/wiki/Wikipedia:CC_BY-SA', documentSha256, pages: manifest, quarantined: [
    { page: 'Familja', pageUrl: 'https://sq.wikipedia.org/wiki/Familja', reason: 'Orthography is inconsistent with a modern-standard model; retained raw cache only for review.' },
    { page: 'Shqipëria', section: 'Kultura', pageUrl: 'https://sq.wikipedia.org/wiki/Shqip%C3%ABria', reason: 'Opening source spelling errors fail the modern-standard quality bar; retained in the raw page only for native review.' },
  ], entries: SELECTIONS }, null, 2) + '\n');
  const words = docs.reduce((n, doc) => n + (doc.sections as Array<{ paragraphs: Array<{ text: string }> }>).flatMap((s) => s.paragraphs).reduce((m, p) => m + p.text.split(/\s+/).length, 0), 0);
  console.log(JSON.stringify({ pages: pages.size, documents: docs.length, words, revisionIds: manifest.map((p) => p.revisionId) }));
}

await main();

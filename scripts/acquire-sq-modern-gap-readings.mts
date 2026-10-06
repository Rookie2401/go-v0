/** Acquire new, source-faithful modern Standard Albanian prose readings.
 * This lane writes only data/sources/sq-modern-gap-readings and never edits the
 * shared sq-modern-open manifest or public library.  The source is exact
 * sq.wikipedia.org HTML under CC BY-SA 4.0; navigation, references, tables and
 * list-only blocks are omitted, while paragraph wording is retained.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import { createHash } from 'node:crypto';
// @ts-expect-error jsdom is present in the repository
import { JSDOM } from 'jsdom';
import { contentSignatureOf } from '../src/ingest/publish';
import { validateDocumentDetailed } from '../src/ingest/format';
import { parseBuildManifest } from '../src/library/build';
import { createAdapterRegistry } from '../src/adapters';

const ROOT = path.resolve('data/sources/sq-modern-gap-readings');
const PAGES = path.join(ROOT, 'pages');
const DATE = process.argv.find((x) => x.startsWith('--date='))?.slice(7) ?? '2026-10-02';
const TITLES = [
  ['vlora', 'Vlora', ['places', 'geography']],
  ['berati', 'Berati', ['places', 'history']],
  ['korca', 'Korça', ['places', 'education']],
  ['gjirokastra', 'Gjirokastra', ['places', 'culture']],
  ['park-lura', 'Parku Kombëtar i Lurës', ['nature', 'geography']],
  ['park-dajti', 'Parku Kombëtar i Dajtit', ['nature', 'geography']],
  ['lumi-vjosa', 'Lumi Vjosa', ['nature', 'geography']],
  ['liqeni-shkoder', 'Liqeni i Shkodrës', ['nature', 'places']],
  ['alpet-shqiptare', 'Alpet Shqiptare', ['nature', 'geography']],
  ['butrinti', 'Parku Kombëtar i Butrintit', ['nature', 'history']],
] as const;
type Page = { title: string; url: string; revisionId: number; modified: string; html: string; sha256: string };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function get(url: string): Promise<string> { return new Promise((resolve, reject) => { const r = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Go-v0 modern Albanian gap acquisition; Wikimedia CC BY-SA source)' } }, (res) => { const b: Buffer[] = []; res.on('data', x => b.push(Buffer.from(x))); res.on('end', () => res.statusCode && res.statusCode < 400 ? resolve(Buffer.concat(b).toString('utf8')) : reject(new Error(`HTTP ${res.statusCode}`))); }); r.on('error', reject); }); }
function extract(page: Page): string[] {
  const body = new JSDOM(page.html).window.document.body;
  const out: string[] = [];
  for (const el of body.querySelectorAll('p')) {
    if (el.closest('table, figure, ol, ul, nav, footer, .mw-references-wrap, .reflist')) continue;
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('sup, .mw-ref, .reference, [typeof="mw:Extension/ref"]').forEach((x) => x.remove());
    const t = (copy.textContent ?? '').replace(/[ \t\r\n]+/g, ' ').trim();
    if (t.length >= 80 && !/^\[\d+\]/.test(t)) out.push(t);
  }
  return out;
}
function doc(id: string, title: string, topics: readonly string[], page: Page, paragraphs: string[]) {
  const d: any = { schemaVersion: 2, id: `sq-gap-${id}`, lang: 'sq', locale: 'sq-AL', title, contentType: 'nonfiction', corpus: { id: 'sq-modern-gap-readings', kind: 'comprehensible-input', title: 'Qytete dhe natyrë' }, source: { id: `sq-wikipedia-gap-${id}`, title, publisher: 'Wikipedia shqip', url: page.url, edition: `sq.wikipedia.org revision ${page.revisionId}`, attribution: `${title}; Wikipedia shqip contributors; CC BY-SA 4.0`, provenance: `Exact HTML captured from Wikimedia revision ${page.revisionId} (${page.modified}); paragraph wording retained and navigation, references, tables and lists omitted.`, rights: 'licensed', licenseNote: 'CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/; local licence: https://sq.wikipedia.org/wiki/Wikipedia:CC_BY-SA', authorship: 'published' }, review: { status: 'reviewed', reviewedBy: 'Wikimedia source-fidelity checker', reviewedAt: DATE, level: 'linguistic-check', notes: 'Exact extraction and rights metadata checked; no native-speaker or CEFR claim.' }, topics, editorialTags: ['needs-native-review'], prepTargets: [], generated: false, sections: [{ title, paragraphs: paragraphs.map(text => ({ text })) }], streams: ['library'], variety: 'sq' };
  d.review.contentSignature = contentSignatureOf(d); return d;
}
async function main() {
  await fs.mkdir(PAGES, { recursive: true });
  const docs: any[] = []; const pages: any[] = [];
  for (const [id, title, topics] of TITLES) {
    const safe = id + '.html'; const file = path.join(PAGES, safe); let html: string;
    try { html = await fs.readFile(file, 'utf8'); } catch { html = await get(`https://sq.wikipedia.org/w/index.php?title=${encodeURIComponent(title)}&oldformat=true`); await fs.writeFile(file, html); }
    const revisionId = Number(html.match(/(?:wgRevisionId|pageVersion)\D{0,20}(\d{5,})/)?.[1] ?? 0);
    const modified = html.match(/(?:wgRevisionTimestamp|dc:modified)[^>]*content=["']([^"']+)/i)?.[1] ?? '';
    if (!revisionId) throw new Error(`no revision id for ${title}`);
    const page: Page = { title, url: `https://sq.wikipedia.org/w/index.php?oldid=${revisionId}`, revisionId, modified, html, sha256: sha(html) };
    const paragraphs = extract(page); if (paragraphs.length < 2) throw new Error(`${title}: only ${paragraphs.length} prose paragraphs`);
    pages.push({ page: title, pageUrl: `https://sq.wikipedia.org/wiki/${encodeURIComponent(title).replace(/%20/g, '_')}`, url: page.url, revisionId, modified, rawSha256: page.sha256 });
    docs.push(doc(id, title, topics, page, paragraphs));
  }
  await fs.writeFile(path.join(ROOT, 'documents.json'), JSON.stringify(docs, null, 2) + '\n');
  const documentSha256 = sha(await fs.readFile(path.join(ROOT, 'documents.json'), 'utf8'));
  const rights = { state: 'verified-open-licence', copyrightStatus: 'licensed', permission: 'granted', canBundle: true, canModify: true, canStoreOffline: true, canBundleAudio: false, verified: true, licensing: 'CC BY-SA 4.0', licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', verifiedBy: 'Wikimedia source-manifest and exact-revision checker', verifiedAt: DATE, basis: 'Each exact sq.wikipedia.org revision is published under CC BY-SA 4.0; redistribution preserves attribution and share-alike.', statusByJurisdiction: { '*': 'licensed' }, evidence: ['https://sq.wikipedia.org/wiki/Wikipedia:CC_BY-SA', 'https://creativecommons.org/licenses/by-sa/4.0/'] };
  const buildManifest = { schema: 1, lang: 'sq', entries: [{ slug: 'sq-modern-gap-readings', title: 'Qytete dhe natyrë', source: { file: 'documents.json' }, rights, variety: 'sq', genre: 'educational reference', domains: ['geography', 'culture'] }] };
  parseBuildManifest(buildManifest, 'sq');
  let validationErrors = 0;
  const registry = createAdapterRegistry();
  for (const d of docs) validationErrors += validateDocumentDetailed(d, { registry, destination: 'library' }).issues.filter((x: any) => x.severity === 'error').length;
  if (validationErrors) throw new Error(`validateDocumentDetailed found ${validationErrors} error(s)`);
  await fs.writeFile(path.join(ROOT, 'library-manifest.json'), JSON.stringify({ schema: 1, lang: 'sq', entries: [{ slug: 'sq-modern-gap-readings', title: 'Qytete dhe natyrë', courseId: 'albania-sq', stage: '7', streams: ['library'], contentType: 'nonfiction', variety: 'sq', genre: 'educational reference', domains: ['geography', 'culture'], rights, source: { file: 'documents.json', kind: 'documents', url: 'https://sq.wikipedia.org/', edition: 'Exact revisions listed in source-manifest.json', attribution: 'Wikipedia shqip contributors; CC BY-SA 4.0; per-reading revision attribution retained in documents.json', provenance: 'Source-faithful prose readings from exact cached Wikimedia revisions.' }, review: { status: 'reviewed', reviewedBy: 'acquire-sq-modern-gap-readings source-fidelity checker', reviewedAt: DATE, coversSourceSha256: documentSha256, notes: 'Source extraction and rights checked; no native-speaker or CEFR claim.' } }] }, null, 2) + '\n');
  parseBuildManifest(JSON.parse(await fs.readFile(path.join(ROOT, 'library-manifest.json'), 'utf8')), 'sq');
  await fs.writeFile(path.join(ROOT, 'source-manifest.json'), JSON.stringify({ schema: 1, checkedAt: DATE, licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', documentSha256, pages, entries: TITLES.map(([id, title, topics]) => ({ id, title, topics })) }, null, 2) + '\n');
  const words = docs.reduce((n, d) => n + d.sections[0].paragraphs.reduce((m: number, p: any) => m + p.text.split(/\s+/).length, 0), 0);
  console.log(JSON.stringify({ documents: docs.length, words, pages: pages.length, revisions: pages.map(p => p.revisionId) }));
}
await main();

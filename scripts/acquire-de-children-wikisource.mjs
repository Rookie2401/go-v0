/** Acquire scan-backed, twice-proofread German children’s source sections from Wikisource. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = 'data/sources/de-children-wikisource';
const apiRoot = 'https://de.wikisource.org/w/api.php';
const rawRoot = 'https://de.wikisource.org/w/index.php?';
const date = process.argv.includes('--date') ? process.argv[process.argv.indexOf('--date') + 1] : '2026-10-01';
const books = [
  { id: 'grimm-khm-1850-band1', index: 'Index:Kinder- und Haus-Märchen Band 1 (1850)', title: 'Kinder- und Haus-Märchen, Band 1 (6. Auflage, 1850)', author: 'Jacob und Wilhelm Grimm', edition: 'Dieterich, Göttingen, 1850; sixth edition', sourceUrl: 'https://de.wikisource.org/wiki/Index:Kinder-_und_Haus-M%C3%A4rchen_Band_1_(1850)' },
  { id: 'grimm-khm-1850-band2', index: 'Index:Kinder- und Haus-Märchen Band 2 (1850)', title: 'Kinder- und Haus-Märchen, Band 2 (6. Auflage, 1850)', author: 'Jacob und Wilhelm Grimm', edition: 'Dieterich, Göttingen, 1850; sixth edition', sourceUrl: 'https://de.wikisource.org/wiki/Index:Kinder-_und_Haus-M%C3%A4rchen_Band_2_(1850)' },
  { id: 'hauff-almanach-1826', index: 'Index:Wilhelm Hauff Werke Bd 2', title: 'Märchen-Almanach auf das Jahr 1826', author: 'Wilhelm Hauff', edition: 'Mendheim edition, 1891–1909, scan section reproducing the 1826 Almanach', sourceUrl: 'https://de.wikisource.org/wiki/Index:Wilhelm_Hauff_Werke_Bd_2', section: 'hauff-almanach' },
];

const api = async (params) => {
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(`${apiRoot}?${new URLSearchParams({ action: 'query', format: 'json', ...params })}`);
    if (response.ok) return response.json();
    if (response.status !== 429 || attempt === 5) throw new Error(`Wikisource API ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  throw new Error('unreachable');
};
const rawPage = async (title) => {
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await fetch(`${rawRoot}${new URLSearchParams({ title, action: 'raw' })}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
    if (response.ok) return response.text();
    if (response.status !== 429 || attempt === 7) throw new Error(`Wikisource raw ${response.status}: ${title}`);
    await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
  }
  throw new Error('unreachable');
};
const pageText = (page) => page.revisions?.[0]?.slots?.main?.['*'] ?? '';
const plain = (wikitext) => {
  let text = wikitext.replace(/<noinclude>[\s\S]*?<\/noinclude>/gi, ' ').replace(/<includeonly>[\s\S]*?<\/includeonly>/gi, ' ');
  const metadata = new Set(['seitenstatus2', 'references', 'zitierempfehlung', 'leere seite', 'leereSeite'.toLowerCase(), 'pagequality']);
  for (let i = 0; i < 4; i++) text = text.replace(/\{\{([^{}]*)\}\}/g, (_, body) => { const parts = body.split('|'); const name = parts.shift()?.trim().toLowerCase() ?? ''; return metadata.has(name) ? ' ' : (parts.at(-1) ?? ' '); });
  return text.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/<[^>]+>/g, ' ').replace(/'{2,}/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
};
const linksFromIndex = (wikitext, book) => [...wikitext.matchAll(/\[\[Seite:([^|]+)\|([^\]]+)\]\]/g)].map((m) => ({ title: `Seite:${m[1]}`, label: m[2] })).filter((p) => /^\d/.test(p.label)).filter((p) => book.section !== 'hauff-almanach' || /^Seite:De_Wilhelm_Hauff_Bd_2_(0(?:3[2-9]|[4-8]\d)|089)\.jpg$/.test(p.title));
const fetchPages = async (titles) => Promise.all(titles.map(async (title) => ({ title, fetchedAt: new Date().toISOString(), wikitext: await rawPage(title) })));
const all = [];
for (const book of books) {
  const outputFile = path.join(root, `${book.id}.json`);
  if (fs.existsSync(outputFile) && !process.argv.includes('--refresh')) {
    const cached = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    cached.checkedAt = date;
    cached.pages = cached.pages.map((p) => ({ ...p, plainText: plain(p.wikitext), proofread: /pagequality level="4"/.test(p.wikitext) }));
    if (book.section === 'hauff-almanach' && cached.pages.length) cached.pages.at(-1).plainText = cached.pages.at(-1).plainText.replace(/\s+175\s+Mitteilungen aus den Memoiren des Satan\.?\s*$/i, '');
    fs.writeFileSync(outputFile, JSON.stringify(cached) + '\n');
    const words = cached.pages.reduce((n, p) => n + p.plainText.split(/\s+/).filter(Boolean).length, 0);
    all.push({ candidateId: cached.candidateId, title: cached.title, sourceUrl: cached.sourceUrl, pageCount: cached.pages.length, proofreadPages: cached.pages.filter((p) => p.proofread).length, words, sha256: crypto.createHash('sha256').update(JSON.stringify(cached)).digest('hex') });
    console.log(`${book.id}: reused ${cached.pages.length} cached pages, ${words} words`);
    continue;
  }
  const cachedIndex = book.id === 'grimm-khm-1850-band1' ? 'work/grimm-1-index.wiki' : book.id === 'grimm-khm-1850-band2' ? 'work/grimm-2-index.wiki' : 'work/hauff-index.wiki';
  const pages = linksFromIndex(fs.existsSync(cachedIndex) ? fs.readFileSync(cachedIndex, 'utf8') : await rawPage(book.index), book);
  if (!pages.length) throw new Error(`${book.id}: no pages found in index`);
  const fetched = [];
  for (let i = 0; i < pages.length; i += 8) { fetched.push(...await fetchPages(pages.slice(i, i + 8).map((p) => p.title))); if ((i + 8) % 40 === 0) console.log(`${book.id}: fetched ${Math.min(i + 8, pages.length)}/${pages.length}`); }
  let records = fetched.map((p) => ({ ...p, plainText: plain(p.wikitext), proofread: /pagequality level="4"/.test(p.wikitext) }));
  const omittedPages = records.filter((p) => /\{\{LeereSeite\}\}/.test(p.wikitext)).map((p) => p.title);
  records = records.filter((p) => !/\{\{LeereSeite\}\}/.test(p.wikitext));
  if (book.section === 'hauff-almanach' && records.length) records.at(-1).plainText = records.at(-1).plainText.replace(/\s+175\s+Mitteilungen aus den Memoiren des Satan\.?\s*$/i, '');
  const bad = records.filter((p) => !p.proofread || !p.plainText.trim());
  if (bad.length) throw new Error(`${book.id}: ${bad.length} pages are not twice-proofread/non-empty (${bad.slice(0, 3).map((p) => p.title).join(', ')})`);
  const result = { schema: 1, checkedAt: date, candidateId: book.id, title: book.title, author: book.author, edition: book.edition, language: 'de', rights: { state: 'public-domain-source-with-CC-BY-SA-transcription', sourceLicense: 'CC BY-SA 4.0', sourceRepository: 'https://de.wikisource.org/', evidence: 'Every acquired content page carries ProofreadPage quality level 4; underlying scan is linked by the edition index.' }, sourceUrl: book.sourceUrl, index: book.index, pageCount: records.length, omittedPages, pages: records };
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(result) + '\n');
  all.push({ candidateId: book.id, title: book.title, sourceUrl: book.sourceUrl, pageCount: records.length, proofreadPages: records.filter((p) => p.proofread).length, words: records.reduce((n, p) => n + p.plainText.split(/\s+/).filter(Boolean).length, 0), sha256: crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex') });
  console.log(`${book.id}: ${records.length} pages, ${all.at(-1).words} words, all level-4 proofread`);
}
fs.writeFileSync(path.join(root, 'source-manifest.json'), JSON.stringify({ schema: 1, checkedAt: date, source: 'Wikisource raw transcription endpoint; scan-backed proofread transcriptions', entries: all }, null, 2) + '\n');

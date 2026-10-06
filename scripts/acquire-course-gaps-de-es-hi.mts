/**
 * Build an isolated recovery bundle for the German, Spanish and Hindi ladders.
 *
 * This deliberately writes only data/sources/{de,es,hi}-gap-recovery.  It does
 * not touch a course catalogue, public/library output, or the shared acquisition
 * manifests.  Every record remains a source-fidelity record: no native review is
 * inferred from a clean download.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url).pathname.replace(/^\//, '').replaceAll('/', '\\');
const out = (name: string) => `${root}data\\sources\\${name}-gap-recovery`;

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'User-Agent': 'GoCourseGapRecovery/1.0 (https://example.invalid/contact)' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}
function sha256(value: string) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function stripWiki(raw: string) {
  return raw.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>(\r?\n)?/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
function stripGermanPage(raw: string) {
  const start = raw.indexOf('<span class="PageNumber"');
  const end = raw.indexOf('<div class="printfooter"', start);
  if (start < 0 || end < 0) throw new Error('German Wikisource article boundaries not found');
  return raw.slice(start, end)
    .replace(/<span class="PageNumber"[\s\S]*?<\/span>\s*<\/span>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>(\r?\n)?/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

await Promise.all([mkdir(out('de'), { recursive: true }), mkdir(out('es'), { recursive: true }), mkdir(out('hi'), { recursive: true })]);

// A short, native German bridge was not found in the currently licensed GDL
// inventory without duplicating an installed work. Keep the lead explicit.
const deHtml = await fetchText('https://de.wikisource.org/wiki/Der_kleine_H%C3%A4welmann');
const deText = stripGermanPage(deHtml);
await writeFile(`${out('de')}\\der-kleine-haewelmann.txt`, deText, 'utf8');
const de = { schema: 1, lang: 'de', checkedAt: '2026-10-02', entries: [{
  slug: 'der-kleine-haewelmann', title: 'Der kleine Häwelmann', author: 'Theodor Storm', stage: 's3', streams: ['library'], contentType: 'story',
  source: { file: 'der-kleine-haewelmann.txt', kind: 'plain', url: 'https://de.wikisource.org/wiki/Der_kleine_H%C3%A4welmann', edition: 'Sommergeschichten und Lieder, Berlin, Duncker, 1851, pp. 24–30', attribution: 'Der kleine Häwelmann — Theodor Storm; German Wikisource scan-backed transcription; CC BY-SA 4.0 transcription contribution.', provenance: 'Official German Wikisource page and scan metadata; article text extracted from the completed page body, navigation and metadata removed.' },
  rights: { state: 'verified-public-domain', copyrightStatus: 'public-domain', permission: 'not-needed', canBundle: true, canModify: false, canStoreOffline: true, verified: true, verifiedBy: 'German Wikisource scan metadata and author death record', verifiedAt: '2026-10-02', basis: '1851 edition and Theodor Storm (1817–1888); source contribution licence recorded separately.', statusByJurisdiction: { US: 'public-domain', DE: 'public-domain' }, evidence: ['https://de.wikisource.org/wiki/Der_kleine_H%C3%A4welmann', 'https://creativecommons.org/licenses/by-sa/4.0/deed.de'] },
  review: { status: 'reviewed', reviewedBy: 'course-gap source-fidelity boundary check', reviewedAt: '2026-10-02', coversSourceSha256: sha256(deText), qualityVerdict: 'usable', notes: 'Completed source page and 1851 edition metadata checked; no native-speaker or level approval.' }
}], limitations: [] };
await writeFile(`${out('de')}\\library-manifest.json`, JSON.stringify(de, null, 2) + '\n', 'utf8');

const cachedEs = async (name: string) => readFile(`${root}data\\sources\\es-prose\\${name}`, 'utf8');
const section = (raw: string, start: RegExp, end: RegExp) => {
  const a = raw.search(start); if (a < 0) throw new Error(`start boundary not found: ${start}`);
  const tail = raw.slice(a); const b = tail.search(end); if (b < 0) throw new Error(`end boundary not found: ${end}`);
  return tail.slice(0, b).trim() + '\n';
};
const afterFirst = (raw: string, marker: string, from = 1000) => {
  const at = raw.indexOf(marker, from); if (at < 0) throw new Error(`marker not found: ${marker}`);
  return raw.slice(at);
};
const capitan = section(await cachedEs('alarcon-capitan-veneno.txt'), /^EL CAPITÁN VENENO\[4\]/m, /^QUESTIONS FOR CONVERSATION/m);
const sombrero = section(afterFirst(await cachedEs('alarcon-sombrero-de-tres-picos.txt'), 'EL SOMBRERO DE TRES PICOS', 20000), /^EL SOMBRERO DE TRES PICOS\s*$/m, /^NOTES$/m);
const plateroRaw = section(afterFirst(await cachedEs('jimenez-platero-y-yo.txt'), 'PLATERO Y YO', 400), /^#I#$/m, /^NOTES$/m);
const platero = plateroRaw
  .replace(/\[Footnote[\s\S]*?\]\s*/g, '')
  .replace(/\nI\.\s*CUESTIONARIO[\s\S]*?(?=\n#(?:[IVXLCDM]+)#|\nNOTES|$)/g, '\n')
  .replace(/\n{3,}/g, '\n\n').trim() + '\n';
const esTexts = [
  ['alarcon-capitan-veneno', 'El capitán Veneno', 'Pedro Antonio de Alarcón', 's2', capitan, '29731'],
  ['jimenez-platero-y-yo', 'Platero y yo', 'Juan Ramón Jiménez', 's3', platero, '9980'],
  ['alarcon-sombrero-de-tres-picos', 'El sombrero de tres picos', 'Pedro Antonio de Alarcón', 's5', sombrero, '29506']
] as const;
const baselineEs = JSON.parse(await readFile(`${root}data\\sources\\es-prose\\library-manifest.json`, 'utf8')) as { entries: Array<{ slug: string; rights: Record<string, unknown> }> };
for (const [slug, , , , textValue] of esTexts) await writeFile(`${out('es')}\\${slug}.txt`, textValue, 'utf8');
const es = { schema: 1, lang: 'es', checkedAt: '2026-10-02', entries: esTexts.map(([slug, title, author, stage, textValue, ebook]) => ({
  slug, title: slug === 'jimenez-platero-y-yo' ? 'Platero y yo — selección de 32 capítulos' : title, author, stage, streams: ['library'], contentType: 'story',
  source: { file: `${slug}.txt`, kind: 'gutenberg', url: `https://www.gutenberg.org/ebooks/${ebook}.txt.utf-8`, edition: slug === 'jimenez-platero-y-yo' ? `Project Gutenberg #${ebook} classroom edition; selected 32 chapters` : `Project Gutenberg #${ebook} classroom edition`, attribution: `${title} — ${author}; Project Gutenberg #${ebook}; US public domain.`, provenance: 'Exact cached Gutenberg edition; English introduction, notes, exercises, vocabulary and footnotes excluded at documented section boundaries; Spanish narrative wording retained.' },
  rights: baselineEs.entries.find(entry => entry.slug === slug)?.rights ?? { state: 'rights-unverified', canBundle: false },
  ...(slug === 'jimenez-platero-y-yo' ? { convert: { chapters: '#[IVXLCDM]+#', paragraphs: 'blank-line', unwrap: false, stripBoilerplate: false } } : {}),
  review: { status: 'reviewed', reviewedBy: 'course-gap source-fidelity boundary check', reviewedAt: '2026-10-02', coversSourceSha256: sha256(textValue), qualityVerdict: 'usable', notes: 'Boundary extraction checked against the cached edition; no native-speaker or level approval.' }
})), limitations: ['These exact classroom editions are US public-domain records; Honduras and other release jurisdictions require a separate rights decision.'] };
await writeFile(`${out('es')}\\library-manifest.json`, JSON.stringify(es, null, 2) + '\n', 'utf8');

const hiTitles = [
  'भारतेंदु-नाटकावली/६–भारत दुर्दशा',
  'भारतेंदु-नाटकावली/६–भारत दुर्दशा (दूसरा अंक)',
  'भारतेंदु-नाटकावली/६–भारत दुर्दशा (तीसरा अंक)',
  'भारतेंदु-नाटकावली/६–भारत दुर्दशा (चौथा अंक)',
  'भारतेंदु-नाटकावली/६–भारत दुर्दशा (पाँचवाँ अंक)',
  'भारतेंदु-नाटकावली/६–भारत दुर्दशा (छठा अंक)'
];
const hiPages = await Promise.all(hiTitles.map(async title => {
  const page = await fetchText(`https://hi.wikisource.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&format=json&formatversion=2`);
  const parsed = JSON.parse(page) as { parse?: { text?: string } };
  if (!parsed.parse?.text) throw new Error(`Hindi Wikisource parse returned no text for ${title}`);
  return `\n\n## ${title}\n\n${stripWiki(parsed.parse.text)}`;
}));
const hiText = hiPages.join('');
await writeFile(`${out('hi')}\\bharatendu-bharat-durdasha.txt`, hiText, 'utf8');
const hi = { schema: 1, lang: 'hi', checkedAt: '2026-10-02', entries: [{
  slug: 'bharatendu-bharat-durdasha', title: 'भारत दुर्दशा', author: 'भारतेन्दु हरिश्चन्द्र', stage: 'c8', streams: ['literature'], contentType: 'drama',
  source: { file: 'bharatendu-bharat-durdasha.txt', kind: 'plain', url: 'https://hi.wikisource.org/wiki/भारतेंदु-नाटकावली/६–भारत_दुर्दशा', urls: hiTitles.map(title => `https://hi.wikisource.org/wiki/${encodeURIComponent(title).replaceAll('%2F', '/')}`), edition: 'भारतेंदु-नाटकावली; Hindi Wikisource pages (acts 1–6)', attribution: 'भारत दुर्दशा — भारतेन्दु हरिश्चन्द्र; Hindi Wikisource transcription; CC BY-SA 4.0 contribution.', provenance: 'Official Hindi Wikisource parsed pages; HTML navigation stripped, wording otherwise retained.' },
  rights: { state: 'rights-unverified', statusByJurisdiction: { IN: 'needs-edition-check', US: 'needs-edition-check' }, canBundle: false, verifiedBy: null, evidence: ['https://hi.wikisource.org/wiki/भारतेंदु-नाटकावली/६–भारत_दुर्दशा', 'https://creativecommons.org/licenses/by-sa/4.0/deed.hi'], licence: 'CC BY-SA 4.0 transcription; underlying edition requires separate verification' },
  review: { status: 'reviewed', reviewedBy: 'course-gap acquisition check', reviewedAt: '2026-10-02', coversSourceSha256: sha256(hiText), notes: 'Page extraction checked; no native-speaker or rights approval.' }
}], limitations: ['Underlying scanned edition and jurisdictional status must be verified before bundling.'] };
await writeFile(`${out('hi')}\\library-manifest.json`, JSON.stringify(hi, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({ de: de.entries.length, es: es.entries.length, hi: hi.entries.length, hashes: { de: sha256(deText), es: es.entries.map(entry => entry.review.coversSourceSha256), hi: sha256(hiText) } }));

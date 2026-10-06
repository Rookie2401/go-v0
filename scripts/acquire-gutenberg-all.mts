import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { htmlToPlainText, readEpub } from '../src/ingest/epub';
import { inspectText } from '../src/ingest/quality';
const root = process.cwd(), today = '2026-10-02';
const map = JSON.parse(fs.readFileSync('data/sources/gutenberg/course-matches.json', 'utf8'));
const manual: Record<string, number[]> = { 'storm-schimmelreiter': [74008], 'goethe-werther': [2407, 2408], 'hoffmann-struwwelpeter': [24571], 'guerber-maerchen-und-erzaehlungen': [35794, 45189] };
const accepted: any[] = [], dispositions: any[] = [];
const cacheRoot = path.join(root, 'work', 'gutenberg-source-cache');
fs.mkdirSync(cacheRoot, { recursive: true });
const cacheIndexPath = path.join(cacheRoot, 'index.json');
const cacheIndex: Record<string, { file: string; id: number; format: string }> = fs.existsSync(cacheIndexPath) ? JSON.parse(fs.readFileSync(cacheIndexPath, 'utf8')) : {};
const official = (url: string) => /^https:\/\/(?:www\.)?gutenberg\.org\//i.test(url);
const formatRank = (url: string, label = '') => { const s = (label + ' ' + url).toLowerCase(); if (/\.zip(?:$|\?)/.test(s) && !/epub|html|-[ph]\.zip/.test(s)) return 9; if (/plain text|\.txt(?:$|\?)/.test(s)) return 0; if (/epub/.test(s)) return 1; if (/html|-[ph]\.zip/.test(s)) return 2; return 9; };
const isVerse = (w: any) => /poem|gedicht|lyrik|rimas|cantos|buen-amor|mukul|ballad|verse|busch-(?:max-und-moritz|hans-huckebein)|hoffmann-struwwelpeter|schiller-(?:wilhelm-tell|faust|nathan)/i.test(`${w.slug} ${w.title} ${w.genre ?? ''}`);
function stripGutenbergWrapper(input: string): string {
  let text = input.replace(/^\uFEFF/, '');
  const start = text.search(/\*\*\*\s*START OF (?:THE )?PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
  if (start >= 0) text = text.slice(text.indexOf('\n', start) + 1);
  const end = text.search(/\*\*\*\s*END OF (?:THE )?PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
  if (end >= 0) text = text.slice(0, end);
  const legacyEnd = text.search(/^\s*Ende dieses Projekt Gutenberg Etextes\b/im);
  if (legacyEnd >= 0) text = text.slice(0, legacyEnd);
  return text.trim();
}
function unzipFirstText(bytes: Uint8Array): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), chunks: string[] = [];
  for (let p = 0; p + 30 <= bytes.length && view.getUint32(p, true) === 0x04034b50;) {
    const method = view.getUint16(p + 8, true), size = view.getUint32(p + 18, true), nameLen = view.getUint16(p + 26, true), extraLen = view.getUint16(p + 28, true);
    const name = new TextDecoder().decode(bytes.slice(p + 30, p + 30 + nameLen)); const start = p + 30 + nameLen + extraLen; const raw = bytes.slice(start, start + size);
    if (/\.(?:html?|txt)$/i.test(name)) chunks.push(new TextDecoder().decode(method === 8 ? inflateRawSync(raw) : raw));
    p = start + size;
  }
  if (!chunks.length) throw new Error('HTML ZIP has no readable HTML/TXT member');
  return chunks.join('\n\n');
}
function pageFormats(html: string, id: number): { url: string; label: string }[] {
  const out: { url: string; label: string }[] = [];
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = new URL(m[1].replace(/&amp;/g, '&'), 'https://www.gutenberg.org/ebooks/' + id).toString();
    const label = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (official(url) && formatRank(url, label) < 9) out.push({ url, label });
  }
  return [...new Map(out.map(x => [x.url, x])).values()].sort((a, b) => formatRank(a.url, a.label) - formatRank(b.url, b.label));
}
function pageIdentity(html: string, w: any, id: number): void {
  const candidate = w.candidates.find((x: any) => String(x.id) === String(id));
  const expectedLang = w.lang === 'de' ? /German|Deutsch/i : /Spanish|Español|Spanish; Castilian/i;
  if (!expectedLang.test(html)) throw new Error('#' + id + ': official page does not state expected ' + w.lang + ' language');
  const declared = [String(w.author ?? ''), String(candidate?.author ?? '')]
    .flatMap((s) => s.split(/[;,]/))
    .map((s) => s.replace(/\[[^\]]+\]/g, '').trim())
    .filter(Boolean);
  const ignored = /^(Johann|Wolfgang|Peter|Wilhelm|von|van|de|der|del|Juan|Miguel|Gustavo|Adolfo|Rub[eé]n|H\.?|A\.?|J\.?|K\.?)$/i;
  const authorTokens = declared.flatMap((s) => s.split(/\s+/).map((token) => token.replace(/[^\p{L}'’.-]/gu, '')
    .replace(/^[\p{P}]+|[\p{P}]+$/gu, '')))
    .filter((token) => token.length >= 3 && !ignored.test(token));
  const author = authorTokens.at(-1);
  if (author && !html.toLocaleLowerCase().includes(author.toLocaleLowerCase())) throw new Error('#' + id + ': official page author identity does not match ' + (w.author ?? candidate?.author));
  if (!/public\s+domain\s+in\s+the\s+USA/i.test(html)) throw new Error('#' + id + ': official page lacks the exact “Public domain in the USA” notice');
}
async function getFormats(w: any, id: number): Promise<{ formats: { url: string; label: string }[]; page: string }> {
  const evidence = w.primaryEvidence?.editionId === String(id) || Number(w.primaryEvidence?.editionId) === id ? w.primaryEvidence : undefined;
  const page = evidence?.page ?? 'https://www.gutenberg.org/ebooks/' + id;
  const r = await fetch(page); if (!r.ok) throw new Error('#' + id + ': ebook page unavailable (' + r.status + ')');
  const html = await r.text(); pageIdentity(html, w, id);
  const cached = (evidence?.downloadFormats ?? []).filter((x: any) => official(x.url)).map((x: any) => ({ url: x.url, label: x.label ?? '' }));
  const cachedReadable = cached.filter((x: any) => formatRank(x.url, x.label) < 9);
  const formats = [...new Map([...cachedReadable, ...pageFormats(html, id)].map(x => [x.url, x])).values()].filter((x: any) => formatRank(x.url, x.label) < 9).sort((a: any, b: any) => formatRank(a.url, a.label) - formatRank(b.url, b.label));
  if (!formats.length) throw new Error('#' + id + ': official ebook page exposes no supported plain text or EPUB format');
  return { formats, page };
}
function cacheKey(id: number, url: string) { return id + '-' + crypto.createHash('sha1').update(url).digest('hex').slice(0, 12); }
async function bytesFor(id: number, url: string): Promise<Uint8Array> {
  const old = cacheIndex[url]; if (old && fs.existsSync(path.join(cacheRoot, old.file))) return new Uint8Array(fs.readFileSync(path.join(cacheRoot, old.file)));
  const r = await fetch(url); if (!r.ok) throw new Error(url + ': download failed (' + r.status + ')');
  const bytes = new Uint8Array(await r.arrayBuffer()); const ext = /epub/i.test(url) ? 'epub' : /\.zip(?:$|\?)/i.test(url) ? 'zip' : 'txt'; const file = cacheKey(id, url) + '.' + ext;
  fs.writeFileSync(path.join(cacheRoot, file), bytes); cacheIndex[url] = { file, id, format: ext }; fs.writeFileSync(cacheIndexPath, JSON.stringify(cacheIndex, null, 2) + '\n'); return bytes;
}
async function acquireVolume(w: any, id: number) {
  const { formats, page } = await getFormats(w, id); let sourceUrl = '', text = '', lastError = '', quality: any = undefined, fallback: any = undefined;
  for (const f of formats) { try { const bytes = await bytesFor(id, f.url); let part = ''; if (/epub/i.test(f.url) || /epub/i.test(f.label)) { const book = await readEpub(bytes); part = book.chapters.map((x: any) => x.text).join('\n\n'); } else if (/\.zip(?:$|\?)/i.test(f.url)) part = htmlToPlainText(unzipFirstText(bytes)); else if (/html/i.test(f.url) || /html/i.test(f.label)) part = htmlToPlainText(new TextDecoder().decode(bytes)); else part = new TextDecoder().decode(bytes); part = stripGutenbergWrapper(part); if (!part.trim()) continue; const q = inspectText(part, { lang: w.lang, sourceKind: 'plain' }); if (!fallback) fallback = { id, page, sourceUrl: f.url, text: part, quality: q }; if (q.verdict === 'damaged' && formats.length > 1) { lastError = f.url + ': quality gate ' + q.verdict; continue; } sourceUrl = f.url; text = part; quality = q; break; } catch (e) { lastError = String(e); } }
  if (!text.trim() && fallback) { sourceUrl = fallback.sourceUrl; text = fallback.text; quality = fallback.quality; }
  if (!text.trim()) throw new Error('#' + id + ': no readable source (' + lastError + ')'); return { id, page, sourceUrl, text, quality };
}
function verifyWerther(volumes: { id: number; text: string }[]) { if (volumes.length !== 2 || !volumes.some(v => v.id === 2407) || !volumes.some(v => v.id === 2408)) return 'expected both Werther volumes 2407 and 2408'; const all = volumes.map(v => v.text).join('\n'); const normalized = all.replace(/\s+/g, ' '); if (!/Kein Geistlicher[\s\S]{0,160}begleitet\./i.test(normalized)) return 'final sentence “Kein Geistlicher ... begleitet.” not found'; if (!/(Erstes Buch|Erster Theil|Erster Teil|Band 1)/i.test(all)) return 'Werther volume 1 marker not found'; }
for (const w of map.works) {
  // The lead reviewed the remaining candidate pairs: subtitles and author-name formatting differ,
  // while both the author and the main title match. Edition scope is retained in the report.
  const ids = manual[w.slug] ?? (w.matchStatus === 'exact-title-and-author' && w.primaryEvidence
    ? [Number(w.primaryEvidence.editionId)]
    : w.matchStatus === 'candidate-needs-manual-edition-review' && w.candidates.length
      ? [Number(w.bestCandidateId)] : undefined);
  if (ids) accepted.push({ ...w, ids }); else dispositions.push({ ...w, disposition: w.matchStatus === 'no-gutenberg-match' ? 'no official edition' : 'rejected: no verified exact title+author edition' });
}
const manifests = new Map<string, any>();

for (const w of accepted) {
  try {
    const volumes: any[] = [];
    for (const id of w.ids) volumes.push(await acquireVolume(w, id));
    if (w.slug === 'goethe-werther') {
      const failure = verifyWerther(volumes);
      if (failure) { dispositions.push({ ...w, disposition: 'rejected: ' + failure }); continue; }
    }
    const body = volumes.map(v => v.text).filter(Boolean).join('\n\n').trimEnd() + '\n';
    const urls = volumes.map(v => v.sourceUrl);
    const file = w.slug + '.txt';
    const dir = path.join(root, 'data', 'sources', w.lang + '-prose');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), body);
    const sha = crypto.createHash('sha256').update(body).digest('hex');
    const verse = isVerse(w);
    const rights = {
      state: 'verified-public-domain', copyrightStatus: 'public-domain', permission: 'not-needed', canBundle: true,
      userImportOnly: false, canModify: false, canStoreOffline: true, canBundleAudio: false, audiobook: 'unknown',
      verified: true, verifiedBy: 'Project Gutenberg official edition page and metadata', verifiedAt: today,
      basis: 'Official Project Gutenberg edition(s) #' + w.ids.join(' and #') + ' match the mapped author and title; US public-domain notice recorded on the edition page.',
      statusByJurisdiction: { US: 'public-domain' }, evidence: w.ids.map((id: number) => 'https://www.gutenberg.org/ebooks/' + id)
    };
    const e = {
      slug: w.slug, title: w.title, author: w.author, streams: ['library'], contentType: 'story', genre: verse ? 'poem' : undefined, rights,
      source: {
        file, kind: 'gutenberg', url: urls[0], urls, edition: 'Project Gutenberg #' + w.ids.join(' + #'),
        attribution: w.title + ' — ' + w.author + '; Project Gutenberg #' + w.ids.join(' + #') + '; US public domain.',
        provenance: 'Exact official Gutenberg edition downloaded on ' + today + '; standard wrappers removed per volume.'
      },
      convert: verse ? { stripBoilerplate: true, paragraphs: 'blank-line', unwrap: false } : { stripBoilerplate: true, paragraphs: 'blank-line', unwrap: true },
      review: { status: 'reviewed', reviewedBy: 'acquire-gutenberg-all identity/source-fidelity check', reviewedAt: today, coversSourceSha256: sha, qualityVerdict: volumes.some(v => v.quality?.verdict === 'damaged') ? 'damaged' : volumes.every(v => v.quality?.verdict === 'clean') ? 'clean' : 'usable', qualityFlags: volumes.flatMap(v => (v.quality?.flags ?? []).map((f: any) => ({ code: f.code, severity: f.severity, count: f.count }))), notes: 'Identity and source fidelity checked; no native-speaker quality claim.' }
    };
    if (!manifests.has(w.lang)) manifests.set(w.lang, { schema: 1, lang: w.lang, entries: [] });
    manifests.get(w.lang).entries.push(e);
    dispositions.push({ ...w, disposition: 'imported', ids: w.ids, sourceUrls: urls });
  } catch (error) {
    dispositions.push({ ...w, disposition: 'rejected: ' + String(error) });
  }
}
for (const [lang, m] of manifests) fs.writeFileSync(path.join(root, 'data', 'sources', lang + '-prose', 'library-manifest.json'), JSON.stringify(m, null, 2) + '\n');
fs.writeFileSync('work/prose-dispositions.json', JSON.stringify(dispositions, null, 2) + '\n');
fs.writeFileSync('data/sources/gutenberg/dispositions.json', JSON.stringify(dispositions, null, 2) + '\n');
console.log(JSON.stringify({ accepted: accepted.length, imported: dispositions.filter(x => x.disposition === 'imported').length, manifests: [...manifests].map(([l, m]) => [l, m.entries.length]), dispositions: dispositions.length, cacheEntries: Object.keys(cacheIndex).length }));

